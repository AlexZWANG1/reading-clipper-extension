import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Plus, ChevronDown, ChevronRight, Trash2, MessageSquare } from 'lucide-react';

const STATUS_CONFIG = {
  open: {
    label: '探索中',
    bg: 'rgba(47,128,255,0.10)',
    color: 'var(--workbench-blue-ink)',
    border: 'rgba(47,128,255,0.28)',
  },
  resolved: {
    label: '已解决',
    bg: 'rgba(31,157,103,0.10)',
    color: 'var(--workbench-green)',
    border: 'rgba(31,157,103,0.30)',
  },
  blocked: {
    label: '受阻',
    bg: 'rgba(183,121,35,0.10)',
    color: 'var(--workbench-amber)',
    border: 'rgba(183,121,35,0.30)',
  },
};

function QuestionNode({ id, data }) {
  const {
    content,
    priority = 'normal',
    status = 'open',
    onUpdate,
    onAddSubQuestion,
    onAddHypothesis,
    onDelete,
    isCollapsed,
    onToggleCollapse,
    childCount = 0,
    lod = 'normal',
    dimmed = false,
  } = data;

  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(content?.text || '');
  const inputRef = useRef(null);

  const statusStyle = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  const isRootQuestion = priority === 'critical' || priority === 'high';

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    setEditing(false);
    const nextText = editText.trim();
    if (nextText && nextText !== (content?.text || '')) {
      onUpdate?.(id, { content: { ...content, text: nextText } });
    }
  };

  return (
    <div
      className="relative group w-full h-full flex flex-col transition-all"
      style={{
        borderRadius: 14,
        background: 'var(--workbench-card)',
        border: `1px solid ${isRootQuestion ? 'var(--workbench-border-strong)' : 'var(--workbench-border)'}`,
        borderTop: `3px solid ${isRootQuestion ? 'var(--workbench-blue)' : 'rgba(47,128,255,0.48)'}`,
        boxShadow: isRootQuestion ? '0 10px 26px rgba(30,26,18,0.11)' : 'var(--workbench-shadow-node)',
        opacity: dimmed ? 0.3 : 1,
        pointerEvents: dimmed ? 'none' : 'auto',
      }}
    >
      <Handle type="target" position={Position.Top} className="neuro-handle" />

      <div className={`flex items-center gap-2 px-3 pt-3 ${lod === 'mini' ? 'pb-3' : 'mb-1'}`}>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider" style={{ color: 'var(--workbench-blue-ink)' }}>
            {isRootQuestion ? 'Q1' : 'Q'}
          </span>
          {priority === 'critical' && (
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--error)' }} title="关键问题" />
          )}
        </div>
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border"
          style={{ background: statusStyle.bg, color: statusStyle.color, borderColor: statusStyle.border }}
        >
          {statusStyle.label}
        </span>
      </div>

      {lod !== 'mini' && (
        <>
          <div className="px-3 pb-3 flex-1 overflow-hidden">
            {editing ? (
              <textarea
                ref={inputRef}
                id={`question-content-${id}`}
                name={`question_content_${id}`}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={handleSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSave();
                  }
                  if (e.key === 'Escape') {
                    setEditing(false);
                    setEditText(content?.text || '');
                  }
                }}
                className="w-full text-[13px] font-medium resize-none rounded p-2 focus:outline-none focus:ring-1"
                style={{
                  background: 'var(--workbench-card-soft)',
                  color: 'var(--workbench-text)',
                  border: '1px solid rgba(47,128,255,0.34)',
                  '--tw-ring-color': 'rgba(47,128,255,0.32)',
                }}
                rows={2}
              />
            ) : (
              <div
                className={`${isRootQuestion ? 'text-[14px] font-semibold' : 'text-[13px] font-medium'} cursor-text leading-[1.6] ${lod === 'normal' ? 'line-clamp-4' : ''}`}
                style={{ color: 'var(--workbench-text)' }}
                onDoubleClick={() => setEditing(true)}
                title="双击编辑"
              >
                {content?.text || '点击输入问题...'}
              </div>
            )}
          </div>

          <div
            className="flex items-center gap-1 px-2 py-1.5 opacity-90 group-hover:opacity-100 transition-opacity rounded-b-[14px]"
            style={{ borderTop: '1px solid var(--workbench-border)', background: 'rgba(130,121,106,0.05)' }}
          >
            {onToggleCollapse && childCount > 0 && (
              <button
                onClick={() => onToggleCollapse(id)}
                className="p-1 rounded transition-colors flex items-center gap-0.5 hover:bg-black/5"
                style={{ color: 'var(--workbench-text-soft)' }}
                title="折叠/展开"
                aria-label="折叠或展开子节点"
              >
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                <span className="text-[10px] font-mono">{childCount}</span>
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={() => onAddSubQuestion?.(id)}
              className="p-1 rounded transition-colors hover:bg-black/5"
              style={{ color: 'var(--workbench-text-soft)' }}
              title="添加子问题"
              aria-label="添加子问题"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={() => onAddHypothesis?.(id)}
              className="p-1 rounded transition-colors hover:bg-black/5"
              style={{ color: 'var(--workbench-text-soft)' }}
              title="添加假说"
              aria-label="添加假说"
            >
              <MessageSquare size={14} />
            </button>
            <button
              onClick={() => onDelete?.(id)}
              className="p-1 rounded transition-colors hover:bg-red-500/10 hover:text-red-500"
              style={{ color: 'var(--workbench-text-soft)' }}
              title="删除"
              aria-label="删除节点"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </>
      )}

      <Handle type="source" position={Position.Bottom} className="neuro-handle" />
    </div>
  );
}

export default memo(QuestionNode);
