# AI Agent Backend Optimization — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 41 issues (P0–P3) across the backend AI agent system to make it production-ready before Research Run scale-up.

**Architecture:** Layer-by-layer optimization of existing modules. No new npm dependencies. All changes use Node.js built-ins. The module structure (orchestrator → promptBuilder → tools → toolGroups → toolExecutor → planner → executor) is preserved.

**Tech Stack:** Node.js (ESM), Express, Supabase, OpenAI-compatible API (proxy mode primary), `node:crypto` for encryption, `node:test` + `node:assert` for tests.

**Spec:** `docs/superpowers/specs/2026-03-15-ai-agent-optimization-spec.md`

---

## Chunk 1: P0 Bug & Security Fixes

These 4 tasks are independent and can run in parallel. Each fixes a critical bug or security issue.

### Task 1: Fix `listMessages` Sort Direction (P0-1)

**Files:**
- Modify: `reading-cards-backend/src/services/supabase/conversations.mjs:100-106`
- Test: `reading-cards-backend/test/conversations-sort.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `reading-cards-backend/test/conversations-sort.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Unit test: verify listMessages returns newest-first order
// We can't call Supabase in unit tests, so we test the contract:
// the function should use { ascending: false } in its query.
// We do this by reading the source and verifying the pattern.

import { readFileSync } from 'node:fs';

describe('listMessages sort direction', () => {
  it('should use ascending: false to get newest messages first', () => {
    const source = readFileSync(
      new URL('../src/services/supabase/conversations.mjs', import.meta.url),
      'utf-8'
    );
    // Find the listMessages function and check sort direction
    const fnMatch = source.match(/function\s+listMessages[\s\S]*?ascending:\s*(true|false)/);
    assert.ok(fnMatch, 'listMessages function should exist with an ascending parameter');
    assert.equal(fnMatch[1], 'false', 'listMessages should use ascending: false to get newest first');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd reading-cards-backend && node --test test/conversations-sort.test.mjs
```

Expected: FAIL — currently uses `ascending: true`.

- [ ] **Step 3: Fix the sort direction**

In `reading-cards-backend/src/services/supabase/conversations.mjs`, change line 105:

```js
// Before:
.order("created_at", { ascending: true })

// After:
.order("created_at", { ascending: false })
```

Also update the JSDoc comment on line 98 to reflect the new behavior:

```js
/**
 * List messages for a conversation, newest-first order.
 * The caller receives newest messages first; downstream functions
 * (buildHistoryWithinBudget) handle chronological reordering.
 */
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd reading-cards-backend && node --test test/conversations-sort.test.mjs
```

Expected: PASS

- [ ] **Step 5: Run existing tests to verify no regressions**

```bash
cd reading-cards-backend && node --test "test/**/*.test.mjs"
```

Expected: All pass. No callers currently reverse the result, so this is safe.

- [ ] **Step 6: Commit**

```bash
cd reading-cards-backend && git add src/services/supabase/conversations.mjs test/conversations-sort.test.mjs && git commit -m "fix(P0-1): listMessages returns newest-first for proper context window"
```

---

### Task 2: Fix write+draft Confirmation Bypass (P0-2)

**Files:**
- Modify: `reading-cards-backend/src/chat/orchestrator.mjs:110-140`
- Test: `reading-cards-backend/test/confirmation-gate.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `reading-cards-backend/test/confirmation-gate.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('confirmation gate regression', () => {
  const source = readFileSync(
    new URL('../src/chat/orchestrator.mjs', import.meta.url), 'utf-8'
  );

  it('should NOT use the buggy hasWriteTools && !hasDraftTools pattern', () => {
    assert.ok(
      !source.includes('hasWriteTools && !hasDraftTools'),
      'orchestrator should not contain the buggy pattern that skips confirmation for mixed write+draft calls'
    );
  });

  it('should split tool calls into writeToolCalls and autoToolCalls', () => {
    assert.ok(
      source.includes('writeToolCalls') && source.includes('autoToolCalls'),
      'orchestrator should use split-group approach: writeToolCalls + autoToolCalls'
    );
  });

  it('should always gate on writeToolCalls.length > 0', () => {
    assert.ok(
      source.includes('writeToolCalls.length > 0'),
      'write tools should always require confirmation regardless of draft tools'
    );
  });
});
```

- [ ] **Step 2: Run test — expect the "mixed" assertion to demonstrate the bug**

```bash
cd reading-cards-backend && node --test test/confirmation-gate.test.mjs
```

Expected: PASS (test documents the bug and the fix — both assertions verify correctly)

- [ ] **Step 3: Apply the fix in orchestrator.mjs**

In `reading-cards-backend/src/chat/orchestrator.mjs`, replace the `hasWriteTools / hasDraftTools` block (lines ~110-140) with the split-group approach from spec §2 P0-2:

```js
// Replace lines ~111-140 with:
const writeToolCalls = toolCalls.filter((tc) => {
  const effect = getToolSideEffect(tc.function.name);
  return effect === "write" || effect === "destructive";
});
const autoToolCalls = toolCalls.filter((tc) => {
  const effect = getToolSideEffect(tc.function.name);
  return effect === "read_only" || effect === "draft";
});

// Auto-execute read_only + draft tools immediately
if (autoToolCalls.length > 0) {
  const autoResults = [];
  for (const tc of autoToolCalls) {
    let args = {};
    try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
    const result = await executeTool(tc.function.name, args, {
      userId, supabase, accessToken, supabaseAdmin: adminSb,
    });
    autoResults.push({
      role: "tool",
      tool_call_id: tc.id,
      content: JSON.stringify(result),
    });
    toolCallLog.push({ tool: tc.function.name, args, result_summary: summarizeResult(result) });
  }
  // Add assistant message with only auto tool calls, then tool results
  currentMessages.push({
    role: "assistant",
    content: null,
    tool_calls: autoToolCalls,
  });
  currentMessages.push(...autoResults);

  // Handle draft ID extraction from propose_board_changes
  for (const ar of autoResults) {
    try {
      const parsed = JSON.parse(ar.content);
      if (parsed.draft_id) draftId = parsed.draft_id;
    } catch {}
  }
}

// If write tools exist, pause for confirmation
if (writeToolCalls.length > 0) {
  const pending = writeToolCalls.map((tc) => {
    let parsedArgs = {};
    try { parsedArgs = JSON.parse(tc.function.arguments || "{}"); } catch {}
    return {
      id: tc.id,
      name: tc.function.name,
      args: parsedArgs,
      side_effect: getToolSideEffect(tc.function.name),
      confirm_message: buildConfirmMessage(tc.function.name, parsedArgs),
    };
  });

  return {
    reply: "",
    messages: currentMessages,
    pendingActions: pending,
    pendingToolCalls: writeToolCalls,
    toolCallLog,
    draftId,
  };
}
```

Note: `summarizeResult` is a helper — add it near the top of the file if it doesn't exist:

```js
function summarizeResult(result) {
  if (!result) return 'null';
  if (result.error) return `error: ${result.error}`;
  const keys = Object.keys(result);
  return keys.slice(0, 3).map(k => {
    const v = result[k];
    if (Array.isArray(v)) return `${k}: ${v.length} items`;
    if (typeof v === 'string') return `${k}: ${v.slice(0, 40)}`;
    return `${k}: ${JSON.stringify(v).slice(0, 40)}`;
  }).join(', ');
}
```

- [ ] **Step 4: Run all tests**

```bash
cd reading-cards-backend && node --test "test/**/*.test.mjs"
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
cd reading-cards-backend && git add src/chat/orchestrator.mjs test/confirmation-gate.test.mjs && git commit -m "fix(P0-2): split write+draft tool calls so write tools always need confirmation"
```

---

### Task 3: Add userId Filtering to Data Access Tools (P0-3)

**Files:**
- Modify: `reading-cards-backend/src/chat/toolExecutor.mjs:67-70`
- Modify: `reading-cards-backend/src/services/supabase/cards.mjs` (findCardById)
- Modify: `reading-cards-backend/src/services/supabase/boards.mjs` (getFullBoard)
- Modify: `reading-cards-backend/src/services/supabase/documents.mjs` (getDocument)
- Test: `reading-cards-backend/test/userid-filtering.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `reading-cards-backend/test/userid-filtering.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('userId filtering in toolExecutor', () => {
  const source = readFileSync(
    new URL('../src/chat/toolExecutor.mjs', import.meta.url), 'utf-8'
  );

  it('get_card should pass userId to findCardById', () => {
    // Verify the function call includes userId argument
    assert.ok(
      /findCardById\([^)]*userId/.test(source),
      'findCardById call should include userId argument'
    );
  });

  it('get_board should pass userId to getFullBoard', () => {
    assert.ok(
      /getFullBoard\([^)]*userId/.test(source),
      'getFullBoard call should include userId argument'
    );
  });

  it('get_document should pass userId to getDocument', () => {
    assert.ok(
      /getDocument\([^)]*userId/.test(source),
      'getDocument call should include userId argument'
    );
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd reading-cards-backend && node --test test/userid-filtering.test.mjs
```

Expected: FAIL — current code doesn't pass userId.

- [ ] **Step 3: Update toolExecutor.mjs**

In `reading-cards-backend/src/chat/toolExecutor.mjs`, update the three cases:

```js
// get_card — change:
case "get_card": {
  const card = await findCardById(supabase, args.card_id, userId);
  if (!card) return { error: "card_not_found" };
  return { card };
}

// get_board — change:
case "get_board": {
  const board = await getFullBoard(supabase, args.board_id, userId);
  if (!board) return { error: "board_not_found" };
  return { board };
}

// get_document — change:
case "get_document": {
  const doc = await getDocument(supabase, args.doc_id, userId);
  if (!doc) return { error: "document_not_found" };
  return { document: doc };
}
```

- [ ] **Step 4: Update the data access functions to accept and use userId**

In `reading-cards-backend/src/services/supabase/cards.mjs`, update `findCardById`:

```js
// Add userId parameter and filter:
export async function findCardById(supabase, cardId, userId) {
  let query = supabase.from("cards").select("*").eq("id", cardId);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`查询卡片失败: ${error.message}`);
  return data;
}
```

In `reading-cards-backend/src/services/supabase/boards.mjs`, update `getFullBoard` to add `.eq('user_id', userId)` on the board query.

In `reading-cards-backend/src/services/supabase/documents.mjs`, update `getDocument` to add `.eq('user_id', userId)` on the document query.

Note: Check each file's actual function signature before editing — the key change is adding the `userId` parameter and an `.eq('user_id', userId)` filter to the Supabase query.

- [ ] **Step 5: Run test — expect PASS**

```bash
cd reading-cards-backend && node --test test/userid-filtering.test.mjs
```

- [ ] **Step 6: Run all tests**

```bash
cd reading-cards-backend && node --test "test/**/*.test.mjs"
```

- [ ] **Step 7: Commit**

```bash
cd reading-cards-backend && git add src/chat/toolExecutor.mjs src/services/supabase/cards.mjs src/services/supabase/boards.mjs src/services/supabase/documents.mjs test/userid-filtering.test.mjs && git commit -m "fix(P0-3): add userId filtering to get_card, get_board, get_document"
```

---

### Task 4: Implement Real API Key Encryption (P0-4)

**Files:**
- Modify: `reading-cards-backend/src/services/aiClient.mjs:80-88`
- Modify: `reading-cards-backend/.env.example`
- Test: `reading-cards-backend/test/encryption.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `reading-cards-backend/test/encryption.test.mjs`:

```js
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Generate a test encryption key
const TEST_KEY = crypto.randomBytes(32).toString('hex');

// Inline encrypt/decrypt for testing (mirrors spec §2 P0-4)
function encryptApiKey(plainKey, encryptionKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(encryptionKey, 'hex'), iv);
  let encrypted = cipher.update(plainKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

function decryptApiKey(encryptedKey, encryptionKey) {
  if (!encryptedKey || !encryptionKey) return null;
  try {
    const [ivHex, tagHex, data] = encryptedKey.split(':');
    if (!ivHex || !tagHex || !data) {
      return Buffer.from(encryptedKey, 'base64').toString('utf-8');
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(encryptionKey, 'hex'), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
}

describe('API key encryption', () => {
  it('should encrypt and decrypt correctly', () => {
    const plainKey = 'sk-test-1234567890abcdef';
    const encrypted = encryptApiKey(plainKey, TEST_KEY);
    assert.notEqual(encrypted, plainKey, 'encrypted should differ from plain');
    assert.ok(encrypted.includes(':'), 'encrypted format should be iv:tag:data');

    const decrypted = decryptApiKey(encrypted, TEST_KEY);
    assert.equal(decrypted, plainKey, 'decrypted should match original');
  });

  it('should handle base64 fallback for migration', () => {
    const plainKey = 'sk-old-key';
    const base64 = Buffer.from(plainKey).toString('base64');
    const decrypted = decryptApiKey(base64, TEST_KEY);
    assert.equal(decrypted, plainKey, 'should fall back to base64 decode');
  });

  it('should return null for invalid input', () => {
    assert.equal(decryptApiKey(null, TEST_KEY), null);
    assert.equal(decryptApiKey('', TEST_KEY), null);
  });

  it('should return null when decryption fails with corrupted ciphertext', () => {
    // 3 colon-separated parts but invalid hex — triggers AES path which throws
    const corrupted = 'deadbeef:deadbeef:deadbeef';
    assert.equal(decryptApiKey(corrupted, TEST_KEY), null);
  });
});
```

- [ ] **Step 2: Run test — expect PASS (testing the algorithm itself)**

```bash
cd reading-cards-backend && node --test test/encryption.test.mjs
```

Expected: PASS — this validates the encrypt/decrypt logic before we put it in the codebase.

- [ ] **Step 3: Replace decryptApiKey in aiClient.mjs**

In `reading-cards-backend/src/services/aiClient.mjs`, replace the `decryptApiKey` function (lines 80-88) with the AES-256-GCM implementation from spec §2 P0-4:

```js
import crypto from 'node:crypto';

const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_SECRET;

function encryptApiKey(plainKey) {
  if (!plainKey || !ENCRYPTION_KEY) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(plainKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

function decryptApiKey(encryptedKey) {
  if (!encryptedKey) return null;
  if (!ENCRYPTION_KEY) {
    // No encryption key configured — try base64 fallback
    try { return Buffer.from(encryptedKey, 'base64').toString('utf-8'); } catch { return encryptedKey; }
  }
  try {
    const [ivHex, tagHex, data] = encryptedKey.split(':');
    if (!ivHex || !tagHex || !data) {
      // Fallback: try base64 for migration period
      return Buffer.from(encryptedKey, 'base64').toString('utf-8');
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Add env variable to .env.example**

Append to `reading-cards-backend/.env.example`:

```
# ========= 安全配置 =========
API_KEY_ENCRYPTION_SECRET=  # 32 bytes hex string for AES-256-GCM encryption of user API keys (generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

- [ ] **Step 5: Run all tests**

```bash
cd reading-cards-backend && node --test "test/**/*.test.mjs"
```

- [ ] **Step 6: Commit**

```bash
cd reading-cards-backend && git add src/services/aiClient.mjs .env.example test/encryption.test.mjs && git commit -m "fix(P0-4): replace base64 API key encoding with AES-256-GCM encryption"
```

---

## Chunk 2: Context Layer (Tasks 5–8)

These tasks build the token budget system and context management improvements. They are sequential — each builds on the previous.

### Task 5: Create `contextBudget.mjs` Module

**Files:**
- Create: `reading-cards-backend/src/chat/contextBudget.mjs`
- Test: `reading-cards-backend/test/context-budget.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `reading-cards-backend/test/context-budget.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, calculateBudget, buildHistoryWithinBudget } from '../src/chat/contextBudget.mjs';

describe('estimateTokens', () => {
  it('should estimate English text', () => {
    const tokens = estimateTokens('Hello world this is a test');
    assert.ok(tokens > 0, 'should return positive tokens');
    assert.ok(tokens < 20, 'should be reasonable for short English');
  });

  it('should estimate Chinese text with higher ratio', () => {
    const en = estimateTokens('Hello');
    const cn = estimateTokens('你好世界');
    // Chinese chars should produce more tokens per character
    assert.ok(cn / 4 > en / 5, 'Chinese should have higher per-char token ratio');
  });

  it('should return 0 for empty input', () => {
    assert.equal(estimateTokens(''), 0);
    assert.equal(estimateTokens(null), 0);
    assert.equal(estimateTokens(undefined), 0);
  });
});

describe('calculateBudget', () => {
  it('should allocate budget with reserves', () => {
    const { historyBudget, toolLoopReserve } = calculateBudget(128000, 2000, 3000);
    assert.ok(historyBudget > 0, 'history budget should be positive');
    assert.ok(historyBudget < 128000, 'should be less than total context');
    assert.equal(toolLoopReserve, Math.floor(128000 * 0.25));
    // historyBudget = 128000 - 2000 - 3000 - 32000 - 4096 = 86904
    assert.equal(historyBudget, 86904);
  });

  it('should enforce minimum of 2000 tokens', () => {
    const { historyBudget } = calculateBudget(5000, 3000, 3000);
    assert.equal(historyBudget, 2000, 'should enforce minimum');
  });
});

describe('buildHistoryWithinBudget', () => {
  const makeMsg = (content, role = 'user') => ({ role, content });

  it('should select messages within budget (newest first)', () => {
    const messages = [
      makeMsg('newest message'),  // index 0 = newest
      makeMsg('middle message'),
      makeMsg('oldest message'),
    ];
    const result = buildHistoryWithinBudget(messages, 1000, null);
    assert.equal(result.length, 3, 'all should fit');
    // Result should be in chronological order (oldest first)
    assert.equal(result[0].content, 'oldest message');
    assert.equal(result[2].content, 'newest message');
  });

  it('should drop oldest when budget is tight', () => {
    const messages = [
      makeMsg('A'.repeat(500)),  // newest
      makeMsg('B'.repeat(500)),
      makeMsg('C'.repeat(500)),  // oldest
    ];
    // Budget only fits ~2 messages (500 chars * 0.25 = 125 tokens each)
    const result = buildHistoryWithinBudget(messages, 260, null);
    assert.ok(result.length < 3, 'should drop oldest');
    assert.equal(result[result.length - 1].content, 'A'.repeat(500), 'newest should survive');
  });

  it('should prepend conversation summary', () => {
    const messages = [makeMsg('hello')];
    const result = buildHistoryWithinBudget(messages, 1000, 'Previous discussion about AI');
    assert.equal(result[0].role, 'system');
    assert.ok(result[0].content.includes('Previous discussion about AI'));
    assert.equal(result[1].content, 'hello');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module doesn't exist)**

```bash
cd reading-cards-backend && node --test test/context-budget.test.mjs
```

Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Create contextBudget.mjs**

Create `reading-cards-backend/src/chat/contextBudget.mjs`:

```js
// ========= Context Budget Management =========
// Token estimation and context window budget allocation.
// Ensures conversation history fits within the model's context window.

/**
 * Estimate token count for a string.
 * Chinese: ~0.7 tokens per character
 * English/other: ~0.25 tokens per character (~1.3 per word)
 */
export function estimateTokens(text) {
  if (!text) return 0;
  let tokens = 0;
  for (const char of text) {
    tokens += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(char) ? 0.7 : 0.25;
  }
  return Math.ceil(tokens);
}

/**
 * Calculate how many tokens are available for conversation history.
 *
 * @param {number} contextWindow - Model's total context window
 * @param {number} systemPromptTokens - Actual system prompt token count
 * @param {number} toolDefinitionTokens - Token count of scoped tool definitions JSON
 * @returns {{ historyBudget: number, toolLoopReserve: number }}
 */
export function calculateBudget(contextWindow, systemPromptTokens, toolDefinitionTokens) {
  const toolLoopReserve = Math.floor(contextWindow * 0.25);
  const outputReserve = 4096;
  const historyBudget = contextWindow - systemPromptTokens - toolDefinitionTokens - toolLoopReserve - outputReserve;
  return {
    historyBudget: Math.max(historyBudget, 2000),
    toolLoopReserve,
  };
}

/**
 * Build conversation history within a token budget.
 * Takes newest messages first, stops when budget is exhausted.
 * Prepends conversation summary if available.
 *
 * @param {Array} messages - All messages, newest-first (from DB after P0-1 fix)
 * @param {number} budget - Token budget for history
 * @param {string|null} conversationSummary - Summary of older conversation
 * @returns {Array} messages in chronological order (oldest-first), fitting within budget
 */
export function buildHistoryWithinBudget(messages, budget, conversationSummary = null) {
  let remaining = budget;
  const selected = [];

  if (conversationSummary) {
    const summaryTokens = estimateTokens(conversationSummary);
    remaining -= summaryTokens;
  }

  for (const msg of messages) {
    const msgTokens = estimateTokens(msg.content);
    if (remaining - msgTokens < 0) break;
    selected.unshift(msg);
    remaining -= msgTokens;
  }

  if (conversationSummary) {
    selected.unshift({
      role: 'system',
      content: `<conversation_summary>\n${conversationSummary}\n</conversation_summary>`,
    });
  }

  return selected;
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd reading-cards-backend && node --test test/context-budget.test.mjs
```

- [ ] **Step 5: Commit**

```bash
cd reading-cards-backend && git add src/chat/contextBudget.mjs test/context-budget.test.mjs && git commit -m "feat: add contextBudget.mjs for token estimation and sliding window"
```

---

### Task 6: Add `context_window` to models.config.json

**Files:**
- Modify: `reading-cards-backend/src/config/models.config.json`
- Modify: `reading-cards-backend/src/services/aiClient.mjs` (return contextWindow from config)

- [ ] **Step 1: Update models.config.json**

Add `context_window` to each model entry:

```json
{
  "providers": {
    "openai": {
      "name": "OpenAI",
      "description": "OpenAI官方API（或通过代理）",
      "models": [
        {
          "id": "gpt-5.2",
          "name": "GPT-5.2",
          "description": "最新旗舰模型，复杂推理和多步骤任务",
          "context_window": 200000,
          "supports_vision": true,
          "supports_file_search": true
        },
        {
          "id": "gpt-5.2-pro",
          "name": "GPT-5.2 Pro",
          "description": "深度推理，更多计算资源，最高质量输出",
          "context_window": 200000,
          "supports_vision": true,
          "supports_file_search": true
        },
        {
          "id": "gpt-5-nano",
          "name": "GPT-5 Nano",
          "description": "高吞吐量、简单指令跟随，最低成本",
          "context_window": 32000,
          "supports_vision": false,
          "supports_file_search": false
        }
      ],
      "default_model": "gpt-5.2"
    },
    "anthropic": {
      "name": "Anthropic",
      "description": "Anthropic Claude API（或通过代理）",
      "models": [
        {
          "id": "claude-sonnet-4-6",
          "name": "Claude Sonnet 4.6",
          "description": "平衡性能和成本",
          "context_window": 200000,
          "supports_vision": true,
          "supports_file_search": false
        },
        {
          "id": "claude-opus-4-6",
          "name": "Claude Opus 4.6",
          "description": "最强性能",
          "context_window": 200000,
          "supports_vision": true,
          "supports_file_search": false
        }
      ],
      "default_model": "claude-sonnet-4-6"
    },
    "custom": {
      "name": "自定义API",
      "description": "使用自己的API端点（需兼容OpenAI格式）",
      "models": [
        {
          "id": "*",
          "name": "自定义模型",
          "description": "使用自定义模型名称",
          "context_window": 128000,
          "supports_vision": true,
          "supports_file_search": false
        }
      ],
      "default_model": "*"
    }
  },
  "metadata": {
    "version": "2.2.0",
    "last_updated": "2026-03",
    "description": "Reading Clipper AI模型配置 - 所有端点通过 aiRuntime 统一管理"
  }
}
```

- [ ] **Step 2: Update `createAIClientConfig` in aiClient.mjs to return contextWindow**

In `reading-cards-backend/src/services/aiClient.mjs`, find the `createAIClientConfig` function and add `contextWindow` to its return value. Read the file to find the exact location, then add:

```js
// In createAIClientConfig, after determining the model:
const modelConfig = providerConfig.models.find(m => m.id === model || m.id === '*');
const contextWindow = modelConfig?.context_window || 128000;

// Add to the return object:
return {
  // ...existing fields...
  contextWindow,
};
```

- [ ] **Step 3: Run all tests**

```bash
cd reading-cards-backend && node --test "test/**/*.test.mjs"
```

- [ ] **Step 4: Commit**

```bash
cd reading-cards-backend && git add src/config/models.config.json src/services/aiClient.mjs && git commit -m "feat: add context_window to model config, expose in aiClientConfig"
```

---

### Task 7: Integrate Context Budget into Orchestrator

**Files:**
- Modify: `reading-cards-backend/src/chat/orchestrator.mjs`

This task connects the context budget system (Task 5–6) into the orchestrator's chat flow.

- [ ] **Step 1: Add imports to orchestrator.mjs**

At the top of `reading-cards-backend/src/chat/orchestrator.mjs`, add:

```js
import { estimateTokens, calculateBudget, buildHistoryWithinBudget } from "./contextBudget.mjs";
```

- [ ] **Step 2: Update `chatWithConversation` to use token-budgeted history**

Find the section in `chatWithConversation()` where messages are loaded from DB and assembled. Replace the hardcoded limit/filter with budgeted loading. The key changes:

1. Load messages (now newest-first from Task 1 fix)
2. Build system prompt and measure its tokens
3. Calculate budget
4. Use `buildHistoryWithinBudget` to select messages within budget

```js
// In chatWithConversation(), replace message loading/filtering with:
const history = await listMessages(adminSb, convId, { limit: 200 });

// Build system prompt (needed before budget calculation)
const systemPrompt = buildSystemPrompt({ surfaceContext, methodology, researchState, toolGroup, mode });
const scopedTools = getToolsForGroup(toolGroup);

// Calculate token budget
const systemPromptTokens = estimateTokens(systemPrompt);
const toolDefTokens = estimateTokens(JSON.stringify(scopedTools));
const { historyBudget } = calculateBudget(aiConfig.contextWindow, systemPromptTokens, toolDefTokens);

// Find conversation summary if it exists
const conversationSummary = history
  .find(m => m.message_type === 'conversation_summary')?.content || null;

// Convert DB messages to chat format, preserving tool call history
const chatMessages = history
  .filter(m => m.role === 'user' || m.role === 'assistant')
  .map(m => {
    if (m.message_type === 'tool_calls' && m.metadata?.tool_calls) {
      return {
        role: m.role,
        content: m.metadata.tool_calls
          .map(tc => `[Tool: ${tc.tool}(${summarizeArgs(tc.args)}) → ${tc.result_summary || 'done'}]`)
          .join('\n'),
      };
    }
    return { role: m.role, content: m.content };
  });

// Select messages within budget
const budgetedMessages = buildHistoryWithinBudget(chatMessages, historyBudget, conversationSummary);
```

- [ ] **Step 3: Add the `summarizeArgs` helper**

In orchestrator.mjs, add near the helpers section:

```js
function summarizeArgs(args) {
  if (!args) return '';
  const entries = Object.entries(args);
  if (entries.length === 0) return '';
  return entries
    .slice(0, 3)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v.slice(0, 30) : JSON.stringify(v).slice(0, 30)}`)
    .join(', ');
}
```

- [ ] **Step 4: Run all tests**

```bash
cd reading-cards-backend && node --test "test/**/*.test.mjs"
```

- [ ] **Step 5: Commit**

```bash
cd reading-cards-backend && git add src/chat/orchestrator.mjs && git commit -m "feat: integrate token budget system into orchestrator context loading"
```

---

### Task 8: Add Tool Result Compression + Conversation Summary

**Files:**
- Modify: `reading-cards-backend/src/chat/orchestrator.mjs`

- [ ] **Step 1: Add `compressToolResult` function**

In orchestrator.mjs, add the `compressToolResult` function from spec §3.4:

```js
function compressToolResult(toolName, result) {
  if (!result || result.error) return result;

  switch (toolName) {
    case 'list_cards':
    case 'search_cards':
      return {
        cards: result.cards?.map(c => ({
          id: c.id, title: c.title, summary: c.summary?.slice(0, 100),
          fact_or_view: c.fact_or_view, topic_id: c.topic_id,
        })),
        total: result.total || result.count,
      };

    case 'get_board':
      return {
        board: {
          id: result.board?.id,
          title: result.board?.title,
          nodes: result.board?.nodes?.map(n => ({
            id: n.id, node_type: n.node_type,
            text: n.claim || n.content?.text,
            parent_id: n.parent_id, status: n.status,
          })),
          edges: result.board?.edges?.map(e => ({
            source: e.source_node_id, target: e.target_node_id,
            relation: e.relation_type,
          })),
        },
      };

    case 'semantic_search':
      return {
        results: result.results?.map(r => ({
          text: r.chunk_text?.slice(0, 200),
          score: r.score,
          source: r.source_title || r.material_id,
        })),
        total: result.total,
      };

    case 'list_topics':
      return { topics: result.topics?.map(t => ({ id: t.id, title: t.title, card_count: t.card_count })) };

    default:
      return result;
  }
}
```

- [ ] **Step 2: Use compression in the tool execution loop**

In the `chat()` function's tool execution loop, find where tool results are pushed to `currentMessages` and wrap with compression:

```js
// After executing a tool, compress before returning to AI:
const rawResult = await executeTool(tc.function.name, args, ctx);
const compressed = compressToolResult(tc.function.name, rawResult);
toolResults.push({
  role: "tool",
  tool_call_id: tc.id,
  content: JSON.stringify(compressed),
});
```

- [ ] **Step 3: Add `generateConversationSummary` function**

Add the function from spec §3.5 to orchestrator.mjs:

```js
async function generateConversationSummary(supabase, convId, history, userId, supabaseClient) {
  try {
    const aiConfig = await createAIClientConfig(userId, supabaseClient);
    const recentTexts = history
      .filter(m => m.message_type === 'text' && (m.role === 'user' || m.role === 'assistant'))
      .slice(-20)
      .map(m => `${m.role}: ${m.content.slice(0, 200)}`)
      .join('\n');

    const messages = [
      {
        role: 'system',
        content: '根据以下对话历史，生成一段简洁的上下文摘要（3-5句话）。包含：讨论了什么主题、做了哪些关键操作、当前研究状态、用户可能的下一步意图。只输出摘要文本。',
      },
      { role: 'user', content: recentTexts },
    ];

    const response = await callChatAPI(aiConfig, messages, { temperature: 0.3, max_tokens: 300 });
    const summary = response.choices?.[0]?.message?.content?.trim();
    if (!summary) return;

    await addMessage(supabase, convId, {
      role: 'system',
      content: summary,
      message_type: 'conversation_summary',
    });
  } catch (err) {
    console.error('[orchestrator] Summary generation failed:', err.message);
  }
}
```

- [ ] **Step 4: Add summary trigger in `chatWithConversation`**

After the AI reply is persisted, add the async summary trigger:

```js
// After persisting the AI reply in chatWithConversation():
const textMessageCount = history.filter(m => m.message_type === 'text').length;
const existingSummary = history.find(m => m.message_type === 'conversation_summary');
const summaryAge = existingSummary
  ? history.filter(m => m.message_type === 'text' && m.created_at > existingSummary.created_at).length
  : Infinity;

if (textMessageCount > 20 && summaryAge > 10) {
  generateConversationSummary(adminSb, convId, history, userId, supabase)
    .catch(err => console.error('[orchestrator] Summary generation failed:', err.message));
}
```

- [ ] **Step 5: Run all tests**

```bash
cd reading-cards-backend && node --test "test/**/*.test.mjs"
```

- [ ] **Step 6: Commit**

```bash
cd reading-cards-backend && git add src/chat/orchestrator.mjs && git commit -m "feat: add tool result compression and conversation summary generation"
```

---

## Chunk 3: Prompt Layer (Tasks 9–10)

### Task 9: Rewrite promptBuilder.mjs with XML Structure

**Files:**
- Rewrite: `reading-cards-backend/src/chat/promptBuilder.mjs`
- Modify: `reading-cards-backend/test/mode-threading.test.mjs` (update assertions)

- [ ] **Step 1: Update existing test assertions for XML format**

The existing `test/mode-threading.test.mjs` checks for Markdown-era strings. Update it:

```js
import assert from 'node:assert/strict';
import { buildSystemPrompt } from '../src/chat/promptBuilder.mjs';

// Test 1: chat mode injects read-only instruction
const chatPrompt = buildSystemPrompt({
  surfaceContext: null,
  methodology: null,
  researchState: null,
  toolGroup: 'explore',
  mode: 'chat',
});
assert.ok(chatPrompt.includes('聊天'), 'chat mode instruction missing');
assert.ok(chatPrompt.includes('不能创建'), 'chat mode should mention cannot create');

// Test 2: agent mode injects agent instruction
const agentPrompt = buildSystemPrompt({
  surfaceContext: null,
  methodology: null,
  researchState: null,
  toolGroup: 'board',
  mode: 'agent',
});
assert.ok(agentPrompt.includes('代理'), 'agent mode instruction missing');

// Test 3: auto mode adds no extra instruction
const autoPrompt = buildSystemPrompt({
  surfaceContext: null,
  methodology: null,
  researchState: null,
  toolGroup: 'explore',
  mode: 'auto',
});
assert.ok(!autoPrompt.includes('<mode>'), 'auto mode should not have mode tag');

// Test 4: XML structure present
assert.ok(chatPrompt.includes('<role>'), 'should use XML role tag');
assert.ok(chatPrompt.includes('<absolute_prohibitions>'), 'should use XML prohibitions tag');
assert.ok(chatPrompt.includes('<data_model>'), 'should use XML data_model tag');

// Test 5: UUID prohibition present (now in Chinese)
assert.ok(chatPrompt.includes('UUID'), 'UUID prohibition missing in chat');

// Test 6: Few-shot examples present
assert.ok(chatPrompt.includes('<examples>'), 'few-shot examples missing');

// Test 7: describeSurface should not contain IDs
const boardPrompt = buildSystemPrompt({
  surfaceContext: { surface: 'board', topicId: 'some-uuid-123' },
  methodology: null,
  researchState: null,
  toolGroup: 'board',
  mode: 'auto',
});
assert.ok(!boardPrompt.includes('some-uuid-123'), 'surface should not expose topic UUID');
assert.ok(boardPrompt.includes('思维画板'), 'board surface should mention thinking board');

console.log('All prompt builder tests passed!');
```

- [ ] **Step 2: Run updated test — expect FAIL**

```bash
cd reading-cards-backend && node --test test/mode-threading.test.mjs
```

Expected: FAIL — current promptBuilder uses Markdown, not XML.

- [ ] **Step 3: Rewrite promptBuilder.mjs**

Replace the full content of `reading-cards-backend/src/chat/promptBuilder.mjs` with the complete XML-based implementation from spec §4.1–4.6. This includes:

- XML-tagged `<role>`, `<data_model>`, `<hard_rules>`, `<tool_usage_guide>`, `<available_actions>`, `<absolute_prohibitions>` sections
- Few-shot examples from §4.2 (`FEW_SHOT_EXAMPLES` constant)
- Updated `TOOL_GROUP_INSTRUCTIONS` from §4.3 (all Chinese)
- Updated `MODE_INSTRUCTIONS` from §4.4 (XML `<mode>` tag)
- Updated `describeSurface()` from §4.5 (no UUIDs)
- Fixed `truncateToTokens()` from §4.6 (Chinese-aware)
- Updated `formatResearchStateForPrompt()` (unchanged logic, same Chinese strings)

The complete file is in the spec. Implement it exactly as specified.

- [ ] **Step 4: Run test — expect PASS**

```bash
cd reading-cards-backend && node --test test/mode-threading.test.mjs
```

- [ ] **Step 5: Run all tests**

```bash
cd reading-cards-backend && node --test "test/**/*.test.mjs"
```

- [ ] **Step 6: Commit**

```bash
cd reading-cards-backend && git add src/chat/promptBuilder.mjs test/mode-threading.test.mjs && git commit -m "feat: rewrite promptBuilder with XML structure, few-shot examples, Chinese unification"
```

---

### Task 10: Update Tool Descriptions

**Files:**
- Modify: `reading-cards-backend/src/chat/tools.mjs`

- [ ] **Step 1: Update tool descriptions with return values and boundaries**

In `reading-cards-backend/src/chat/tools.mjs`, update the `description` field for key tools per spec §5.2:

- `semantic_search`: Add return value schema
- `search_cards`: Add return value schema + clarify it searches card summaries not raw documents
- `create_card`: Add boundary note — only for source material extraction, not AI analysis
- `propose_board_changes`: Add required fields note

Also update `confirm_template` for `update_board_node` and `delete_board_node` per spec §5.4 — remove UUID templates.

Read the file first to find exact locations, then apply targeted edits to each tool's `description` field.

- [ ] **Step 2: Run all tests**

```bash
cd reading-cards-backend && node --test "test/**/*.test.mjs"
```

- [ ] **Step 3: Commit**

```bash
cd reading-cards-backend && git add src/chat/tools.mjs && git commit -m "feat: improve tool descriptions with return values, boundaries, and Chinese confirm templates"
```

---

## Chunk 4: Tool + Plan Layer (Tasks 11–15)

### Task 11: Add `request_plan` Tool

**Files:**
- Modify: `reading-cards-backend/src/chat/tools.mjs`
- Modify: `reading-cards-backend/src/chat/toolExecutor.mjs`
- Modify: `reading-cards-backend/src/chat/orchestrator.mjs`
- Modify: `reading-cards-backend/src/chat/toolGroups.mjs`

- [ ] **Step 1: Add request_plan to TOOL_DEFINITIONS**

In `reading-cards-backend/src/chat/tools.mjs`, add to the `TOOL_DEFINITIONS` array:

```js
{
  type: "function",
  function: {
    name: "request_plan",
    description: "当用户描述的任务需要 4 步以上、涉及多个数据源、或需要定期执行时，调用此工具请求生成执行计划。不要自己尝试逐步执行多步骤任务。返回: {plan_requested: true}",
    parameters: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          description: "用一段话描述用户想要完成的任务，包含关键细节（数据源、筛选条件、输出格式等）"
        }
      },
      required: ["intent"]
    }
  },
  side_effect: "read_only",
  task_auto: false,
  task_phases: [],
  task_capability: "meta",
}
```

- [ ] **Step 2: Add handler in toolExecutor.mjs**

In `reading-cards-backend/src/chat/toolExecutor.mjs`, add a case:

```js
case "request_plan": {
  return { plan_requested: true, intent: args.intent };
}
```

- [ ] **Step 3: Add plan detection in orchestrator.mjs tool loop**

In the `chat()` function's tool loop, after executing tools and getting results, add:

```js
// Check if any tool result is a plan request
const planToolResult = toolResults.find(tr => {
  try {
    const parsed = JSON.parse(tr.content);
    return parsed.plan_requested === true;
  } catch { return false; }
});

if (planToolResult) {
  const parsed = JSON.parse(planToolResult.content);
  return {
    reply: '',
    messages: currentMessages,
    planRequest: { intent: parsed.intent },
    toolCallLog,
  };
}
```

- [ ] **Step 4: Add request_plan to tool groups**

In `reading-cards-backend/src/chat/toolGroups.mjs`, add `'request_plan'` to the `explore`, `board`, `cards`, and `ingest` group arrays.

- [ ] **Step 5: Remove old plan detection**

Remove `PLAN_DETECTION` constant from `promptBuilder.mjs` (already done in Task 9 rewrite — verify it's gone).

Remove `extractPlanRequest()` function from `orchestrator.mjs` if it exists.

Remove `classifyIntent()` from `planner.mjs`.

- [ ] **Step 6: Run all tests**

```bash
cd reading-cards-backend && node --test "test/**/*.test.mjs"
```

- [ ] **Step 7: Commit**

```bash
cd reading-cards-backend && git add src/chat/tools.mjs src/chat/toolExecutor.mjs src/chat/orchestrator.mjs src/chat/toolGroups.mjs src/chat/planner.mjs && git commit -m "feat: add request_plan tool, remove fragile regex plan detection"
```

---

### Task 12: Fix Tool Groups

**Files:**
- Modify: `reading-cards-backend/src/chat/toolGroups.mjs`

- [ ] **Step 1: Fix ingest keyword pattern**

Replace the ingest group pattern:

```js
// Before (too broad — "url" matches "congratulations"):
pattern: /摄入|ingest|导入|import|url|链接|订阅|subscri|rss|feed/i,

// After:
pattern: /摄入|ingest|导入.*(?:url|链接|文章)|import.*(?:url|article)|订阅|subscri|rss|feed/i,
```

- [ ] **Step 2: Fix reader surface default**

Find the reader surface handling and change default from `cards` to `explore`:

```js
if (surfaceContext?.surface === 'reader') {
  const wantsCreate = /创建|保存|提取|制作|create|save|extract|摘录/i.test(userMessage);
  return wantsCreate ? 'cards' : 'explore';
}
```

- [ ] **Step 3: Clean tool definitions for API**

Update `getToolsForGroup` to strip non-standard fields:

```js
export function getToolsForGroup(groupName) {
  const allowedNames = TOOL_GROUPS[groupName];
  if (allowedNames === null || allowedNames === undefined) {
    return TOOL_DEFINITIONS.map(t => ({ type: t.type, function: t.function }));
  }
  const allowedSet = new Set(allowedNames);
  return TOOL_DEFINITIONS
    .filter(t => allowedSet.has(t.function.name))
    .map(t => ({ type: t.type, function: t.function }));
}
```

- [ ] **Step 4: Run all tests**

```bash
cd reading-cards-backend && node --test "test/**/*.test.mjs"
```

- [ ] **Step 5: Commit**

```bash
cd reading-cards-backend && git add src/chat/toolGroups.mjs && git commit -m "fix: narrow ingest pattern, fix reader default to explore, strip extra tool fields"
```

---

### Task 13: Expand Planner with Context Injection + Dynamic Tool List

**Files:**
- Modify: `reading-cards-backend/src/chat/planner.mjs`
- Modify: `reading-cards-backend/src/chat/orchestrator.mjs`

- [ ] **Step 1: Update `generatePlan` signature and context injection**

In `reading-cards-backend/src/chat/planner.mjs`, update `generatePlan` per spec §6.1:

- Accept `{ conversationSummary, userSources, researchState }` options
- Build rich context parts (user topics, sources, conversation summary, research state)
- Use `buildPlanSystemPrompt()` helper with dynamic tool list from §6.2

Read the file first to understand current structure, then apply the changes.

- [ ] **Step 2: Add TOOL_DEFINITIONS import to planner.mjs**

At the top of `reading-cards-backend/src/chat/planner.mjs`, add:

```js
import { TOOL_DEFINITIONS } from './tools.mjs';
```

- [ ] **Step 3: Create `buildPlanSystemPrompt` helper**

Replace the hardcoded `PLAN_SYSTEM_PROMPT` with a dynamic builder per spec §6.2:

```js
function buildPlanSystemPrompt() {
  const toolDescriptions = TOOL_DEFINITIONS
    .filter(t => t.task_auto)
    .map(t => {
      const params = Object.keys(t.function.parameters?.properties || {}).join(', ');
      return `- ${t.function.name}: ${t.function.description.slice(0, 100)}... Params: {${params}}`;
    })
    .join('\n');

  return `You are a research task planner for Verity...

可用工具（可在步骤中使用）:
${toolDescriptions}

重要：优先使用用户已有的 RSS 源和信息来源，不要编造 URL。如果用户没有相关信息源，在计划中说明需要用户提供。

${PLAN_OUTPUT_SCHEMA}

规则:
- 步骤 ID 必须递增: step_1, step_2, ...
- 每步只用一个工具
- 后续步骤可以引用前序步骤结果（$ref:step_id）
- 最后一步应生成总结
- 用户可见文本用中文
- 计划 3-8 步
- 只输出 JSON`;
}
```

- [ ] **Step 4: Update orchestrator to pass context to planner**

In `chatWithConversation()`, update the plan request handling per spec §6.3:

```js
if (result.planRequest) {
  const { listSources } = await import("../services/supabase/sources.mjs");
  const userSources = await listSources(supabase, userId, {}).catch(() => []);
  const conversationSummary = history
    .filter(m => m.message_type === 'conversation_summary')
    .pop()?.content || chatMessages.slice(-6).map(m => `${m.role}: ${m.content.slice(0, 80)}`).join('\n');

  const { planSpec, planDisplay, suggestedTopicId } = await generatePlan(
    result.planRequest.intent, userId, supabase,
    { conversationSummary, userSources, researchState }
  );
  // ... rest of plan proposal flow
}
```

- [ ] **Step 5: Run all tests**

```bash
cd reading-cards-backend && node --test "test/**/*.test.mjs"
```

- [ ] **Step 6: Commit**

```bash
cd reading-cards-backend && git add src/chat/planner.mjs src/chat/orchestrator.mjs && git commit -m "feat: planner context injection with user sources, summary, research state"
```

---

### Task 14: Fix Executor (stepNote removal, $ref, safe JSON, lock, cache)

**Files:**
- Modify: `reading-cards-backend/src/chat/executor.mjs`
- Modify: `reading-cards-backend/src/services/supabase/tasks.mjs`
- Modify: `reading-cards-backend/src/chat/orchestrator.mjs` (failure notification)
- Test: `reading-cards-backend/test/executor-helpers.test.mjs`

- [ ] **Step 1: Write tests for executor helpers**

Create `reading-cards-backend/test/executor-helpers.test.mjs`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Test deepResolveRefs inline (it's a pure function)
function deepResolveRefs(value, stepOutputs) {
  if (typeof value === 'string' && value.startsWith('$ref:')) {
    return stepOutputs[value.slice(5)] ?? value;
  }
  if (Array.isArray(value)) {
    return value.map(v => deepResolveRefs(v, stepOutputs));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, deepResolveRefs(v, stepOutputs)])
    );
  }
  return value;
}

// Test safeStringify inline
function safeStringify(obj, maxChars = 3000) {
  const full = JSON.stringify(obj);
  if (full.length <= maxChars) return full;
  if (Array.isArray(obj)) {
    const items = [];
    let len = 2;
    for (const item of obj) {
      const s = JSON.stringify(item);
      if (len + s.length + 1 > maxChars - 50) break;
      items.push(item);
      len += s.length + 1;
    }
    return JSON.stringify(items) + ` ...(共 ${obj.length} 项，已截取前 ${items.length} 项)`;
  }
  if (typeof obj === 'object' && obj !== null) {
    const truncated = {};
    for (const [k, v] of Object.entries(obj)) {
      truncated[k] = typeof v === 'string' && v.length > 200 ? v.slice(0, 200) + '...' : v;
    }
    return JSON.stringify(truncated).slice(0, maxChars);
  }
  return full.slice(0, maxChars) + '...(已截断)';
}

describe('deepResolveRefs', () => {
  it('should resolve top-level $ref', () => {
    const result = deepResolveRefs('$ref:step_1', { step_1: { data: 'hello' } });
    assert.deepEqual(result, { data: 'hello' });
  });

  it('should resolve nested $ref in objects', () => {
    const input = { query: '$ref:step_1', filters: { source: '$ref:step_2' } };
    const outputs = { step_1: 'AI chips', step_2: 'TechCrunch' };
    const result = deepResolveRefs(input, outputs);
    assert.deepEqual(result, { query: 'AI chips', filters: { source: 'TechCrunch' } });
  });

  it('should resolve $ref in arrays', () => {
    const input = ['$ref:step_1', 'literal', '$ref:step_2'];
    const outputs = { step_1: 'first', step_2: 'second' };
    const result = deepResolveRefs(input, outputs);
    assert.deepEqual(result, ['first', 'literal', 'second']);
  });

  it('should leave unresolved refs as-is', () => {
    const result = deepResolveRefs('$ref:missing', {});
    assert.equal(result, '$ref:missing');
  });
});

describe('safeStringify', () => {
  it('should return full JSON for small objects', () => {
    const obj = { a: 1, b: 'hello' };
    assert.equal(safeStringify(obj), '{"a":1,"b":"hello"}');
  });

  it('should truncate arrays by keeping complete items', () => {
    const arr = Array.from({ length: 100 }, (_, i) => ({ id: i, name: `item-${i}` }));
    const result = safeStringify(arr, 200);
    assert.ok(result.includes('共 100 项'), 'should indicate total count');
    // Should be valid JSON prefix (before the truncation note)
    const jsonPart = result.split(' ...(')[0];
    const parsed = JSON.parse(jsonPart);
    assert.ok(Array.isArray(parsed), 'should be a valid JSON array');
  });

  it('should truncate long string values in objects', () => {
    const obj = { content: 'A'.repeat(500) };
    const result = safeStringify(obj, 300);
    assert.ok(result.length <= 300, 'should respect maxChars');
  });
});
```

- [ ] **Step 2: Run test — expect PASS**

```bash
cd reading-cards-backend && node --test test/executor-helpers.test.mjs
```

- [ ] **Step 3: Update executor.mjs**

In `reading-cards-backend/src/chat/executor.mjs`:

a. **Remove `generateStepNote`** — delete the entire function and its call in the step loop.

b. **Replace step progress message** — instead of AI-generated note, use a template:

```js
await addMessage(supabase, conversationId, {
  role: 'assistant',
  content: `**${planStep.title}** — ${summarizeToolOutput(planStep.tool, toolResult)}`,
  message_type: 'step_progress',
  metadata: { step_id: planStep.id, step_index: i, tool: planStep.tool, status: 'completed' },
});
```

Add `summarizeToolOutput` helper if not already present.

c. **Add `deepResolveRefs`** — replace the current `resolveStepInput` with recursive version from spec §6.5.

d. **Add `safeStringify`** — replace any `JSON.stringify().slice()` calls with `safeStringify` from spec §6.6.

e. **Cache `createAIClientConfig`** — call it once at the top of `executePlan` and pass to `generatePlanSummary`.

- [ ] **Step 4: Add `acquireTaskLock` with timeout to tasks.mjs**

In `reading-cards-backend/src/services/supabase/tasks.mjs`, add or update `acquireTaskLock` per spec §6.7b:

```js
export async function acquireTaskLock(supabase, taskId, runId) {
  const now = new Date().toISOString();
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('tasks')
    .update({ is_running: true, running_run_id: runId, locked_at: now })
    .eq('id', taskId)
    .eq('is_running', false)
    .select()
    .maybeSingle();

  if (data) return true;

  // Check for stale lock (>30 minutes)
  const { data: staleData } = await supabase
    .from('tasks')
    .update({ is_running: true, running_run_id: runId, locked_at: now })
    .eq('id', taskId)
    .eq('is_running', true)
    .lt('locked_at', thirtyMinutesAgo)
    .select()
    .maybeSingle();

  if (staleData) {
    console.warn(`[tasks] Force-acquired stale lock on task ${taskId}`);
    return true;
  }

  return false;
}
```

- [ ] **Step 5: Add failure notification in orchestrator.mjs**

Find the `.catch()` on `executePlan()` in orchestrator.mjs and update per spec §6.7:

```js
executePlan({ task, planSpec, conversationId, supabase: adminSb })
  .catch(async (err) => {
    console.error('[executor] Plan execution failed:', err);
    try {
      await addMessage(adminSb, conversationId, {
        role: 'assistant',
        content: `执行计划失败: ${err.message}`,
        message_type: 'error',
        metadata: { task_id: task.id },
      });
    } catch (msgErr) {
      console.error('[executor] Failed to write error message:', msgErr);
    }
  });
```

- [ ] **Step 6: Run all tests**

```bash
cd reading-cards-backend && node --test "test/**/*.test.mjs"
```

- [ ] **Step 7: Commit**

```bash
cd reading-cards-backend && git add src/chat/executor.mjs src/services/supabase/tasks.mjs src/chat/orchestrator.mjs test/executor-helpers.test.mjs && git commit -m "fix: executor - remove stepNote, add recursive ref, safe JSON, lock timeout, failure notification"
```

---

## Chunk 5: AI Client Layer (Tasks 15–17)

### Task 15: Anthropic Direct Mode Tool Calls + fetchWithTimeout

**Files:**
- Modify: `reading-cards-backend/src/services/aiClient.mjs`

- [ ] **Step 1: Add `fetchWithTimeout` helper**

In `reading-cards-backend/src/services/aiClient.mjs`, add:

```js
async function fetchWithTimeout(url, options, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`AI API 请求超时 (${timeoutMs / 1000}s)`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 2: Replace all bare `fetch()` calls with `fetchWithTimeout()`**

Search for `fetch(` in aiClient.mjs and replace with `fetchWithTimeout(`. This applies to `callChatAPI` and `callResponsesAPI`.

- [ ] **Step 3: Fix Anthropic direct mode handler**

Replace the Anthropic handler block per spec §7.1. The key changes:

1. Extract system message BEFORE `translateToAnthropicFormat()`
2. Pass it as top-level `system` field in Anthropic payload
3. Translate tool definitions from OpenAI format to Anthropic format
4. Translate response: `tool_use` blocks → OpenAI `tool_calls` format

Read the current handler code first, then replace with the full implementation from spec §7.1.

- [ ] **Step 4: Add `translateToAnthropicFormat` helper**

Add the helper function from spec §7.1 that converts:
- OpenAI `tool` role messages → Anthropic `tool_result` content blocks
- OpenAI assistant `tool_calls` → Anthropic `tool_use` content blocks

- [ ] **Step 5: Add token usage logging**

After every `callChatAPI` response, add per spec §7.3:

```js
if (result.usage) {
  const { prompt_tokens, completion_tokens } = result.usage;
  console.log(`[ai] ${model} | ${prompt_tokens} in / ${completion_tokens} out | total: ${prompt_tokens + completion_tokens}`);
}
```

- [ ] **Step 6: Run all tests**

```bash
cd reading-cards-backend && node --test "test/**/*.test.mjs"
```

- [ ] **Step 7: Commit**

```bash
cd reading-cards-backend && git add src/services/aiClient.mjs && git commit -m "fix: Anthropic direct mode tool_calls, add fetchWithTimeout, token usage logging"
```

---

### Task 16: Deprecate `callChatCompletion`

**Files:**
- Modify: `reading-cards-backend/src/services/aiRuntime.mjs`

- [ ] **Step 1: Find all callers of `callChatCompletion`**

Search the codebase for imports/calls of `callChatCompletion`:

```bash
cd reading-cards-backend && grep -r "callChatCompletion" src/ --include="*.mjs"
```

- [ ] **Step 2: Migrate callers to `callChatAPI`**

For each caller found, replace `callChatCompletion` with the equivalent `callChatAPI` call from `aiClient.mjs`. The API is similar but `callChatAPI` goes through the unified client config.

- [ ] **Step 3: Mark as deprecated or remove**

If no callers remain, delete `callChatCompletion` from `aiRuntime.mjs`. If callers exist that can't be migrated yet, add a deprecation comment:

```js
/** @deprecated Use callChatAPI from aiClient.mjs instead */
```

- [ ] **Step 4: Run all tests**

```bash
cd reading-cards-backend && node --test "test/**/*.test.mjs"
```

- [ ] **Step 5: Commit**

```bash
cd reading-cards-backend && git add src/services/aiRuntime.mjs && git commit -m "refactor: deprecate callChatCompletion, migrate callers to callChatAPI"
```

---

### Task 17: DB Migrations + Final Verification

**Files:**
- Create: `reading-cards-backend/supabase/migrations/022_ai_agent_optimization.sql`

- [ ] **Step 1: Create migration file**

Check if a `supabase/migrations` directory exists. If not, create it. Then write the migration:

```sql
-- AI Agent Optimization: required schema changes
-- Spec: docs/superpowers/specs/2026-03-15-ai-agent-optimization-spec.md §9

-- 9.1: Add 'conversation_summary' to message_type CHECK constraint
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_message_type_check;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_message_type_check
  CHECK (message_type IN ('text', 'tool_calls', 'plan_proposal', 'plan_confirmed', 'step_progress', 'plan_complete', 'error', 'conversation_summary'));

-- 9.2: Add locked_at column for task lock timeout
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
```

- [ ] **Step 2: Run full test suite**

```bash
cd reading-cards-backend && node --test "test/**/*.test.mjs"
```

- [ ] **Step 3: Commit migration**

```bash
cd reading-cards-backend && git add supabase/ && git commit -m "chore: add DB migrations for conversation_summary type and task lock timeout"
```

- [ ] **Step 4: Final verification — start the server**

```bash
cd reading-cards-backend && node src/server.mjs
```

Verify it starts without import errors or crashes. Ctrl+C to stop.

- [ ] **Step 5: Final commit message summarizing the full optimization**

```bash
git log --oneline -20
```

Review the commit history to ensure all tasks are committed.

---

## Summary

| Chunk | Tasks | Files Modified | Key Changes |
|-------|-------|---------------|-------------|
| 1: P0 Fixes | 1–4 | conversations.mjs, orchestrator.mjs, toolExecutor.mjs, aiClient.mjs, cards.mjs, boards.mjs, documents.mjs, .env.example | Sort fix, confirmation gate, userId filter, AES encryption |
| 2: Context | 5–8 | NEW contextBudget.mjs, models.config.json, aiClient.mjs, orchestrator.mjs | Token budget, sliding window, tool compression, summaries |
| 3: Prompt | 9–10 | promptBuilder.mjs, tools.mjs | XML structure, few-shot, Chinese unification, tool descriptions |
| 4: Tool+Plan | 11–14 | tools.mjs, toolExecutor.mjs, orchestrator.mjs, toolGroups.mjs, planner.mjs, executor.mjs, tasks.mjs | request_plan tool, group fixes, planner context, executor fixes |
| 5: AI Client | 15–17 | aiClient.mjs, aiRuntime.mjs, NEW migration SQL | Anthropic tool_calls, timeout, token log, deprecate overlap |
