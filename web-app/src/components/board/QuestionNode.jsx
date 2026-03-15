import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Plus, ChevronDown, ChevronRight, Trash2, MessageSquare } from 'lucide-react';
import AnimatedNodeWrapper from './AnimatedNodeWrapper';

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

function QuestionNode({ id, data, selected }) {
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
    compactMode = true,
    animationState,
    onAnimationEnd,
  } = data;

  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(content?.text || '');
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef(null);

  const statusStyle = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  const isRootQuestion = priority === 'critical' || priority === 'high';
  const isCompact = compactMode && lod !== 'full';
  const isExpanded = !isCompact || hovered || editing || selected;
  const showActions = lod !== 'mini' && isExpanded;
  const stackedCompact = isCompact && !isExpanded && childCount > 0;

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
    <AnimatedNodeWrapper animationState={animationState} onAnimationEnd={onAnimationEnd}>
    <div
      className="relative group w-full h-full flex flex-col"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 12,
        background: 'var(--workbench-card)',
        border: `1px solid ${isRootQuestion ? 'var(--workbench-border-strong)' : 'var(--workbench-border)'}`,
        borderTop: `2px solid ${isRootQuestion ? 'var(--workbench-blue)' : 'rgba(47,128,255,0.48)'}`,
        boxShadow: selected ? '0 0 0 2px rgba(47,128,255,0.2)' : 'var(--workbench-shadow-node)',
        opacity: dimmed ? 0.3 : 1,
      }}
    >
      {stackedCompact && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              zIndex: -1,
              left: 4,
              right: 4,
              top: 4,
              bottom: -4,
              borderRadius: 11,
              background: 'var(--workbench-card)',
              border: '1px solid rgba(130,121,106,0.24)',
              boxShadow: '0 4px 10px rgba(30,26,18,0.06)',
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              zIndex: -2,
              left: 8,
              right: 8,
              top: 8,
              bottom: -8,
              borderRadius: 10,
              background: 'rgba(247,243,235,0.9)',
              border: '1px solid rgba(130,121,106,0.18)',
            }}
          />
        </>
      )}

      <Handle type="target" position={Position.Top} className="neuro-handle" />

      <div className={`flex items-center gap-2 px-3 ${showActions ? 'pt-2.5' : 'pt-2'} ${lod === 'mini' ? 'pb-2' : 'mb-1'}`}>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color: 'var(--workbench-blue-ink)' }}>
            {isRootQuestion ? 'Q1' : 'Q'}
          </span>
          {priority === 'critical' && (
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--error)' }} title="关键问题" />
          )}
        </div>
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border shrink-0"
          style={{ background: statusStyle.bg, color: statusStyle.color, borderColor: statusStyle.border }}
        >
          {statusStyle.label}
        </span>
      </div>

      {lod !== 'mini' && (
        <div className="px-3 pb-2.5 flex-1 overflow-hidden flex flex-col">
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
              className="w-full text-[12.5px] font-medium resize-none rounded p-2 focus:outline-none focus:ring-1"
              style={{
                background: 'var(--workbench-card-soft)',
                color: 'var(--workbench-text)',
                border: '1px solid rgba(47,128,255,0.34)',
                '--tw-ring-color': 'rgba(47,128,255,0.32)',
              }}
              rows={isExpanded ? 3 : 2}
            />
          ) : (
            <div
              className={`${isRootQuestion ? 'text-[13px] font-semibold' : 'text-[12.5px] font-medium'} cursor-text leading-[1.45] ${isExpanded ? 'line-clamp-3' : 'line-clamp-2'}`}
              style={{ color: 'var(--workbench-text)' }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                setEditing(true);
              }}
              title="双击编辑"
            >
              {content?.text || '点击输入问题...'}
            </div>
          )}

          {showActions && (
            <div
              className="mt-auto pt-1.5 flex items-center gap-1 opacity-90 group-hover:opacity-100"
              style={{ borderTop: '1px solid var(--workbench-border)' }}
            >
              {onToggleCollapse && childCount > 0 && (
                <button
                  onClick={() => onToggleCollapse(id)}
                  className="p-1 rounded flex items-center gap-0.5 hover:bg-black/5"
                  style={{ color: 'var(--workbench-text-soft)' }}
                  title="折叠/展开"
                  aria-label="折叠或展开子节点"
                >
                  {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  <span className="text-[10px] font-mono">{childCount}</span>
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={() => onAddSubQuestion?.(id)}
                className="p-1 rounded hover:bg-black/5"
                style={{ color: 'var(--workbench-text-soft)' }}
                title="添加子问题 (Q)"
                aria-label="添加子问题"
              >
                <Plus size={13} />
              </button>
              <button
                onClick={() => onAddHypothesis?.(id)}
                className="p-1 rounded hover:bg-black/5"
                style={{ color: 'var(--workbench-text-soft)' }}
                title="添加假说 (H)"
                aria-label="添加假说"
              >
                <MessageSquare size={13} />
              </button>
              <button
                onClick={() => onDelete?.(id)}
                className="p-1 rounded hover:bg-red-500/10 hover:text-red-500"
                style={{ color: 'var(--workbench-text-soft)' }}
                title="删除"
                aria-label="删除节点"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="neuro-handle" />
    </div>
    </AnimatedNodeWrapper>
  );
}

export default memo(QuestionNode);
