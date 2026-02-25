import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Plus, ChevronDown, ChevronRight, Trash2, MessageSquare } from 'lucide-react';

const STATUS_CONFIG = {
    open: { label: '探索中', bg: 'rgba(99,102,241,0.15)', color: 'var(--accent-300)' },
    resolved: { label: '已解决', bg: 'rgba(52,211,153,0.15)', color: '#34D399' },
    blocked: { label: '卡住', bg: 'rgba(251,191,36,0.15)', color: '#FBBF24' },
};

function QuestionNode({ id, data }) {
    const {
        content, priority = 'normal', status = 'open',
        onUpdate, onAddSubQuestion, onAddHypothesis, onDelete,
        isCollapsed, onToggleCollapse, childCount = 0,
        lod = 'normal', dimmed = false
    } = data;

    const [editing, setEditing] = useState(false);
    const [editText, setEditText] = useState(content?.text || '');
    const inputRef = useRef(null);

    const ss = STATUS_CONFIG[status] || STATUS_CONFIG.open;

    useEffect(() => {
        if (editing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editing]);

    const handleSave = () => {
        setEditing(false);
        if (editText.trim() && editText.trim() !== (content?.text || '')) {
            onUpdate?.(id, { content: { ...content, text: editText.trim() } });
        }
    };

    return (
        <div
            className="relative group rounded-xl w-full h-full flex flex-col transition-all font-sans"
            style={{
                background: 'var(--surface-0)',
                border: '1px solid var(--stroke-0)',
                borderLeft: '4px solid #3B82F6', // Blue for Question
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
                <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider" style={{ color: 'var(--text-0)' }}>QA</span>
                    {priority === 'critical' && <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#FB7185' }} title="Critical" />}
                </div>
                <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                    style={{ background: ss.bg, color: ss.color }}
                >
                    {ss.label}
                </span>
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
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); } if (e.key === 'Escape') { setEditing(false); setEditText(content?.text || ''); } }}
                                    className="w-full text-[13px] font-medium resize-none rounded p-2 focus:outline-none focus:ring-1"
                                    style={{
                                        background: 'var(--bg-0)',
                                        color: 'var(--text-0)',
                                        border: '1px solid var(--accent-500)',
                                        '--tw-ring-color': 'var(--accent-500)',
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
                                    {content?.text || '点击输入问题...'}
                                </div>
                            )}
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
                            <button onClick={() => onAddSubQuestion?.(id)} className="p-1 rounded transition-colors hover:bg-black/5" style={{ color: 'var(--text-1)' }} title="添加子问题">
                                <Plus size={14} />
                            </button>
                            <button onClick={() => onAddHypothesis?.(id)} className="p-1 rounded transition-colors hover:bg-black/5" style={{ color: 'var(--text-1)' }} title="添加假说">
                                <MessageSquare size={14} />
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

export default memo(QuestionNode);
