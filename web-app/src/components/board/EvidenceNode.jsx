import { memo, useState } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import { ExternalLink, Trash2, Star } from 'lucide-react';

const RELATION_CONFIG = {
  supports: {
    label: '支持',
    icon: '↗',
    bg: 'rgba(31,157,103,0.10)',
    color: 'var(--workbench-green)',
    borderColor: 'rgba(31,157,103,0.34)',
    lineColor: 'var(--workbench-green)',
  },
  refutes: {
    label: '反驳',
    icon: '↘',
    bg: 'rgba(195,74,60,0.10)',
    color: 'var(--workbench-red)',
    borderColor: 'rgba(195,74,60,0.34)',
    lineColor: 'var(--workbench-red)',
  },
  neutral: {
    label: '中立',
    icon: '·',
    bg: 'rgba(130,121,106,0.10)',
    color: 'var(--workbench-text-muted)',
    borderColor: 'rgba(130,121,106,0.34)',
    lineColor: 'rgba(130,121,106,0.7)',
  },
};

function buildHighlightUrl(baseUrl, rawSnippet) {
  if (!baseUrl || !rawSnippet) return baseUrl || '#';
  try {
    const url = new URL(baseUrl);
    const cleanText = rawSnippet.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!cleanText) return baseUrl;
    url.hash = `:~:text=${encodeURIComponent(cleanText).replace(/-/g, '%2D')}`;
    return url.toString();
  } catch {
    return baseUrl;
  }
}

function EvidenceNode({ id, data, selected }) {
  const {
    content,
    card,
    strength = 3,
    edgeRelation,
    onUpdate,
    onDelete,
    onEdgeUpdate,
    lod = 'normal',
    dimmed = false,
    compactMode = true,
  } = data;
  const [hovered, setHovered] = useState(false);

  const relation = RELATION_CONFIG[edgeRelation] || RELATION_CONFIG.neutral;
  const isCompact = compactMode && lod !== 'full';
  const isExpanded = !isCompact || hovered || selected;
  const stackedCompact = isCompact && !isExpanded;
  const sourceName = card?.source_name || (card?.source_url
    ? (() => {
      try {
        return new URL(card.source_url).hostname.replace('www.', '');
      } catch {
        return '';
      }
    })()
    : '');
  const summaryText = (card?.summary || content?.text || '').replace(/\s+/g, ' ').trim();
  const displayText = summaryText || '(无内容)';
  const cardTitle = card?.title || '新卡片';
  const factOrView = card?.fact_or_view === 'view' ? 'VIEW' : 'FACT';
  const factBadgeClass = `badge ${factOrView === 'VIEW' ? 'badge-view' : 'badge-fact'}`;

  return (
    <>
      <NodeResizer minWidth={220} minHeight={96} isVisible={selected} />
      <div
        className="relative group flex flex-col"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          borderRadius: 12,
          background: 'var(--workbench-card)',
          border: '1px solid var(--workbench-border)',
          borderLeft: `2px solid ${relation.lineColor}`,
          boxShadow: selected ? '0 0 0 2px rgba(47,128,255,0.2)' : 'var(--workbench-shadow-node)',
          width: '100%',
          height: '100%',
          minWidth: 220,
          minHeight: 96,
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

        <div className={`flex items-center gap-2 px-3 ${lod === 'mini' ? 'py-2' : 'pt-2.5 pb-1.5'}`}>
          <span className={factBadgeClass}>
            {factOrView}
          </span>
          <select
            id={`evidence-relation-${id}`}
            name={`evidence_relation_${id}`}
            value={edgeRelation || 'neutral'}
            onChange={(e) => onEdgeUpdate?.(id, { relation_type: e.target.value })}
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full cursor-pointer outline-none appearance-none border"
            style={{ background: relation.bg, color: relation.color, borderColor: relation.borderColor }}
            title="切换证据关系"
            aria-label="切换证据关系"
          >
            <option value="supports">支持</option>
            <option value="refutes">反驳</option>
            <option value="neutral">中立</option>
          </select>
          {sourceName && (
            <span className="ml-auto text-[10px] truncate max-w-[110px]" style={{ color: 'var(--workbench-text-muted)' }} title={sourceName}>
              {sourceName}
            </span>
          )}
        </div>

        {lod !== 'mini' && (
          <div className="px-3 pb-2.5 flex-1 flex flex-col">
            {isExpanded && (
              <div className="font-semibold text-[12px] mb-1 leading-tight" style={{ color: 'var(--workbench-text)' }}>
                {cardTitle}
              </div>
            )}
            <div
              className={`text-[12px] leading-[1.42] ${isExpanded ? 'line-clamp-4' : 'line-clamp-1'} ${isExpanded ? 'mb-2' : 'mb-1.5'}`}
              style={{ color: 'var(--workbench-text-soft)' }}
            >
              <span className="font-semibold" style={{ color: relation.color }}>{relation.icon}</span> {displayText}
            </div>

            <div className="flex items-center gap-1 text-[10px] pt-1" style={{ borderTop: '1px solid var(--workbench-border)', color: 'var(--workbench-text-muted)' }}>
              <span className="truncate">{sourceName || '未标注来源'}</span>
              {card?.source_url && (
                <a
                  href={buildHighlightUrl(card.source_url, card.raw_snippet)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto"
                  style={{ color: 'var(--workbench-blue-ink)' }}
                  onClick={(e) => e.stopPropagation()}
                  title="跳转原文"
                  aria-label="跳转原文"
                >
                  <ExternalLink size={10} />
                </a>
              )}
            </div>

            {isExpanded && (
              <div className="flex items-center gap-1 mt-1 justify-end opacity-80 group-hover:opacity-100">
                <span className="text-[10px]" style={{ color: 'var(--workbench-text-muted)' }}>强度</span>
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    onClick={() => onUpdate?.(id, { strength: level })}
                    style={{ color: level <= strength ? 'var(--workbench-amber)' : 'rgba(130,121,106,0.36)', padding: 0 }}
                    className=""
                    title={`设置证据强度 ${level}`}
                    aria-label={`设置证据强度 ${level}`}
                  >
                    <Star size={10} fill={level <= strength ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="absolute top-1 right-1 opacity-75 group-hover:opacity-100">
          <button
            onClick={() => onDelete?.(id)}
            className="p-0.5 rounded hover:bg-red-500/10 hover:text-red-500"
            style={{ color: 'var(--workbench-text-muted)' }}
            title="删除证据"
            aria-label="删除证据"
          >
            <Trash2 size={10} />
          </button>
        </div>

        <Handle type="source" position={Position.Bottom} className="neuro-handle" />
      </div>
    </>
  );
}

export default memo(EvidenceNode);
