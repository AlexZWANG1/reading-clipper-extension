import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { boardsApi } from '../lib/api';
import HypothesisBar from './HypothesisBar';

export default function HealthSidebar({ boardId, invalidateCounter = 0 }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!boardId) return;
    let cancelled = false;
    const fetchHealth = async () => {
      setLoading(true);
      try {
        const data = await boardsApi.getHealth(boardId);
        if (!cancelled && data.ok) setHealth(data.health);
      } catch (err) {
        console.error('Failed to fetch health:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchHealth();
    return () => { cancelled = true; };
  }, [boardId, invalidateCounter]);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-l-lg shadow-sm"
        style={{ background: 'var(--surface)', border: '1px solid var(--border-primary)' }}
        title="展开研究健康度"
      >
        <ChevronLeft size={14} />
      </button>
    );
  }

  return (
    <div className="w-60 flex flex-col overflow-hidden shrink-0" style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border-primary)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border-primary)' }}>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>研究健康度</span>
        <button onClick={() => setCollapsed(true)} className="p-0.5 rounded" style={{ color: 'var(--text-tertiary)' }}>
          <ChevronRight size={14} />
        </button>
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
          加载中...
        </div>
      )}

      {!loading && !health && (
        <div className="flex-1 flex items-center justify-center text-xs px-4 text-center" style={{ color: 'var(--text-tertiary)' }}>
          暂无研究健康数据
        </div>
      )}

      {!loading && health && (
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {/* Summary metrics */}
          <div className="flex justify-between text-center mb-3 pb-2" style={{ borderBottom: '1px solid var(--border-primary)' }}>
            <div>
              <div className="text-lg font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{health.total_hypotheses}</div>
              <div className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>假说</div>
            </div>
            <div>
              <div className="text-lg font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{health.total_evidence}</div>
              <div className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>证据</div>
            </div>
            <div>
              <div className="text-lg font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{health.blind_spots}</div>
              <div className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>盲点</div>
            </div>
          </div>

          {/* Per-hypothesis bars */}
          <div className="space-y-1">
            {(health.hypotheses_summary || []).map(h => (
              <HypothesisBar key={h.node_id} hypothesis={h} />
            ))}
          </div>

          {/* Orphan card count */}
          {health.blind_spots > 0 && (
            <div className="mt-3 pt-2 text-[10px]" style={{ borderTop: '1px solid var(--border-primary)', color: 'var(--text-tertiary)' }}>
              {health.blind_spots} 个假说缺少充分证据
            </div>
          )}
        </div>
      )}
    </div>
  );
}
