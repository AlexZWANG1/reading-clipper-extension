# Verity — System Architecture

> This document explains how the system exists in service of the product definition.
> Read `PRODUCT-SPEC.md` first. Architecture serves the product contract, not the other way around.

---

## 1. Architecture Serves the Product

Verity's architecture is designed to enforce three product commitments:

1. **Bounded AI autonomy** — the system controls what AI can and cannot do at runtime, based on context and stakes
2. **Visible research progression** — every AI action produces visible artifacts on user-facing surfaces
3. **Traceability** — every piece of data links to its source, and every AI decision is logged

The architecture is NOT designed to be a generic AI platform. Every component exists to support structured research with traceable reasoning.

---

## 2. System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     User-Facing Surfaces                     │
│                                                             │
│  Browser Extension     Web App (React SPA)                  │
│  (clip cards,          ├── Reader (material reading + AI)   │
│   import pages)        ├── Board (Q→H→E argument tree)      │
│                        ├── Cards (evidence browsing)        │
│                        ├── Memo (research report)           │
│                        ├── Journal (AI reasoning chain)     │
│                        └── Chat (floating, all surfaces)    │
└────────────┬──────────────────────────┬─────────────────────┘
             │                          │
             ▼                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Backend (Express.js, :3000)                      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ AI Orchestration Layer                               │    │
│  │  orchestrator → promptBuilder → toolGroups          │    │
│  │  → toolExecutor → planner → executor                │    │
│  │  → contextBudget                                    │    │
│  └──────────────────────┬──────────────────────────────┘    │
│                          │                                   │
│  ┌──────────────────────▼──────────────────────────────┐    │
│  │ Services                                             │    │
│  │  aiClient (multi-provider) │ ingestion │ search     │    │
│  │  supabase DAL │ rss │ tasks                         │    │
│  └──────────────────────┬──────────────────────────────┘    │
└──────────────────────────┼───────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │  Supabase    │  │  AI APIs     │  │  Sidecar     │
  │  (Postgres   │  │  (OpenAI,    │  │  (Python,    │
  │   + Auth     │  │   Anthropic, │  │   chunking   │
  │   + RLS)     │  │   Custom)    │  │   + embed)   │
  └──────────────┘  └──────────────┘  └──────────────┘
```

---

## 3. How Surfaces Map to Architecture

Each product surface has a clear architectural path:

| Surface | Frontend Route | Backend Path | Data Sources |
|---------|---------------|-------------|-------------|
| **Reader** | `/materials/:id` | materials API → ingestion → sidecar | materials, chunks (embeddings) |
| **Board** | `/topics/:topicId` | boards API → researchContext | board_nodes, board_edges, health_cache |
| **Cards** | `/` (home) | cards API | cards, topics |
| **Memo** | Board sub-tab | documents API | documents |
| **Journal** | Board sub-tab | research-runs API | research_runs, journal_entries |
| **Chat** | Floating (all pages) | chat API → orchestrator | conversations, conversation_messages |

**Key insight**: Chat is not a destination. It is a floating overlay that sends context-aware requests to the orchestrator. The orchestrator's response may produce artifacts on any surface (new cards, board drafts, report updates).

---

## 4. How Bounded AI Autonomy Works

The product requires AI autonomy to decrease as cognitive stakes increase. This is enforced at three levels:

### 4.1 Tool Safety Layer (compile-time)

Every tool in `tools.mjs` has a `side_effect` field:

```
read_only    → auto-execute (searching, listing, reading)
draft        → auto-execute but produces a draft, not real data
write        → requires user confirmation before execution
destructive  → requires user confirmation + warning
```

This classification is the foundation. The orchestrator reads it at runtime to decide whether to execute or pause.

### 4.2 Tool Group Layer (runtime context)

The orchestrator scopes which tools AI can use based on the current context:

```
chat mode (💬)   → explore group → only read_only tools
agent mode (🤖)  → surface-inferred group → read + write tools (with confirmation)
auto mode (✨)   → inferred by message + surface → adaptive
plan execution   → full group → all tools (user already approved the plan)
research run     → full group → all tools (user initiated the run)
```

This means AI literally cannot create data in chat mode — the tools don't exist in its context. This is enforced by code, not by prompt.

### 4.3 Confirmation Gate (runtime behavior)

When AI calls a write/destructive tool in agent mode:

1. Orchestrator pauses execution
2. Returns `pendingActions` to the frontend
3. Frontend shows a confirmation dialog with what AI wants to do
4. User approves → backend executes the tools
5. User rejects → nothing happens

For board changes specifically, the draft system adds an additional layer: AI calls `propose_board_changes`, which creates a visual draft on the canvas. The user can accept/reject individual nodes.

### 4.4 How This Maps to the Product

```
User asks a question in chat mode
  → AI can only search and read → answers based on existing data
  → User is safe — nothing changes

User asks AI to "create a card about X" in agent mode
  → AI calls create_card → orchestrator pauses → confirmation dialog
  → User approves → card created
  → User is in control

User starts a Research Run
  → AI has full tool access → creates cards, nodes, edges, report
  → But everything is logged in the journal → user can audit
  → User initiated the run, so autonomy is appropriate

User asks AI to "restructure the board"
  → AI calls propose_board_changes → draft nodes appear on canvas
  → User reviews and accepts/rejects each change
  → High-stakes structural changes are always drafts first
```

---

## 5. How Traceability Works

The product requires every piece of data to trace to its source. The architecture enforces this:

### 5.1 Data Lineage Chain

```
Source material (URL, PDF, document)
  → chunks (text segments with embeddings)
    → extractions (AI-identified claims with exact quotes)
      → cards (structured evidence with raw_snippet)
        → evidence nodes (on the board, with card_id)
          → edges (supports/refutes/neutral → hypothesis)
            → hypothesis (testable claim with confidence)
              → synthesis (report with card citations)
```

Each link is enforced by the data model:
- Cards must have `source_url` and `raw_snippet`
- Evidence nodes must have `card_id`
- Edges must have `relation_type` (supports/refutes/neutral)
- Evidence must have `parent_id` pointing to a hypothesis
- Hypotheses must have `parent_id` pointing to a question
- Report claims must reference card titles

### 5.2 Journal as Audit Trail

The research journal is not a log — it is a structured audit trail:

```sql
research_journal_entries:
  run_id      → which research run
  phase       → which phase (reading, decomposition, etc.)
  step_index  → ordering
  step_type   → what kind of step (material_analysis, mece_analysis, etc.)
  observation → what AI noticed (specific, not generic)
  reasoning   → how AI thought about it
  actions     → what AI decided to do (with counts)
  outcome     → what happened
  references  → { card_ids, node_ids, material_ids }
```

This structure means that for any card, hypothesis, or report claim, a user can trace backwards through the journal to see exactly why AI created it.

### 5.3 Methodology Guards (Code-Level Enforcement)

The toolExecutor validates board mutations before execution:

- Evidence nodes without `parent_id` → rejected (must link to hypothesis)
- Hypothesis nodes without `parent_id` → rejected (must link to question)
- Evidence parent is not a hypothesis → rejected (wrong hierarchy)
- Edge without valid `relation_type` → rejected

These guards cannot be bypassed by prompt engineering. They are code-level constraints that enforce the Q→H→E hierarchy.

---

## 6. Context-Aware AI

The product requires AI to know the user's context without being told. The architecture supports this through:

### 6.1 Surface Detection

The frontend detects the current surface from the URL route and sends `surface_context` with every chat message:

```
/topics/:topicId  → { surface: 'board', topicId }
/materials/:id    → { surface: 'reader', materialId }
/                 → { surface: 'cards' }
```

### 6.2 Dynamic Prompt Assembly

The `promptBuilder` constructs the system prompt from context:

```
BASE_IDENTITY (who AI is)
+ DATA_MODEL (what the data looks like)
+ IRON_CLAD_RULES (code-enforced constraints)
+ USER_METHODOLOGY (user's research methodology, if set)
+ RESEARCH_STATE (current hypothesis/evidence summary, if topic is active)
+ TOOL_GROUP_INSTRUCTIONS (what AI can do in this context)
+ MODE_INSTRUCTION (chat/agent/auto behavioral rules)
+ NEGATIVE_CONSTRAINTS (what AI must never do)
```

### 6.3 Token-Budgeted Context

The `contextBudget` module manages how much conversation history fits in the AI context window:

- Chinese text: 0.7 tokens/char
- English text: 0.25 tokens/char
- History loaded newest-first from DB, trimmed to fit budget
- After 20+ messages, a conversation summary is generated to compress history
- Tool results are compressed when approaching budget limits

This ensures AI always has the most recent and relevant context, even in long conversations.

---

## 7. Data Architecture

### 7.1 Core Data Model

```
users (Supabase Auth)
  ├── topics
  │     ├── cards (evidence units)
  │     ├── thinking_boards
  │     │     ├── board_nodes (question / hypothesis / evidence)
  │     │     ├── board_edges (supports / refutes / neutral)
  │     │     ├── board_drafts (AI-proposed changes, pending review)
  │     │     └── health_cache (computed evidence balance)
  │     ├── documents (memos, reports)
  │     └── research_state (JSONB — hypothesis summary, blind spots)
  │
  ├── materials (imported articles/documents)
  │     ├── chunks (text segments with embeddings)
  │     └── highlights (user annotations)
  │
  ├── conversations
  │     └── conversation_messages (chat history)
  │
  ├── research_runs
  │     └── research_journal_entries (AI reasoning chain)
  │
  ├── tasks (automated research tasks)
  │     ├── task_runs
  │     ├── task_run_steps
  │     └── task_proposals
  │
  ├── rss_subscriptions
  │     ├── rss_items
  │     └── rss_subscription_sync_states
  │
  └── user_methodologies (research methodology config)
```

### 7.2 Security Model

All data is user-scoped via Supabase Row Level Security (RLS):

- **User-scoped client** (`req.supabase`): Created per-request with user's JWT. RLS ensures data isolation.
- **Admin client** (`supabaseAdmin`): Bypasses RLS. Used only for system operations (task runner, RSS scheduler) where no user request context exists.

Rule: Every route handler receives `req.supabase` (user-scoped). Admin client is only used in background services.

---

## 8. AI Client Architecture

### 8.1 Multi-Provider Support

```
aiRuntime.mjs — configuration: proxy vs direct mode, endpoint building
aiClient.mjs — execution: unified call interface for any provider
```

**Proxy mode** (priority): `AI_PROXY_ENDPOINT` → all requests go through a single proxy.
**Direct mode** (fallback): `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` → direct to official APIs.

Anthropic messages/tools are translated to/from OpenAI format — the orchestrator always works in OpenAI format internally.

### 8.2 Resilience

- All AI calls have a 120-second timeout via AbortController
- API key encryption: AES-256-GCM for stored user API keys
- Token usage logging on all code paths
- Retry logic: one retry on malformed AI output, then fail with clear error

---

## 9. Key Design Decisions

### 9.1 AI-First Orchestration

**Decision**: All user chat input goes to AI. AI decides whether to answer directly, call tools, or request plan generation.

**Why**: Avoids brittle keyword-matching or intent-classification code. AI handles nuance and ambiguity naturally.

**Tradeoff**: Every interaction requires an AI call (adds latency and cost). Mitigated by tool group scoping — in chat mode, AI has fewer tools and simpler decisions.

### 9.2 Backend-Mediated Everything

**Decision**: Frontend never talks directly to Supabase. All requests go through the Express backend.

**Why**: AI orchestration (multi-step tool calls, plan execution, draft management) cannot run in the browser. Centralizing in the backend keeps the security model consistent and enables complex server-side workflows.

### 9.3 Draft System for Board Changes

**Decision**: AI cannot directly modify the board. All AI-proposed changes go through the draft system.

**Why**: The board is the argument structure — the highest-stakes artifact in the product. Direct mutations would violate the "AI autonomy decreases as stakes increase" principle. Drafts give the user visible, reviewable, individually-acceptible/rejectable proposals.

### 9.4 Token-Budgeted Context (Not Unlimited History)

**Decision**: Conversation history is trimmed to fit within the model's context budget, using newest-first loading and compression.

**Why**: Research conversations can be very long (50+ messages with tool results). Sending everything would exceed context limits or cause quality degradation. The budget system ensures the most relevant context is always present.

### 9.5 Fire-and-Forget Ingestion

**Decision**: Material import returns immediately; chunking + embedding happens asynchronously via sidecar.

**Why**: Chunking and embedding can take 10-60 seconds. Blocking the API response would make the UI feel broken. The user sees immediate feedback (material created, status: pending) and the material becomes fully functional when processing completes.

---

## 10. Technology Stack

### Backend
- **Runtime**: Node.js >= 18, Express.js 4.x
- **Database**: Supabase (PostgreSQL + Auth + RLS)
- **AI**: OpenAI SDK, custom Anthropic integration, proxy mode support
- **Testing**: Node.js native test runner (`node:test` + `node:assert/strict`)

### Frontend
- **Framework**: React 18 + React Router 6
- **State**: Zustand (multiple domain-specific stores)
- **Visualization**: @xyflow/react (React Flow) for thinking board
- **Styling**: TailwindCSS 3.x
- **Build**: Vite 5.x

### Supporting Services
- **Content extraction**: content-fetch-service (Express :8200, Readability + Puppeteer)
- **Chunking + Embedding**: ingestion-sidecar (Python :8100, Docling + Ollama)
- **Browser extension**: Chrome Manifest V3

---

## 11. For Future Contributors

When making architecture decisions, ask:

1. **Does this serve the product contract?** If a component doesn't contribute to structured research, traceability, or bounded AI autonomy — question whether it belongs.

2. **Does this preserve trust?** Any new AI capability must respect the autonomy ladder (read → draft → confirm → explicit approve). No shortcuts.

3. **Does this maintain traceability?** If new data is created, it must link to its source. If AI creates it, the journal must log the reasoning.

4. **Does this keep AI visible?** No hidden mutations, no silent side effects, no background changes the user can't see or audit.

5. **Is this the simplest solution?** Verity is a research tool, not a platform. Prefer focused solutions over extensible frameworks. Build for the current product, not hypothetical future products.
