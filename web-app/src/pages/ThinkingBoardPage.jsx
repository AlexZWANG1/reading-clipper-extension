// ========= Thinking Board Page — Thin wrapper around BoardCanvas =========
// Legacy route: /topics/:topicId — wraps BoardCanvas with page chrome
// Will be replaced by TopicWorkspace in Phase 2 (Spec §9, §13)

import { useState, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, GripVertical, Search } from 'lucide-react';
import { useCardsStore, useChatStore } from '../lib/store';
import AddCardSection from '../components/AddCardSection';
import HealthSidebar from '../components/HealthSidebar';
import BoardCanvas from '../components/board/BoardCanvas';

function buildHighlightUrl(baseUrl, rawSnippet) {
    if (!baseUrl || !rawSnippet) return baseUrl || '#';
    try {
        const url = new URL(baseUrl);
        const cleanText = rawSnippet.replace(/\s+/g, ' ').trim().slice(0, 80);
        if (!cleanText) return baseUrl;
        url.hash = `:~:text=${encodeURIComponent(cleanText).replace(/-/g, '%2D')}`;
        return url.toString();
    } catch { return baseUrl; }
}

function ThinkingBoardPage() {
    const navigate = useNavigate();
    const { topicId } = useParams();
    const { cards, fetchCards } = useCardsStore();
    const { boardInvalidateCounter } = useChatStore();

    // Sidebar state
    const [showAllCards, setShowAllCards] = useState(false);
    const [showAddCard, setShowAddCard] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Board state received from BoardCanvas
    const [boardId, setBoardId] = useState(null);
    const [topicTitle, setTopicTitle] = useState('');

    const handleBoardLoaded = useCallback((id, topicData) => {
        setBoardId(id);
        setTopicTitle(topicData?.title || '');
        fetchCards(showAllCards ? {} : { topic_id: topicId });
    }, [topicId, fetchCards, showAllCards]);

    // Sidebar cards
    const filteredCards = useMemo(() => {
        let result = showAllCards ? cards : cards.filter(c => c.topic_id === topicId);
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            result = result.filter(c =>
                (c.summary || '').toLowerCase().includes(q) ||
                (c.raw_snippet || '').toLowerCase().includes(q) ||
                (c.source?.name || '').toLowerCase().includes(q)
            );
        }
        return result;
    }, [cards, showAllCards, topicId, searchQuery]);

    return (
        <div className="flex" style={{ height: '100vh', width: '100%', background: 'var(--bg-0)' }}>
            {/* ========= Canvas ========= */}
            <div className="flex-1 relative" style={{ height: '100%' }}>
                {/* Page chrome: back button + title */}
                <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-4 py-2 rounded-xl glass-surface" style={{ boxShadow: '0 10px 22px rgba(31, 27, 20, 0.14)' }}>
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 rounded-lg transition-colors hover:bg-blue-500/10"
                        style={{ color: 'var(--text-1)' }}
                        title="返回"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div className="h-5 w-px" style={{ background: 'var(--stroke-0)' }} />
                    <h1 className="text-sm font-bold max-w-[200px] truncate" style={{ color: 'var(--text-0)' }}>
                        {topicTitle || 'Thinking Board'}
                    </h1>
                </div>

                <BoardCanvas
                    topicId={topicId}
                    onBoardLoaded={handleBoardLoaded}
                    boardRefreshToken={boardInvalidateCounter}
                />
            </div>

            {/* ========= Health Sidebar ========= */}
            {boardId && (
                <HealthSidebar boardId={boardId} invalidateCounter={boardInvalidateCounter} />
            )}

            {/* ========= Evidence Pool Sidebar ========= */}
            {sidebarOpen && (
                <div className="w-72 flex flex-col h-full shrink-0" style={{ background: 'var(--surface-1)', borderLeft: '1px solid var(--stroke-0)' }}>
                    <div className="p-4" style={{ borderBottom: '1px solid var(--stroke-1)' }}>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold text-sm" style={{ color: 'var(--text-0)' }}>证据池</h3>
                            <button onClick={() => setSidebarOpen(false)} className="p-1 rounded transition-colors hover:bg-blue-500/10" style={{ color: 'var(--text-2)' }} title="收起证据池">✕</button>
                        </div>
                        <div className="relative mb-3">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-2)' }} />
                            <input
                                id="board-evidence-search"
                                name="board_evidence_search"
                                aria-label="搜索证据"
                                type="text"
                                placeholder="搜索证据..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-8 pr-3 py-2 text-xs rounded-lg outline-none transition-all"
                                style={{ background: 'var(--bg-0)', color: 'var(--text-0)', border: '1px solid var(--stroke-0)' }}
                                onFocus={(e) => { e.target.style.borderColor = 'var(--accent-400)'; }}
                                onBlur={(e) => { e.target.style.borderColor = 'var(--stroke-0)'; }}
                            />
                        </div>
                        <div className="flex gap-1">
                            <button onClick={() => setShowAllCards(false)} className="flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors" style={{ background: !showAllCards ? 'rgba(13,110,253,0.12)' : 'transparent', color: !showAllCards ? 'var(--accent-300)' : 'var(--text-2)' }}>当前 Topic</button>
                            <button onClick={() => setShowAllCards(true)} className="flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors" style={{ background: showAllCards ? 'rgba(13,110,253,0.12)' : 'transparent', color: showAllCards ? 'var(--accent-300)' : 'var(--text-2)' }}>全部卡片</button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {filteredCards.map(card => {
                            const sourceName = card.source?.name || (card.source_url ? (() => { try { return new URL(card.source_url).hostname.replace('www.', ''); } catch { return ''; } })() : '');
                            return (
                                <div key={card.id} draggable className="group/card flex items-start gap-2 p-3 rounded-xl cursor-grab text-sm transition-all hover:-translate-y-0.5" style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                    <div className="shrink-0 pt-0.5 opacity-30 group-hover/card:opacity-70 transition-opacity" style={{ color: 'var(--text-2)' }}>
                                        <GripVertical size={14} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between mb-1.5 gap-2">
                                            <div className="flex items-start gap-1.5 flex-1 min-w-0">
                                                <span className="text-[9px] font-mono font-bold uppercase tracking-wide px-1 rounded-sm shrink-0" style={{ color: '#fff', backgroundColor: card.fact_or_view === 'view' ? 'var(--text-secondary)' : 'var(--text-primary)', marginTop: '2px' }}>
                                                    {card.fact_or_view === 'view' ? 'VIEW' : 'FACT'}
                                                </span>
                                                <span className="font-bold text-[12px] leading-snug line-clamp-2" style={{ color: 'var(--text-0)' }}>{card.title || '暂未命名'}</span>
                                            </div>
                                            {card.source_url && (
                                                <a href={buildHighlightUrl(card.source_url, card.raw_snippet)} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover/card:opacity-100 transition-all p-0.5 shrink-0" style={{ color: 'var(--accent-300)' }} title="跳转原文" onClick={e => e.stopPropagation()}>
                                                    <ExternalLink size={11} />
                                                </a>
                                            )}
                                        </div>
                                        {sourceName && <div className="text-[10px] mb-1.5 truncate" style={{ color: 'var(--accent-300)' }}>📰 {sourceName}</div>}
                                        <div className="line-clamp-3 text-[11px] font-medium" style={{ color: 'var(--text-1)', lineHeight: '1.55' }}>{card.summary || '(无内容)'}</div>
                                        {card.raw_snippet && (
                                            <details className="mt-2">
                                                <summary className="text-[10px] cursor-pointer select-none" style={{ color: 'var(--text-2)' }}>查看原文</summary>
                                                <div className="mt-1 p-2 rounded text-[11px] max-h-24 overflow-y-auto whitespace-pre-wrap break-words" style={{ background: 'var(--bg-0)', border: '1px solid var(--stroke-0)', color: 'var(--text-2)', lineHeight: '1.55' }}>{card.raw_snippet}</div>
                                            </details>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {filteredCards.length === 0 && <div className="text-center text-xs py-8" style={{ color: 'var(--text-2)' }}>暂无卡片</div>}
                    </div>

                    <div className="p-3" style={{ borderTop: '1px solid var(--stroke-1)' }}>
                        <button onClick={() => setShowAddCard(!showAddCard)} className="w-full text-xs py-2 rounded-lg font-medium transition-colors hover:bg-blue-500/10" style={{ background: 'var(--bg-1)', border: '1px solid var(--stroke-0)', color: 'var(--text-1)' }}>
                            {showAddCard ? '收起' : '+ 新建卡片'}
                        </button>
                        {showAddCard && <div className="mt-3"><AddCardSection /></div>}
                    </div>
                </div>
            )}

            {!sidebarOpen && (
                <button onClick={() => setSidebarOpen(true)} className="fixed right-4 top-1/2 -translate-y-1/2 rounded-xl px-2 py-4 transition-colors z-10 glass-surface" style={{ color: 'var(--text-1)', boxShadow: '0 10px 22px rgba(31, 27, 20, 0.14)' }} title="打开证据池">
                    <span className="text-xs font-bold" style={{ writingMode: 'vertical-rl' }}>证据池</span>
                </button>
            )}
        </div>
    );
}

export default ThinkingBoardPage;
