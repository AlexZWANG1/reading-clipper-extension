# Verity Workspace Completion — Design Spec

> Complete the workspace redesign to full spec fidelity. Builds on the Phase 1-3 foundation (committed 2026-03-15). Three layers: Layout & Data Paths → Animation System → Research Run Experience.

## 0. Context & Prerequisites

### What's Already Done (Phase 1-3, 2026-03-15)

| Component | Status | Key Files |
|-----------|--------|-----------|
| BoardCanvas | Extracted from ThinkingBoardPage | `workspace/BoardCanvas.jsx` (~1120 lines) |
| MonoStepEdge | Shared component | `board/MonoStepEdge.jsx` |
| WorkspaceStore | Zustand store for workspace UI state | `lib/store.js` → `useWorkspaceStore` |
| WorkspaceLayout | Full-screen shell, no global sidebar | `workspace/WorkspaceLayout.jsx` |
| TopicWorkspace | Page orchestrator (Canvas + Chat + LeftNav + Reader) | `workspace/TopicWorkspace.jsx` |
| ChatJournalPanel | Right column, JournalBlock + PlanProposal | `workspace/ChatJournalPanel.jsx` |
| WorkspaceLeftNav | Collapsible, Materials + Cards tabs | `workspace/WorkspaceLeftNav.jsx` |
| DocumentView | Auto-generated Q→H→E report | `workspace/DocumentView.jsx` |
| WorkspaceReader | Embedded reader with isEmbedded mode | `workspace/WorkspaceReader.jsx` |
| TopicsHome | Management home with topic grid + inbox | `workspace/TopicsHome.jsx` |
| HealthSidebar | Embedded as Board overlay | Inside `BoardCanvas.jsx` |
| Keyboard shortcuts | Q/H/Ctrl+L | Inside `BoardCanvas.jsx` |
| Card→Board localization | focusCardId prop chain | TopicWorkspace → BoardCanvas |
| useSurfaceContext | Reads from workspaceStore on workspace route | `hooks/useSurfaceContext.js` |

### What This Spec Covers

Everything remaining to reach full spec fidelity from the original design spec (`2026-03-15-workspace-redesign-design.md`), plus user feedback on reader resizing and card information density.

### Design Decisions (from brainstorming)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Reader resizing | Drag + double-click presets (40%/60%) | User needs flexible reading space; Board must remain visible |
| Old design reuse | Port card info density (region flags, source badges), not full components | AI-native simplicity over feature bloat |
| Phase 4 cleanup | Soft transition — hide from nav, keep URLs | Safety; no broken bookmarks |
| Board animations | Full implementation (§11, §15) | User explicit request; Board must feel alive |
| Implementation order | Layer-by-layer: foundation → animation → experience | Solid data paths before visual polish |

## 1. Layer 1 — Layout & Data Paths

### 1.1 Resizable Reader Panel

**Current state**: Reader width fixed at `40%`, min 360px, max 600px, no user control.

**Design**:

Create a `ResizeDivider` component rendered between Reader and Canvas in `TopicWorkspace.jsx`.

```
┌──┬─────────────────║─────────────────────┬──────────────────┐
│  │  Reader          ║  Board Canvas       │  Chat + Journal  │
│📁│                  ║  (Q→H→E tree)       │                  │
│  │  drag this ──→  ║                     │                  │
│  │  divider         ║                     │                  │
└──┴─────────────────║─────────────────────┴──────────────────┘
                      ↑
                 ResizeDivider (4px, accent on hover)
```

**ResizeDivider behavior**:
- Default: 4px wide, `var(--stroke-0)` color, `cursor: col-resize`
- Hover: 6px wide, `var(--accent-400)` color, subtle glow
- Drag: `mousedown` → track `mousemove` → update `workspaceStore.readerWidth` → `mouseup` end
- During drag: both Reader and Canvas get `pointer-events: none` + `user-select: none` to prevent iframe/text selection interference
- Double-click: cycle between 40% → 60% → 40% of content area width
- Double-click transition: 200ms ease-out CSS transition on width
- Drag: no transition (instant response)

**Width constraints**:
- `minWidth`: 320px (content unreadable below this)
- `maxWidth`: 80% of content area (Board must remain visible)
- Stored in `workspaceStore.readerWidth` as **pixel value** (integer)
- Default: computed as `Math.round(containerWidth * 0.4)` on first open
- Double-click presets: computed as percentages of container at click time, stored as px
- Persisted across reader close/reopen within session

**workspaceStore additions**:
```javascript
readerWidth: null,      // px integer, null = compute 40% on first open
setReaderWidth: (w) => set({ readerWidth: w }),
```

**TopicWorkspace integration** (showing full flex layout context):
```jsx
{/* Main content area */}
<div className="flex-1 flex overflow-hidden" ref={contentAreaRef}>
  {/* Reader split panel (when open) */}
  {readerOpen && readerMaterialId && (
    <div className="h-full shrink-0 relative" style={{ width: readerWidth || contentAreaRef.current?.clientWidth * 0.4, minWidth: 320 }}>
      <WorkspaceReader ... />
    </div>
  )}

  {/* Resize divider — sibling of Reader and Canvas, not nested inside Reader conditional */}
  {readerOpen && readerMaterialId && (
    <ResizeDivider
      containerRef={contentAreaRef}
      currentWidth={readerWidth}
      onResize={(newWidthPx) => setReaderWidth(newWidthPx)}
      onDoubleClick={cyclePresetWidth}
      minWidth={320}
      maxWidthPercent={0.8}
    />
  )}

  {/* Canvas area */}
  <div className="flex-1 flex flex-col min-w-0 relative" onClick={handleCanvasClick}>
    ...
  </div>
</div>
```

### 1.2 Card Info Density Enhancement

**Current state**: WorkspaceLeftNav card items show only FACT/VIEW badge + title + summary. Missing region context, source provenance, and confidence indicators from original design.

**Design changes to card items in WorkspaceLeftNav**:

```
┌──────────────────────────────────┐
│ ⠿ 🇺🇸 FACT  NVIDIA market share 80%│  ← drag handle + region flag + type badge + title
│   Q3 Report 显示 NVIDIA 在 AI    │  ← summary (2 lines max)
│   训练芯片市场保持 80% 份额...    │
│   📄 NVIDIA Q3 Report  ● 较高    │  ← source badge + confidence dot
│                    [📖] [🎯]     │  ← hover actions: open reader / locate on board
└──────────────────────────────────┘
```

**New elements**:
- **Region flag**: Before type badge. Derived at display time by joining through card → material → source/rss_subscription → region. The `region` column exists on `sources` and `rss_subscriptions` tables, NOT on the `cards` table. The LeftNav fetches cards with `source_name` already present; the backend card response must be extended to include `source_region` (see Backend Prerequisites below). Hidden if no region.
- **Source badge**: Bottom row, `📄 {source_name}`. Clickable → `onOpenReader(card.material_id)` with scroll-to-quote.
- **Confidence dot**: Deferred to a future iteration. The confidence data lives on hypothesis nodes in the board, not on cards, and would require a multi-join lookup (card → evidence node → edge → hypothesis → confidence) that is too complex for a card list display. If needed later, add a backend endpoint `GET /boards/:id/card-confidence-map`.
- **Hover actions**: Two icon buttons appear on hover (right side):
  - 📖 (BookOpen): Open Reader at this card's source material, scroll to original quote
  - 🎯 (Crosshair): Locate on Board (existing `onLocateCard`)

**Data requirements**:
- `card.material_id` + `card.locator` — for reader linking (already in card schema)
- `card.source_region` — derived from source/rss_subscription join (see Backend Prerequisites)

**Backend prerequisite**: Extend `transformCard` in `cards.mjs` to include region from joined source. The card API response should include `source_region` if available. This avoids a migration — region is derived, not stored on the card itself.

### 1.3 Card→Reader→Board Bidirectional Data Loop

**Current state**: Three panels have broken links between them.
- ✅ Card → Board localization (focusCardId) — working
- ✅ Reader → create card → Board refresh — working
- ❌ Card → Reader scroll-to-quote — not implemented
- ❌ Board evidence node → Reader — not implemented

**Design**:

#### Card → Reader with scroll-to-quote

When user clicks a card's source badge (or hover action 📖) in WorkspaceLeftNav:

1. `onOpenReader(card.material_id)` opens Reader split panel (existing)
2. New: pass `scrollLocator` to WorkspaceReader
3. WorkspaceReader receives `scrollLocator` prop → on mount/update, scrolls to the quote and highlights it

**workspaceStore additions**:
```javascript
readerScrollLocator: null,   // { exact, prefix, suffix, chunk_id } or null
openReaderAtQuote: (materialId, locator) => set({
  readerOpen: true,
  readerMaterialId: materialId,
  readerScrollLocator: locator,
}),
clearReaderScrollLocator: () => set({ readerScrollLocator: null }),
```

**WorkspaceReader changes**:
- New prop: `scrollLocator` (from workspaceStore)
- On `scrollLocator` change: create a temporary `cardHighlight` from the locator, set as `activeCardHighlightId`, trigger scroll-into-view via ReaderContent's existing highlight scroll mechanism
- Clear `scrollLocator` after scroll completes (prevent re-scroll on re-render)

#### Board Evidence Node → Reader

When user double-clicks an evidence node on the Board:

1. BoardCanvas `onNodeDoubleClick` handler checks if node is `evidence` type
2. Reads `node.data.card.material_id` and `node.data.card.locator`
3. Calls `workspaceStore.openReaderAtQuote(materialId, locator)`
4. Reader opens (or updates if already open) and scrolls to the quote

**BoardCanvas changes**:
- Add `onNodeDoubleClick` handler to ReactFlow
- For evidence nodes: extract material_id and locator from node data, call `openReaderAtQuote`
- For other node types: no-op (or future: edit inline)

**Backend prerequisite**: The `listNodes` function in `services/supabase/boards.mjs` currently selects a limited set of card fields in its join:
```
card:cards(id, summary, key_points, source_name, source_url, raw_snippet, image_url)
```
This must be expanded to include `material_id, locator, title, fact_or_view` so that evidence nodes have the data needed to open the Reader at the correct quote. Add to the select: `material_id, locator, title, fact_or_view`.

### 1.4 Navigation Cleanup (Soft Transition)

**Layout.jsx nav restructure**:

```javascript
const navGroups = [
  {
    title: 'Research',
    items: [
      { to: '/', icon: Folder, label: '研究主页', end: true },
      { to: '/tasks', icon: ListChecks, label: '研究任务' },
    ],
  },
  {
    title: 'Library',
    items: [
      { to: '/materials', icon: FileText, label: '材料库' },
    ],
  },
];

const userItems = [
  { to: '/settings', icon: Settings, label: '设置' },
];
```

**Removed from nav** (URLs still work):
- `/workbench` (CardsPage)
- `/chat` (ChatPage)
- `/topics` (TopicsPage list)
- `/rss`, `/sources` (folded into Settings)
- `/ai-settings`, `/download` (folded into Settings)

**WorkspaceLeftNav footer enhancement**:

```
Expanded:
┌─────────────────────────────┐
│  🏠 首页  📋 任务  ⚙️ 设置   │
└─────────────────────────────┘

Collapsed:
┌──┐
│🏠│
│📋│
│⚙️│
└──┘
```

Three icon buttons: Home (`/`), Tasks (`/tasks`), Settings (`/settings`).

## 2. Layer 2 — Animation System & Visual Language

### 2.1 Node Animation System

**Goal**: Board nodes have lifecycle animations — appear, pulse, commit, reject.

#### CSS Keyframes (add to `index.css`)

```css
@keyframes nodeAppear {
  from { transform: scale(0.8); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}

@keyframes nodeReject {
  from { transform: scale(1);   opacity: 1; }
  to   { transform: scale(0.9); opacity: 0; }
}

@keyframes nodePulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
  50%      { box-shadow: 0 0 12px 4px rgba(139, 92, 246, 0.25); }
}

@keyframes commitFlash {
  0%   { box-shadow: 0 0 0 0 rgba(24, 160, 106, 0.4); }
  50%  { box-shadow: 0 0 16px 4px rgba(24, 160, 106, 0.25); }
  100% { box-shadow: 0 0 0 0 rgba(24, 160, 106, 0); }
}
```

#### AnimatedNodeWrapper Component

New file: `components/board/AnimatedNodeWrapper.jsx`

```jsx
// Wraps any board node (Question, Hypothesis, Evidence, Draft) with animation support
// Reads data.animationState from React Flow node data
// States: 'entering' | 'active' | 'rejecting' | 'committing' | null
```

- `entering`: apply `animation: nodeAppear 200ms ease-out`
- `active`: apply `animation: nodePulse 1.5s infinite`
- `rejecting`: apply `animation: nodeReject 200ms ease-out forwards`, then remove node from array after 200ms
- `committing`: apply `animation: commitFlash 500ms ease-out`, CSS transition border from dashed→solid (150ms), fade out AI badge (200ms opacity transition)
- `null`: no animation, static display

Each custom node component (QuestionNode, HypothesisNode, EvidenceNode, DraftNode) wraps its content with `<AnimatedNodeWrapper>`.

#### Batch Stagger

When multiple nodes are created at once (e.g., Research Run creates 3 evidence nodes in one tool call):

- BoardCanvas receives the array of new nodes
- First node: `animationState = 'entering'` immediately
- Second node: `animationState = 'entering'` after 100ms setTimeout
- Third node: `animationState = 'entering'` after 200ms setTimeout
- Implementation: `addNodesWithStagger(newNodes)` function in BoardCanvas

### 2.2 Edge Animation System

**Goal**: New edges visually "draw" from source to target.

#### MonoStepEdge Enhancement

Current `MonoStepEdge` renders a static SVG path. Add animation support:

**New prop**: `animated: boolean` (default `false`)

**Animation mechanism**:
1. On mount with `animated=true`:
   - Ref the SVG `<path>` element
   - Calculate total path length via `path.getTotalLength()`
   - Set initial `stroke-dasharray: totalLength` and `stroke-dashoffset: totalLength`
   - On next animation frame: set `stroke-dashoffset: 0` with `transition: stroke-dashoffset 300ms ease-out`
2. After 300ms: set `animated=false` on the edge data to prevent re-animation on dagre re-layout

**Edge data addition**:
```javascript
edge.data = {
  ...edge.data,
  animated: true,  // set on creation, cleared after animation completes
};
```

**Animation clearing mechanism**:
- MonoStepEdge receives an `onAnimationComplete` callback prop from BoardCanvas
- After the 300ms animation completes (via `setTimeout` in MonoStepEdge's `useEffect`), MonoStepEdge calls `onAnimationComplete(edge.id)`
- BoardCanvas provides this callback: `(edgeId) => setEdges(eds => eds.map(e => e.id === edgeId ? { ...e, data: { ...e.data, animated: false } } : e))`
- This prevents re-animation when dagre re-layout triggers a re-render

### 2.3 Draft Visual Language Completion

**Current state**: DraftNode has dashed border + AI badge. Missing reduced opacity and state transitions.

**Enhanced DraftNode styles**:

| Property | Draft (static) | Draft (committing) | Committed |
|----------|---------------|-------------------|-----------|
| Border | `2px dashed var(--ai-accent)` | Transitioning... | `2px solid {type-color}` |
| Opacity | `0.85` | `0.85 → 1.0` | `1.0` |
| AI Badge | Visible (purple "AI" top-right) | Fading out... | Hidden |
| Background | `rgba(139,92,246,0.08)` | Transitioning... | Type-specific color |
| Animation | None | `commitFlash` (500ms) | None |

**CSS transitions on DraftNode container**:
```css
.draft-node {
  transition: border 150ms ease, opacity 150ms ease, background-color 150ms ease;
}
```

**AI Badge fade-out**:
```css
.ai-badge {
  transition: opacity 200ms ease;
}
.ai-badge.fading { opacity: 0; }
```

**DraftCommitBar reject action enhancement**:
- When user clicks "Reject All" or rejects individual draft:
- Set `animationState = 'rejecting'` on target nodes
- After 200ms animation: remove nodes from React Flow state
- Edges connected to rejected nodes also removed (React Flow handles this automatically)

### 2.4 Incremental Positioning (Research Run)

**Problem**: Dagre re-layouts all nodes on every addition, causing visual "jumping" that destroys spatial memory and fights entry animations.

**Solution**: Dual layout mode in BoardCanvas.

#### workspaceStore addition:
```javascript
layoutMode: 'dagre',  // 'dagre' | 'incremental'
setLayoutMode: (mode) => set({ layoutMode: mode }),
```

#### Incremental positioning algorithm:

When `layoutMode === 'incremental'` and a new node is added:

```
Parent node position: (px, py)
Parent node dimensions: (pw, ph) — typically 280×varies

New Question (child of question):
  x = px + (childIndex * 300)
  y = py + 140

New Hypothesis (child of question):
  x = px + (childIndex * 300)
  y = py + 120

New Evidence (child of hypothesis):
  x = px + 20  (slight indent)
  y = py + (childIndex * 90) + 100
```

**Note on collision detection**: This positioning algorithm is intentionally naive — it does not check for overlaps with existing nodes. Overlaps are acceptable during a Research Run because (a) the user is watching real-time growth and can mentally track positions, and (b) the dagre cleanup pass at Research Run completion resolves all overlaps with smooth transitions. Building collision avoidance would add significant complexity for minimal gain during what is a temporary layout state.

**Note on node dimensions**: The Y offsets above assume node heights of approximately 80-100px. The actual `NODE_DIMS` in BoardCanvas should be referenced at implementation time; if nodes are taller (e.g., 160px for questions), adjust offsets to `py + nodeHeight + 40px gap`.

#### Mode transitions:

- **Research Run starts**: `setLayoutMode('incremental')`
- **Research Run ends**:
  1. Run dagre layout on all nodes
  2. Animate all nodes from current position to dagre-computed position (300ms ease, using React Flow's built-in node position transitions)
  3. `setLayoutMode('dagre')`
- **User presses Ctrl+L**: Run dagre regardless of mode, with position transition animation
- **Manual node creation** (Q/H keyboard shortcuts): Use current `layoutMode`

#### React Flow node position animation:

When transitioning from incremental to dagre positions:
```css
.react-flow__node {
  transition: transform 300ms ease;
}
```

This is applied temporarily during the dagre re-layout, then removed to allow smooth dragging. Implementation: add a CSS class `.dagre-transitioning` to the React Flow container that applies the transition. Remove the class after 350ms via setTimeout. When user is dragging (React Flow's `onNodeDragStart`/`onNodeDragStop`), never apply this class.

### 2.5 Data Flow for Incremental Node Addition During Research Run

**This is the most architecturally significant decision in the animation system.**

**Problem**: The existing data flow is: server stores nodes → `boardRefreshToken` increments → `loadBoard()` fetches ALL nodes → dagre layouts ALL nodes → React Flow re-renders. This is incompatible with incremental animation because every refresh replaces the entire node array, destroying animation state and triggering full re-layout.

**Solution**: During Research Run, bypass the full-reload path. Instead, the chat message handler processes tool call results and directly appends nodes to the local React Flow state.

**Data flow (Research Run active)**:

```
AI tool call: create_board_node({...})
  → Backend creates node, returns node data in tool result
  → ChatJournalPanel receives tool result in streaming response
  → ChatJournalPanel extracts created node from tool result
  → Calls workspaceStore.addBoardNode(nodeData)
  → workspaceStore dispatches to BoardCanvas via a callback/event
  → BoardCanvas.addNodesWithStagger([nodeData]):
      1. Computes position using incremental algorithm (§2.4)
      2. Sets animationState = 'entering' with stagger delays
      3. Calls setNodes(prev => [...prev, newNode])
      4. Creates edge if parent specified, with animated=true
      5. Calls setEdges(prev => [...prev, newEdge])
```

**Data flow (normal mode, non-Research Run)**:

```
Board mutation (card created, manual node add, etc.)
  → boardRefreshToken increments
  → loadBoard() fetches all nodes from server
  → dagre layout applied to all nodes
  → React Flow re-renders (full replacement)
```

**workspaceStore additions for this**:
```javascript
// Callback refs for BoardCanvas to register its node/edge setters
boardNodeAdder: null,   // (nodes) => void — set by BoardCanvas on mount
setBoardNodeAdder: (fn) => set({ boardNodeAdder: fn }),

addBoardNode: (nodeData) => {
  const { boardNodeAdder } = get();
  if (boardNodeAdder) boardNodeAdder(nodeData);
},
```

**BoardCanvas registration**:
```javascript
// In BoardCanvas useEffect on mount:
useWorkspaceStore.getState().setBoardNodeAdder((nodeData) => {
  addNodesWithStagger(Array.isArray(nodeData) ? nodeData : [nodeData]);
});
// Cleanup on unmount:
return () => useWorkspaceStore.getState().setBoardNodeAdder(null);
```

**ChatJournalPanel integration**:
When processing a streaming message that contains tool results for `create_board_node`:
```javascript
if (toolResult.name === 'create_board_node' && workspaceStore.autonomyLevel === 'run') {
  workspaceStore.addBoardNode(toolResult.result.node);
}
// Similar for create_board_edge
```

**Sync at Research Run end**: When Research Run completes, trigger one final `boardRefreshToken` increment to sync server state with local state (in case of any drift). The dagre re-layout at this point serves as the canonical layout pass.

## 3. Layer 3 — Research Run Experience & Polish

### 3.1 ResearchRunProgress Component

New file: `components/workspace/ResearchRunProgress.jsx`

#### Structure:

```
ResearchRunProgress
├── RunHeader (sticky top of ChatJournalPanel)
│   ├── StatusDot (green pulsing circle when running)
│   ├── CurrentAction text ("正在阅读《NVIDIA Q3 Report》...")
│   ├── Stats row: "材料 2/5 · 节点 +7 · 证据 +12"
│   ├── Elapsed time: "3m 22s"
│   └── Actions: [Pause] [Stop]
│
└── (JournalBlocks render in the normal message stream below)
```

#### RunHeader states:

| State | StatusDot | Actions | Background |
|-------|-----------|---------|------------|
| Running | 🟢 pulse animation | [暂停] [停止] | `rgba(24,160,106,0.06)` |
| Paused | 🟡 static | [继续] [停止] | `rgba(217,119,6,0.06)` |
| Completed | ✅ static checkmark | [查看总结] | `rgba(24,160,106,0.06)` |
| Failed | 🔴 static | [重试] [查看日志] | `rgba(195,58,48,0.06)` |

#### Data source:

- Read from `chatStore`: filter messages where `task_id` matches active Research Run task
- Tool calls in messages map to stats:
  - `read_material` calls → materials read count
  - `create_board_node` calls → nodes created count
  - `create_board_edge` calls → edges count
- Current action: extract from latest assistant message prefix or tool call name
- Elapsed time: `Date.now() - runStartTime`, updated every second via `setInterval`

#### Integration with ChatJournalPanel:

```jsx
// In ChatJournalPanel render:
{activeResearchRun && (
  <ResearchRunProgress
    runId={activeResearchRun.id}
    className="sticky top-0 z-10"
  />
)}
```

`activeResearchRun` comes from `workspaceStore` — set when a Research Run task is created, cleared when it completes.

### 3.2 Chat+Journal Autonomy-Aware Content

#### Relationship to existing ChatJournalPanel MODES

The existing `ChatJournalPanel.jsx` defines local `MODES`: `'chat' | 'agent' | 'auto'`. These are **backend mode selections** sent to the chat API to control AI behavior. The new `autonomyLevel` is a **frontend display concern** that controls how the Chat panel renders content. They coexist with this mapping:

| autonomyLevel (display) | Backend mode sent | When active |
|--------------------------|------------------|-------------|
| `explore` | `'chat'` | Default conversational mode |
| `agent` | `'agent'` | AI performing write operations with confirmation |
| `run` | `'auto'` | Research Run autonomous execution |

The existing `MODES` array and `mode` state in ChatJournalPanel continue to function. `autonomyLevel` is read from `workspaceStore` and used only for rendering decisions (which components to show, placeholder text, journal block visibility). The mode toggle UI in ChatJournalPanel should set both: when user selects a mode, it updates the local `mode` state AND calls `setAutonomyLevel` with the mapped value.

#### workspaceStore additions:
```javascript
autonomyLevel: 'explore',  // 'explore' | 'agent' | 'run'
setAutonomyLevel: (level) => set({ autonomyLevel: level }),
activeResearchRun: null,    // { id, startTime } or null
setActiveResearchRun: (run) => set({ activeResearchRun: run }),
```

#### Autonomy level behavior matrix:

| Aspect | Explore | Agent | Research Run |
|--------|---------|-------|-------------|
| Journal blocks visible | No | Yes (for write ops) | Yes (all steps) |
| Confirmation cards | No | Yes (inline) | No (batch on Board) |
| Input placeholder | "问任何关于这个研究的问题..." | "告诉 AI 你想做什么..." | "输入指令干预研究方向..." |
| Mode badge above input | 🔍 探索 | 🤖 代理 | 🚀 Research Run |
| Message rendering | Standard chat bubbles | Chat + ConfirmationCard | Chat + JournalBlock dominant |

#### Mode switching logic:

- Default: `explore`
- When AI response contains a write tool call requiring confirmation → temporarily `agent`
- When user starts Research Run → `run`
- When Research Run completes/stops → back to `explore`
- Mode badge is clickable: user can manually switch between explore/agent (but not directly to `run` — that requires explicit Research Run initiation)

#### JournalBlock rendering rules:

```javascript
// Write operations — tool names that modify state (create/update/delete)
const WRITE_TOOL_NAMES = new Set([
  'create_board_node', 'update_board_node', 'delete_board_node',
  'create_board_edge', 'delete_board_edge',
  'create_card', 'update_card', 'delete_card',
  'commit_draft', 'reject_draft',
  'create_hypothesis', 'update_hypothesis',
]);

function isWriteOperation(toolName) {
  return WRITE_TOOL_NAMES.has(toolName);
}

function shouldShowJournalBlock(message, autonomyLevel) {
  if (autonomyLevel === 'run') return true;  // show all during Research Run
  if (autonomyLevel === 'agent') {
    // show only for write operations
    return message.tool_calls?.some(tc => isWriteOperation(tc.name));
  }
  return false;  // explore mode: no journal blocks
}
```

Create this utility as `lib/chat-utils.js` and import in ChatJournalPanel.

### 3.3 Read vs Write Result Display

#### Read operation results (search, analyze, Q&A, summarize):

Render as standard chat message with rich content:
- Inline search results: list of matching cards/chunks with snippets
- Card previews: compact card rendering within chat bubble
- Analysis text: full response, may be long, scrollable

#### Write operation results (create card, board node, edge):

**In Agent mode** — inline confirmation card:
```jsx
<ConfirmationCard>
  <ConfirmationCard.Header icon={type_icon} title="创建假说节点" />
  <ConfirmationCard.Body>
    <p>"{hypothesis_text}"</p>
    <p className="text-xs">父节点: ❓ {parent_question}</p>
  </ConfirmationCard.Body>
  <ConfirmationCard.Actions>
    <Button onClick={confirm}>确认</Button>
    <Button onClick={modify}>修改</Button>
    <Button onClick={cancel}>取消</Button>
  </ConfirmationCard.Actions>
</ConfirmationCard>
```

After confirmation:
```
✓ 已创建假说节点 → 论证板已更新
```
Board simultaneously plays `nodeAppear` animation on the new node.

**In Research Run mode** — JournalBlock + Board animation:
```jsx
<JournalBlock icon="💡" title="创建了假说节点（Draft）">
  <p>"NVIDIA 凭借 CUDA 生态壁垒维持 AI 训练市场主导地位"</p>
  <p className="text-xs">→ 添加了 2 条支持证据（Draft）</p>
  <Collapsible trigger="展开详细推理">
    <p>基于材料分析，NVIDIA 的市场份额数据与 CUDA 生态系统的锁定效应...</p>
  </Collapsible>
</JournalBlock>
```
Board simultaneously plays staggered `nodeAppear` animations.

#### ConfirmationCard component

New file: `components/workspace/ConfirmationCard.jsx`

Visual design:
- Left border: 3px solid `var(--accent-400)`
- Background: `var(--surface-1)`
- Rounded corners: 12px
- Header: icon + operation type text
- Body: operation details (what will be created/modified)
- Actions: row of buttons at bottom
- Pending state: subtle pulse border animation
- Confirmed state: green flash + collapse to single line "✓ 已完成"
- Cancelled state: red flash + collapse to single line "✗ 已取消"

### 3.4 User Intervention During Research Run

#### Intervention mechanism:

User types in ChatJournalPanel input during active Research Run → message appears in stream interleaved with JournalBlocks → AI reads user message at next step boundary and adjusts.

#### Intervention types and AI behavior:

| User Input | AI Response | Board Effect |
|-----------|-------------|-------------|
| "暂停" / "pause" | "已暂停。输入「继续」恢复。" | RunHeader → paused state |
| "继续" / "resume" | "继续研究..." | RunHeader → running state |
| "停止" / "stop" | Confirmation: "确定停止？已创建的 Draft 节点将保留。[确定] [取消]" | If confirmed: RunHeader → completed |
| "跳过这个方向" | "收到，将跳过 [current branch] 转向其他方向。" | Current branch dims slightly |
| "深入 [topic]" | "收到，将优先探索 [topic]。" | No immediate board change |
| "这个假说不对，因为 [reason]" | "已记录。将把「{hypothesis}」标记为待修正。" | Hypothesis node gets warning indicator |
| Free text | AI integrates as context | Varies |

#### Visual treatment of user intervention messages:

- Render as standard chat bubble (not JournalBlock)
- Visually distinct from JournalBlocks: white/light background vs purple-tinted JournalBlocks
- Timestamp shown to help user track when they intervened

### 3.5 Settings Consolidation

New file: `pages/SettingsPage.jsx`

#### Tab structure:

```
┌──────────────────────────────────────────────┐
│  ⚙️ 设置                                      │
│                                              │
│  [AI 模型]  [RSS 订阅]  [信息源]  [导出]       │
│  ─────────────────────────────────────────── │
│                                              │
│  (current tab content)                       │
│                                              │
└──────────────────────────────────────────────┘
```

| Tab | Source | Content |
|-----|--------|---------|
| AI 模型 | AISettingsPage core content | Model selection, temperature, system prompt |
| RSS 订阅 | RssPage core content | Subscription list, add/remove, refresh |
| 信息源 | SourcesPage core content | Source management |
| 导出 | DownloadPage core content | Export data, backup |

#### Implementation approach:

- Extract core content from each page into headless components (no layout wrapper)
- SettingsPage renders tab bar + active tab's content component
- Route: `/settings` with optional `?tab=ai|rss|sources|export` query param
- Default tab: `ai`

#### Redirect handling:

Old routes redirect to new unified settings:
- `/ai-settings` → `/settings?tab=ai`
- `/download` → `/settings?tab=export`
- `/rss` and `/sources` → keep accessible directly for now (soft transition), but nav points to `/settings`

### 3.6 Soft Transition Route Cleanup

#### App.jsx route structure:

```jsx
// Primary routes (visible in navigation)
<Route element={<Layout />}>
  <Route index element={<TopicsHome />} />
  <Route path="tasks" element={<TasksPage />} />
  <Route path="tasks/:id" element={<TaskDetailView />} />
  <Route path="materials" element={<MaterialsPage />} />
  <Route path="settings" element={<SettingsPage />} />
</Route>

// Workspace (immersive, no global sidebar)
<Route path="topics/:topicId" element={<WorkspaceLayout />}>
  <Route index element={<TopicWorkspace />} />
</Route>

// Soft transition: old routes still work, hidden from nav
<Route element={<Layout />}>
  <Route path="workbench" element={<CardsPage />} />
  <Route path="chat" element={<ChatPage />} />
  <Route path="topics" element={<TopicsPage />} />
  <Route path="materials/:id" element={<MaterialReaderPage />} />
  <Route path="rss" element={<RssPage />} />
  <Route path="rss/subscriptions/:id" element={<RssSubscriptionDetailPage />} />
  <Route path="sources" element={<SourcesPage />} />
  <Route path="ai-settings" element={<Navigate to="/settings?tab=ai" replace />} />
  <Route path="download" element={<Navigate to="/settings?tab=export" replace />} />
</Route>
```

### 3.7 WorkspaceLeftNav Management Quick Links

#### Expanded footer:

```jsx
<div className="px-3 py-2 flex items-center gap-2" style={{ borderTop: '1px solid var(--stroke-0)' }}>
  <button onClick={() => navigate('/')} title="研究主页">
    <Home size={14} />
  </button>
  <button onClick={() => navigate('/tasks')} title="研究任务">
    <ListChecks size={14} />
  </button>
  <button onClick={() => navigate('/settings')} title="设置">
    <Settings size={14} />
  </button>
</div>
```

#### Collapsed footer:

Same three icons stacked vertically in the icon rail section, below the existing Home icon. Replace single Home button with three buttons.

### 3.8 End-to-End User Journeys

#### Journey 1: New User Cold Start

1. Login → TopicsHome shows empty state with prominent "新建 Topic" CTA
2. User creates "AI 芯片竞争" topic → navigates to `/topics/{id}` → TopicWorkspace loads
3. Board: empty canvas with centered "❓ 输入你的研究问题" prompt node
4. LeftNav: empty materials + cards lists with "导入材料" hint
5. Chat: welcome message "你好！我是你的研究助手。你可以..."
6. User asks question in Chat → AI responds (Explore mode, inline results)
7. User navigates to management layer → imports materials → back to workspace
8. LeftNav shows materials → click one → Reader opens (40% default width)
9. User drags divider to 60% for comfortable reading
10. Selects text → creates card → Board shows new evidence node with `nodeAppear` animation
11. User says "开始 Research Run" → autonomy switches to `run` → Board grows in real-time

#### Journey 2: Continuing Research

1. TopicsHome → click existing topic → Workspace loads with previous Q→H→E tree
2. Draft nodes from last Research Run visible (dashed borders, AI badges, 0.85 opacity)
3. DraftCommitBar appears: "AI 提出了 4 个新节点 · [全部接受] [逐个审核] [全部拒绝]"
4. User clicks "逐个审核" → each draft highlights sequentially → user accepts/rejects
5. Accepted: `commitFlash` animation, border solidifies, AI badge fades
6. Rejected: `nodeReject` animation, node shrinks and fades out
7. User opens material → drags Reader to 60% → reads and creates cards
8. User drags card from LeftNav to Board → creates evidence edge
9. Toggle to Document View → auto-generated report reflects all changes
10. Toggle back to Structure View → Board exactly as left (never unmounted)
11. Chat: "这个假说不对" → AI marks hypothesis as refuted in Agent mode

#### Journey 3: Research Run in Action

1. User types: "帮我全面分析 AI 芯片竞争格局"
2. Chat: AI proposes research plan (PlanProposal component)
3. User confirms → Research Run starts
4. `autonomyLevel` → `run`, `layoutMode` → `incremental`
5. RunHeader appears: 🟢 "正在制定研究策略..."
6. Board: ❓ root question appears with `nodeAppear` animation
7. JournalBlock: "📖 开始阅读《NVIDIA Q3 Report》..."
8. Board: 💡 hypothesis node appears below question (staggered, 100ms delay)
9. Board: 📎 evidence nodes appear below hypothesis (staggered)
10. New edges "draw" from parent to child with stroke animation
11. User types: "深入 CUDA 生态壁垒方向" → AI acknowledges, adjusts
12. More nodes appear, Board grows organically
13. Research Run completes → RunHeader: ✅ "完成 · 5m 12s · 14 nodes"
14. All new nodes are Drafts → DraftCommitBar appears for batch review
15. `layoutMode` → 'dagre' triggered: all nodes smoothly slide to optimal positions (300ms transition)
16. `autonomyLevel` → `explore`

## 4. New Files Summary

| File | Purpose | Layer |
|------|---------|-------|
| `components/workspace/ResizeDivider.jsx` | Draggable panel divider | L1 |
| `components/board/AnimatedNodeWrapper.jsx` | Animation lifecycle wrapper for board nodes | L2 |
| `components/workspace/ResearchRunProgress.jsx` | Research Run header + stats in ChatJournalPanel | L3 |
| `components/workspace/ConfirmationCard.jsx` | Inline write-op confirmation in Chat stream | L3 |
| `pages/SettingsPage.jsx` | Unified settings with tabs | L3 |

## 5. Modified Files Summary

| File | Changes | Layer |
|------|---------|-------|
| `workspace/TopicWorkspace.jsx` | ResizeDivider integration, readerWidth from store | L1 |
| `workspace/WorkspaceLeftNav.jsx` | Card info density, hover actions, footer links | L1, L3 |
| `workspace/WorkspaceReader.jsx` | scrollLocator prop, auto-scroll to quote | L1 |
| `workspace/BoardCanvas.jsx` | Node animations, edge animations, incremental positioning, onNodeDoubleClick, layoutMode | L2 |
| `board/MonoStepEdge.jsx` | Edge draw animation support | L2 |
| `components/board/QuestionNode.jsx` | Wrap with AnimatedNodeWrapper | L2 |
| `components/board/HypothesisNode.jsx` | Wrap with AnimatedNodeWrapper | L2 |
| `components/board/EvidenceNode.jsx` | Wrap with AnimatedNodeWrapper | L2 |
| `components/DraftNode.jsx` | Opacity 0.85, commit/reject transitions | L2 |
| `components/DraftCommitBar.jsx` | Trigger reject animation before removal | L2 |
| `workspace/ChatJournalPanel.jsx` | ResearchRunProgress, autonomy-aware rendering, ConfirmationCard | L3 |
| `lib/store.js` (workspaceStore) | readerWidth, readerScrollLocator, autonomyLevel, activeResearchRun, layoutMode | L1-L3 |
| `components/Layout.jsx` | Nav restructure, remove Legacy group | L3 |
| `App.jsx` | Route restructure, soft transition routes, SettingsPage | L3 |
| `index.css` | Animation keyframes (nodeAppear, nodeReject, nodePulse, commitFlash) | L2 |

## 6. Deferred Items & Closed Questions

### Explicitly Deferred

| Item | Original Spec Ref | Reason |
|------|-------------------|--------|
| Research Run templates ("Competitive Analysis", "Literature Review") | §6 | Nice-to-have; AI can freely generate research plans without templates. Add in a future iteration. |
| Document View Stage 2 (AI narrative, rich text editing) | §14 | Requires rich text editor. Stage 1 (auto-generated report) is complete and sufficient for now. |
| Confidence dot on LeftNav cards | §1.2 (this spec) | Requires complex multi-join lookup. Deferred; add a backend endpoint later if needed. |
| InboxPanel component | §8, §9 | TopicsHome already has an inline inbox section (expandable list of uncategorized cards). A separate InboxPanel component is not needed — the current implementation is sufficient. |
| ConfirmationCard "Modify" button flow | §3.3 (this spec) | When user clicks "Modify", the confirmation card becomes editable inline (text fields for the proposed content). For now, implement only Confirm and Cancel; Modify is a stretch goal. |
| EmbeddedThinkBoard refactoring | §9 | CardsPage still uses it; since CardsPage is soft-transitioned (hidden from nav), no investment needed. Will be removed when CardsPage is fully retired. |

### Closed Open Questions (from original spec §16)

| Question | Resolution |
|----------|-----------|
| Q1: Research Run cancellation UX | Resolved in this spec §3.4: both Chat commands ("暂停"/"停止") and UI buttons in RunHeader (Pause/Stop). |
| Q2: Multi-topic research | Deferred. Single topic at a time for now. Multiple browser tabs can open different topics via URL. |
| Q3: Mobile experience | Deferred. Desktop-first. Mobile fallback is not in scope for this redesign. |
| Q4: Keyboard shortcut focus management | Resolved in Phase 1-3: keyboard shortcuts (Q/H/Ctrl+L) check `document.activeElement` — if focus is in an input/textarea, shortcuts don't fire on the Board. |

## 7. Backend Prerequisites Summary

Changes required in the backend before or during frontend implementation:

| File | Change | Layer |
|------|--------|-------|
| `services/supabase/boards.mjs` → `listNodes` | Expand card join select to include `material_id, locator, title, fact_or_view` | L1 |
| `services/supabase/cards.mjs` → `transformCard` | Include `source_region` derived from source/rss_subscription join (if available) | L1 |

These are small, non-breaking additions to existing queries.

## 8. Verification Criteria

### Build & Test
- `cd web-app && npx vite build` passes with zero errors

### Layer 1 Verification
- [ ] Reader divider renders between Reader and Canvas
- [ ] Dragging divider resizes Reader smoothly without flicker
- [ ] Double-clicking divider cycles 40% → 60% → 40% with smooth transition
- [ ] Reader width persists across close/reopen
- [ ] Card items in LeftNav show region flag, source badge, confidence dot (when data available)
- [ ] Clicking card source badge opens Reader at correct material and scrolls to quote
- [ ] Double-clicking Board evidence node opens Reader at source quote
- [ ] Layout.jsx nav shows Research + Library + Settings (no Legacy group)
- [ ] Old URLs (/workbench, /chat, etc.) still load their pages
- [ ] WorkspaceLeftNav footer shows Home + Tasks + Settings icons

### Layer 2 Verification
- [ ] New nodes appear with scale+fade animation (200ms)
- [ ] New edges draw from source to target (300ms stroke animation)
- [ ] Draft nodes have 0.85 opacity, dashed borders, AI badge
- [ ] Accepting a draft: border solidifies, green flash, AI badge fades, opacity → 1.0
- [ ] Rejecting a draft: node shrinks and fades out (200ms)
- [ ] Multiple nodes created at once appear with staggered delay (100ms between each)
- [ ] Active processing node has pulse glow animation
- [ ] Ctrl+L triggers dagre re-layout with smooth position transitions
- [ ] Incremental mode places nodes relative to parent without full dagre re-layout

### Layer 3 Verification
- [ ] ResearchRunProgress header appears during Research Run
- [ ] Header shows running stats (materials, nodes, elapsed time)
- [ ] Pause/Stop buttons function correctly
- [ ] JournalBlocks appear for Research Run steps with correct icons
- [ ] Autonomy level badge shows correct mode in Chat input area
- [ ] Write operations show ConfirmationCard in Agent mode
- [ ] User can type intervention messages during Research Run
- [ ] SettingsPage renders with 4 tabs, content loads correctly
- [ ] /ai-settings redirects to /settings?tab=ai
