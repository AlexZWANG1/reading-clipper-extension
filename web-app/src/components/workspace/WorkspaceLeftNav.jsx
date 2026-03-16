// ========= WorkspaceLeftNav — Collapsible Left Navigation (Spec §3, §9) =========
// Shows Materials + Cards for current topic. Collapsed = icon-only.
// Material click → onOpenReader(materialId)
// Card click → onLocateCard(cardId)
// Management link → navigate to home

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FileText, BookOpen, Layers, ChevronLeft, ChevronRight, ChevronDown,
    Search, Settings, Home, ExternalLink, GripVertical,
    Crosshair, ListChecks, Plus, Upload, Link, X, Loader2, Quote,
} from 'lucide-react';
import { materialsApi } from '../../lib/api';
import { useCardsStore } from '../../lib/store';

const REGION_FLAGS = {
    us: '\u{1F1FA}\u{1F1F8}', cn: '\u{1F1E8}\u{1F1F3}', eu: '\u{1F1EA}\u{1F1FA}',
    jp: '\u{1F1EF}\u{1F1F5}', kr: '\u{1F1F0}\u{1F1F7}', uk: '\u{1F1EC}\u{1F1E7}',
};

function CardItem({ card, dragCardRef, onDragStart, onLocateCard, onOpenReader, onOpenReaderAtQuote }) {
    const [expanded, setExpanded] = useState(false);
    const regionFlag = card.source_region ? REGION_FLAGS[card.source_region] : null;
    const locator = (() => {
        const raw = card.locator;
        if (!raw) return null;
        if (typeof raw === 'object') return raw;
        if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return null; } }
        return null;
    })();
    const hasSnippet = !!card.raw_snippet && card.raw_snippet !== card.summary;

    return (
        <div
            draggable={!!dragCardRef}
            onDragStart={() => onDragStart?.(card)}
            className="rounded-lg transition-all group/card"
            style={{ background: 'var(--surface-0)', border: `1px solid ${expanded ? 'var(--stroke-0)' : 'transparent'}` }}
            onMouseEnter={e => { if (!expanded) e.currentTarget.style.borderColor = 'var(--stroke-0)'; }}
            onMouseLeave={e => { if (!expanded) e.currentTarget.style.borderColor = 'transparent'; }}
        >
            {/* Header — always visible, click to locate on board */}
            <div
                className="flex items-start gap-2 p-2.5 cursor-pointer"
                onClick={() => onLocateCard?.(card.id)}
            >
                {dragCardRef && (
                    <div className="shrink-0 pt-0.5 opacity-30 group-hover/card:opacity-70 transition-opacity" style={{ color: 'var(--text-2)' }}>
                        <GripVertical size={12} />
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    {/* Title row */}
                    <div className="flex items-center gap-1 mb-1">
                        {regionFlag && <span className="text-[10px]">{regionFlag}</span>}
                        <span
                            className="text-[8px] font-mono font-bold uppercase px-1 rounded-sm shrink-0"
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
                    {/* Summary — full text, not truncated */}
                    <div className="text-[11px] leading-relaxed mb-1.5" style={{ color: 'var(--text-1)' }}>
                        {card.summary || '(无内容)'}
                    </div>
                    {/* Action row */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
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
                                    className="flex items-center gap-1 text-[10px] truncate max-w-[120px] hover:underline transition-colors cursor-pointer"
                                    style={{ color: 'var(--accent-400)' }}
                                >
                                    <FileText size={9} className="shrink-0" />
                                    {card.source_name}
                                </button>
                            )}
                            {hasSnippet && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setExpanded(!expanded);
                                    }}
                                    className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded transition-colors cursor-pointer hover:bg-blue-500/10"
                                    style={{ color: 'var(--text-2)' }}
                                    aria-label={expanded ? '收起原文' : '展开原文'}
                                >
                                    <Quote size={9} />
                                    <span>{expanded ? '收起' : '原文'}</span>
                                    {expanded ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
                                </button>
                            )}
                        </div>
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
                                    className="p-1.5 rounded hover:bg-blue-500/10 transition-colors cursor-pointer"
                                    style={{ color: 'var(--text-2)' }}
                                    title="在阅读器中查看原文"
                                    aria-label="在阅读器中查看原文"
                                >
                                    <BookOpen size={11} />
                                </button>
                            )}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onLocateCard?.(card.id);
                                }}
                                className="p-1.5 rounded hover:bg-blue-500/10 transition-colors cursor-pointer"
                                style={{ color: 'var(--text-2)' }}
                                title="在论证板上定位"
                                aria-label="在论证板上定位"
                            >
                                <Crosshair size={11} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            {/* Expandable raw snippet */}
            {expanded && hasSnippet && (
                <div
                    className="px-3 pb-2.5 pt-0 animate-fade-in"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div
                        className="text-[10px] leading-relaxed p-2 rounded-md whitespace-pre-wrap"
                        style={{
                            background: 'var(--bg-0)',
                            border: '1px solid var(--stroke-1)',
                            color: 'var(--text-2)',
                            maxHeight: 200,
                            overflowY: 'auto',
                            borderLeft: '3px solid var(--accent-400)',
                        }}
                    >
                        {card.raw_snippet}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function WorkspaceLeftNav({
    topicId,
    topicTitle,
    expanded,
    onToggle,
    onOpenReader,
    onOpenReaderAtQuote,
    onLocateCard,
    dragCardRef,
}) {
    const navigate = useNavigate();
    const { cards, fetchCards } = useCardsStore();
    const [materials, setMaterials] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('materials'); // 'materials' | 'cards'
    const [showAddPanel, setShowAddPanel] = useState(false);
    const [addMode, setAddMode] = useState('url'); // 'url' | 'file'
    const [urlInput, setUrlInput] = useState('');
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const fileInputRef = useCallback(node => { if (node) node.value = ''; }, []);
    const hiddenFileRef = useRef(null);

    const refreshMaterials = useCallback(() => {
        if (!topicId) return;
        materialsApi.list({ topic_id: topicId }).then(data => {
            setMaterials(data.materials || data || []);
        }).catch(err => console.error('Failed to load materials:', err));
    }, [topicId]);

    // Fetch topic materials
    useEffect(() => {
        refreshMaterials();
    }, [refreshMaterials]);

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

    const handleAddUrl = useCallback(async () => {
        const url = urlInput.trim();
        if (!url || !topicId) return;
        setUploading(true);
        setUploadError(null);
        try {
            await materialsApi.ingest({ source_type: 'url', url, topic_id: topicId });
            setUrlInput('');
            setShowAddPanel(false);
            refreshMaterials();
        } catch (err) {
            setUploadError(err.message || '添加失败');
        } finally {
            setUploading(false);
        }
    }, [urlInput, topicId, refreshMaterials]);

    const handleFileUpload = useCallback(async (e) => {
        const files = e.target.files;
        if (!files?.length || !topicId) return;
        setUploading(true);
        setUploadError(null);
        try {
            for (const file of files) {
                await materialsApi.upload(file, topicId);
            }
            setShowAddPanel(false);
            refreshMaterials();
        } catch (err) {
            setUploadError(err.message || '上传失败');
        } finally {
            setUploading(false);
            if (hiddenFileRef.current) hiddenFileRef.current.value = '';
        }
    }, [topicId, refreshMaterials]);

    // Collapsed state — icon rail
    if (!expanded) {
        return (
            <div
                className="h-full flex flex-col items-center py-4 gap-3 shrink-0"
                style={{ width: 48, background: 'var(--surface-1)', borderRight: '1px solid var(--stroke-0)' }}
            >
                <button
                    onClick={onToggle}
                    className="p-2 rounded-lg transition-colors hover:bg-blue-500/10 cursor-pointer"
                    style={{ color: 'var(--text-2)' }}
                    title="展开导航"
                    aria-label="展开导航"
                >
                    <ChevronRight size={18} />
                </button>

                <div className="flex-1 flex flex-col items-center gap-2 mt-2">
                    <button
                        onClick={() => { onToggle(); setActiveTab('materials'); }}
                        className="p-2 rounded-lg transition-colors hover:bg-blue-500/10 cursor-pointer"
                        style={{ color: activeTab === 'materials' ? 'var(--accent-400)' : 'var(--text-2)' }}
                        title={`材料 (${materials.length})`}
                        aria-label={`材料 (${materials.length})`}
                    >
                        <FileText size={18} />
                    </button>
                    <button
                        onClick={() => { onToggle(); setActiveTab('cards'); }}
                        className="p-2 rounded-lg transition-colors hover:bg-blue-500/10 cursor-pointer"
                        style={{ color: activeTab === 'cards' ? 'var(--accent-400)' : 'var(--text-2)' }}
                        title={`卡片 (${topicCards.length})`}
                        aria-label={`卡片 (${topicCards.length})`}
                    >
                        <Layers size={18} />
                    </button>
                </div>

                <div className="flex flex-col items-center gap-2">
                    <button onClick={() => navigate('/')} className="p-2 rounded-lg transition-colors hover:bg-blue-500/10 cursor-pointer" style={{ color: 'var(--text-2)' }} title="研究主页" aria-label="研究主页">
                        <Home size={18} />
                    </button>
                    <button onClick={() => navigate('/tasks')} className="p-2 rounded-lg transition-colors hover:bg-blue-500/10 cursor-pointer" style={{ color: 'var(--text-2)' }} title="研究任务" aria-label="研究任务">
                        <ListChecks size={18} />
                    </button>
                    <button onClick={() => navigate('/settings')} className="p-2 rounded-lg transition-colors hover:bg-blue-500/10 cursor-pointer" style={{ color: 'var(--text-2)' }} title="设置" aria-label="设置">
                        <Settings size={18} />
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
                    className="p-1.5 rounded-lg transition-colors hover:bg-blue-500/10 shrink-0 cursor-pointer"
                    style={{ color: 'var(--text-2)' }}
                    title="收起导航"
                    aria-label="收起导航"
                >
                    <ChevronLeft size={16} />
                </button>
            </div>

            {/* Tab switcher + Add button */}
            <div className="flex items-center gap-1 px-3 pt-3 pb-2">
                <button
                    onClick={() => setActiveTab('materials')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer"
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
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                    style={{
                        background: activeTab === 'cards' ? 'rgba(13,110,253,0.10)' : 'transparent',
                        color: activeTab === 'cards' ? 'var(--accent-400)' : 'var(--text-2)',
                    }}
                >
                    <Layers size={13} />
                    卡片 ({topicCards.length})
                </button>
                <button
                    onClick={() => setShowAddPanel(!showAddPanel)}
                    className="shrink-0 p-1.5 rounded-lg transition-colors hover:bg-blue-500/10 cursor-pointer"
                    style={{ color: showAddPanel ? 'var(--accent-400)' : 'var(--text-2)' }}
                    title="添加来源"
                    aria-label={showAddPanel ? '关闭' : '添加来源'}
                >
                    {showAddPanel ? <X size={14} /> : <Plus size={14} />}
                </button>
            </div>

            {/* Add Source Panel */}
            {showAddPanel && (
                <div className="px-3 pb-2 space-y-2">
                    <div className="rounded-lg p-2.5" style={{ background: 'var(--bg-0)', border: '1px solid var(--stroke-0)' }}>
                        {/* Mode toggle */}
                        <div className="flex gap-1 mb-2">
                            <button
                                onClick={() => setAddMode('url')}
                                className="flex-1 flex items-center justify-center gap-1 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer"
                                style={{
                                    background: addMode === 'url' ? 'rgba(13,110,253,0.10)' : 'transparent',
                                    color: addMode === 'url' ? 'var(--accent-400)' : 'var(--text-2)',
                                }}
                            >
                                <Link size={11} /> URL
                            </button>
                            <button
                                onClick={() => setAddMode('file')}
                                className="flex-1 flex items-center justify-center gap-1 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer"
                                style={{
                                    background: addMode === 'file' ? 'rgba(13,110,253,0.10)' : 'transparent',
                                    color: addMode === 'file' ? 'var(--accent-400)' : 'var(--text-2)',
                                }}
                            >
                                <Upload size={11} /> 文件
                            </button>
                        </div>

                        {addMode === 'url' ? (
                            <div className="flex gap-1.5">
                                <input
                                    type="text"
                                    placeholder="粘贴 URL..."
                                    value={urlInput}
                                    onChange={e => setUrlInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAddUrl()}
                                    disabled={uploading}
                                    className="flex-1 px-2 py-1.5 text-xs rounded-md outline-none disabled:opacity-50"
                                    style={{ background: 'var(--surface-1)', border: '1px solid var(--stroke-0)', color: 'var(--text-0)' }}
                                />
                                <button
                                    onClick={handleAddUrl}
                                    disabled={uploading || !urlInput.trim()}
                                    className="shrink-0 px-2.5 py-1.5 text-xs font-medium rounded-md text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                                    style={{ background: 'var(--accent-500)' }}
                                >
                                    {uploading ? <Loader2 size={12} className="animate-spin" /> : '添加'}
                                </button>
                            </div>
                        ) : (
                            <div>
                                <input
                                    ref={hiddenFileRef}
                                    type="file"
                                    multiple
                                    accept=".pdf,.docx,.pptx,.txt,.md"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                />
                                <button
                                    onClick={() => hiddenFileRef.current?.click()}
                                    disabled={uploading}
                                    className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                    style={{ border: '2px dashed var(--stroke-0)', color: 'var(--text-2)' }}
                                >
                                    {uploading ? (
                                        <><Loader2 size={14} className="animate-spin" /> 上传中...</>
                                    ) : (
                                        <><Upload size={14} /> 点击选择文件 (PDF, DOCX, TXT)</>
                                    )}
                                </button>
                            </div>
                        )}

                        {uploadError && (
                            <div className="mt-1.5 text-[10px] px-2 py-1 rounded" style={{ background: 'rgba(195,58,48,0.08)', color: '#C33A30' }}>
                                {uploadError}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Search */}
            <div className="px-3 pb-2">
                <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-2)' }} />
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
                            className="w-full text-left p-2.5 rounded-lg transition-all hover:-translate-y-px group/item cursor-pointer"
                            style={{ background: 'var(--surface-0)', border: '1px solid transparent' }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--stroke-0)'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
                        >
                            <div className="flex items-start gap-2">
                                <FileText size={14} className="shrink-0 mt-0.5" style={{ color: m.status === 'failed' ? '#C33A30' : 'var(--accent-400)' }} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-medium truncate" style={{ color: 'var(--text-0)' }}>
                                            {m.title || '无标题'}
                                        </span>
                                        {(m.status === 'pending' || m.status === 'processing') && (
                                            <Loader2 size={10} className="animate-spin shrink-0" style={{ color: 'var(--accent-400)' }} />
                                        )}
                                        {m.status === 'failed' && (
                                            <span className="text-[9px] px-1 rounded" style={{ background: 'rgba(195,58,48,0.1)', color: '#C33A30' }}>失败</span>
                                        )}
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
                        <CardItem
                            key={card.id}
                            card={card}
                            dragCardRef={dragCardRef}
                            onDragStart={handleDragStart}
                            onLocateCard={onLocateCard}
                            onOpenReader={onOpenReader}
                            onOpenReaderAtQuote={onOpenReaderAtQuote}
                        />
                    ))
                )}

                {filteredItems.length === 0 && (
                    <div className="text-center text-xs py-6" style={{ color: 'var(--text-2)' }}>
                        {searchQuery ? '无搜索结果' : activeTab === 'materials' ? '暂无材料' : '暂无卡片'}
                    </div>
                )}
            </div>

            {/* Footer — management quick links */}
            <div className="px-3 py-2 flex items-center gap-2" style={{ borderTop: '1px solid var(--stroke-0)' }}>
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-1.5 text-xs py-1.5 px-2 rounded-lg transition-colors hover:bg-blue-500/10 cursor-pointer"
                    style={{ color: 'var(--text-2)' }}
                    title="研究主页"
                    aria-label="研究主页"
                >
                    <Home size={14} />
                </button>
                <button
                    onClick={() => navigate('/tasks')}
                    className="flex items-center gap-1.5 text-xs py-1.5 px-2 rounded-lg transition-colors hover:bg-blue-500/10 cursor-pointer"
                    style={{ color: 'var(--text-2)' }}
                    title="研究任务"
                    aria-label="研究任务"
                >
                    <ListChecks size={14} />
                </button>
                <button
                    onClick={() => navigate('/settings')}
                    className="flex items-center gap-1.5 text-xs py-1.5 px-2 rounded-lg transition-colors hover:bg-blue-500/10 cursor-pointer"
                    style={{ color: 'var(--text-2)' }}
                    title="设置"
                    aria-label="设置"
                >
                    <Settings size={14} />
                </button>
            </div>
        </div>
    );
}
