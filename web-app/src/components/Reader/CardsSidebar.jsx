import { useEffect, useState, useRef } from 'react';
import { BookOpen, ChevronRight, Loader2 } from 'lucide-react';
import { cardsApi } from '../../lib/api';

/**
 * CardsSidebar — 右侧展示当前 material 的关联卡片
 * Props:
 *   materialId: string
 *   onCardClick: fn(card) — 点击卡片时，通知 Reader 高亮对应原文
 *   refreshSignal: any — 值变化时触发重新加载（新建卡片后通知）
 */
export default function CardsSidebar({ materialId, onCardClick, refreshSignal }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!materialId) return;
    loadCards();
  }, [materialId, refreshSignal]);

  const loadCards = async () => {
    try {
      setLoading(true);
      const response = await cardsApi.list({ material_id: materialId, limit: 100 });
      setCards(response.cards || response.data || []);
    } catch (err) {
      console.error('Failed to load cards:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-gray-50">
        <BookOpen className="w-4 h-4 text-indigo-600" />
        <span className="text-sm font-medium text-gray-700">关联卡片</span>
        {cards.length > 0 && (
          <span className="ml-auto text-xs text-gray-500">{cards.length} 张</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center py-10 px-4">
            <BookOpen className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-xs text-gray-400">暂无关联卡片</p>
            <p className="text-xs text-gray-400 mt-1">划线选中文字即可建卡</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {cards.map(card => (
              <CardItem key={card.id} card={card} onClick={() => onCardClick?.(card)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CardItem({ card, onClick }) {
  const title = card.title || '未命名卡片';

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 hover:bg-indigo-50 transition-colors group"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-indigo-700 line-clamp-2 mb-1.5">
            {title}
          </p>
          {card.summary && (
            <p className="text-sm text-gray-800 line-clamp-2 leading-snug">
              {card.summary}
            </p>
          )}
          {card.raw_snippet && !card.summary && (
            <p className="text-sm text-gray-600 line-clamp-2 leading-snug italic">
              "{card.raw_snippet}"
            </p>
          )}
          {card.raw_snippet && card.summary && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-1 italic">
              "{card.raw_snippet}"
            </p>
          )}
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-indigo-400 flex-shrink-0 mt-0.5" />
      </div>
    </button>
  );
}
