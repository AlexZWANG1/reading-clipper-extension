import { useState, useEffect } from 'react';
import { X, Link } from 'lucide-react';
import { boardsApi } from '../lib/api';

export default function EvidenceSuggestionToast({ suggestion, cardId, topicTitle, onDismiss }) {
  const [linking, setLinking] = useState(false);
  const [visible, setVisible] = useState(true);

  // Auto-dismiss after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, 10000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible || !suggestion) return null;

  const handleLink = async () => {
    setLinking(true);
    try {
      await boardsApi.quickLink(
        suggestion.board_id,
        cardId,
        suggestion.hypothesis_id,
        'supports'
      );
      setVisible(false);
      onDismiss?.();
    } catch (err) {
      console.error('Quick link failed:', err);
    } finally {
      setLinking(false);
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    onDismiss?.();
  };

  return (
    <div
      className="fixed bottom-20 right-6 z-[60] w-80 rounded-lg shadow-xl p-4 animate-slide-up"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--ai-accent)',
      }}
    >
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 rounded transition-colors"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <X size={12} />
      </button>

      <div className="text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
        卡片已保存到「{topicTitle}」
      </div>

      <div className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
        可能与假说相关：
      </div>

      <div className="text-xs font-medium mb-3" style={{ color: 'var(--ai-accent)' }}>
        「{suggestion.hypothesis_text}」
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleLink}
          disabled={linking}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-white rounded-md disabled:opacity-50 transition-colors"
          style={{ background: 'var(--ai-accent)' }}
        >
          <Link size={12} />
          链接为证据
        </button>
        <button
          onClick={handleDismiss}
          className="px-3 py-1.5 text-xs rounded-md transition-colors"
          style={{ color: 'var(--text-tertiary)', background: 'var(--bg-muted)' }}
        >
          忽略
        </button>
      </div>
    </div>
  );
}
