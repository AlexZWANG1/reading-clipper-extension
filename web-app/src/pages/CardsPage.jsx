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
  1: 'bg-red-500',
  2: 'bg-orange-400',
  3: 'bg-gray-300',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 m-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-surface-900 mb-4">编辑卡片</h3>

        <div className="space-y-4">
          {/* Topic Input with Datalist for suggestions */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Topic (主题)</label>
            <input
              list="topics-list"
              type="text"
              value={topicTitle}
              onChange={(e) => setTopicTitle(e.target.value)}
              className="w-full px-3 py-2 border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="输入或选择主题..."
            />
            <datalist id="topics-list">
              {topics.map(t => <option key={t.id} value={t.title} />)}
            </datalist>
          </div>

          {/* Note Input */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Note (批注)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows="4"
              className="w-full px-3 py-2 border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="添加你的想法..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-surface-600 hover:bg-surface-100 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-primary-600 text-white hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50"
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

  // 判断是否匹配了信息源（参考旧前端逻辑）
  const hasMatchedSource = !!card.source;

  // 已匹配信息源时，使用 source 对象的字段
  const sourceImportance = card.source?.importance_level || 2;
  const sourceRegion = card.source?.region || '';
  const sourceCategory = card.source?.category || '';

  // 获取来源名称
  // 已匹配: 使用 source.name
  // 未匹配: 优先用域名，不用 source_name（那是页面标题，如 "Democrats threaten to..."）
  const getSourceDisplayName = () => {
    // 已匹配信息源 → 使用信息源名称
    if (card.source?.name) return card.source.name;
    
    // 未匹配 → 优先从 URL 提取域名
    if (card.source_url) {
      try {
        return new URL(card.source_url).hostname.replace('www.', '');
      } catch {
        return '未分类信息源';
      }
    }
    
    // 没有 URL → 显示兜底文案
    return '未分类信息源';
  };
  const sourceName = getSourceDisplayName();

  // 地区图标映射（参考旧前端）
  const getRegionIcon = (region) => {
    if (region === 'domestic') return '🇨🇳';
    if (region === 'overseas') return '🌍';
    return REGION_FLAGS[region] || '';
  };

  return (
    <div className={`bg-white rounded-xl border p-5 card-hover group flex flex-col h-full shadow-sm hover:shadow-md transition-all duration-200 ${isSelected ? 'border-primary-400 ring-2 ring-primary-100' : 'border-surface-100'}`}>
      {/* 头部：勾选框 + 来源徽章 + 菜单 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center flex-wrap gap-2">
          {/* 勾选框 */}
          {onToggleSelect && (
            <button
              onClick={() => onToggleSelect(card.id)}
              className={`p-0.5 rounded transition-colors ${isSelected ? 'text-primary-600' : 'text-surface-300 hover:text-surface-500'}`}
              title={isSelected ? '取消选择' : '选择此卡片'}
            >
              {isSelected ? (
                <CheckSquare className="w-5 h-5" />
              ) : (
                <Square className="w-5 h-5" />
              )}
            </button>
          )}
          {/* Source Badge - 区分已匹配/未匹配状态 */}
          {hasMatchedSource ? (
            // 已匹配信息源：显示完整徽章
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-surface-200 bg-gradient-to-br from-green-50 to-green-100 text-green-800">
              {/* Importance Dot */}
              <span className={`w-1.5 h-1.5 rounded-full ${IMPORTANCE_COLORS[sourceImportance] || 'bg-gray-300'}`} />
              {/* Region Icon */}
              {sourceRegion && (
                <span className="text-[10px] opacity-80">{getRegionIcon(sourceRegion)}</span>
              )}
              {/* Source Name */}
              <span className="max-w-[100px] truncate" title={sourceName}>
                {sourceName}
              </span>
              {/* Category Tag */}
              {sourceCategory && (
                <span className="text-[9px] px-1.5 py-0.5 bg-green-200/50 text-green-700 rounded">
                  {sourceCategory}
                </span>
              )}
            </div>
          ) : (
            // 未匹配信息源：显示兜底徽章
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-surface-200 bg-surface-50 text-surface-500">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
              <span className="max-w-[120px] truncate" title={sourceName}>
                {sourceName}
              </span>
            </div>
          )}

          {/* Date */}
          <div className="flex items-center gap-1 text-xs text-surface-400">
            <Clock className="w-3 h-3" />
            <span>
              {new Date(card.created_at).toLocaleDateString('zh-CN', {
                month: 'numeric',
                day: 'numeric',
              })}
            </span>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-surface-100 py-1 z-20 min-w-[120px]">
                <button
                  onClick={() => {
                    onEdit(card);
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-surface-700 hover:bg-surface-50 flex items-center gap-2"
                >
                  <Edit3 className="w-4 h-4" />
                  编辑
                </button>
                <button
                  onClick={() => {
                    onDelete(card.id);
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  删除
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 标题 (新增) */}
      {card.title && (
        <h4 className="text-base font-semibold text-surface-900 mb-2 leading-tight">
          {card.title}
        </h4>
      )}

      {/* 摘要 */}
      <h3 className={`text-surface-800 font-medium mb-3 text-sm leading-relaxed ${card.title ? '' : 'text-base text-surface-900'}`}>
        {card.summary}
      </h3>

      {/* 要点 */}
      {card.key_points?.length > 0 && (
        <ul className="text-sm text-surface-600 space-y-1.5 mb-4 pl-1">
          {card.key_points.slice(0, 3).map((point, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-primary-500 mt-1.5 w-1 h-1 rounded-full bg-primary-500 shrink-0" />
              <span className="opacity-90 leading-normal">{point}</span>
            </li>
          ))}
          {card.key_points.length > 3 && (
            <li className="text-surface-400 text-xs pl-3 pt-1">
              +{card.key_points.length - 3} 更多要点
            </li>
          )}
        </ul>
      )}

      {/* 底部功能区 */}
      <div className="mt-auto pt-3 border-t border-surface-100/50 flex flex-col gap-3">
        {/* 折叠原文区域 */}
        <div className="text-xs">
          <button
            onClick={() => setSnippetOpen(!snippetOpen)}
            className="flex items-center gap-1 text-surface-500 hover:text-surface-700 font-medium transition-colors select-none"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${snippetOpen ? 'rotate-180' : ''}`} />
            {snippetOpen ? '收起原文' : '查看原文'}
          </button>
          {snippetOpen && (
            <div className="mt-2 p-3 bg-surface-50 rounded-lg text-surface-600 font-mono leading-relaxed whitespace-pre-wrap break-words border border-surface-100 max-h-60 overflow-y-auto">
              {card.raw_snippet || "（无原文内容）"}
              {/* 图片显示 */}
              {card.image_url && (
                <div className="mt-2">
                  <img src={card.image_url} alt="Card Image" className="max-w-full rounded border border-surface-200" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部元数据: Topic 与 链接 */}
        <div className="flex items-center justify-between">
          {/* Topic Badge with Note Indicator */}
          <div className="flex items-center gap-2">
            {card.topic_title ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-primary-50 text-primary-700 rounded text-[11px] font-medium border border-primary-100/50">
                <Tag className="w-3 h-3" />
                {card.topic_title}
              </span>
            ) : (
              <span className="text-[11px] text-surface-300">#未分类</span>
            )}
            {/* Note Indicator */}
            {card.note && (
              <span className="w-2 h-2 rounded-full bg-yellow-400" title="有批注" />
            )}
          </div>

          {card.source_url && (
            <a
              href={buildHighlightUrl(card.source_url, card.raw_snippet)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-surface-400 hover:text-primary-600 transition-colors flex items-center gap-1 text-xs group/link"
              title="跳转到原文并高亮选中内容"
            >
              <span className="group-hover/link:underline">回到原文</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
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

      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-surface-900">
          {currentTopic ? currentTopic.title : '全部卡片'}
        </h1>
        <p className="text-surface-500 mt-1">
          共 {filteredCards.length} 张卡片
          {filteredCards.length !== cards.length && ` (已筛选，共 ${cards.length} 张)`}
          {currentTopic && ` · ${currentTopic.title}`}
        </p>
      </div>

      {/* 添加卡片区域 */}
      <AddCardSection />

      {/* 假设验证区域 */}
      <HypothesisSection
        topics={topics}
        selectedCardIds={selectedCardIds}
        cards={filteredCards}
        onClearSelection={clearSelection}
      />

      {/* 搜索和筛选 */}
      <div className="flex flex-col xl:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex-1 relative min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索卡片内容..."
            className="w-full pl-11 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl text-surface-900 placeholder-surface-400 input-focus"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                fetchCards(selectedTopic ? { topic_id: selectedTopic } : {});
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-surface-400 hover:text-surface-600"
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
                className="appearance-none w-full sm:w-40 pl-4 pr-9 py-2.5 bg-white border border-surface-200 rounded-xl text-surface-900 input-focus cursor-pointer text-sm"
              >
                <option value="">全部 Topic</option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.title}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" />
            </div>
          )}

          {/* Category Filter - 按信息源分类筛选 */}
          <div className="relative">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="appearance-none w-full sm:w-40 pl-4 pr-9 py-2.5 bg-white border border-surface-200 rounded-xl text-surface-900 input-focus cursor-pointer text-sm"
            >
              <option value="">全部分类</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" />
          </div>

          {/* Importance Filter */}
          <div className="relative">
            <select
              value={selectedImportance}
              onChange={(e) => setSelectedImportance(e.target.value)}
              className="appearance-none w-full sm:w-32 pl-4 pr-9 py-2.5 bg-white border border-surface-200 rounded-xl text-surface-900 input-focus cursor-pointer text-sm"
            >
              <option value="">全部重要度</option>
              <option value="1">🔴 重要</option>
              <option value="2">🟠 普通</option>
              <option value="3">⚪ 闲聊</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* 卡片列表 */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 skeleton rounded-xl" />
          ))}
        </div>
      ) : filteredCards.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
        <div className="text-center py-16 bg-white rounded-xl border border-surface-100">
          <Search className="w-12 h-12 mx-auto mb-4 text-surface-300" />
          <p className="text-surface-600 font-medium">
            {searchQuery ? '没有找到匹配的卡片' : (selectedCategory || selectedImportance) ? '没有符合筛选条件的卡片' : '暂无卡片'}
          </p>
          <p className="text-surface-400 text-sm mt-1">
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



