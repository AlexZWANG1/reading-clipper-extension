# Verity — Development Guide

> This guide teaches both **how the system works** and **what the product is trying to preserve**.
> Code-level knowledge without product understanding leads to feature-correct but product-wrong behavior.
> Read `PRODUCT-SPEC.md` and `ARCHITECTURE.md` before this document.

---

## 1. Product Philosophy for Developers

### 1.1 What You Must Understand Before Writing Code

Verity is not a chat app, not a note app, and not a generic AI workspace. It is a **thought-formation system** where:

- **The core loop** is: import materials → AI analyzes with structured methodology → user reviews on surfaces (board, reader, memo, journal) → identify gaps → add more materials → repeat.
- **Chat is the orchestration layer**, not the product. If users spend most time chatting, the product has failed.
- **The board (Q→H→E tree)** is the product's primary artifact. It must always be a valid argument structure — enforced by code, not by prompts.
- **Traceability is non-negotiable.** Every card links to source material. Every hypothesis links to evidence. Every report claim references cards. If any link is broken, the output is defective.
- **AI autonomy is bounded.** Reading → automatic. Drafting → automatic but visible. Writing → needs confirmation. Structural changes → draft review. This is not a guideline — it is enforced in the tool system.

### 1.2 The Biggest Mistake You Can Make

Building something that is **feature-correct but product-wrong**. Examples:

- A card creation flow that works perfectly but doesn't capture `raw_snippet` from the source → breaks traceability.
- A board operation that creates nodes directly instead of through the draft system → breaks trust.
- A chat response that sounds smart but doesn't reference actual user data → breaks the "cognitive mirror" principle.
- An AI analysis that generates insights without citing source quotes → breaks evidence standards.
- A new feature that requires the user to configure settings instead of working from context → violates "natural language first."

**Rule: Before writing code, check it against the PRODUCT-SPEC.** Specifically:
- Does it respect the AI Behavior Contract (Section 10)?
- Does it fit the Feature Hierarchy (Section 9)?
- Does it pass the relevant Acceptance Criteria (Section 13)?

---

## 2. Spec-First Development

### 2.1 The Development Contract

This project follows a strict development philosophy:

1. **PRODUCT-SPEC defines WHAT** — the product contract, user journeys, quality bars, AI constraints.
2. **ARCHITECTURE defines HOW the system enforces WHAT** — component responsibilities, data flow, trust mechanisms.
3. **Acceptance criteria are the test plan** — if the criteria in PRODUCT-SPEC pass, the feature is correct.
4. **If spec and code disagree, fix the code** — the spec is the source of truth. If the spec is wrong, update the spec first, then fix the code.

### 2.2 Before You Start Coding

1. Read the relevant section of PRODUCT-SPEC.
2. Identify the acceptance criteria that your work must satisfy.
3. Understand which surface your work affects and what contract that surface has (PRODUCT-SPEC Section 7.3).
4. Check the AI Behavior Contract (PRODUCT-SPEC Section 10) if your work involves AI behavior.
5. Check the AI Restriction Matrix (PRODUCT-SPEC Section 11) if your work adds or modifies AI capabilities.

### 2.3 How AI-Assisted Coding Should Work

When using AI tools (Claude Code, Copilot, etc.) to implement features:

- **Give the AI agent the PRODUCT-SPEC** — it should understand the product contract, not just the code.
- **Reference acceptance criteria** — "implement X such that acceptance criteria AC-Board-3 passes."
- **Verify against the spec after implementation** — don't just test that code runs; test that it satisfies the product contract.
- **Watch for product-wrong behavior** — AI coding tools will happily build features that work technically but violate product principles. You are the guard.

---

## 3. Trust and Traceability Preservation

### 3.1 Trust Invariants

These must be true at all times, in all code paths:

1. **No hidden mutations.** Any write operation in chat mode must go through the confirmation gate. No exceptions.
2. **No silent AI actions.** If AI creates, modifies, or deletes data, the action must be visible to the user (via chat response, journal entry, or draft visualization).
3. **No broken lineage.** Cards must have `source_url` and `raw_snippet`. Evidence nodes must have `card_id`. Hypothesis nodes must have question parents. Report claims must reference cards.
4. **No bypassed guards.** The Q→H→E hierarchy is enforced in `toolExecutor.mjs`. Do not add code paths that create board nodes without validation.
5. **No fabricated evidence.** `raw_snippet` must be an exact substring of source material. If AI cannot find an exact quote, it must not invent one.

### 3.2 How to Maintain These Invariants

- **When adding a new tool**: Assign the correct `side_effect` (read_only/draft/write/destructive). Add it to the appropriate tool groups. Think about which contexts it should be available in.
- **When modifying the board**: Always go through the draft system for AI-initiated changes. Direct node creation is only for user-initiated actions or confirmed tool calls.
- **When creating cards**: Ensure `raw_snippet` comes from actual source text, not AI-generated content. Ensure `source_url` points to the real source.
- **When modifying the orchestrator**: Respect the tool group scoping. Chat mode must only have read-only tools. Never add write tools to the explore group.
- **When adding AI capabilities**: Check the AI Restriction Matrix. If the capability involves writing or structural changes, it must go through the appropriate approval flow.

---

## 4. Core Technical Patterns

### 4.1 AI Orchestration (Orchestrator-Planner-Executor)

The AI system has three layers:

**Orchestrator** (`chat/orchestrator.mjs`): The main chat loop.
- Receives user message + context
- Builds dynamic prompt (identity + methodology + research state + tool group instructions)
- Calls AI with scoped tool definitions
- Handles the tool execution loop (up to 6 rounds of read-only tools)
- Splits tool calls into auto-execute (read_only) and pending (write/destructive)
- Detects plan requests from AI tool calls
- Manages conversation persistence and context budget

**Planner** (`chat/planner.mjs`): Generates structured execution plans.
- Triggered when AI calls the `request_plan` tool
- Builds plan-specific prompt with available tools and user context
- Produces `plan_spec` (machine-executable) + `plan_display` (human-readable)
- Plans are returned to the user for approval before execution

**Executor** (`chat/executor.mjs`): Executes approved plans step by step.
- Runs with `full` tool group (all tools available)
- Resolves `$ref:step_id` references between steps
- Records each step's input, output, and status
- Handles errors gracefully (partial results preserved)

### 4.2 Tool System

Tools are defined in `chat/tools.mjs` with three types of metadata:

- **OpenAI function schema**: What the tool does, its parameters (read by AI)
- **Side effect classification**: read_only / draft / write / destructive (read by orchestrator)
- **Task metadata**: task_auto, task_capability (read by planner/executor)

Tools are scoped by `chat/toolGroups.mjs`:
- `explore`: read-only tools (search, list, get)
- `board`: board-specific tools + read tools
- `cards`: card creation + read tools
- `ingest`: URL/RSS ingestion + read tools
- `full`: all tools (plan execution only)

Tool execution is dispatched by `chat/toolExecutor.mjs`, which maps tool names to service-layer functions and passes `userId` for data isolation.

### 4.3 Context Budget

`chat/contextBudget.mjs` manages how much conversation history fits in the AI context window:

- Estimates tokens: Chinese 0.7/char, English 0.25/char
- Calculates available budget after system prompt, tool definitions, and current message
- Loads history newest-first from DB, trimmed to fit
- Generates conversation summaries after 20+ messages
- Compresses tool results when approaching limits

### 4.4 Authentication and Data Isolation

Every authenticated request goes through `requireAuth` middleware, which:
1. Validates the JWT token via Supabase Auth
2. Creates a user-scoped Supabase client (`req.supabase`) that respects RLS
3. Attaches `req.user` (user info) and `req.accessToken`

All database queries use the user-scoped client. This means RLS automatically filters data to the current user — even if application code has bugs, data isolation is maintained at the database level.

### 4.5 Multi-Provider AI Client

`aiClient.mjs` provides a unified interface for calling any AI provider:
- Proxy mode: all requests go through a single endpoint
- Direct OpenAI: standard OpenAI API format
- Direct Anthropic: messages/tools translated from OpenAI format to Anthropic format and back
- All calls use `fetchWithTimeout` (120s AbortController)
- Token usage logged on all code paths

### 4.6 State Management (Frontend)

Zustand stores are organized by domain:
- `useCardsStore`, `useTopicsStore`, `useDocumentsStore`: CRUD state for data entities
- `useChatStore`: Chat messages, pending actions, conversation state, mode
- `useConversationsStore`: Conversation list management
- `useRssStore`: RSS subscription state
- `useAuthStore`: Authentication state
- `useUIStore`: UI state (sidebar, toasts)

Key patterns:
- Optimistic updates in `sendMessage()` (show user message immediately, rollback on failure)
- Cross-store communication via `getState()` (not hooks — hooks only work in components)
- Each store has `clear()` for logout cleanup

---

## 5. Testing Strategy

### 5.1 What to Test

**Priority 1 — Pure functions** (no external dependencies):
- `contextBudget.mjs`: token estimation, budget calculation
- `executor.mjs`: `deepResolveRefs`, `safeStringify`
- `toolGroups.mjs`: `inferToolGroup` with various inputs
- `promptBuilder.mjs`: prompt assembly with different contexts

**Priority 2 — Behavioral contracts**:
- Tool group scoping: verify that chat mode truly has zero write tools
- Confirmation gate: verify that write tools produce `pendingActions`, not direct execution
- Board validation: verify that evidence without parent_id is rejected

**Priority 3 — Integration tests**:
- API endpoint authentication (401 without token)
- Card creation flow (capture → AI processing → storage)
- Chat flow (message → AI response → tool calls)

### 5.2 Testing Framework

Node.js native test runner:
```bash
cd reading-cards-backend && node --test "test/**/*.test.mjs"
```

No external test frameworks. Uses `node:test` + `node:assert/strict`.

### 5.3 What NOT to Test

- AI output quality (non-deterministic — use the quality rubrics in PRODUCT-SPEC for manual evaluation)
- Supabase RLS policies (tested at the database level, not in application code)
- Third-party library internals

---

## 6. Common Development Tasks

### 6.1 Adding a New AI Tool

1. Define the tool in `chat/tools.mjs` with correct `side_effect` and `task_auto`
2. Add execution logic in `chat/toolExecutor.mjs`
3. Add the tool to appropriate groups in `chat/toolGroups.mjs`
4. Check: Does this tool belong in the AI Restriction Matrix? Update PRODUCT-SPEC if needed.
5. Test: Verify the tool appears in the right groups and doesn't appear in restricted contexts.

### 6.2 Adding a New API Endpoint

1. Create route handler in `routes/v2/`
2. Use `requireAuth` middleware for authenticated endpoints
3. Use `req.supabase` (user-scoped) for all database queries
4. Return `{ ok: true, ... }` / `{ ok: false, error: "..." }` format
5. Add error handling (try/catch with meaningful error responses)

### 6.3 Modifying AI Behavior

1. Read the AI Behavior Contract in PRODUCT-SPEC Section 10.
2. If changing what AI can do: update the tool system (tools.mjs, toolGroups.mjs, toolExecutor.mjs).
3. If changing what AI says: update the prompt constants in promptBuilder.mjs.
4. If changing the orchestration flow: modify orchestrator.mjs.
5. Always verify: Does this change respect bounded autonomy? Does it maintain traceability? Does it keep AI visible?

### 6.4 Working with the Board

- Board mutations from AI must go through `propose_board_changes` (draft system)
- Board mutations from user actions can create nodes directly (user is already in control)
- The Q→H→E hierarchy is enforced in `toolExecutor.mjs` — do not bypass
- After any board mutation, health cache should be recomputed
- Research state on the topic should be updated after board changes

---

## 7. Development Philosophy

### 7.1 Build for the Spec, Not for Your Imagination

It is tempting to add features, configurability, or "improvements" that feel useful but aren't in the spec. Resist this. The product has a clear scope (PRODUCT-SPEC Section 14: Non-Goals). Building outside scope dilutes the product.

### 7.2 Trust Is Earned Through Constraint

Users trust AI because the system constrains it — not because the AI is smart. Every constraint you preserve (confirmation gate, draft system, tool scoping, methodology guards) earns trust. Every constraint you bypass erodes it.

### 7.3 Traceability Is a Feature, Not a Cost

It's tempting to skip `raw_snippet`, skip journal entries, or skip source linking to move faster. Don't. Traceability is what makes Verity a research tool instead of a chat toy. Without it, the product has no defensible value.

### 7.4 Simplicity Over Extensibility

Build the specific thing the spec asks for, not a framework that could theoretically support many things. Verity is a research workbench, not a platform. Three concrete features that work well are worth more than a flexible system that works generically.

### 7.5 The Product Test

Before merging any change, ask:
1. Does this make research progression more visible?
2. Does this maintain or strengthen traceability?
3. Does this respect the AI autonomy ladder?
4. Would the user understand what AI did and why?
5. Does this fit the core loop (import → analyze → review → identify gaps → repeat)?

If the answer to any of these is "no" or "I'm not sure," reconsider the change.
