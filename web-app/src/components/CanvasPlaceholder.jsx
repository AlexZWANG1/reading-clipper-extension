import { useState } from 'react';
import { ChevronLeft, ChevronRight, Network } from 'lucide-react';
import BoardDocPanel from './BoardDocPanel';

function CanvasPlaceholder({
  topicId = null,
  topic   = null,
  width = 400,
  onWidthChange,
  isOpen = true,
  onToggle,
  className = '',
}) {
  const [isResizing, setIsResizing] = useState(false);

  // ── Drag-resize handle ─────────────────────────────────────────────────────
  const handleResizeStart = (e) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = width;
    const onMove = (ev) => {
      const delta = startX - ev.clientX;
      onWidthChange?.(Math.max(280, Math.min(600, startWidth + delta)));
    };
    const onUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // ── Collapsed strip ────────────────────────────────────────────────────────
  if (!isOpen) {
    return (
      <div
        className={`flex flex-col items-center py-4 gap-3 ${className}`}
        style={{
          width: '44px',
          background: 'var(--surface-1)',
          borderLeft: '1px solid var(--stroke-0)',
        }}
      >
        <button
          onClick={() => onToggle?.(true)}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--text-2)' }}
          title="展开假说文档"
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-1)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-2)'}
        >
          <ChevronLeft size={16} />
        </button>
        <span
          className="text-xs font-medium select-none"
          style={{
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            color: 'var(--text-2)',
            letterSpacing: '0.08em',
          }}
        >
          假说文档
        </span>
      </div>
    );
  }

  // ── No topic selected — idle state ─────────────────────────────────────────
  const idleState = (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
      <svg width="48" height="40" viewBox="0 0 48 40" fill="none" opacity="0.4">
        <rect x="10" y="2"  width="28" height="5" rx="2.5" fill="currentColor" style={{ color: 'var(--text-2)' }}/>
        <rect x="14" y="12" width="24" height="3" rx="1.5" fill="currentColor" style={{ color: 'var(--text-2)' }} opacity="0.6"/>
        <rect x="14" y="20" width="20" height="3" rx="1.5" fill="currentColor" style={{ color: 'var(--text-2)' }} opacity="0.4"/>
        <rect x="14" y="28" width="16" height="3" rx="1.5" fill="currentColor" style={{ color: 'var(--text-2)' }} opacity="0.25"/>
      </svg>
      <div className="text-center">
        <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-1)' }}>假说文档</p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
          选择左侧 Topic<br />查看结构化假说大纲
        </p>
      </div>
    </div>
  );

  return (
    <div
      className={`relative flex flex-col h-full shrink-0 ${className}`}
      style={{
        width: `${width}px`,
        background: 'var(--surface-1)',
        borderLeft: '1px solid var(--stroke-0)',
      }}
    >
      {/* ── Panel header ──────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--stroke-0)',
          minHeight: '48px',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Network size={15} style={{ color: 'var(--accent-400)', flexShrink: 0 }} />
          <span
            className="text-sm font-semibold truncate"
            style={{ color: 'var(--text-0)', letterSpacing: '-0.01em' }}
          >
            {topic?.title ? `${topic.title} · 假说` : '假说文档'}
          </span>
        </div>
        <button
          onClick={() => onToggle?.(false)}
          className="p-1.5 rounded-lg transition-colors shrink-0 ml-2"
          title="折叠"
          style={{ color: 'var(--text-2)' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-0)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-2)'}
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* ── Document content ──────────────────────────────────────────────── */}
      {topicId ? (
        <BoardDocPanel topicId={topicId} topic={topic} />
      ) : (
        idleState
      )}

      {/* ── Drag-resize handle ─────────────────────────────────────────────── */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize transition-colors"
        style={{ background: isResizing ? 'var(--accent-500)' : 'transparent' }}
        onMouseDown={handleResizeStart}
        onMouseEnter={e => { if (!isResizing) e.currentTarget.style.background = 'rgba(99,102,241,0.25)'; }}
        onMouseLeave={e => { if (!isResizing) e.currentTarget.style.background = 'transparent'; }}
      />
    </div>
  );
}

export default CanvasPlaceholder;
