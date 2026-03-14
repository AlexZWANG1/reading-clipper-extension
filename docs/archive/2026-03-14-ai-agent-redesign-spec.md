# Verity AI Agent Redesign: Complete Specification

> **Date**: 2026-03-14
> **Status**: Approved
> **Scope**: Backend AI agent system redesign — methodology knowledge layer, tool groups, dynamic prompt, research context, draft engine, methodology guards

---

## 1. Product Vision

**Core Insight**: AI is a cognitive mirror, not a cognitive replacement. AI makes the user's thinking visible to themselves.

**Current Problems**:
1. AI has no persistent methodology understanding — every conversation starts from scratch
2. AI can exceed its authority — e.g., creating cards when user only asked to list them (bug confirmed)
3. 400-line monolithic system prompt with poor compliance
4. All 16 tools exposed to AI at all times regardless of context
5. Board operations require 30+ round-trips for a single subtree

**Design Philosophy**:
- Iron-clad rules in code (data integrity), soft rules in user-editable methodology doc (thinking approach)
- Single floating chat entry point, context-aware output adapting to current surface
- Human reviews RESULTS on canvas, not PROCESS in chat
- AI autonomy decreases as cognitive stakes increase

---

## 2. Architecture Overview

```
Floating Chat (sole AI entry point, all pages)
  │ detects current surface (board / reader / cards / general)
  │
  ▼
Orchestrator (modular)
  1. detect surface context (from route)
  2. detect topic context → load research_state from DB
  3. load user methodology.md → inject into prompt
  4. inferToolGroup(message, surface) → scope tool set
  5. promptBuilder assembles dynamic system prompt
  6. AI calls scoped tools
     → read_only: auto-execute
     → draft: execute (creates preview, not real data)
     → write: confirm gate
     → destructive: confirm with warning
  7. post-action hooks: recompute research_state in background
  │
  ├── Iron-clad Layer (code guards in toolExecutor)
  │   - Q→H→E hierarchy enforced
  │   - Evidence must have parent_id → hypothesis
  │   - Edge relation_type must be supports/refutes/neutral
  │   - AI cannot create/modify without user awareness
  │
  ├── Methodology Layer (user-editable knowledge)
  │   - methodology.md: natural language (AI reads, injected into prompt)
  │   - methodology config: structured JSON (code reads for health computation)
  │   - 3 preset templates: MECE, 5 Whys, First Principles
  │
  └── AI Runtime (unchanged)
      - aiClient.mjs, aiRuntime.mjs
      - Multi-provider support (OpenAI, Anthropic, Custom)
```

---

## 3. Methodology Knowledge Layer (Approach A — Hybrid)

### 3.1 Data Model

New table: `user_methodologies`

```sql
CREATE TABLE IF NOT EXISTS user_methodologies (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '默认方法论',
  document TEXT NOT NULL DEFAULT '',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  base_template TEXT CHECK (base_template IN ('mece', '5whys', 'first_principles')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only one active methodology per user
CREATE UNIQUE INDEX idx_user_active_methodology
  ON user_methodologies(user_id) WHERE is_active = true;

-- RLS
ALTER TABLE user_methodologies ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_methodologies_policy ON user_methodologies
  FOR ALL USING (auth.uid() = user_id);

-- Auto-update trigger
CREATE TRIGGER update_user_methodologies_updated_at
  BEFORE UPDATE ON user_methodologies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 3.2 Methodology Document (Natural Language, AI reads)

User sees a markdown editor. Template pre-filled, freely editable:

```markdown
# 研究方法论

## 问题分解
使用 MECE（互斥穷尽）原则分解根问题为 3-5 个子问题。
每个子问题应该独立可回答，且所有子问题合起来覆盖根问题的全部范围。

## 假说生成
每个子问题生成 2-3 个可证伪的假说。
假说应该具体、可测试，避免模糊表述。

## 证据评估
评估证据时优先考虑：
1. 数据时效性（优先最近 2 年的数据）
2. 来源权威性（优先学术论文和行业报告）
3. 同时搜索支持和反对证据，避免确认偏误

## 结论标准
假说需要至少 3 条独立来源的证据才能视为"充分支持"。
如果支持证据远多于反对证据，主动提醒可能存在盲点。
```

### 3.3 Methodology Config (Structured JSON, code reads)

```json
{
  "bias_warning": {
    "enabled": true,
    "min_support_for_warning": 3,
    "max_oppose_for_warning": 0
  },
  "evidence_sufficiency": {
    "min_evidence_per_hypothesis": 3
  },
  "ai_proactivity": "medium",
  "card_style": {
    "max_key_points": 5,
    "summary_length": "concise"
  },
  "decomposition_method": "mece",
  "counter_evidence_search": "auto"
}
```

### 3.4 Preset Templates

| Template | Decomposition | Best For |
|---|---|---|
| **MECE** (default) | Mutually Exclusive, Collectively Exhaustive | Business analysis, policy research |
| **First Principles** | Reason up from basic facts | Technical research, innovation |
| **5 Whys** | Iterative root-cause questioning | Problem diagnosis, incident analysis |

### 3.5 Runtime Consumption

```
promptBuilder.mjs:
  1. Load user's active methodology document from DB
  2. Truncate to ~400 tokens (prevent prompt bloat)
  3. Inject into system prompt METHODOLOGY section

researchContext.mjs:
  1. Load user's methodology config from DB
  2. Use config.bias_warning params to drive health computation
  3. Use config.evidence_sufficiency params for "insufficient" warnings

AI sees:
  "## 用户的研究方法论\n{document content}\n\n请按照上述方法论指导你的分析和建议。"

Code reads:
  config.bias_warning.min_support_for_warning === 3  → exact comparison
```

---

## 4. Tool Groups & Dynamic Prompt

### 4.1 Tool Group Definitions

```javascript
const TOOL_GROUPS = {
  explore: ['semantic_search', 'search_cards', 'list_cards', 'get_card',
            'list_topics', 'list_sources', 'list_boards', 'list_documents', 'get_document'],

  board:   ['get_board', 'propose_board_changes', 'search_cards', 'semantic_search',
            'get_card', 'list_cards', 'update_board_node', 'delete_board_node'],

  cards:   ['create_card', 'search_cards', 'list_cards', 'get_card',
            'semantic_search', 'list_topics'],

  ingest:  ['ingest_url', 'fetch_rss', 'semantic_search', 'search_cards',
            'list_cards', 'list_topics'],

  full:    [/* all tools — only for plan execution */]
};
```

### 4.2 Inference Logic

```javascript
function inferToolGroup(userMessage, surfaceContext) {
  // Priority 1: Surface context
  if (surfaceContext?.surface === 'board')  return 'board';
  if (surfaceContext?.surface === 'reader') return 'cards';

  // Priority 2: Keywords
  const msg = userMessage.toLowerCase();
  if (/假[设说]|hypothes|证据|evidence|画板|board|分解|decompos/.test(msg)) return 'board';
  if (/创建卡片|create card|保存|save|生成卡片/.test(msg))                  return 'cards';
  if (/摄入|ingest|rss|feed|url|订阅/.test(msg))                           return 'ingest';

  // Priority 3: Default — explore (read-only, safe)
  return 'explore';
}
```

### 4.3 Dynamic Prompt Assembly

```javascript
function buildSystemPrompt({ surfaceContext, methodology, researchState, toolGroup }) {
  const parts = [];

  // Always included (~100 words)
  parts.push(BASE_IDENTITY);
  parts.push(DATA_MODEL_BRIEF);
  parts.push(IRON_CLAD_RULES);

  // User methodology (~truncated to 400 tokens)
  if (methodology?.document) {
    parts.push(`## 用户的研究方法论\n${truncate(methodology.document, 400)}\n\n请按照上述方法论指导你的分析和建议。`);
  }

  // Research state (variable length)
  if (researchState && Object.keys(researchState).length > 0) {
    parts.push(`## 当前研究状态\n${formatResearchState(researchState)}`);
  }

  // Tool-group specific instructions (~50 words each)
  parts.push(TOOL_GROUP_INSTRUCTIONS[toolGroup]);

  // Negative constraints (critical for preventing AI overreach)
  parts.push(NEGATIVE_CONSTRAINTS);

  return parts.join('\n\n');
}
```

### 4.4 Prompt Constants

**BASE_IDENTITY** (~80 words):
```
You are a research assistant for "Verity" (求真), an evidence-driven research workbench.
Answer in the same language the user uses. Be concise and helpful.
Always ground your answers in the user's actual data — call tools to look up data before answering.
```

**DATA_MODEL_BRIEF** (~80 words):
```
Data model: Topics contain Cards (knowledge units with summary, key_points, fact/view classification).
Each topic can have one Thinking Board with nodes (question → hypothesis → evidence tree) and edges (supports/refutes/neutral).
Materials are ingested documents with embeddings for semantic search.
```

**IRON_CLAD_RULES** (~60 words):
```
Hard rules enforced by code:
- Evidence nodes must have parent_id pointing to a hypothesis
- Hypothesis nodes must have parent_id pointing to a question
- Edges must have relation_type: supports, refutes, or neutral
- If code rejects your tool call, read the error and self-correct
```

**NEGATIVE_CONSTRAINTS** (~40 words):
```
ABSOLUTE PROHIBITION:
- NEVER create, modify, or delete any data unless the user explicitly asks
- When user asks for information, ONLY use read tools to look up and answer
- NEVER fabricate data — always call tools to look up real data
```

**TOOL_GROUP_INSTRUCTIONS**:
```javascript
const TOOL_GROUP_INSTRUCTIONS = {
  explore: 'You have read-only tools. Search and list data to answer questions. You cannot create or modify anything.',
  board:   'You can read board state and propose batch changes via propose_board_changes. Use it INSTEAD of individual create_board_node calls. Changes appear as drafts on the canvas for user review.',
  cards:   'You can create cards and search existing ones. Always confirm the topic before creating.',
  ingest:  'You can ingest URLs and fetch RSS feeds. Always confirm before ingesting.',
  full:    'You have all tools available. This is plan execution mode.',
};
```

---

## 5. Research Context & Health Computation

### 5.1 Data Model Changes

```sql
ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS research_state JSONB DEFAULT '{}'::jsonb;

ALTER TABLE thinking_boards
  ADD COLUMN IF NOT EXISTS health_cache JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS health_computed_at TIMESTAMPTZ;
```

### 5.2 Computation Logic (No AI calls)

```javascript
// researchContext.mjs
async function computeResearchState(supabase, topicId, methodologyConfig) {
  const board = await loadBoardForTopic(supabase, topicId);
  if (!board) return {};

  const nodes = board.nodes || [];
  const edges = board.edges || [];

  const biasConfig = methodologyConfig?.bias_warning ?? { enabled: true, min_support_for_warning: 3, max_oppose_for_warning: 0 };
  const sufficiency = methodologyConfig?.evidence_sufficiency?.min_evidence_per_hypothesis ?? 3;

  const hypotheses = nodes.filter(n => n.node_type === 'hypothesis');
  const evidenceNodes = nodes.filter(n => n.node_type === 'evidence');
  const questions = nodes.filter(n => n.node_type === 'question');

  const perHypothesis = hypotheses.map(h => {
    const relatedEdges = edges.filter(e => e.target_node_id === h.id || e.source_node_id === h.id);
    const support = relatedEdges.filter(e => e.relation_type === 'supports').length;
    const refute  = relatedEdges.filter(e => e.relation_type === 'refutes').length;
    const neutral = relatedEdges.filter(e => e.relation_type === 'neutral').length;
    const total   = support + refute + neutral;

    let status = 'no_evidence';
    if (total === 0) status = 'no_evidence';
    else if (total < sufficiency) status = 'insufficient';
    else if (biasConfig.enabled && support >= biasConfig.min_support_for_warning && refute <= biasConfig.max_oppose_for_warning)
      status = 'bias_warning';
    else if (support > refute * 2) status = 'strong_support';
    else if (refute > support * 2) status = 'strong_against';
    else status = 'mixed';

    return {
      node_id: h.id, text: h.claim || h.content?.text || '',
      support, refute, neutral, total, status,
      confidence: h.confidence, hypo_state: h.hypo_state
    };
  });

  const linkedCardIds = new Set(evidenceNodes.map(e => e.card_id).filter(Boolean));

  return {
    hypotheses_summary: perHypothesis,
    total_questions: questions.length,
    total_hypotheses: hypotheses.length,
    total_evidence: evidenceNodes.length,
    blind_spots: perHypothesis.filter(h => h.status === 'bias_warning' || h.status === 'no_evidence').length,
    unanswered_questions: questions.filter(q => q.status === 'open').length,
    linked_card_ids: [...linkedCardIds],
    computed_at: new Date().toISOString()
  };
}

function formatResearchStateForPrompt(state) {
  if (!state || !state.hypotheses_summary?.length) return '';
  const lines = [`假说数: ${state.total_hypotheses}, 证据数: ${state.total_evidence}, 盲点: ${state.blind_spots}`];
  for (const h of state.hypotheses_summary) {
    lines.push(`- "${h.text}" → ${h.support}支持/${h.refute}反对 [${h.status}]`);
  }
  if (state.unanswered_questions > 0) {
    lines.push(`${state.unanswered_questions} 个问题尚未有假说`);
  }
  return lines.join('\n');
}
```

### 5.3 When to Compute

- After every board node/edge creation, update, or deletion (fire-and-forget background call)
- At conversation start when topic is detected (check staleness: recompute if > 5 minutes old)
- When frontend requests health endpoint (with staleness check)

---

## 6. Draft Engine

### 6.1 Data Model

```sql
CREATE TABLE IF NOT EXISTS board_drafts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES thinking_boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  reasoning TEXT,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','partially_accepted','rejected','expired')),
  accepted_changes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

ALTER TABLE board_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY board_drafts_policy ON board_drafts
  FOR ALL USING (auth.uid() = user_id);
```

### 6.2 Changes Array Format

```json
[
  {
    "action": "create_node",
    "temp_id": "t1",
    "node_type": "hypothesis",
    "text": "Pricing is the primary churn driver",
    "parent_id": "existing-question-uuid"
  },
  {
    "action": "create_node",
    "temp_id": "t2",
    "node_type": "evidence",
    "text": "Survey data shows 68% cite cost",
    "parent_id": "$t1",
    "card_id": "existing-card-uuid"
  },
  {
    "action": "create_edge",
    "source_node_id": "$t2",
    "target_node_id": "$t1",
    "relation_type": "supports"
  }
]
```

### 6.3 Key Functions

- `createDraft(supabase, userId, boardId, changes, reasoning)` — Validate + store
- `commitDraft(supabase, draftId, acceptedIndices)` — Resolve $temp_id refs → create real nodes/edges
- `rejectDraft(supabase, draftId)` — Set status to rejected
- `listPendingDrafts(supabase, boardId)` — Return pending drafts

### 6.4 $temp_id Resolution at Commit

```javascript
async function commitDraft(supabase, draftId, acceptedIndices = null) {
  const draft = await getDraft(supabase, draftId);
  const changes = acceptedIndices
    ? draft.changes.filter((_, i) => acceptedIndices.includes(i))
    : draft.changes;

  const idMap = {}; // { "t1": "real-uuid-1", ... }

  for (const change of changes) {
    if (change.action === 'create_node') {
      const parentId = resolveRef(change.parent_id, idMap);
      const cardId = resolveRef(change.card_id, idMap);
      const node = await createBoardNode(supabase, {
        board_id: draft.board_id,
        node_type: change.node_type,
        text: change.text,
        parent_id: parentId,
        card_id: cardId,
      });
      if (change.temp_id) idMap[change.temp_id] = node.id;
    } else if (change.action === 'create_edge') {
      await createBoardEdge(supabase, {
        board_id: draft.board_id,
        source_node_id: resolveRef(change.source_node_id, idMap),
        target_node_id: resolveRef(change.target_node_id, idMap),
        relation_type: change.relation_type,
      });
    }
  }

  await updateDraftStatus(supabase, draftId,
    acceptedIndices ? 'partially_accepted' : 'accepted',
    acceptedIndices ? { accepted: acceptedIndices } : null
  );
}

function resolveRef(value, idMap) {
  if (!value) return value;
  if (typeof value === 'string' && value.startsWith('$')) {
    return idMap[value.slice(1)] || value;
  }
  return value;
}
```

---

## 7. Methodology Guards (toolExecutor)

### 7.1 Pre-execution Validation

```javascript
// In toolExecutor.mjs, before executing board mutations:

function validateBoardMutation(toolName, args, boardData) {
  const errors = [];

  if (toolName === 'create_board_node') {
    if (args.node_type === 'evidence' && !args.parent_id) {
      errors.push({
        error: 'methodology_violation',
        message: 'Evidence nodes must have parent_id pointing to a hypothesis node.',
        suggestion: 'Call get_board first to find the relevant hypothesis, then set parent_id.'
      });
    }
    if (args.node_type === 'hypothesis' && !args.parent_id) {
      errors.push({
        error: 'methodology_violation',
        message: 'Hypothesis nodes must have parent_id pointing to a question node.',
        suggestion: 'Call get_board first to find the relevant question, then set parent_id.'
      });
    }
    if (args.node_type === 'evidence' && !args.card_id) {
      errors.push({
        error: 'methodology_violation',
        message: 'Evidence nodes should have card_id linking to a source card.',
        suggestion: 'Search for a relevant card first, or create one, then set card_id.'
      });
    }
    // Validate parent type matches hierarchy
    if (args.parent_id && boardData) {
      const parent = boardData.nodes?.find(n => n.id === args.parent_id);
      if (parent) {
        if (args.node_type === 'hypothesis' && parent.node_type !== 'question') {
          errors.push({
            error: 'methodology_violation',
            message: `Hypothesis parent must be a question node, but got ${parent.node_type}.`,
          });
        }
        if (args.node_type === 'evidence' && parent.node_type !== 'hypothesis') {
          errors.push({
            error: 'methodology_violation',
            message: `Evidence parent must be a hypothesis node, but got ${parent.node_type}.`,
          });
        }
      }
    }
  }

  if (toolName === 'create_board_edge') {
    if (!['supports', 'refutes', 'neutral'].includes(args.relation_type)) {
      errors.push({
        error: 'methodology_violation',
        message: `relation_type must be supports, refutes, or neutral. Got "${args.relation_type}".`,
      });
    }
  }

  return errors;
}
```

---

## 8. New propose_board_changes Tool

```javascript
{
  type: "function",
  function: {
    name: "propose_board_changes",
    description: "Propose a batch of related changes to a thinking board. Creates a visual draft for user review on the canvas. Use this INSTEAD of individual create_board_node/create_board_edge calls when making multiple related changes. Changes can reference each other using $temp_id syntax.",
    parameters: {
      type: "object",
      properties: {
        board_id: { type: "string", description: "The board ID" },
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["create_node", "create_edge"] },
              temp_id: { type: "string", description: "Temp ID for cross-referencing (e.g. 't1')" },
              node_type: { type: "string", enum: ["question", "hypothesis", "evidence"] },
              text: { type: "string" },
              parent_id: { type: "string", description: "Real UUID or $temp_id reference (e.g. '$t1')" },
              card_id: { type: "string", description: "Card UUID for evidence nodes" },
              source_node_id: { type: "string" },
              target_node_id: { type: "string" },
              relation_type: { type: "string", enum: ["supports", "refutes", "neutral"] }
            },
            required: ["action"]
          }
        },
        reasoning: { type: "string", description: "Why these changes are proposed" }
      },
      required: ["board_id", "changes", "reasoning"]
    }
  },
  side_effect: "draft",
  task_auto: false
}
```

---

## 9. Orchestrator Changes

### 9.1 Modified chat() Function

Key changes to `orchestrator.mjs`:
1. Accept `surfaceContext` parameter
2. Detect topic from surface or conversation
3. Load methodology + research state
4. Build dynamic prompt via promptBuilder
5. Scope tools via toolGroups
6. Handle "draft" side_effect type (execute immediately, return draft_id)
7. Post-action hooks for research state recomputation

### 9.2 Modified chatWithConversation()

Add topic detection logic:
- If surface has topicId → use it
- Else check conversation's associated task for topic_id
- Else check recent tool calls for board_id → lookup topic

Pass surfaceContext to chat().

---

## 10. API Endpoints

### New Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v2/methodology` | Get user's active methodology |
| PUT | `/api/v2/methodology` | Create/update methodology |
| GET | `/api/v2/methodology/templates` | List preset templates |
| GET | `/api/v2/boards/:id/health` | Get board health (recompute if stale) |
| GET | `/api/v2/boards/:boardId/drafts` | List pending drafts |
| POST | `/api/v2/boards/:boardId/drafts/:draftId/commit` | Commit draft (full or partial) |
| POST | `/api/v2/boards/:boardId/drafts/:draftId/reject` | Reject draft |

### Modified Endpoints

| Endpoint | Change |
|---|---|
| `POST /api/v2/chat` | Accept `surface_context` parameter |

---

## 11. Implementation Phases

### Phase 1: Foundation (fix bug + research context + methodology)
**New files:**
- `reading-cards-backend/src/chat/promptBuilder.mjs`
- `reading-cards-backend/src/chat/toolGroups.mjs`
- `reading-cards-backend/src/agents/researchContext.mjs`
- `reading-cards-backend/supabase/migrations/020_research_methodology.sql`

**Modified files:**
- `reading-cards-backend/src/chat/orchestrator.mjs` — dynamic prompt, scoped tools, negative constraints, surface context

### Phase 2: Methodology Knowledge Layer
**New files:**
- `reading-cards-backend/src/config/methodology-templates/mece.md`
- `reading-cards-backend/src/config/methodology-templates/first-principles.md`
- `reading-cards-backend/src/config/methodology-templates/5whys.md`
- `reading-cards-backend/src/routes/v2/methodology.mjs`

**Modified files:**
- `reading-cards-backend/src/server.mjs` — mount methodology routes

### Phase 3: Draft Engine + Methodology Guards
**New files:**
- `reading-cards-backend/src/agents/draftEngine.mjs`
- `reading-cards-backend/supabase/migrations/021_board_drafts.sql`

**Modified files:**
- `reading-cards-backend/src/chat/tools.mjs` — add propose_board_changes, get_board_health
- `reading-cards-backend/src/chat/toolExecutor.mjs` — draft case, methodology guards, post-action hooks
- `reading-cards-backend/src/routes/v2/boards.mjs` — health + draft endpoints

### Phase 4: Frontend — Floating Chat + Health Sidebar + Draft Nodes
(Frontend changes deferred to separate spec)

---

## 12. Files Summary

### New Files (Backend)

| File | Purpose |
|---|---|
| `src/chat/promptBuilder.mjs` | Dynamic system prompt assembly |
| `src/chat/toolGroups.mjs` | Tool group definitions + inference |
| `src/agents/researchContext.mjs` | Research state computation (no AI calls) |
| `src/agents/draftEngine.mjs` | Board draft CRUD + $temp_id resolution |
| `src/routes/v2/methodology.mjs` | Methodology CRUD API |
| `src/config/methodology-templates/*.md` | 3 preset templates |
| `supabase/migrations/020_research_methodology.sql` | New tables + columns |
| `supabase/migrations/021_board_drafts.sql` | Board drafts table |

### Modified Files (Backend)

| File | Changes |
|---|---|
| `src/chat/orchestrator.mjs` | Topic detection, dynamic prompt, scoped tools, surface context, draft handling |
| `src/chat/tools.mjs` | +propose_board_changes, +get_board_health, +draft side_effect |
| `src/chat/toolExecutor.mjs` | +methodology guards, +draft case, +post-action hooks |
| `src/routes/v2/boards.mjs` | +health endpoint, +draft endpoints |
| `src/server.mjs` | Mount methodology routes |

### Unchanged Files

Everything else: Express server config, auth middleware, all existing routes (auth, cards, topics, documents, materials, search, highlights, rss, conversations, tasks, sources, invites, prompts, settings), AI client abstraction, RSS services, ingestion service, all existing agents, all existing Supabase service modules, all existing migrations.
