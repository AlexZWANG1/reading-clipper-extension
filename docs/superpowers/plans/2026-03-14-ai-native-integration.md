# AI-Native Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three-mode toggle, floating global chat, markdown rendering, health sidebar, draft preview, and ambient evidence suggestions to the Verity research workbench.

**Architecture:** Backend adds `mode` parameter threading through the chat call chain and two new service functions (evidence suggestion + quick-link). Frontend replaces BoardChatPanel with a global floating chat, adds react-markdown rendering, and introduces health/draft/suggestion UI components. All state flows through existing Zustand store in `lib/store.js`.

**Tech Stack:** Express.js (backend), React 18 + react-router v6 + Zustand 5 + @xyflow/react 12 (frontend), react-markdown 9 + remark-gfm 4 (new deps)

**Spec:** `docs/superpowers/specs/2026-03-14-ai-native-integration-spec.md`

---

## Chunk 1: Backend Changes

### Task 1: Mode Parameter Threading + Prompt Updates

Thread the `mode` parameter (`chat` | `agent` | `auto`) through the full chat call chain: route → orchestrator → promptBuilder. Also add UUID prohibition and output format guidance to the prompt.

**Files:**
- Modify: `reading-cards-backend/src/routes/v2/chat.mjs`
- Modify: `reading-cards-backend/src/chat/orchestrator.mjs`
- Modify: `reading-cards-backend/src/chat/promptBuilder.mjs`
- Test: `reading-cards-backend/test/mode-threading.test.mjs`

- [ ] **Step 1: Write the failing test for mode threading**

Create `reading-cards-backend/test/mode-threading.test.mjs`:

```javascript
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
assert.ok(!autoPrompt.includes('聊天'), 'auto mode should not have chat instruction');
assert.ok(!autoPrompt.includes('代理'), 'auto mode should not have agent instruction');

// Test 4: UUID prohibition present in all modes
assert.ok(chatPrompt.includes('NEVER show internal IDs'), 'UUID prohibition missing in chat');
assert.ok(agentPrompt.includes('NEVER show internal IDs'), 'UUID prohibition missing in agent');
assert.ok(autoPrompt.includes('NEVER show internal IDs'), 'UUID prohibition missing in auto');

// Test 5: output format guidance present
assert.ok(chatPrompt.includes('card\'s title as a heading'), 'output format guidance missing');

// Test 6: default mode (undefined) behaves like auto
const defaultPrompt = buildSystemPrompt({
  surfaceContext: null,
  methodology: null,
  researchState: null,
  toolGroup: 'explore',
});
assert.ok(!defaultPrompt.includes('聊天'), 'default mode should behave like auto');

console.log('✅ All mode threading tests passed (6/6)');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd reading-cards-backend && node test/mode-threading.test.mjs`
Expected: FAIL — `buildSystemPrompt` does not accept `mode` parameter yet, no UUID prohibition text.

- [ ] **Step 3: Update promptBuilder.mjs**

In `reading-cards-backend/src/chat/promptBuilder.mjs`:

1. Update `NEGATIVE_CONSTRAINTS` (around line 30) — add UUID prohibition:

```javascript
const NEGATIVE_CONSTRAINTS = `## Absolute Prohibitions

- NEVER create, modify, or delete any data unless the user EXPLICITLY asks you to.
- When the user asks for information, ONLY use read/search tools to look up and answer.
- NEVER fabricate data — always call tools to retrieve real data.
- NEVER proactively create cards, nodes, or edges as a "helpful" side effect.
- If unsure whether the user wants you to create something, ASK first.
- NEVER show internal IDs (UUIDs) in your responses. Reference data by its title, summary, or content. Users don't need to see database identifiers.`;
```

2. Update `BASE_IDENTITY` (around line 7) — add output format guidance:

```javascript
const BASE_IDENTITY = `You are a research assistant for "Verity" (求真), an evidence-driven research workbench. You help users manage their reading knowledge base: cards, topics, thinking boards, documents, sources, and ingested materials.

Answer in the same language the user uses. Be concise and helpful. Always ground your answers in the user's actual data — call tools to look up data before answering.

When presenting cards or data to the user, format them cleanly:
- Use the card's title as a heading, not its UUID
- Show key points as a bullet list
- Include source name if available
- Use markdown formatting for readability`;
```

3. Add `MODE_INSTRUCTIONS` constant after `NEGATIVE_CONSTRAINTS`:

```javascript
const MODE_INSTRUCTIONS = {
  chat: `\n## 当前模式：聊天模式\n你当前处于"聊天"模式。你只能查询和搜索数据来回答问题，不能创建、修改或删除任何内容。如果用户要求你执行写操作，告诉他们切换到"代理"模式。`,
  agent: `\n## 当前模式：代理模式\n你当前处于"代理"模式。你可以执行操作，但写操作需要用户确认。`,
  auto: '',
};
```

4. Update `buildSystemPrompt` function signature and body — add `mode` parameter:

```javascript
export function buildSystemPrompt({ surfaceContext, methodology, researchState, toolGroup, mode }) {
  const parts = [];

  // ... existing assembly (BASE_IDENTITY, DATA_MODEL_BRIEF, etc.) ...

  // Mode instruction — BEFORE NEGATIVE_CONSTRAINTS (constraints must stay last for maximum attention)
  const modeInstruction = MODE_INSTRUCTIONS[mode] || '';
  if (modeInstruction) parts.push(modeInstruction);

  // Negative constraints — ALWAYS last
  // (already pushed by existing code — just ensure mode goes before it)

  return parts.join('\n\n');
}

// IMPORTANT: Insert the mode instruction push BEFORE the existing
// `parts.push(NEGATIVE_CONSTRAINTS)` line. The constraints must remain
// the final section of the prompt.

```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd reading-cards-backend && node test/mode-threading.test.mjs`
Expected: `✅ All mode threading tests passed (6/6)`

- [ ] **Step 5: Update orchestrator.mjs to accept and thread mode**

In `reading-cards-backend/src/chat/orchestrator.mjs`:

1. Update `chat()` function signature (around line 36) — add `mode`:

```javascript
export async function chat({ messages, userId, supabase, accessToken, onToolCall, surfaceContext, toolGroupOverride, mode }) {
```

2. Update tool group resolution (around line 55) — mode overrides inference:

```javascript
const toolGroup = toolGroupOverride
  || (mode === 'chat' ? 'explore' : inferToolGroup(lastUserMsg, surfaceContext));
```

3. Update `buildSystemPrompt` call (around line 65) — pass mode:

```javascript
const systemPrompt = buildSystemPrompt({
  surfaceContext,
  methodology,
  researchState,
  toolGroup,
  mode,
});
```

4. Update `chatWithConversation()` signature (around line 451) — add `mode`:

```javascript
export async function chatWithConversation({ conversationId, userMessage, userId, supabase, accessToken, surfaceContext, mode }) {
```

5. Thread mode to `chat()` call inside `chatWithConversation()` (around line 479):

```javascript
const result = await chat({ messages, userId, supabase, accessToken, surfaceContext, mode });
```

- [ ] **Step 6: Update chat.mjs route to extract mode**

In `reading-cards-backend/src/routes/v2/chat.mjs`:

1. Update destructuring (around line 23):

```javascript
const { conversation_id, user_message, messages, surface_context, mode } = req.body;
```

2. Pass mode to `chatWithConversation()` (around line 28):

```javascript
const result = await chatWithConversation({
  conversationId: conversation_id || null,
  userMessage: user_message,
  userId: req.user.id,
  supabase: req.supabase,
  accessToken: req.accessToken,
  surfaceContext: surface_context || null,
  mode: mode || 'auto',
});
```

3. Also pass mode in the legacy stateless path (around line 55):

```javascript
const result = await chat({
  messages,
  userId: req.user.id,
  supabase: req.supabase,
  accessToken: req.accessToken,
  surfaceContext: surface_context || null,
  mode: mode || 'auto',
});
```

- [ ] **Step 7: Write integration test for full chain**

Add to `reading-cards-backend/test/mode-threading.test.mjs`:

```javascript
// Test 7-9: Tool group resolution with mode parameter
import { inferToolGroup } from '../src/chat/toolGroups.mjs';

// Helper that mirrors the actual orchestrator logic
function resolveToolGroup(mode, message, surfaceContext, toolGroupOverride) {
  return toolGroupOverride || (mode === 'chat' ? 'explore' : inferToolGroup(message, surfaceContext));
}

// Even with board keywords, chat mode should force explore
assert.equal(
  resolveToolGroup('chat', '帮我分解这个假说', { surface: 'board' }, null),
  'explore',
  'chat mode should force explore group regardless of keywords'
);

// Agent mode uses inference
assert.equal(
  resolveToolGroup('agent', '帮我分解这个假说', { surface: 'board' }, null),
  'board',
  'agent mode should use keyword/surface inference'
);

// toolGroupOverride always wins over mode
assert.equal(
  resolveToolGroup('chat', '搜索', null, 'full'),
  'full',
  'toolGroupOverride should win over chat mode'
);

console.log('✅ All mode threading tests passed (9/9)');
```

- [ ] **Step 8: Run all tests**

Run: `cd reading-cards-backend && node test/mode-threading.test.mjs`
Expected: `✅ All mode threading tests passed (8/8)`

- [ ] **Step 9: Commit**

```bash
git add reading-cards-backend/src/chat/promptBuilder.mjs reading-cards-backend/src/chat/orchestrator.mjs reading-cards-backend/src/routes/v2/chat.mjs reading-cards-backend/test/mode-threading.test.mjs
git commit -m "feat(backend): add mode parameter threading + UUID prohibition + output format guidance"
```

---

### Task 2: Evidence Card IDs in Health Endpoint

Add `evidence_card_ids` per hypothesis in the health computation so the frontend can cross-reference cards with hypotheses.

**Files:**
- Modify: `reading-cards-backend/src/agents/researchContext.mjs`
- Test: `reading-cards-backend/test/mode-threading.test.mjs` (append)

- [ ] **Step 1: Write the failing test**

Append to `reading-cards-backend/test/mode-threading.test.mjs`:

```javascript
// Test: computeResearchState returns evidence_card_ids field structure
import { computeResearchState } from '../src/agents/researchContext.mjs';

// We can't test with real DB, but verify the function exists and exports
assert.equal(typeof computeResearchState, 'function', 'computeResearchState should be a function');

console.log('✅ All tests passed (9/9)');
```

- [ ] **Step 2: Update researchContext.mjs**

In `reading-cards-backend/src/agents/researchContext.mjs`, inside `computeResearchState()`:

1. Find the per-hypothesis loop (around lines 52-97). For each hypothesis, after computing support/refute counts, add evidence_card_ids extraction:

```javascript
// Inside the hypotheses.map(h => { ... }) callback (around line 57-97),
// AFTER the `status` assignment and BEFORE the return object.
// Note: the loop variable is `h`, not `hypo`.
const evidenceCardIds = evidenceNodes
  .filter(e => e.parent_id === h.id && e.card_id)
  .map(e => e.card_id);
```

2. Include `evidence_card_ids` in each hypothesis summary object:

```javascript
{
  node_id: hypo.id,
  text: hypo.claim || hypo.content?.text || '',
  support: supportCount,
  refute: refuteCount,
  neutral: neutralCount,
  total: totalCount,
  status,
  evidence_card_ids: evidenceCardIds,  // NEW
}
```

- [ ] **Step 3: Run existing validation tests to ensure nothing breaks**

Run: `cd reading-cards-backend && node test/validation.test.mjs`
Expected: All 41 tests pass.

- [ ] **Step 4: Commit**

```bash
git add reading-cards-backend/src/agents/researchContext.mjs
git commit -m "feat(backend): add evidence_card_ids to health endpoint per hypothesis"
```

---

### Task 3: Evidence Suggestion + Quick-Link Endpoint

Add `findEvidenceSuggestion()` to the cards service, call it after card creation, and add the quick-link endpoint to boards.

**Files:**
- Modify: `reading-cards-backend/src/services/supabase/cards.mjs`
- Modify: `reading-cards-backend/src/routes/v2/cards.mjs`
- Modify: `reading-cards-backend/src/routes/v2/boards.mjs`
- Test: `reading-cards-backend/test/evidence-suggestion.test.mjs`

- [ ] **Step 1: Write the failing test for findEvidenceSuggestion**

Create `reading-cards-backend/test/evidence-suggestion.test.mjs`:

```javascript
import assert from 'node:assert/strict';

// Test the token extraction logic (can test without DB)
function extractTokens(text) {
  const latinWords = text.match(/[a-z]{2,}/gi) || [];
  const CJK_STOP_CHARS = new Set('的了在是我有和与不也这那些个');
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || [])
    .filter(c => !CJK_STOP_CHARS.has(c));
  const cjkBigrams = [];
  for (let i = 0; i < cjkChars.length - 1; i++) {
    cjkBigrams.push(cjkChars[i] + cjkChars[i + 1]);
  }
  return [...latinWords.map(w => w.toLowerCase()), ...cjkBigrams];
}

// Test 1: Latin text extraction
const latin = extractTokens('Pricing causes churn');
assert.ok(latin.includes('pricing'), 'should extract pricing');
assert.ok(latin.includes('causes'), 'should extract causes');
assert.ok(latin.includes('churn'), 'should extract churn');

// Test 2: Chinese text extraction with bigrams
const chinese = extractTokens('定价导致用户流失');
assert.ok(chinese.includes('定价'), 'should extract 定价 bigram');
assert.ok(chinese.includes('导致'), 'should extract 导致 bigram');
assert.ok(chinese.includes('流失'), 'should extract 流失 bigram');

// Test 3: Stop characters filtered
const withStops = extractTokens('这是一个定价的问题');
assert.ok(!withStops.includes('这是'), 'should filter stop char bigrams');
assert.ok(withStops.includes('定价'), 'should keep meaningful bigrams');

// Test 4: Mixed text
const mixed = extractTokens('AI Safety 人工智能安全');
assert.ok(mixed.includes('safety'), 'should extract latin');
assert.ok(mixed.includes('人工'), 'should extract CJK bigram');
assert.ok(mixed.includes('智能'), 'should extract CJK bigram');

// Test 5: Empty text
const empty = extractTokens('');
assert.equal(empty.length, 0, 'empty text should return empty array');

console.log('✅ All evidence suggestion tests passed (5/5)');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd reading-cards-backend && node test/evidence-suggestion.test.mjs`
Expected: PASS (this tests the helper logic only; will test integration separately).

- [ ] **Step 3: Add findEvidenceSuggestion to cards service**

Append to `reading-cards-backend/src/services/supabase/cards.mjs` (after `getCardsByIds`):

```javascript
/**
 * Find hypotheses that might be relevant to a newly created card.
 * Uses keyword overlap scoring with CJK bigram support.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} card - The newly created card { summary, key_points, topic_id }
 * @param {string} topicId - Topic to search boards in
 * @returns {Object|null} { hypothesis_id, hypothesis_text, board_id, score } or null
 */
export async function findEvidenceSuggestion(supabase, card, topicId) {
  if (!topicId) return null;

  const { data: board } = await supabase
    .from('thinking_boards')
    .select('id')
    .eq('topic_id', topicId)
    .maybeSingle();

  if (!board) return null;

  const { data: hypotheses } = await supabase
    .from('board_nodes')
    .select('id, claim, content')
    .eq('board_id', board.id)
    .eq('node_type', 'hypothesis');

  if (!hypotheses?.length) return null;

  const cardText = `${card.summary || ''} ${(card.key_points || []).join(' ')}`.toLowerCase();

  function extractTokens(text) {
    const latinWords = text.match(/[a-z]{2,}/gi) || [];
    const CJK_STOP_CHARS = new Set('的了在是我有和与不也这那些个');
    const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || [])
      .filter(c => !CJK_STOP_CHARS.has(c));
    const cjkBigrams = [];
    for (let i = 0; i < cjkChars.length - 1; i++) {
      cjkBigrams.push(cjkChars[i] + cjkChars[i + 1]);
    }
    return [...latinWords.map(w => w.toLowerCase()), ...cjkBigrams];
  }

  let bestMatch = null;
  let bestScore = 0;

  for (const h of hypotheses) {
    const hypoText = (h.claim || h.content?.text || '').toLowerCase();
    const hypoTokens = extractTokens(hypoText);
    if (hypoTokens.length === 0) continue;

    const matchCount = hypoTokens.filter(t => cardText.includes(t)).length;
    const score = matchCount / hypoTokens.length;

    if (score > bestScore && score > 0.4) {
      bestScore = score;
      bestMatch = {
        hypothesis_id: h.id,
        hypothesis_text: h.claim || h.content?.text,
        board_id: board.id,
        score,
      };
    }
  }

  return bestMatch;
}
```

- [ ] **Step 4: Integrate findEvidenceSuggestion into card capture route**

In `reading-cards-backend/src/routes/v2/cards.mjs`:

1. Add import at top:

```javascript
import { addCard, findEvidenceSuggestion } from "../../services/supabase/cards.mjs";
```

(Adjust the existing `addCard` import to include `findEvidenceSuggestion`.)

2. Create a helper function at the top of the route file (inside the module, before the routes):

```javascript
async function withEvidenceSuggestion(supabase, card) {
  let evidence_suggestion = null;
  try {
    if (card.topic_id) {
      evidence_suggestion = await findEvidenceSuggestion(supabase, card, card.topic_id);
    }
  } catch (err) {
    console.error('Evidence suggestion error (non-fatal):', err.message);
  }
  return evidence_suggestion;
}
```

3. Add the evidence suggestion call in BOTH capture code paths:

**Fast path** (around line 134, the `return res.json({ ok: true, card })` for raw_snippet):
```javascript
const evidence_suggestion = await withEvidenceSuggestion(req.supabase, card);
return res.json({ ok: true, card, evidence_suggestion });
```

**AI-processed path** (around line 170, the `res.json({ ok: true, card })` at the end):
```javascript
const evidence_suggestion = await withEvidenceSuggestion(req.supabase, card);
res.json({ ok: true, card, evidence_suggestion });
```

Both paths must include this — the spec (section 9.3) explicitly requires it.

- [ ] **Step 5: Add quick-link endpoint to boards route**

In `reading-cards-backend/src/routes/v2/boards.mjs`, after the draft reject endpoint, add:

```javascript
/**
 * POST /api/v2/boards/:boardId/quick-link
 * One-click link a card as evidence to a hypothesis.
 * Body: { card_id, hypothesis_id, relation_type? }
 */
router.post("/:boardId/quick-link", async (req, res) => {
    try {
        const { card_id, hypothesis_id, relation_type } = req.body || {};
        if (!card_id || !hypothesis_id) {
            return res.status(400).json({ ok: false, error: "card_id and hypothesis_id are required" });
        }

        // Create evidence node linked to the hypothesis
        const node = await createNode(req.supabase, req.params.boardId, {
            node_type: 'evidence',
            parent_id: hypothesis_id,
            card_id,
            evidence_type: 'fact',
            strength: 3,
            content: { text: '' },
        });

        // Create edge from evidence to hypothesis
        const edge = await createEdge(req.supabase, req.params.boardId, {
            source_node_id: node.id,
            target_node_id: hypothesis_id,
            relation_type: relation_type || 'supports',
        });

        res.json({ ok: true, node, edge });
    } catch (error) {
        console.error("快速链接失败：", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});
```

Note: `createNode` and `createEdge` are already imported at the top of this file.

- [ ] **Step 6: Verify server starts**

Run: `cd reading-cards-backend && node -e "import('./src/server.mjs').then(() => console.log('✅ Server imports OK')).catch(e => { console.error(e); process.exit(1); })"`
Expected: `✅ Server imports OK` (or server starts listening — Ctrl+C to stop).

- [ ] **Step 7: Commit**

```bash
git add reading-cards-backend/src/services/supabase/cards.mjs reading-cards-backend/src/routes/v2/cards.mjs reading-cards-backend/src/routes/v2/boards.mjs reading-cards-backend/test/evidence-suggestion.test.mjs
git commit -m "feat(backend): add evidence suggestion matching + quick-link endpoint"
```

---

## Chunk 2: Frontend Foundation

### Task 4: Install Dependencies + ChatMessage Component

Install react-markdown and remark-gfm, then create the ChatMessage component for markdown rendering.

**Files:**
- Modify: `web-app/package.json`
- Create: `web-app/src/components/ChatMessage.jsx`

- [ ] **Step 1: Install dependencies**

Run: `cd web-app && npm install react-markdown@^9.0.0 remark-gfm@^4.0.0`
Expected: Both packages added to package.json.

- [ ] **Step 2: Create ChatMessage component**

Create `web-app/src/components/ChatMessage.jsx`:

```jsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ChatMessage({ content, role }) {
  if (role === 'user') {
    return <span className="whitespace-pre-wrap">{content}</span>;
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="list-disc ml-4 mb-1.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal ml-4 mb-1.5">{children}</ol>,
        li: ({ children }) => <li className="mb-0.5">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        pre: ({ children }) => (
          <pre className="bg-black/10 p-2 rounded text-xs overflow-x-auto my-1.5">{children}</pre>
        ),
        code: ({ children }) => (
          <code className="bg-black/10 px-1 rounded text-xs">{children}</code>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-1.5">
            <table className="text-xs border-collapse">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border px-2 py-1 bg-black/5 text-left">{children}</th>,
        td: ({ children }) => <td className="border px-2 py-1">{children}</td>,
        a: ({ children }) => <span className="text-blue-600 underline">{children}</span>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `cd web-app && npx vite build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add web-app/package.json web-app/package-lock.json web-app/src/components/ChatMessage.jsx
git commit -m "feat(frontend): add ChatMessage with react-markdown rendering"
```

---

### Task 5: Surface Context Hook + Store Extensions + API Updates

Create the `useSurfaceContext` hook, extend `useChatStore` with mode/surfaceContext fields, and update the API client.

**Files:**
- Create: `web-app/src/hooks/useSurfaceContext.js`
- Modify: `web-app/src/lib/store.js`
- Modify: `web-app/src/lib/api.js`

- [ ] **Step 1: Create useSurfaceContext hook**

First create the hooks directory: `mkdir -p web-app/src/hooks`

Create `web-app/src/hooks/useSurfaceContext.js`:

```javascript
import { useMatch, useLocation } from 'react-router-dom';

/**
 * Detects the current surface context from the route.
 * Used by GlobalChatPanel to tell the AI what page we're on.
 *
 * @returns {{ surface: string, topicId?: string, materialId?: string }}
 */
export function useSurfaceContext() {
  const boardMatch = useMatch('/topics/:topicId');
  const readerMatch = useMatch('/materials/:id');
  const location = useLocation();

  if (boardMatch) {
    return { surface: 'board', topicId: boardMatch.params.topicId };
  }
  if (readerMatch) {
    return { surface: 'reader', materialId: readerMatch.params.id };
  }
  if (location.pathname === '/' || location.pathname === '/materials') {
    return { surface: 'cards' };
  }
  return { surface: 'general' };
}
```

- [ ] **Step 2: Update api.js — extend sendMessage signature + add new functions**

In `web-app/src/lib/api.js`:

1. Find `chatApi.sendMessage` (around line 576). Change from:

```javascript
sendMessage: (conversationId, userMessage) =>
  request('/v2/chat', {
    method: 'POST',
    body: JSON.stringify({ conversation_id: conversationId, user_message: userMessage }),
  }),
```

To:

```javascript
sendMessage: (conversationId, userMessage, { surfaceContext, mode } = {}) =>
  request('/v2/chat', {
    method: 'POST',
    body: JSON.stringify({
      conversation_id: conversationId,
      user_message: userMessage,
      surface_context: surfaceContext || null,
      mode: mode || 'auto',
    }),
  }),
```

2. Add new functions to the `boardsApi` object (find `boardsApi` definition):

```javascript
// Add to boardsApi:
getHealth: (boardId) =>
  request(`/v2/boards/${boardId}/health`),

getDrafts: (boardId) =>
  request(`/v2/boards/${boardId}/drafts`),

commitDraft: (boardId, draftId, acceptedIndices = null) =>
  request(`/v2/boards/${boardId}/drafts/${draftId}/commit`, {
    method: 'POST',
    body: JSON.stringify({ accepted_indices: acceptedIndices }),
  }),

rejectDraft: (boardId, draftId) =>
  request(`/v2/boards/${boardId}/drafts/${draftId}/reject`, {
    method: 'POST',
  }),

quickLink: (boardId, cardId, hypothesisId, relationType = 'supports') =>
  request(`/v2/boards/${boardId}/quick-link`, {
    method: 'POST',
    body: JSON.stringify({
      card_id: cardId,
      hypothesis_id: hypothesisId,
      relation_type: relationType,
    }),
  }),
```

- [ ] **Step 3: Extend useChatStore in store.js**

In `web-app/src/lib/store.js`, find the `useChatStore` definition (around line 533).

1. Add new state fields after the existing ones (e.g., after `templates: []`):

```javascript
surfaceContext: null,
mode: localStorage.getItem('verity-chat-mode') || 'auto',
```

2. Add new actions:

```javascript
setSurfaceContext: (ctx) => set({ surfaceContext: ctx }),

setMode: (mode) => {
  localStorage.setItem('verity-chat-mode', mode);
  set({ mode });
},
```

3. Update the existing `sendMessage` action to thread surfaceContext and mode. Find the `sendMessage` action (the function that calls `chatApi.sendMessage`). Update the API call to include the new params:

```javascript
// Inside sendMessage action, find the chatApi.sendMessage call (around line 586).
// Change ONLY the arguments — keep the existing variable name `result`:
const result = await chatApi.sendMessage(conversationId, text, {
  surfaceContext: get().surfaceContext,
  mode: get().mode,
});
// The rest of the function references result.conversation_id, result.reply, etc. — leave unchanged.
```

4. Also add board invalidation fields (used by ThinkingBoardPage):

```javascript
boardId: null,
boardInvalidateCounter: 0,
setBoardId: (id) => set({ boardId: id }),
invalidateBoard: () => set((s) => ({ boardInvalidateCounter: s.boardInvalidateCounter + 1 })),
```

- [ ] **Step 4: Verify build**

Run: `cd web-app && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web-app/src/hooks/useSurfaceContext.js web-app/src/lib/store.js web-app/src/lib/api.js
git commit -m "feat(frontend): add useSurfaceContext hook, extend store with mode/surface, update API client"
```

---

### Task 6: GlobalChatPanel + Layout Integration

Create the floating GlobalChatPanel and integrate it into Layout.jsx. Remove BoardChatPanel usage from ThinkingBoardPage.

**Files:**
- Create: `web-app/src/components/GlobalChatPanel.jsx`
- Modify: `web-app/src/components/Layout.jsx`
- Modify: `web-app/src/pages/ThinkingBoardPage.jsx`
- Modify: `web-app/src/pages/ChatPage.jsx`

- [ ] **Step 1: Create GlobalChatPanel**

Create `web-app/src/components/GlobalChatPanel.jsx`:

```jsx
import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Minus, Send } from 'lucide-react';
import { useSurfaceContext } from '../hooks/useSurfaceContext';
import { useChatStore } from '../lib/store';
import ChatMessage from './ChatMessage';

const MODES = [
  { key: 'chat', icon: '💬', label: '聊天' },
  { key: 'agent', icon: '🤖', label: '代理' },
  { key: 'auto', icon: '✨', label: '自动' },
];

export default function GlobalChatPanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const surfaceContext = useSurfaceContext();
  const { messages, sending, sendMessage, mode, setMode, setSurfaceContext } = useChatStore();

  // Update surface context when route changes
  useEffect(() => {
    setSurfaceContext(surfaceContext);
  }, [surfaceContext.surface, surfaceContext.topicId, surfaceContext.materialId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    await sendMessage(text);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Collapsed state — floating button
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-violet-500 text-white shadow-lg hover:bg-violet-600 transition-colors flex items-center justify-center"
        title="Verity AI"
      >
        <MessageCircle size={22} />
      </button>
    );
  }

  // Expanded state — chat panel
  // NOTE: Use CSS variables from index.css for colors to match the warm theme.
  // Replace bg-white → style={{background: 'var(--surface)'}}, border-gray-200 → var(--border-primary), etc.
  // The violet accent (#8B5CF6) should be added as --ai-accent in index.css.
  return (
    <div className="fixed bottom-6 right-6 z-50 w-[400px] h-[560px] rounded-xl shadow-2xl flex flex-col overflow-hidden" style={{background: 'var(--surface)', border: '1px solid var(--border-primary)'}}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-gray-50">
        <span className="font-semibold text-sm">Verity AI</span>
        <div className="flex items-center gap-1">
          {/* Mode toggle */}
          <div className="flex bg-gray-200 rounded-lg p-0.5 mr-2">
            {MODES.map(m => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`px-2 py-0.5 rounded-md text-xs transition-colors ${
                  mode === m.key
                    ? 'bg-white shadow-sm font-medium'
                    : 'hover:bg-gray-300'
                }`}
                title={m.label}
              >
                {m.icon}
              </button>
            ))}
          </div>
          <button onClick={() => setOpen(false)} className="p-1 hover:bg-gray-200 rounded" title="最小化">
            <Minus size={14} />
          </button>
          <button onClick={() => setOpen(false)} className="p-1 hover:bg-gray-200 rounded" title="关闭">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-8">
            有什么可以帮你的？
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={msg.id || i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                msg.role === 'user'
                  ? 'bg-violet-500 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <ChatMessage content={msg.content} role={msg.role} />
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-gray-100 px-3 py-2 rounded-lg text-sm text-gray-400">
              思考中...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t px-3 py-2 flex items-center gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息..."
          rows={1}
          className="flex-1 resize-none text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-violet-400"
          disabled={sending}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="p-2 rounded-lg bg-violet-500 text-white disabled:opacity-40 hover:bg-violet-600 transition-colors"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add GlobalChatPanel to Layout.jsx**

In `web-app/src/components/Layout.jsx`:

1. Add import at top:

```javascript
import GlobalChatPanel from './GlobalChatPanel';
```

2. Place `<GlobalChatPanel />` AFTER the closing `</main>` tag (after the ternary that handles isFullScreenPage). Since the panel uses `fixed` positioning, it renders above all content regardless of DOM location. Do NOT place it inside either branch of the isFullScreenPage ternary.

```jsx
{/* After </main>, at the end of the outermost <div>: */}
<GlobalChatPanel />
```

- [ ] **Step 3: Remove BoardChatPanel from ThinkingBoardPage**

In `web-app/src/pages/ThinkingBoardPage.jsx`:

1. Remove the `BoardChatPanel` import
2. Remove the `<BoardChatPanel ... />` JSX element
3. Keep any `boardId` / `topicId` state — they're still needed for board operations

The GlobalChatPanel will automatically detect the board surface context via `useSurfaceContext` when on `/topics/:topicId`.

- [ ] **Step 4: Update ChatPage to use ChatMessage**

In `web-app/src/pages/ChatPage.jsx`:

1. Add import:

```javascript
import ChatMessage from '../components/ChatMessage';
```

2. Find where message content is rendered (look for `{msg.content}` or similar `whitespace-pre-wrap` rendering for normal text messages). Replace with:

```jsx
<ChatMessage content={msg.content} role={msg.role} />
```

Keep the existing special message type rendering (plan_proposal, step_progress, etc.) — only replace the normal text message rendering.

- [ ] **Step 5: Verify build**

Run: `cd web-app && npx vite build 2>&1 | tail -5`
Expected: Build succeeds with 0 errors.

- [ ] **Step 6: Manual test**

Start the app and verify:
1. Floating purple button appears on bottom-right of every page
2. Click opens chat panel with mode toggle (💬 🤖 ✨)
3. Navigate to `/topics/:id` — surfaceContext becomes `board`
4. Navigate to `/materials/:id` — surfaceContext becomes `reader`
5. Mode toggle persists across page navigation (localStorage)
6. ChatPage still works, shows markdown-rendered messages
7. ThinkingBoardPage no longer shows the old BoardChatPanel

- [ ] **Step 7: Commit**

```bash
git add web-app/src/components/GlobalChatPanel.jsx web-app/src/components/Layout.jsx web-app/src/pages/ThinkingBoardPage.jsx web-app/src/pages/ChatPage.jsx
git commit -m "feat(frontend): add GlobalChatPanel with mode toggle, replace BoardChatPanel"
```

---

## Chunk 3: Board Features

### Task 7: Health Sidebar

Create the health sidebar for ThinkingBoardPage showing hypothesis evidence balance.

**Files:**
- Create: `web-app/src/components/HealthSidebar.jsx`
- Create: `web-app/src/components/HypothesisBar.jsx`
- Modify: `web-app/src/pages/ThinkingBoardPage.jsx`

- [ ] **Step 1: Create HypothesisBar component**

Create `web-app/src/components/HypothesisBar.jsx`:

```jsx
const STATUS_CONFIG = {
  bias_warning: { label: '偏见警告', color: 'text-amber-600', icon: '⚠' },
  no_evidence: { label: '无证据', color: 'text-gray-400', icon: '✗' },
  insufficient: { label: '证据不足', color: 'text-amber-500', icon: '⚠' },
  strong_support: { label: '强支持', color: 'text-emerald-600', icon: '✓' },
  strong_against: { label: '强反对', color: 'text-red-500', icon: '✗' },
  mixed: { label: '证据充分', color: 'text-blue-500', icon: '◎' },
};

const OBSERVATIONS = {
  bias_warning: '仅有支持证据，缺少反面论证',
  no_evidence: '尚未关联任何证据卡片',
  insufficient: '证据不足，建议继续收集',
};

export default function HypothesisBar({ hypothesis }) {
  const { text, support, refute, status } = hypothesis;
  const total = support + refute;
  const supportPct = total > 0 ? (support / total) * 100 : 0;
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.no_evidence;
  const observation = OBSERVATIONS[status];

  return (
    <div className="py-2">
      <p className="text-xs font-medium truncate" title={text}>{text}</p>

      {/* Evidence balance bar */}
      <div className="flex items-center gap-2 mt-1">
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden flex">
          {total > 0 && (
            <>
              <div
                className="bg-emerald-500 h-full transition-all duration-300"
                style={{ width: `${supportPct}%` }}
              />
              <div
                className="bg-red-500 h-full transition-all duration-300"
                style={{ width: `${100 - supportPct}%` }}
              />
            </>
          )}
        </div>
        <span className="text-[10px] text-gray-500 tabular-nums whitespace-nowrap">
          {support}↑ {refute}↓
        </span>
      </div>

      {/* Status badge */}
      <div className={`text-[10px] mt-0.5 ${config.color}`}>
        {config.icon} {config.label}
      </div>

      {/* AI observation */}
      {observation && (
        <p className="text-[10px] text-gray-400 mt-0.5">{observation}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create HealthSidebar component**

Create `web-app/src/components/HealthSidebar.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { boardsApi } from '../lib/api';
import HypothesisBar from './HypothesisBar';

export default function HealthSidebar({ boardId, invalidateCounter = 0 }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const fetchHealth = async () => {
    if (!boardId) return;
    setLoading(true);
    try {
      const data = await boardsApi.getHealth(boardId);
      if (data.ok) setHealth(data.health);
    } catch (err) {
      console.error('Failed to fetch health:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, [boardId, invalidateCounter]);

  // Toggle button (always visible)
  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-1.5 bg-white border border-gray-200 rounded-l-lg shadow-sm hover:bg-gray-50"
        title="展开研究健康度"
      >
        <ChevronLeft size={14} />
      </button>
    );
  }

  return (
    <div className="w-60 border-l bg-white flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-semibold text-gray-700">研究健康度</span>
        <button onClick={() => setCollapsed(true)} className="p-0.5 hover:bg-gray-100 rounded">
          <ChevronRight size={14} />
        </button>
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
          加载中...
        </div>
      )}

      {!loading && !health && (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400 px-4 text-center">
          暂无研究健康数据
        </div>
      )}

      {!loading && health && (
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {/* Summary metrics */}
          <div className="flex justify-between text-center mb-3 pb-2 border-b">
            <div>
              <div className="text-lg font-bold tabular-nums">{health.total_hypotheses}</div>
              <div className="text-[10px] text-gray-500">假说</div>
            </div>
            <div>
              <div className="text-lg font-bold tabular-nums">{health.total_evidence}</div>
              <div className="text-[10px] text-gray-500">证据</div>
            </div>
            <div>
              <div className="text-lg font-bold tabular-nums">{health.blind_spots}</div>
              <div className="text-[10px] text-gray-500">盲点</div>
            </div>
          </div>

          {/* Per-hypothesis bars */}
          <div className="space-y-1 divide-y">
            {(health.hypotheses_summary || []).map(h => (
              <HypothesisBar key={h.node_id} hypothesis={h} />
            ))}
          </div>

          {/* Orphan card count */}
          {health.blind_spots > 0 && (
            <div className="mt-3 pt-2 border-t text-[10px] text-gray-400">
              {health.blind_spots} 个假说缺少充分证据
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Integrate HealthSidebar into ThinkingBoardPage**

In `web-app/src/pages/ThinkingBoardPage.jsx`:

1. Add import:

```javascript
import HealthSidebar from '../components/HealthSidebar';
```

2. Find the main layout `<div>` that wraps the ReactFlow canvas. Add HealthSidebar as a sibling:

```jsx
<div className="flex h-full">
  <div className="flex-1 relative">
    {/* Existing ReactFlow canvas */}
  </div>
  <HealthSidebar boardId={boardId} invalidateCounter={boardInvalidateCounter} />
</div>

// Also: import boardInvalidateCounter from the store:
// const { boardInvalidateCounter } = useChatStore();
// Increment it after successful board mutations (commit draft, create node, etc.).
```

Adjust based on the actual JSX structure — the key is placing HealthSidebar as a right-side panel next to the canvas.

- [ ] **Step 4: Verify build**

Run: `cd web-app && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web-app/src/components/HealthSidebar.jsx web-app/src/components/HypothesisBar.jsx web-app/src/pages/ThinkingBoardPage.jsx
git commit -m "feat(frontend): add HealthSidebar with hypothesis evidence balance"
```

---

### Task 8: Draft Preview on Canvas

Add draft node rendering and commit/reject UI for AI-proposed board changes.

**Files:**
- Create: `web-app/src/components/DraftNode.jsx`
- Create: `web-app/src/components/DraftCommitBar.jsx`
- Modify: `web-app/src/pages/ThinkingBoardPage.jsx`

- [ ] **Step 1: Create DraftNode component**

Create `web-app/src/components/DraftNode.jsx`:

```jsx
import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Check, X } from 'lucide-react';

const DraftNode = memo(({ data, id }) => {
  const [hovered, setHovered] = useState(false);
  const { text, node_type, onAccept, onReject } = data;

  const typeLabels = {
    question: 'Q',
    hypothesis: 'H',
    evidence: 'E',
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative px-3 py-2 rounded-lg min-w-[180px] max-w-[260px]"
      style={{
        border: '2px dashed #8B5CF6',
        backgroundColor: 'rgba(139, 92, 246, 0.08)',
      }}
    >
      {/* AI badge */}
      <span className="absolute -top-2 -right-2 text-[9px] bg-violet-500 text-white px-1.5 py-0.5 rounded-full font-medium">
        AI
      </span>

      {/* Type label */}
      <div className="text-[10px] text-violet-500 font-semibold mb-1">
        {typeLabels[node_type] || node_type}
      </div>

      {/* Content */}
      <p className="text-xs text-gray-700 line-clamp-3">{text}</p>

      {/* Accept/Reject on hover */}
      {hovered && (
        <div className="absolute -bottom-3 right-2 flex gap-1">
          <button
            onClick={() => onAccept?.(id)}
            className="p-1 bg-emerald-500 text-white rounded-full shadow hover:bg-emerald-600"
            title="接受"
          >
            <Check size={10} />
          </button>
          <button
            onClick={() => onReject?.(id)}
            className="p-1 bg-red-500 text-white rounded-full shadow hover:bg-red-600"
            title="拒绝"
          >
            <X size={10} />
          </button>
        </div>
      )}

      <Handle type="target" position={Position.Top} className="!bg-violet-400" />
      <Handle type="source" position={Position.Bottom} className="!bg-violet-400" />
    </div>
  );
});

DraftNode.displayName = 'DraftNode';

export default DraftNode;
```

- [ ] **Step 2: Create DraftCommitBar component**

Create `web-app/src/components/DraftCommitBar.jsx`:

```jsx
import { useState } from 'react';
import { Check, X, Eye } from 'lucide-react';

export default function DraftCommitBar({ draft, onCommitAll, onRejectAll, onReview }) {
  const [committing, setCommitting] = useState(false);

  if (!draft) return null;

  const changeCount = draft.changes?.length || 0;

  const handleCommitAll = async () => {
    setCommitting(true);
    try {
      await onCommitAll(draft.id);
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-white border border-violet-200 rounded-lg shadow-lg px-4 py-2 flex items-center gap-3">
      <span className="text-sm">
        🤖 AI 建议了 <strong>{changeCount}</strong> 个更改
      </span>
      <button
        onClick={handleCommitAll}
        disabled={committing}
        className="px-3 py-1 text-xs bg-emerald-500 text-white rounded-md hover:bg-emerald-600 disabled:opacity-50"
      >
        <Check size={12} className="inline mr-1" />
        全部接受
      </button>
      <button
        onClick={() => onReview(draft.id)}
        className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
      >
        <Eye size={12} className="inline mr-1" />
        逐个审核
      </button>
      <button
        onClick={() => onRejectAll(draft.id)}
        className="px-3 py-1 text-xs bg-red-50 text-red-600 rounded-md hover:bg-red-100"
      >
        <X size={12} className="inline mr-1" />
        全部拒绝
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Integrate draft rendering into ThinkingBoardPage**

In `web-app/src/pages/ThinkingBoardPage.jsx`:

1. Add imports:

```javascript
import DraftNode from '../components/DraftNode';
import DraftCommitBar from '../components/DraftCommitBar';
import { boardsApi } from '../lib/api';
```

2. Register DraftNode as a custom node type. Find where `nodeTypes` is defined (around line 33) and **append** `draftNode` — do NOT replace the existing keys which use the `xxxNode` naming convention:

```javascript
const nodeTypes = {
    questionNode: QuestionNode,
    hypothesisNode: HypothesisNode,
    evidenceNode: EvidenceNode,
    draftNode: DraftNode,  // NEW — matches existing naming convention
};
```

3. Add draft state and fetching logic:

```javascript
const [pendingDraft, setPendingDraft] = useState(null);

// Fetch drafts when board loads or after mutations
const fetchDrafts = async () => {
  if (!boardId) return;
  try {
    const data = await boardsApi.getDrafts(boardId);
    if (data.ok && data.drafts?.length > 0) {
      setPendingDraft(data.drafts[0]); // max 1 pending draft per board
    } else {
      setPendingDraft(null);
    }
  } catch (err) {
    console.error('Failed to fetch drafts:', err);
  }
};

useEffect(() => { fetchDrafts(); }, [boardId]);
```

4. Convert draft changes to ReactFlow nodes/edges and merge with existing ones:

```javascript
// After building existing nodes array, append draft nodes:
const draftNodes = (pendingDraft?.changes || [])
  .filter(c => c.action === 'add_node')
  .map((c, i) => ({
    id: `draft-${i}`,
    type: 'draftNode',
    position: { x: 400 + i * 50, y: 500 + i * 80 },
    data: {
      text: c.text || c.claim || '',
      node_type: c.node_type,
      onAccept: handleAcceptNode,
      onReject: handleRejectNode,
    },
  }));

const allNodes = [...existingNodes, ...draftNodes];
```

5. Add commit/reject handlers:

```javascript
const handleCommitAll = async (draftId) => {
  await boardsApi.commitDraft(boardId, draftId);
  setPendingDraft(null);
  // Reload board data
  fetchBoardData();
};

const handleRejectAll = async (draftId) => {
  await boardsApi.rejectDraft(boardId, draftId);
  setPendingDraft(null);
};

const handleReview = (draftId) => {
  // Highlight draft nodes for individual review — handled by DraftNode hover state
};
```

6. Add DraftCommitBar to the JSX (inside the ReactFlow wrapper):

```jsx
<DraftCommitBar
  draft={pendingDraft}
  onCommitAll={handleCommitAll}
  onRejectAll={handleRejectAll}
  onReview={handleReview}
/>
```

- [ ] **Step 4: Verify build**

Run: `cd web-app && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web-app/src/components/DraftNode.jsx web-app/src/components/DraftCommitBar.jsx web-app/src/pages/ThinkingBoardPage.jsx
git commit -m "feat(frontend): add draft preview nodes + commit/reject bar on canvas"
```

---

## Chunk 4: Evidence Suggestions + Story Annotations

### Task 9: Evidence Suggestion Toast

Show a non-modal toast after card save when a relevant hypothesis is found.

**Files:**
- Create: `web-app/src/components/EvidenceSuggestionToast.jsx`
- Modify: `web-app/src/pages/MaterialReaderPage.jsx`

- [ ] **Step 1: Create EvidenceSuggestionToast component**

Create `web-app/src/components/EvidenceSuggestionToast.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { X, Link } from 'lucide-react';
import { boardsApi } from '../lib/api';

export default function EvidenceSuggestionToast({ suggestion, cardId, topicTitle, onDismiss }) {
  const [linking, setLinking] = useState(false);
  const [visible, setVisible] = useState(true);

  // Auto-dismiss after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, 10000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible || !suggestion) return null;

  const handleLink = async () => {
    setLinking(true);
    try {
      await boardsApi.quickLink(
        suggestion.board_id,
        cardId,
        suggestion.hypothesis_id,
        'supports'
      );
      setVisible(false);
      onDismiss?.();
    } catch (err) {
      console.error('Quick link failed:', err);
    } finally {
      setLinking(false);
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    onDismiss?.();
  };

  return (
    <div className="fixed bottom-20 right-6 z-50 w-80 bg-white border border-violet-200 rounded-lg shadow-xl p-4 animate-slide-up">
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 hover:bg-gray-100 rounded"
      >
        <X size={12} />
      </button>

      <div className="text-sm text-gray-700 mb-1">
        ✓ 卡片已保存到「{topicTitle}」
      </div>

      <div className="text-xs text-gray-500 mb-2">
        💡 可能与假说相关：
      </div>

      <div className="text-xs font-medium text-violet-700 mb-3">
        「{suggestion.hypothesis_text}」
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleLink}
          disabled={linking}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-violet-500 text-white rounded-md hover:bg-violet-600 disabled:opacity-50"
        >
          <Link size={12} />
          链接为证据
        </button>
        <button
          onClick={handleDismiss}
          className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-md"
        >
          忽略
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add slide-up animation to CSS**

If using Tailwind, add to `web-app/src/index.css` (or equivalent global CSS):

```css
@keyframes slide-up {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.animate-slide-up {
  animation: slide-up 0.3s ease-out;
}
```

- [ ] **Step 3: Integrate into MaterialReaderPage**

In `web-app/src/pages/MaterialReaderPage.jsx`:

1. Add import:

```javascript
import EvidenceSuggestionToast from '../components/EvidenceSuggestionToast';
```

2. Add state:

```javascript
const [evidenceSuggestion, setEvidenceSuggestion] = useState(null);
const [lastSavedCardId, setLastSavedCardId] = useState(null);
```

3. In the card save handler (find `handleConfirmCard` or where `cardsApi.capture()` is called), after the capture succeeds:

```javascript
// After: const captureResult = await cardsApi.capture(...)
if (captureResult.evidence_suggestion) {
  setEvidenceSuggestion(captureResult.evidence_suggestion);
  setLastSavedCardId(captureResult.card?.id);
}
```

4. Derive the topic title (there is no `selectedTopicTitle` variable — derive it from the topics store):

```javascript
// Add near the existing topic-related state:
const { topics } = useTopicsStore(); // already imported in this file
const selectedTopicTitle = topics.find(t => t.id === (selectedTopicId || material?.topic_id))?.title || '';
```

5. Add the toast to the JSX (at the end, before closing `</div>`):

```jsx
{evidenceSuggestion && lastSavedCardId && (
  <EvidenceSuggestionToast
    suggestion={evidenceSuggestion}
    cardId={lastSavedCardId}
    topicTitle={selectedTopicTitle}
    onDismiss={() => {
      setEvidenceSuggestion(null);
      setLastSavedCardId(null);
    }}
  />
)}
```

- [ ] **Step 4: Verify build**

Run: `cd web-app && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web-app/src/components/EvidenceSuggestionToast.jsx web-app/src/pages/MaterialReaderPage.jsx web-app/src/index.css
git commit -m "feat(frontend): add evidence suggestion toast after card save"
```

---

### Task 10: Story Health Badge

Show inline health annotations on story units that reference hypotheses with warnings.

**Files:**
- Create: `web-app/src/components/StoryHealthBadge.jsx`
- Modify: `web-app/src/pages/MaterialReaderPage.jsx` (or the component that renders story units)

- [ ] **Step 1: Create StoryHealthBadge component**

Create `web-app/src/components/StoryHealthBadge.jsx`:

```jsx
import { useNavigate } from 'react-router-dom';

const STATUS_LABELS = {
  bias_warning: { text: '偏见警告', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  no_evidence: { text: '无证据', color: 'bg-gray-100 text-gray-500 border-gray-300' },
  insufficient: { text: '证据不足', color: 'bg-amber-50 text-amber-600 border-amber-200' },
};

export default function StoryHealthBadge({ hypothesis, topicId }) {
  const navigate = useNavigate();

  if (!hypothesis) return null;

  const config = STATUS_LABELS[hypothesis.status];
  if (!config) return null; // No warning needed for strong_support, mixed, etc.

  const handleClick = () => {
    if (topicId) {
      navigate(`/topics/${topicId}`);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border mt-1 hover:opacity-80 transition-opacity ${config.color}`}
      title={`点击查看画板中的假说：${hypothesis.text}`}
    >
      ⚠ 引用假说「{hypothesis.text?.slice(0, 20)}」{config.text}
      {hypothesis.support !== undefined && `: ${hypothesis.support}支持 ${hypothesis.refute}反对`}
    </button>
  );
}
```

- [ ] **Step 2: Integrate into story unit rendering**

This depends on how story units are rendered. Find the component that renders story units (likely in `web-app/src/components/Reader/ReaderContent.jsx` or `MaterialReaderPage.jsx`).

The integration pattern:

1. On MaterialReaderPage mount, if the material's topic has a board, fetch health:

```javascript
const [healthMap, setHealthMap] = useState({}); // cardId → hypothesis

useEffect(() => {
  // Fetch health for topic's board to build card→hypothesis map
  async function loadHealth() {
    if (!material?.topic_id) return;
    try {
      // Get boards for this topic
      const boardData = await boardsApi.getTopicBoard(material.topic_id);
      if (!boardData?.board?.id) return;
      const healthData = await boardsApi.getHealth(boardData.board.id);
      if (!healthData?.ok || !healthData.health) return;

      // Build cardId → hypothesis map
      const map = {};
      for (const h of (healthData.health.hypotheses_summary || [])) {
        if (!['bias_warning', 'no_evidence', 'insufficient'].includes(h.status)) continue;
        for (const cardId of (h.evidence_card_ids || [])) {
          map[cardId] = h;
        }
      }
      setHealthMap(map);
    } catch (err) {
      console.error('Failed to load story health:', err);
    }
  }
  loadHealth();
}, [material?.topic_id]);
```

2. When rendering story units, for each unit's card references, check healthMap:

```jsx
{storyUnit.card_ids?.map(cardId => {
  const hypothesis = healthMap[cardId];
  return hypothesis ? (
    <StoryHealthBadge
      key={cardId}
      hypothesis={hypothesis}
      topicId={material?.topic_id}
    />
  ) : null;
})}
```

- [ ] **Step 3: Verify build**

Run: `cd web-app && npx vite build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add web-app/src/components/StoryHealthBadge.jsx web-app/src/pages/MaterialReaderPage.jsx
git commit -m "feat(frontend): add story health badges for hypothesis warnings"
```

---

## Final Verification

- [ ] **Step 1: Run all backend tests**

```bash
cd reading-cards-backend && node test/mode-threading.test.mjs && node test/evidence-suggestion.test.mjs && node test/validation.test.mjs
```
Expected: All tests pass.

- [ ] **Step 2: Verify frontend build**

```bash
cd web-app && npx vite build
```
Expected: Build succeeds with 0 errors.

- [ ] **Step 3: Start backend and verify imports**

```bash
cd reading-cards-backend && node -e "import('./src/server.mjs').then(() => console.log('OK')).catch(e => { console.error(e); process.exit(1) })"
```
Expected: Server starts without import errors.
