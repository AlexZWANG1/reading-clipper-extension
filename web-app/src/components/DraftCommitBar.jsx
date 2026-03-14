import { useState } from 'react';
import { Check, X, Eye } from 'lucide-react';

export default function DraftCommitBar({ draft, onCommitAll, onRejectAll, onReview }) {
  const [committing, setCommitting] = useState(false);

  if (!draft) return null;

  const changeCount = draft.changes?.length || 0;

  const handleCommitAll = async () => {
    setCommitting(true);
    try {
      await onCommitAll(draft.id);
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div
      className="absolute top-3 left-1/2 -translate-x-1/2 z-20 rounded-lg shadow-lg px-4 py-2 flex items-center gap-3"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--ai-accent)',
        color: 'var(--text-primary)',
      }}
    >
      <span className="text-sm">
        AI 建议了 <strong>{changeCount}</strong> 个更改
      </span>
      <button
        onClick={handleCommitAll}
        disabled={committing}
        className="px-3 py-1 text-xs text-white rounded-md disabled:opacity-50 transition-colors"
        style={{ background: 'var(--success)' }}
      >
        <Check size={12} className="inline mr-1" />
        全部接受
      </button>
      <button
        onClick={() => onReview(draft.id)}
        className="px-3 py-1 text-xs rounded-md transition-colors"
        style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}
      >
        <Eye size={12} className="inline mr-1" />
        逐个审核
      </button>
      <button
        onClick={() => onRejectAll(draft.id)}
        className="px-3 py-1 text-xs rounded-md transition-colors"
        style={{ background: 'var(--error-subtle)', color: 'var(--error)' }}
      >
        <X size={12} className="inline mr-1" />
        全部拒绝
      </button>
    </div>
  );
}
