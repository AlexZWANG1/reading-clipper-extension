import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

const STATE_CONFIG = {
  pending: {
    label: '待验证',
    bg: 'rgba(47,128,255,0.10)',
    color: 'var(--workbench-blue-ink)',
    border: 'rgba(47,128,255,0.28)',
  },
  validated: {
    label: '已验证',
    bg: 'rgba(31,157,103,0.10)',
    color: 'var(--workbench-green)',
    border: 'rgba(31,157,103,0.30)',
  },
  falsified: {
    label: '已证伪',
    bg: 'rgba(195,74,60,0.10)',
    color: 'var(--workbench-red)',
    border: 'rgba(195,74,60,0.30)',
  },
};

function normalizeConfidencePercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 1) return Math.round(Math.max(0, numeric) * 100);
  return Math.round(Math.max(0, Math.min(100, numeric)));
}

function HypothesisNode({ id, data, selected }) {
  const {
    claim,
    hypo_state = 'pending',
    confidence = 0,
    onUpdate,
    onAddSubHypothesis,
    onAddEvidence,
    onDelete,
    isCollapsed,
    onToggleCollapse,
    childCount = 0,
    lod = 'normal',
    dimmed = false,
    compactMode = true,
  } = data;

  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(claim || '');
  const [localConfidence, setLocalConfidence] = useState(normalizeConfidencePercent(confidence));
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef(null);

  const stateStyle = STATE_CONFIG[hypo_state] || STATE_CONFIG.pending;
  const isCompact = compactMode && lod !== 'full';
  const isExpanded = !isCompact || hovered || editing || selected;
  const showConfidenceEditor = lod !== 'mini' && isExpanded;
  const stackedCompact = isCompact && !isExpanded && childCount > 0;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    setLocalConfidence(normalizeConfidencePercent(confidence));
  }, [confidence]);

  const handleSave = () => {
    setEditing(false);
    const nextText = editText.trim();
    if (nextText && nextText !== (claim || '')) {
      onUpdate?.(id, { claim: nextText });
    }
  };

  const handleStateChange = (newState) => {
    onUpdate?.(id, { hypo_state: newState });
  };

  const handleConfidenceCommit = () => {
    const next = Math.max(0, Math.min(100, localConfidence)) / 100;
    onUpdate?.(id, { confidence: next });
  };

  const confidenceColor = localConfidence >= 80
    ? 'var(--workbench-green)'
    : localConfidence >= 40
      ? 'var(--workbench-amber)'
      : 'var(--workbench-text-muted)';

  return (
    <div
      className="relative group w-full h-full flex flex-col"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 12,
        background: 'var(--workbench-card-soft)',
        border: '1px solid var(--workbench-border)',
        borderLeft: '2px solid rgba(47,128,255,0.78)',
        boxShadow: selected ? '0 0 0 2px rgba(47,128,255,0.2)' : '0 4px 13px rgba(30,26,18,0.07)',
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
              background: 'var(--workbench-card-soft)',
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
              background: 'rgba(244,240,232,0.88)',
              border: '1px solid rgba(130,121,106,0.18)',
            }}
          />
        </>
      )}

      <Handle type="target" position={Position.Top} className="neuro-handle" />

      <div className={`flex items-center gap-2 px-3 pt-2.5 ${lod === 'mini' ? 'pb-2.5' : 'mb-1'}`}>
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider shrink-0" style={{ color: 'var(--workbench-blue-ink)' }}>
          H
        </span>
        <select
          id={`hypothesis-state-${id}`}
          name={`hypothesis_state_${id}`}
          value={hypo_state}
          onChange={(e) => handleStateChange(e.target.value)}
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full cursor-pointer appearance-none outline-none border"
          style={{ background: stateStyle.bg, color: stateStyle.color, borderColor: stateStyle.border }}
          title="切换假说状态"
        >
          <option value="pending">待验证</option>
          <option value="validated">已验证</option>
          <option value="falsified">已证伪</option>
        </select>
        <span className="ml-auto text-[10px] font-mono font-semibold tabular-nums shrink-0" style={{ color: confidenceColor }}>
          {localConfidence}%
        </span>
      </div>

      {lod !== 'mini' && (
        <div className="px-3 pb-2.5 flex-1 overflow-hidden flex flex-col">
          {editing ? (
            <textarea
              ref={inputRef}
              id={`hypothesis-claim-${id}`}
              name={`hypothesis_claim_${id}`}
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
                  setEditText(claim || '');
                }
              }}
              className="w-full text-[12.5px] font-medium resize-none rounded p-2 focus:outline-none focus:ring-1"
              style={{
                background: 'var(--workbench-card)',
                color: 'var(--workbench-text)',
                border: '1px solid rgba(47,128,255,0.30)',
                '--tw-ring-color': 'rgba(47,128,255,0.28)',
              }}
              rows={isExpanded ? 3 : 2}
            />
          ) : (
            <div
              className={`text-[12.5px] font-medium cursor-text leading-[1.45] ${isExpanded ? 'line-clamp-3' : 'line-clamp-2'}`}
              style={{ color: 'var(--workbench-text-soft)' }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                setEditing(true);
              }}
              title="双击编辑"
            >
              {claim || '点击输入假说...'}
            </div>
          )}

          {showConfidenceEditor && (
            <div className="mt-2.5 flex items-center gap-2">
              <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--workbench-text-muted)' }}>置信度</span>
              <input
                id={`hypothesis-confidence-${id}`}
                name={`hypothesis_confidence_${id}`}
                type="range"
                min="0"
                max="100"
                step="5"
                value={localConfidence}
                onChange={(e) => setLocalConfidence(Number.parseInt(e.target.value, 10))}
                onMouseUp={handleConfidenceCommit}
                onTouchEnd={handleConfidenceCommit}
                onBlur={handleConfidenceCommit}
                onKeyUp={(e) => {
                  if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key === 'PageUp' || e.key === 'PageDown') {
                    handleConfidenceCommit();
                  }
                }}
                className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer"
                style={{ background: 'rgba(130,121,106,0.24)', accentColor: 'var(--workbench-blue)' }}
              />
            </div>
          )}

          <div
            className={`mt-auto pt-1.5 flex items-center gap-1 ${isExpanded ? 'opacity-95' : 'opacity-0 group-hover:opacity-95 pointer-events-none group-hover:pointer-events-auto'}`}
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
              onClick={() => onAddSubHypothesis?.(id)}
              className="p-1 rounded hover:bg-black/5"
              style={{ color: 'var(--workbench-text-soft)' }}
              title="添加子假说 (H)"
              aria-label="添加子假说"
            >
              <Plus size={13} />
            </button>
            {onAddEvidence && (
              <button
                onClick={() => onAddEvidence(id)}
                className="px-1.5 py-0.5 rounded text-[10px] font-bold hover:bg-black/5"
                style={{ color: 'var(--workbench-text-soft)' }}
                title="添加证据 (F)"
                aria-label="添加证据"
              >
                FACT
              </button>
            )}
            <button
              onClick={() => onDelete?.(id)}
              className="p-1 rounded hover:bg-red-500/10 hover:text-red-500"
              style={{ color: 'var(--workbench-text-soft)' }}
              title="删除"
              aria-label="删除假说节点"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="neuro-handle" />
    </div>
  );
}

export default memo(HypothesisNode);
