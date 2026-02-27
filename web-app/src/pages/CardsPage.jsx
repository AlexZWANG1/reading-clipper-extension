import { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
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
} from 'lucide-react';
import { useCardsStore, useTopicsStore, useSourcesStore, useUIStore } from '../lib/store';
import AddCardSection from '../components/AddCardSection';
import HypothesisSection from '../components/HypothesisSection';

const IMPORTANCE_COLORS = {
  1: '#EF4444',
  2: '#FB923C',
  3: '#9CA3AF',
};

const IMPORTANCE_LABELS = {
  1: '🔴 重要',
  2: '🟠 普通',
  3: '⚪ 闲聊',
};

const REGION_FLAGS = {
  'us': '🇺🇸',
  'cn': '🇨🇳',
  'eu': '🇪🇺',
  'jp': '🇯🇵',
  'kr': '🇰🇷',
  'uk': '🇬🇧',
};

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
          <h4 className="text-xl font-bold leading-tight line-clamp-2" style={{ color: 'var(--text-0)' }}>
            {cardTitle}
          </h4>
        </div>
        <h3
          className={`font-medium text-lg leading-8`}
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

      {/* Footer: Source Domain, Date, Topic */}
      <div className="mt-auto pt-4 flex flex-wrap items-center justify-between gap-3" style={{ borderTop: '1px solid var(--stroke-0)' }}>
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-2)' }}>
          <span className="font-medium" title="来源网站">{sourceName}</span>
          <span>·</span>
          <span>{formattedDate}</span>

          {card.topic_title && (
            <>
              <span>·</span>
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--accent-500)' }}
              >
                <Tag className="w-3 h-3" />
                {card.topic_title}
              </span>
            </>
          )}

          {card.note && (
            <span className="w-2 h-2 rounded-full ml-1" style={{ background: '#FBBF24' }} title="有批注" />
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
  const { cards, loading, fetchCards, deleteCard, updateCard, searchCards } = useCardsStore();
  const { topics, fetchTopics } = useTopicsStore();
  const { sources, fetchSources } = useSourcesStore(); // Add SourcesStore
  const { showToast } = useUIStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState(topicId || '');
  const [selectedCategory, setSelectedCategory] = useState(''); // 按信息源分类筛选
  const [selectedImportance, setSelectedImportance] = useState('');

  const [editingCard, setEditingCard] = useState(null);

  // 假设验证用的卡片选择
  const [selectedCardIds, setSelectedCardIds] = useState(new Set());

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

  // 前端筛选逻辑（参考旧前端 updateFilteredView）
  const filteredCards = useMemo(() => {
    let result = [...cards];

    // 1. 按信息源分类筛选
    if (selectedCategory) {
      result = result.filter(card => card.source?.category === selectedCategory);
    }

    // 2. 按信息源的重要度筛选
    if (selectedImportance) {
      const imp = parseInt(selectedImportance, 10);
      result = result.filter(card => card.source?.importance_level === imp);
    }

    return result;
  }, [cards, selectedCategory, selectedImportance]);

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

  const currentTopic = topics.find((t) => t.id === (topicId || selectedTopic));

  return (
    <div className="space-y-6 animate-fade-in relative">
      {/* Edit Modal */}
      {editingCard && (
        <EditCardModal
          card={editingCard}
          onClose={() => setEditingCard(null)}
          onSave={handleUpdate}
        />
      )}

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

          <div className="relative">
            <select
              value={selectedImportance}
              onChange={(e) => setSelectedImportance(e.target.value)}
              className="appearance-none w-full sm:w-32 pl-4 pr-9 py-2.5 rounded-xl input-focus cursor-pointer text-sm"
              style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)', color: 'var(--text-0)' }}
            >
              <option value="">全部重要度</option>
              <option value="1">🔴 重要</option>
              <option value="2">🟠 普通</option>
              <option value="3">⚪ 闲聊</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-2)' }} />
          </div>
        </div>
      </div>

      {/* Card list */}
      {loading ? (
        <div className="max-w-4xl xl:max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-2 gap-5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 skeleton rounded-xl card-readwise" />
          ))}
        </div>
      ) : filteredCards.length > 0 ? (
        <div className="max-w-4xl xl:max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-2 gap-5">
          {filteredCards.map((card) => (
            <CardItem
              key={card.id}
              card={card}
              onEdit={setEditingCard}
              onDelete={handleDelete}
              isSelected={selectedCardIds.has(card.id)}
              onToggleSelect={toggleCardSelection}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 rounded-xl" style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)' }}>
          <Search className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-2)' }} />
          <p className="font-medium" style={{ color: 'var(--text-1)' }}>
            {searchQuery ? '没有找到匹配的卡片' : (selectedCategory || selectedImportance) ? '没有符合筛选条件的卡片' : '暂无卡片'}
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
            {searchQuery
              ? '试试其他关键词'
              : (selectedCategory || selectedImportance)
                ? '尝试调整筛选条件'
                : '安装浏览器扩展，开始收集知识吧！'}
          </p>
        </div>
      )}
    </div>
  );
}

export default CardsPage;



