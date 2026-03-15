// ========= WorkspaceLeftNav — Collapsible Left Navigation (Spec §3, §9) =========
// Shows Materials + Cards for current topic. Collapsed = icon-only.
// Material click → onOpenReader(materialId)
// Card click → onLocateCard(cardId)
// Management link → navigate to home

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FileText, BookOpen, Layers, ChevronLeft, ChevronRight,
    Search, Settings, Home, ExternalLink, GripVertical,
} from 'lucide-react';
import { materialsApi } from '../../lib/api';
import { useCardsStore } from '../../lib/store';

export default function WorkspaceLeftNav({
    topicId,
    topicTitle,
    expanded,
    onToggle,
    onOpenReader,
    onLocateCard,
    dragCardRef,
}) {
    const navigate = useNavigate();
    const { cards, fetchCards } = useCardsStore();
    const [materials, setMaterials] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('materials'); // 'materials' | 'cards'

    // Fetch topic materials
    useEffect(() => {
        if (!topicId) return;
        materialsApi.list({ topic_id: topicId }).then(data => {
            setMaterials(data.materials || data || []);
        }).catch(err => console.error('Failed to load materials:', err));
    }, [topicId]);

    // Fetch topic cards
    useEffect(() => {
        if (!topicId) return;
        fetchCards({ topic_id: topicId });
    }, [topicId, fetchCards]);

    const topicCards = useMemo(() => {
        return (cards || []).filter(c => c.topic_id === topicId);
    }, [cards, topicId]);

    const filteredItems = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (activeTab === 'materials') {
            if (!q) return materials;
            return materials.filter(m =>
                (m.title || '').toLowerCase().includes(q) ||
                (m.site_name || '').toLowerCase().includes(q)
            );
        } else {
            if (!q) return topicCards;
            return topicCards.filter(c =>
                (c.title || '').toLowerCase().includes(q) ||
                (c.summary || '').toLowerCase().includes(q) ||
                (c.raw_snippet || '').toLowerCase().includes(q)
            );
        }
    }, [activeTab, materials, topicCards, searchQuery]);

    const handleDragStart = useCallback((card) => {
        if (dragCardRef) dragCardRef.current = card;
    }, [dragCardRef]);

    // Collapsed state — icon rail
    if (!expanded) {
        return (
            <div
                className="h-full flex flex-col items-center py-4 gap-3 shrink-0"
                style={{ width: 48, background: 'var(--surface-1)', borderRight: '1px solid var(--stroke-0)' }}
            >
                <button
                    onClick={onToggle}
                    className="p-2 rounded-lg transition-colors hover:bg-blue-500/10"
                    style={{ color: 'var(--text-2)' }}
                    title="展开导航"
                >
                    <ChevronRight size={18} />
                </button>

                <div className="flex-1 flex flex-col items-center gap-2 mt-2">
                    <button
                        onClick={() => { onToggle(); setActiveTab('materials'); }}
                        className="p-2 rounded-lg transition-colors hover:bg-blue-500/10"
                        style={{ color: activeTab === 'materials' ? 'var(--accent-400)' : 'var(--text-2)' }}
                        title={`材料 (${materials.length})`}
                    >
                        <FileText size={18} />
                    </button>
                    <button
                        onClick={() => { onToggle(); setActiveTab('cards'); }}
                        className="p-2 rounded-lg transition-colors hover:bg-blue-500/10"
                        style={{ color: activeTab === 'cards' ? 'var(--accent-400)' : 'var(--text-2)' }}
                        title={`卡片 (${topicCards.length})`}
                    >
                        <Layers size={18} />
                    </button>
                </div>

                <div className="flex flex-col items-center gap-2">
                    <button
                        onClick={() => navigate('/')}
                        className="p-2 rounded-lg transition-colors hover:bg-blue-500/10"
                        style={{ color: 'var(--text-2)' }}
                        title="返回首页"
                    >
                        <Home size={18} />
                    </button>
                </div>
            </div>
        );
    }

    // Expanded state
    return (
        <div
            className="h-full flex flex-col shrink-0"
            style={{ width: 260, background: 'var(--surface-1)', borderRight: '1px solid var(--stroke-0)' }}
        >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-3" style={{ borderBottom: '1px solid var(--stroke-0)' }}>
                <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-bold truncate" style={{ color: 'var(--text-0)' }}>
                        {topicTitle || 'Workspace'}
                    </h2>
                </div>
                <button
                    onClick={onToggle}
                    className="p-1.5 rounded-lg transition-colors hover:bg-blue-500/10 shrink-0"
                    style={{ color: 'var(--text-2)' }}
                    title="收起导航"
                >
                    <ChevronLeft size={16} />
                </button>
            </div>

            {/* Tab switcher */}
            <div className="flex gap-1 px-3 pt-3 pb-2">
                <button
                    onClick={() => setActiveTab('materials')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-lg transition-colors"
                    style={{
                        background: activeTab === 'materials' ? 'rgba(13,110,253,0.10)' : 'transparent',
                        color: activeTab === 'materials' ? 'var(--accent-400)' : 'var(--text-2)',
                    }}
                >
                    <FileText size={13} />
                    材料 ({materials.length})
                </button>
                <button
                    onClick={() => setActiveTab('cards')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-lg transition-colors"
                    style={{
                        background: activeTab === 'cards' ? 'rgba(13,110,253,0.10)' : 'transparent',
                        color: activeTab === 'cards' ? 'var(--accent-400)' : 'var(--text-2)',
                    }}
                >
                    <Layers size={13} />
                    卡片 ({topicCards.length})
                </button>
            </div>

            {/* Search */}
            <div className="px-3 pb-2">
                <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-2)' }} />
                    <input
                        type="text"
                        placeholder={activeTab === 'materials' ? '搜索材料...' : '搜索卡片...'}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg outline-none"
                        style={{ background: 'var(--bg-0)', border: '1px solid var(--stroke-0)', color: 'var(--text-0)' }}
                    />
                </div>
            </div>

            {/* Item list */}
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
                {activeTab === 'materials' ? (
                    filteredItems.map(m => (
                        <button
                            key={m.id}
                            onClick={() => onOpenReader?.(m.id)}
                            className="w-full text-left p-2.5 rounded-lg transition-all hover:-translate-y-px group/item"
                            style={{ background: 'var(--surface-0)', border: '1px solid transparent' }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--stroke-0)'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
                        >
                            <div className="flex items-start gap-2">
                                <FileText size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--accent-400)' }} />
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium truncate" style={{ color: 'var(--text-0)' }}>
                                        {m.title || '无标题'}
                                    </div>
                                    {m.site_name && (
                                        <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-2)' }}>
                                            {m.site_name}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </button>
                    ))
                ) : (
                    filteredItems.map(card => (
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
                                    <div className="flex items-center gap-1 mb-0.5">
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
                                    <div className="text-[10px] line-clamp-2" style={{ color: 'var(--text-2)', lineHeight: '1.5' }}>
                                        {card.summary || '(无内容)'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}

                {filteredItems.length === 0 && (
                    <div className="text-center text-xs py-6" style={{ color: 'var(--text-2)' }}>
                        {searchQuery ? '无搜索结果' : activeTab === 'materials' ? '暂无材料' : '暂无卡片'}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="px-3 py-2 flex items-center gap-2" style={{ borderTop: '1px solid var(--stroke-0)' }}>
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-1.5 text-xs py-1.5 px-2 rounded-lg transition-colors hover:bg-blue-500/10"
                    style={{ color: 'var(--text-2)' }}
                >
                    <Home size={14} />
                    返回首页
                </button>
            </div>
        </div>
    );
}
