import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Play, Pause, Trash2, Loader2,
  CheckCircle2, XCircle, Clock, AlertTriangle,
  ChevronDown, ChevronRight, Check, X,
} from 'lucide-react';
import { useTasksStore, useUIStore } from '../lib/store';

const RUN_STATUS = {
  running: { label: '运行中', icon: Loader2, color: 'var(--accent-500)', spin: true },
  completed: { label: '完成', icon: CheckCircle2, color: '#22c55e' },
  completed_with_proposals: { label: '完成(有提案)', icon: AlertTriangle, color: '#f59e0b' },
  failed: { label: '失败', icon: XCircle, color: '#ef4444' },
};

const STEP_STATUS = {
  running: { label: '运行中', color: 'var(--accent-500)' },
  completed: { label: '完成', color: '#22c55e' },
  skipped: { label: '跳过', color: 'var(--text-tertiary)' },
  failed: { label: '失败', color: '#ef4444' },
};

function TaskDetailView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    currentTask, runs, proposals, loading,
    fetchTask, triggerRun, updateTask, deleteTask,
    approveProposal, rejectProposal, fetchRun,
  } = useTasksStore();
  const { showToast } = useUIStore();

  const [activeTab, setActiveTab] = useState('runs');
  const [triggering, setTriggering] = useState(false);
  const [expandedRun, setExpandedRun] = useState(null);
  const [runSteps, setRunSteps] = useState({});
  const [pollingTimer, setPollingTimer] = useState(null);

  const loadTask = useCallback(() => {
    fetchTask(id).catch(() => {});
  }, [id, fetchTask]);

  useEffect(() => {
    loadTask();
    return () => {
      if (pollingTimer) clearInterval(pollingTimer);
    };
  }, [loadTask]);

  const handleTriggerRun = async () => {
    setTriggering(true);
    try {
      await triggerRun(id);
      showToast('运行已启动', 'success');

      // Poll for updates while running
      const timer = setInterval(() => {
        fetchTask(id).catch(() => {});
      }, 3000);
      setPollingTimer(timer);

      // Stop polling after 5 minutes max
      setTimeout(() => {
        clearInterval(timer);
        setPollingTimer(null);
      }, 300000);
    } catch (err) {
      showToast(err.message || '启动失败', 'error');
    } finally {
      setTriggering(false);
    }
  };

  // Stop polling when task stops running
  useEffect(() => {
    if (currentTask && !currentTask.is_running && pollingTimer) {
      clearInterval(pollingTimer);
      setPollingTimer(null);
      loadTask(); // One final refresh
    }
  }, [currentTask?.is_running]);

  const handleExpandRun = async (runId) => {
    if (expandedRun === runId) {
      setExpandedRun(null);
      return;
    }
    setExpandedRun(runId);
    if (!runSteps[runId]) {
      try {
        const run = await fetchRun(id, runId);
        setRunSteps((prev) => ({ ...prev, [runId]: run.steps || [] }));
      } catch {}
    }
  };

  const handleToggleStatus = async () => {
    const newStatus = currentTask.status === 'active' ? 'paused' : 'active';
    try {
      await updateTask(id, { status: newStatus });
      showToast(newStatus === 'paused' ? '已暂停' : '已恢复', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async () => {
    if (!confirm('确定删除此任务及所有运行记录？')) return;
    try {
      await deleteTask(id);
      navigate('/tasks');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleApprove = async (proposalId) => {
    try {
      await approveProposal(proposalId);
      showToast('提案已批准并执行', 'success');
    } catch (err) {
      showToast(err.message || '执行失败', 'error');
    }
  };

  const handleReject = async (proposalId) => {
    try {
      await rejectProposal(proposalId);
      showToast('提案已拒绝', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  if (loading && !currentTask) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
      </div>
    );
  }

  if (!currentTask) {
    return (
      <div className="text-center py-20">
        <p style={{ color: 'var(--text-tertiary)' }}>任务未找到</p>
      </div>
    );
  }

  const task = currentTask;
  const pendingProposals = proposals.filter((p) => p.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate('/tasks')}
          className="flex-none p-2 rounded-lg transition-colors"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {task.title}
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {task.intent}
          </p>
          <div className="mt-2 flex items-center gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {task.topic && <span>Topic: {task.topic.title}</span>}
            <span>{task.run_count || 0} 次运行</span>
            {task.last_run_at && (
              <span>上次运行: {new Date(task.last_run_at).toLocaleString('zh-CN')}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleTriggerRun}
            disabled={triggering || task.is_running || task.status !== 'active'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
            style={{ background: 'var(--accent-500)' }}
          >
            {triggering || task.is_running ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {task.is_running ? '运行中...' : '立即运行'}
          </button>

          <button
            onClick={handleToggleStatus}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)', background: 'var(--bg-muted)' }}
            title={task.status === 'active' ? '暂停' : '恢复'}
          >
            <Pause className="w-4 h-4" />
          </button>

          <button
            onClick={handleDelete}
            className="p-2 rounded-lg transition-colors hover:bg-red-50"
            style={{ color: '#ef4444' }}
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-muted)' }}>
        {[
          { key: 'runs', label: '运行记录' },
          { key: 'proposals', label: `待审批${pendingProposals.length > 0 ? ` (${pendingProposals.length})` : ''}` },
          { key: 'settings', label: '设置' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all"
            style={{
              background: activeTab === tab.key ? 'var(--bg-elevated)' : 'transparent',
              color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-tertiary)',
              boxShadow: activeTab === tab.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'runs' && (
        <div className="space-y-3">
          {runs.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                还没有运行记录，点击"立即运行"开始
              </p>
            </div>
          ) : (
            runs.map((run) => {
              const statusCfg = RUN_STATUS[run.status] || RUN_STATUS.running;
              const StatusIcon = statusCfg.icon;
              const isExpanded = expandedRun === run.id;
              const steps = runSteps[run.id] || [];

              return (
                <div
                  key={run.id}
                  className="rounded-xl overflow-hidden"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-primary)' }}
                >
                  {/* Run header */}
                  <div
                    onClick={() => handleExpandRun(run.id)}
                    className="flex items-center gap-3 p-4 cursor-pointer transition-colors hover:bg-black/[0.02]"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 flex-none" style={{ color: 'var(--text-tertiary)' }} />
                    ) : (
                      <ChevronRight className="w-4 h-4 flex-none" style={{ color: 'var(--text-tertiary)' }} />
                    )}

                    <StatusIcon
                      className={`w-4 h-4 flex-none ${statusCfg.spin ? 'animate-spin' : ''}`}
                      style={{ color: statusCfg.color }}
                    />

                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {statusCfg.label}
                    </span>

                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {new Date(run.started_at).toLocaleString('zh-CN')}
                    </span>

                    {run.results && (
                      <span className="ml-auto text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {run.results.items_fetched || 0} 抓取 / {run.results.cards_created || 0} 卡片
                      </span>
                    )}
                  </div>

                  {/* Steps timeline */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0">
                      {run.error && (
                        <div
                          className="mb-3 p-3 rounded-lg text-xs"
                          style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
                        >
                          {run.error}
                        </div>
                      )}

                      {steps.length === 0 && !run.error ? (
                        <p className="text-xs py-2" style={{ color: 'var(--text-tertiary)' }}>
                          加载步骤...
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {steps.map((step, i) => {
                            const stepCfg = STEP_STATUS[step.status] || STEP_STATUS.running;
                            const duration = step.completed_at && step.started_at
                              ? ((new Date(step.completed_at) - new Date(step.started_at)) / 1000).toFixed(1)
                              : null;

                            return (
                              <div
                                key={step.id}
                                className="flex items-start gap-2 text-xs"
                              >
                                <div
                                  className="w-5 h-5 rounded-full flex items-center justify-center flex-none mt-0.5"
                                  style={{ background: stepCfg.color + '20' }}
                                >
                                  <span style={{ color: stepCfg.color, fontSize: 10, fontWeight: 600 }}>
                                    {i + 1}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                      {step.phase}
                                    </span>
                                    <span
                                      className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                                      style={{ color: stepCfg.color, background: stepCfg.color + '15' }}
                                    >
                                      {stepCfg.label}
                                    </span>
                                    {duration && (
                                      <span style={{ color: 'var(--text-tertiary)' }}>{duration}s</span>
                                    )}
                                  </div>
                                  {step.output_summary && (
                                    <p className="mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                                      {step.output_summary}
                                    </p>
                                  )}
                                  {step.error && (
                                    <p className="mt-0.5" style={{ color: '#ef4444' }}>{step.error}</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'proposals' && (
        <div className="space-y-3">
          {pendingProposals.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                没有待审批的提案
              </p>
            </div>
          ) : (
            pendingProposals.map((proposal) => (
              <div
                key={proposal.id}
                className="rounded-xl p-4"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-primary)' }}
              >
                <h4 className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                  {proposal.title}
                </h4>
                {proposal.reasoning && (
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {proposal.reasoning}
                  </p>
                )}
                <div className="mt-2 p-2 rounded-lg text-xs font-mono overflow-x-auto" style={{ background: 'var(--bg-muted)' }}>
                  {(proposal.execution_plan?.actions || []).map((action, i) => (
                    <div key={i} style={{ color: 'var(--text-secondary)' }}>
                      {action.tool}({JSON.stringify(action.args).slice(0, 100)})
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => handleApprove(proposal.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                    style={{ background: '#22c55e' }}
                  >
                    <Check className="w-3.5 h-3.5" />
                    批准执行
                  </button>
                  <button
                    onClick={() => handleReject(proposal.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)' }}
                  >
                    <X className="w-3.5 h-3.5" />
                    拒绝
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div
          className="rounded-xl p-5 space-y-4"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-primary)' }}
        >
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              调度方式
            </label>
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
              {task.schedule?.type === 'manual' ? '手动触发' : task.schedule?.cron || '手动触发'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              任务规格 (task_spec)
            </label>
            <pre
              className="text-xs p-3 rounded-lg overflow-x-auto"
              style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}
            >
              {JSON.stringify(task.task_spec, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default TaskDetailView;
