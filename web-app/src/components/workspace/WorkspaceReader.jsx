// ========= WorkspaceReader — Embeddable Material Reader (Spec §9) =========
// Extracted from MaterialReaderPage. Contains all reader logic:
// material loading, chunks, highlights, focus lens, card creation,
// selection popover, evidence suggestion, AI panel.
// Supports two modes:
//   - Embedded (isEmbedded=true): no h-screen, relative modals, close button
//   - Standalone (default): full-screen page with back button to /materials

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ArrowLeft, ExternalLink, BookOpen, Search, Loader2,
    FileText, Globe, FileType, X, CheckCircle, Sparkles,
} from 'lucide-react';
import { materialsApi, highlightsApi, cardsApi, searchApi } from '../../lib/api';
import { useTopicsStore, useWorkspaceStore } from '../../lib/store';
import ReaderContent from '../Reader/ReaderContent';
import SelectionPopover from '../Reader/SelectionPopover';
import CardsSidebar from '../Reader/CardsSidebar';
import AIPanel from '../Reader/AIPanel';
import EvidenceSuggestionToast from '../EvidenceSuggestionToast';

const sourceTypeIcon = {
    url: Globe,
    file: FileType,
    text: FileText,
};

export default function WorkspaceReader({
    materialId,
    onClose,
    onCardCreated,
    isEmbedded = false,
}) {
    const { topics, fetchTopics } = useTopicsStore();

    const [material, setMaterial] = useState(null);
    const [chunks, setChunks] = useState([]);
    const [highlights, setHighlights] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Text selection
    const [selection, setSelection] = useState(null);

    // Focus Lens
    const [focusQuery, setFocusQuery] = useState('');
    const [focusChunkIds, setFocusChunkIds] = useState([]);
    const [focusLoading, setFocusLoading] = useState(false);
    const [showFocusInput, setShowFocusInput] = useState(false);

    // Card sidebar refresh
    const [cardRefresh, setCardRefresh] = useState(0);

    // Card creation modal
    const [creatingCard, setCreatingCard] = useState(false);
    const [pendingSelection, setPendingSelection] = useState(null);
    const [cardNote, setCardNote] = useState('');
    const [selectedTopicId, setSelectedTopicId] = useState('');
    const [cardSuccess, setCardSuccess] = useState(false);
    const [cardHighlights, setCardHighlights] = useState([]);
    const [activeCardHighlightId, setActiveCardHighlightId] = useState(null);
    const [showAIPanel, setShowAIPanel] = useState(false);

    // Evidence suggestion toast
    const [evidenceSuggestion, setEvidenceSuggestion] = useState(null);
    const [lastSavedCardId, setLastSavedCardId] = useState(null);

    const selectedTopicTitle = topics.find(t => t.id === (selectedTopicId || material?.topic_id))?.title || '';

    useEffect(() => {
        if (materialId) loadMaterial();
        fetchTopics();
    }, [materialId, fetchTopics]);

    const loadMaterial = async () => {
        try {
            setLoading(true);
            const [materialData, chunksData, highlightsData] = await Promise.all([
                materialsApi.get(materialId),
                materialsApi.getChunks(materialId).catch(() => ({ chunks: [] })),
                highlightsApi.list(materialId).catch(() => ({ highlights: [] })),
            ]);

            setMaterial(materialData);
            setChunks(chunksData.chunks || []);
            setHighlights(highlightsData.highlights || []);
        } catch (err) {
            console.error('Failed to load material:', err);
            setError('加载失败，请返回重试');
        } finally {
            setLoading(false);
        }
    };

    // Scroll-to-quote when scrollLocator changes (Spec §1.3)
    const readerScrollLocator = useWorkspaceStore(s => s.readerScrollLocator);
    const clearReaderScrollLocator = useWorkspaceStore(s => s.clearReaderScrollLocator);

    useEffect(() => {
        if (!readerScrollLocator || !material) return;
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
        clearReaderScrollLocator();
    }, [readerScrollLocator, material, clearReaderScrollLocator]);

    const handleHighlight = useCallback(async (selectionData) => {
        if (!selectionData) return;
        try {
            const hl = await highlightsApi.create({
                material_id: materialId,
                exact: selectionData.exact,
                prefix: selectionData.prefix,
                suffix: selectionData.suffix,
                chunk_id: selectionData.chunk_id,
                chunk_relative_start: selectionData.chunk_relative_start,
                chunk_relative_end: selectionData.chunk_relative_end,
                color: 'yellow',
            });
            setHighlights(prev => [...prev, hl]);
            setSelection(null);
        } catch (err) {
            console.error('Highlight failed:', err);
        }
    }, [materialId]);

    const buildCardHighlightFromCard = useCallback((card, fallbackSelection = null) => {
        if (!card && !fallbackSelection) return [];

        const locator = (() => {
            const raw = card?.locator;
            if (!raw) return {};
            if (typeof raw === 'object') return raw;
            if (typeof raw === 'string') {
                try { return JSON.parse(raw); } catch { return {}; }
            }
            return {};
        })();
        const quoteSelector = locator?.quote_selector || {};
        const exact =
            quoteSelector.exact ||
            card?.raw_snippet ||
            fallbackSelection?.exact ||
            '';

        if (!exact || !exact.trim()) return [];

        return [{
            id: card?.id ? `card-${card.id}` : `selection-highlight`,
            exact: exact.trim(),
            prefix: quoteSelector.prefix || fallbackSelection?.prefix || '',
            suffix: quoteSelector.suffix || fallbackSelection?.suffix || '',
            chunk_id: locator?.chunk_id || card?.chunk_id || fallbackSelection?.chunk_id || null,
            color: 'indigo',
        }];
    }, []);

    const handleCreateCardClick = useCallback((selectionData) => {
        setPendingSelection(selectionData);
        setCardNote('');
        setCreatingCard(true);
        setSelection(null);
    }, []);

    const handleConfirmCard = async () => {
        if (!pendingSelection) return;
        try {
            const captureResult = await cardsApi.capture({
                snippet: pendingSelection.exact,
                note: cardNote || undefined,
                topic_id: selectedTopicId || material?.topic_id || undefined,
                material_id: materialId,
                sourceName: material?.site_name || material?.title || undefined,
                sourceUrl: material?.url || undefined,
                locator: {
                    chunk_id: pendingSelection.chunk_id,
                    chunk_relative_start: pendingSelection.chunk_relative_start,
                    chunk_relative_end: pendingSelection.chunk_relative_end,
                    quote_selector: {
                        exact: pendingSelection.exact,
                        prefix: pendingSelection.prefix,
                        suffix: pendingSelection.suffix,
                    },
                },
            });

            if (captureResult.evidence_suggestion) {
                setEvidenceSuggestion(captureResult.evidence_suggestion);
                setLastSavedCardId(captureResult.card?.id);
            }

            const createdCard = captureResult?.card || null;
            if (createdCard) {
                const createdHighlights = buildCardHighlightFromCard(createdCard, pendingSelection);
                setCardHighlights(createdHighlights);
                setActiveCardHighlightId(createdHighlights[0]?.id || null);

                try {
                    const createdHighlight = await highlightsApi.create({
                        material_id: materialId,
                        card_id: createdCard.id,
                        exact: pendingSelection.exact,
                        prefix: pendingSelection.prefix,
                        suffix: pendingSelection.suffix,
                        chunk_id: pendingSelection.chunk_id,
                        chunk_relative_start: pendingSelection.chunk_relative_start,
                        chunk_relative_end: pendingSelection.chunk_relative_end,
                        color: 'yellow',
                    });
                    if (createdHighlight) {
                        setHighlights(prev => [...prev, createdHighlight]);
                    }
                } catch (highlightErr) {
                    console.warn('Create linked highlight failed:', highlightErr);
                }

                onCardCreated?.(createdCard);
            }

            setCardSuccess(true);
            setCardRefresh(n => n + 1);
            setTimeout(() => {
                setCreatingCard(false);
                setCardSuccess(false);
                setPendingSelection(null);
            }, 1200);
        } catch (err) {
            console.error('Create card failed:', err);
            alert('建卡失败，请重试');
        }
    };

    // Focus Lens
    const handleFocusSearch = async () => {
        if (!focusQuery.trim()) return;
        try {
            setFocusLoading(true);
            const response = await searchApi.semantic({
                query: focusQuery,
                material_id: materialId,
                limit: 5,
                min_score: 0.35,
            });
            const chunkIds = (response.results || []).map(r => r.id);
            setFocusChunkIds(chunkIds);
        } catch (err) {
            console.error('Focus search failed:', err);
        } finally {
            setFocusLoading(false);
        }
    };

    const clearFocus = () => {
        setFocusChunkIds([]);
        setFocusQuery('');
        setShowFocusInput(false);
    };

    // Loading state
    if (loading) {
        return (
            <div className={`flex items-center justify-center ${isEmbedded ? 'h-full' : 'h-screen'}`} style={{ background: 'var(--bg-0)' }}>
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-400)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-2)' }}>加载中...</p>
                </div>
            </div>
        );
    }

    if (error || !material) {
        return (
            <div className={`flex items-center justify-center ${isEmbedded ? 'h-full' : 'h-screen'}`} style={{ background: 'var(--bg-0)' }}>
                <div className="text-center">
                    <p className="text-red-500 mb-4">{error || '材料不存在'}</p>
                    {isEmbedded ? (
                        <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg" style={{ background: 'var(--accent-500)', color: '#fff' }}>
                            关闭
                        </button>
                    ) : (
                        <button onClick={onClose} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
                            返回材料库
                        </button>
                    )}
                </div>
            </div>
        );
    }

    const Icon = sourceTypeIcon[material.source_type] || FileText;

    return (
        <div className={`flex flex-col ${isEmbedded ? 'h-full' : 'h-screen'}`} style={{ background: isEmbedded ? 'var(--surface-0)' : 'white' }}>
            {/* Header */}
            <header className="flex items-center gap-4 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--stroke-0)' }}>
                {isEmbedded ? (
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg transition-colors hover:bg-blue-500/10"
                        style={{ color: 'var(--text-2)' }}
                        title="关闭阅读器"
                    >
                        <X className="w-4 h-4" />
                    </button>
                ) : (
                    <button
                        onClick={onClose}
                        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        材料库
                    </button>
                )}

                <div className="w-px h-5" style={{ background: 'var(--stroke-0)' }} />

                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Icon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-400)' }} />
                    <h1 className="text-sm font-medium truncate" style={{ color: 'var(--text-0)' }}>
                        {material.title}
                    </h1>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    {chunks.length === 0 ? null : showFocusInput ? (
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-2)' }} />
                                <input
                                    type="text"
                                    placeholder="输入问题，高亮相关段落..."
                                    value={focusQuery}
                                    onChange={e => setFocusQuery(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleFocusSearch()}
                                    autoFocus
                                    className="pl-8 pr-3 py-1.5 text-sm rounded-lg focus:outline-none focus:ring-2 w-64"
                                    style={{ border: '1px solid var(--stroke-1)', background: 'var(--bg-0)', color: 'var(--text-0)' }}
                                />
                            </div>
                            <button
                                onClick={handleFocusSearch}
                                disabled={focusLoading || !focusQuery.trim()}
                                className="px-3 py-1.5 text-sm rounded-lg disabled:opacity-50 flex items-center gap-1"
                                style={{ background: 'var(--accent-500)', color: '#fff' }}
                            >
                                {focusLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                聚焦
                            </button>
                            <button onClick={clearFocus} className="p-1.5 rounded-lg" style={{ color: 'var(--text-2)' }}>
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowFocusInput(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors"
                            style={{ color: 'var(--accent-400)', border: '1px solid var(--stroke-0)' }}
                        >
                            <Search className="w-3.5 h-3.5" />
                            带着问题读
                        </button>
                    )}

                    <button
                        onClick={() => setShowAIPanel(!showAIPanel)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors"
                        style={{
                            color: showAIPanel ? 'var(--accent-400)' : 'var(--text-2)',
                            border: `1px solid ${showAIPanel ? 'var(--accent-400)' : 'var(--stroke-0)'}`,
                            background: showAIPanel ? 'rgba(13,110,253,0.08)' : 'transparent',
                        }}
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        AI
                    </button>

                    {material.url && (
                        <a
                            href={material.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors"
                            style={{ color: 'var(--text-2)', border: '1px solid var(--stroke-0)' }}
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            原文
                        </a>
                    )}
                </div>
            </header>

            {/* Focus Lens result bar */}
            {focusChunkIds.length > 0 && (
                <div className="flex items-center gap-3 px-4 py-2 text-sm flex-shrink-0" style={{ background: 'rgba(249,115,22,0.08)', borderBottom: '1px solid var(--stroke-0)', color: 'var(--accent-400)' }}>
                    <Search className="w-4 h-4 flex-shrink-0" />
                    <span>已为「{focusQuery}」高亮 {focusChunkIds.length} 个相关段落</span>
                    <button onClick={clearFocus} className="ml-auto text-xs" style={{ color: 'var(--accent-400)' }}>
                        清除聚焦
                    </button>
                </div>
            )}

            {/* Main content */}
            <div className="flex flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto px-6 py-6 relative">
                    {material.ingestion_status !== 'completed' && (
                        <div className={`mb-4 p-3 rounded-lg text-sm ${
                            material.ingestion_status === 'failed'
                                ? 'bg-amber-50 border border-amber-200 text-amber-700'
                                : 'bg-yellow-50 border border-yellow-200 text-yellow-700'
                        }`}>
                            {material.ingestion_status === 'processing'
                                ? '内容正在处理中，请稍后刷新...'
                                : material.ingestion_status === 'failed'
                                ? (material.article_html || material.text_content
                                    ? '语义搜索暂不可用，但文章内容已就绪，可正常阅读。'
                                    : '内容提取失败，请尝试重新导入。')
                                : '内容即将开始处理...'}
                        </div>
                    )}

                    <ReaderContent
                        material={material}
                        chunks={chunks}
                        highlights={highlights}
                        cardHighlights={cardHighlights}
                        activeCardHighlightId={activeCardHighlightId}
                        focusChunkIds={focusChunkIds}
                        onSelection={setSelection}
                    />

                    <SelectionPopover
                        selection={selection}
                        onHighlight={handleHighlight}
                        onCreateCard={handleCreateCardClick}
                        onClose={() => setSelection(null)}
                    />
                </div>

                {/* Right sidebar */}
                <div className="w-72 flex-shrink-0 overflow-hidden" style={{ borderLeft: '1px solid var(--stroke-0)' }}>
                    {showAIPanel ? (
                        <AIPanel
                            materialId={materialId}
                            onHighlightQuote={(quoteText) => {
                                if (!quoteText) return;
                                const hlId = `ai-quote-${Date.now()}`;
                                setCardHighlights([{
                                    id: hlId,
                                    exact: quoteText,
                                    prefix: '',
                                    suffix: '',
                                    chunk_id: null,
                                    color: 'indigo',
                                }]);
                                setActiveCardHighlightId(hlId);
                            }}
                        />
                    ) : (
                        <CardsSidebar
                            materialId={materialId}
                            refreshSignal={cardRefresh}
                            onCardClick={(card) => {
                                const targets = buildCardHighlightFromCard(card);
                                setCardHighlights(targets);
                                setActiveCardHighlightId(targets[0]?.id || null);
                            }}
                        />
                    )}
                </div>
            </div>

            {/* Evidence Suggestion Toast */}
            {evidenceSuggestion && lastSavedCardId && (
                <EvidenceSuggestionToast
                    suggestion={evidenceSuggestion}
                    cardId={lastSavedCardId}
                    topicTitle={selectedTopicTitle}
                    onDismiss={() => {
                        setEvidenceSuggestion(null);
                        setLastSavedCardId(null);
                    }}
                />
            )}

            {/* Card creation modal */}
            {creatingCard && (
                <div className={`${isEmbedded ? 'absolute' : 'fixed'} inset-0 z-50 flex items-center justify-center bg-black/40`}>
                    <div className="rounded-xl shadow-2xl w-full max-w-md mx-4 p-6" style={{ background: 'var(--surface-0)' }}>
                        {cardSuccess ? (
                            <div className="flex flex-col items-center py-4 gap-3">
                                <CheckCircle className="w-12 h-12 text-green-500" />
                                <p className="text-lg font-medium" style={{ color: 'var(--text-0)' }}>卡片已创建</p>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-base font-semibold" style={{ color: 'var(--text-0)' }}>创建证据卡</h3>
                                    <button onClick={() => setCreatingCard(false)} className="p-1 rounded" style={{ color: 'var(--text-2)' }}>
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="rounded-lg p-3 mb-4" style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid var(--stroke-0)' }}>
                                    <p className="text-sm leading-relaxed line-clamp-4" style={{ color: 'var(--text-0)' }}>
                                        &ldquo;{pendingSelection?.exact}&rdquo;
                                    </p>
                                </div>

                                <div className="mb-4">
                                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-1)' }}>
                                        归属研究议题
                                    </label>
                                    <select
                                        value={selectedTopicId}
                                        onChange={e => setSelectedTopicId(e.target.value)}
                                        className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none"
                                        style={{ border: '1px solid var(--stroke-0)', background: 'var(--bg-0)', color: 'var(--text-0)' }}
                                    >
                                        <option value="">选择 Topic...</option>
                                        {topics.map(topic => (
                                            <option key={topic.id} value={topic.id}>
                                                {topic.title}
                                            </option>
                                        ))}
                                    </select>
                                    {material?.topic_id && !selectedTopicId && (
                                        <p className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>
                                            默认使用来源的 Topic
                                        </p>
                                    )}
                                </div>

                                <textarea
                                    placeholder="添加备注（可选）..."
                                    value={cardNote}
                                    onChange={e => setCardNote(e.target.value)}
                                    rows={3}
                                    className="w-full px-3 py-2 text-sm resize-none rounded-lg focus:outline-none mb-4"
                                    style={{ border: '1px solid var(--stroke-0)', background: 'var(--bg-0)', color: 'var(--text-0)' }}
                                />

                                <div className="flex justify-end gap-3">
                                    <button
                                        onClick={() => setCreatingCard(false)}
                                        className="px-4 py-2 text-sm rounded-lg"
                                        style={{ color: 'var(--text-1)' }}
                                    >
                                        取消
                                    </button>
                                    <button
                                        onClick={handleConfirmCard}
                                        className="px-4 py-2 text-sm rounded-lg"
                                        style={{ background: 'var(--accent-500)', color: '#fff' }}
                                    >
                                        保存卡片
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
