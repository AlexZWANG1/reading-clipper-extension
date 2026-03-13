import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { getTopicColor } from '../lib/ui-utils';

// 时间格式化工具函数
function formatRelativeTime(date) {
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function TopicTimeline({ cards, selectedTopic, onTopicClick, className }) {
  // 计算每个 Topic 的最新活动时间和卡片数量
  const topicsWithActivity = useMemo(() => {
    const topicMap = new Map();

    cards.forEach(card => {
      if (card.topic_title) {
        const existing = topicMap.get(card.topic_title);
        const cardTime = new Date(card.created_at);

        if (!existing) {
          topicMap.set(card.topic_title, {
            title: card.topic_title,
            lastActivity: cardTime,
            cardCount: 1,
          });
        } else {
          existing.cardCount += 1;
          if (cardTime > existing.lastActivity) {
            existing.lastActivity = cardTime;
          }
        }
      }
    });

    return Array.from(topicMap.values())
      .sort((a, b) => b.lastActivity - a.lastActivity)
      .slice(0, 15); // 只显示最近 15 个
  }, [cards]);

  if (topicsWithActivity.length === 0) {
    return (
      <div
        className={`w-72 flex flex-col h-full shrink-0 overflow-y-auto ${className}`}
        style={{ background: 'var(--surface-1)', borderLeft: '1px solid var(--stroke-0)' }}
      >
        <div className="p-4 sticky top-0 z-10" style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--stroke-1)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-0)' }}>
            最近活动
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
            按时间排序的 Topic
          </p>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: 'var(--text-2)' }} />
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>暂无 Topic 活动</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`w-72 flex flex-col h-full shrink-0 overflow-y-auto ${className}`}
      style={{ background: 'var(--surface-1)', borderLeft: '1px solid var(--stroke-0)' }}
    >
      <div className="p-4 sticky top-0 z-10" style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--stroke-1)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-0)' }}>
          最近活动
        </h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
          按时间排序的 Topic
        </p>
      </div>

      <div className="p-3 space-y-2">
        {topicsWithActivity.map((topic) => {
          const color = getTopicColor(topic.title);
          const isSelected = selectedTopic === topic.title;

          return (
            <button
              key={topic.title}
              onClick={() => onTopicClick(topic.title)}
              className="w-full flex items-start gap-3 p-3 rounded-lg transition-all hover:scale-[1.02]"
              style={{
                background: isSelected ? color.bg : 'var(--surface-0)',
                border: isSelected ? `1px solid ${color.border}` : '1px solid var(--stroke-0)',
              }}
            >
              {/* 彩色圆点 */}
              <div
                className="w-2 h-2 rounded-full mt-1.5 shrink-0"
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
                <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: 'var(--text-2)' }}>
                  <span>{topic.cardCount} 张卡片</span>
                  <span>·</span>
                  <span>{formatRelativeTime(topic.lastActivity)}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default TopicTimeline;
