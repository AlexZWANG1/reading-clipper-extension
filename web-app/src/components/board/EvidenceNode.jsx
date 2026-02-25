import { memo } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import { ExternalLink, Trash2, Star, Maximize2 } from 'lucide-react';

const RELATION_CONFIG = {
    supports: { borderColor: '#34D399', icon: '✅', bg: 'rgba(52,211,153,0.15)', color: '#34D399' },
    refutes: { borderColor: '#FB7185', icon: '❌', bg: 'rgba(251,113,133,0.15)', color: '#FB7185' },
    neutral: { borderColor: 'var(--text-2)', icon: '📄', bg: 'rgba(148,163,184,0.15)', color: 'var(--text-2)' },
};

function EvidenceNode({ id, data, selected }) {
    const {
        content, card, evidence_type = 'fact', strength = 3,
        edgeRelation,
        onUpdate, onDelete, onEdgeUpdate,
        lod = 'normal', dimmed = false
    } = data;

    const rel = RELATION_CONFIG[edgeRelation] || RELATION_CONFIG.neutral;

    const sourceName = card?.source_name || (card?.source_url ? (() => { try { return new URL(card.source_url).hostname.replace('www.', ''); } catch { return ''; } })() : '');
    const displayText = card?.summary || content?.text || '(无内容)';

    const buildHighlightUrl = (baseUrl, rawSnippet) => {
        if (!baseUrl || !rawSnippet) return baseUrl || '#';
        try {
            const url = new URL(baseUrl);
            const cleanText = rawSnippet.replace(/\s+/g, ' ').trim().slice(0, 80);
            if (!cleanText) return baseUrl;
            url.hash = `:~:text=${encodeURIComponent(cleanText).replace(/-/g, '%2D')}`;
            return url.toString();
        } catch { return baseUrl; }
    };

    return (
        <>
            <NodeResizer minWidth={260} minHeight={140} isVisible={selected} />
            <div
                className="relative group rounded-xl transition-all font-sans flex flex-col overflow-hidden"
                style={{
                    background: 'var(--surface-0)',
                    border: '1px solid var(--stroke-0)',
                    borderLeft: '4px solid #10B981', // Green for Evidence
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                    backdropFilter: 'blur(12px)',
                    width: '100%',
                    height: '100%',
                    minWidth: 260,
                    minHeight: 140,
                    opacity: dimmed ? 0.3 : 1,
                    pointerEvents: dimmed ? 'none' : 'auto'
                }}
            >
                {/* Target handle */}
                <Handle type="target" position={Position.Top} className="neuro-handle" />

                {/* Header */}
                <div className={`flex items-center gap-2 px-2 pt-2 ${lod === 'mini' ? 'pb-2' : 'mb-1'}`}>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wide" style={{ color: 'var(--text-0)' }}>EVI</span>
                    <select
                        value={edgeRelation || 'neutral'}
                        onChange={e => onEdgeUpdate?.(id, { relation_type: e.target.value })}
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded cursor-pointer outline-none appearance-none"
                        style={{ background: rel.bg, color: rel.color, border: 'none' }}
                        title="Change Relation"
                    >
                        <option value="supports">SUPPORTS</option>
                        <option value="refutes">REFUTES</option>
                        <option value="neutral">NEUTRAL</option>
                    </select>
                </div>

                {/* Content & Actions (Hidden in mini LOD) */}
                {lod !== 'mini' && (
                    <div className="px-2 pb-2 flex-1 flex flex-col">
                        <div className={`text-[12px] leading-snug font-medium mb-1.5 flex-1 overflow-y-auto ${lod === 'normal' ? 'line-clamp-6' : ''}`} style={{ color: 'var(--text-0)' }}>
                            {rel.icon} {displayText}
                        </div>

                        {/* Source */}
                        {sourceName && (
                            <div className="flex items-center gap-1 text-[10px] pt-1.5" style={{ borderTop: '1px solid var(--stroke-0)', color: 'var(--text-1)' }}>
                                <span className="truncate max-w-[120px]">{sourceName}</span>
                                {card?.source_url && (
                                    <a
                                        href={buildHighlightUrl(card.source_url, card.raw_snippet)}
                                        target="_blank" rel="noopener noreferrer"
                                        className="ml-auto hover:text-blue-500 transition-colors"
                                        style={{ color: 'var(--accent-300)' }}
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <ExternalLink size={10} />
                                    </a>
                                )}
                            </div>
                        )}

                        {/* Strength stars */}
                        <div className="flex items-center gap-0.5 mt-1 justify-end opacity-50 group-hover:opacity-100 transition-opacity">
                            {[1, 2, 3, 4, 5].map(i => (
                                <button
                                    key={i}
                                    onClick={() => onUpdate?.(id, { strength: i })}
                                    style={{ color: i <= strength ? '#FBBF24' : 'var(--stroke-1)', padding: 0 }}
                                    className="hover:scale-110 transition-transform"
                                >
                                    <Star size={10} fill={i <= strength ? 'currentColor' : 'none'} />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Delete */}
                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onDelete?.(id)} className="p-0.5 rounded transition-colors hover:bg-red-500/10 hover:text-red-500" style={{ color: 'var(--text-2)' }} title="删除证据">
                        <Trash2 size={10} />
                    </button>
                </div>
            </div>
        </>
    );
}

export default memo(EvidenceNode);
