import { useState, useEffect } from 'react';
import { Plus, ChevronRight, ChevronDown } from 'lucide-react';

// Topic 颜色系统（与 CardsPage 保持一致）
const TOPIC_COLORS = [
  { bg: 'rgba(99,102,241,0.12)', text: '#6366F1', border: 'rgba(99,102,241,0.3)' },
  { bg: 'rgba(52,211,153,0.12)', text: '#34D399', border: 'rgba(52,211,153,0.3)' },
  { bg: 'rgba(251,191,36,0.12)', text: '#FBBF24', border: 'rgba(251,191,36,0.3)' },
  { bg: 'rgba(251,113,133,0.12)', text: '#FB7185', border: 'rgba(251,113,133,0.3)' },
  { bg: 'rgba(34,211,238,0.12)', text: '#22D3EE', border: 'rgba(34,211,238,0.3)' },
  { bg: 'rgba(167,139,250,0.12)', text: '#A78BFA', border: 'rgba(167,139,250,0.3)' },
  { bg: 'rgba(248,113,113,0.12)', text: '#F87171', border: 'rgba(248,113,113,0.3)' },
  { bg: 'rgba(74,222,128,0.12)', text: '#4ADE80', border: 'rgba(74,222,128,0.3)' },
  { bg: 'rgba(251,146,60,0.12)', text: '#FB923C', border: 'rgba(251,146,60,0.3)' },
  { bg: 'rgba(147,197,253,0.12)', text: '#93C5FD', border: 'rgba(147,197,253,0.3)' },
];

function getTopicColor(topicTitle) {
  if (!topicTitle) return TOPIC_COLORS[0];
  const hash = topicTitle.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return TOPIC_COLORS[hash % TOPIC_COLORS.length];
}

function TopicsSidebar({
  width = 280,
  onWidthChange,
  topics = [],
  selectedTopic,
  onTopicSelect,
  cards = [],
  onCardSelect,
  className = ''
}) {
  const [expandedTopics, setExpandedTopics] = useState(new Set());
  const [isResizing, setIsResizing] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // 默认展开所有有卡片的 Topic
  useEffect(() => {
    if (!initialized && topics.length > 0) {
      const topicsWithCards = new Set(
        topics.filter(topic => {
          const topicCards = cards.filter(card => card.topic_id === topic.id);
          return topicCards.length > 0;
        }).map(topic => topic.id)
      );
      setExpandedTopics(topicsWithCards);
      setInitialized(true);
    }
  }, [topics, cards, initialized]);

  // 切换 Topic 展开/折叠
  const toggleTopic = (topicId) => {
    setExpandedTopics(prev => {
      const next = new Set(prev);
      if (next.has(topicId)) {
        next.delete(topicId);
      } else {
        next.add(topicId);
      }
      return next;
    });
  };

  // 拖拽调整宽度
  const handleResizeStart = (e) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (e) => {
      const delta = e.clientX - startX;
      const newWidth = Math.max(200, Math.min(400, startWidth + delta));
      onWidthChange?.(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // 获取 Topic 下的卡片
  const getCardsByTopic = (topicId) => {
    return cards
      .filter(card => card.topic_id === topicId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  };

  return (
    <div
      className={`relative flex flex-col h-full shrink-0 ${className}`}
      style={{
        width: `${width}px`,
        background: 'var(--surface-1)',
        borderRight: '1px solid var(--stroke-0)'
      }}
    >
      {/* 顶部：标题和新建按钮 */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--stroke-0)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-0)' }}>
            Topics
          </h2>
          <button
            className="p-1.5 rounded-lg transition-colors hover:bg-opacity-80"
            style={{ background: 'var(--accent-500)', color: 'white' }}
            title="新建 Topic"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <input
          type="text"
          placeholder="搜索 Topic..."
          className="w-full px-3 py-2 rounded-lg text-sm"
          style={{
            background: 'var(--bg-0)',
            border: '1px solid var(--stroke-0)',
            color: 'var(--text-0)'
          }}
        />
      </div>

      {/* Topic 列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {topics.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
              暂无 Topic
            </p>
          </div>
        ) : (
          topics.map(topic => {
            const color = getTopicColor(topic.title);
            const isExpanded = expandedTopics.has(topic.id);
            const isSelected = selectedTopic === topic.id;
            const topicCards = getCardsByTopic(topic.id);

            return (
              <div key={topic.id} className="mb-1">
                {/* Topic 项 */}
                <button
                  onClick={() => onTopicSelect(topic.id)}
                  className="w-full flex items-center gap-2 p-2 rounded-lg transition-all hover:bg-opacity-80"
                  style={{
                    background: isSelected ? color.bg : 'transparent',
                    border: isSelected ? `1px solid ${color.border}` : '1px solid transparent'
                  }}
                >
                  {/* 展开/折叠图标 */}
                  {topicCards.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTopic(topic.id);
                      }}
                      className="shrink-0 p-0.5 hover:bg-opacity-50 rounded"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-2)' }} />
                      ) : (
                        <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-2)' }} />
                      )}
                    </button>
                  )}

                  {/* 彩色圆点 */}
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: color.text }}
                  />

                  {/* Topic 信息 */}
                  <div className="flex-1 text-left min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: isSelected ? color.text : 'var(--text-0)' }}
                    >
                      {topic.title}
                    </p>
                  </div>

                  {/* 卡片数量 */}
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      background: 'var(--bg-0)',
                      color: 'var(--text-2)'
                    }}
                  >
                    {topic.card_count || topicCards.length}
                  </span>
                </button>

                {/* 卡片时间轴（展开时显示）*/}
                {isExpanded && topicCards.length > 0 && (
                  <div className="ml-6 mt-1 space-y-1">
                    {topicCards.map(card => (
                      <button
                        key={card.id}
                        onClick={() => onCardSelect?.(card.id)}
                        className="w-full text-left p-2 rounded text-xs transition-colors hover:bg-opacity-80"
                        style={{
                          background: 'var(--bg-0)',
                          color: 'var(--text-1)'
                        }}
                      >
                        <p className="truncate font-medium mb-1">
                          {card.title || '未命名卡片'}
                        </p>
                        <p style={{ color: 'var(--text-2)' }}>
                          {new Date(card.created_at).toLocaleString('zh-CN', {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 拖拽调整宽度的手柄 */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-opacity-50 transition-colors"
        style={{
          background: isResizing ? 'var(--accent-500)' : 'transparent'
        }}
        onMouseDown={handleResizeStart}
      />
    </div>
  );
}

export default TopicsSidebar;
