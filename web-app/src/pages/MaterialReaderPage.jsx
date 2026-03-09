import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ExternalLink, BookOpen, Search, Loader2,
  FileText, Globe, FileType, X, CheckCircle,
} from 'lucide-react';
import { materialsApi, highlightsApi, cardsApi, searchApi } from '../lib/api';
import { useTopicsStore } from '../lib/store';
import ReaderContent from '../components/Reader/ReaderContent';
import SelectionPopover from '../components/Reader/SelectionPopover';
import CardsSidebar from '../components/Reader/CardsSidebar';

export default function MaterialReaderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { topics, fetchTopics } = useTopicsStore();

  const [material, setMaterial] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 文本选择状态
  const [selection, setSelection] = useState(null);

  // Focus Lens
  const [focusQuery, setFocusQuery] = useState('');
  const [focusChunkIds, setFocusChunkIds] = useState([]);
  const [focusLoading, setFocusLoading] = useState(false);
  const [showFocusInput, setShowFocusInput] = useState(false);

  // 卡片侧边栏刷新信号
  const [cardRefresh, setCardRefresh] = useState(0);

  // 建卡弹窗
  const [creatingCard, setCreatingCard] = useState(false);
  const [pendingSelection, setPendingSelection] = useState(null);
  const [cardNote, setCardNote] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState(''); // 新增：选中的 Topic ID
  const [cardSuccess, setCardSuccess] = useState(false);
  const [cardHighlights, setCardHighlights] = useState([]);
  const [activeCardHighlightId, setActiveCardHighlightId] = useState(null);

  useEffect(() => {
    if (id) loadMaterial();
    fetchTopics(); // 加载 topics 列表
  }, [id, fetchTopics]);

  const loadMaterial = async () => {
    try {
      setLoading(true);
      const [materialData, chunksData, highlightsData] = await Promise.all([
        materialsApi.get(id),
        materialsApi.getChunks(id).catch(() => ({ chunks: [] })),
        highlightsApi.list(id).catch(() => ({ highlights: [] })),
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

  // 纯高亮（不建卡）
  const handleHighlight = useCallback(async (selectionData) => {
    if (!selectionData) return;
    try {
      const hl = await highlightsApi.create({
        material_id: id,
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
  }, [id]);

  const buildCardHighlightFromCard = useCallback((card, fallbackSelection = null) => {
    if (!card && !fallbackSelection) return [];

    const locator = (() => {
      const raw = card?.locator;
      if (!raw) return {};
      if (typeof raw === 'object') return raw;
      if (typeof raw === 'string') {
        try {
          return JSON.parse(raw);
        } catch {
          return {};
        }
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

  // 打开建卡弹窗
  const handleCreateCardClick = useCallback((selectionData) => {
    setPendingSelection(selectionData);
    setCardNote('');
    setCreatingCard(true);
    setSelection(null);
  }, []);

  // 确认建卡
  const handleConfirmCard = async () => {
    if (!pendingSelection) return;
    try {
      const captureResult = await cardsApi.capture({
        snippet: pendingSelection.exact,
        note: cardNote || undefined,
        topic_id: selectedTopicId || material?.topic_id || undefined, // 使用选中的 Topic ID
        material_id: id,
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

      const createdCard = captureResult?.card || null;
      if (createdCard) {
        const createdHighlights = buildCardHighlightFromCard(createdCard, pendingSelection);
        setCardHighlights(createdHighlights);
        setActiveCardHighlightId(createdHighlights[0]?.id || null);

        // 建卡成功后自动落一条高亮，保持 Reader 可见状态与 card 关联一致
        try {
          const createdHighlight = await highlightsApi.create({
            material_id: id,
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

  // Focus Lens 搜索
  const handleFocusSearch = async () => {
    if (!focusQuery.trim()) return;
    try {
      setFocusLoading(true);
      const response = await searchApi.semantic({
        query: focusQuery,
        material_id: id,
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

  const sourceTypeIcon = {
    url: Globe,
    file: FileType,
    text: FileText,
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-gray-500 text-sm">加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !material) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error || '材料不存在'}</p>
          <button
            onClick={() => navigate('/materials')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
          >
            返回材料库
          </button>
        </div>
      </div>
    );
  }

  const Icon = sourceTypeIcon[material.source_type] || FileText;

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* 顶部导航栏 */}
      <header className="flex items-center gap-4 px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <button
          onClick={() => navigate('/materials')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          材料库
        </button>

        <div className="w-px h-5 bg-gray-200" />

        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Icon className="w-4 h-4 text-indigo-600 flex-shrink-0" />
          <h1 className="text-sm font-medium text-gray-900 truncate">
            {material.title}
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Focus Lens 开关 */}
          {showFocusInput ? (
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="输入问题，高亮相关段落..."
                  value={focusQuery}
                  onChange={e => setFocusQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleFocusSearch()}
                  autoFocus
                  className="pl-8 pr-3 py-1.5 text-sm border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 w-64"
                />
              </div>
              <button
                onClick={handleFocusSearch}
                disabled={focusLoading || !focusQuery.trim()}
                className="px-3 py-1.5 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1"
              >
                {focusLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                聚焦
              </button>
              <button onClick={clearFocus} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowFocusInput(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              带着问题读
            </button>
          )}

          {material.url && (
            <a
              href={material.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              原文
            </a>
          )}
        </div>
      </header>

      {/* Focus Lens 结果提示条 */}
      {focusChunkIds.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-orange-50 border-b border-orange-200 text-sm text-orange-700 flex-shrink-0">
          <Search className="w-4 h-4 flex-shrink-0" />
          <span>已为「{focusQuery}」高亮 {focusChunkIds.length} 个相关段落</span>
          <button onClick={clearFocus} className="ml-auto text-orange-500 hover:text-orange-700 text-xs">
            清除聚焦
          </button>
        </div>
      )}

      {/* 主内容区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 阅读区 */}
        <div className="flex-1 overflow-y-auto px-6 py-6 relative">
          {material.ingestion_status !== 'completed' && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
              {material.ingestion_status === 'processing'
                ? '内容正在处理中，请稍后刷新...'
                : material.ingestion_status === 'failed'
                ? '内容处理失败。'
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

          {/* 文本选择浮窗 */}
          <SelectionPopover
            selection={selection}
            onHighlight={handleHighlight}
            onCreateCard={handleCreateCardClick}
            onClose={() => setSelection(null)}
          />
        </div>

        {/* 右侧卡片侧边栏 */}
        <div className="w-72 border-l border-gray-200 flex-shrink-0 overflow-hidden">
          <CardsSidebar
            materialId={id}
            refreshSignal={cardRefresh}
            onCardClick={(card) => {
              const targets = buildCardHighlightFromCard(card);
              setCardHighlights(targets);
              setActiveCardHighlightId(targets[0]?.id || null);
            }}
          />
        </div>
      </div>

      {/* 建卡弹窗 */}
      {creatingCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            {cardSuccess ? (
              <div className="flex flex-col items-center py-4 gap-3">
                <CheckCircle className="w-12 h-12 text-green-500" />
                <p className="text-lg font-medium text-gray-800">卡片已创建</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-gray-900">创建证据卡</h3>
                  <button onClick={() => setCreatingCard(false)} className="p-1 hover:bg-gray-100 rounded">
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-amber-900 leading-relaxed line-clamp-4">
                    "{pendingSelection?.exact}"
                  </p>
                </div>

                {/* Topic 选择器 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    归属研究议题
                  </label>
                  <select
                    value={selectedTopicId}
                    onChange={e => setSelectedTopicId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    <option value="">选择 Topic...</option>
                    {topics.map(topic => (
                      <option key={topic.id} value={topic.id}>
                        {topic.title}
                      </option>
                    ))}
                  </select>
                  {material?.topic_id && !selectedTopicId && (
                    <p className="text-xs text-gray-500 mt-1">
                      默认使用来源的 Topic
                    </p>
                  )}
                </div>

                <textarea
                  placeholder="添加备注（可选）..."
                  value={cardNote}
                  onChange={e => setCardNote(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-4"
                />

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setCreatingCard(false)}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleConfirmCard}
                    className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
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

