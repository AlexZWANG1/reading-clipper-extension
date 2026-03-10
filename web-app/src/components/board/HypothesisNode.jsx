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

function HypothesisNode({ id, data }) {
  const {
    claim,
    hypo_state = 'pending',
    confidence = 0,
    onUpdate,
    onAddSubHypothesis,
    onDelete,
    isCollapsed,
    onToggleCollapse,
    childCount = 0,
    lod = 'normal',
    dimmed = false,
  } = data;

  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(claim || '');
  const [localConfidence, setLocalConfidence] = useState(normalizeConfidencePercent(confidence));
  const inputRef = useRef(null);

  const stateStyle = STATE_CONFIG[hypo_state] || STATE_CONFIG.pending;

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
      className="relative group w-full h-full flex flex-col transition-all"
      style={{
        borderRadius: 13,
        background: 'var(--workbench-card-soft)',
        border: '1px solid var(--workbench-border)',
        borderLeft: '3px solid rgba(47,128,255,0.78)',
        boxShadow: '0 4px 13px rgba(30,26,18,0.07)',
        opacity: dimmed ? 0.3 : 1,
        pointerEvents: dimmed ? 'none' : 'auto',
      }}
    >
      <Handle type="target" position={Position.Top} className="neuro-handle" />

      <div className={`flex items-center gap-2 px-3 pt-3 ${lod === 'mini' ? 'pb-3' : 'mb-1'}`}>
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color: 'var(--workbench-blue-ink)' }}>
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
      </div>

      {lod !== 'mini' && (
        <>
          <div className="px-3 pb-3 flex-1 overflow-hidden">
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
                className="w-full text-[13px] font-medium resize-none rounded p-2 focus:outline-none focus:ring-1"
                style={{
                  background: 'var(--workbench-card)',
                  color: 'var(--workbench-text)',
                  border: '1px solid rgba(47,128,255,0.30)',
                  '--tw-ring-color': 'rgba(47,128,255,0.28)',
                }}
                rows={2}
              />
            ) : (
              <div
                className={`text-[12.5px] font-medium cursor-text leading-[1.58] ${lod === 'normal' ? 'line-clamp-4' : ''}`}
                style={{ color: 'var(--workbench-text-soft)' }}
                onDoubleClick={() => setEditing(true)}
                title="双击编辑"
              >
                {claim || '点击输入假说...'}
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
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
              <span className="text-[10px] font-mono font-bold w-8 text-right" style={{ color: confidenceColor }}>
                {localConfidence}%
              </span>
            </div>
          </div>

          <div
            className="flex items-center gap-1 px-2 py-1.5 opacity-90 group-hover:opacity-100 transition-opacity rounded-b-[13px]"
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
              onClick={() => onAddSubHypothesis?.(id)}
              className="p-1 rounded transition-colors hover:bg-black/5"
              style={{ color: 'var(--workbench-text-soft)' }}
              title="添加子假说"
              aria-label="添加子假说"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={() => onDelete?.(id)}
              className="p-1 rounded transition-colors hover:bg-red-500/10 hover:text-red-500"
              style={{ color: 'var(--workbench-text-soft)' }}
              title="删除"
              aria-label="删除假说节点"
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

export default memo(HypothesisNode);
