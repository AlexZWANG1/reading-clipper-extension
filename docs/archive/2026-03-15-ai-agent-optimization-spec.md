# Verity AI Agent Backend Optimization: Complete Specification

> **Date**: 2026-03-15
> **Status**: Draft
> **Scope**: Backend AI agent system — bug fixes, context management, prompt engineering, tool system, plan system, AI client resilience
> **Depends on**: `2026-03-14-ai-agent-redesign-spec.md` (current architecture this optimizes)
> **Blocks**: `docs/RESEARCH-RUN-SPEC.md` (Research Run feature depends on a reliable agent layer)
> **Reference**: `C:\Users\Admin\.claude\plans\optimized-wondering-penguin.md` (deep analysis document)

---

## 1. Executive Summary

### What this is

A systematic optimization of the existing AI agent backend, organized into 5 priority tiers across 4 architectural layers. The current architecture is fundamentally sound (modular prompt assembly, 4-layer tool safety, plan-based execution), but has critical bugs, context management gaps, and prompt engineering deficiencies that must be fixed before production scale.

### What this is NOT

- Not a rewrite. The existing module structure (orchestrator, promptBuilder, tools, toolGroups, toolExecutor, planner, executor) is preserved.
- Not adding new features. This is about making existing features reliable.

### Approach

**Layer-by-layer optimization (方案 B)**:

| Layer | Files | Core Issues |
|-------|-------|-------------|
| P0: Bug & Security Fixes | conversations.mjs, orchestrator.mjs, toolExecutor.mjs, aiClient.mjs | 4 critical items |
| Context Layer | orchestrator.mjs, new `contextBudget.mjs`, models.config.json | Token budget, tool history, compression, summaries |
| Prompt Layer | promptBuilder.mjs, tools.mjs | XML structure, few-shot, tool descriptions |
| Tool + Plan Layer | toolGroups.mjs, tools.mjs, toolExecutor.mjs, planner.mjs, executor.mjs, orchestrator.mjs | Plan trigger, planner context, executor efficiency |
| AI Client Layer | aiClient.mjs, aiRuntime.mjs | Anthropic tool_calls, timeouts, token tracking |

### Issue Count

- **P0 (BUG/Security)**: 4 items — must fix before any other work
- **P1 (Architecture)**: 9 items — high priority
- **P2 (Medium)**: 21 items — important improvements
- **P3 (Low)**: 7 items — nice to have

---

## 2. P0 — BUG & Security Fixes

These 4 items must be fixed first. Each is independent and can be done in parallel.

### P0-1: `listMessages` Returns Oldest Messages Instead of Newest

**File**: `services/supabase/conversations.mjs:100-106`

**Bug**: `.order("created_at", { ascending: true }).limit(50)` fetches the OLDEST 50 messages. When a conversation has >50 messages, the most recent messages (including what the user just said before this turn) are silently dropped.

**Fix**:
```js
// Before (BUG):
.order("created_at", { ascending: true })
.limit(limit);

// After:
.order("created_at", { ascending: false })
.limit(limit);
```

The caller does NOT reverse — messages stay in newest-first order. The new `buildHistoryWithinBudget()` (§3.1) expects newest-first input and handles chronological reordering internally.

**Validation**: Write a test with >50 messages; verify the newest messages are returned.

---

### P0-2: write + draft Mixed Tool Calls Bypass Confirmation Gate

**File**: `chat/orchestrator.mjs:119`

**Bug**: The condition `if (hasWriteTools && !hasDraftTools)` means if AI calls both a `write` tool (e.g. `create_card`) and a `draft` tool (e.g. `propose_board_changes`) in the same turn, `hasDraftTools` is true, so the entire block is skipped — the write tool auto-executes without user confirmation.

**Fix**: Process tool calls by splitting them into groups based on side_effect:

```js
// Replace the single hasWriteTools/hasDraftTools check with:
const writeToolCalls = toolCalls.filter(tc => {
  const effect = getToolSideEffect(tc.function.name);
  return effect === 'write' || effect === 'destructive';
});
const autoToolCalls = toolCalls.filter(tc => {
  const effect = getToolSideEffect(tc.function.name);
  return effect === 'read_only' || effect === 'draft';
});

// Auto-execute read_only + draft tools immediately
if (autoToolCalls.length > 0) {
  const autoResults = await executeAllTools(autoToolCalls, ctx);
  currentMessages.push(/* assistant msg with only autoToolCalls */);
  currentMessages.push(...autoResults);
  // Log auto tool calls...
}

// If write tools exist, pause for confirmation
if (writeToolCalls.length > 0) {
  const pending = writeToolCalls.map(tc => {
    let parsedArgs = {};
    try { parsedArgs = JSON.parse(tc.function.arguments || '{}'); } catch {}
    return {
      id: tc.id,
      name: tc.function.name,
      args: parsedArgs,
      side_effect: getToolSideEffect(tc.function.name),
      confirm_message: buildConfirmMessage(tc.function.name, parsedArgs),
    };
  });
  return {
    reply: '',
    messages: currentMessages,
    pendingActions: pending,
    pendingToolCalls: writeToolCalls,
    toolCallLog,
    draftId,
  };
}
```

**Side benefit**: This also fixes P3-37 (read_only tools no longer blocked waiting for write confirmation).

---

### P0-3: Data Access Without User ID Filtering

**File**: `chat/toolExecutor.mjs:67-70, 111-115, 125-129`

**Bug**: `findCardById`, `getFullBoard`, `getDocument` query by ID only, using `supabaseAdmin` which bypasses RLS. An AI-guessed UUID could access another user's data.

**Fix**: Add `userId` filtering to each query:

```js
// get_card
case "get_card": {
  const card = await findCardById(supabase, args.card_id, userId);
  // findCardById implementation adds: .eq('user_id', userId)
}

// get_board
case "get_board": {
  const board = await getFullBoard(supabase, args.board_id, userId);
  // getFullBoard implementation adds: .eq('user_id', userId) on the board query
}

// get_document
case "get_document": {
  const doc = await getDocument(supabase, args.doc_id, userId);
  // getDocument implementation adds: .eq('user_id', userId)
}
```

Alternatively, pass the user-scoped supabase client (with RLS) instead of `supabaseAdmin` for these read operations.

---

### P0-4: API Key "Encryption" is Base64 Encoding

**File**: `services/aiClient.mjs:80-88`

**Bug**: `decryptApiKey()` uses `Buffer.from(encryptedKey, 'base64')` — this is encoding, not encryption. User API keys are stored in plaintext-equivalent form.

**Fix**: Implement AES-256-GCM symmetric encryption:

```js
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_SECRET; // 32 bytes hex

function encryptApiKey(plainKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(plainKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

function decryptApiKey(encryptedKey) {
  if (!encryptedKey || !ENCRYPTION_KEY) return null;
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

**Migration**: Keep the base64 fallback so existing keys still work. New keys use AES-256-GCM. Add `API_KEY_ENCRYPTION_SECRET` to `.env.example`.

---

## 3. Context Layer Optimization

### 3.1 New Module: `chat/contextBudget.mjs`

A new module responsible for token estimation and context window budget management.

#### Token Estimation

```js
/**
 * Estimate token count for a string.
 * More accurate than the current maxTokens * 4 approach.
 * Chinese: ~0.7 tokens per character
 * English: ~1.3 tokens per word (~0.25 per character)
 */
export function estimateTokens(text) {
  if (!text) return 0;
  let tokens = 0;
  for (const char of text) {
    tokens += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(char) ? 0.7 : 0.25;
  }
  return Math.ceil(tokens);
}
```

#### Context Budget Allocation

```js
/**
 * Calculate how many tokens are available for conversation history.
 *
 * @param {number} contextWindow - Model's total context window
 * @param {number} systemPromptTokens - Actual system prompt token count
 * @param {number} toolDefinitionTokens - Token count of scoped tool definitions JSON
 * @returns {{ historyBudget: number, toolLoopReserve: number }}
 */
export function calculateBudget(contextWindow, systemPromptTokens, toolDefinitionTokens) {
  const toolLoopReserve = Math.floor(contextWindow * 0.25); // Reserve for tool rounds
  const outputReserve = 4096; // Reserve for AI response
  const historyBudget = contextWindow - systemPromptTokens - toolDefinitionTokens - toolLoopReserve - outputReserve;
  return {
    historyBudget: Math.max(historyBudget, 2000), // Minimum 2000 tokens
    toolLoopReserve,
  };
}
```

#### Sliding Window History Builder

```js
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

  // Reserve space for summary if it exists
  if (conversationSummary) {
    const summaryTokens = estimateTokens(conversationSummary);
    remaining -= summaryTokens;
  }

  // Select messages from newest to oldest
  for (const msg of messages) {
    const msgTokens = estimateTokens(msg.content);
    if (remaining - msgTokens < 0) break;
    selected.unshift(msg); // Prepend to maintain chronological order
    remaining -= msgTokens;
  }

  // Prepend summary as first message if exists
  if (conversationSummary) {
    selected.unshift({
      role: 'system',
      content: `<conversation_summary>\n${conversationSummary}\n</conversation_summary>`,
    });
  }

  return selected;
}
```

### 3.2 `models.config.json` — Add `context_window`

```json
{
  "providers": {
    "openai": {
      "default_model": "gpt-5.2",
      "models": [
        { "id": "gpt-5.2", "context_window": 200000, "supports_vision": true },
        { "id": "gpt-5.2-pro", "context_window": 200000, "supports_vision": true },
        { "id": "gpt-5-nano", "context_window": 32000, "supports_vision": false }
      ]
    },
    "anthropic": {
      "default_model": "claude-sonnet-4-6",
      "models": [
        { "id": "claude-sonnet-4-6", "context_window": 200000, "supports_vision": true },
        { "id": "claude-opus-4-6", "context_window": 200000, "supports_vision": true }
      ]
    },
    "custom": {
      "default_model": "*",
      "models": [
        { "id": "*", "context_window": 128000, "supports_vision": false }
      ]
    }
  }
}
```

`createAIClientConfig()` returns `contextWindow` from this config.

### 3.3 Tool Call History Preservation

**File**: `chat/orchestrator.mjs:474-477`

**Current**: Filters out `tool_calls` message type — AI loses all tool memory across turns.

**Fix**: Include tool_calls messages, but with tiered detail:

```js
// In chatWithConversation(), replace the filter with:
const messages = history
  .filter(m => m.role === 'user' || m.role === 'assistant')
  .map(m => {
    // For tool_calls messages, include a compressed summary
    if (m.message_type === 'tool_calls' && m.metadata?.tool_calls) {
      return {
        role: m.role,
        content: m.metadata.tool_calls
          .map(tc => `[Tool: ${tc.tool}(${summarizeArgs(tc.args)}) → ${tc.result_summary}]`)
          .join('\n'),
      };
    }
    // All other message types: pass through as text
    return { role: m.role, content: m.content };
  });

function summarizeArgs(args) {
  if (!args) return '';
  const entries = Object.entries(args);
  if (entries.length === 0) return '';
  return entries
    .slice(0, 3) // Max 3 key params
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v.slice(0, 30) : JSON.stringify(v).slice(0, 30)}`)
    .join(', ');
}
```

**Result**: AI sees something like:
```
[Tool: semantic_search(query=AI芯片) → 找到 5 条相关内容]
[Tool: search_cards(query=AI芯片) → 找到 3 张相关卡片]
```

This is compact enough to fit in context but informative enough for AI to avoid repeating queries.

### 3.4 Tool Result Compression

**File**: `chat/orchestrator.mjs:340-353`

**Current**: Tool results passed to AI as raw `JSON.stringify(result)`.

**Fix**: Add compression before passing to AI context:

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

// In executeAllTools, compress before returning to AI:
const rawResult = await executeTool(tc.function.name, args, ctx);
const compressed = compressToolResult(tc.function.name, rawResult);
return { role: 'tool', tool_call_id: tc.id, content: JSON.stringify(compressed) };
```

### 3.5 Conversation Summary

**Trigger**: When conversation has >20 text messages and no recent summary (or summary is >10 messages old).

**Generation**: Async, after persisting the AI reply (non-blocking):

```js
// In chatWithConversation(), after persisting reply:
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

**Summary prompt**:
```
根据以下对话历史，生成一段简洁的上下文摘要（3-5句话）。
包含：讨论了什么主题、做了哪些关键操作（调用了什么工具、创建了什么数据）、
当前研究状态、用户可能的下一步意图。
```

**Implementation**:

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

**Storage**: `message_type: "conversation_summary"` in the conversation.

**DB Migration Required**: Add `'conversation_summary'` to the `chat_messages.message_type` CHECK constraint (see §9.1).

**Loading**: Summary is always included at the top of history (within the `buildHistoryWithinBudget` function).

### 3.6 Orchestrator Integration

The `chat()` function changes to use the new context budget system:

```js
export async function chat({ messages, userId, supabase, ... }) {
  const aiConfig = await createAIClientConfig(userId, supabase);

  // ... build system prompt ...

  const systemPromptTokens = estimateTokens(systemPrompt);
  const toolDefTokens = estimateTokens(JSON.stringify(scopedTools));
  const { historyBudget } = calculateBudget(
    aiConfig.contextWindow, systemPromptTokens, toolDefTokens
  );

  // messages are newest-first from DB (P0-1 fix); buildHistoryWithinBudget
  // iterates from newest, selects within budget, returns chronological order
  const budgetedMessages = buildHistoryWithinBudget(messages, historyBudget, conversationSummary);

  const fullMessages = [{ role: 'system', content: systemPrompt }, ...budgetedMessages];
  // ... continue with tool loop ...
}
```

---

## 4. Prompt Layer Optimization

### 4.1 XML-Structured System Prompt

**File**: `chat/promptBuilder.mjs` — full rewrite of `buildSystemPrompt()`

Replace all Markdown-based constants with XML-tagged sections. New prompt assembly order follows Anthropic best practices (long data near top, instructions in middle, prohibitions at end):

```js
export function buildSystemPrompt({ surfaceContext, methodology, researchState, toolGroup, mode }) {
  const parts = [];

  // ① Role definition with capability boundaries
  parts.push(`<role>
你是 Verity（求真）的研究助手——一个证据驱动的研究工作台。

你的职责范围：
- 搜索和查阅知识库中的卡片、文档、材料
- 在思维画板上结构化研究问题、假说和证据
- 从外部来源摄入内容到知识库
- 为复杂的多步骤研究任务制定执行计划

你不做的事：
- 通用问答（天气、编程、闲聊等无关研究的话题）
- 代替用户做判断——你提供数据和分析，用户做决定

回复规则：使用与用户相同的语言。简洁有用。展示数据时用标题而非 UUID。始终先调用工具获取真实数据，再回答问题。
</role>`);

  // ② Long data content near top (Anthropic: improves quality ~30%)
  if (methodology?.document) {
    const doc = truncateToTokens(methodology.document, 400);
    parts.push(`<user_methodology>
${doc}
请按照上述方法论指导你的分析和建议。
</user_methodology>`);
  }

  if (researchState && researchState.total_hypotheses > 0) {
    parts.push(`<current_research_state>
${formatResearchStateForPrompt(researchState)}
</current_research_state>`);
  }

  if (surfaceContext) {
    const surfaceDesc = describeSurface(surfaceContext);
    if (surfaceDesc) parts.push(`<current_context>\n${surfaceDesc}\n</current_context>`);
  }

  // ③ Data model (structured knowledge)
  parts.push(`<data_model>
- Topics — 顶层研究类别，包含 Cards 和至多一个 Thinking Board
- Cards — 原子知识单元：summary, key_points[], fact_or_view（事实/观点）, 来源归属
- Thinking Boards — 可视化推理画布，节点树结构：
  question → hypothesis（通过 parent_id）→ evidence（通过 parent_id，通过 card_id 链接卡片）
  Edges 表达关系：supports / refutes / neutral
- Materials — 已摄入的文档，带向量嵌入用于语义搜索
- Documents — 故事构建文档，含问题和假说
- Sources — 用户追踪的信息来源
</data_model>`);

  // ④ Rules and constraints
  parts.push(`<hard_rules>
- Evidence 节点必须有 parent_id 指向 hypothesis 节点
- Hypothesis 节点必须有 parent_id 指向 question 节点
- Edge 的 relation_type 必须是 supports、refutes 或 neutral
- Evidence 节点应有 card_id 链接到来源卡片
- 工具调用被拒绝时，阅读错误信息并自我修正
</hard_rules>`);

  // ⑤ Tool usage guide
  parts.push(`<tool_usage_guide>
工具选择指引：
- 用户提问需要查找信息时 → 优先用 semantic_search（搜索完整文档内容），也可同时用 search_cards（搜索已提取的卡片摘要）
- 只查找已有的知识卡片 → search_cards
- 不确定用哪个 → 两个都调，并行执行
- 用户只是闲聊或问你的能力 → 不需要调工具

收到工具结果后，审视结果质量，决定是否需要进一步查询再回复用户。

如果你需要同时调用多个无依赖的工具，在一次回复中并行调用它们，减少轮次浪费。
</tool_usage_guide>`);

  // ⑥ Available actions (tool group specific)
  const groupInstructions = TOOL_GROUP_INSTRUCTIONS[toolGroup] || TOOL_GROUP_INSTRUCTIONS.explore;
  parts.push(`<available_actions>\n${groupInstructions}\n</available_actions>`);

  // ⑦ Mode instruction
  const modeInstruction = MODE_INSTRUCTIONS[mode] || '';
  if (modeInstruction) parts.push(modeInstruction);

  // ⑧ Few-shot examples
  parts.push(FEW_SHOT_EXAMPLES);

  // ⑨ Absolute prohibitions — ALWAYS last (recency bias)
  parts.push(`<absolute_prohibitions>
- 绝不在用户没有明确要求时创建、修改或删除任何数据
- 绝不编造数据——必须调用工具获取真实数据
- 绝不用 create_card 存储你自己的分析或总结。卡片是证据——只从用户明确要求提取的源材料（文章、论文、文档）创建卡片。你的分析和回答属于文字回复，不属于卡片
- 绝不主动创建卡片、节点或边作为"附带"操作
- 不确定用户是否想创建数据时，先问
- 回复中不展示内部 ID（UUID），用标题或内容引用数据
</absolute_prohibitions>`);

  return parts.join('\n\n');
}
```

### 4.2 Few-Shot Examples

```js
const FEW_SHOT_EXAMPLES = `<examples>

<example name="正确的工具选择：信息查询">
<user>帮我看看关于量子计算有什么相关资料</user>
<ideal_behavior>
并行调用 semantic_search(query="量子计算") 和 search_cards(query="量子计算")。
根据两个工具的返回结果，综合整理后以文字回答用户，不创建任何数据。
</ideal_behavior>
</example>

<example name="不该创建卡片：用户要的是分析">
<user>帮我总结一下目前 AI 芯片的研究进展</user>
<ideal_behavior>
调用 semantic_search 和/或 search_cards 查找相关数据。
用文字回复总结，不调用 create_card。用户要的是你的分析回复，不是存储操作。
只有用户明确说"保存""创建卡片""提取要点并存下来"时才创建卡片。
</ideal_behavior>
</example>

<example name="复杂任务：触发执行计划">
<user>帮我从 TechCrunch 和 ArXiv 追踪 AI 芯片最新进展，筛选和英伟达相关的，做成知识卡片</user>
<ideal_behavior>
识别为多步骤任务（RSS 抓取 + 筛选 + 卡片创建 ≥ 4 步）。
调用 request_plan(intent="从 TechCrunch 和 ArXiv 追踪 AI 芯片进展，筛选英伟达相关内容，生成知识卡片")。
不要自己尝试逐步执行。
</ideal_behavior>
</example>

</examples>`;
```

### 4.3 Updated `TOOL_GROUP_INSTRUCTIONS`

```js
const TOOL_GROUP_INSTRUCTIONS = {
  explore: `你有只读工具。搜索和列出数据来回答问题。你不能创建或修改任何内容。如果用户要求创建数据，描述你会创建什么并请用户确认。`,

  board: `你可以读取画板状态并提议批量更改。
- 新建节点和边 → 使用 propose_board_changes（创建可视化草稿供用户在画板上审批）
- 修改已有节点的状态、文本、置信度 → 使用 update_board_node
- 删除已有节点 → 使用 delete_board_node
你也可以搜索卡片来链接为证据。`,

  cards: `你可以创建卡片和搜索已有卡片。创建卡片前先和用户确认主题。你也可以搜索知识库提供上下文。`,

  ingest: `你可以摄入 URL 和抓取 RSS feed 到知识库。摄入前先和用户确认 URL/feed。你可以搜索已有内容检查重复。`,

  full: `你有所有工具。这是计划执行模式——按照计划步骤精确执行。`,
};
```

### 4.4 Updated `MODE_INSTRUCTIONS`

```js
const MODE_INSTRUCTIONS = {
  chat: `<mode>当前模式：聊天模式。你只能查询和搜索数据来回答问题，不能创建、修改或删除任何内容。如果用户要求写操作，告诉他们切换到代理模式。</mode>`,
  agent: `<mode>当前模式：代理模式。你可以执行操作，但写操作需要用户确认。</mode>`,
  auto: '',
};
```

### 4.5 Updated `describeSurface()` — Remove UUID Exposure

```js
function describeSurface(ctx) {
  if (!ctx?.surface || ctx.surface === 'general') return null;
  switch (ctx.surface) {
    case 'board':
      return '用户正在查看思维画板。优先使用 board 相关工具帮助用户分析和操作画板内容。';
    case 'reader':
      return '用户正在阅读器中阅读材料。优先帮助用户理解内容、回答关于材料的问题。';
    case 'cards':
      return '用户正在卡片页面，浏览和管理知识卡片。';
    default:
      return null;
  }
}
```

IDs are passed implicitly through tool group inference and tool parameters, not exposed in prompt text.

### 4.6 Fixed `truncateToTokens()`

Replace the `maxTokens * 4` approximation:

```js
function truncateToTokens(text, maxTokens) {
  if (!text) return '';
  let tokenCount = 0;
  for (let i = 0; i < text.length; i++) {
    tokenCount += /[\u4e00-\u9fff]/.test(text[i]) ? 0.7 : 0.25;
    if (tokenCount >= maxTokens) {
      return text.slice(0, i) + '\n...(已截断)';
    }
  }
  return text;
}
```

---

## 5. Tool Layer Optimization

### 5.1 New Tool: `request_plan`

**File**: `chat/tools.mjs` — add to TOOL_DEFINITIONS:

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

**File**: `chat/toolExecutor.mjs` — add handler:

```js
case "request_plan": {
  return { plan_requested: true, intent: args.intent };
}
```

**File**: `chat/orchestrator.mjs` — detect plan request from tool result:

```js
// In the tool loop, after executing tools:
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

**Remove**: `PLAN_DETECTION` constant from `promptBuilder.mjs`, `extractPlanRequest()` from `orchestrator.mjs`, `classifyIntent()` from `planner.mjs`.

**Add to tool groups**: `request_plan` goes into `explore`, `board`, `cards`, `ingest` groups (all groups except `full`).

### 5.2 Tool Description Improvements

Add return value descriptions and usage boundaries to each tool's `description` field. Key changes:

```js
// semantic_search
description: "语义搜索用户已摄入的文档内容（基于向量相似度）。用于查找文档中的具体信息。返回: {results: [{chunk_text, score, source_title, material_id}], total: number}"

// search_cards
description: "按关键词搜索用户的知识卡片。搜索范围是已提取的卡片摘要，不是原始文档。返回: {cards: [{id, title, summary, topic_id}], count: number}"

// create_card
description: "从源材料（文章、论文、文档）中提取并保存知识卡片。仅在用户明确要求提取、保存或创建卡片时使用。不要用此工具存储你自己的分析、总结或回答——那些属于你的文字回复。返回: {card: {id, title, summary}, message: string}"

// propose_board_changes — add required fields note to description:
description: "...changes 数组中每项：create_node 必须提供 action, node_type, text（hypothesis/evidence 还必须提供 parent_id）；create_edge 必须提供 action, source_node_id, target_node_id, relation_type。返回: {draft_id, changes_count, message}"
```

### 5.3 Tool Group Fixes

**File**: `chat/toolGroups.mjs`

**Fix ingest keyword pattern** (P2-14):
```js
{
  group: 'ingest',
  pattern: /摄入|ingest|导入.*(?:url|链接|文章)|import.*(?:url|article)|订阅|subscri|rss|feed/i,
}
```

**Fix reader surface default** (P2-15):
```js
if (surfaceContext?.surface === 'reader') {
  const wantsCreate = /创建|保存|提取|制作|create|save|extract|摘录/i.test(userMessage);
  return wantsCreate ? 'cards' : 'explore';
}
```

**Clean tool definitions for API** (P3-36):
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

### 5.4 Confirm Template UUID Fix (P3-35)

```js
// update_board_node and delete_board_node confirm_templates:
// Before: "更新节点 {node_id}"
// After:
confirm_template: "更新节点内容",
// For delete:
confirm_template: "删除节点及其所有子节点",
```

The confirmation UI should show the node's text content (fetched from pendingActions args), not the UUID.

---

## 6. Plan System Optimization

### 6.1 Planner Context Injection

**File**: `chat/planner.mjs`

Expand `generatePlan()` to receive and inject rich context:

```js
export async function generatePlan(intent, userId, supabase, {
  conversationSummary = null,
  userSources = [],
  researchState = null,
} = {}) {
  let existingTopics = [];
  try { existingTopics = await listTopicsWithCardCount(supabase, userId); } catch {}

  const topicNames = existingTopics.map(t => `${t.title} (${t.card_count || 0} cards)`).join(', ');

  // Build rich context for planner
  const contextParts = [];
  contextParts.push(`用户已有主题: [${topicNames || '无'}]`);

  if (userSources.length > 0) {
    const sourceList = userSources
      .filter(s => s.status === 'active')
      .slice(0, 10)
      .map(s => `- ${s.name}${s.rss_url ? ` (RSS: ${s.rss_url})` : ''}${s.url ? ` (${s.url})` : ''}`)
      .join('\n');
    contextParts.push(`用户已有信息源:\n${sourceList}`);
  }

  if (conversationSummary) {
    contextParts.push(`最近对话上下文:\n${conversationSummary}`);
  }

  if (researchState && researchState.total_hypotheses > 0) {
    contextParts.push(`当前研究状态: 假说 ${researchState.total_hypotheses} 个, 证据 ${researchState.total_evidence} 个, 盲点 ${researchState.blind_spots} 个`);
  }

  contextParts.push(`研究意图:\n${intent}`);

  const aiConfig = await createAIClientConfig(userId, supabase);
  const messages = [
    { role: 'system', content: buildPlanSystemPrompt() },
    { role: 'user', content: contextParts.join('\n\n') },
  ];

  // ... rest of plan generation ...
}
```

### 6.2 Dynamic Plan Tool List

Replace hardcoded tool list in `PLAN_SYSTEM_PROMPT`:

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

### 6.3 Orchestrator Calls Planner with Context

```js
// In chatWithConversation(), when plan is requested:
if (result.planRequest) {
  const userSources = await listSources(supabase, userId, {}).catch(() => []);
  const conversationSummary = history
    .filter(m => m.message_type === 'conversation_summary')
    .pop()?.content || messages.slice(-6).map(m => `${m.role}: ${m.content.slice(0, 80)}`).join('\n');

  const { planSpec, planDisplay, suggestedTopicId } = await generatePlan(
    result.planRequest.intent, userId, supabase,
    { conversationSummary, userSources, researchState }
  );
  // ... rest of plan proposal flow ...
}
```

### 6.4 Executor: Remove Per-Step AI Notes

**File**: `chat/executor.mjs`

- Delete `generateStepNote()` function entirely
- Remove the `generateStepNote()` call in the step loop
- Keep `generatePlanSummary()` — it now receives all step outputs and produces a comprehensive summary in one AI call
- step_progress messages use `summarizeToolOutput()` (zero-cost template):

```js
// In the step loop, replace:
//   const aiNote = await generateStepNote(planStep, toolResult, userId, supabase);
// With nothing. The progress message becomes:
await addMessage(supabase, conversationId, {
  role: 'assistant',
  content: `**${planStep.title}** — ${summarizeToolOutput(planStep.tool, toolResult)}`,
  message_type: 'step_progress',
  metadata: { step_id: planStep.id, step_index: i, tool: planStep.tool, status: 'completed' },
});
```

**Result**: 8-step plan goes from 9 extra AI calls to 1.

### 6.5 Executor: Recursive $ref Resolution

```js
function resolveStepInput(planStep, stepOutputs) {
  return deepResolveRefs(planStep.input_hint || {}, stepOutputs);
}

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
```

### 6.6 Executor: Safe JSON Truncation

```js
function safeStringify(obj, maxChars = 3000) {
  const full = JSON.stringify(obj);
  if (full.length <= maxChars) return full;

  // For arrays: take first N complete items
  if (Array.isArray(obj)) {
    const items = [];
    let len = 2; // "[]"
    for (const item of obj) {
      const s = JSON.stringify(item);
      if (len + s.length + 1 > maxChars - 50) break;
      items.push(item);
      len += s.length + 1;
    }
    return JSON.stringify(items) + ` ...(共 ${obj.length} 项，已截取前 ${items.length} 项)`;
  }

  // For objects: truncate string values
  if (typeof obj === 'object' && obj !== null) {
    const truncated = {};
    for (const [k, v] of Object.entries(obj)) {
      truncated[k] = typeof v === 'string' && v.length > 200 ? v.slice(0, 200) + '...' : v;
    }
    return JSON.stringify(truncated).slice(0, maxChars);
  }

  return full.slice(0, maxChars) + '...(已截断)';
}
```

### 6.7 Executor Failure Notification + Task Lock Timeout

**Issue #25: fire-and-forget has no failure notification**

**File**: `chat/orchestrator.mjs:587-594`

The `.catch()` on `executePlan()` only does `console.error`. The user never sees the failure.

**Fix**: Write an error message to the conversation and update the task status:

```js
executePlan({ task, planSpec, conversationId, supabase: adminSb })
  .catch(async (err) => {
    console.error('[executor] Plan execution failed:', err);
    // Notify user via conversation message
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

The executor's own try/catch already handles per-step failures and writes `plan_complete` with results. This fix covers the top-level crash case that the existing code misses.

### 6.7b Task Lock Timeout

**File**: `services/supabase/tasks.mjs`

```js
export async function acquireTaskLock(supabase, taskId, runId) {
  const now = new Date().toISOString();
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  // Try normal lock acquisition
  const { data, error } = await supabase
    .from('tasks')
    .update({ is_running: true, running_run_id: runId, locked_at: now })
    .eq('id', taskId)
    .eq('is_running', false)
    .select()
    .maybeSingle();

  if (data) return true;

  // If locked, check if lock is stale (>30 minutes)
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

### 6.8 Cache `createAIClientConfig` in Executor

```js
export async function executePlan({ task, planSpec, conversationId, supabase }) {
  const userId = task.user_id;
  const aiConfig = await createAIClientConfig(userId, supabase); // Once
  // ... pass aiConfig to generatePlanSummary instead of userId+supabase
}
```

---

## 7. AI Client Layer

### 7.1 Anthropic Direct Mode Tool Calls

**File**: `services/aiClient.mjs:227-257`

Replace the Anthropic direct mode handler to properly translate tool_use blocks:

```js
if (provider === 'anthropic') {
  // Extract system message (Anthropic requires it as a top-level field, not in messages)
  const systemMessage = payload.messages.find(m => m.role === 'system');
  const nonSystemMessages = payload.messages.filter(m => m.role !== 'system');

  // Translate messages: OpenAI format → Anthropic format
  const anthropicMessages = translateToAnthropicFormat(nonSystemMessages);

  // Build Anthropic-specific payload
  const anthropicPayload = {
    model: payload.model,
    max_tokens: options.max_tokens || 4096,
    ...(systemMessage ? { system: systemMessage.content } : {}),
    messages: anthropicMessages,
  };

  // Add tools if present (translate OpenAI tool format → Anthropic)
  if (options.tools?.length > 0) {
    anthropicPayload.tools = options.tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
  }

  const response = await fetchWithTimeout(chatEndpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(anthropicPayload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Anthropic API 请求失败：${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // Translate response: Anthropic format → OpenAI format
  const textParts = (data.content || []).filter(b => b.type === 'text').map(b => b.text);
  const toolUseParts = (data.content || []).filter(b => b.type === 'tool_use');

  const message = {
    role: 'assistant',
    content: textParts.join('\n') || null,
  };

  if (toolUseParts.length > 0) {
    message.tool_calls = toolUseParts.map(tu => ({
      id: tu.id,
      type: 'function',
      function: {
        name: tu.name,
        arguments: JSON.stringify(tu.input),
      },
    }));
  }

  return {
    choices: [{ message }],
    usage: data.usage ? {
      prompt_tokens: data.usage.input_tokens,
      completion_tokens: data.usage.output_tokens,
    } : undefined,
  };
}

// Helper: translate OpenAI tool result messages to Anthropic format
// Note: system messages are already extracted before calling this function
function translateToAnthropicFormat(messages) {
  return messages.map(m => {
      if (m.role === 'tool') {
        return {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: m.tool_call_id,
            content: m.content,
          }],
        };
      }
      if (m.tool_calls) {
        return {
          role: 'assistant',
          content: [
            ...(m.content ? [{ type: 'text', text: m.content }] : []),
            ...m.tool_calls.map(tc => ({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments || '{}'),
            })),
          ],
        };
      }
      return m;
    });
}
```

### 7.2 Request Timeout

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

Replace all bare `fetch()` calls in `callChatAPI` and `callResponsesAPI` with `fetchWithTimeout()`.

### 7.3 Token Usage Logging

After every `callChatAPI` response:

```js
if (result.usage) {
  const { prompt_tokens, completion_tokens } = result.usage;
  console.log(`[ai] ${model} | ${prompt_tokens} in / ${completion_tokens} out | total: ${prompt_tokens + completion_tokens}`);
}
```

Phase 1: logging only. Phase 2 (future): persist to `ai_usage_logs` table for per-user tracking.

### 7.4 Deprecate `callChatCompletion`

**File**: `services/aiRuntime.mjs`

Mark `callChatCompletion` as deprecated. All callers should migrate to `callChatAPI` from `aiClient.mjs`. After migration, delete `callChatCompletion`.

---

## 8. Complete Issue Tracking Matrix

### P0 — BUG / Security (4 items)

| # | Issue | File | Section |
|---|-------|------|---------|
| 1 | listMessages ascending+limit gets oldest, not newest | conversations.mjs:100 | §2 P0-1 |
| 2 | write+draft mixed tool_calls bypass confirmation | orchestrator.mjs:119 | §2 P0-2 |
| 3 | get_card/get_board/get_document no userId filter | toolExecutor.mjs:67+ | §2 P0-3 |
| 4 | API Key "encryption" is base64 | aiClient.mjs:80 | §2 P0-4 |

### P1 — Architecture (9 items)

| # | Issue | File | Section |
|---|-------|------|---------|
| 5 | Tool call history filtered out across turns | orchestrator.mjs:474 | §3.3 |
| 6 | Anthropic direct mode tool_calls broken | aiClient.mjs:228 | §7.1 |
| 7 | Plan trigger via text regex, fragile | orchestrator.mjs:366 | §5.1 |
| 8 | Planner only gets intent, no conversation context | planner.mjs:113 | §6.1 |
| 9 | Planner doesn't know user's Sources/RSS feeds | planner.mjs:103 | §6.1 |
| 10 | PLAN_SYSTEM_PROMPT hardcodes 7 tools (actual: 19+) | planner.mjs:42 | §6.2 |
| 11 | No token budget check (system prompt + history + tool loop) | orchestrator.mjs:82 | §3.1-3.2 |
| 12 | System prompt uses Markdown, not XML tags | promptBuilder.mjs | §4.1 |
| 13 | Zero few-shot examples | promptBuilder.mjs | §4.2 |

### P2 — Medium (21 items)

| # | Issue | File | Section |
|---|-------|------|---------|
| 14 | ingest group `url` keyword too broad | toolGroups.mjs:54 | §5.3 |
| 15 | reader surface defaults to cards group | toolGroups.mjs:75 | §5.3 |
| 16 | board group has both batch draft and individual mutation | toolGroups.mjs:18 | §4.3 |
| 17 | semantic_search vs search_cards no selection guide | promptBuilder.mjs | §4.1 |
| 18 | create_card description contradicts NEGATIVE_CONSTRAINTS | tools.mjs | §5.2 |
| 19 | propose_board_changes schema too loose | tools.mjs | §5.2 |
| 20 | Tool definitions lack return value descriptions | tools.mjs | §5.2 |
| 21 | Tool results passed to AI uncompressed | orchestrator.mjs:347 | §3.4 |
| 22 | $ref:step_id only resolves top-level values | executor.mjs:198 | §6.5 |
| 23 | generateStepNote() per-step AI call (8 steps = 8 calls) | executor.mjs:216 | §6.4 |
| 24 | JSON.stringify().slice() can truncate mid-JSON | executor.mjs:226 | §6.6 |
| 25 | fire-and-forget execution no failure notification | orchestrator.mjs:587 | §6.7 (first half) |
| 26 | Task lock no timeout cleanup | tasks.mjs:255 | §6.7 |
| 27 | fetch() no timeout | aiClient.mjs | §7.2 |
| 28 | callChatCompletion and callChatAPI overlap | aiRuntime.mjs:235 | §7.4 |
| 29 | No token usage tracking | aiClient.mjs | §7.3 |
| 30 | truncateToTokens() uses maxTokens×4, wrong for Chinese | promptBuilder.mjs:136 | §4.6 |
| 31 | describeSurface() exposes UUIDs in prompt | promptBuilder.mjs:179 | §4.5 |
| 32 | No conversation summary / cross-session progress | orchestrator.mjs | §3.5 |
| 33 | No parallel tool call guidance in prompt | promptBuilder.mjs | §4.1 |
| 34 | classifyIntent() is dead code | planner.mjs:22 | §5.1 |

### P3 — Low (7 items)

| # | Issue | File | Section |
|---|-------|------|---------|
| 35 | confirm_template leaks UUIDs | tools.mjs | §5.4 |
| 36 | Tool definitions sent to API with extra fields | toolGroups.mjs | §5.3 |
| 37 | Mixed tool_calls: read_only also paused for confirmation | orchestrator.mjs | §2 P0-2 |
| 38 | models.config.json missing context_window | config | §3.2 |
| 39 | createAIClientConfig() called per step note | executor.mjs:218 | §6.8 |
| 40 | suggestedTopicId matches only first keyword | planner.mjs:145 | Deferred |
| 41 | Prompt mixes Chinese and English | promptBuilder.mjs | §4.1 |

---

## 9. Required DB Migrations

### 9.1 Migration: `chat_messages.message_type` CHECK constraint

Add `'conversation_summary'` to the allowed values:

```sql
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_message_type_check;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_message_type_check
  CHECK (message_type IN ('text', 'tool_calls', 'plan_proposal', 'plan_confirmed', 'step_progress', 'plan_complete', 'error', 'conversation_summary'));
```

### 9.2 Migration: `tasks` table — add `locked_at` column

```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
```

The existing `running_run_id` column is used as `running_run_id` in the spec — use the existing column name `running_run_id` in the implementation (no rename needed).

### 9.3 Environment variable

Add to `.env.example`:
```
API_KEY_ENCRYPTION_SECRET=  # 32 bytes hex string for AES-256-GCM encryption of user API keys
```

---

## 10. Relationship to Research Run

This optimization spec is a **prerequisite** for the Research Run feature (`docs/RESEARCH-RUN-SPEC.md`). Research Run is a 6-phase AI research pipeline (Reading → Decomposition → Evidence Mapping → Hypothesis Formation → Gap Analysis → Synthesis) that will execute multi-step, long-running AI plans with heavy tool use.

The following optimizations directly enable Research Run:

| This Spec | Research Run Dependency |
|-----------|----------------------|
| §3 Context Layer (token budget, summaries) | Research Run phases generate many tool calls across long conversations; token budget prevents context overflow |
| §5 Tool descriptions + `request_plan` tool | Research Run triggers complex plans; the AI must reliably select `request_plan` over ad-hoc tool chains |
| §6 Plan system (planner context, executor fixes) | Research Run phases map directly to plan steps; planner needs topic/board context to generate accurate plans |
| §6.6–6.7 Executor resilience (lock timeout, failure notification) | Research Run phases are long-running; stale locks and silent failures would corrupt research state |
| §7 AI Client (timeouts, Anthropic tool_calls) | Research Run makes many sequential API calls; missing timeouts risk hanging the entire pipeline |

**Design constraint**: All optimizations in this spec must preserve backward compatibility with the Research Run data model (topics, cards, thinking boards, materials, documents, sources). No schema changes beyond those listed in §9.

---

## 11. Implementation Order

### Phase 1: P0 Bug & Security Fixes (parallel, no dependencies)
1. Fix listMessages sort direction
2. Fix write+draft confirmation bypass
3. Add userId filtering to data access tools
4. Implement real API key encryption

### Phase 2: Context Layer (sequential)
1. Create `contextBudget.mjs` (estimateTokens, calculateBudget, buildHistoryWithinBudget)
2. Add context_window to models.config.json
3. Update orchestrator to use token-based history loading
4. Add tool call history preservation
5. Add tool result compression
6. Add conversation summary generation

### Phase 3: Prompt Layer (parallel where possible)
1. Rewrite promptBuilder.mjs with XML structure
2. Add few-shot examples
3. Update TOOL_GROUP_INSTRUCTIONS
4. Fix describeSurface, truncateToTokens, MODE_INSTRUCTIONS

### Phase 4: Tool + Plan Layer (sequential)
1. Add request_plan tool + handler + orchestrator detection
2. Remove extractPlanRequest, PLAN_DETECTION, classifyIntent
3. Update tool descriptions (return values, boundaries)
4. Fix toolGroups (ingest keywords, reader default, API field cleanup)
5. Expand generatePlan with context injection + dynamic tool list
6. Fix executor: remove generateStepNote, recursive $ref, safe JSON, lock timeout

### Phase 5: AI Client (parallel)
1. Anthropic direct mode tool_calls translation
2. Add fetchWithTimeout to all API calls
3. Add token usage logging
4. Deprecate callChatCompletion

---

## 12. Files Changed Summary

| File | Change Type | Phase |
|------|-------------|-------|
| `services/supabase/conversations.mjs` | Bug fix: sort direction | 1 |
| `chat/orchestrator.mjs` | Major: confirmation logic, context loading, plan detection | 1,2,4 |
| `chat/toolExecutor.mjs` | Fix: userId filtering, request_plan handler | 1,4 |
| `services/aiClient.mjs` | Fix: encryption, Anthropic tool_calls, timeout, token log | 1,5 |
| `chat/promptBuilder.mjs` | Rewrite: XML structure, examples, all constants | 3 |
| `chat/tools.mjs` | Add: request_plan; Update: all descriptions | 4 |
| `chat/toolGroups.mjs` | Fix: ingest pattern, reader default, API cleanup | 4 |
| `chat/planner.mjs` | Expand: context injection, dynamic tool list, remove dead code | 4 |
| `chat/executor.mjs` | Fix: remove stepNote, recursive $ref, safe JSON, cache aiConfig | 4 |
| `services/supabase/tasks.mjs` | Fix: lock timeout | 4 |
| `config/models.config.json` | Add: context_window field | 2 |
| `services/aiRuntime.mjs` | Deprecate: callChatCompletion | 5 |
| **NEW** `chat/contextBudget.mjs` | New: token estimation, budget, sliding window | 2 |
| **NEW** Supabase migration | Add `locked_at` to tasks, update message_type CHECK | 1,2 |
| `.env.example` | Add `API_KEY_ENCRYPTION_SECRET` | 1 |

---

## 13. What We're NOT Changing

- **Module structure**: orchestrator/promptBuilder/tools/toolGroups/toolExecutor/planner/executor separation stays
- **4-layer tool safety**: side_effect + toolGroups + confirmation gate + methodology guards — this is excellent, keep as-is
- **Draft mode**: propose_board_changes preview-before-commit stays
- **AI-first routing**: all input goes through AI, no frontend intent routing
- **Conversation persistence**: Supabase message storage stays
- **Plan execution model**: architect/executor separation stays
- **No new npm dependencies**: all changes use Node.js built-in modules

---

## References

- [Anthropic Prompting Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- [Anthropic Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [OpenAI Prompt Engineering Guide](https://developers.openai.com/api/docs/guides/prompt-engineering/)
- [OpenAI Function Calling Guide](https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide/)
- Internal analysis: `C:\Users\Admin\.claude\plans\optimized-wondering-penguin.md`
