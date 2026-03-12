import { useEffect, useState, useMemo, lazy, Suspense, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Search,
  Filter,
  MoreVertical,
  Trash2,
  Edit3,
  ExternalLink,
  ArrowRight,
  Plus,
  Clock,
  Tag,
  X,
  ChevronDown,
  CheckSquare,
  Square,
  LayoutGrid,
  FileText,
  Network,
  Save,
  Loader2,
} from 'lucide-react';
import { useCardsStore, useTopicsStore, useSourcesStore, useUIStore } from '../lib/store';
import { documentsApi } from '../lib/api';
import { getTopicColor, buildHighlightUrl, getSourceDisplayName } from '../lib/ui-utils';
import AddCardSection from '../components/AddCardSection';
import HypothesisSection from '../components/HypothesisSection';
import TopicsSidebar from '../components/TopicsSidebar';
import CanvasPlaceholder from '../components/CanvasPlaceholder';
const EmbeddedThinkBoard = lazy(() => import('../components/EmbeddedThinkBoard'));

const REGION_FLAGS = {
  'us': '🇺🇸',
  'cn': '🇨🇳',
  'eu': '🇪🇺',
  'jp': '🇯🇵',
  'kr': '🇰🇷',
  'uk': '🇬🇧',
};

function EditCardModal({ card, onClose, onSave }) {
  const [topicTitle, setTopicTitle] = useState(card.topic_title || '');
  const [note, setNote] = useState(card.note || '');
  const [isSaving, setIsSaving] = useState(false);
  const { topics } = useTopicsStore();

  const handleSave = async () => {
    setIsSaving(true);
    await onSave(card.id, { topic_title: topicTitle, note });
    setIsSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="card w-full max-w-md p-6 m-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>编辑卡片</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Topic (主题)</label>
            <input
              list="topics-list"
              id="edit-card-topic"
              name="edit_card_topic"
              aria-label="Edit card topic"
              type="text"
              value={topicTitle}
              onChange={(e) => setTopicTitle(e.target.value)}
              className="input w-full"
              placeholder="输入或选择主题..."
            />
            <datalist id="topics-list">
              {topics.map(t => <option key={t.id} value={t.title} />)}
            </datalist>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Note (批注)</label>
            <textarea
              id="edit-card-note"
              name="edit_card_note"
              aria-label="Edit card note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows="4"
              className="input w-full"
              placeholder="添加你的想法..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="btn btn-secondary"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn btn-primary"
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CardItem({ card, onEdit, onDelete, isSelected, onToggleSelect, cardRef }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [snippetOpen, setSnippetOpen] = useState(false);

  const sourceName = getSourceDisplayName(card);

  const formattedDate = new Date(card.created_at).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });

  const cardTitle = card.title || "暂未命名";
  const factOrView = card.fact_or_view === 'view' ? 'VIEW' : 'FACT';
  const badgeClass = factOrView === 'VIEW' ? 'badge badge-view' : 'badge badge-fact';

  return (
    <div
      ref={cardRef}
      className={`card card-hover group flex flex-col transition-all duration-200`}
      style={{
        border: isSelected ? '1px solid var(--interactive-primary)' : '1px solid var(--border-primary)',
        boxShadow: isSelected ? '0 0 0 2px rgba(10,10,10,0.04)' : '0 1px 2px rgba(0,0,0,0.05)',
      }}
    >
      {/* 顶部：Topic 标签和日期 */}
      {card.topic_title && (
        <div className="flex items-center justify-between mb-4 pb-3" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
            style={{
              background: getTopicColor(card.topic_title).bg,
              color: getTopicColor(card.topic_title).text,
              border: `1px solid ${getTopicColor(card.topic_title).border}`,
            }}
          >
            <Tag className="w-3.5 h-3.5" />
            {card.topic_title}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {formattedDate}
          </span>
        </div>
      )}

      {/* Top action bar: Edit, Delete, Select */}
      <div className="flex items-start justify-between mb-2">
        <div>
          {onToggleSelect && (
            <button
              onClick={() => onToggleSelect(card.id)}
              className="p-1 rounded transition-colors -ml-1"
              aria-label={isSelected ? 'Deselect card' : 'Select card'}
              style={{ color: isSelected ? 'var(--interactive-primary)' : 'var(--text-tertiary)' }}
              title={isSelected ? '取消选择' : '选择此卡片'}
            >
              {isSelected ? (
                <CheckSquare className="w-5 h-5" />
              ) : (
                <Square className="w-5 h-5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 rounded-lg opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
            aria-label="Open card actions"
            title="Open card actions"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="card absolute right-0 top-full mt-1 py-1 z-20 min-w-[120px]">
                <button
                  onClick={() => {
                    onEdit(card);
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors hover:bg-[var(--bg-muted)]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Edit3 className="w-4 h-4" />
                  编辑
                </button>
                <button
                  onClick={() => {
                    onDelete(card.id);
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors hover:bg-[var(--bg-muted)]"
                  style={{ color: '#FB7185' }}
                >
                  <Trash2 className="w-4 h-4" />
                  删除
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Content: Title & Summary */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          <span className={badgeClass}>
            {factOrView}
          </span>
          <h4 className="text-lg font-semibold leading-snug line-clamp-2" style={{ color: 'var(--text-primary)' }}>
            {cardTitle}
          </h4>
        </div>
        <h3
          className="font-normal text-base leading-7"
          style={{ color: 'var(--text-secondary)' }}
        >
          {card.summary}
        </h3>
      </div>

      {/* Key points */}
      {card.key_points?.length > 0 && (
        <ul className="text-base space-y-3 mb-6 pl-1" style={{ color: 'var(--text-secondary)' }}>
          {card.key_points.map((point, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-2.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--text-primary)' }} />
              <span className="opacity-90 leading-relaxed">{point}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Collapsible snippet */}
      <div className="mb-5 font-sans">
        <button
          onClick={() => setSnippetOpen(!snippetOpen)}
          className="flex items-center gap-1.5 font-medium transition-colors select-none text-sm hover:underline"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${snippetOpen ? 'rotate-180' : ''}`} />
          {snippetOpen ? '收起原文片段' : '查看原文片段'}
        </button>
        {snippetOpen && (
          <div
            className="mt-3 p-4 rounded text-sm leading-relaxed whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto"
            style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)', border: '1px solid var(--border-secondary)' }}
          >
            {card.raw_snippet || "（无原文内容）"}
            {card.image_url && (
              <div className="mt-3">
                <img src={card.image_url} alt="Card Image" className="max-w-full rounded" style={{ border: '1px solid var(--border-primary)' }} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer: Source Domain, Date, Note indicator */}
      <div className="mt-auto pt-4 flex flex-wrap items-center justify-between gap-3" style={{ borderTop: '1px solid var(--border-primary)' }}>
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          <span className="font-medium" title="来源网站">{sourceName}</span>
          {!card.topic_title && (
            <>
              <span>·</span>
              <span>{formattedDate}</span>
            </>
          )}

          {card.note && (
            <>
              <span>·</span>
              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--warning)' }} title="有批注" />
            </>
          )}
        </div>

        {card.source_url && (
          <a
            href={buildHighlightUrl(card.source_url, card.raw_snippet)}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors flex items-center gap-1.5 text-sm group/link hover:underline"
            style={{ color: 'var(--text-tertiary)' }}
            title="去源文档查看"
          >
            <span>原文链接</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
}

function CardsPage() {
  const { topicId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { cards, loading, fetchCards, deleteCard, updateCard, searchCards } = useCardsStore();
  const { topics, fetchTopics } = useTopicsStore();
  const { sources, fetchSources } = useSourcesStore();
  const { showToast } = useUIStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState(topicId || '');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedCard, setSelectedCard] = useState(null);

  const [leftSidebarWidth, setLeftSidebarWidth] = useState(280);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(400);
  const [canvasOpen, setCanvasOpen] = useState(true);

  const [editingCard, setEditingCard] = useState(null);
  const [selectedCardIds, setSelectedCardIds] = useState(new Set());
  const [activeTab, setActiveTab] = useState('cards');
  const [selectedBoardNodeId, setSelectedBoardNodeId] = useState(null);
  const [focusedBoardNodeIds, setFocusedBoardNodeIds] = useState([]);
  const [boardRefreshToken, setBoardRefreshToken] = useState(0);
  const [boardFocusRequest, setBoardFocusRequest] = useState(null);

  const [memoContent, setMemoContent] = useState('');
  const [memoDocument, setMemoDocument] = useState(null);
  const [memoLoading, setMemoLoading] = useState(false);
  const [memoSaving, setMemoSaving] = useState(false);

  const sameIdList = useCallback((a = [], b = []) => {
    if (a === b) return true;
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }, []);

  const toggleCardSelection = (cardId) => {
    setSelectedCardIds(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedCardIds(new Set());
  };

  useEffect(() => {
    fetchTopics();
    fetchSources();
  }, [fetchTopics, fetchSources]);

  useEffect(() => {
    if (topicId) {
      setSelectedTopic(topicId);
      return;
    }
    setSelectedTopic('');
  }, [topicId]);

  const categories = useMemo(() => {
    const categorySet = new Set(sources.map(s => s.category).filter(Boolean));
    return Array.from(categorySet).sort();
  }, [sources]);

  useEffect(() => {
    const params = {};
    if (topicId) params.topic_id = topicId;
    else if (selectedTopic) params.topic_id = selectedTopic;
    fetchCards(params);
  }, [fetchCards, topicId, selectedTopic]);

  useEffect(() => {
    if (!selectedTopic) {
      setMemoContent('');
      setMemoDocument(null);
      return;
    }

    const loadMemo = async () => {
      setMemoLoading(true);
      try {
        const result = await documentsApi.list({ topic_id: selectedTopic });
        if (result.ok && result.documents && result.documents.length > 0) {
          const doc = result.documents[0];
          setMemoDocument(doc);
          const content = doc.story_units?.map(unit => unit.content || unit.text || '').join('\n\n') || '';
          setMemoContent(content);
        } else {
          setMemoDocument(null);
          setMemoContent('');
        }
      } catch (error) {
        console.error('加载研究备忘失败:', error);
        showToast('加载研究备忘失败', 'error');
      } finally {
        setMemoLoading(false);
      }
    };

    loadMemo();
  }, [selectedTopic, showToast]);

  const filteredCards = useMemo(() => {
    let result = [...cards];

    if (selectedCategory) {
      result = result.filter(card => card.source?.category === selectedCategory);
    }

    return result;
  }, [cards, selectedCategory]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      fetchCards(selectedTopic ? { topic_id: selectedTopic } : {});
      return;
    }
    try {
      await searchCards(searchQuery, { topic_id: selectedTopic || undefined });
    } catch (error) {
      showToast('搜索失败', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这张卡片吗？')) return;
    try {
      await deleteCard(id);
      showToast('卡片已删除', 'success');
    } catch (error) {
      showToast('删除失败', 'error');
    }
  };

  const handleUpdate = async (id, updates) => {
    try {
      await updateCard(id, updates);
      showToast('卡片更新成功', 'success');
    } catch (error) {
      showToast('更新失败', 'error');
    }
  };

  const handleSaveMemo = async () => {
    if (!selectedTopic) return;

    setMemoSaving(true);
    try {
      const currentTopic = topics.find(t => t.id === selectedTopic);
      if (!currentTopic) {
        showToast('Topic 不存在', 'error');
        return;
      }

      const storyUnits = memoContent.split('\n\n').filter(text => text.trim()).map((text, index) => ({
        id: `unit-${index}`,
        type: 'text',
        content: text.trim(),
      }));

      if (memoDocument) {
        const memoId = memoDocument.doc_id || memoDocument.id;
        const result = await documentsApi.update(memoId, {
          story_units: storyUnits,
        });
        if (result?.document) {
          setMemoDocument(result.document);
        }
        showToast('研究备忘已保存', 'success');
      } else {
        const result = await documentsApi.create({
          topic_id: selectedTopic,
          topic_title: currentTopic.title,
          title: `${currentTopic.title} - 研究备忘`,
          story_units: storyUnits,
        });
        if (result.ok && result.document) {
          setMemoDocument(result.document);
          showToast('研究备忘已创建', 'success');
        }
      }
    } catch (error) {
      console.error('保存研究备忘失败:', error);
      showToast('保存失败', 'error');
    } finally {
      setMemoSaving(false);
    }
  };

  const cardRefs = useRef({});
  const scrollToCard = useCallback((cardId) => {
    setSelectedCard(cardId);
    const cardElement = cardRefs.current[cardId];
    if (cardElement) {
      cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setSelectedCard(null), 1600);
    }
  }, []);

  const currentTopic = topics.find((t) => t.id === (topicId || selectedTopic));
  const isTopicOverview = !selectedTopic;

  const topicOverviewItems = useMemo(() => {
    return topics
      .map((topic) => {
        const topicCards = cards.filter((card) => card.topic_id === topic.id);
        const latestCardAt = topicCards.reduce((latest, card) => {
          if (!card?.created_at) return latest;
          if (!latest) return card.created_at;
          return new Date(card.created_at) > new Date(latest) ? card.created_at : latest;
        }, null);

        return {
          topic,
          cardCount: topic.card_count ?? topicCards.length,
          latestCardAt,
        };
      })
      .sort((a, b) => {
        if (!a.latestCardAt && !b.latestCardAt) return 0;
        if (!a.latestCardAt) return 1;
        if (!b.latestCardAt) return -1;
        return new Date(b.latestCardAt) - new Date(a.latestCardAt);
      });
  }, [topics, cards]);

  const formatLatestTime = useCallback((dateValue) => {
    if (!dateValue) return '暂无卡片';
    return new Date(dateValue).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  useEffect(() => {
    setSelectedBoardNodeId(null);
    setFocusedBoardNodeIds([]);
    setBoardFocusRequest(null);
  }, [selectedTopic]);

  const previousTopicRef = useRef(selectedTopic);
  useEffect(() => {
    if (previousTopicRef.current === selectedTopic) return;
    previousTopicRef.current = selectedTopic;
    setActiveTab('cards');
  }, [selectedTopic]);

  const handleBoardMutated = useCallback(() => {
    setBoardRefreshToken((prev) => prev + 1);
  }, []);

  const handleBoardSelectionChange = useCallback((nodeId, branchIds = []) => {
    const nextNodeId = nodeId || null;
    const nextBranchIds = Array.isArray(branchIds) ? branchIds : [];
    setSelectedBoardNodeId((prev) => (prev === nextNodeId ? prev : nextNodeId));
    setFocusedBoardNodeIds((prev) => (sameIdList(prev, nextBranchIds) ? prev : nextBranchIds));
  }, [sameIdList]);

  const handleDocNodeSelect = useCallback((nodeId, branchIds = []) => {
    const nextNodeId = nodeId || null;
    const nextBranchIds = Array.isArray(branchIds) ? branchIds : [];
    setSelectedBoardNodeId((prev) => (prev === nextNodeId ? prev : nextNodeId));
    setFocusedBoardNodeIds((prev) => (sameIdList(prev, nextBranchIds) ? prev : nextBranchIds));

    // Avoid repeated focus requests on the same node; this causes visible jank on rapid clicks.
    if (nextNodeId && nextNodeId !== selectedBoardNodeId) {
      setBoardFocusRequest({ nodeId: nextNodeId, nonce: Date.now() });
    } else if (!nextNodeId) {
      setBoardFocusRequest(null);
    }
  }, [sameIdList, selectedBoardNodeId]);

  return (
    <div className="flex gap-0 h-full" style={{ background: 'var(--workbench-bg)' }}>
      {editingCard && (
        <EditCardModal
          card={editingCard}
          onClose={() => setEditingCard(null)}
          onSave={handleUpdate}
        />
      )}

      <TopicsSidebar
        width={leftSidebarWidth}
        onWidthChange={setLeftSidebarWidth}
        topics={topics}
        selectedTopic={selectedTopic}
        onTopicSelect={setSelectedTopic}
        cards={cards}
        onCardSelect={scrollToCard}
        draggableCards={activeTab === 'board'}
        className="hidden lg:flex"
      />

      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--workbench-bg)' }}>
        <div className="shrink-0 px-4 lg:px-6 pt-4 lg:pt-6 pb-1 border-b" style={{ borderColor: 'var(--workbench-border)' }}>
          <div className="max-w-5xl">
            <h1 className="text-[30px] font-extrabold tracking-tight" style={{ color: 'var(--workbench-text)' }}>
              {isTopicOverview ? '工作台' : (currentTopic ? currentTopic.title : '全部卡片')}
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--workbench-text-muted)' }}>
              {isTopicOverview
                ? `共 ${topics.length} 个 Topic`
                : `共 ${filteredCards.length} 张卡片${filteredCards.length !== cards.length ? ` (已筛选，共 ${cards.length} 张)` : ''}${currentTopic ? ` · ${currentTopic.title}` : ''}`}
            </p>
          </div>
        </div>

        <div className="shrink-0 px-4 lg:px-6 pt-4">
          <div className="max-w-5xl flex items-center justify-between gap-3">
          {selectedTopic && (
            <div className="workbench-tab-strip">
              <button
                onClick={() => setActiveTab('cards')}
                className={`workbench-tab ${activeTab === 'cards' ? 'workbench-tab-active' : ''}`}
              >
                <LayoutGrid className="w-4 h-4" />
                证据卡
              </button>
              <button
                onClick={() => setActiveTab('board')}
                className={`workbench-tab ${activeTab === 'board' ? 'workbench-tab-active' : ''}`}
              >
                <Network className="w-4 h-4" />
                论证板
              </button>
              <button
                onClick={() => setActiveTab('memo')}
                className={`workbench-tab ${activeTab === 'memo' ? 'workbench-tab-active' : ''}`}
              >
                <FileText className="w-4 h-4" />
                研究备忘
              </button>
            </div>
          )}
          {selectedTopic && (
            <button
              type="button"
              onClick={() => navigate(`/topics/${selectedTopic}`)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 h-[34px] rounded-lg transition-colors hover:bg-blue-500/10"
              style={{
                color: 'var(--workbench-blue-ink)',
                background: 'var(--workbench-card)',
                border: '1px solid var(--workbench-border)',
              }}
              title="进入全屏论证页"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              全屏论证页
            </button>
          )}
          </div>
        </div>

        {isTopicOverview && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-5xl mx-auto px-4 lg:px-6 py-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--workbench-text)' }}>
                  Topic 总览
                </h2>
                <button
                  type="button"
                  onClick={() => navigate('/topics')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 h-8 rounded-lg transition-colors hover:bg-blue-500/10"
                  style={{
                    color: 'var(--workbench-blue-ink)',
                    background: 'var(--workbench-card)',
                    border: '1px solid var(--workbench-border)',
                  }}
                  title="管理 Topic"
                >
                  <Plus className="w-3.5 h-3.5" />
                  管理 Topic
                </button>
              </div>

              {topicOverviewItems.length > 0 ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {topicOverviewItems.map(({ topic, cardCount, latestCardAt }) => (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => setSelectedTopic(topic.id)}
                      className="w-full text-left rounded-xl p-4 transition-all hover:-translate-y-0.5"
                      style={{
                        background: 'var(--workbench-card)',
                        border: '1px solid var(--workbench-border)',
                        boxShadow: 'var(--workbench-shadow-card)',
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-base font-semibold truncate" style={{ color: 'var(--workbench-text)' }}>
                            {topic.title}
                          </p>
                          <p className="text-xs mt-1" style={{ color: 'var(--workbench-text-muted)' }}>
                            最近更新：{formatLatestTime(latestCardAt)}
                          </p>
                        </div>
                        <ArrowRight className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--workbench-blue-ink)' }} />
                      </div>

                      <div className="mt-4 flex items-center flex-wrap gap-2">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium"
                          style={{ background: 'var(--workbench-card-soft)', color: 'var(--workbench-text-soft)' }}
                        >
                          <LayoutGrid className="w-3 h-3" />
                          {cardCount} 张卡片
                        </span>
                        {latestCardAt && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium"
                            style={{ background: 'var(--workbench-card-soft)', color: 'var(--workbench-text-soft)' }}
                          >
                            <Clock className="w-3 h-3" />
                            {formatLatestTime(latestCardAt)}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div
                  className="rounded-xl p-6 text-sm"
                  style={{ border: '1px solid var(--workbench-border)', background: 'var(--workbench-card)' }}
                >
                  暂无 Topic，点击左侧或上方按钮创建后开始使用工作台。
                </div>
              )}
            </div>
          </div>
        )}

        {!isTopicOverview && activeTab === 'board' && (
          <div className="flex-1 relative" style={{ minHeight: 0 }}>
            {selectedTopic ? (
              <div
                className="absolute inset-0 m-3 rounded-2xl overflow-hidden"
                style={{ border: '1px solid var(--workbench-border)', boxShadow: 'var(--workbench-shadow-card)' }}
              >
                <Suspense fallback={
                  <div className="flex items-center justify-center h-full" style={{ background: 'var(--workbench-canvas)' }}>
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-primary)' }} />
                  </div>
                }>
                  <EmbeddedThinkBoard
                    topicId={selectedTopic}
                    topic={currentTopic}
                    selectedNodeId={selectedBoardNodeId}
                    focusRequest={boardFocusRequest}
                    boardRefreshToken={boardRefreshToken}
                    onSelectionChange={handleBoardSelectionChange}
                    onBoardMutated={handleBoardMutated}
                  />
                </Suspense>
              </div>
            ) : (
              <div className="absolute inset-0 m-3 rounded-2xl flex items-center justify-center px-6 text-center" style={{ border: '1px solid var(--workbench-border)', background: 'var(--workbench-canvas)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--workbench-text)' }}>请选择一个 Topic</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--workbench-text-muted)' }}>选中 Topic 后可进入论证板并添加节点</p>
                </div>
              </div>
            )}
          </div>
        )}

        {!isTopicOverview && activeTab !== 'board' && (
        <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 lg:px-6 pb-6 space-y-6">
          {activeTab === 'cards' && (
            <>
              <AddCardSection />

              <HypothesisSection
                topics={topics}
                selectedCardIds={selectedCardIds}
                cards={filteredCards}
                onClearSelection={clearSelection}
                activeTopicId={selectedTopic}
                activeTopicTitle={currentTopic?.title || ''}
              />

              <div className="flex flex-col xl:flex-row gap-3">
            <form onSubmit={handleSearch} className="flex-1 relative min-w-[200px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
              <input
                id="cards-search"
                name="cards_search"
                aria-label="Search cards"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索卡片内容..."
                className="input w-full pl-11 pr-4"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    fetchCards(selectedTopic ? { topic_id: selectedTopic } : {});
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                  aria-label="Clear card search"
                  title="Clear card search"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </form>

            <div className="flex flex-wrap gap-2">
              {!topicId && (
                <div className="relative">
                  <select
                    id="cards-topic-filter"
                    name="cards_topic_filter"
                    aria-label="Filter cards by topic"
                    value={selectedTopic}
                    onChange={(e) => setSelectedTopic(e.target.value)}
                    className="input appearance-none w-full sm:w-40 pr-9 cursor-pointer text-sm"
                  >
                    <option value="">全部 Topic</option>
                    {topics.map((topic) => (
                      <option key={topic.id} value={topic.id}>
                        {topic.title}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
                </div>
              )}

              <div className="relative">
                <select
                  id="cards-category-filter"
                  name="cards_category_filter"
                  aria-label="Filter cards by category"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="input appearance-none w-full sm:w-40 pr-9 cursor-pointer text-sm"
                >
                  <option value="">全部分类</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-48 skeleton rounded card" />
              ))}
            </div>
          ) : filteredCards.length > 0 ? (
            <div className="space-y-4">
              {filteredCards.map((card) => (
                <CardItem
                  key={card.id}
                  card={card}
                  onEdit={setEditingCard}
                  onDelete={handleDelete}
                  isSelected={selectedCardIds.has(card.id)}
                  onToggleSelect={toggleCardSelection}
                  cardRef={(el) => { if (el) cardRefs.current[card.id] = el; }}
                />
              ))}
            </div>
          ) : (
            <div className="card text-center py-16">
              <Search className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
              <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>
                {searchQuery ? '没有找到匹配的卡片' : selectedCategory ? '没有符合筛选条件的卡片' : '暂无卡片'}
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
                {searchQuery
                  ? '试试其他关键词'
                  : selectedCategory
                    ? '尝试调整筛选条件'
                    : '安装浏览器扩展，开始收集知识吧！'}
              </p>
            </div>
          )}
            </>
          )}

          {activeTab === 'memo' && selectedTopic && (
            <div className="space-y-4">
              {memoLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--text-primary)' }} />
                </div>
              ) : (
                <div className="card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                        研究备忘
                      </h3>
                      <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        围绕 "{currentTopic?.title}" 的研究记录和思考
                      </p>
                    </div>
                    <button
                      onClick={handleSaveMemo}
                      disabled={memoSaving}
                      className="btn btn-primary flex items-center gap-2"
                    >
                      {memoSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          保存中...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          保存备忘
                        </>
                      )}
                    </button>
                  </div>
                  <textarea
                    id="topic-memo-content"
                    name="topic_memo_content"
                    aria-label="Research memo content"
                    value={memoContent}
                    onChange={(e) => setMemoContent(e.target.value)}
                    placeholder="在这里记录你的研究思路、关键发现、待验证问题...&#10;&#10;提示：使用空行分隔不同段落"
                    rows={20}
                    className="input w-full text-sm resize-none"
                  />
                  {memoDocument && (
                    <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                      最后保存：{new Date(memoDocument.updated_at || memoDocument.created_at).toLocaleString('zh-CN')}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
        )}
      </div>

      <CanvasPlaceholder
        topicId={selectedTopic || null}
        topic={currentTopic || null}
        selectedNodeId={selectedBoardNodeId}
        focusedNodeIds={focusedBoardNodeIds}
        boardRefreshToken={boardRefreshToken}
        onSelectNode={handleDocNodeSelect}
        onBoardMutated={handleBoardMutated}
        onOpenFullBoard={() => {
          if (selectedTopic) navigate(`/topics/${selectedTopic}`);
        }}
        width={rightSidebarWidth}
        onWidthChange={setRightSidebarWidth}
        isOpen={canvasOpen}
        onToggle={setCanvasOpen}
        className="hidden xl:flex"
      />
    </div>
  );
}

export default CardsPage;
