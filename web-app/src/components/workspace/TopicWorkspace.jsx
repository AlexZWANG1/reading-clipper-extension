// ========= TopicWorkspace — Core Research Experience (Spec §2, §3, §12) =========
// Orchestrates: WorkspaceLeftNav + Canvas (Board/Document toggle) + Reader split + ChatJournalPanel
// Single-page immersive workspace — user spends 90% of time here.
// BoardCanvas must never unmount when toggling views (§10).

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useWorkspaceStore } from '../../lib/store';
import WorkspaceLeftNav from './WorkspaceLeftNav';
import BoardCanvas from './BoardCanvas';
import DocumentView from './DocumentView';
import WorkspaceReader from './WorkspaceReader';
import ChatJournalPanel from './ChatJournalPanel';
import ResizeDivider from './ResizeDivider';

export default function TopicWorkspace() {
    const { topicId } = useParams();
    const {
        activeView, setActiveView,
        readerOpen, readerMaterialId,
        openReader, closeReader,
        readerWidth, setReaderWidth, initReaderWidth,
        leftNavExpanded, toggleLeftNav, setLeftNavExpanded,
        enterWorkspace, leaveWorkspace,
        setBoardId,
    } = useWorkspaceStore();

    const [topicTitle, setTopicTitle] = useState('');
    const [focusCardId, setFocusCardId] = useState(null);
    const dragCardRef = useRef(null);
    const contentAreaRef = useRef(null);

    // Enter/leave workspace lifecycle
    useEffect(() => {
        enterWorkspace(topicId);
        return () => leaveWorkspace();
    }, [topicId, enterWorkspace, leaveWorkspace]);

    // Initialize reader width as pixels on first open
    useEffect(() => {
        if (readerOpen && contentAreaRef.current && !readerWidth) {
            initReaderWidth(contentAreaRef.current.clientWidth);
        }
    }, [readerOpen, readerWidth, initReaderWidth]);

    const handleBoardLoaded = useCallback((boardId, topic) => {
        setBoardId(boardId);
        setTopicTitle(topic?.title || '');
    }, [setBoardId]);

    const handleOpenReader = useCallback((materialId) => {
        openReader(materialId);
        setLeftNavExpanded(false);
    }, [openReader, setLeftNavExpanded]);

    const handleOpenReaderAtQuote = useCallback((materialId, locator) => {
        const { openReaderAtQuote } = useWorkspaceStore.getState();
        openReaderAtQuote(materialId, locator);
        setLeftNavExpanded(false);
    }, [setLeftNavExpanded]);

    const handleCloseReader = useCallback(() => {
        closeReader();
    }, [closeReader]);

    const handleCardCreated = useCallback(() => {
        // Refresh board when a card is created from reader
        useWorkspaceStore.getState().invalidateBoard();
    }, []);

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

    // Auto-collapse left nav when clicking canvas
    const handleCanvasClick = useCallback(() => {
        if (leftNavExpanded) setLeftNavExpanded(false);
    }, [leftNavExpanded, setLeftNavExpanded]);

    return (
        <div className="flex h-full w-full overflow-hidden">
            {/* Left Nav */}
            <WorkspaceLeftNav
                topicId={topicId}
                topicTitle={topicTitle}
                expanded={leftNavExpanded}
                onToggle={toggleLeftNav}
                onOpenReader={handleOpenReader}
                onOpenReaderAtQuote={handleOpenReaderAtQuote}
                onLocateCard={(cardId) => {
                    setActiveView('structure');
                    setFocusCardId(cardId);
                    // Reset after a tick so re-clicking same card works
                    setTimeout(() => setFocusCardId(null), 500);
                }}
                dragCardRef={dragCardRef}
            />

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

                {/* Canvas area — clicking here auto-collapses left nav (Spec §3) */}
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

                    {/* Board Canvas — ALWAYS mounted, hidden via CSS when document view active (Spec §10) */}
                    <div className="flex-1" style={{ display: activeView === 'structure' ? 'block' : 'none' }}>
                        <BoardCanvas
                            topicId={topicId}
                            onBoardLoaded={handleBoardLoaded}
                            onOpenReaderAtQuote={handleOpenReaderAtQuote}
                            dragCardRef={dragCardRef}
                            focusCardId={focusCardId}
                            className="h-full"
                        />
                    </div>

                    {/* Document View — only rendered when active */}
                    {activeView === 'document' && (
                        <DocumentView
                            topicId={topicId}
                            className="flex-1"
                        />
                    )}
                </div>
            </div>

            {/* Chat + Journal Panel (always visible right column, ~30-40% width) */}
            <div className="shrink-0" style={{ width: 360 }}>
                <ChatJournalPanel className="h-full" />
            </div>
        </div>
    );
}
