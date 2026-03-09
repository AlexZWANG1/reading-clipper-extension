import { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Search,
  Filter,
  MoreVertical,
  Trash2,
  Edit3,
  ExternalLink,
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
import AddCardSection from '../components/AddCardSection';
import HypothesisSection from '../components/HypothesisSection';
import TopicsSidebar from '../components/TopicsSidebar';
import CanvasPlaceholder from '../components/CanvasPlaceholder';

const REGION_FLAGS = {
  'us': '🇺🇸',
  'cn': '🇨🇳',
  'eu': '🇪🇺',
  'jp': '🇯🇵',
  'kr': '🇰🇷',
  'uk': '🇬🇧',
};

// Topic 颜色系统 - 参考 Notion/Flomo 的柔和配色
const TOPIC_COLORS = [
  { bg: 'rgba(99,102,241,0.12)', text: '#6366F1', border: 'rgba(99,102,241,0.3)' },    // Indigo
  { bg: 'rgba(52,211,153,0.12)', text: '#34D399', border: 'rgba(52,211,153,0.3)' },    // Emerald
  { bg: 'rgba(251,191,36,0.12)', text: '#FBBF24', border: 'rgba(251,191,36,0.3)' },    // Amber
  { bg: 'rgba(251,113,133,0.12)', text: '#FB7185', border: 'rgba(251,113,133,0.3)' },  // Rose
  { bg: 'rgba(34,211,238,0.12)', text: '#22D3EE', border: 'rgba(34,211,238,0.3)' },    // Cyan
  { bg: 'rgba(167,139,250,0.12)', text: '#A78BFA', border: 'rgba(167,139,250,0.3)' },  // Purple
  { bg: 'rgba(248,113,113,0.12)', text: '#F87171', border: 'rgba(248,113,113,0.3)' },  // Red
  { bg: 'rgba(74,222,128,0.12)', text: '#4ADE80', border: 'rgba(74,222,128,0.3)' },    // Green
  { bg: 'rgba(251,146,60,0.12)', text: '#FB923C', border: 'rgba(251,146,60,0.3)' },    // Orange
  { bg: 'rgba(147,197,253,0.12)', text: '#93C5FD', border: 'rgba(147,197,253,0.3)' },  // Blue
];

// 根据 topic 名称生成一致的颜色
function getTopicColor(topicTitle) {
  if (!topicTitle) return TOPIC_COLORS[0];
  const hash = topicTitle.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return TOPIC_COLORS[hash % TOPIC_COLORS.length];
}

/**
 * 构建带 Text Fragment 的高亮链接
 * 使用 Web 标准 Text Fragments API: https://wicg.github.io/scroll-to-text-fragment/
 * 支持 Chrome 80+, Edge 80+ (Safari/Firefox 会自动降级为普通链接)
 * 
 * @param {string} baseUrl - 原始 URL
 * @param {string} rawSnippet - 原文片段
 * @returns {string} 带高亮锚点的 URL
 */
function buildHighlightUrl(baseUrl, rawSnippet) {
  if (!baseUrl || !rawSnippet) return baseUrl || '#';

  try {
    const url = new URL(baseUrl);

    // 清理文本：移除多余空白、换行，取前 80 个字符作为锚点
    const cleanText = rawSnippet
      .replace(/\s+/g, ' ')  // 多个空白合并为一个空格
      .trim()
      .slice(0, 80);  // 限制长度，避免 URL 过长

    if (!cleanText) return baseUrl;

    // URL 编码特殊字符
    const encodedText = encodeURIComponent(cleanText)
      .replace(/-/g, '%2D');  // 连字符需要额外编码

    // 添加 Text Fragment
    // 格式: #:~:text=<encoded_text>
    url.hash = `:~:text=${encodedText}`;

    return url.toString();
  } catch {
    // URL 解析失败，返回原链接
    return baseUrl;
  }
}

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
      <div className="rounded-xl shadow-xl w-full max-w-md p-6 m-4" style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-0)' }}>编辑卡片</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-1)' }}>Topic (主题)</label>
            <input
              list="topics-list"
              type="text"
              value={topicTitle}
              onChange={(e) => setTopicTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2"
              style={{ background: 'var(--bg-0)', border: '1px solid var(--stroke-0)', color: 'var(--text-0)', '--tw-ring-color': 'var(--accent-500)' }}
              placeholder="输入或选择主题..."
            />
            <datalist id="topics-list">
              {topics.map(t => <option key={t.id} value={t.title} />)}
            </datalist>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-1)' }}>Note (批注)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows="4"
              className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2"
              style={{ background: 'var(--bg-0)', border: '1px solid var(--stroke-0)', color: 'var(--text-0)', '--tw-ring-color': 'var(--accent-500)' }}
              placeholder="添加你的想法..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg transition-colors"
            style={{ color: 'var(--text-1)' }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            style={{ background: 'var(--accent-600)', color: 'var(--text-0)' }}
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CardItem({ card, onEdit, onDelete, isSelected, onToggleSelect }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [snippetOpen, setSnippetOpen] = useState(false);

  // 获取来源名称
  const getSourceDisplayName = () => {
    if (card.source?.name) return card.source.name;
    if (card.source_url) {
      try {
        return new URL(card.source_url).hostname.replace('www.', '');
      } catch {
        return '未分类信息源';
      }
    }
    return '未分类信息源';
  };
  const sourceName = getSourceDisplayName();

  const formattedDate = new Date(card.created_at).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });

  const cardTitle = card.title || "暂未命名";
  const factOrView = card.fact_or_view === 'view' ? 'VIEW' : 'FACT';
  const factOrViewColor = factOrView === 'VIEW' ? 'var(--accent-400)' : '#10B981';

  return (
    <div
      className={`card-readwise rounded-xl card-hover group flex flex-col transition-all duration-200`}
      style={{
        background: 'var(--surface-0)',
        border: isSelected ? '1px solid var(--accent-500)' : '1px solid var(--stroke-0)',
        boxShadow: isSelected
          ? '0 0 0 2px var(--glow), 0 2px 8px rgb(0 0 0 / 0.05)'
          : '0 2px 8px rgb(0 0 0 / 0.05)',
      }}
    >
      {/* 顶部：Topic 标签和日期 */}
      {card.topic_title && (
        <div className="flex items-center justify-between mb-4 pb-3" style={{ borderBottom: '1px solid var(--stroke-0)' }}>
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
          <span className="text-xs" style={{ color: 'var(--text-2)' }}>
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
              style={{ color: isSelected ? 'var(--accent-400)' : 'var(--text-2)' }}
              title={isSelected ? '取消选择' : '选择此卡片'}
            >
              {isSelected ? (
                <CheckSquare className="w-5 h-5" />
              ) : (
                <Square className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
            style={{ color: 'var(--text-2)' }}
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 rounded-lg shadow-lg py-1 z-20 min-w-[120px]" style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)' }}>
                <button
                  onClick={() => {
                    onEdit(card);
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors"
                  style={{ color: 'var(--text-1)' }}
                >
                  <Edit3 className="w-4 h-4" />
                  编辑
                </button>
                <button
                  onClick={() => {
                    onDelete(card.id);
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors"
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
          <span
            className="text-[10px] font-mono font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm shrink-0"
            style={{ color: '#fff', backgroundColor: factOrViewColor }}
          >
            {factOrView}
          </span>
          <h4 className="text-lg font-bold leading-snug line-clamp-2" style={{ color: 'var(--text-0)' }}>
            {cardTitle}
          </h4>
        </div>
        <h3
          className="font-normal text-base leading-7"
          style={{ color: 'var(--text-1)' }}
        >
          {card.summary}
        </h3>
      </div>

      {/* Key points */}
      {card.key_points?.length > 0 && (
        <ul className="text-base space-y-3 mb-6 pl-1" style={{ color: 'var(--text-1)' }}>
          {card.key_points.map((point, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-2.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--accent-400)' }} />
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
          style={{ color: 'var(--text-2)' }}
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${snippetOpen ? 'rotate-180' : ''}`} />
          {snippetOpen ? '收起原文片段' : '查看原文片段'}
        </button>
        {snippetOpen && (
          <div
            className="mt-3 p-4 rounded-xl text-sm leading-relaxed whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto"
            style={{ background: 'var(--bg-0)', color: 'var(--text-1)', border: '1px solid var(--stroke-1)' }}
          >
            {card.raw_snippet || "（无原文内容）"}
            {card.image_url && (
              <div className="mt-3">
                <img src={card.image_url} alt="Card Image" className="max-w-full rounded-lg" style={{ border: '1px solid var(--stroke-0)' }} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer: Source Domain, Date, Note indicator */}
      <div className="mt-auto pt-4 flex flex-wrap items-center justify-between gap-3" style={{ borderTop: '1px solid var(--stroke-0)' }}>
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-2)' }}>
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
              <span className="w-2 h-2 rounded-full" style={{ background: '#FBBF24' }} title="有批注" />
            </>
          )}
        </div>

        {card.source_url && (
          <a
            href={buildHighlightUrl(card.source_url, card.raw_snippet)}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors flex items-center gap-1.5 text-sm group/link hover:underline"
            style={{ color: 'var(--text-2)' }}
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
  const { sources, fetchSources } = useSourcesStore(); // Add SourcesStore
  const { showToast } = useUIStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState(topicId || '');
  const [selectedCategory, setSelectedCategory] = useState(''); // 按信息源分类筛选
  const [selectedCard, setSelectedCard] = useState(null); // 选中的卡片（用于滚动定位）

  // 侧边栏宽度状态
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(280);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(400);
  const [canvasOpen, setCanvasOpen] = useState(true);

  const [editingCard, setEditingCard] = useState(null);

  // 假设验证用的卡片选择
  const [selectedCardIds, setSelectedCardIds] = useState(new Set());

  // Tab 状态：cards | board | memo
  const [activeTab, setActiveTab] = useState('cards');

  // 研究备忘状态
  const [memoContent, setMemoContent] = useState('');
  const [memoDocument, setMemoDocument] = useState(null);
  const [memoLoading, setMemoLoading] = useState(false);
  const [memoSaving, setMemoSaving] = useState(false);

  // 切换卡片选中状态
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

  // 清空选择
  const clearSelection = () => {
    setSelectedCardIds(new Set());
  };

  useEffect(() => {
    fetchTopics();
    fetchSources(); // Fetch sources on mount
  }, [fetchTopics, fetchSources]);

  // 从 sources 中提取所有唯一的分类
  const categories = useMemo(() => {
    const categorySet = new Set(sources.map(s => s.category).filter(Boolean));
    return Array.from(categorySet).sort();
  }, [sources]);

  // 只在 topic 变化时从后端获取卡片
  useEffect(() => {
    const params = {};
    if (topicId) params.topic_id = topicId;
    else if (selectedTopic) params.topic_id = selectedTopic;
    fetchCards(params);
  }, [fetchCards, topicId, selectedTopic]);

  // 加载研究备忘
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
          // story_units 是 JSONB 数组，提取文本内容
          const content = doc.story_units?.map(unit => unit.content || unit.text || '').join('\n\n') || '';
          setMemoContent(content);
        } else {
          // 没有文档，清空
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

  // 前端筛选逻辑（参考旧前端 updateFilteredView）
  const filteredCards = useMemo(() => {
    let result = [...cards];

    // 按信息源分类筛选
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

  // 保存研究备忘
  const handleSaveMemo = async () => {
    if (!selectedTopic) return;

    setMemoSaving(true);
    try {
      const currentTopic = topics.find(t => t.id === selectedTopic);
      if (!currentTopic) {
        showToast('Topic 不存在', 'error');
        return;
      }

      // 将文本内容转换为 story_units 格式
      const storyUnits = memoContent.split('\n\n').filter(text => text.trim()).map((text, index) => ({
        id: `unit-${index}`,
        type: 'text',
        content: text.trim(),
      }));

      if (memoDocument) {
        // 更新现有文档
        await documentsApi.update(memoDocument.id, {
          story_units: storyUnits,
        });
        showToast('研究备忘已保存', 'success');
      } else {
        // 创建新文档
        const result = await documentsApi.create({
          topic_id: selectedTopic,
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

  // 滚动到指定卡片
  const scrollToCard = (cardId) => {
    setSelectedCard(cardId);
    const cardElement = document.getElementById(`card-${cardId}`);
    if (cardElement) {
      cardElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
      // 高亮动画
      cardElement.classList.add('highlight-flash');
      setTimeout(() => {
        cardElement.classList.remove('highlight-flash');
        setSelectedCard(null);
      }, 2000);
    }
  };

  const currentTopic = topics.find((t) => t.id === (topicId || selectedTopic));

  return (
    <div className="flex gap-0 h-full">
      {/* Edit Modal */}
      {editingCard && (
        <EditCardModal
          card={editingCard}
          onClose={() => setEditingCard(null)}
          onSave={handleUpdate}
        />
      )}

      {/* 左侧 Topics 侧边栏 */}
      <TopicsSidebar
        width={leftSidebarWidth}
        onWidthChange={setLeftSidebarWidth}
        topics={topics}
        selectedTopic={selectedTopic}
        onTopicSelect={setSelectedTopic}
        cards={cards}
        onCardSelect={scrollToCard}
        className="hidden lg:flex"
      />

      {/* 主内容区 - 单列卡片 */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-4 lg:p-6 space-y-6">
          {/* Page title */}
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-0)' }}>
              {currentTopic ? currentTopic.title : '全部卡片'}
            </h1>
            <p className="mt-1" style={{ color: 'var(--text-2)' }}>
              共 {filteredCards.length} 张卡片
              {filteredCards.length !== cards.length && ` (已筛选，共 ${cards.length} 张)`}
              {currentTopic && ` · ${currentTopic.title}`}
            </p>
          </div>

          {/* Tab 切换栏 - 仅在选中 Topic 时显示 */}
          {selectedTopic && (
            <div className="flex items-center gap-1 border-b" style={{ borderColor: 'var(--stroke-0)' }}>
              <button
                onClick={() => setActiveTab('cards')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === 'cards' ? 'border-indigo-500' : 'border-transparent'
                }`}
                style={{ color: activeTab === 'cards' ? 'var(--accent-400)' : 'var(--text-1)' }}
              >
                <LayoutGrid className="w-4 h-4" />
                证据卡
              </button>
              <button
                onClick={() => {
                  if (selectedTopic) {
                    navigate(`/topics/${selectedTopic}`);
                  }
                }}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 border-transparent"
                style={{ color: 'var(--text-1)' }}
              >
                <Network className="w-4 h-4" />
                论证板
              </button>
              <button
                onClick={() => setActiveTab('memo')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === 'memo' ? 'border-indigo-500' : 'border-transparent'
                }`}
                style={{ color: activeTab === 'memo' ? 'var(--accent-400)' : 'var(--text-1)' }}
              >
                <FileText className="w-4 h-4" />
                研究备忘
              </button>
            </div>
          )}

          {/* Tab 内容区 */}
          {activeTab === 'cards' && (
            <>
              {/* Add card */}
              <AddCardSection />

              {/* Hypothesis section */}
              <HypothesisSection
                topics={topics}
                selectedCardIds={selectedCardIds}
                cards={filteredCards}
                onClearSelection={clearSelection}
              />

              {/* Search & filters */}
              <div className="flex flex-col xl:flex-row gap-3">
            <form onSubmit={handleSearch} className="flex-1 relative min-w-[200px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--text-2)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索卡片内容..."
                className="w-full pl-11 pr-4 py-2.5 rounded-xl input-focus"
                style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)', color: 'var(--text-0)' }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    fetchCards(selectedTopic ? { topic_id: selectedTopic } : {});
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                  style={{ color: 'var(--text-2)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </form>

            <div className="flex flex-wrap gap-2">
              {!topicId && (
                <div className="relative">
                  <select
                    value={selectedTopic}
                    onChange={(e) => setSelectedTopic(e.target.value)}
                    className="appearance-none w-full sm:w-40 pl-4 pr-9 py-2.5 rounded-xl input-focus cursor-pointer text-sm"
                    style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)', color: 'var(--text-0)' }}
                  >
                    <option value="">全部 Topic</option>
                    {topics.map((topic) => (
                      <option key={topic.id} value={topic.id}>
                        {topic.title}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-2)' }} />
                </div>
              )}

              <div className="relative">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="appearance-none w-full sm:w-40 pl-4 pr-9 py-2.5 rounded-xl input-focus cursor-pointer text-sm"
                  style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)', color: 'var(--text-0)' }}
                >
                  <option value="">全部分类</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-2)' }} />
              </div>
            </div>
          </div>

          {/* Card list */}
          {loading ? (
            <div className="space-y-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-48 skeleton rounded-xl card-readwise" />
              ))}
            </div>
          ) : filteredCards.length > 0 ? (
            <div className="space-y-4">
              {filteredCards.map((card) => (
                <div
                  key={card.id}
                  id={`card-${card.id}`}
                  className={selectedCard === card.id ? 'highlight-flash' : ''}
                >
                  <CardItem
                    card={card}
                    onEdit={setEditingCard}
                    onDelete={handleDelete}
                    isSelected={selectedCardIds.has(card.id)}
                    onToggleSelect={toggleCardSelection}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 rounded-xl" style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)' }}>
              <Search className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-2)' }} />
              <p className="font-medium" style={{ color: 'var(--text-1)' }}>
                {searchQuery ? '没有找到匹配的卡片' : selectedCategory ? '没有符合筛选条件的卡片' : '暂无卡片'}
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
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

          {/* 研究备忘 Tab */}
          {activeTab === 'memo' && selectedTopic && (
            <div className="space-y-4">
              {memoLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-400)' }} />
                </div>
              ) : (
                <div className="rounded-xl p-6" style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)' }}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold" style={{ color: 'var(--text-0)' }}>
                        研究备忘
                      </h3>
                      <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
                        围绕 "{currentTopic?.title}" 的研究记录和思考
                      </p>
                    </div>
                    <button
                      onClick={handleSaveMemo}
                      disabled={memoSaving}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
                      style={{ background: 'var(--accent-500)', color: 'white' }}
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
                    value={memoContent}
                    onChange={(e) => setMemoContent(e.target.value)}
                    placeholder="在这里记录你的研究思路、关键发现、待验证问题...&#10;&#10;提示：使用空行分隔不同段落"
                    rows={20}
                    className="w-full px-4 py-3 rounded-lg text-sm resize-none focus:outline-none focus:ring-2"
                    style={{
                      background: 'var(--bg-0)',
                      border: '1px solid var(--stroke-0)',
                      color: 'var(--text-0)',
                      '--tw-ring-color': 'var(--accent-500)'
                    }}
                  />
                  {memoDocument && (
                    <p className="text-xs mt-2" style={{ color: 'var(--text-2)' }}>
                      最后保存：{new Date(memoDocument.updated_at || memoDocument.created_at).toLocaleString('zh-CN')}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 右侧画布区域 */}
      <CanvasPlaceholder
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



