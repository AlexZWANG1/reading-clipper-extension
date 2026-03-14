# Verity (求真) — Product Specification

> An AI-native research workbench where structured thinking is the product.
> Users bring questions and materials. AI produces traceable reasoning, structured evidence, and actionable synthesis.

---

## 1. What Verity Is

Verity is a **thought-formation system**. It is a structured environment where AI helps turn messy reading materials into questions, hypotheses, evidence, and synthesis — all traceable back to source material.

The product is not a tool the user operates step by step. It is a workspace where:

- The user defines the research direction and provides materials.
- AI does the heavy analytical lifting: reading, decomposing, classifying, hypothesizing, identifying gaps.
- The user reviews AI's structured output on visible surfaces (board, cards, memo, journal).
- Every claim, hypothesis, and synthesis is traceable to source evidence.
- The methodology (how thinking is structured) is part of the product, not an afterthought.

**Core metaphor**: AI is a research associate who reads all your materials, follows a rigorous methodology, and presents structured findings on a shared workspace — where you can see not just what it concluded, but how it reasoned.

---

## 2. What Verity Is NOT

- **Not a chatbot.** Chat exists, but it is the orchestration layer — a way to direct the AI — not the product itself. If all a user does is chat, the product has failed.
- **Not a note-taking app.** Cards exist, but they are intermediate knowledge units produced through research, not the end goal. This is not Notion, Obsidian, or a "second brain."
- **Not a workflow automation shell.** AI follows a research methodology, not arbitrary task pipelines.
- **Not a marketplace for expert methodologies.** The product ships with one methodology (MECE-based structured reasoning). Users can tune it, but methodology is a built-in commitment, not a plugin ecosystem.
- **Not a generic AI workspace.** Every AI action serves one purpose: advancing a research problem through structured thinking.

---

## 3. Who It's For

### 3.1 Core User Archetype

**The Independent Analyst** — someone who regularly faces a question that requires:
1. Reading 3-20 documents or articles
2. Extracting relevant evidence from those documents
3. Structuring the evidence into an argument or analysis
4. Identifying what they know, what they don't know, and where their reasoning has blind spots
5. Producing a synthesis (memo, report, briefing) that is defensible and traceable

This person is defined by **task shape**, not profession:
- A policy researcher analyzing trade barriers
- A product manager synthesizing competitive intelligence
- An investment analyst evaluating a thesis with supporting/refuting evidence
- A graduate student building a literature review
- A journalist investigating a story with multiple sources

### 3.2 What They All Share

- They value **rigor over speed** — they'd rather have a slower, traceable analysis than a fast, shallow summary
- They are **overwhelmed by volume** — they have more material than they can process manually
- They want **structured output** — not a wall of text, but questions, hypotheses, evidence, gaps, and synthesis
- They are **skeptical of AI-generated content** — they need to see the reasoning and verify claims against sources
- They currently use a combination of highlights, spreadsheets, sticky notes, and manual summarization — and find it painful

### 3.3 Why They Come Back

The ongoing value is not one-off AI summaries. It is **cumulative research progression**:
- Evidence accumulates across research sessions
- Hypotheses evolve as new materials are added
- Blind spots become visible and can be addressed
- The thinking board is a living artifact that grows and improves over time

### 3.4 Who This Is NOT For

- Someone who wants AI to write essays for them (we produce structured analysis, not polished prose)
- Someone who wants a faster ChatGPT (we don't optimize for chat speed; we optimize for research depth)
- Someone who just wants to save bookmarks (we're not a read-it-later app)
- Someone who needs real-time collaboration (single-user for now)

---

## 4. Core Product Promise

**Give Verity a question and materials. Get back a workspace populated with structured evidence, tested hypotheses, identified gaps, and a traceable thinking journal — as if a rigorous research analyst had spent 3 hours doing what used to take you all day.**

This promise has three non-negotiable properties:

1. **Traceable**: Every claim traces back to source material. No hallucinated insights.
2. **Structured**: Output follows Q → H → E methodology (questions, hypotheses, evidence), not free-form text.
3. **Visible**: The user can see what AI did, how it reasoned, and what it changed — nothing is hidden.

---

## 5. Primary User Journeys

### 5.1 Journey 1: First Value Moment (Day 1)

```
User imports 3 articles about a topic they care about
  → Opens the reader, sees articles are readable and searchable
  → Clicks "AI Analysis" on one article
  → Gets a structured summary with key claims and exact quotes highlighted
  → Thinks: "OK, it actually read the article and found the important parts"

This is the first aha moment: AI read it better than I would have.
```

**Time to value**: Under 5 minutes from import to first insight.

### 5.2 Journey 2: Research Run (Day 1-2)

```
User creates a topic and defines a research question
  → Selects 3-5 imported materials
  → Starts a Research Run
  → AI executes 6-phase pipeline:
     Reading → Decomposition → Evidence Mapping → Hypothesis Formation → Gap Analysis → Synthesis
  → User comes back to find:
     - 15-30 evidence cards traced to source materials
     - A thinking board with Q→H→E argument tree
     - A research report in the memo tab
     - A thinking journal showing AI's reasoning chain
  → User reads the journal and thinks:
     "This is how I would have analyzed it, but it took 30 minutes instead of 3 hours"

This is the second aha moment: AI thinks the way I would, but faster.
```

### 5.3 Journey 3: Ongoing Research (Weeks)

```
User adds new materials as they find them
  → New evidence cards automatically suggest connections to existing hypotheses
  → Board health sidebar shows which hypotheses have weak evidence or bias warnings
  → User asks AI (via chat) to re-evaluate a hypothesis with new evidence
  → AI proposes board changes as a draft — user reviews and accepts/rejects
  → Research report is updated with new findings
  → Over time, the workspace becomes a comprehensive, evolving analysis

This is the long-term value: research that improves over time, not one-shot summaries.
```

### 5.4 The Aha Moments (in order)

1. "AI actually read the article and found the right quotes" (first AI analysis)
2. "AI structured my question into sub-questions I hadn't thought of" (MECE decomposition)
3. "I can see exactly how AI reached each conclusion" (thinking journal)
4. "AI found a blind spot in my analysis I hadn't noticed" (gap analysis / bias warning)
5. "My board is growing into a real, defensible argument structure" (cumulative value)

---

## 6. Definition of Good / Definition of Bad

### 6.1 Good Research Feels Like This

- The user opens their workspace and can immediately see the shape of their research: what's strong, what's weak, where the gaps are.
- Every card, hypothesis, and synthesis is traceable — the user can click through to the source.
- AI's contributions are clearly distinguishable from human-authored content.
- The workspace feels like a structured conversation between the user and the AI — not a dump of AI output.
- When AI proposes changes, the user understands why and can accept or reject at the right granularity.
- The thinking journal reads like a real researcher's notes — specific, honest about uncertainty, referencing actual data.

### 6.2 Bad Research Feels Like This

- A wall of AI-generated text with no structure or traceability.
- Cards that are generic summaries rather than specific claims with source quotes.
- Hypotheses that are too vague to be testable ("barriers exist").
- A board that is either empty or so complex it's incomprehensible.
- AI that sounds smart but doesn't actually advance the research question.
- AI that creates things without the user knowing or understanding why.
- A journal that reads like filler ("I analyzed the materials and found insights").

### 6.3 Experience Quality Standards

**AI proactivity**: AI should be **proactive in analysis, restrained in mutation**.
- Good: AI reads materials and tells you what it found, suggests hypotheses, flags bias.
- Bad: AI creates cards, modifies the board, or generates reports without being asked.
- Rule: In chat/explore mode, AI informs and suggests. In agent mode, AI acts with confirmation. In research run mode, AI executes the methodology.

**Information density**: The interface should be **dense but scannable**.
- Good: A board with 5 hypotheses showing evidence balance at a glance. A card that conveys its claim in the title and key points.
- Bad: Empty screens with one large text box. Cards that require scrolling to understand.
- Rule: Each surface should answer its core question at a glance: Board → "what's the argument structure?" Reader → "what does this article say?" Cards → "what evidence do I have?"

**Board complexity**: The board should feel like **a growing argument, not a tangled graph**.
- Good: A clear tree where you can trace question → hypothesis → evidence. 5-15 hypotheses with visible evidence balance.
- Bad: 50+ unstructured nodes with crossing edges and no hierarchy. An empty board with no starting point.
- Rule: The Q→H→E hierarchy is enforced by code. AI must decompose into manageable sub-questions. The board health sidebar keeps complexity visible.

**"Research was advanced"**: A session was productive when:
- A new sub-question was identified and evidence was mapped to it.
- A hypothesis gained or lost evidence, changing its confidence.
- A gap was identified that the user can act on (find more materials, rethink a hypothesis).
- The research report now says something it couldn't say before the session.
- The user understands their research better than before they started.

**Trust and cognitive load**:
- Good trust: User knows what AI did, can verify it, and can undo it. User accepts AI output because they checked the reasoning, not because they trust AI blindly.
- Bad trust: User accepts AI output without reading the journal or checking sources. User is surprised by changes they didn't authorize.
- Rule: AI autonomy decreases as cognitive stakes increase. Reading materials → high autonomy. Forming hypotheses → medium autonomy (draft for review). Deleting evidence or changing conclusions → low autonomy (explicit approval required).

---

## 7. Product Surfaces

### 7.1 Surface Map

Verity has five surfaces. Each surface answers one question and has one primary interaction pattern.

| Surface | Core Question | Primary Interaction | AI Role |
|---------|--------------|--------------------|---------|
| **Reader** | "What does this material say?" | Read, highlight, ask questions | Analysis assistant — summarize, extract, answer |
| **Board** | "What's the argument structure?" | View Q→H→E tree, review drafts | Research architect — propose structure, flag gaps |
| **Cards** | "What evidence do I have?" | Browse, filter, organize | Knowledge organizer — create, classify, link |
| **Memo** | "What's the synthesis?" | Read, edit report | Synthesis writer — generate report from evidence |
| **Journal** | "How did AI reason?" | Read, verify, audit | Transparent reasoner — show every step |

### 7.2 Chat Is Not a Surface — It Is the Orchestration Layer

Chat is how the user directs AI. It is available on every surface (floating panel, bottom-right). It is not a destination — it is a control channel.

- On the Reader surface, chat answers questions about the current article.
- On the Board surface, chat proposes structural changes.
- On the Cards surface, chat helps find, create, and classify cards.
- In any context, chat is how the user initiates Research Runs, asks for analysis, or gives AI instructions.

**The product fails if the user spends most of their time in chat.** Chat should be brief: the user gives direction, AI acts, results appear on the appropriate surface.

### 7.3 Surface Contracts

**Reader Contract**:
- Material is displayed cleanly and readably.
- Focus Lens highlights semantically relevant chunks for any query.
- AI Analysis produces summary + key claims with exact quotes that highlight in the article.
- Q&A answers are grounded in the material's actual content, not AI knowledge.
- Cards can be created from highlights — this is the bridge between Reader and Cards.

**Board Contract**:
- The board always shows a valid Q→H→E tree. Code enforces the hierarchy.
- Health sidebar is always visible, showing evidence balance per hypothesis at a glance.
- AI-proposed changes appear as visually distinct drafts (dashed purple borders) — never as committed changes.
- User can accept/reject drafts individually or in bulk.
- The board grows over time as research progresses. It should feel like a living argument, not a one-time diagram.

**Cards Contract**:
- Every card has: title, summary, key_points, fact_or_view classification, source_url, raw_snippet.
- `raw_snippet` is an exact substring of the source material — not AI-generated text.
- Cards are intermediate units: they exist to be evidence for hypotheses, not as ends in themselves.
- When a card matches an existing hypothesis, the system suggests linking it as evidence.

**Memo Contract**:
- The research report is always based on evidence from cards. No claims without source cards.
- Confidence levels reflect evidence balance (not AI enthusiasm).
- Gaps section lists specific investigation suggestions, not generic advice.
- The memo is a snapshot of the research state — it can be regenerated as evidence evolves.

**Journal Contract**:
- Every AI reasoning step has: observation (what was noticed), reasoning (how AI thought about it), actions (what was done), outcome (what happened).
- Reasoning must be specific — reference actual data, not generic descriptions.
- The journal must honestly acknowledge uncertainty, bias risks, and evidence gaps.
- The journal is the product's core trust mechanism — if the journal is low quality, the product has failed.

---

## 8. The Core Loop

```
                    ┌──────────────────────┐
                    │   Define / Refine    │
                    │  research question   │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   Import materials   │
                    │   (URLs, documents)  │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │    AI processes:     │
                    │  read → decompose →  │
                    │  map → hypothesize → │
                    │  analyze gaps →      │
                    │  synthesize          │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   User reviews on    │
                    │   surfaces:          │
                    │   board / cards /    │
                    │   memo / journal     │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   Identify gaps →    │
                    │   find more material │
                    │   → refine questions │
                    └──────────┬───────────┘
                               │
                               └──────── (back to top)
```

This loop is the product. Everything else supports it.

---

## 9. Feature Hierarchy

### 9.1 If Only Three Things Survive

1. **Research Run** (the 6-phase pipeline) — this is the product's reason to exist. Without it, Verity is just another AI chat + note app.
2. **Thinking Board** (Q→H→E tree with health) — this is how research becomes visible and auditable. Without it, there's no structure.
3. **Reader + Material Import** — this is how materials enter the system. Without it, there's nothing for AI to analyze.

### 9.2 Full Hierarchy

**Core experience** (the product is broken without these):
- Research Run (6-phase methodology pipeline)
- Thinking Board (Q→H→E argument structure + health sidebar + draft review)
- Material Import + Reader (URL/document ingestion + reading + AI analysis)
- Evidence Cards (structured knowledge units with source traceability)
- Research Journal (transparent AI reasoning chain)

**Orchestration layer** (how the user directs AI):
- Chat system (3 modes: chat/agent/auto, floating panel, context-aware)
- Plan system (AI-generated multi-step execution plans with confirmation)
- Confirmation gate (write operations require approval)

**Supporting capabilities** (useful but not the core):
- Research Report / Memo (synthesis output from evidence)
- Methodology configuration (MECE tuning, bias warning thresholds)
- Semantic search (Focus Lens, card search, cross-material search)
- Evidence suggestion (ambient matching of new cards to existing hypotheses)

**Low-frequency features** (used occasionally):
- RSS feed management
- Browser extension clipping
- Story health annotations on documents
- AI settings (model/provider configuration)

---

## 10. AI Behavior Contract

### 10.1 Foundational Principles

These principles are not slogans — they are operational constraints that must be enforced in code, prompts, and design decisions.

**Principle 1: AI autonomy decreases as cognitive stakes increase.**

| Stake Level | Examples | AI Autonomy |
|-------------|----------|-------------|
| Low | Reading materials, searching cards, listing topics | Full autonomy — auto-execute |
| Medium | Creating cards, classifying evidence, forming hypotheses | Draft autonomy — AI proposes, user reviews |
| High | Deleting evidence, changing hypothesis confidence, modifying argument structure | Approval required — user must explicitly confirm |
| Critical | Generating final synthesis, making claims about research conclusions | AI generates, user owns — the output must be clearly marked as AI-generated and user-reviewable |

**Principle 2: Draft before commit when stakes are high.**
Any AI action that changes the argument structure (board nodes, edges, hypothesis states) must first appear as a visually distinct draft. The user commits or rejects. AI never silently modifies the board.

**Principle 3: Traceability is mandatory.**
Every card must link to source material. Every hypothesis must link to evidence. Every synthesis claim must reference cards. The thinking journal must show reasoning steps. If traceability is broken, the output is defective.

**Principle 4: Evidence, inference, hypothesis, and synthesis must not be conflated.**
- Evidence = what the source says (fact, directly quotable)
- Inference = what AI concludes from evidence (reasoning step)
- Hypothesis = a testable claim about the research question (can be supported/refuted)
- Synthesis = the overall finding from the evidence and hypothesis evaluation

Each must be stored, displayed, and treated differently. AI must not present an inference as evidence or a hypothesis as a conclusion.

**Principle 5: The user must always be able to see what AI changed or proposed.**
No hidden mutations. No silent side effects. If AI created a card, the card shows it was AI-generated. If AI modified the board, the modification appears as a draft first. If AI formed a hypothesis, the journal shows the reasoning.

### 10.2 Capability Limits

- AI can read and analyze any material the user has imported.
- AI can search across the user's cards, topics, materials, and boards.
- AI can propose board changes (as drafts, never direct commits).
- AI can create cards (with confirmation in agent mode, automatically in research run mode).
- AI can generate reports and synthesis from existing evidence.
- AI **cannot** access external data (no web search, no external APIs beyond the user's imported materials).
- AI **cannot** modify other users' data (enforced by RLS and userId scoping).
- AI **cannot** bypass the confirmation gate for write/destructive operations in chat mode.

### 10.3 Epistemic Limits

- AI must distinguish between what the source says and what AI infers.
- AI must flag when a hypothesis has only one-sided evidence (bias warning).
- AI must admit when evidence is insufficient to support a hypothesis.
- AI must not present confidence higher than the evidence supports.
- AI must not fabricate quotes — `raw_snippet` must be an exact substring of source material.
- AI must use the user's methodology (MECE or configured alternative), not ad-hoc reasoning.

### 10.4 Interaction Limits

- AI responds in the same language the user uses.
- AI never shows UUIDs, internal IDs, or system metadata in its responses.
- AI references data by title, content, or meaningful description — not by database identifiers.
- AI uses markdown formatting for readability but does not generate clickable URLs (phishing prevention).
- AI keeps chat responses focused and action-oriented — long explanations go into the journal or report, not chat.

### 10.5 Initiative Limits

- AI may proactively analyze (read, summarize, identify patterns) without being asked.
- AI may proactively suggest (recommend evidence links, flag gaps) without being asked.
- AI **may not** proactively create, modify, or delete any data without being asked.
- AI **may not** start a Research Run without user initiation.
- When in doubt about whether the user wants a mutation, AI must ask first.

### 10.6 Failure Behavior

- If AI cannot complete a task, it must say what went wrong and suggest alternatives.
- If an AI call times out (120s), the error is reported to the user — not silently swallowed.
- If a Research Run fails mid-phase, partial results are preserved and the run can be retried.
- If AI produces invalid output (e.g., malformed JSON), the system retries once, then reports the failure.
- AI must never hallucinate success — if a tool call failed, it must report the failure, not pretend it worked.

---

## 11. AI Restriction Matrix

For each product context, what AI may and may not do:

### Chat (Explore Mode / 💬)

| Permission | Actions |
|------------|---------|
| **Auto-execute** | Search cards, list topics, get card details, semantic search, list materials, get board state |
| **May suggest** | "You could create a card from this", "This evidence might relate to hypothesis X" |
| **Forbidden** | Create, modify, or delete ANY data. All tool calls are read-only. |

### Chat (Agent Mode / 🤖)

| Permission | Actions |
|------------|---------|
| **Auto-execute** | All read-only operations |
| **Draft (auto-execute, user reviews result)** | `propose_board_changes` → creates visual draft on board |
| **Requires approval** | `create_card`, `ingest_url`, `fetch_rss`, any write operation |
| **Forbidden** | Delete operations without explicit user request + confirmation |

### Reader

| Permission | Actions |
|------------|---------|
| **Auto-execute** | Summarize article, extract key claims, answer questions about the article, highlight relevant chunks |
| **May suggest** | "This claim could be evidence for hypothesis X" |
| **Requires approval** | Create card from highlight, link card as evidence |
| **Forbidden** | Modify the material content, create board nodes directly |

### Board

| Permission | Actions |
|------------|---------|
| **Auto-execute** | Read board state, compute health metrics, search for related cards |
| **Draft** | Propose new nodes/edges via `propose_board_changes` (always as draft) |
| **Requires approval** | Commit drafts, delete nodes, modify hypothesis confidence |
| **Forbidden** | Direct node/edge creation bypassing draft system, reorder/restructure without user awareness |

### Research Run

| Permission | Actions |
|------------|---------|
| **Auto-execute** | Read materials, extract evidence, decompose questions, classify evidence, form hypotheses, compute health, generate report, write journal entries |
| **Auto-create** | Evidence cards, board nodes/edges, journal entries, report document (this is the methodology executing — user initiated the run) |
| **Logged but automatic** | All mutations are recorded in the journal with reasoning |
| **Forbidden** | Delete existing cards/nodes not created by this run, modify user's manual annotations, claim conclusions without evidence |

---

## 12. Research Run — Flagship Feature

### 12.1 The Six Phases

| Phase | Goal | Input | Output |
|-------|------|-------|--------|
| 1. Reading | Extract atomic evidence from materials | Material chunks | Structured extractions (claim, type, quote, confidence) |
| 2. Decomposition | MECE split of research question | Question + evidence overview | 3-7 sub-questions with rationale |
| 3. Evidence Mapping | Classify evidence → sub-questions, create cards | Extractions + sub-questions | Evidence cards + board nodes |
| 4. Hypothesis Formation | Form testable hypotheses per sub-question | Sub-questions + mapped evidence | Hypothesis nodes with confidence scores |
| 5. Gap Analysis | Identify weaknesses, biases, missing evidence | Complete Q/H/E graph | Gap report + bias warnings + investigation suggestions |
| 6. Synthesis | Generate research report | Everything above | Structured report with evidence citations |

### 12.2 Quality Bar

**Evidence Card Quality** (minimum acceptable: 3.5/5 average):

| Score | Description |
|-------|-------------|
| 1 | Generic summary, no specific claims or data |
| 2 | Has a claim but missing raw_snippet or wrong fact_or_view classification |
| 3 | Correct classification, has raw_snippet, but summary is verbose |
| 4 | Concise, accurate, well-classified, traceable to source |
| 5 | All of 4 + insightful key_points that add analytical value |

**Hypothesis Quality** (minimum acceptable: 3.5/5 average):

| Score | Description |
|-------|-------------|
| 1 | Too vague to be testable ("barriers exist") |
| 2 | Testable but poorly supported by evidence |
| 3 | Testable, supported, but obvious/trivial |
| 4 | Testable, well-supported, non-obvious insight |
| 5 | All of 4 + correctly calibrated confidence score |

**Thinking Journal Quality** (minimum acceptable: 3.5/5 average):

| Score | Description |
|-------|-------------|
| 1 | Generic filler ("I analyzed the materials") |
| 2 | Mentions specifics but reasoning is shallow |
| 3 | Shows real reasoning but skips important nuances |
| 4 | Detailed reasoning with specific evidence references |
| 5 | All of 4 + intellectual honesty (admits uncertainty, flags limitations) |

### 12.3 Research Run Acceptance Criteria

- [ ] A run with 3 materials produces >= 15 evidence cards.
- [ ] Every card's `raw_snippet` is an exact substring of some chunk's content.
- [ ] 3-7 MECE sub-questions are generated with explicit mutual-exclusivity rationale.
- [ ] Every hypothesis has >= 1 evidence link and a confidence score.
- [ ] Hypotheses with only supporting evidence (zero refuting) are flagged as bias warnings.
- [ ] The research report contains no claims not backed by evidence cards.
- [ ] The journal has entries for all 6 phases with specific (not generic) reasoning.
- [ ] The run can be cancelled mid-execution with partial results preserved.
- [ ] A failed AI call mid-phase records the error and allows retry.

---

## 13. Product-Level Acceptance Criteria

These criteria define when the product as a whole meets its promise — not just individual feature correctness.

### 13.1 First Value Moment

- [ ] A new user can import a URL and get an AI analysis with key claims in under 5 minutes.
- [ ] The AI analysis includes exact quotes from the article (not paraphrased).
- [ ] Quote highlights scroll to the correct passage in the reader.

### 13.2 Research Progression

- [ ] A Research Run with 3+ materials produces a populated workspace: cards, board, report, journal.
- [ ] Adding new materials and re-running analysis produces incremental improvement (not a full restart).
- [ ] The board health sidebar accurately reflects evidence balance — updated after every mutation.
- [ ] A user can identify their research's weak points by looking at the board health sidebar for 10 seconds.

### 13.3 Traceability

- [ ] Every card traces to a source material via `source_url` and `raw_snippet`.
- [ ] Every evidence node traces to a card via `card_id`.
- [ ] Every hypothesis traces to evidence via board edges.
- [ ] Every report claim traces to at least one card.
- [ ] The journal traces AI's reasoning step by step.

### 13.4 Trust

- [ ] Write operations in chat mode are impossible (enforced by tool group, not just by prompt).
- [ ] Write operations in agent mode show a confirmation dialog before execution.
- [ ] Board changes always appear as drafts first — never direct mutations.
- [ ] The user can reject any AI-proposed change without side effects.
- [ ] AI never shows UUIDs or internal identifiers in its responses.

### 13.5 AI Quality

- [ ] AI responds in the same language the user uses (100% of the time).
- [ ] AI's chat responses are action-oriented and concise — not long-winded explanations.
- [ ] AI's journal entries reference specific data (card titles, evidence counts, quote snippets) — not generic descriptions.
- [ ] AI correctly classifies evidence as fact vs. view.
- [ ] AI's MECE decomposition passes a human sanity check (sub-questions don't obviously overlap).

---

## 14. Non-Goals

These are explicitly out of scope and should not influence product or architecture decisions:

- External web search (Tavily, Serper, etc.) — future phase
- Multi-user collaboration or sharing
- Scheduling or recurring research runs
- Custom methodology templates beyond MECE / First Principles / 5 Whys
- Real-time streaming of AI reasoning (polling is acceptable)
- Mobile-first responsive design
- Cloud file storage (local `uploads/` directory is acceptable)
- Browser extension PDF import (Web App upload only)
- OCR for scanned PDFs
- Polished prose writing (reports are structured analysis, not essays)

---

## 15. Principles to Preserve

These must survive any refactor, redesign, or future development:

1. **"UI is a visualization of AI's work"** — but balanced: the user reviews, judges, and owns the conclusions. AI presents; the human decides.
2. **"AI is a cognitive mirror, not a replacement"** — AI makes the user's thinking visible and structured, but the user's judgment is final.
3. **"Methodology as product"** — MECE decomposition, evidence mapping, hypothesis testing, gap analysis — this IS the product. Removing or weakening the methodology removes the product's differentiator.
4. **"Human reviews results on canvas, not process in chat"** — the surfaces (board, reader, memo, journal) are where value is delivered. Chat is just the control channel.
5. **"Natural language first"** — the chat is the primary way to direct AI. Minimize buttons and modes. If it can be done through natural language, don't add a button.
6. **"Context-aware AI"** — AI knows what surface the user is on, what topic is active, what board is open. The user shouldn't have to explain context the system already has.
7. **"AI autonomy decreases as cognitive stakes increase"** — reading is automatic; writing requires confirmation; structural changes require draft review; conclusions are always human-owned.
8. **"Traceable thinking"** — the journal is not a log. It is the product's core trust mechanism. If the journal is empty or generic, the product has failed.
9. **"Suggestions and drafts are visually distinct from committed content"** — dashed borders, accent colors, "AI" badges. The user must always know what is AI-proposed vs. human-accepted.
