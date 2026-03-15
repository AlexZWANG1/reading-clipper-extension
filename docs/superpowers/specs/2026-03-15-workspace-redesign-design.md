# Verity Workspace Redesign — Design Spec

> Transform the multi-page navigation app into an AI-native single-page research workspace where the Board is the living canvas and Chat is the primary interaction method.

## 1. Design Decisions (from brainstorming)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Layout paradigm | Single-page immersive workspace | User's #1 pain: flow fragmentation across pages |
| Primary interaction | Chat (natural language) | AI-native; user directs AI, views results on canvas |
| Canvas model | Board is the permanent canvas, not a tab | Board = research visualization, always visible |
| Board two faces | Structure view (React Flow) + Document view (memo) | Already built as separate tabs; promote to canvas toggle |
| Reader integration | On-demand split panel, not a tab | Reading is temporary focus; Board is permanent |
| Chat + Journal | Unified information stream | Journal blocks appear inline as AI autonomy increases |
| Research Run | Autonomous AI agent, not fixed pipeline | Board grows organically; no forced step-by-step UI |
| Draft approval | Batch approval on Board | Draft nodes visible with dashed borders; floating action bar |
| Left navigation | Collapsible; Materials + Cards list | Set-and-forget after topic selection |
| Uncategorized items | Inbox on management home | Visible but not competing with Topics |
| Product structure | Two layers: Workspace + Management | 90% time in workspace; management for admin tasks |

## 2. Product Architecture

### Two-Layer Structure

```
Verity App
├── Management Layer (entry point, admin)
│   ├── Topics Home (topic grid + Inbox)
│   ├── Tasks (AI agent run status)
│   ├── Materials (global material library)
│   └── Settings (RSS, Sources, AI config)
│
└── Topic Workspace (core research experience)
    ├── Canvas: Board (structure view / document view toggle)
    ├── Reader: Split panel (on-demand, from material click)
    ├── Chat + Journal: Unified right panel
    └── Left Nav: Collapsible (Materials, Cards for current topic)
```

### Entry Flow

1. User opens Verity → **Topics Home** (management layer)
2. Clicks a Topic → enters **Topic Workspace** (immersive, full screen)
3. Works inside workspace: Chat with AI, view Board, read materials
4. Returns to management layer for admin: import materials, check Tasks, adjust settings

## 3. Topic Workspace Layout

### Primary State (after topic selected, left nav collapsed)

```
┌──┬────────────────────────────────────┬──────────────────┐
│  │                                    │                  │
│  │  [🧠 Structure] [📄 Document]     │  Chat + Journal  │
│📁│                                    │  unified stream  │
│  │        Board Canvas                │                  │
│  │                                    │  👤 user msg     │
│  │  Q→H→E argument tree              │  🤖 AI reply     │
│  │  (React Flow, always visible)      │  ┌─ reasoning ─┐ │
│  │                                    │  │ Journal block│ │
│  │  OR                                │  └─────────────┘ │
│  │                                    │  🤖 confirmation │
│  │  Document view                     │                  │
│  │  (structured research report)      │  ───────────     │
│  │                                    │  [input box]     │
│  │                                    │                  │
└──┴────────────────────────────────────┴──────────────────┘
 ↑ collapsed nav                    Canvas ≈ 60-70%  Chat ≈ 30-40%
```

### With Reader Open (split panel)

```
┌──┬──────────────────┬─────────────────┬──────────────────┐
│  │                  │                 │                  │
│📁│  Reader           │  Board Canvas   │  Chat + Journal  │
│  │  (material text)  │  (Q→H→E tree)  │                  │
│  │                  │                 │                  │
│  │  highlights      │  nodes visible  │  conversation    │
│  │  selection       │  while reading  │  stream          │
│  │  create cards    │                 │                  │
│  │                  │                 │                  │
│  │  [✕ close]       │                 │  [input box]     │
└──┴──────────────────┴─────────────────┴──────────────────┘
```

Reader opens when user clicks a material in left nav. Closes with X button. Board remains visible alongside Reader so user can see where evidence fits.

### Left Navigation (collapsed / expanded)

```
Collapsed:        Expanded:
┌──┐              ┌──────────────────────┐
│📁│              │ 📁 AI Chip Competition│
│  │   click →    │                      │
│📄│              │ 📄 Materials (3)      │
│  │              │  · NVIDIA Q3 Report  │  ← click → Reader split opens
│📋│              │  · AMD Analysis      │
│  │              │  · Huawei Whitepaper │
│  │              │                      │
│  │              │ 📋 Cards (23)         │
│  │              │  · NVIDIA market 80% │  ← click → locate on Board
│  │              │  · MI300 value prop  │
│  │              │                      │
│⚙️│              │ ⚙️ Management         │
│  │              │  · Topics list       │  ← navigate to management layer
│  │              │  · Tasks             │
└──┘              └──────────────────────┘
```

Auto-collapses when user clicks the Canvas area.

## 4. Canvas: Board Two Faces

The canvas has two views of the same underlying data — toggled via tabs at the top.

### Structure View (论证板)

The existing `ThinkingBoardPage` React Flow implementation, promoted to the main canvas:

- **Reuse**: ReactFlow setup, node types (QuestionNode, HypothesisNode, EvidenceNode, DraftNode), edge types (MonoStepEdge), dagre auto-layout, LOD system, cinematic focus mode, keyboard shortcuts
- **Reuse**: HealthSidebar (embed as overlay in Board corner, not separate column)
- **Reuse**: Evidence Pool (merge into left nav Cards list — same data, single location)
- **Remove**: Separate `/topics/:topicId` full-page route (Board now lives in workspace)

### Document View (研究备忘)

The existing memo textarea from CardsPage, evolved into a structured research report:

- **Current state**: Simple textarea with save button (CardsPage lines 984-1037)
- **Evolution**: Auto-generated structured report from Q→H→E data with evidence citations
- **Same data**: Both views read from the same board nodes, edges, and cards
- **Toggle**: Seamless switch; editing in document view reflects on structure view

### Health Indicators

Currently a separate `HealthSidebar` component. In the new layout:

- Embed as a compact overlay in the Board's top-right or bottom-right corner
- Always visible on structure view
- Shows: hypothesis count, evidence count, blind spots, bias warnings
- Clicking a bias warning navigates to that hypothesis on the Board

## 5. Chat + Journal Unified Stream

### Single Timeline, Multiple Content Types

```
┌──────────────────────────┐
│  Chat + Journal Panel     │
│                          │
│  👤 Analyze these 3       │  ← user message
│     articles              │
│                          │
│  🤖 I found 3 key claims │  ← AI reply (rich: card previews,
│     [card preview]       │     board snippets, inline viz)
│     [card preview]       │
│                          │
│  ┌─ AI Reasoning ──────┐ │  ← Journal block (collapsible)
│  │ Observation: A and B │ │     different visual style
│  │ contradict on market │ │     from chat messages
│  │ share data...        │ │
│  │ Action: Created      │ │
│  │ hypothesis node      │ │
│  └──────────────────────┘ │
│                          │
│  🤖 Created 3 hypothesis │  ← operation confirmation
│     nodes on Board       │     (Board updates in real-time)
│                          │
│  ┌─ Research Run ───────┐ │  ← during autonomous execution
│  │ Reading material 2/3 │ │     Journal blocks dominate
│  │ Found 5 new evidence │ │     the stream
│  │ Forming hypothesis   │ │
│  │ about market share...│ │
│  └──────────────────────┘ │
│                          │
│  ───────────────────     │
│  [input box]             │
└──────────────────────────┘
```

### Content Type Behavior

| AI Autonomy Level | Stream Content | Journal Prominence |
|-------------------|----------------|-------------------|
| Explore (read-only) | Mostly conversation, inline results | Minimal — brief reasoning notes |
| Agent (with confirmation) | Conversation + confirmation cards + results | Moderate — reasoning blocks for write ops |
| Research Run (autonomous) | Journal-dominated, progress updates | High — real-time reasoning, each step visible |

### Read vs Write Result Display

| Operation Type | Where Result Appears |
|---------------|---------------------|
| Read/analyze (search, summarize, Q&A) | In Chat stream — full result inline |
| Write/create (cards, nodes, edges) | Brief confirmation in Chat + Canvas updates in real-time |
| Board structure changes | Draft nodes appear on Board + approval card in Chat |

## 6. Research Run as AI Agent

### Philosophy

Research Run is NOT a fixed 6-phase pipeline with progress bars. It is an autonomous AI agent that:

- Receives tools + methodology knowledge
- Freely plans its own research strategy
- Executes step by step, visible in real-time
- Grows the Board organically — nodes appear as AI thinks

The six phases (Reading, Decomposition, Evidence Mapping, Hypothesis Formation, Gap Analysis, Synthesis) are the AI's internal methodology, not a user-facing UI.

### User Experience

```
User: "Help me research AI chip competition"

→ AI generates a research plan (visible in Chat/Journal)
→ AI starts reading materials...
   Board: Question node ❓ appears with animation
→ AI identifies a key argument
   Board: Hypothesis node 💡 grows under the question
→ AI finds supporting evidence
   Board: Evidence node 📎 connects to hypothesis (animated line)
→ AI discovers contradicting information
   Board: Another hypothesis branches out
→ AI identifies an evidence gap
   Board: New sub-question ❓ appears (new branch)
→ ...Board keeps growing as AI thinks...

User watches Board come alive.
User can intervene anytime: "Skip this direction" / "Go deeper here"
```

### Real-time Board Growth

- **New nodes**: Fade-in + expand animation
- **New edges**: Draw animation (line extends from parent to child)
- **Active node**: Breathing/pulse glow effect while AI is processing it
- **Draft state**: All AI-generated nodes appear as Drafts (dashed border + AI badge)
- **Completion**: Floating approval bar appears for batch review

### Templates (optional, not forced)

- Predefined research templates ("Competitive Analysis", "Literature Review", "Thesis Evaluation") as starting suggestions
- AI can also freely generate its own research plan
- Templates are hints, not constraints — user and AI always have full freedom

## 7. Draft Approval & Confirmation

### Confirmation Hierarchy (autonomy decreasing as stakes increase)

| Operation | Confirmation UX |
|-----------|----------------|
| Read/search/analyze | None — auto-execute |
| Create card | Inline confirmation card in Chat stream |
| Board structure changes (via agent chat) | Draft nodes on Board + floating approval bar |
| Board changes (via Research Run) | All appear as Drafts; batch approval when run completes |
| Delete operations | Secondary confirmation dialog |

### Chat Inline Confirmation

```
┌─ Pending Action ─────────────────┐
│ 📋 Create Card                    │
│ Title: NVIDIA market share trend  │
│ Type: Fact                        │
│ Source: Q3 Report                 │
│                                   │
│  [Confirm]  [Cancel]              │
└───────────────────────────────────┘
```

### Board Draft Batch Approval

```
Board canvas with draft nodes:

  ❓ Research question (committed)
  ├── 💡 Hypothesis 1 (committed)
  ├── 💡┈Hypothesis 2┈(draft, dashed border, AI badge)┈┈
  │   ├── 📎┈Evidence A┈(draft)┈
  │   └── 📎┈Evidence B┈(draft)┈
  └── ❓┈New sub-question┈(draft)┈

  ┌─────────────────────────────────────────────────┐
  │ AI proposed 4 new nodes                         │
  │ [Accept All]  [Review One by One]  [Reject All] │
  └─────────────────────────────────────────────────┘
```

- "Review One by One": Highlights each draft node sequentially, shows AI's reasoning, user confirms/rejects each
- Accepted nodes: dashed border → solid border (animation)
- Rejected nodes: fade out and disappear
- Non-blocking: user can ignore drafts and keep working; they persist until acted on

## 8. Management Layer

### Topics Home (entry point)

```
┌─────────────────────────────────────────────────────┐
│  Your Research                                       │
│                                                     │
│  ┌─────────────┐ ┌─────────────┐ ┌───────────────┐ │
│  │ AI Chip      │ │ Energy      │ │ Competitive   │ │
│  │ Competition  │ │ Policy      │ │ Analysis 2026 │ │
│  │              │ │             │ │               │ │
│  │ 📄 3  📋 23  │ │ 📄 5  📋 12 │ │ 📄 2  📋 8   │ │
│  └─────────────┘ └─────────────┘ └───────────────┘ │
│                                                     │
│  [+ New Topic]                                      │
│                                                     │
│  ───────────────────────────────────────────────     │
│  📥 Inbox · 2 materials · 3 cards                   │
│  ───────────────────────────────────────────────     │
└─────────────────────────────────────────────────────┘
```

- Topics are the visual focus: large cards with material/card counts
- Inbox below: single line with counts, expands on click
- Inbox hidden when empty
- Click Topic → enter Topic Workspace

### Other Management Pages

| Page | Status | Changes Needed |
|------|--------|---------------|
| **Tasks** | Existing TasksPage | Keep as-is; shows AI agent run status |
| **Materials** | Existing MaterialsPage | Keep as-is; global material library |
| **Settings** | Existing AISettingsPage + RSS + Sources | Consider consolidating into one settings page |

### Management Navigation

Management layer uses a simpler navigation (sidebar or top bar):
- Topics (home)
- Tasks
- Materials
- Settings

## 9. Component Reuse & Migration Plan

### Components to Reuse As-Is

| Component | Current Location | New Usage |
|-----------|-----------------|-----------|
| QuestionNode | `components/board/QuestionNode.jsx` | Same — Board structure view |
| HypothesisNode | `components/board/HypothesisNode.jsx` | Same — Board structure view |
| EvidenceNode | `components/board/EvidenceNode.jsx` | Same — Board structure view |
| DraftNode | `components/DraftNode.jsx` | Same — Draft approval on Board |
| DraftCommitBar | `components/DraftCommitBar.jsx` | Same — batch approval bar |
| MonoStepEdge | Inside ThinkingBoardPage | Extract and reuse |
| ReaderContent | `components/Reader/ReaderContent.jsx` | Embed in split panel |
| SelectionPopover | `components/Reader/SelectionPopover.jsx` | Same — text selection |
| CardsSidebar (Reader) | `components/Reader/CardsSidebar.jsx` | Same — reader sidebar |
| AIPanel | `components/Reader/AIPanel.jsx` | Same — reader AI panel |
| HealthSidebar | `components/HealthSidebar.jsx` | Reposition as Board overlay |
| GlobalChatPanel | `components/GlobalChatPanel.jsx` | Evolve into workspace Chat panel |
| TopicsSidebar | `components/TopicsSidebar.jsx` | Evolve into collapsible left nav |

### Components to Create

| Component | Purpose |
|-----------|---------|
| `TopicWorkspace` | New page: orchestrates Canvas + Chat + LeftNav + Reader |
| `WorkspaceCanvas` | Wraps Board (structure/document toggle) |
| `BoardCanvas` | Extracted from ThinkingBoardPage — Board without page chrome |
| `DocumentView` | Evolved memo — structured report from Q→H→E data |
| `ChatJournalPanel` | Evolved GlobalChatPanel — wider, with Journal blocks |
| `JournalBlock` | Visual component for AI reasoning entries in stream |
| `ResearchRunProgress` | Journal blocks showing agent progress |
| `TopicsHome` | New management home with topic grid + Inbox |
| `InboxPanel` | Expandable panel for uncategorized materials/cards |
| `WorkspaceLeftNav` | Collapsible nav with Materials + Cards for current topic |

### Pages to Retire

| Page | Replacement |
|------|-------------|
| `CardsPage.jsx` (current `/`) | `TopicsHome` (management) + `TopicWorkspace` (research) |
| `ThinkingBoardPage.jsx` (`/topics/:topicId`) | Absorbed into `TopicWorkspace` |
| `ChatPage.jsx` (`/chat`) | Absorbed into workspace Chat panel |
| `TopicsPage.jsx` (`/topics`) | Absorbed into `TopicsHome` |

### Routes After Migration

```
/ (Layout)
├── /                     → TopicsHome (management home)
├── /topics/:topicId      → TopicWorkspace (immersive workspace)
├── /tasks                → TasksPage (keep)
├── /tasks/:id            → TaskDetailView (keep)
├── /materials            → MaterialsPage (keep)
├── /settings             → Consolidated settings page
├── /login                → LoginPage
└── /register             → RegisterPage
```

Removed routes: `/chat`, `/topics` (list), `/rss`, `/sources`, `/ai-settings`, `/download`, `/materials/:id` (reader is now a workspace split panel, not a page).

## 10. Data Flow Changes

### Surface Context (for AI)

Current `useSurfaceContext` detects page by route. New approach:

```javascript
// In TopicWorkspace
surfaceContext = {
  surface: 'workspace',      // always 'workspace' when in topic workspace
  topicId: currentTopicId,
  boardId: currentBoardId,
  activeView: 'structure' | 'document',
  readerOpen: true | false,
  readerMaterialId: '...' | null,
}
```

AI gets richer context: knows the topic, which view is active, whether the user is reading a material.

### State Management

Current: Multiple Zustand stores (cardsStore, topicsStore, chatStore, etc.)

New workspace needs a unified `workspaceStore`:

```javascript
workspaceStore = {
  // Topic
  topicId: string,

  // Canvas
  activeView: 'structure' | 'document',

  // Reader
  readerOpen: boolean,
  readerMaterialId: string | null,

  // Board
  boardId: string,
  boardRefreshToken: number,

  // Chat
  // (keep using existing chatStore/conversationsStore)

  // Left Nav
  leftNavExpanded: boolean,
}
```

## 11. Visual Design Principles

### Board Real-time Growth Animations

- **Node appear**: Scale from 0.8 → 1.0 + opacity 0 → 1 (200ms ease-out)
- **Edge draw**: Stroke-dashoffset animation along path (300ms)
- **Active processing**: Subtle pulse glow on node border (1.5s infinite)
- **Draft → Committed**: Dashed border → solid border (150ms) + brief green flash
- **Rejected**: Opacity 1 → 0 + scale 1 → 0.9 (200ms)

### Draft Visual Language

- Dashed border (2px dash pattern)
- "AI" badge in top-right corner of node
- Slightly reduced opacity (0.85) compared to committed nodes
- Purple/violet accent color (consistent with current AI accent)

### Information Density

Each surface answers its core question at a glance:
- **Board structure view**: "What's the argument structure?" — visible Q→H→E tree with health overlay
- **Board document view**: "What's the synthesis?" — structured report with evidence citations
- **Chat stream**: "What's happening?" — conversation + Journal blocks
- **Left nav**: "What materials/evidence do I have?" — scannable lists

## 12. Open Questions (for future refinement)

1. **Document view evolution**: Currently a simple textarea. How much auto-generation from Q→H→E data? Full report generation or user-editable draft?
2. **Research Run cancellation UX**: How does the user pause/resume a running agent? Chat command ("pause") or UI button?
3. **Multi-topic research**: Can a user have multiple workspace tabs open? Or strictly one-topic-at-a-time?
4. **Mobile experience**: Workspace is desktop-first. What's the mobile fallback? Chat-only? Read-only Board?
5. **Keyboard shortcuts**: Current Board has Q/H/F/Tab/Ctrl+L shortcuts. How do these work with Chat input focused?
