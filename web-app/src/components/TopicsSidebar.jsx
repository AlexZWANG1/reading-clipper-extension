import { useState, useEffect, useMemo } from 'react';
import { Plus, ChevronRight, ChevronDown, X, Check, MoreVertical, Edit3, Trash2, GripVertical, ArrowLeft, Search, ExternalLink } from 'lucide-react';
import { useTopicsStore, useUIStore } from '../lib/store';
import { getTopicColor, buildHighlightUrl } from '../lib/ui-utils';

function TopicsSidebar({
  width = 280,
  onWidthChange,
  topics = [],
  selectedTopic,
  onTopicSelect,
  cards = [],
  onCardSelect,
  draggableCards = false,
  className = ''
}) {
  const [expandedTopics, setExpandedTopics] = useState(new Set());
  const [isResizing, setIsResizing] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [isCreatingTopic, setIsCreatingTopic] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingTopicId, setEditingTopicId] = useState(null);
  const [editingTopicTitle, setEditingTopicTitle] = useState('');
  const [showMenuForTopic, setShowMenuForTopic] = useState(null);
  const [topicSearchQuery, setTopicSearchQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllCards, setShowAllCards] = useState(false);

  const { createTopic, fetchTopics, updateTopic, deleteTopic } = useTopicsStore();
  const { showToast } = useUIStore();

  const isUncategorized = selectedTopic === 'uncategorized';

  // 当前选中的 Topic 对象
  const currentTopic = useMemo(() => {
    if (isUncategorized) return { id: 'uncategorized', title: '未分类' };
    return topics.find(t => t.id === selectedTopic);
  }, [topics, selectedTopic, isUncategorized]);

  // 未分类卡片
  const uncategorizedCards = useMemo(() => cards.filter(c => !c.topic_id), [cards]);

  // Evidence Pool 卡片列表
  const filteredCards = useMemo(() => {
    let result = showAllCards
      ? cards
      : isUncategorized
        ? cards.filter(c => !c.topic_id)
        : cards.filter(c => c.topic_id === selectedTopic);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(c =>
        (c.summary || '').toLowerCase().includes(q) ||
        (c.raw_snippet || '').toLowerCase().includes(q) ||
        (c.title || '').toLowerCase().includes(q) ||
        (c.source?.name || '').toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [cards, showAllCards, selectedTopic, searchQuery]);

  const filteredTopics = useMemo(() => {
    const query = topicSearchQuery.trim().toLowerCase();
    if (!query) return topics;
    return topics.filter((topic) => (topic.title || '').toLowerCase().includes(query));
  }, [topics, topicSearchQuery]);

  // 重置搜索
  useEffect(() => { setSearchQuery(''); setShowAllCards(false); }, [selectedTopic]);

  // 默认展开有卡片的 Topics
  useEffect(() => {
    if (!initialized && topics.length > 0) {
      const topicsWithCards = new Set(
        topics.filter(topic => cards.some(card => card.topic_id === topic.id)).map(topic => topic.id)
      );
      setExpandedTopics(topicsWithCards);
      setInitialized(true);
    }
  }, [topics, cards, initialized]);

  useEffect(() => {
    const handleClickOutside = () => { if (showMenuForTopic) setShowMenuForTopic(null); };
    if (showMenuForTopic) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenuForTopic]);

  const toggleTopic = (topicId) => {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      next.has(topicId) ? next.delete(topicId) : next.add(topicId);
      return next;
    });
  };

  const handleResizeStart = (e) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = width;
    const onMove = (ev) => onWidthChange?.(Math.max(200, Math.min(400, startWidth + (ev.clientX - startX))));
    const onUp = () => { setIsResizing(false); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const getCardsByTopic = (topicId) => cards.filter(card => card.topic_id === topicId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const handleCreateTopic = async () => {
    const title = newTopicTitle.trim();
    if (!title) { showToast('请输入 Topic 名称', 'error'); return; }
    setIsSubmitting(true);
    try { await createTopic({ title }); showToast('Topic 创建成功', 'success'); setNewTopicTitle(''); setIsCreatingTopic(false); await fetchTopics(); }
    catch (error) { showToast(error.message || '创建 Topic 失败', 'error'); }
    finally { setIsSubmitting(false); }
  };

  const handleSaveEdit = async () => {
    const title = editingTopicTitle.trim();
    if (!title) { showToast('请输入 Topic 名称', 'error'); return; }
    setIsSubmitting(true);
    try { await updateTopic(editingTopicId, { title }); showToast('Topic 更新成功', 'success'); setEditingTopicId(null); await fetchTopics(); }
    catch (error) { showToast(error.message || '更新 Topic 失败', 'error'); }
    finally { setIsSubmitting(false); }
  };

  const handleDeleteTopic = async (topicId, topicTitle) => {
    if (!window.confirm(`确定要删除 Topic "${topicTitle}" 吗？\n\n注意：关联的卡片不会被删除，但会失去 Topic 关联。`)) return;
    setShowMenuForTopic(null);
    try { await deleteTopic(topicId); showToast('Topic 已删除', 'success'); await fetchTopics(); }
    catch (error) { showToast(error.message || '删除 Topic 失败', 'error'); }
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // Mode B: Evidence Pool — selected topic's cards (ThinkingBoardPage style)
  // ══════════════════════════════════════════════════════════════════════════════
  if (selectedTopic && currentTopic) {
    const color = getTopicColor(currentTopic.title);
    return (
      <div
        className={`relative flex flex-col h-full shrink-0 ${className}`}
        style={{ width: `${width}px`, background: 'var(--workbench-panel)', borderRight: '1px solid var(--workbench-border)' }}
      >
        {/* Header — back + topic title */}
        <div className="shrink-0 p-3" style={{ borderBottom: '1px solid var(--workbench-border)' }}>
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => onTopicSelect('')}
              className="p-2 rounded-lg transition-colors shrink-0 hover:bg-slate-100 cursor-pointer"
              style={{ color: 'var(--workbench-text-muted)' }}
              aria-label="Back to topics list"
              title="返回 Topics 列表"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color.text }} />
                <h3 className="text-sm font-bold truncate" style={{ color: 'var(--workbench-text)' }}>
                  {currentTopic.title}
                </h3>
              </div>
              <p className="text-xs mt-0.5 ml-3.5" style={{ color: 'var(--workbench-text-muted)' }}>
                {filteredCards.length} 张卡片
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-2">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--workbench-text-muted)' }} />
            <input
              type="text"
              id="evidence-pool-search"
              name="evidence_pool_search"
              aria-label="Search evidence cards"
              placeholder="搜索证据..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input w-full pl-8 pr-3 py-2 text-xs rounded-lg outline-none transition-all"
              style={{ background: 'var(--workbench-card)', color: 'var(--workbench-text)', border: '1px solid var(--workbench-border)' }}
              onFocus={e => e.target.style.borderColor = 'var(--workbench-blue)'}
              onBlur={e => e.target.style.borderColor = 'var(--workbench-border)'}
            />
          </div>

          {/* Toggle: current topic / all cards */}
          <div className="flex gap-1">
            <button
              onClick={() => setShowAllCards(false)}
              className="flex-1 text-xs py-2 rounded-lg font-medium transition-colors cursor-pointer"
              style={{
                background: !showAllCards ? 'var(--workbench-card)' : 'transparent',
                border: !showAllCards ? '1px solid var(--workbench-border)' : '1px solid transparent',
                color: !showAllCards ? 'var(--workbench-text)' : 'var(--workbench-text-muted)',
              }}
            >当前 Topic</button>
            <button
              onClick={() => setShowAllCards(true)}
              className="flex-1 text-xs py-2 rounded-lg font-medium transition-colors cursor-pointer"
              style={{
                background: showAllCards ? 'var(--workbench-card)' : 'transparent',
                border: showAllCards ? '1px solid var(--workbench-border)' : '1px solid transparent',
                color: showAllCards ? 'var(--workbench-text)' : 'var(--workbench-text-muted)',
              }}
            >全部卡片</button>
          </div>
        </div>

        {/* Card list — Evidence Pool style */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredCards.map(card => {
            const sourceName = card.source?.name || (card.source_url ? (() => { try { return new URL(card.source_url).hostname.replace('www.', ''); } catch { return ''; } })() : '');
            return (
              <div
                key={card.id}
                draggable={draggableCards}
                onDragStart={draggableCards ? (e) => {
                  e.dataTransfer.setData('application/json', JSON.stringify(card));
                  e.dataTransfer.effectAllowed = 'move';
                  e.currentTarget.style.opacity = '0.5';
                } : undefined}
                onDragEnd={draggableCards ? (e) => { e.currentTarget.style.opacity = '1'; } : undefined}
                onClick={() => onCardSelect?.(card.id)}
                className={`group/card flex items-start gap-2 p-3 rounded-xl text-sm transition-all card-hover cursor-pointer ${draggableCards ? 'cursor-grab active:cursor-grabbing' : ''}`}
                style={{
                  background: 'var(--workbench-card)',
                  border: '1px solid var(--workbench-border)',
                  boxShadow: '0 6px 14px rgba(30,26,18,0.06)',
                }}
              >
                {/* Drag handle */}
                {draggableCards && (
                  <div className="shrink-0 pt-0.5 opacity-30 group-hover/card:opacity-70 transition-opacity" style={{ color: 'var(--workbench-text-muted)' }}>
                    <GripVertical size={14} />
                  </div>
                )}
                {/* Card content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-1.5 gap-2">
                    <div className="flex items-start gap-1.5 flex-1 min-w-0">
                      <span className={`badge ${card.fact_or_view === 'view' ? 'badge-view' : 'badge-fact'}`}>
                        {card.fact_or_view === 'view' ? 'VIEW' : 'FACT'}
                      </span>
                      <span className="font-semibold text-[12px] leading-snug line-clamp-2" style={{ color: 'var(--workbench-text)' }}>
                        {card.title || '暂未命名'}
                      </span>
                    </div>
                    {card.source_url && (
                      <a
                        href={buildHighlightUrl(card.source_url, card.raw_snippet)}
                        target="_blank" rel="noopener noreferrer"
                        className="opacity-0 group-hover/card:opacity-100 transition-all p-1.5 shrink-0"
                        aria-label="Open original source in a new tab"
                        style={{ color: 'var(--workbench-blue-ink)' }}
                        title="跳转原文"
                        onClick={e => e.stopPropagation()}
                      >
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                  {sourceName && <div className="text-[10px] mb-1.5 truncate" style={{ color: 'var(--workbench-blue-ink)' }}>来源: {sourceName}</div>}
                  <div className="line-clamp-3 text-[11px] font-medium" style={{ color: 'var(--workbench-text-soft)', lineHeight: '1.55' }}>{card.summary || '(无内容)'}</div>
                  {card.raw_snippet && (
                    <details className="mt-2">
                      <summary className="text-[10px] cursor-pointer select-none" style={{ color: 'var(--workbench-text-muted)' }}>查看原文</summary>
                      <div className="mt-1 p-2 rounded text-[11px] max-h-24 overflow-y-auto whitespace-pre-wrap break-words" style={{ background: 'var(--workbench-card-soft)', border: '1px solid var(--workbench-border)', color: 'var(--workbench-text-muted)', lineHeight: '1.55' }}>
                        {card.raw_snippet}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            );
          })}
          {filteredCards.length === 0 && (
            <div className="text-center text-xs py-8" style={{ color: 'var(--workbench-text-muted)' }}>暂无卡片</div>
          )}
        </div>

        {/* Resize handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize transition-colors"
          style={{ background: isResizing ? 'var(--workbench-blue)' : 'transparent' }}
          onMouseDown={handleResizeStart}
        />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // Mode A: Topics list (no topic selected)
  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div
      className={`relative flex flex-col h-full shrink-0 ${className}`}
      style={{ width: `${width}px`, background: 'var(--workbench-panel)', borderRight: '1px solid var(--workbench-border)' }}
    >
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--workbench-border)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--workbench-text)' }}>Topics 话题</h2>
          <button
            onClick={() => setIsCreatingTopic(true)}
            disabled={isCreatingTopic}
            className="btn btn-primary inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors hover:bg-opacity-80 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            style={{ background: 'var(--interactive-primary)', color: 'white' }}
            aria-label="Create topic"
            title="新建 Topic"
          >
            <Plus className="w-4 h-4" />
            新建 Topic
          </button>
        </div>

        {/* Create topic input */}
        {isCreatingTopic && (
          <div className="mb-3 p-3 rounded-lg" style={{ background: 'var(--workbench-card-soft)', border: '1px solid var(--workbench-border)' }}>
            <input
              type="text"
              id="new-topic-title"
              name="new_topic_title"
              aria-label="New topic title"
              value={newTopicTitle}
              onChange={(e) => setNewTopicTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTopic(); else if (e.key === 'Escape') { setNewTopicTitle(''); setIsCreatingTopic(false); } }}
              placeholder="输入 Topic 名称..."
              autoFocus
              disabled={isSubmitting}
              className="input w-full px-3 py-2 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2"
              style={{ background: 'var(--workbench-card)', border: '1px solid var(--workbench-border)', color: 'var(--workbench-text)', '--tw-ring-color': 'var(--interactive-primary)' }}
            />
            <div className="flex items-center gap-2">
              <button onClick={handleCreateTopic} disabled={isSubmitting || !newTopicTitle.trim()} className="btn btn-primary flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded text-sm transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed" style={{ background: 'var(--interactive-primary)', color: 'white' }}>
                <Check className="w-3.5 h-3.5" /> {isSubmitting ? '创建中...' : '创建'}
              </button>
              <button onClick={() => { setNewTopicTitle(''); setIsCreatingTopic(false); }} disabled={isSubmitting} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded text-sm transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed" style={{ background: 'var(--workbench-card-soft)', color: 'var(--workbench-text-soft)', border: '1px solid var(--workbench-border)' }}>
                <X className="w-3.5 h-3.5" /> 取消
              </button>
            </div>
          </div>
        )}

        <input
          type="text"
          id="topics-search"
          name="topics_search"
          aria-label="Search topics"
          value={topicSearchQuery}
          onChange={(e) => setTopicSearchQuery(e.target.value)}
          placeholder="搜索 Topic..."
          className="input w-full px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--workbench-card-soft)', border: '1px solid var(--workbench-border)', color: 'var(--workbench-text)' }}
        />
      </div>

      {/* Topic list */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredTopics.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm" style={{ color: 'var(--workbench-text-muted)' }}>
              {topicSearchQuery.trim() ? '没有搜索到匹配的 Topic' : '暂无 Topic'}
            </p>
          </div>
        ) : (
          filteredTopics.map(topic => {
            const color = getTopicColor(topic.title);
            const isExpanded = expandedTopics.has(topic.id);
            const topicCards = getCardsByTopic(topic.id);

            return (
              <div key={topic.id} className="mb-1 relative">
                {editingTopicId === topic.id ? (
                  <div className="p-2 rounded-lg" style={{ background: 'var(--workbench-card-soft)', border: '1px solid var(--workbench-border)' }}>
                    <input
                      type="text"
                      id={`topic-edit-title-${topic.id}`}
                      name={`topic_edit_title_${topic.id}`}
                      aria-label="Edit topic title"
                      value={editingTopicTitle}
                      onChange={(e) => setEditingTopicTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); else if (e.key === 'Escape') { setEditingTopicId(null); setEditingTopicTitle(''); } }}
                      autoFocus disabled={isSubmitting}
                      className="input w-full px-2 py-1 rounded text-sm mb-2 focus:outline-none focus:ring-2"
                      style={{ background: 'var(--workbench-card)', border: '1px solid var(--workbench-border)', color: 'var(--workbench-text)', '--tw-ring-color': 'var(--interactive-primary)' }}
                    />
                    <div className="flex items-center gap-2">
                      <button onClick={handleSaveEdit} disabled={isSubmitting || !editingTopicTitle.trim()} className="btn btn-primary flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed" style={{ background: 'var(--interactive-primary)', color: 'white' }}>
                        <Check className="w-3 h-3" /> {isSubmitting ? '保存中...' : '保存'}
                      </button>
                      <button onClick={() => { setEditingTopicId(null); setEditingTopicTitle(''); }} disabled={isSubmitting} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed" style={{ background: 'var(--workbench-card-soft)', color: 'var(--workbench-text-soft)', border: '1px solid var(--workbench-border)' }}>
                        <X className="w-3 h-3" /> 取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="relative group">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => onTopicSelect(topic.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onTopicSelect(topic.id);
                          }
                        }}
                        className="w-full flex items-center gap-2 p-2 rounded-lg transition-all hover:bg-opacity-80 cursor-pointer"
                        style={{ background: 'transparent', border: '1px solid transparent' }}
                      >
                        {topicCards.length > 0 && (
                          <button
                            type="button"
                            aria-label="Toggle topic cards"
                            onClick={(e) => { e.stopPropagation(); toggleTopic(topic.id); }}
                            className="shrink-0 p-1.5 hover:bg-opacity-50 rounded cursor-pointer transition-colors"
                          >
                            {isExpanded ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--workbench-text-muted)' }} /> : <ChevronRight className="w-4 h-4" style={{ color: 'var(--workbench-text-muted)' }} />}
                          </button>
                        )}
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color.text }} />
                        <div className="flex-1 text-left min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--workbench-text)' }}>{topic.title}</p>
                            {topic.status && topic.status !== 'active' && (
                              <span className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{
                                background: topic.status === 'investigating' ? 'rgba(251,191,36,0.15)' : topic.status === 'resolved' ? 'rgba(52,211,153,0.15)' : 'var(--bg-muted)',
                                color: topic.status === 'investigating' ? '#F59E0B' : topic.status === 'resolved' ? 'var(--success)' : '#64748B'
                              }}>
                                {topic.status === 'investigating' ? '研究中' : topic.status === 'resolved' ? '已解决' : topic.status === 'archived' ? '已归档' : topic.status}
                              </span>
                            )}
                            {topic.priority === 'critical' && (
                              <span className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--error)' }}>紧急</span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--workbench-card-soft)', color: 'var(--workbench-text-muted)' }}>
                          {topic.card_count || topicCards.length}
                        </span>
                      </div>

                      <button
                        onClick={(e) => { e.stopPropagation(); setShowMenuForTopic(showMenuForTopic === topic.id ? null : topic.id); }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer transition-colors"
                        aria-label="Open topic actions"
                        title="Open topic actions"
                        style={{ background: 'var(--workbench-card)' }}
                      >
                        <MoreVertical className="w-4 h-4" style={{ color: 'var(--workbench-text-muted)' }} />
                      </button>

                      {showMenuForTopic === topic.id && (
                        <div className="absolute right-0 top-full mt-1 z-10 rounded-lg shadow-lg py-1 min-w-[120px]" style={{ background: 'var(--workbench-card)', border: '1px solid var(--workbench-border)' }}>
                          <button onClick={() => { setEditingTopicId(topic.id); setEditingTopicTitle(topic.title); setShowMenuForTopic(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-opacity-80 cursor-pointer" style={{ color: 'var(--workbench-text-soft)' }}>
                            <Edit3 className="w-4 h-4" /> 编辑
                          </button>
                          <button onClick={() => handleDeleteTopic(topic.id, topic.title)} className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-opacity-80 cursor-pointer" style={{ color: 'var(--error)' }}>
                            <Trash2 className="w-4 h-4" /> 删除
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Compact card list (Topics list mode) */}
                    {isExpanded && topicCards.length > 0 && (
                      <div className="ml-6 mt-1 space-y-1">
                        {topicCards.slice(0, 5).map(card => (
                          <button
                            key={card.id}
                            onClick={() => onCardSelect?.(card.id)}
                            className="w-full text-left p-2 rounded text-xs transition-colors hover:bg-opacity-80 cursor-pointer"
                            style={{ background: 'var(--workbench-card-soft)', color: 'var(--workbench-text-soft)' }}
                          >
                            <p className="truncate font-medium mb-1">{card.title || '未命名卡片'}</p>
                            <p style={{ color: 'var(--workbench-text-muted)' }}>
                              {new Date(card.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </button>
                        ))}
                        {topicCards.length > 5 && (
                          <button
                            onClick={() => onTopicSelect(topic.id)}
                            className="w-full text-center text-xs py-2 rounded transition-colors cursor-pointer"
                            style={{ color: 'var(--workbench-blue-ink)' }}
                          >
                            查看全部 {topicCards.length} 张卡片 →
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}

        {/* 未分类卡片 — 兜底分类 */}
        {uncategorizedCards.length > 0 && (
          <div className="mb-1 mt-2 pt-2" style={{ borderTop: '1px solid var(--workbench-border)' }}>
            <div className="relative group">
              <div
                role="button"
                tabIndex={0}
                onClick={() => onTopicSelect('uncategorized')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onTopicSelect('uncategorized');
                  }
                }}
                className="w-full flex items-center gap-2 p-2 rounded-lg transition-all hover:bg-opacity-80 cursor-pointer"
                style={{ background: 'transparent', border: '1px solid transparent' }}
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--workbench-text-muted)' }} />
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--workbench-text-muted)' }}>未分类</p>
                </div>
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--workbench-card-soft)', color: 'var(--workbench-text-muted)' }}>
                  {uncategorizedCards.length}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize transition-colors"
        style={{ background: isResizing ? 'var(--workbench-blue)' : 'transparent' }}
        onMouseDown={handleResizeStart}
      />
    </div>
  );
}

export default TopicsSidebar;
