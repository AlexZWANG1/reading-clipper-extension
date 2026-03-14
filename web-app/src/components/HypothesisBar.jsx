const STATUS_CONFIG = {
  bias_warning: { label: '偏见警告', color: '#d97706', icon: '⚠' },
  no_evidence: { label: '无证据', color: '#9ca3af', icon: '✗' },
  insufficient: { label: '证据不足', color: '#f59e0b', icon: '⚠' },
  strong_support: { label: '强支持', color: '#059669', icon: '✓' },
  strong_against: { label: '强反对', color: '#ef4444', icon: '✗' },
  mixed: { label: '证据充分', color: '#3b82f6', icon: '◎' },
};

const OBSERVATIONS = {
  bias_warning: '仅有支持证据，缺少反面论证',
  no_evidence: '尚未关联任何证据卡片',
  insufficient: '证据不足，建议继续收集',
};

export default function HypothesisBar({ hypothesis }) {
  const { text, support, refute, status } = hypothesis;
  const total = support + refute;
  const supportPct = total > 0 ? (support / total) * 100 : 0;
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.no_evidence;
  const observation = OBSERVATIONS[status];

  return (
    <div className="py-2">
      <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }} title={text}>{text}</p>

      {/* Evidence balance bar */}
      <div className="flex items-center gap-2 mt-1">
        <div className="flex-1 h-2 rounded-full overflow-hidden flex" style={{ background: 'var(--bg-muted)' }}>
          {total > 0 && (
            <>
              <div
                className="h-full transition-all duration-300"
                style={{ width: `${supportPct}%`, background: '#10b981' }}
              />
              <div
                className="h-full transition-all duration-300"
                style={{ width: `${100 - supportPct}%`, background: '#ef4444' }}
              />
            </>
          )}
        </div>
        <span className="text-[10px] tabular-nums whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>
          {support}↑ {refute}↓
        </span>
      </div>

      {/* Status badge */}
      <div className="text-[10px] mt-0.5" style={{ color: config.color }}>
        {config.icon} {config.label}
      </div>

      {/* AI observation */}
      {observation && (
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{observation}</p>
      )}
    </div>
  );
}
