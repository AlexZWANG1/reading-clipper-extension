# Verity AI-Native Integration: Complete Specification

> **Date**: 2026-03-14
> **Status**: Implemented
> **Scope**: Full-stack AI integration — mode switching, floating chat, markdown rendering, health sidebar, draft preview, ambient suggestions, story annotations
> **Depends on**: `2026-03-14-ai-agent-redesign-spec.md` (backend already implemented)

---

## 1. Design Philosophy

**AI is a proactive collaborator, not just a mirror.** AI observes, suggests, and proposes — but its contributions are always visually distinct from human work until explicitly accepted.

**Core principles:**
- **Suggestion layer**: AI contributions rendered in a distinct visual language (dashed borders, accent color, lower opacity) — clearly separable from human work
- **Natural language first**: Minimize buttons. The chat is the primary interaction channel. Health sidebar is informational, not a control panel.
- **Restraint**: Every UI element must justify its existence. If it can be done through chat, don't add a button.
- **Context-aware**: AI knows what page you're on, what topic you're looking at, what board is open. You shouldn't have to tell it.
- **Feedback loop**: Actions on the canvas (accept draft, reject node) produce feedback messages in the chat, keeping a narrative thread of what happened.

---

## 2. Feature Overview

| # | Feature | Surface | Backend | Frontend |
|---|---------|---------|---------|----------|
| 1 | Three-mode toggle (聊天/代理/自动) | Chat | Modify orchestrator | New toggle component |
| 2 | Floating Chat globalization | All pages | Minor (surface_context) | New GlobalChatPanel in Layout |
| 3 | Markdown rendering | Chat | None | Add react-markdown |
| 4 | No UUID in AI output | Chat | Prompt rule | None |
| 5 | Health sidebar | Board | Already done (health endpoint) | New HealthSidebar component |
| 6 | Draft preview on canvas | Board | Already done (draft engine) | New DraftNode rendering |
| 7 | Ambient evidence suggestion | Reader/Cards | New matching logic | Toast component |
| 8 | Story health annotations | Document | Health data lookup | Inline badge component |

---

## 3. Feature 1: Three-Mode Toggle

### 3.1 Modes

| Mode | Label | Tool scope | Behavior |
|------|-------|-----------|----------|
| **聊天** (Chat) | 💬 | `explore` group only (read-only) | Can query data, cannot create/modify/delete anything. If user asks to create, AI explains: "切换到代理模式后我可以帮你创建。" |
| **代理** (Agent) | 🤖 | Surface-inferred group (board/cards/ingest) | Full capability. Write operations go through confirmation gate. Draft operations auto-execute. |
| **自动** (Auto) | ✨ | Auto-inferred by `inferToolGroup()` | Current behavior. AI and system together decide what tools are needed. Default mode. |

### 3.2 Backend Changes

**`POST /api/v2/chat`** — add `mode` field to request body:

```javascript
{
  user_message: "帮我创建一张卡片",
  conversation_id: "...",
  surface_context: { surface: "board", topicId: "..." },
  mode: "chat" | "agent" | "auto"  // NEW — default "auto"
}
```

**Full parameter threading** (mode must flow through the entire call chain):

```
Frontend: chatApi.sendMessage(conversationId, userMessage, surfaceContext, mode)
  → POST /api/v2/chat  (chat.mjs: extract mode from req.body)
    → chatWithConversation({ ..., mode })  (orchestrator.mjs: accept mode param)
      → chat({ ..., mode })  (orchestrator.mjs: use mode for tool group)
        → buildSystemPrompt({ ..., mode })  (promptBuilder.mjs: inject mode instruction)
```

**`orchestrator.mjs` changes:**

```javascript
// chat() accepts mode parameter
export async function chat({ messages, userId, supabase, accessToken, onToolCall, surfaceContext, toolGroupOverride, mode }) {

// toolGroupOverride (plan execution) ALWAYS takes precedence over mode
const toolGroup = toolGroupOverride  // plan execution always wins
  || (mode === 'chat' ? 'explore' : inferToolGroup(lastUserMsg, surfaceContext));
```

**`chatWithConversation()` changes:**

```javascript
export async function chatWithConversation({ conversationId, userMessage, userId, supabase, accessToken, surfaceContext, mode }) {
  // ... existing code ...
  const result = await chat({ messages, userId, supabase, accessToken, surfaceContext, mode });
```

**`chat.mjs` route changes:**

```javascript
const { conversation_id, user_message, surface_context, mode } = req.body;
// ... pass mode to chatWithConversation ...
```

**`promptBuilder.mjs` changes:**

Add mode-aware instruction to prompt:
```javascript
const MODE_INSTRUCTIONS = {
  chat: `你当前处于"聊天"模式。你只能查询和搜索数据来回答问题，不能创建、修改或删除任何内容。如果用户要求你执行写操作，告诉他们切换到"代理"模式。`,
  agent: `你当前处于"代理"模式。你可以执行操作，但写操作需要用户确认。`,
  auto: '', // No special instruction — current behavior
};

// buildSystemPrompt signature change:
export function buildSystemPrompt({ surfaceContext, methodology, researchState, toolGroup, mode }) {
  // ... existing sections (BASE_IDENTITY, DATA_MODEL_BRIEF, etc.) ...
  const modeInstruction = MODE_INSTRUCTIONS[mode] || '';
  if (modeInstruction) parts.push(modeInstruction);
  // ...
}
```

The `chat()` function in `orchestrator.mjs` must pass `mode` through:

```javascript
const systemPrompt = buildSystemPrompt({ surfaceContext, methodology, researchState, toolGroup, mode });
```

### 3.3 Frontend Changes

**Toggle component** in floating chat header:

```
┌─────────────────────────────────────┐
│ Verity AI    [💬] [🤖] [✨]    ─  │
│              chat agent auto        │
├─────────────────────────────────────┤
```

- Three-segment toggle, visually compact (icon + tooltip on hover)
- Default: ✨ (auto)
- Selected state: filled background, others outline
- Persisted in `localStorage` per user preference
- Passed as `mode` parameter in every chat API call

### 3.4 Chat Mode Behavior

When in chat mode and user asks to create/modify:
- AI responds conversationally: "我现在是聊天模式，只能帮你查数据。如果你想让我创建卡片，请切换到代理模式 🤖"
- No tool calls attempted — the tools simply aren't available
- This is enforced by backend (explore group has zero write tools), not just by prompt

---

## 4. Feature 2: Floating Chat Globalization

### 4.1 Architecture

**Current state:**
- `BoardChatPanel` — floating panel, only on `ThinkingBoardPage`, board-specific context
- `ChatPage` — full-page chat at `/chat`, conversation management + plan execution

**New state:**
- `GlobalChatPanel` — floating panel in `Layout.jsx`, available on ALL pages
- `ChatPage` — unchanged, remains the conversation management center
- `BoardChatPanel` — removed, replaced by `GlobalChatPanel` with board context

### 4.2 GlobalChatPanel Design

**Position:** Fixed bottom-right, consistent across all pages.

**Collapsed state:** Single floating button with AI icon. Badge shows unread count if AI sent a message while collapsed.

**Expanded state:**
```
┌─────────────────────────────────────┐
│ Verity AI    [💬][🤖][✨]    ─  ✕ │  ← Header: mode toggle + minimize/close
├─────────────────────────────────────┤
│                                     │
│  Messages area (scrollable)         │  ← Markdown-rendered messages
│                                     │
│  ┌─ AI ─────────────────────────┐   │
│  │ 你有 42 张卡片，分布在 5 个   │   │
│  │ 主题中。最活跃的是"AI Safety" │   │
│  │ 有 15 张卡片。                │   │
│  └──────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│ [📎] 输入消息...           [发送]   │  ← Input area
└─────────────────────────────────────┘
```

**Dimensions:** 400px wide × 560px tall (slightly larger than current BoardChatPanel's 384×520).

### 4.3 Surface Context Detection

Create `hooks/useSurfaceContext.js` — a reusable hook using `useMatch()` (react-router v6) for route detection. This is more robust than `useParams()`, which only works within a route's direct subtree and may return stale params when shared across routes. Used by GlobalChatPanel; can also be used by any component that needs surface awareness.

```javascript
import { useMatch, useLocation } from 'react-router-dom';

function useSurfaceContext() {
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

This is passed as `surface_context` in every chat API call. The AI's behavior adapts automatically — on a board page, it knows the board context; on a reader page, it knows the material.

### 4.4 Conversation Continuity

GlobalChatPanel and ChatPage both consume the **existing** `useChatStore` in `web-app/src/lib/store.js`. The store already has `conversationId`, `messages`, `sending`, `sendMessage()`, `loadConversation()`, etc.

**Extend (do NOT replace) the existing store** with these new fields:

```javascript
// In existing useChatStore (lib/store.js), ADD:
surfaceContext: null,              // NEW — auto-detected from route
mode: 'auto',                     // NEW — 'chat' | 'agent' | 'auto'
setSurfaceContext: (ctx) => set({ surfaceContext: ctx }),
setMode: (mode) => set({ mode }),
```

Update the existing `sendMessage` action to thread `surfaceContext` and `mode` through the API call:

```javascript
// Modify existing sendMessage in useChatStore:
sendMessage: async (text) => {
  const { conversationId, surfaceContext, mode } = get();
  // ... existing optimistic update logic ...
  const res = await chatApi.sendMessage(conversationId, text, { surfaceContext, mode });
  // ... existing response handling ...
},
```

- **Single source of truth**: Both GlobalChatPanel and ChatPage read from the same store. When one sends a message, the other sees it.
- **ChatPage** adds conversation list + history browsing on top of the shared store.
- **GlobalChatPanel** is a lightweight view — calls `useChatStore.sendMessage()`, reads `useChatStore.messages`.
- `mode` is persisted to `localStorage` (user preference); `surfaceContext` is ephemeral (changes with navigation).

### 4.5 Write Confirmation Flow in GlobalChatPanel

When AI decides to execute a write operation (e.g., `create_card`), the orchestrator returns `pendingActions` with `reply: ""`. GlobalChatPanel **must** handle this — otherwise the user sees no response.

**Flow:**
1. `sendMessage()` returns `result` with `pendingActions`, `pendingMessages`, `pendingToolCalls`
2. Store detects `pendingActions` and skips pushing an empty assistant message
3. GlobalChatPanel stores `pendingActions` in local state and renders a confirmation card
4. User clicks "确认" → calls `chatApi.confirm(messages, pendingToolCalls, confirmedIds)`
5. Backend executes confirmed tools and returns final reply
6. User clicks "取消" → clears pending state, no tools executed

**Confirmation card UI:**
- Warning-colored card (`--warning-subtle` background, `--warning` border)
- Shield icon + "AI 请求执行操作" header
- Bulleted list of `confirm_message` strings from each pending action
- "确认" (green) and "取消" (muted) buttons
- Input disabled while pending actions exist

**Conversation management:**
- "New conversation" button (Trash2 icon) in header — calls `useChatStore.newConversation()` and clears local pending state
- Error bar below messages area — auto-dismisses after 5 seconds

### 4.6 Board Context Integration

When on ThinkingBoardPage, the GlobalChatPanel gets extra context:
- `boardId` from the existing store in `lib/store.js` — add `boardId` and `boardInvalidateCounter` fields
- `topicId` from route detection via `useMatch()` (see 4.3)
- Board data reload is triggered through the store: when AI executes board writes, it increments `boardInvalidateCounter`, and ThinkingBoardPage subscribes via `useEffect` to refetch

```javascript
// In existing lib/store.js, ADD to a new slice or extend existing:
boardId: null,
boardInvalidateCounter: 0,
setBoardId: (id) => set({ boardId: id }),
invalidateBoard: () => set((s) => ({ boardInvalidateCounter: s.boardInvalidateCounter + 1 })),
```

This replaces the current BoardChatPanel entirely. The same floating panel, but now aware of every page's context via shared stores — no direct prop threading needed.

**Migration note:** The current `BoardChatPanel` uses local `useState` for messages and the legacy stateless `chatApi.send(messages)` path (raw messages array). `GlobalChatPanel` uses the conversation-aware `useChatStore.sendMessage()` instead. Board-specific chat history from the old stateless pattern is ephemeral (not persisted) and will naturally be replaced. The legacy stateless chat route (`POST /api/v2/chat` without `conversation_id`) should be deprecated but can remain functional for backward compatibility.

### 4.6 Layout.jsx Changes

```jsx
// In Layout.jsx, add after <Outlet />:
<GlobalChatPanel />
```

The panel uses `useMatch()` from react-router for route detection and Zustand stores for page-specific context. No props needed from Layout — it's self-contained.

---

## 5. Feature 3: Markdown Rendering

### 5.1 Dependency

Add `react-markdown` and `remark-gfm` to web-app:

```bash
cd web-app && npm install react-markdown remark-gfm
```

### 5.2 ChatMessage Component

Create a reusable `ChatMessage` component that replaces raw `{msg.content}` rendering:

```jsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function ChatMessage({ content, role }) {
  if (role === 'user') {
    // User messages: plain text, no markdown
    return <span className="whitespace-pre-wrap">{content}</span>;
  }

  // Assistant messages: markdown rendered
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Compact styling for chat context
        p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="list-disc ml-4 mb-1.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal ml-4 mb-1.5">{children}</ol>,
        li: ({ children }) => <li className="mb-0.5">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        // react-markdown v9: use `pre` override for code blocks (handles
        // both language-tagged and plain fenced code blocks). `code` only
        // renders inline code when not wrapped by `pre`.
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
        a: ({ href, children }) => <span className="text-blue-600 underline">{children}</span>,
        // Links are text-only (no clickable hrefs from AI to prevent phishing)
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
```

### 5.3 Usage

Replace in both GlobalChatPanel and ChatPage:

```diff
- <div className="whitespace-pre-wrap">{msg.content}</div>
+ <ChatMessage content={msg.content} role={msg.role} />
```

### 5.4 Security

- Links rendered as styled text, not clickable `<a>` tags (AI should not generate clickable URLs)
- No HTML passthrough — react-markdown only renders markdown syntax
- DOMPurify already in dependencies as fallback

---

## 6. Feature 4: No UUID in AI Output

### 6.1 Prompt Rule

Add to `NEGATIVE_CONSTRAINTS` in `promptBuilder.mjs`:

```javascript
const NEGATIVE_CONSTRAINTS = `## Absolute Prohibitions

- NEVER create, modify, or delete any data unless the user EXPLICITLY asks you to.
- When the user asks for information, ONLY use read/search tools to look up and answer.
- NEVER fabricate data — always call tools to retrieve real data.
- NEVER proactively create cards, nodes, or edges as a "helpful" side effect.
- If unsure whether the user wants you to create something, ASK first.
- NEVER show internal IDs (UUIDs) in your responses. Reference data by its title, summary, or content. Users don't need to see database identifiers.`;
```

### 6.2 Output Format Guidance

Add to `BASE_IDENTITY` in `promptBuilder.mjs`:

```javascript
const BASE_IDENTITY = `You are a research assistant for "Verity" (求真), an evidence-driven research workbench. You help users manage their reading knowledge base: cards, topics, thinking boards, documents, sources, and ingested materials.

Answer in the same language the user uses. Be concise and helpful. Always ground your answers in the user's actual data — call tools to look up data before answering.

When presenting cards or data to the user, format them cleanly:
- Use the card's title as a heading, not its UUID
- Show key points as a bullet list
- Include source name if available
- Use markdown formatting for readability`;
```

---

## 7. Feature 5: Health Sidebar

### 7.1 Design Principle

**Informational only.** No action buttons. The sidebar shows the shape of your evidence — if you want to act on it, talk to the AI in the chat panel.

### 7.2 Visual Design

```
┌─ 研究健康度 ──────────────────┐
│                                │
│  假说 5    证据 18    盲点 3   │  ← Summary metrics
│                                │
│ ─────────────────────────────  │
│                                │
│  H1: 定价导致用户流失           │
│  ██████████░░  5↑ 1↓           │  ← Green/red bar
│  ✓ 强支持                      │  ← Status badge (green)
│                                │
│  H2: 功能差距                   │
│  ████████████  4↑ 0↓           │
│  ⚠ 偏见警告                    │  ← Status badge (amber)
│  仅有支持证据，缺少反面论证      │  ← AI observation (subtle)
│                                │
│  H3: 入职复杂度                 │
│  ░░░░░░░░░░  0↑ 0↓             │
│  ✗ 无证据                      │  ← Status badge (gray)
│                                │
│ ─────────────────────────────  │
│                                │
│  6 张卡片未关联任何假说          │  ← Orphan cards count
│                                │
└────────────────────────────────┘
```

### 7.3 Component Structure

```
HealthSidebar (right panel, 240px, collapsible)
├── HealthSummary (metric cards row)
├── HypothesisList
│   └── HypothesisBar (per hypothesis)
│       ├── EvidenceBalanceBar (green/red proportional bar)
│       ├── StatusBadge (strong/bias/weak/none)
│       └── AIObservation (optional, subtle text)
└── OrphanCardCount
```

### 7.4 Data Source

Fetches `GET /api/v2/boards/:boardId/health` on board load and after every board mutation.

Response shape (already implemented):
```json
{
  "ok": true,
  "health": {
    "total_hypotheses": 5,
    "total_evidence": 18,
    "blind_spots": 3,
    "unanswered_questions": 2,
    "hypotheses_summary": [
      {
        "node_id": "...",
        "text": "定价导致用户流失",
        "support": 5,
        "refute": 1,
        "status": "strong_support"
      }
    ]
  }
}
```

### 7.5 AI Observation Text

Status-dependent, generated client-side (not by LLM):

| Status | Observation |
|---|---|
| `bias_warning` | "仅有支持证据，缺少反面论证" |
| `no_evidence` | "尚未关联任何证据卡片" |
| `insufficient` | "证据不足，建议继续收集" |
| `strong_support` | (none — no warning needed) |
| `strong_against` | (none) |
| `mixed` | (none — healthy state) |

### 7.6 Integration with ThinkingBoardPage

```jsx
// ThinkingBoardPage layout:
<div className="flex h-full">
  <div className="flex-1">
    {/* ReactFlow canvas */}
  </div>
  <HealthSidebar boardId={boardId} />
</div>
```

Sidebar is collapsible via a toggle button. Default: expanded.

---

## 8. Feature 6: Draft Preview on Canvas

### 8.1 Visual Language

AI-proposed nodes are rendered with a **distinct "suggestion" style**:

| Property | Real node | Draft node |
|---|---|---|
| Border | Solid, 1px | Dashed, 2px |
| Border color | Node-type color | `#8B5CF6` (purple, AI accent) |
| Background | Solid fill | Semi-transparent (opacity 0.85) |
| Badge | None | Small "AI" tag, top-right |
| Hover | Normal controls | ✓ Accept / ✗ Reject controls |

Draft edges are rendered as dashed lines in the same purple accent color.

### 8.2 Commit Bar

When pending drafts exist, a bar appears at the top of the canvas:

```
┌────────────────────────────────────────────────────────────┐
│ 🤖 AI 建议了 5 个更改    [全部接受]  [逐个审核]  [全部拒绝] │
└────────────────────────────────────────────────────────────┘
```

- "全部接受" → `POST /boards/:boardId/drafts/:draftId/commit` (no `accepted_indices`)
- "全部拒绝" → `POST /boards/:boardId/drafts/:draftId/reject`
- "逐个审核" → Highlights draft nodes, enables per-node accept/reject via hover controls

### 8.3 Per-Node Accept/Reject

On hover over a draft node:

```
┌──────────────────────────────────┐
│ AI  H1: 定价导致用户流失          │
│                          [✓] [✗] │  ← Accept / Reject buttons
└──────────────────────────────────┘
```

- Accept a node: marks it for inclusion in commit
- Reject a node: removes it and cascades to children (evidence nodes under a rejected hypothesis are also rejected)
- After individual review, the commit bar updates: "接受 3 / 拒绝 2  [提交已选]"

### 8.4 Data Flow

1. AI calls `propose_board_changes` → backend creates draft → response includes `draft_id`
2. Chat shows: "我已在画板上草拟了 5 个更改，请在画板上查看。"
3. Frontend fetches `GET /boards/:boardId/drafts` → gets pending draft with changes array
4. Frontend renders draft nodes/edges on ReactFlow canvas
5. User accepts/rejects → frontend calls commit/reject API
6. On commit success: refetch board data, remove draft nodes, replace with real nodes
7. Chat receives feedback message: "已提交 3 个节点，拒绝 2 个。"

### 8.5 Draft Node Positioning

Draft nodes need positions on the canvas. Strategy:
- Place draft nodes relative to their parent node
- If parent is an existing node: offset below + right
- Use dagre layout for the draft subtree to avoid overlaps
- After commit, positions are saved to the real nodes

### 8.6 Constraints

- Maximum 1 pending draft per board (enforced by backend — new draft expires old one)
- Drafts expire after 24 hours
- Draft nodes are NOT saved to the board until committed — they exist only in the `board_drafts` table

---

## 9. Feature 7: Ambient Evidence Suggestion

### 9.1 Trigger

After a card is created (via web-app card capture or API), if the card belongs to a topic that has a thinking board with hypotheses, run a lightweight relevance check.

### 9.2 Backend: Relevance Matching

Add to card creation flow in `cards.mjs` (or as a post-creation hook):

```javascript
async function findEvidenceSuggestion(supabase, card, topicId) {
  if (!topicId) return null;

  // Find hypotheses for this topic's board
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

  // Keyword overlap scoring — supports both CJK and Latin text.
  // Chinese/Japanese/Korean text has no whitespace between words, so we
  // split on whitespace for Latin tokens and also extract individual
  // CJK characters/bigrams for matching.
  const cardText = `${card.summary || ''} ${(card.key_points || []).join(' ')}`.toLowerCase();

  function extractTokens(text) {
    // Latin words (2+ chars)
    const latinWords = text.match(/[a-z]{2,}/gi) || [];
    // CJK bigrams (sliding window of 2 characters)
    // Filter out common stop characters to reduce false positives
    const CJK_STOP_CHARS = new Set('的了在是我有和与不也这那些个');
    const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || [])
      .filter(c => !CJK_STOP_CHARS.has(c));
    const cjkBigrams = [];
    for (let i = 0; i < cjkChars.length - 1; i++) {
      cjkBigrams.push(cjkChars[i] + cjkChars[i + 1]);
    }
    // Bigrams are the primary tokens; individual chars omitted to reduce false positives
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

### 9.3 Integration Point

Call `findEvidenceSuggestion()` in the `POST /api/v2/cards/capture` route, after the card is successfully created and has a `topic_id`. Runs in both fast-path (raw_snippet) and AI-processed paths, since the suggestion is a lightweight post-creation check. Add after the card insert:

```javascript
// In cards.mjs route, after card creation:
let evidence_suggestion = null;
if (card.topic_id) {
  evidence_suggestion = await findEvidenceSuggestion(req.supabase, card, card.topic_id);
}
res.json({ ok: true, card, evidence_suggestion });
```

### 9.4 API Response Extension

Card creation endpoints return an optional `evidence_suggestion` field:

```json
{
  "ok": true,
  "card": { "id": "...", "title": "...", ... },
  "evidence_suggestion": {
    "hypothesis_id": "uuid",
    "hypothesis_text": "定价导致用户流失",
    "board_id": "uuid",
    "score": 0.72
  }
}
```

### 9.5 Frontend: Toast Suggestion

After card save, if `evidence_suggestion` is present, show a non-modal toast:

```
┌──────────────────────────────────────────────┐
│ ✓ 卡片已保存到「AI Safety」                    │
│                                              │
│ 💡 可能与假说相关：                             │
│ 「定价导致用户流失」                            │
│ [链接为证据]  [忽略]                           │
└──────────────────────────────────────────────┘
```

- Toast auto-dismisses after 10 seconds
- "链接为证据" → creates evidence node + supports edge on the board (single API call)
- "忽略" → dismisses immediately
- Maximum 1 suggestion per card save (the best match)

### 9.6 Quick-Link API

New endpoint for one-click evidence linking:

`POST /api/v2/boards/:boardId/quick-link`

```json
{
  "card_id": "card-uuid",
  "hypothesis_id": "hypothesis-node-uuid",
  "relation_type": "supports"
}
```

Backend: creates an evidence node (parent_id = hypothesis_id, card_id = card_id) + a supports edge.

---

## 10. Feature 8: Story Health Annotations

### 10.1 Trigger

When viewing a document that contains story units, each story unit references cards. If those cards are linked as evidence to hypotheses that have health warnings, show an inline annotation.

### 10.2 Data Flow

1. `MaterialReaderPage` loads story units (existing flow). Each story unit has `card_ids[]`.
2. On mount, fetch all boards for the user via `GET /api/v2/boards` — cache in component state.
3. For each board that has a `topic_id`, fetch `GET /api/v2/boards/:boardId/health` — cache all health results keyed by `boardId`.
4. Build a lookup map: `cardId → { boardId, hypotheses[] }` by scanning evidence nodes from health data (`hypotheses_summary[].evidence_card_ids`). Note: the health endpoint needs to include `evidence_card_ids` per hypothesis for this to work client-side (see 10.5).
5. For each story unit, iterate its `card_ids` through the lookup map. If any referenced hypothesis has `bias_warning` or `no_evidence` status → attach a `StoryHealthBadge`.
6. This computation runs once per document load (not per render). Cache invalidates when the user navigates to a different document.

### 10.3 Frontend: Inline Badge

```
┌──────────────────────────────────────────────────────────┐
│  Section 3: Market Analysis                              │
│                                                          │
│  Based on survey data, pricing appears to be the         │
│  primary driver of customer churn...                     │
│                                                          │
│  ⚠ 引用假说「功能差距」偏见警告: 4支持 0反对              │  ← Badge
│                                                          │
└──────────────────────────────────────────────────────────┘
```

- Badge: small amber bar below the story unit
- Clicking the badge navigates to the thinking board with that hypothesis highlighted
- Non-blocking — doesn't prevent reading or editing

### 10.4 Implementation Note

This feature requires resolving the chain: story_unit → cards → evidence_nodes → hypothesis → health_status. This can be done client-side by loading the health data once and cross-referencing, or via a dedicated API endpoint. Client-side is preferred (simpler, no new endpoint needed).

### 10.5 Health Endpoint Extension

The `GET /api/v2/boards/:boardId/health` response's `hypotheses_summary` array needs an additional field per hypothesis:

```json
{
  "node_id": "...",
  "text": "...",
  "support": 5,
  "refute": 1,
  "status": "strong_support",
  "evidence_card_ids": ["card-uuid-1", "card-uuid-2"]
}
```

`evidence_card_ids` is the list of card IDs linked as evidence to this hypothesis. Computed in `researchContext.mjs` by querying evidence nodes' `card_id` values via `parent_id` linkage:

```javascript
// In computeResearchState(), per hypothesis:
const { data: evidenceNodes } = await supabase
  .from('board_nodes')
  .select('card_id')
  .eq('parent_id', hypo.id)
  .eq('node_type', 'evidence')
  .not('card_id', 'is', null);

const evidence_card_ids = (evidenceNodes || []).map(e => e.card_id);
```

This enables client-side cross-referencing without a new endpoint. Update the reference in Section 10.2 step 4 accordingly.

---

## 11. Backend Changes Summary

### 11.1 Modified Files

| File | Changes |
|---|---|
| `src/chat/orchestrator.mjs` | Accept `mode` parameter, override tool group based on mode |
| `src/chat/promptBuilder.mjs` | Add UUID prohibition to NEGATIVE_CONSTRAINTS, add output format guidance to BASE_IDENTITY, add MODE_INSTRUCTIONS |
| `src/routes/v2/chat.mjs` | Pass `mode` from request body to orchestrator |
| `src/routes/v2/boards.mjs` | Add `POST /:boardId/quick-link` endpoint |
| `src/services/supabase/cards.mjs` | Add `findEvidenceSuggestion()` post-creation hook |
| `src/routes/v2/cards.mjs` | Return `evidence_suggestion` in card creation response |

### 11.2 Health Endpoint Extension

`researchContext.mjs` — `computeResearchState()` must include `evidence_card_ids` per hypothesis (see Section 10.5).

### 11.3 No New Backend Files

All new backend functionality fits into existing files. The heavy backend work (draft engine, health computation, methodology, tool groups) is already implemented from the previous spec.

---

## 12. API Client Changes (web-app)

The frontend `api.js` (or equivalent) must be updated to thread `surface_context` and `mode` through all chat calls.

### 12.1 sendMessage Signature Change

```javascript
// Before:
export async function sendMessage(conversationId, userMessage) { ... }

// After:
export async function sendMessage(conversationId, userMessage, { surfaceContext, mode } = {}) {
  return request('/api/v2/chat', {
    method: 'POST',
    body: JSON.stringify({
      conversation_id: conversationId,
      user_message: userMessage,
      surface_context: surfaceContext || null,
      mode: mode || 'auto',
    }),
  });
}
```

### 12.2 New API Functions

```javascript
// Fetch board health
export async function getBoardHealth(boardId) {
  return request(`/api/v2/boards/${boardId}/health`);
}

// Fetch pending drafts
export async function getBoardDrafts(boardId) {
  return request(`/api/v2/boards/${boardId}/drafts`);
}

// Commit a draft (with optional partial acceptance)
export async function commitDraft(boardId, draftId, acceptedIndices = null) {
  return request(`/api/v2/boards/${boardId}/drafts/${draftId}/commit`, {
    method: 'POST',
    body: JSON.stringify({ accepted_indices: acceptedIndices }),
  });
}

// Reject a draft
export async function rejectDraft(boardId, draftId) {
  return request(`/api/v2/boards/${boardId}/drafts/${draftId}/reject`, {
    method: 'POST',
  });
}

// Quick-link card as evidence to hypothesis
export async function quickLinkEvidence(boardId, cardId, hypothesisId, relationType = 'supports') {
  return request(`/api/v2/boards/${boardId}/quick-link`, {
    method: 'POST',
    body: JSON.stringify({ card_id: cardId, hypothesis_id: hypothesisId, relation_type: relationType }),
  });
}
```

---

## 13. Frontend Changes Summary

### 13.1 New Files

| File | Purpose |
|---|---|
| `components/GlobalChatPanel.jsx` | Floating chat panel for all pages (replaces BoardChatPanel) |
| `components/ChatMessage.jsx` | Markdown-rendered message component |
| `components/HealthSidebar.jsx` | Research health sidebar for thinking board |
| `components/HypothesisBar.jsx` | Per-hypothesis evidence balance bar |
| `components/DraftCommitBar.jsx` | Top bar for accepting/rejecting drafts |
| `components/DraftNode.jsx` | Custom ReactFlow node for draft preview |
| `components/EvidenceSuggestionToast.jsx` | Non-modal toast for card-to-evidence suggestion |
| `components/StoryHealthBadge.jsx` | Inline health annotation for story units |
| `hooks/useSurfaceContext.js` | Route-based surface context detection hook (Section 4.3) |

### 13.2 Modified Files

| File | Changes |
|---|---|
| `components/Layout.jsx` | Add `<GlobalChatPanel />` |
| `components/BoardChatPanel.jsx` | Remove (replaced by GlobalChatPanel) |
| `pages/ThinkingBoardPage.jsx` | Add HealthSidebar, DraftNode rendering, DraftCommitBar |
| `pages/ChatPage.jsx` | Replace raw text rendering with ChatMessage component |
| `pages/MaterialReaderPage.jsx` | Show EvidenceSuggestionToast after card save |
| `lib/store.js` | Extend `useChatStore` with `surfaceContext`/`mode` fields + threading (Section 4.4); add `boardInvalidateCounter` for board context bridge (Section 4.5) |
| `lib/api.js` | Add `surfaceContext`/`mode` params to `sendMessage`, add new API functions (Section 12) |
| `package.json` | Add react-markdown, remark-gfm |

### 13.3 New Dependencies

```json
{
  "react-markdown": "^9.0.0",
  "remark-gfm": "^4.0.0"
}
```

---

## 14. Visual Language: AI Suggestion Layer

Consistent visual treatment across all surfaces for AI contributions:

### 14.1 Color Palette

| Element | Color | Usage |
|---|---|---|
| AI accent | `#8B5CF6` (violet-500) | Draft node borders, AI badge, suggestion highlights |
| AI background | `#8B5CF620` (violet-500, 12% opacity) | Draft node fill, suggestion toast background |
| Accept | `#10B981` (emerald-500) | Accept button, confirmed nodes |
| Reject | `#EF4444` (red-500) | Reject button |
| Bias warning | `#F59E0B` (amber-500) | Health badge for bias_warning |
| No evidence | `#9CA3AF` (gray-400) | Health badge for no_evidence |
| Support bar | `#10B981` (emerald-500) | Evidence balance bar — supports |
| Refute bar | `#EF4444` (red-500) | Evidence balance bar — refutes |

### 14.2 Typography

- AI observation text: smaller font size (text-xs), muted color
- Health metrics: monospace numbers for alignment
- Hypothesis text in sidebar: truncated with ellipsis, full text on hover

### 14.3 Animation

- Draft nodes: subtle pulse animation on first appear (draws attention)
- Toast: slide up from bottom, fade out on dismiss
- Health sidebar: smooth transition on data update (bar width animation)

---

## 15. Implementation Phases

### Phase 1: Chat System (smallest blast radius, immediate UX improvement)

1. Add `react-markdown` + `remark-gfm` dependencies
2. Create `ChatMessage.jsx` component
3. Update ChatPage and GlobalChatPanel to use ChatMessage
4. Add UUID prohibition + output format guidance to promptBuilder
5. Add `mode` parameter to orchestrator + chat route
6. Create `GlobalChatPanel.jsx` with mode toggle
7. Add GlobalChatPanel to Layout.jsx
8. Remove BoardChatPanel

**Test:** Open any page → floating chat appears. Switch modes → chat mode can only query. Markdown renders correctly.

### Phase 2: Board Health Sidebar

9. Create `HealthSidebar.jsx` + `HypothesisBar.jsx`
10. Integrate into ThinkingBoardPage layout
11. Fetch health data on board load + after mutations

**Test:** Open a board with hypotheses → sidebar shows evidence balance. Create a hypothesis with 4 supports 0 refutes → bias warning appears.

### Phase 3: Draft Preview on Canvas

12. Create `DraftNode.jsx` custom ReactFlow node
13. Create `DraftCommitBar.jsx`
14. Add draft fetching + rendering to ThinkingBoardPage
15. Implement accept/reject flow (individual + bulk)
16. Add feedback messages to chat after commit/reject

**Test:** Ask AI to analyze a question → draft nodes appear on canvas with purple dashed borders. Accept all → real nodes created. Reject → drafts removed. Chat shows feedback.

### Phase 4: Evidence Suggestions + Story Annotations

17. Add `findEvidenceSuggestion()` to cards service
18. Add `quick-link` endpoint to boards route
19. Create `EvidenceSuggestionToast.jsx`
20. Integrate toast into card save flow
21. Create `StoryHealthBadge.jsx`
22. Integrate badges into document view

**Test:** Save a card related to an existing hypothesis → toast appears. Click "链接为证据" → evidence node created on board. View document → health badge appears on sections with bias warnings.

---

## 16. What This Spec Does NOT Cover

- **Methodology settings UI** — editing the methodology document/config in the frontend (backend API exists, frontend editor deferred)
- **WebSocket real-time updates** — health sidebar uses polling/refetch after mutations, not WebSocket
- **Mobile responsive layout** for floating chat — basic responsive, not full mobile optimization
- **Full conversation management UI** in GlobalChatPanel — basic "new conversation" button implemented; full conversation list/history browsing remains in ChatPage
- **Drag-to-reparent** for draft nodes — deferred to future iteration
