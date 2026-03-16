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
  const { text, support, refute, neutral = 0, status, hypo_state, confidence } = hypothesis;
  const total = support + refute + neutral;
  const supportPct = total > 0 ? (support / total) * 100 : 0;
  const refutePct = total > 0 ? (refute / total) * 100 : 0;
  const neutralPct = total > 0 ? (neutral / total) * 100 : 0;
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.no_evidence;
  const observation = OBSERVATIONS[status];

  // Hypothesis state label
  const stateLabel = hypo_state === 'validated' ? '已验证'
    : hypo_state === 'falsified' ? '已证伪'
    : '待验证';
  const stateColor = hypo_state === 'validated' ? '#059669'
    : hypo_state === 'falsified' ? '#ef4444'
    : '#94a3b8';

  return (
    <div className="py-2">
      {/* Hypothesis text + state */}
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-medium truncate flex-1" style={{ color: 'var(--text-primary)' }} title={text}>{text}</p>
        <span className="text-[9px] font-medium px-1 py-0.5 rounded shrink-0" style={{ color: stateColor, background: `${stateColor}14` }}>
          {stateLabel}
        </span>
      </div>

      {/* Evidence balance bar — 3-segment: green(support) + gray(neutral) + red(refute) */}
      <div className="flex items-center gap-2 mt-1">
        <div className="flex-1 h-2 rounded-full overflow-hidden flex" style={{ background: 'var(--bg-muted)' }}>
          {total > 0 && (
            <>
              <div
                className="h-full transition-all duration-300"
                style={{ width: `${supportPct}%`, background: '#10b981' }}
              />
              {neutral > 0 && (
                <div
                  className="h-full transition-all duration-300"
                  style={{ width: `${neutralPct}%`, background: '#94a3b8' }}
                />
              )}
              <div
                className="h-full transition-all duration-300"
                style={{ width: `${refutePct}%`, background: '#ef4444' }}
              />
            </>
          )}
        </div>
        <span className="text-[10px] tabular-nums whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>
          {support}↑ {neutral > 0 ? `${neutral}· ` : ''}{refute}↓
        </span>
      </div>

      {/* Confidence (if available) */}
      {confidence != null && confidence > 0 && (
        <div className="flex items-center gap-1.5 mt-0.5">
          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-muted)' }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.round((confidence <= 1 ? confidence * 100 : confidence))}%`,
                background: confidence >= 0.8 ? '#059669' : confidence >= 0.4 ? '#d97706' : '#94a3b8',
              }}
            />
          </div>
          <span className="text-[9px] tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
            {Math.round((confidence <= 1 ? confidence * 100 : confidence))}%
          </span>
        </div>
      )}

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
