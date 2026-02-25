import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';

const STATE_CONFIG = {
    pending: { label: 'PENDING', bg: 'rgba(148,163,184,0.15)', color: 'var(--text-2)' },
    validated: { label: 'VERIFIED', bg: 'rgba(52,211,153,0.15)', color: '#34D399' },
    falsified: { label: 'REFUTED', bg: 'rgba(251,113,133,0.15)', color: '#FB7185' },
};

function HypothesisNode({ id, data }) {
    const {
        claim, hypo_state = 'pending', confidence = 0,
        onUpdate, onAddSubHypothesis, onDelete,
        isCollapsed, onToggleCollapse, childCount = 0,
        lod = 'normal', dimmed = false
    } = data;

    const [editing, setEditing] = useState(false);
    const [editText, setEditText] = useState(claim || '');
    const [localConfidence, setLocalConfidence] = useState(Math.round(confidence * 100));
    const inputRef = useRef(null);

    const stateStyle = STATE_CONFIG[hypo_state] || STATE_CONFIG.pending;

    useEffect(() => {
        if (editing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editing]);

    useEffect(() => {
        setLocalConfidence(Math.round(confidence * 100));
    }, [confidence]);

    const handleSave = () => {
        setEditing(false);
        if (editText.trim() && editText.trim() !== (claim || '')) {
            onUpdate?.(id, { claim: editText.trim() });
        }
    };

    const handleStateChange = (newState) => {
        onUpdate?.(id, { hypo_state: newState });
    };

    const handleConfidenceCommit = () => {
        const val = Math.max(0, Math.min(100, localConfidence)) / 100;
        onUpdate?.(id, { confidence: val });
    };

    const confidenceColor = localConfidence >= 80 ? '#34D399' : localConfidence >= 40 ? '#FBBF24' : 'var(--text-2)';

    return (
        <div
            className="relative group rounded-xl w-full h-full flex flex-col transition-all font-sans"
            style={{
                background: 'var(--surface-0)',
                border: '1px solid var(--stroke-0)',
                borderLeft: '4px solid #A855F7', // Purple for Hypothesis
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                backdropFilter: 'blur(12px)',
                opacity: dimmed ? 0.3 : 1,
                pointerEvents: dimmed ? 'none' : 'auto'
            }}
        >
            {/* Target handle */}
            < Handle type="target" position={Position.Top} className="neuro-handle" />

            {/* Header */}
            < div className={`flex items-center gap-2 px-3 pt-3 ${lod === 'mini' ? 'pb-3' : 'mb-1'}`}>
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider" style={{ color: 'var(--text-0)' }}>HYP</span>
                <select
                    value={hypo_state}
                    onChange={e => handleStateChange(e.target.value)}
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer appearance-none outline-none"
                    style={{ background: stateStyle.bg, color: stateStyle.color, border: 'none' }}
                >
                    <option value="pending">PENDING</option>
                    <option value="validated">VERIFIED</option>
                    <option value="falsified">REFUTED</option>
                </select>
            </div >

            {/* Content & Actions (Hidden in mini LOD) */}
            {
                lod !== 'mini' && (
                    <>
                        {/* Content */}
                        <div className="px-3 pb-3 flex-1 overflow-hidden">
                            {editing ? (
                                <textarea
                                    ref={inputRef}
                                    value={editText}
                                    onChange={e => setEditText(e.target.value)}
                                    onBlur={handleSave}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); } if (e.key === 'Escape') { setEditing(false); setEditText(claim || ''); } }}
                                    className="w-full text-[13px] font-medium resize-none rounded p-2 focus:outline-none focus:ring-1"
                                    style={{
                                        background: 'var(--bg-0)',
                                        color: 'var(--text-0)',
                                        border: '1px solid var(--accent-500)',
                                    }}
                                    rows={2}
                                />
                            ) : (
                                <div
                                    className={`text-[13px] font-medium cursor-text leading-[1.6] ${lod === 'normal' ? 'line-clamp-4' : ''}`}
                                    style={{ color: 'var(--text-0)' }}
                                    onDoubleClick={() => setEditing(true)}
                                    title="双击编辑"
                                >
                                    {claim || '点击输入假说...'}
                                </div>
                            )}

                            {/* Confidence Slider */}
                            <div className="mt-3 flex items-center gap-2">
                                <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--text-1)' }}>CONFIDENCE</span>
                                <input
                                    type="range"
                                    min="0" max="100" step="5" value={localConfidence}
                                    onChange={e => setLocalConfidence(parseInt(e.target.value))}
                                    onMouseUp={handleConfidenceCommit}
                                    onTouchEnd={handleConfidenceCommit}
                                    className="flex-1 h-1 rounded-lg appearance-none cursor-pointer"
                                    style={{ background: 'rgba(0,0,0,0.3)', accentColor: 'var(--accent-500)' }}
                                />
                                <span className="text-[10px] font-mono font-bold w-8 text-right" style={{ color: confidenceColor }}>{localConfidence}%</span>
                            </div>
                        </div>

                        {/* Actions */}
                        <div
                            className="flex items-center gap-1 px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity rounded-b-xl"
                            style={{ borderTop: '1px solid var(--stroke-0)', background: 'var(--surface-1)' }}
                        >
                            {onToggleCollapse && childCount > 0 && (
                                <button onClick={() => onToggleCollapse(id)} className="p-1 rounded transition-colors hover:bg-black/5 flex items-center gap-0.5" style={{ color: 'var(--text-1)' }} title="折叠/展开">
                                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                    <span className="text-[10px] font-mono">{childCount}</span>
                                </button>
                            )}
                            <div className="flex-1" />
                            <button onClick={() => onAddSubHypothesis?.(id)} className="p-1 rounded transition-colors hover:bg-black/5" style={{ color: 'var(--text-1)' }} title="添加子假说">
                                <Plus size={14} />
                            </button>
                            <button onClick={() => onDelete?.(id)} className="p-1 rounded transition-colors hover:bg-red-500/10 hover:text-red-500" style={{ color: 'var(--text-1)' }} title="删除">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </>
                )
            }

            {/* Source handle */}
            <Handle type="source" position={Position.Bottom} className="neuro-handle" />
        </div >
    );
}

export default memo(HypothesisNode);
