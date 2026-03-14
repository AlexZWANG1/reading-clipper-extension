# Verity Research Run Spec
# AI-Driven Research Engine - Acceptance Criteria & Testing Method

> **One-line**: User gives a research question + materials. AI produces a populated workspace
> with evidence cards, Q/H/E argument graph, and a structured thinking journal —
> all traceable back to source material.

---

## 1. Product Philosophy

**UI is a visualization of AI's work, not a human-operated tool.**

- The primary "user" of the data model is the AI engine, not the human.
- Human's role: define research direction, provide materials, review AI's output.
- Every piece of data AI creates must be traceable to a reasoning step.
- The thinking journal is not a log — it's the product's core differentiator.

**Methodology as product:**

The MECE decomposition -> evidence mapping -> hypothesis verification pipeline
is not optional — it IS the product. AI must follow this methodology rigorously,
not just produce "some output".

---

## 2. Core Scenario: Research Run

### 2.1 Input

```
{
  "research_question": "string (user-defined, e.g. '中国新能源车出口欧洲面临哪些关键壁垒?')",
  "material_ids": ["uuid", "uuid", ...],   // 3-10 materials already in the system
  "topic_id": "uuid | null",               // existing topic or create new
  "config": {
    "depth": "standard | deep",            // controls how many sub-questions to explore
    "max_cards": 50,                        // budget limit
    "language": "zh"                        // output language
  }
}
```

### 2.2 Output (what the user sees in the workspace after completion)

1. **Evidence Cards** (in the topic) — 15-50 cards, each with:
   - title, summary, key_points, fact_or_view classification
   - source_url pointing back to the specific material
   - raw_snippet with the exact text extracted
   - note field containing AI's assessment of the evidence's relevance

2. **Argument Graph** (on the thinking board) — complete Q/H/E tree:
   - Root question node = the research question
   - 3-7 sub-question nodes (MECE decomposition)
   - 1-3 hypothesis nodes per sub-question
   - Evidence nodes linked to cards, with supports/refutes/neutral edges

3. **Research Journal** (new data structure) — structured thinking chain:
   - Ordered list of reasoning steps showing HOW AI reached its conclusions
   - Each step has: observation, reasoning, action, outcome
   - Cross-references to created cards/nodes

4. **Research Report** (stored as document/memo) — synthesized findings:
   - Executive summary
   - Per-sub-question analysis with evidence citations
   - Confidence assessment per hypothesis
   - Identified gaps and suggested next steps

### 2.3 Processing Phases

```
Phase 1: READING (read materials, extract raw evidence)
   |
Phase 2: DECOMPOSITION (MECE split of research question)
   |
Phase 3: EVIDENCE MAPPING (classify evidence -> sub-questions)
   |
Phase 4: HYPOTHESIS FORMATION (form hypotheses per sub-question)
   |
Phase 5: GAP ANALYSIS (identify weak spots, missing evidence)
   |
Phase 6: SYNTHESIS (generate report, finalize graph)
```

---

## 3. Phase Specifications

### Phase 1: READING

**Goal**: Deep-read each material and extract atomic evidence units.

**Input**: material_ids list
**Output**: Array of raw evidence extractions

**Process**:
1. For each material, retrieve all chunks (from the chunks table via material_id)
2. Send chunks to AI with extraction prompt
3. AI produces structured evidence items:
   ```json
   {
     "extractions": [
       {
         "claim": "EU plans to impose 38.1% anti-subsidy tariff on Chinese EVs",
         "type": "fact",
         "raw_text": "exact quote from the chunk",
         "chunk_id": "uuid",
         "relevance": "directly answers tariff barrier sub-question",
         "confidence": 0.95
       }
     ]
   }
   ```

**Thinking Journal Entry (Phase 1)**:
```json
{
  "phase": "reading",
  "step_type": "material_analysis",
  "material_id": "uuid",
  "material_title": "EU EV Tariff Policy Analysis",
  "observation": "This article contains 3 sections relevant to trade barriers...",
  "reasoning": "Sections 2 and 4 contain specific policy data points. Section 3 has industry opinions that should be classified as 'view' not 'fact'.",
  "actions": [
    { "action": "extract_evidence", "count": 7, "facts": 5, "views": 2 }
  ],
  "outcome": "Extracted 7 evidence items. Key finding: specific tariff rate data available."
}
```

**Acceptance Criteria - Phase 1**:
- [ ] AC1.1: Each material's chunks are retrieved and sent to AI
- [ ] AC1.2: Extractions include raw_text that is an exact substring of the original chunk
- [ ] AC1.3: Each extraction has fact/view classification
- [ ] AC1.4: A thinking journal entry is created for each material read
- [ ] AC1.5: Duplicate/near-duplicate extractions across materials are detected and merged
- [ ] AC1.6: At least 3 extractions per material on average (with real materials)

### Phase 2: DECOMPOSITION

**Goal**: Break the research question into MECE sub-questions.

**Input**: Research question + Phase 1 evidence summary
**Output**: Array of sub-questions

**Process**:
1. Feed research question + evidence overview to AI
2. AI produces MECE decomposition:
   ```json
   {
     "sub_questions": [
       {
         "id": "sq1",
         "text": "What are the tariff and trade policy barriers?",
         "rationale": "Multiple evidence items mention specific tariff rates and trade policies",
         "evidence_coverage": "strong",
         "mece_dimension": "policy/regulatory barriers"
       },
       {
         "id": "sq2",
         "text": "What are the technical standard and certification barriers?",
         "rationale": "Evidence suggests EU has distinct safety and environmental standards",
         "evidence_coverage": "moderate",
         "mece_dimension": "technical/compliance barriers"
       }
     ],
     "mece_validation": {
       "collectively_exhaustive": true,
       "mutually_exclusive": true,
       "reasoning": "Barriers are split by type: policy, technical, market, geopolitical. These categories don't overlap and cover all identified barrier types."
     }
   }
   ```

**Thinking Journal Entry (Phase 2)**:
```json
{
  "phase": "decomposition",
  "step_type": "mece_analysis",
  "observation": "From 23 evidence items across 3 materials, I identified 4 distinct barrier categories.",
  "reasoning": "I considered splitting by 'internal vs external barriers' but evidence clusters more naturally around barrier type (policy, technical, market, geopolitical). The MECE test: a tariff is policy-not-technical, a safety standard is technical-not-policy. Market acceptance (brand perception, dealer networks) is separate from both. Geopolitical risks (sanctions, political tensions) form their own category.",
  "actions": [
    { "action": "create_sub_questions", "count": 4 }
  ],
  "outcome": "4 MECE sub-questions created. Evidence coverage: 2 strong, 1 moderate, 1 weak (geopolitical — only 2 evidence items)."
}
```

**Acceptance Criteria - Phase 2**:
- [ ] AC2.1: 3-7 sub-questions are generated
- [ ] AC2.2: Each sub-question has a rationale explaining why it was chosen
- [ ] AC2.3: MECE validation is explicit — AI must state why questions are mutually exclusive and collectively exhaustive
- [ ] AC2.4: Evidence coverage assessment per sub-question
- [ ] AC2.5: Sub-questions are created as 'question' nodes on the thinking board with the root research question as parent
- [ ] AC2.6: A thinking journal entry captures the decomposition reasoning

### Phase 3: EVIDENCE MAPPING

**Goal**: Map Phase 1 extractions to sub-questions and create cards.

**Input**: Phase 1 extractions + Phase 2 sub-questions
**Output**: Evidence cards created and linked to the argument graph

**Process**:
1. For each extraction, determine which sub-question(s) it relates to
2. Create a card for each extraction (via create_card tool)
3. Create evidence nodes on the board linked to the card
4. Create edges (supports/refutes/neutral) between evidence and relevant hypotheses

**Thinking Journal Entry (Phase 3)**:
```json
{
  "phase": "evidence_mapping",
  "step_type": "classification",
  "observation": "23 evidence items need classification against 4 sub-questions.",
  "reasoning": "Evidence item 'EU 38.1% tariff' clearly maps to SQ1 (policy barriers). Evidence item 'Chinese EVs lack Euro NCAP ratings' maps to SQ2 (technical barriers). 3 items span multiple sub-questions — I'll duplicate them under each relevant question with cross-reference notes.",
  "actions": [
    { "action": "create_cards", "count": 23 },
    { "action": "create_evidence_nodes", "count": 26 },
    { "action": "map_to_sub_questions", "distribution": { "sq1": 8, "sq2": 6, "sq3": 7, "sq4": 5 } }
  ],
  "outcome": "All evidence mapped. Distribution is reasonably balanced. SQ4 (geopolitical) has the weakest coverage."
}
```

**Acceptance Criteria - Phase 3**:
- [ ] AC3.1: Every extraction becomes a card with complete fields (title, summary, key_points, fact_or_view, source_url, raw_snippet)
- [ ] AC3.2: Every card has an evidence node on the thinking board
- [ ] AC3.3: Evidence nodes are linked to the correct sub-question's hypothesis (or directly to the sub-question if no hypothesis yet)
- [ ] AC3.4: The mapping distribution is logged in the journal
- [ ] AC3.5: Cards that span multiple sub-questions are handled (duplicate evidence nodes with same card_id under different parents)

### Phase 4: HYPOTHESIS FORMATION

**Goal**: Form testable hypotheses for each sub-question based on evidence.

**Input**: Sub-questions + mapped evidence
**Output**: Hypothesis nodes on the board with evidence edges

**Process**:
1. For each sub-question, analyze the mapped evidence
2. Form 1-3 hypotheses per sub-question
3. Create hypothesis nodes as children of the sub-question
4. Re-link evidence nodes as children of the hypotheses
5. Create edges with supports/refutes/neutral classification

**Thinking Journal Entry (Phase 4)**:
```json
{
  "phase": "hypothesis_formation",
  "step_type": "hypothesis_generation",
  "sub_question": "sq1",
  "sub_question_text": "What are the tariff and trade policy barriers?",
  "observation": "8 evidence items under SQ1. 5 discuss tariffs directly, 2 discuss subsidy investigations, 1 discusses local content requirements.",
  "reasoning": "The tariff evidence is strongest (5 items with specific data). Subsidy investigations are ongoing and could escalate. Local content requirements are mentioned but less documented. I'll form 2 hypotheses: H1 about tariffs being the primary barrier (strong evidence), H2 about subsidy investigations creating uncertainty (moderate evidence).",
  "actions": [
    {
      "action": "create_hypothesis",
      "id": "h1",
      "claim": "Anti-subsidy tariffs (38.1%) are the single largest policy barrier to Chinese EV exports to Europe",
      "confidence": 0.85,
      "evidence_support": 5,
      "evidence_refute": 0
    },
    {
      "action": "create_hypothesis",
      "id": "h2",
      "claim": "Ongoing EU subsidy investigations create regulatory uncertainty that deters market entry investment",
      "confidence": 0.60,
      "evidence_support": 2,
      "evidence_refute": 0
    }
  ],
  "outcome": "2 hypotheses formed for SQ1. H1 has strong one-sided support (bias warning: no refuting evidence found). H2 has moderate support but no counter-evidence."
}
```

**Acceptance Criteria - Phase 4**:
- [ ] AC4.1: 1-3 hypotheses per sub-question
- [ ] AC4.2: Each hypothesis has a confidence score (0-1)
- [ ] AC4.3: Each hypothesis has at least 1 supporting evidence link
- [ ] AC4.4: Evidence edge relation_type (supports/refutes/neutral) is logically correct
- [ ] AC4.5: Hypothesis nodes are created as children of question nodes on the board
- [ ] AC4.6: AI explicitly notes when a hypothesis has only one-sided evidence (bias warning)
- [ ] AC4.7: Thinking journal captures the reasoning for each hypothesis

### Phase 5: GAP ANALYSIS

**Goal**: Identify weaknesses, biases, and missing evidence in the argument structure.

**Input**: Complete Q/H/E graph from Phases 2-4
**Output**: Gap report + updated research state

**Process**:
1. Run get_board_health to compute evidence balance
2. Analyze each hypothesis for bias (all supports, no refutes)
3. Check MECE completeness — are there barrier types not covered?
4. Identify sub-questions with weak evidence coverage

**Thinking Journal Entry (Phase 5)**:
```json
{
  "phase": "gap_analysis",
  "step_type": "critical_review",
  "observation": "Board health check reveals: 8 hypotheses total, 3 with bias warnings, 1 sub-question with only 2 evidence items.",
  "reasoning": "The analysis is skewed toward policy barriers (strong evidence) but weak on market barriers. No evidence refutes any hypothesis — this could mean the analysis is one-sided or that the materials provided don't contain counter-arguments. SQ4 (geopolitical) is particularly thin with only 2 items from 1 source — this is a reliability risk.",
  "actions": [
    {
      "action": "flag_bias",
      "hypotheses": ["h1", "h3", "h5"],
      "reason": "All supporting evidence, zero refuting"
    },
    {
      "action": "flag_weak_coverage",
      "sub_questions": ["sq3", "sq4"],
      "reason": "Less than 5 evidence items, single-source for SQ4"
    },
    {
      "action": "suggest_investigation",
      "suggestions": [
        "Seek materials about successful Chinese EV sales in Europe to counter H1",
        "Find European consumer surveys about Chinese EV brand perception for SQ3",
        "Look for geopolitical analysis from multiple sources for SQ4"
      ]
    }
  ],
  "outcome": "3 bias warnings, 2 weak coverage flags, 3 investigation suggestions generated."
}
```

**Acceptance Criteria - Phase 5**:
- [ ] AC5.1: Board health is computed and stored
- [ ] AC5.2: Each hypothesis with only supports (zero refutes) is flagged as bias warning
- [ ] AC5.3: Sub-questions with fewer than 3 evidence items are flagged as weak
- [ ] AC5.4: Single-source sub-questions are flagged as reliability risk
- [ ] AC5.5: At least 2 specific investigation suggestions are generated
- [ ] AC5.6: Gap analysis is captured in the thinking journal
- [ ] AC5.7: Research state on the topic is updated (topics.research_state column)

### Phase 6: SYNTHESIS

**Goal**: Generate a structured research report and finalize the workspace.

**Input**: Complete graph + gap analysis + all cards
**Output**: Research document stored as topic memo

**Process**:
1. Generate executive summary of findings
2. Per sub-question: state findings, cite evidence (by card title), assess confidence
3. Include gap analysis as "limitations and next steps"
4. Save as document via documents API

**Report Structure**:
```markdown
# Research Report: [Research Question]

## Executive Summary
[2-3 sentences synthesizing the key findings]

## Analysis

### [Sub-question 1]
**Finding**: [Core finding]
**Confidence**: [High/Medium/Low]
**Hypotheses**:
- H1: [claim] — [validated/pending/insufficient evidence]
  - Supporting evidence: [card titles with brief quotes]
  - Refuting evidence: [none found / card titles]

### [Sub-question 2]
...

## Identified Gaps
- [Gap 1]: [description + suggested investigation]
- [Gap 2]: ...

## Methodology Note
This analysis was conducted using MECE decomposition of the research question
into [N] sub-questions, with [N] evidence items extracted from [N] materials.
[N] hypotheses were formed, of which [N] have bias warnings (one-sided evidence).
```

**Acceptance Criteria - Phase 6**:
- [ ] AC6.1: A research document is created and saved (via documents API)
- [ ] AC6.2: Every claim in the report references at least one evidence card
- [ ] AC6.3: Confidence levels are consistent with evidence balance
- [ ] AC6.4: Gaps section includes actionable investigation suggestions
- [ ] AC6.5: The report is stored as the topic memo (accessible from workbench)
- [ ] AC6.6: Final thinking journal entry summarizes the complete run

---

## 4. Research Journal (Thinking Chain) Data Model

### 4.1 Schema

The research journal is stored per research run, attached to the topic.

```sql
-- New table: research_runs
CREATE TABLE research_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  topic_id UUID REFERENCES topics(id) NOT NULL,
  research_question TEXT NOT NULL,
  material_ids UUID[] NOT NULL,
  config JSONB DEFAULT '{}',
  status TEXT CHECK (status IN ('pending','running','completed','failed','cancelled'))
    DEFAULT 'pending',
  current_phase TEXT,            -- which phase is currently executing
  progress JSONB DEFAULT '{}',   -- { phase: status } map
  results JSONB DEFAULT '{}',    -- summary stats (cards_created, nodes_created, etc.)
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- New table: research_journal_entries
CREATE TABLE research_journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES research_runs(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  phase TEXT NOT NULL,           -- reading, decomposition, evidence_mapping, etc.
  step_index INTEGER NOT NULL,   -- ordering within the run
  step_type TEXT NOT NULL,       -- material_analysis, mece_analysis, classification, etc.
  observation TEXT,              -- what AI noticed
  reasoning TEXT,                -- how AI thought about it
  actions JSONB DEFAULT '[]',    -- what AI decided to do
  outcome TEXT,                  -- what happened
  references JSONB DEFAULT '{}', -- { card_ids: [], node_ids: [], material_ids: [] }
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_research_runs_topic ON research_runs(topic_id);
CREATE INDEX idx_research_runs_user ON research_runs(user_id);
CREATE INDEX idx_journal_entries_run ON research_journal_entries(run_id);
```

### 4.2 Journal Display Format (Frontend)

The journal is rendered as a collapsible thinking tree (option B from discussion):

```
Research Run: "中国新能源车出口欧洲面临哪些关键壁垒?"
Started: 2026-03-15 22:00 | Completed: 2026-03-15 22:34
Materials: 3 | Cards created: 23 | Hypotheses: 8

[Phase 1: Reading] ................................. completed
  |
  +-- Material 1/3: "EU EV Tariff Policy Analysis"
  |   Observation: This article contains 3 sections relevant to trade barriers...
  |   Reasoning: Sections 2 and 4 contain specific policy data points.
  |              Section 3 has industry opinions — classified as 'view' not 'fact'.
  |   -> Extracted 7 evidence items (5 facts, 2 views)
  |
  +-- Material 2/3: "Chinese Auto Industry Overseas Strategy Report"
  |   Observation: ...
  |   ...
  |
  +-- Material 3/3: "European Consumer EV Survey 2025"
      Observation: ...
      ...

[Phase 2: Decomposition] .......................... completed
  |
  +-- MECE Analysis
      Observation: From 23 evidence items across 3 materials, I identified
                   4 distinct barrier categories.
      Reasoning: I considered splitting by 'internal vs external barriers' but
                 evidence clusters more naturally around barrier type (policy,
                 technical, market, geopolitical). The MECE test: a tariff is
                 policy-not-technical, a safety standard is technical-not-policy...
      -> Created 4 sub-questions

[Phase 3: Evidence Mapping] ........................ completed
  |
  ...

[Phase 4: Hypothesis Formation] ................... completed
  |
  +-- Sub-question: "What are the tariff and trade policy barriers?"
      Observation: 8 evidence items under SQ1. 5 discuss tariffs directly...
      Reasoning: The tariff evidence is strongest (5 items with specific data).
                 I'll form 2 hypotheses: H1 about tariffs being the primary
                 barrier (strong evidence), H2 about subsidy investigations
                 creating uncertainty (moderate evidence).
      -> Created hypothesis: "Anti-subsidy tariffs (38.1%) are the single
         largest policy barrier" [confidence: 0.85, 5 supports, 0 refutes]
      -> Created hypothesis: "Ongoing EU subsidy investigations create
         regulatory uncertainty" [confidence: 0.60, 2 supports, 0 refutes]
  ...

[Phase 5: Gap Analysis] ........................... completed
  |
  +-- Critical Review
      Observation: 3 hypotheses with bias warnings, 1 sub-question weak.
      Reasoning: Analysis skewed toward policy barriers. No refuting evidence
                 found for any hypothesis — could be one-sided materials.
      -> Flagged 3 bias warnings
      -> Suggested 3 investigation directions

[Phase 6: Synthesis] .............................. completed
  |
  +-- Report generated: "中国新能源车出口欧盟壁垒分析"
      -> Saved as topic memo
```

---

## 5. Backend Architecture

### 5.1 New Module: `reading-cards-backend/src/agents/researchRun.mjs`

This is the core engine. It orchestrates the 6-phase pipeline.

```
researchRun.mjs
  |-- startResearchRun(input)     -> creates run record, starts pipeline
  |-- executePhase(runId, phase)  -> executes one phase
  |-- getRunStatus(runId)         -> returns current state + journal
  |-- cancelRun(runId)            -> cancels a running research run
```

**Key design decisions**:
- Each phase is an independent function that reads the run's current state and produces output
- Phase outputs are stored in the run's `progress` JSONB field
- Journal entries are written incrementally as the phase executes
- The pipeline can be resumed from any phase (idempotent per phase)
- AI calls use the same aiClient infrastructure (multi-vendor support)
- Cards and board nodes are created via the existing tool executor (reuse, not rewrite)

### 5.2 New API Routes

```
POST   /api/v2/research-runs              -> start a new research run
GET    /api/v2/research-runs/:id          -> get run status + results
GET    /api/v2/research-runs/:id/journal  -> get journal entries
DELETE /api/v2/research-runs/:id          -> cancel a running run
GET    /api/v2/research-runs              -> list runs (optionally by topic_id)
```

### 5.3 Integration with Existing Systems

The research run engine MUST use existing infrastructure:
- **Card creation**: via the same `create_card` tool executor path
- **Board manipulation**: via `propose_board_changes` or direct node/edge creation
- **Material reading**: via chunks table (already chunked and embedded)
- **AI calls**: via `aiClient.mjs` (respects user's AI provider settings)
- **Auth**: via requireAuth middleware (runs are user-scoped)
- **RLS**: all Supabase queries use user-scoped client

---

## 6. Frontend Requirements

### 6.1 Research Run Trigger

**Location**: Workbench page, when a topic is selected.

A "Research Run" button/action that opens a modal:
- Shows research question input (pre-filled from topic title)
- Shows material selector (checkboxes for materials in the system)
- Config options (depth, max_cards)
- "Start Research" button

**Alternative trigger**: From AI chat — user describes research intent,
AI recognizes it as a research run request, creates the run.

### 6.2 Research Journal View

**Location**: New tab in the workbench (alongside evidence cards, board, memo).

Displays the thinking chain in the format specified in section 4.2.

**Requirements**:
- Collapsible phase sections
- Each journal entry shows observation/reasoning/actions/outcome
- Cross-references to cards and board nodes are clickable
- Running state shows a spinner on the current phase
- Completed phases show a checkmark
- Failed phases show an error icon with the error message

### 6.3 Workspace Auto-Population

After a research run completes:
- Evidence Cards tab shows all created cards
- Board tab shows the complete Q/H/E graph
- Memo tab shows the generated research report
- Journal tab shows the thinking chain
- A toast notification: "Research run completed: 23 cards, 8 hypotheses, 4 sub-questions"

---

## 7. Acceptance Test Scenarios

### Test 1: Happy Path — Complete Research Run

**Setup**:
1. User has 3 materials imported (articles about a specific topic)
2. Materials have been chunked and embedded
3. User has created a topic

**Action**:
1. User triggers a research run with a clear research question
2. System executes all 6 phases

**Expected Result**:
- [ ] T1.1: Research run record created with status 'running'
- [ ] T1.2: Phase 1 reads all materials and produces extractions
- [ ] T1.3: Phase 2 produces 3-7 MECE sub-questions
- [ ] T1.4: Phase 3 creates cards (>= 10) with complete fields
- [ ] T1.5: Phase 4 creates hypotheses with confidence scores
- [ ] T1.6: Phase 5 produces gap analysis with bias warnings
- [ ] T1.7: Phase 6 generates a report saved as topic memo
- [ ] T1.8: Research run status = 'completed'
- [ ] T1.9: Journal has entries for all 6 phases
- [ ] T1.10: Workspace tabs (cards, board, memo) show the results

### Test 2: Quality — Evidence Traceability

**Validation** (can be automated):
- [ ] T2.1: Every card has a non-empty `raw_snippet` field
- [ ] T2.2: Every card's `raw_snippet` is a substring of some chunk's content
- [ ] T2.3: Every card has a `source_url` or `source_name`
- [ ] T2.4: Every evidence node on the board has a `card_id`
- [ ] T2.5: Every hypothesis has at least 1 evidence edge
- [ ] T2.6: The report doesn't contain claims not backed by cards

### Test 3: Quality — MECE Decomposition

**Validation**:
- [ ] T3.1: Sub-questions don't significantly overlap (AI must state why they're exclusive)
- [ ] T3.2: Sub-questions together cover the research question scope
- [ ] T3.3: No evidence item is "orphaned" (unmapped to any sub-question)

### Test 4: Quality — Thinking Journal

**Validation**:
- [ ] T4.1: Each journal entry has non-empty observation, reasoning, and outcome
- [ ] T4.2: Reasoning is specific (references actual data, not generic filler)
- [ ] T4.3: Actions array matches actual operations performed (card count matches)
- [ ] T4.4: Journal entries are ordered correctly by step_index

### Test 5: Error Resilience

**Scenarios**:
- [ ] T5.1: One material has no chunks (empty) — run continues with others
- [ ] T5.2: AI call fails mid-phase — run records error, can be retried
- [ ] T5.3: User cancels mid-run — partial results preserved, status = 'cancelled'

---

## 8. Quality Rubric for AI Output

When evaluating AI output quality (for manual review or AI self-evaluation):

### Evidence Card Quality (1-5 scale)

| Score | Description |
|-------|-------------|
| 1 | Generic summary with no specific claims or data |
| 2 | Has a claim but missing raw_snippet or wrong fact_or_view |
| 3 | Correct classification, has raw_snippet, but summary is verbose |
| 4 | Concise, accurate, well-classified, traceable to source |
| 5 | All of 4 + insightful key_points that add analytical value |

### Hypothesis Quality (1-5 scale)

| Score | Description |
|-------|-------------|
| 1 | Too vague to be testable ("barriers exist") |
| 2 | Testable but not well-supported by evidence |
| 3 | Testable, supported by evidence, but obvious/trivial |
| 4 | Testable, well-supported, non-obvious insight |
| 5 | All of 4 + correctly calibrated confidence score |

### Thinking Journal Quality (1-5 scale)

| Score | Description |
|-------|-------------|
| 1 | Generic filler ("I analyzed the materials") |
| 2 | Mentions specifics but reasoning is shallow |
| 3 | Shows real reasoning but skips important nuances |
| 4 | Detailed reasoning with specific evidence references |
| 5 | All of 4 + shows intellectual honesty (admits uncertainty, flags limitations) |

**Minimum acceptable**: Average score >= 3.5 across all dimensions.

---

## 9. Implementation Priority for Ralph Loop

### Priority 1 (Must have — the engine works)

1. Database migration (research_runs + research_journal_entries tables)
2. `researchRun.mjs` — core pipeline engine with all 6 phases
3. API routes (POST start, GET status, GET journal)
4. Integration: uses existing aiClient, tool executor, chunks table

### Priority 2 (Must have — user can see results)

5. Frontend: Research Run trigger (button + modal on workbench)
6. Frontend: Journal tab with thinking chain visualization
7. Frontend: Status indicator (running/completed/failed)

### Priority 3 (Should have — quality and polish)

8. MECE validation logic (AI explicitly validates its own decomposition)
9. Bias warning system in gap analysis
10. Report generation with proper evidence citations
11. Error handling and partial result preservation

### Priority 4 (Nice to have — delight)

12. Real-time progress updates (WebSocket or polling)
13. Clickable cross-references in journal (card_id -> scroll to card)
14. Research run history and comparison
15. Re-run with different materials

---

## 10. Testing Method for Automated Iteration

### How Ralph Loop should verify its work:

**Step 1: Schema test**
```bash
# Verify tables exist and have correct columns
curl -s $SUPABASE_URL/rest/v1/research_runs?select=id&limit=0 \
  -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY"
# Should return 200, not 404
```

**Step 2: API smoke test**
```bash
# Start a research run (with test data)
curl -X POST http://localhost:3000/api/v2/research-runs \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"research_question": "test question", "material_ids": [], "topic_id": null}'
# Should return 200 with { run_id, status: "running" }
```

**Step 3: Unit test for each phase**
```javascript
// Test file: reading-cards-backend/tests/research-run.test.mjs
// Each phase function should be independently testable with mock data
```

**Step 4: Integration test**
```javascript
// Start a run with real materials
// Wait for completion (poll status endpoint)
// Verify:
//   - cards created (count > 0)
//   - board nodes created (questions, hypotheses, evidence)
//   - journal entries created (one per phase minimum)
//   - document/memo created
//   - research_state updated on topic
```

**Step 5: Quality self-check**
```javascript
// After run completes, verify traceability:
// - For each card: raw_snippet is substring of some chunk
// - For each hypothesis: at least 1 evidence edge exists
// - For each evidence node: card_id points to existing card
// - Journal entry count >= 6 (one per phase)
// - Report contains no claims without card references
```

---

## 11. Non-Goals (Explicitly Out of Scope)

- External web search (Tavily, Serper, etc.) — future phase
- Multi-user collaboration on research runs
- Scheduling/recurring research runs
- PDF/DOCX upload within research run flow (use existing material import)
- Custom methodology templates (use hardcoded MECE approach for now)
- Real-time streaming of AI thinking (use polling for now)
- Mobile responsiveness of journal view

---

## 12. Success Definition

**The Research Run is successful when:**

A user can import 3 articles about a topic, click "Start Research",
go make coffee, and come back to find:

1. A workspace populated with 15-30 well-structured evidence cards
2. A thinking board with a clear Q -> H -> E tree
3. A research report in the memo tab with cited evidence
4. A thinking journal showing exactly how AI reasoned through the problem

And when they read the thinking journal, they think:
**"This is how I would have analyzed it, but it would have taken me 3 hours."**

That's the bar.
