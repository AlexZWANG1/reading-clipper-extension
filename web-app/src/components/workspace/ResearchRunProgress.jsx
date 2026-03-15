import { useState, useEffect } from 'react';
import { Pause, Play, Square, CheckCircle } from 'lucide-react';
import { useWorkspaceStore } from '../../lib/store';

function formatElapsed(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}m ${sec.toString().padStart(2, '0')}s`;
}

export default function ResearchRunProgress({ className }) {
    const activeRun = useWorkspaceStore(s => s.activeResearchRun);
    const setActiveResearchRun = useWorkspaceStore(s => s.setActiveResearchRun);
    const setAutonomyLevel = useWorkspaceStore(s => s.setAutonomyLevel);
    const [elapsed, setElapsed] = useState(0);
    const [paused, setPaused] = useState(false);

    useEffect(() => {
        if (!activeRun?.startTime || paused) return;
        const interval = setInterval(() => {
            setElapsed(Date.now() - activeRun.startTime);
        }, 1000);
        return () => clearInterval(interval);
    }, [activeRun?.startTime, paused]);

    if (!activeRun) return null;

    const stats = activeRun.stats || {};
    const isComplete = activeRun.status === 'completed';
    const isFailed = activeRun.status === 'failed';

    const handleStop = () => {
        if (!confirm('确定停止 Research Run？已创建的 Draft 节点将保留。')) return;
        setActiveResearchRun({ ...activeRun, status: 'completed' });
        setAutonomyLevel('explore');
        useWorkspaceStore.getState().invalidateBoard();
        useWorkspaceStore.getState().setLayoutMode('dagre');
    };

    const bgColor = isComplete ? 'rgba(24,160,106,0.06)'
        : isFailed ? 'rgba(195,58,48,0.06)'
        : paused ? 'rgba(217,119,6,0.06)'
        : 'rgba(24,160,106,0.06)';

    return (
        <div className={`px-4 py-3 ${className || ''}`} style={{ background: bgColor, borderBottom: '1px solid var(--stroke-0)' }}>
            <div className="flex items-center gap-3">
                {isComplete ? (
                    <CheckCircle size={14} style={{ color: '#18A06A' }} />
                ) : isFailed ? (
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#C33A30' }} />
                ) : (
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: paused ? '#D97706' : '#18A06A', animation: paused ? 'none' : 'nodePulse 1.5s infinite' }} />
                )}

                <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate" style={{ color: 'var(--text-0)' }}>
                        {isComplete ? 'Research Run 完成' : isFailed ? 'Research Run 失败' : paused ? '已暂停' : (activeRun.currentAction || '研究进行中...')}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px]" style={{ color: 'var(--text-2)' }}>
                        {stats.materialsRead != null && <span>材料 {stats.materialsRead}/{stats.materialsTotal || '?'}</span>}
                        {stats.nodesCreated != null && <span>节点 +{stats.nodesCreated}</span>}
                        {stats.evidenceFound != null && <span>证据 +{stats.evidenceFound}</span>}
                        <span>{formatElapsed(elapsed)}</span>
                    </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    {!isComplete && !isFailed && (
                        <>
                            <button
                                onClick={() => setPaused(!paused)}
                                className="p-1.5 rounded-lg transition-colors hover:bg-blue-500/10"
                                style={{ color: 'var(--text-2)' }}
                                title={paused ? '继续' : '暂停'}
                            >
                                {paused ? <Play size={14} /> : <Pause size={14} />}
                            </button>
                            <button
                                onClick={handleStop}
                                className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
                                style={{ color: '#C33A30' }}
                                title="停止"
                            >
                                <Square size={14} />
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
