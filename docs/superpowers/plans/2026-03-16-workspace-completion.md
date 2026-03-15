# Workspace Completion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Verity workspace redesign to full spec fidelity — resizable reader, card info density, bidirectional data loops, full board animation system, Research Run experience, settings consolidation, and nav cleanup.

**Architecture:** Three-layer approach building on the Phase 1-3 foundation. Layer 1 fixes layout and data paths (reader resize, card enrichment, cross-panel linking). Layer 2 adds the animation system (node lifecycle animations, edge drawing, incremental positioning). Layer 3 completes the Research Run experience (progress tracking, autonomy-aware chat, confirmation cards, settings page).

**Tech Stack:** React 18, React Flow (@xyflow/react), Zustand, Vite, Supabase (backend), dagre (graph layout)

**Spec:** `docs/superpowers/specs/2026-03-16-workspace-completion-design.md`

**Verification commands:**
- Frontend build: `cd web-app && npx vite build`
- Backend tests: `cd reading-cards-backend && node --test "test/**/*.test.mjs"`

---

## Chunk 1: Layer 1 — Layout & Data Paths

### Task 1: ResizeDivider Component

**Files:**
- Create: `web-app/src/components/workspace/ResizeDivider.jsx`

- [ ] **Step 1: Create ResizeDivider component**

```jsx
// web-app/src/components/workspace/ResizeDivider.jsx
import { useCallback, useRef } from 'react';

export default function ResizeDivider({
    containerRef,
    currentWidth,
    onResize,
    onDoubleClick,
    minWidth = 320,
    maxWidthPercent = 0.8,
}) {
    const dragging = useRef(false);

    const handleMouseDown = useCallback((e) => {
        e.preventDefault();
        dragging.current = true;

        const container = containerRef.current;
        if (!container) return;

        // Disable pointer events on panels during drag
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        // Prevent Reader/Canvas from intercepting mouse events during drag
        container.querySelectorAll(':scope > div').forEach(el => {
            el.style.pointerEvents = 'none';
        });

        const handleMouseMove = (moveEvent) => {
            if (!dragging.current) return;
            const containerRect = container.getBoundingClientRect();
            const maxWidth = containerRect.width * maxWidthPercent;
            const newWidth = Math.min(
                Math.max(moveEvent.clientX - containerRect.left, minWidth),
                maxWidth
            );
            onResize(newWidth);
        };

        const handleMouseUp = () => {
            dragging.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            // Restore pointer events on panels
            container.querySelectorAll(':scope > div').forEach(el => {
                el.style.pointerEvents = '';
            });
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [containerRef, onResize, minWidth, maxWidthPercent]);

    return (
        <div
            className="h-full shrink-0 relative group"
            style={{ width: 4, cursor: 'col-resize' }}
            onMouseDown={handleMouseDown}
            onDoubleClick={onDoubleClick}
        >
            {/* Visual line */}
            <div
                className="absolute inset-y-0 left-1/2 -translate-x-1/2 transition-all"
                style={{
                    width: 2,
                    background: 'var(--stroke-0)',
                }}
            />
            {/* Hover/active highlight */}
            <div
                className="absolute inset-y-0 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{
                    width: 6,
                    background: 'var(--accent-400)',
                    boxShadow: '0 0 8px rgba(13,110,253,0.3)',
                }}
            />
        </div>
    );
}
```

- [ ] **Step 2: Verify build passes**

Run: `cd web-app && npx vite build`
Expected: Build succeeds (component not yet imported anywhere)

- [ ] **Step 3: Commit**

```bash
git add web-app/src/components/workspace/ResizeDivider.jsx
git commit -m "feat(workspace): add ResizeDivider component (Spec §1.1)"
```

---

### Task 2: Integrate ResizeDivider into TopicWorkspace

**Files:**
- Modify: `web-app/src/lib/store.js` (workspaceStore, ~line 770)
- Modify: `web-app/src/components/workspace/TopicWorkspace.jsx`

- [ ] **Step 1: Add readerWidth to workspaceStore**

In `store.js`, find `useWorkspaceStore` (line ~770). Add new fields after `readerMaterialId`:

```javascript
// After line ~780 (readerMaterialId: null,)
readerWidth: null,        // px integer, null = compute 40% on first open
```

Add actions after `closeReader` (line ~809):

```javascript
// After closeReader
setReaderWidth: (w) => set({ readerWidth: w }),
initReaderWidth: (containerWidth) => {
    if (!get().readerWidth) set({ readerWidth: Math.round(containerWidth * 0.4) });
},
```

Update `leaveWorkspace` (line ~797) to reset `readerWidth`:

```javascript
leaveWorkspace: () => set({
    topicId: null, boardId: null,
    activeView: 'structure',
    readerOpen: false, readerMaterialId: null, readerWidth: null,
    boardRefreshToken: 0,
    leftNavExpanded: false,
}),
```

- [ ] **Step 2: Integrate ResizeDivider into TopicWorkspace**

In `TopicWorkspace.jsx`:

Add imports:
```javascript
import { useState, useEffect, useCallback, useRef } from 'react';
// Add ResizeDivider import:
import ResizeDivider from './ResizeDivider';
```

Add to destructured store values (line ~17):
```javascript
readerWidth, setReaderWidth, initReaderWidth,
```

Add ref for content area, width initialization, and preset cycling:
```javascript
const contentAreaRef = useRef(null);

// Initialize reader width as pixels on first open (avoid mixing string '%' with px)
useEffect(() => {
    if (readerOpen && contentAreaRef.current && !readerWidth) {
        initReaderWidth(contentAreaRef.current.clientWidth);
    }
}, [readerOpen, readerWidth, initReaderWidth]);

const cyclePresetWidth = useCallback(() => {
    const container = contentAreaRef.current;
    if (!container) return;
    const w = container.clientWidth;
    const current = readerWidth || Math.round(w * 0.4);
    // Cycle: 40% → 60% → 40%
    const target = current < w * 0.5 ? Math.round(w * 0.6) : Math.round(w * 0.4);
    // Enable smooth CSS transition for preset cycling
    const readerPanel = contentAreaRef.current?.querySelector('[data-reader-panel]');
    if (readerPanel) {
        readerPanel.style.transition = 'width 200ms ease-out';
        setTimeout(() => { readerPanel.style.transition = ''; }, 220);
    }
    setReaderWidth(target);
}, [readerWidth, setReaderWidth]);
```

Replace the main content area (line 79-137) with:
```jsx
{/* Main content area */}
<div className="flex-1 flex overflow-hidden" ref={contentAreaRef}>
    {/* Reader split panel (when open) */}
    {readerOpen && readerMaterialId && (
        <div
            data-reader-panel
            className="h-full shrink-0 relative"
            style={{
                width: readerWidth || 400,
                minWidth: 320,
            }}
        >
            <WorkspaceReader
                materialId={readerMaterialId}
                onClose={handleCloseReader}
                onCardCreated={handleCardCreated}
                isEmbedded
            />
        </div>
    )}

    {/* Resize divider */}
    {readerOpen && readerMaterialId && (
        <ResizeDivider
            containerRef={contentAreaRef}
            currentWidth={readerWidth}
            onResize={setReaderWidth}
            onDoubleClick={cyclePresetWidth}
            minWidth={320}
            maxWidthPercent={0.8}
        />
    )}

    {/* Canvas area */}
    <div className="flex-1 flex flex-col min-w-0 relative" onClick={handleCanvasClick}>
        {/* View toggle tabs */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex rounded-xl glass-surface overflow-hidden" style={{ boxShadow: '0 10px 22px rgba(31, 27, 20, 0.14)' }}>
            <button
                onClick={() => setActiveView('structure')}
                className="px-4 py-2 text-xs font-medium transition-colors"
                style={{
                    background: activeView === 'structure' ? 'rgba(13,110,253,0.10)' : 'transparent',
                    color: activeView === 'structure' ? 'var(--accent-400)' : 'var(--text-2)',
                }}
            >
                论证板
            </button>
            <button
                onClick={() => setActiveView('document')}
                className="px-4 py-2 text-xs font-medium transition-colors"
                style={{
                    background: activeView === 'document' ? 'rgba(13,110,253,0.10)' : 'transparent',
                    color: activeView === 'document' ? 'var(--accent-400)' : 'var(--text-2)',
                }}
            >
                研究报告
            </button>
        </div>

        {/* Board Canvas — ALWAYS mounted */}
        <div className="flex-1" style={{ display: activeView === 'structure' ? 'block' : 'none' }}>
            <BoardCanvas
                topicId={topicId}
                onBoardLoaded={handleBoardLoaded}
                dragCardRef={dragCardRef}
                focusCardId={focusCardId}
                className="h-full"
            />
        </div>

        {/* Document View — only rendered when active */}
        {activeView === 'document' && (
            <DocumentView topicId={topicId} className="flex-1" />
        )}
    </div>
</div>
```

- [ ] **Step 3: Verify build passes**

Run: `cd web-app && npx vite build`

- [ ] **Step 4: Commit**

```bash
git add web-app/src/lib/store.js web-app/src/components/workspace/TopicWorkspace.jsx
git commit -m "feat(workspace): integrate resizable reader panel (Spec §1.1)"
```

---

### Task 3: Backend — Expand Board Node Card Join

**Files:**
- Modify: `reading-cards-backend/src/services/supabase/boards.mjs` (line ~154)

- [ ] **Step 1: Expand card select in listNodes**

In `boards.mjs`, find `listNodes` function (line ~150). Change the card join select from:

```javascript
card:cards(id, summary, key_points, source_name, source_url, raw_snippet, image_url)
```

To:

```javascript
card:cards(id, summary, key_points, source_name, source_url, raw_snippet, image_url, material_id, locator, title, fact_or_view)
```

- [ ] **Step 2: Run backend tests**

Run: `cd reading-cards-backend && node --test "test/**/*.test.mjs"`
Expected: All tests pass (additive change only)

- [ ] **Step 3: Verify frontend build**

Run: `cd web-app && npx vite build`

- [ ] **Step 4: Commit**

```bash
git add reading-cards-backend/src/services/supabase/boards.mjs
git commit -m "feat(boards): expand card join fields for reader linking (Spec §1.3)"
```

---

### Task 4: Backend — Add source_region to Card Response

**Files:**
- Modify: `reading-cards-backend/src/services/supabase/cards.mjs` (transformCard, ~line 445)

- [ ] **Step 1: Add source_region derivation to transformCard**

In `cards.mjs`, the `transformCard` function (line ~445) transforms a DB card into an API response. The card's source region must be derived from the related source or RSS subscription, not stored on the card itself. The card already has `source_name` and `source_url` from which we can look up the source.

However, since `transformCard` is a synchronous pure function that doesn't do DB lookups, the simplest approach is to include `source_region` in the DB query that fetches cards. Find the main card listing query (the `listCards` or equivalent function that calls `transformCard`) and add a join or subselect for region.

If the card has a `material_id`, and materials link to sources via `source_id`, add region to the select. Alternatively, if the cards table has a direct `source_url` field, we can join on `sources.url = cards.source_url` to get region.

The simplest approach: add `source_region` to `transformCard` output:

```javascript
// In transformCard, add after source_url:
source_region: dbCard.source_region || null,
```

Then in the query that fetches cards (e.g., `listCards`), add region to the select. If cards are fetched with a source join already, extend it to include `region`. If not, add a left join:

```javascript
// In the query, e.g. inside listCards or getCards:
// After .select('*, ...') add:
// source:sources!cards_source_url_fkey(region)
// Then in transform: source_region: dbCard.source?.region || null
```

The exact implementation depends on the query structure — the implementer should read the existing query and extend it minimally.

- [ ] **Step 2: Run backend tests**

Run: `cd reading-cards-backend && node --test "test/**/*.test.mjs"`
Expected: All tests pass (additive change)

- [ ] **Step 3: Commit**

```bash
git add reading-cards-backend/src/services/supabase/cards.mjs
git commit -m "feat(cards): add source_region to card API response (Spec §1.2)"
```

---

### Task 5: Card→Reader Scroll-to-Quote Data Path

**Files:**
- Modify: `web-app/src/lib/store.js` (workspaceStore)
- Modify: `web-app/src/components/workspace/WorkspaceReader.jsx`
- Modify: `web-app/src/components/workspace/TopicWorkspace.jsx`

- [ ] **Step 1: Add readerScrollLocator to workspaceStore**

In `store.js` workspaceStore, add after `readerWidth`:

```javascript
readerScrollLocator: null,   // { exact, prefix, suffix, chunk_id } or null
```

Add actions:
```javascript
openReaderAtQuote: (materialId, locator) => set({
    readerOpen: true,
    readerMaterialId: materialId,
    readerScrollLocator: locator || null,
}),
clearReaderScrollLocator: () => set({ readerScrollLocator: null }),
```

Update `leaveWorkspace` to also reset `readerScrollLocator: null`.

Update `closeReader` to also reset `readerScrollLocator: null`.

- [ ] **Step 2: Add scrollLocator support to WorkspaceReader**

In `WorkspaceReader.jsx`, add a `useEffect` after the material loading effect (after line ~93):

```javascript
// Scroll-to-quote when scrollLocator changes
const readerScrollLocator = useWorkspaceStore(s => s.readerScrollLocator);
const clearReaderScrollLocator = useWorkspaceStore(s => s.clearReaderScrollLocator);

useEffect(() => {
    if (!readerScrollLocator || !material) return;
    // Create a temporary highlight from the locator to trigger scroll
    const hlId = `scroll-target-${Date.now()}`;
    const scrollHighlight = {
        id: hlId,
        exact: readerScrollLocator.exact,
        prefix: readerScrollLocator.prefix || '',
        suffix: readerScrollLocator.suffix || '',
        chunk_id: readerScrollLocator.chunk_id || null,
        color: 'indigo',
    };
    setCardHighlights([scrollHighlight]);
    setActiveCardHighlightId(hlId);
    // Clear the scroll request so it doesn't re-trigger
    clearReaderScrollLocator();
}, [readerScrollLocator, material, clearReaderScrollLocator]);
```

Add `useWorkspaceStore` import if not already present.

- [ ] **Step 3: Wire up TopicWorkspace handleOpenReader for scroll**

In `TopicWorkspace.jsx`, update `handleOpenReader` to also accept a locator:

```javascript
const handleOpenReaderAtQuote = useCallback((materialId, locator) => {
    const { openReaderAtQuote } = useWorkspaceStore.getState();
    openReaderAtQuote(materialId, locator);
    setLeftNavExpanded(false);
}, [setLeftNavExpanded]);
```

Pass both `onOpenReader={handleOpenReader}` and `onOpenReaderAtQuote={handleOpenReaderAtQuote}` to `WorkspaceLeftNav`.

- [ ] **Step 4: Verify build**

Run: `cd web-app && npx vite build`

- [ ] **Step 5: Commit**

```bash
git add web-app/src/lib/store.js web-app/src/components/workspace/WorkspaceReader.jsx web-app/src/components/workspace/TopicWorkspace.jsx
git commit -m "feat(workspace): add card→reader scroll-to-quote data path (Spec §1.3)"
```

---

### Task 6: WorkspaceLeftNav Card Info Density

**Files:**
- Modify: `web-app/src/components/workspace/WorkspaceLeftNav.jsx`

- [ ] **Step 1: Add region flags map and enhance card rendering**

At the top of WorkspaceLeftNav.jsx, add:

```javascript
const REGION_FLAGS = {
    us: '🇺🇸', cn: '🇨🇳', eu: '🇪🇺', jp: '🇯🇵', kr: '🇰🇷', uk: '🇬🇧',
};
```

Add `BookOpen, Crosshair` to lucide imports.

Update the component props to accept `onOpenReaderAtQuote`:

```javascript
export default function WorkspaceLeftNav({
    topicId, topicTitle, expanded, onToggle,
    onOpenReader, onOpenReaderAtQuote, onLocateCard, dragCardRef,
}) {
```

- [ ] **Step 2: Replace card item rendering (expanded mode)**

Replace the card item render block (the `filteredItems.map(card => (...))` section in the `else` branch, approximately lines 212-251) with:

```jsx
filteredItems.map(card => {
    const regionFlag = card.source_region ? REGION_FLAGS[card.source_region] : null;
    const locator = (() => {
        const raw = card.locator;
        if (!raw) return null;
        if (typeof raw === 'object') return raw;
        if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return null; } }
        return null;
    })();

    return (
        <div
            key={card.id}
            draggable={!!dragCardRef}
            onDragStart={() => handleDragStart(card)}
            onClick={() => onLocateCard?.(card.id)}
            className="p-2.5 rounded-lg transition-all hover:-translate-y-px cursor-pointer group/card"
            style={{ background: 'var(--surface-0)', border: '1px solid transparent' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--stroke-0)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
        >
            <div className="flex items-start gap-2">
                {dragCardRef && (
                    <div className="shrink-0 pt-0.5 opacity-30 group-hover/card:opacity-70 transition-opacity" style={{ color: 'var(--text-2)' }}>
                        <GripVertical size={12} />
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    {/* Title row: region flag + type badge + title */}
                    <div className="flex items-center gap-1 mb-0.5">
                        {regionFlag && <span className="text-[10px]">{regionFlag}</span>}
                        <span
                            className="text-[8px] font-mono font-bold uppercase px-1 rounded-sm"
                            style={{
                                color: '#fff',
                                backgroundColor: card.fact_or_view === 'view' ? 'var(--text-secondary)' : 'var(--text-primary)',
                            }}
                        >
                            {card.fact_or_view === 'view' ? 'VIEW' : 'FACT'}
                        </span>
                        <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text-0)' }}>
                            {card.title || '暂未命名'}
                        </span>
                    </div>
                    {/* Summary */}
                    <div className="text-[10px] line-clamp-2 mb-1" style={{ color: 'var(--text-2)', lineHeight: '1.5' }}>
                        {card.summary || '(无内容)'}
                    </div>
                    {/* Source badge row */}
                    <div className="flex items-center justify-between">
                        {card.source_name && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (card.material_id && locator) {
                                        onOpenReaderAtQuote?.(card.material_id, locator.quote_selector || locator);
                                    } else if (card.material_id) {
                                        onOpenReader?.(card.material_id);
                                    }
                                }}
                                className="flex items-center gap-1 text-[10px] truncate max-w-[60%] hover:underline"
                                style={{ color: 'var(--accent-400)' }}
                            >
                                <FileText size={9} className="shrink-0" />
                                {card.source_name}
                            </button>
                        )}
                        {/* Hover actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
                            {card.material_id && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (locator) {
                                            onOpenReaderAtQuote?.(card.material_id, locator.quote_selector || locator);
                                        } else {
                                            onOpenReader?.(card.material_id);
                                        }
                                    }}
                                    className="p-0.5 rounded hover:bg-blue-500/10"
                                    style={{ color: 'var(--text-2)' }}
                                    title="在阅读器中查看原文"
                                >
                                    <BookOpen size={11} />
                                </button>
                            )}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onLocateCard?.(card.id);
                                }}
                                className="p-0.5 rounded hover:bg-blue-500/10"
                                style={{ color: 'var(--text-2)' }}
                                title="在论证板上定位"
                            >
                                <Crosshair size={11} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
})
```

- [ ] **Step 3: Verify build**

Run: `cd web-app && npx vite build`

- [ ] **Step 4: Commit**

```bash
git add web-app/src/components/workspace/WorkspaceLeftNav.jsx
git commit -m "feat(workspace): enhance card info density in LeftNav (Spec §1.2)"
```

---

### Task 7: Board Evidence Node Double-Click → Reader

**Files:**
- Modify: `web-app/src/components/workspace/BoardCanvas.jsx` (line ~760 area)
- Modify: `web-app/src/components/workspace/TopicWorkspace.jsx`

- [ ] **Step 1: Add onNodeDoubleClick handler to BoardCanvas**

In `BoardCanvas.jsx`, inside `BoardCanvasInner`, add a prop `onOpenReaderAtQuote` and a double-click handler:

```javascript
// Add to BoardCanvasInner props destructuring
const { topicId, onBoardLoaded, dragCardRef, focusCardId, className, onOpenReaderAtQuote } = props;
```

Add handler function:
```javascript
const handleNodeDoubleClick = useCallback((event, node) => {
    if (node.type === 'evidenceNode' && node.data?.card) {
        const card = node.data.card;
        if (card.material_id && onOpenReaderAtQuote) {
            const locator = (() => {
                const raw = card.locator;
                if (!raw) return null;
                if (typeof raw === 'object') return raw;
                if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return null; } }
                return null;
            })();
            onOpenReaderAtQuote(card.material_id, locator?.quote_selector || locator);
        }
    }
}, [onOpenReaderAtQuote]);
```

Add to `<ReactFlow>` component props:
```jsx
onNodeDoubleClick={handleNodeDoubleClick}
```

- [ ] **Step 2: Pass onOpenReaderAtQuote from TopicWorkspace to BoardCanvas**

In `TopicWorkspace.jsx`, add `onOpenReaderAtQuote={handleOpenReaderAtQuote}` to the `<BoardCanvas>` props.

- [ ] **Step 3: Verify build**

Run: `cd web-app && npx vite build`

- [ ] **Step 4: Commit**

```bash
git add web-app/src/components/workspace/BoardCanvas.jsx web-app/src/components/workspace/TopicWorkspace.jsx
git commit -m "feat(board): evidence node double-click opens reader at quote (Spec §1.3)"
```

---

### Task 8: Navigation Cleanup

**Files:**
- Modify: `web-app/src/components/Layout.jsx`
- Modify: `web-app/src/components/workspace/WorkspaceLeftNav.jsx`

- [ ] **Step 1: Update Layout.jsx nav structure**

Replace the `navGroups` and `userItems` arrays (lines 24-52) with:

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
    { to: '/ai-settings', icon: Sparkles, label: '设置' },
    // NOTE: This temporarily points to /ai-settings. After Task 21 (SettingsPage + routes),
    // update to { to: '/settings', icon: Settings, label: '设置' } — see Task 23 Step 1.
];
```

Remove unused imports from lucide: `CreditCard`, `BookOpen`, `Globe`, `Download`, `MessageCircle`, `Layout as LayoutIcon`, `Rss`. Keep `Sparkles` for settings. Add `Settings` import for later use.

- [ ] **Step 2: Update WorkspaceLeftNav footer**

In `WorkspaceLeftNav.jsx`, add `ListChecks, Settings` to lucide imports.

Replace the footer section (lines ~260-270) with:

```jsx
{/* Footer — management quick links */}
<div className="px-3 py-2 flex items-center gap-2" style={{ borderTop: '1px solid var(--stroke-0)' }}>
    <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1.5 text-xs py-1.5 px-2 rounded-lg transition-colors hover:bg-blue-500/10"
        style={{ color: 'var(--text-2)' }}
        title="研究主页"
    >
        <Home size={14} />
    </button>
    <button
        onClick={() => navigate('/tasks')}
        className="flex items-center gap-1.5 text-xs py-1.5 px-2 rounded-lg transition-colors hover:bg-blue-500/10"
        style={{ color: 'var(--text-2)' }}
        title="研究任务"
    >
        <ListChecks size={14} />
    </button>
    <button
        onClick={() => navigate('/ai-settings')}
        className="flex items-center gap-1.5 text-xs py-1.5 px-2 rounded-lg transition-colors hover:bg-blue-500/10"
        style={{ color: 'var(--text-2)' }}
        title="设置"
    >
        <Settings size={14} />
    </button>
</div>
```

Also update the collapsed state footer (inside the `if (!expanded)` block, around lines 106-116) — replace single Home button with three icons:

```jsx
<div className="flex flex-col items-center gap-2">
    <button onClick={() => navigate('/')} className="p-2 rounded-lg transition-colors hover:bg-blue-500/10" style={{ color: 'var(--text-2)' }} title="研究主页">
        <Home size={18} />
    </button>
    <button onClick={() => navigate('/tasks')} className="p-2 rounded-lg transition-colors hover:bg-blue-500/10" style={{ color: 'var(--text-2)' }} title="研究任务">
        <ListChecks size={18} />
    </button>
    <button onClick={() => navigate('/ai-settings')} className="p-2 rounded-lg transition-colors hover:bg-blue-500/10" style={{ color: 'var(--text-2)' }} title="设置">
        <Settings size={18} />
    </button>
</div>
```

- [ ] **Step 3: Update App.jsx soft transition routes**

In `App.jsx`, separate the route groups. The primary routes and workspace route stay as-is. Move old routes into a separate group but keep them functional. Specifically:

- Remove `/workbench` and `/chat` from the primary Layout group
- Keep them in a separate `<Route element={<Layout />}>` block after the workspace route
- This is a minimal change — just reorganize the existing `<Route>` elements

- [ ] **Step 4: Verify build**

Run: `cd web-app && npx vite build`

- [ ] **Step 5: Commit**

```bash
git add web-app/src/components/Layout.jsx web-app/src/components/workspace/WorkspaceLeftNav.jsx web-app/src/App.jsx
git commit -m "feat(nav): clean up management nav, add workspace quick links (Spec §1.4, §3.6)"
```

---

## Chunk 2: Layer 2 — Animation System

### Task 9: CSS Animation Keyframes

**Files:**
- Modify: `web-app/src/index.css` (after existing @keyframes, line ~525)

- [ ] **Step 1: Add board animation keyframes**

Add after the existing `@keyframes shimmer` block (line ~525):

```css
/* ===== Board Node Animations (Spec §2.1) ===== */

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

/* Utility classes for board animations */
.node-entering {
    animation: nodeAppear 200ms ease-out;
}
.node-rejecting {
    animation: nodeReject 200ms ease-out forwards;
}
.node-pulse {
    animation: nodePulse 1.5s infinite;
}
.node-committing {
    animation: commitFlash 500ms ease-out;
}

/* Draft node transition styles */
.draft-node-container {
    transition: border-color 150ms ease, opacity 150ms ease, background-color 150ms ease;
}
.draft-node-badge {
    transition: opacity 200ms ease;
}

/* Dagre re-layout position transition (toggled programmatically) */
.dagre-transitioning .react-flow__node {
    transition: transform 300ms ease !important;
}
```

- [ ] **Step 2: Verify build**

Run: `cd web-app && npx vite build`

- [ ] **Step 3: Commit**

```bash
git add web-app/src/index.css
git commit -m "feat(board): add animation keyframes for node lifecycle (Spec §2.1)"
```

---

### Task 10: AnimatedNodeWrapper Component

**Files:**
- Create: `web-app/src/components/board/AnimatedNodeWrapper.jsx`

- [ ] **Step 1: Create AnimatedNodeWrapper**

```jsx
// web-app/src/components/board/AnimatedNodeWrapper.jsx
import { useEffect, useRef } from 'react';

/**
 * Wraps board nodes with animation lifecycle support.
 * Reads data.animationState: 'entering' | 'active' | 'rejecting' | 'committing' | null
 */
export default function AnimatedNodeWrapper({ animationState, onAnimationEnd, children }) {
    const ref = useRef(null);

    useEffect(() => {
        if (!animationState || !ref.current) return;

        if (animationState === 'entering') {
            const timer = setTimeout(() => onAnimationEnd?.('entered'), 200);
            return () => clearTimeout(timer);
        }
        if (animationState === 'rejecting') {
            const timer = setTimeout(() => onAnimationEnd?.('rejected'), 200);
            return () => clearTimeout(timer);
        }
        if (animationState === 'committing') {
            const timer = setTimeout(() => onAnimationEnd?.('committed'), 500);
            return () => clearTimeout(timer);
        }
    }, [animationState, onAnimationEnd]);

    const className = animationState === 'entering' ? 'node-entering'
        : animationState === 'rejecting' ? 'node-rejecting'
        : animationState === 'active' ? 'node-pulse'
        : animationState === 'committing' ? 'node-committing'
        : '';

    return (
        <div ref={ref} className={className}>
            {children}
        </div>
    );
}
```

- [ ] **Step 2: Verify build**

Run: `cd web-app && npx vite build`

- [ ] **Step 3: Commit**

```bash
git add web-app/src/components/board/AnimatedNodeWrapper.jsx
git commit -m "feat(board): add AnimatedNodeWrapper for node animations (Spec §2.1)"
```

---

### Task 11: Wrap Existing Nodes with AnimatedNodeWrapper

**Files:**
- Modify: `web-app/src/components/board/QuestionNode.jsx`
- Modify: `web-app/src/components/board/HypothesisNode.jsx`
- Modify: `web-app/src/components/board/EvidenceNode.jsx`
- Modify: `web-app/src/components/DraftNode.jsx`

- [ ] **Step 1: Wrap QuestionNode**

In `QuestionNode.jsx`, add import:
```javascript
import AnimatedNodeWrapper from './AnimatedNodeWrapper';
```

Add `animationState` and `onAnimationEnd` to data destructuring (line ~27):
```javascript
const { content, priority, status, onUpdate, onAddSubQuestion, onAddHypothesis, onDelete, isCollapsed, onToggleCollapse, childCount, lod, dimmed, compactMode, animationState, onAnimationEnd } = data;
```

Wrap the outermost render `<div>` with:
```jsx
<AnimatedNodeWrapper animationState={animationState} onAnimationEnd={onAnimationEnd}>
    {/* existing render content */}
</AnimatedNodeWrapper>
```

- [ ] **Step 2: Wrap HypothesisNode**

Same pattern as QuestionNode. Import `AnimatedNodeWrapper`, add `animationState, onAnimationEnd` to data destructuring, wrap outer div.

- [ ] **Step 3: Wrap EvidenceNode**

Same pattern. Import from `'./AnimatedNodeWrapper'`, destructure, wrap.

- [ ] **Step 4: Wrap DraftNode**

In `DraftNode.jsx` (at `web-app/src/components/DraftNode.jsx`), import:
```javascript
import AnimatedNodeWrapper from './board/AnimatedNodeWrapper';
```

Add `animationState, onAnimationEnd` to data destructuring. Wrap outer div.

Additionally, apply draft visual language enhancements — add `opacity: 0.85` to the container style and `draft-node-container` class to the main div.

- [ ] **Step 5: Verify build**

Run: `cd web-app && npx vite build`

- [ ] **Step 6: Commit**

```bash
git add web-app/src/components/board/QuestionNode.jsx web-app/src/components/board/HypothesisNode.jsx web-app/src/components/board/EvidenceNode.jsx web-app/src/components/DraftNode.jsx
git commit -m "feat(board): wrap all node types with AnimatedNodeWrapper (Spec §2.1, §2.3)"
```

---

### Task 12: MonoStepEdge Draw Animation

**Files:**
- Modify: `web-app/src/components/board/MonoStepEdge.jsx`

- [ ] **Step 1: Add edge draw animation support**

Replace the entire `MonoStepEdge.jsx` content with:

```jsx
import { useEffect, useRef, useState } from 'react';
import { getSmoothStepPath } from '@xyflow/react';

export default function MonoStepEdge({ id, sourceX, sourceY, targetX, targetY, style, markerEnd, data }) {
    const [edgePath] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, borderRadius: 12 });
    const isFocus = data?.isFocus;
    const animated = data?.animated;
    const onAnimationComplete = data?.onAnimationComplete;

    const pathRef = useRef(null);
    const [pathLength, setPathLength] = useState(0);
    const [animating, setAnimating] = useState(false);

    // Calculate path length for draw animation
    useEffect(() => {
        if (animated && pathRef.current) {
            const length = pathRef.current.getTotalLength();
            setPathLength(length);
            setAnimating(true);
            // Trigger animation on next frame
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setAnimating(false);
                });
            });
            // Clear animated flag after animation completes
            const timer = setTimeout(() => {
                onAnimationComplete?.(id);
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [animated, edgePath, id, onAnimationComplete]);

    return (
        <g>
            {/* Hitbox */}
            <path d={edgePath} fill="none" stroke="transparent" strokeWidth={20} />
            {/* Visual stroke */}
            <path
                ref={pathRef}
                d={edgePath}
                fill="none"
                stroke={style?.stroke || 'var(--stroke-1)'}
                strokeWidth={style?.strokeWidth || 1.5}
                strokeDasharray={animated ? (pathLength || 1000) : (style?.strokeDasharray || 'none')}
                strokeDashoffset={animated && animating ? (pathLength || 1000) : 0}
                style={{
                    transition: animated ? 'stroke-dashoffset 300ms ease-out' : 'none',
                    opacity: style?.opacity ?? 1,
                }}
                markerEnd={markerEnd}
            />
            {/* Focus glow */}
            {isFocus && (
                <path
                    d={edgePath}
                    fill="none"
                    stroke={style?.stroke || '#0D6EFD'}
                    strokeWidth={(style?.strokeWidth || 1.5) + 6}
                    strokeOpacity={0.15}
                    style={{ filter: 'blur(4px)' }}
                />
            )}
        </g>
    );
}
```

- [ ] **Step 2: Verify build**

Run: `cd web-app && npx vite build`

- [ ] **Step 3: Commit**

```bash
git add web-app/src/components/board/MonoStepEdge.jsx
git commit -m "feat(board): add edge draw animation to MonoStepEdge (Spec §2.2)"
```

---

### Task 13: Incremental Positioning & Stagger in BoardCanvas

**Files:**
- Modify: `web-app/src/lib/store.js` (workspaceStore)
- Modify: `web-app/src/components/workspace/BoardCanvas.jsx`

- [ ] **Step 1: Add layoutMode and boardNodeAdder to workspaceStore**

In `store.js` workspaceStore, add fields:

```javascript
layoutMode: 'dagre',         // 'dagre' | 'incremental'
boardNodeAdder: null,         // callback set by BoardCanvas
```

Add actions:

```javascript
setLayoutMode: (mode) => set({ layoutMode: mode }),
setBoardNodeAdder: (fn) => set({ boardNodeAdder: fn }),
addBoardNode: (nodeData) => {
    const { boardNodeAdder } = get();
    if (boardNodeAdder) boardNodeAdder(nodeData);
},
```

Update `leaveWorkspace` to reset `layoutMode: 'dagre', boardNodeAdder: null`.

- [ ] **Step 2: Add addNodesWithStagger to BoardCanvas**

In `BoardCanvas.jsx`, inside `BoardCanvasInner`, add after the existing `createChildNode` function:

```javascript
// Incremental positioning — place new node relative to parent
const computeIncrementalPosition = useCallback((parentNode, childType, siblingIndex) => {
    if (!parentNode) return { x: 100, y: 100 };
    const px = parentNode.position.x;
    const py = parentNode.position.y;
    const ph = parentNode.measured?.height || 120;

    switch (childType) {
        case 'question':
            return { x: px + siblingIndex * 300, y: py + ph + 40 };
        case 'hypothesis':
            return { x: px + siblingIndex * 300, y: py + ph + 30 };
        case 'evidence':
            return { x: px + 20, y: py + siblingIndex * 90 + ph + 20 };
        default:
            return { x: px + 200, y: py + ph + 40 };
    }
}, []);

// Add nodes with stagger animation
const addNodesWithStagger = useCallback((newNodes) => {
    const layoutMode = useWorkspaceStore.getState().layoutMode;

    newNodes.forEach((nodeData, index) => {
        setTimeout(() => {
            const parentNode = nodeData.parent_id
                ? nodes.find(n => n.id === nodeData.parent_id)
                : null;

            const position = layoutMode === 'incremental'
                ? computeIncrementalPosition(parentNode, nodeData.node_type, index)
                : { x: 0, y: 0 }; // dagre will reposition

            const newNode = {
                id: nodeData.id,
                type: nodeData.node_type === 'question' ? 'questionNode'
                    : nodeData.node_type === 'hypothesis' ? 'hypothesisNode'
                    : nodeData.node_type === 'evidence' ? 'evidenceNode'
                    : 'draftNode',
                position,
                data: {
                    ...nodeData,
                    animationState: 'entering',
                    onAnimationEnd: () => {
                        setNodes(ns => ns.map(n =>
                            n.id === nodeData.id ? { ...n, data: { ...n.data, animationState: null } } : n
                        ));
                    },
                },
            };

            setNodes(ns => [...ns, newNode]);

            // Create edge if parent exists
            if (nodeData.parent_id) {
                const newEdge = {
                    id: `e-${nodeData.parent_id}-${nodeData.id}`,
                    source: nodeData.parent_id,
                    target: nodeData.id,
                    type: 'monoStep',
                    data: {
                        animated: true,
                        onAnimationComplete: (edgeId) => {
                            setEdges(es => es.map(e =>
                                e.id === edgeId ? { ...e, data: { ...e.data, animated: false } } : e
                            ));
                        },
                    },
                };
                setEdges(es => [...es, newEdge]);
            }

            // If dagre mode, run layout after all nodes added
            if (layoutMode === 'dagre' && index === newNodes.length - 1) {
                setTimeout(() => autoLayout(), 50);
            }
        }, index * 100); // 100ms stagger delay
    });
}, [nodes, setNodes, setEdges, computeIncrementalPosition]);
```

- [ ] **Step 3: Register boardNodeAdder on mount**

In BoardCanvasInner, add a useEffect:

```javascript
useEffect(() => {
    useWorkspaceStore.getState().setBoardNodeAdder((nodeData) => {
        addNodesWithStagger(Array.isArray(nodeData) ? nodeData : [nodeData]);
    });
    return () => useWorkspaceStore.getState().setBoardNodeAdder(null);
}, [addNodesWithStagger]);
```

- [ ] **Step 4: Add dagre transition class toggling**

In the `autoLayout` function (line ~572), add class toggling for smooth position transitions:

```javascript
const autoLayout = useCallback(() => {
    // Add transition class
    const container = document.querySelector('.react-flow');
    if (container) container.classList.add('dagre-transitioning');

    const { layoutedNodes, layoutedEdges } = getLayoutedElements(nodes, edges);
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);

    // Remove transition class after animation
    setTimeout(() => {
        if (container) container.classList.remove('dagre-transitioning');
    }, 350);
}, [nodes, edges, setNodes, setEdges]);
```

- [ ] **Step 5: Verify build**

Run: `cd web-app && npx vite build`

- [ ] **Step 6: Commit**

```bash
git add web-app/src/lib/store.js web-app/src/components/workspace/BoardCanvas.jsx
git commit -m "feat(board): add incremental positioning, stagger animations, dagre transitions (Spec §2.4)"
```

---

### Task 14: DraftCommitBar Reject Animation

**Files:**
- Modify: `web-app/src/components/DraftCommitBar.jsx`
- Modify: `web-app/src/components/workspace/BoardCanvas.jsx`

- [ ] **Step 1: Add animation triggers to DraftCommitBar callbacks**

In `BoardCanvas.jsx`, find where DraftCommitBar's `onReject` / `onRejectAll` callbacks are defined. Before removing nodes, set their `animationState` to `'rejecting'` and delay actual removal by 200ms:

```javascript
const handleRejectDraft = useCallback((nodeId) => {
    // Set rejecting animation
    setNodes(ns => ns.map(n =>
        n.id === nodeId ? { ...n, data: { ...n.data, animationState: 'rejecting' } } : n
    ));
    // Remove after animation
    setTimeout(() => {
        setNodes(ns => ns.filter(n => n.id !== nodeId));
    }, 200);
}, [setNodes]);

const handleRejectAllDrafts = useCallback(() => {
    const draftIds = nodes.filter(n => n.data?.isDraft).map(n => n.id);
    // Set rejecting animation on all drafts
    setNodes(ns => ns.map(n =>
        draftIds.includes(n.id) ? { ...n, data: { ...n.data, animationState: 'rejecting' } } : n
    ));
    // Remove after animation
    setTimeout(() => {
        setNodes(ns => ns.filter(n => !draftIds.includes(n.id)));
    }, 200);
}, [nodes, setNodes]);
```

Similarly for commit (accept):
```javascript
const handleCommitDraft = useCallback((nodeId) => {
    setNodes(ns => ns.map(n =>
        n.id === nodeId ? { ...n, data: { ...n.data, animationState: 'committing', isDraft: false } } : n
    ));
    setTimeout(() => {
        setNodes(ns => ns.map(n =>
            n.id === nodeId ? { ...n, data: { ...n.data, animationState: null } } : n
        ));
    }, 500);
}, [setNodes]);
```

- [ ] **Step 2: Verify build**

Run: `cd web-app && npx vite build`

- [ ] **Step 3: Commit**

```bash
git add web-app/src/components/workspace/BoardCanvas.jsx web-app/src/components/DraftCommitBar.jsx
git commit -m "feat(board): add draft commit/reject animations (Spec §2.3)"
```

---

## Chunk 3: Layer 3 — Research Run Experience & Polish

### Task 15: Chat Utilities

**Files:**
- Create: `web-app/src/lib/chat-utils.js`

- [ ] **Step 1: Create chat-utils.js**

```javascript
// web-app/src/lib/chat-utils.js

/**
 * Tool names that modify state (create/update/delete).
 * Used to determine when to show JournalBlocks and confirmation cards.
 */
export const WRITE_TOOL_NAMES = new Set([
    'create_board_node', 'update_board_node', 'delete_board_node',
    'create_board_edge', 'delete_board_edge',
    'create_card', 'update_card', 'delete_card',
    'commit_draft', 'reject_draft',
    'create_hypothesis', 'update_hypothesis',
]);

export function isWriteOperation(toolName) {
    return WRITE_TOOL_NAMES.has(toolName);
}

/**
 * Determines whether a JournalBlock should be shown for a message
 * based on the current autonomy level.
 */
export function shouldShowJournalBlock(message, autonomyLevel) {
    if (autonomyLevel === 'run') return true;
    if (autonomyLevel === 'agent') {
        return message.tool_calls?.some(tc => isWriteOperation(tc.name || tc.function?.name));
    }
    return false;
}

/**
 * Maps autonomy level to backend chat mode.
 */
export const AUTONOMY_TO_MODE = {
    explore: 'chat',
    agent: 'agent',
    run: 'auto',
};

/**
 * Maps tool call names to Journal display icons.
 */
export const TOOL_ICONS = {
    read_material: '📖',
    create_board_node: '💡',
    create_board_edge: '🔗',
    create_card: '📋',
    delete_board_node: '🗑️',
    create_hypothesis: '💡',
    update_hypothesis: '✏️',
    search_cards: '🔍',
    search_materials: '🔍',
};

export function getToolIcon(toolName) {
    return TOOL_ICONS[toolName] || '⚙️';
}
```

- [ ] **Step 2: Verify build**

Run: `cd web-app && npx vite build`

- [ ] **Step 3: Commit**

```bash
git add web-app/src/lib/chat-utils.js
git commit -m "feat(chat): add chat utilities — write tool detection, autonomy mapping (Spec §3.2)"
```

---

### Task 16: Autonomy Level in WorkspaceStore + ChatJournalPanel

**Files:**
- Modify: `web-app/src/lib/store.js` (workspaceStore)
- Modify: `web-app/src/components/workspace/ChatJournalPanel.jsx`

- [ ] **Step 1: Add autonomy fields to workspaceStore**

In `store.js` workspaceStore, add fields:

```javascript
autonomyLevel: 'explore',       // 'explore' | 'agent' | 'run'
activeResearchRun: null,         // { id, startTime } or null
```

Add actions:

```javascript
setAutonomyLevel: (level) => set({ autonomyLevel: level }),
setActiveResearchRun: (run) => set({ activeResearchRun: run }),
```

Update `leaveWorkspace` to reset `autonomyLevel: 'explore', activeResearchRun: null`.

- [ ] **Step 2: Add autonomy-aware rendering to ChatJournalPanel**

In `ChatJournalPanel.jsx`:

Add imports:
```javascript
import { useWorkspaceStore } from '../../lib/store';
import { shouldShowJournalBlock, AUTONOMY_TO_MODE } from '../../lib/chat-utils';
```

Read autonomy level from store:
```javascript
const autonomyLevel = useWorkspaceStore(s => s.autonomyLevel);
```

Add mode badge above the input box (find the input area, approximately line ~300+):

```jsx
{/* Autonomy mode badge */}
<div className="flex items-center gap-2 px-4 py-1">
    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{
        background: autonomyLevel === 'run' ? 'rgba(24,160,106,0.12)' :
                    autonomyLevel === 'agent' ? 'rgba(13,110,253,0.12)' :
                    'rgba(0,0,0,0.06)',
        color: autonomyLevel === 'run' ? '#18A06A' :
               autonomyLevel === 'agent' ? 'var(--accent-400)' :
               'var(--text-2)',
    }}>
        {autonomyLevel === 'run' ? '🚀 Research Run' :
         autonomyLevel === 'agent' ? '🤖 代理' : '🔍 探索'}
    </span>
</div>
```

Update input placeholder based on autonomy:
```javascript
const inputPlaceholder = autonomyLevel === 'run' ? '输入指令干预研究方向...'
    : autonomyLevel === 'agent' ? '告诉 AI 你想做什么...'
    : '问任何关于这个研究的问题...';
```

Filter JournalBlock visibility based on autonomy level — in the message rendering loop, wrap JournalBlock rendering:
```javascript
// Before rendering a JournalBlock for a message:
if (!shouldShowJournalBlock(msg, autonomyLevel)) {
    // Skip journal block, render as normal message
}
```

- [ ] **Step 3: Sync autonomy level with mode toggle**

When user changes mode in the existing mode toggle UI, also update autonomyLevel:

```javascript
const handleModeChange = (newMode) => {
    setMode(newMode);
    const levelMap = { chat: 'explore', agent: 'agent', auto: 'run' };
    useWorkspaceStore.getState().setAutonomyLevel(levelMap[newMode] || 'explore');
};
```

- [ ] **Step 4: Verify build**

Run: `cd web-app && npx vite build`

- [ ] **Step 5: Commit**

```bash
git add web-app/src/lib/store.js web-app/src/components/workspace/ChatJournalPanel.jsx
git commit -m "feat(chat): autonomy-aware rendering in ChatJournalPanel (Spec §3.2)"
```

---

### Task 17: ConfirmationCard Component

**Files:**
- Create: `web-app/src/components/workspace/ConfirmationCard.jsx`

- [ ] **Step 1: Create ConfirmationCard**

```jsx
// web-app/src/components/workspace/ConfirmationCard.jsx
import { useState } from 'react';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { getToolIcon } from '../../lib/chat-utils';

export default function ConfirmationCard({ toolName, title, details, parentInfo, onConfirm, onCancel }) {
    const [state, setState] = useState('pending'); // 'pending' | 'confirming' | 'confirmed' | 'cancelled'

    const handleConfirm = async () => {
        setState('confirming');
        try {
            await onConfirm?.();
            setState('confirmed');
        } catch {
            setState('pending');
        }
    };

    const handleCancel = () => {
        onCancel?.();
        setState('cancelled');
    };

    if (state === 'confirmed') {
        return (
            <div className="flex items-center gap-2 py-2 px-3 rounded-lg text-xs" style={{ background: 'rgba(24,160,106,0.08)', color: '#18A06A' }}>
                <CheckCircle size={14} />
                <span>已确认 — {title}</span>
            </div>
        );
    }

    if (state === 'cancelled') {
        return (
            <div className="flex items-center gap-2 py-2 px-3 rounded-lg text-xs" style={{ background: 'rgba(195,58,48,0.08)', color: '#C33A30' }}>
                <XCircle size={14} />
                <span>已取消 — {title}</span>
            </div>
        );
    }

    const icon = getToolIcon(toolName);

    return (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--stroke-0)', borderLeft: '3px solid var(--accent-400)' }}>
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--stroke-0)' }}>
                <span className="text-sm">{icon}</span>
                <span className="text-xs font-medium" style={{ color: 'var(--text-0)' }}>{title}</span>
            </div>
            {/* Body */}
            <div className="px-3 py-2.5">
                {details && (
                    <p className="text-xs mb-1.5" style={{ color: 'var(--text-1)' }}>{details}</p>
                )}
                {parentInfo && (
                    <p className="text-[10px]" style={{ color: 'var(--text-2)' }}>父节点: {parentInfo}</p>
                )}
            </div>
            {/* Actions */}
            <div className="flex items-center gap-2 px-3 py-2" style={{ borderTop: '1px solid var(--stroke-0)' }}>
                <button
                    onClick={handleConfirm}
                    disabled={state === 'confirming'}
                    className="px-3 py-1 text-xs rounded-lg disabled:opacity-50"
                    style={{ background: 'var(--accent-500)', color: '#fff' }}
                >
                    {state === 'confirming' ? <Loader2 size={12} className="animate-spin" /> : '确认'}
                </button>
                <button
                    onClick={handleCancel}
                    className="px-3 py-1 text-xs rounded-lg"
                    style={{ color: 'var(--text-2)' }}
                >
                    取消
                </button>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Verify build**

Run: `cd web-app && npx vite build`

- [ ] **Step 3: Commit**

```bash
git add web-app/src/components/workspace/ConfirmationCard.jsx
git commit -m "feat(chat): add ConfirmationCard for write operation approval (Spec §3.3)"
```

---

### Task 18: ResearchRunProgress Component

**Files:**
- Create: `web-app/src/components/workspace/ResearchRunProgress.jsx`

- [ ] **Step 1: Create ResearchRunProgress**

```jsx
// web-app/src/components/workspace/ResearchRunProgress.jsx
import { useState, useEffect } from 'react';
import { Pause, Play, Square, CheckCircle, Loader2 } from 'lucide-react';
import { useWorkspaceStore } from '../../lib/store';

function formatElapsed(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}m ${sec.toString().padStart(2, '0')}s`;
}

export default function ResearchRunProgress({ className }) {
    const activeRun = useWorkspaceStore(s => s.activeResearchRun);
    const setActiveResearchRun = useWorkspaceStore(s => s.setActiveResearchRun);
    const setAutonomyLevel = useWorkspaceStore(s => s.setAutonomyLevel);
    const [elapsed, setElapsed] = useState(0);
    const [paused, setPaused] = useState(false);

    // Elapsed time counter
    useEffect(() => {
        if (!activeRun?.startTime || paused) return;
        const interval = setInterval(() => {
            setElapsed(Date.now() - activeRun.startTime);
        }, 1000);
        return () => clearInterval(interval);
    }, [activeRun?.startTime, paused]);

    if (!activeRun) return null;

    const stats = activeRun.stats || {};
    const isComplete = activeRun.status === 'completed';
    const isFailed = activeRun.status === 'failed';

    const handleStop = () => {
        if (!confirm('确定停止 Research Run？已创建的 Draft 节点将保留。')) return;
        setActiveResearchRun({ ...activeRun, status: 'completed' });
        setAutonomyLevel('explore');
    };

    const bgColor = isComplete ? 'rgba(24,160,106,0.06)'
        : isFailed ? 'rgba(195,58,48,0.06)'
        : paused ? 'rgba(217,119,6,0.06)'
        : 'rgba(24,160,106,0.06)';

    return (
        <div className={`px-4 py-3 ${className || ''}`} style={{ background: bgColor, borderBottom: '1px solid var(--stroke-0)' }}>
            <div className="flex items-center gap-3">
                {/* Status dot */}
                {isComplete ? (
                    <CheckCircle size={14} style={{ color: '#18A06A' }} />
                ) : isFailed ? (
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#C33A30' }} />
                ) : (
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: paused ? '#D97706' : '#18A06A', animation: paused ? 'none' : 'nodePulse 1.5s infinite' }} />
                )}

                {/* Current action */}
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate" style={{ color: 'var(--text-0)' }}>
                        {isComplete ? 'Research Run 完成' : isFailed ? 'Research Run 失败' : paused ? '已暂停' : (activeRun.currentAction || '研究进行中...')}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px]" style={{ color: 'var(--text-2)' }}>
                        {stats.materialsRead != null && <span>材料 {stats.materialsRead}/{stats.materialsTotal || '?'}</span>}
                        {stats.nodesCreated != null && <span>节点 +{stats.nodesCreated}</span>}
                        {stats.evidenceFound != null && <span>证据 +{stats.evidenceFound}</span>}
                        <span>{formatElapsed(elapsed)}</span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                    {!isComplete && !isFailed && (
                        <>
                            <button
                                onClick={() => setPaused(!paused)}
                                className="p-1.5 rounded-lg transition-colors hover:bg-blue-500/10"
                                style={{ color: 'var(--text-2)' }}
                                title={paused ? '继续' : '暂停'}
                            >
                                {paused ? <Play size={14} /> : <Pause size={14} />}
                            </button>
                            <button
                                onClick={handleStop}
                                className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
                                style={{ color: '#C33A30' }}
                                title="停止"
                            >
                                <Square size={14} />
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Integrate into ChatJournalPanel**

In `ChatJournalPanel.jsx`, import and render above the message list:

```javascript
import ResearchRunProgress from './ResearchRunProgress';
```

```jsx
{/* Before the message list */}
<ResearchRunProgress className="shrink-0" />
```

- [ ] **Step 3: Verify build**

Run: `cd web-app && npx vite build`

- [ ] **Step 4: Commit**

```bash
git add web-app/src/components/workspace/ResearchRunProgress.jsx web-app/src/components/workspace/ChatJournalPanel.jsx
git commit -m "feat(chat): add ResearchRunProgress tracking component (Spec §3.1)"
```

---

### Task 19: Wire Incremental Node Addition from Chat Stream

**Files:**
- Modify: `web-app/src/components/workspace/ChatJournalPanel.jsx`

- [ ] **Step 1: Add tool result interception for Research Run**

In `ChatJournalPanel.jsx`, import the workspace store:

```javascript
import { useWorkspaceStore } from '../../lib/store';
```

Find where streaming messages are processed (where new assistant messages with tool_calls arrive). Add a handler that extracts board node/edge creation results during Research Run and dispatches them to the board:

```javascript
// After a streaming message chunk is processed and tool_calls are available:
const handleToolResultForBoard = useCallback((toolCalls) => {
    const { autonomyLevel, addBoardNode } = useWorkspaceStore.getState();
    if (autonomyLevel !== 'run') return;

    for (const tc of toolCalls) {
        const name = tc.name || tc.function?.name;
        const result = tc.result || tc.output;
        if (!result) continue;

        if (name === 'create_board_node' && result.node) {
            addBoardNode(result.node);
        }
        // create_board_edge is handled via addBoardNode's edge creation logic
        // when the node has a parent_id
    }
}, []);
```

Call `handleToolResultForBoard(msg.tool_calls)` when a message with tool_calls is received.

- [ ] **Step 2: Trigger boardRefreshToken sync on Research Run completion**

When Research Run completes (detected by task status change or explicit stop), sync server state:

```javascript
// In the Research Run completion handler (or ResearchRunProgress stop handler):
useWorkspaceStore.getState().invalidateBoard();
```

Add this call in `ResearchRunProgress.jsx`'s `handleStop` function:

```javascript
const handleStop = () => {
    if (!confirm('确定停止 Research Run？已创建的 Draft 节点将保留。')) return;
    setActiveResearchRun({ ...activeRun, status: 'completed' });
    setAutonomyLevel('explore');
    // Sync board with server state
    useWorkspaceStore.getState().invalidateBoard();
    // Switch back to dagre layout mode
    useWorkspaceStore.getState().setLayoutMode('dagre');
};
```

- [ ] **Step 3: Verify build**

Run: `cd web-app && npx vite build`

- [ ] **Step 4: Commit**

```bash
git add web-app/src/components/workspace/ChatJournalPanel.jsx web-app/src/components/workspace/ResearchRunProgress.jsx
git commit -m "feat(chat): wire incremental node addition from chat stream to board (Spec §2.5)"
```

---

### Task 20: User Intervention During Research Run

**Files:**
- Modify: `web-app/src/components/workspace/ChatJournalPanel.jsx`

- [ ] **Step 1: Add intervention keyword detection**

In `ChatJournalPanel.jsx`, modify the message send handler. When `autonomyLevel === 'run'`, check for intervention keywords before sending:

```javascript
const INTERVENTION_KEYWORDS = {
    '暂停': 'pause', 'pause': 'pause',
    '继续': 'resume', 'resume': 'resume',
    '停止': 'stop', 'stop': 'stop',
};

// In the send handler, before sending the message:
const handleSendWithIntervention = useCallback((text) => {
    const { autonomyLevel, activeResearchRun, setActiveResearchRun } = useWorkspaceStore.getState();

    if (autonomyLevel === 'run') {
        const keyword = INTERVENTION_KEYWORDS[text.trim().toLowerCase()];
        if (keyword === 'pause') {
            setActiveResearchRun({ ...activeResearchRun, status: 'paused' });
            // Still send the message so AI receives it
        } else if (keyword === 'resume') {
            setActiveResearchRun({ ...activeResearchRun, status: 'running' });
        } else if (keyword === 'stop') {
            setActiveResearchRun({ ...activeResearchRun, status: 'completed' });
            useWorkspaceStore.getState().setAutonomyLevel('explore');
            useWorkspaceStore.getState().invalidateBoard();
            useWorkspaceStore.getState().setLayoutMode('dagre');
        }
    }

    // Continue with normal send
    sendMessage(text);
}, [sendMessage]);
```

- [ ] **Step 2: Visual distinction for intervention messages in stream**

User intervention messages during Research Run should render as standard chat bubbles (not JournalBlocks). The existing message rendering already handles this correctly — user messages render as chat bubbles, only AI tool_calls become JournalBlocks. No extra work needed here as long as `shouldShowJournalBlock` only applies to assistant messages.

Verify: in the message rendering loop, `shouldShowJournalBlock` is only called for messages where `msg.role === 'assistant'`, not for `msg.role === 'user'`.

- [ ] **Step 3: Verify build**

Run: `cd web-app && npx vite build`

- [ ] **Step 4: Commit**

```bash
git add web-app/src/components/workspace/ChatJournalPanel.jsx
git commit -m "feat(chat): add user intervention detection during Research Run (Spec §3.4)"
```

---

### Task 21: Settings Page

**Files:**
- Create: `web-app/src/pages/SettingsPage.jsx`
- Modify: `web-app/src/App.jsx`

- [ ] **Step 1: Create SettingsPage with tab structure**

```jsx
// web-app/src/pages/SettingsPage.jsx
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles, Rss, Globe, Download } from 'lucide-react';

// Lazy-load tab content to avoid circular deps
import AISettingsPage from './AISettingsPage';
import RssPage from './RssPage';
import SourcesPage from './SourcesPage';
import DownloadPage from './DownloadPage';

const TABS = [
    { key: 'ai', label: 'AI 模型', icon: Sparkles },
    { key: 'rss', label: 'RSS 订阅', icon: Rss },
    { key: 'sources', label: '信息源', icon: Globe },
    { key: 'export', label: '导出', icon: Download },
];

export default function SettingsPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') || 'ai';

    const setTab = (tab) => {
        setSearchParams({ tab }, { replace: true });
    };

    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-0)' }}>设置</h1>

            {/* Tab bar */}
            <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'var(--surface-1)', border: '1px solid var(--stroke-0)' }}>
                {TABS.map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors flex-1 justify-center"
                        style={{
                            background: activeTab === key ? 'var(--surface-0)' : 'transparent',
                            color: activeTab === key ? 'var(--text-0)' : 'var(--text-2)',
                            boxShadow: activeTab === key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                        }}
                    >
                        <Icon size={14} />
                        {label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div>
                {activeTab === 'ai' && <AISettingsPage />}
                {activeTab === 'rss' && <RssPage />}
                {activeTab === 'sources' && <SourcesPage />}
                {activeTab === 'export' && <DownloadPage />}
            </div>
        </div>
    );
}
```

**Important — double header prevention**: The existing pages (AISettingsPage, RssPage, etc.) likely have their own `<h1>` titles. Rendering them inside SettingsPage will produce double headers. The fix: read each page component before integrating. If it has a top-level title/header, add an `embedded` prop:

```jsx
// In each sub-page (e.g., AISettingsPage):
export default function AISettingsPage({ embedded = false }) {
    return (
        <div>
            {!embedded && <h1>AI 设置</h1>}
            {/* rest of content */}
        </div>
    );
}
```

Then in SettingsPage: `<AISettingsPage embedded />`. Apply this pattern to each tab content page as needed.

- [ ] **Step 2: Add SettingsPage route to App.jsx**

In `App.jsx`, add import:
```javascript
import SettingsPage from './pages/SettingsPage';
```

Add route inside the primary Layout group:
```jsx
<Route path="settings" element={<SettingsPage />} />
```

Add redirects for old settings routes:
```jsx
<Route path="ai-settings" element={<Navigate to="/settings?tab=ai" replace />} />
<Route path="download" element={<Navigate to="/settings?tab=export" replace />} />
```

- [ ] **Step 3: Verify build**

Run: `cd web-app && npx vite build`

- [ ] **Step 4: Commit**

```bash
git add web-app/src/pages/SettingsPage.jsx web-app/src/App.jsx
git commit -m "feat(settings): unified settings page with tabs (Spec §3.5)"
```

---

### Task 22: Route Cleanup (Soft Transition)

**Files:**
- Modify: `web-app/src/App.jsx`

- [ ] **Step 1: Reorganize routes for soft transition**

In `App.jsx`, restructure the routes. Keep the primary routes clean and move legacy routes to a separate group:

Primary management routes (in nav):
```jsx
<Route element={<Layout />}>
    <Route index element={<TopicsHome />} />
    <Route path="tasks" element={<TasksPage />} />
    <Route path="tasks/:id" element={<TaskDetailView />} />
    <Route path="materials" element={<MaterialsPage />} />
    <Route path="settings" element={<SettingsPage />} />
</Route>
```

Workspace route (unchanged):
```jsx
<Route path="topics/:topicId" element={<WorkspaceLayout />}>
    <Route index element={<Suspense ...><TopicWorkspace /></Suspense>} />
</Route>
```

Legacy routes (accessible by URL, hidden from nav):
```jsx
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

- [ ] **Step 2: Verify build**

Run: `cd web-app && npx vite build`

- [ ] **Step 3: Commit**

```bash
git add web-app/src/App.jsx
git commit -m "feat(routes): soft-transition route cleanup, legacy routes hidden from nav (Spec §3.6)"
```

---

### Task 23: Final Fixups & Build Verification

**Files:**
- Modify: `web-app/src/components/Layout.jsx`
- Modify: `web-app/src/components/workspace/WorkspaceLeftNav.jsx`

- [ ] **Step 1: Update nav links from /ai-settings to /settings**

Now that SettingsPage and its route exist (from Tasks 21-22), update the temporary `/ai-settings` links:

In `Layout.jsx`, change `userItems`:
```javascript
const userItems = [
    { to: '/settings', icon: Settings, label: '设置' },
];
```

In `WorkspaceLeftNav.jsx`, update the settings button in both expanded and collapsed footer:
```javascript
onClick={() => navigate('/settings')}
```

- [ ] **Step 2: Frontend build**

Run: `cd web-app && npx vite build`
Expected: Build succeeds with 0 errors

- [ ] **Step 3: Backend tests**

Run: `cd reading-cards-backend && node --test "test/**/*.test.mjs"`
Expected: All tests pass

- [ ] **Step 4: Review git log**

Run: `git log --oneline -25`
Expected: ~20 new commits covering all tasks

- [ ] **Step 5: Commit fixups**

```bash
git add web-app/src/components/Layout.jsx web-app/src/components/workspace/WorkspaceLeftNav.jsx
git commit -m "fix(nav): update settings links to /settings after SettingsPage created (Spec §3.6)"
```

If build or tests revealed other issues, fix and commit each fix separately.
