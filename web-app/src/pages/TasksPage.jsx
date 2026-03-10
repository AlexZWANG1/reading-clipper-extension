import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Play, Pause, Archive, Clock, AlertCircle, CheckCircle2,
  Loader2, Trash2, ListChecks,
} from 'lucide-react';
import { useTasksStore, useTopicsStore, useUIStore } from '../lib/store';

const STATUS_CONFIG = {
  active: { label: '运行中', color: 'var(--accent-500)', bg: 'rgba(13,110,253,0.1)' },
  paused: { label: '已暂停', color: 'var(--text-tertiary)', bg: 'var(--bg-muted)' },
  completed: { label: '已完成', color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  archived: { label: '已归档', color: 'var(--text-tertiary)', bg: 'var(--bg-muted)' },
};

function TasksPage() {
  const navigate = useNavigate();
  const { tasks, loading, fetchTasks, createTask, deleteTask } = useTasksStore();
  const { topics, fetchTopics } = useTopicsStore();
  const { showToast } = useUIStore();

  const [intent, setIntent] = useState('');
  const [topicId, setTopicId] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchTasks().catch(() => {});
    fetchTopics().catch(() => {});
  }, [fetchTasks, fetchTopics]);

  const handleCreate = async () => {
    const text = intent.trim();
    if (!text || text.length < 5) {
      showToast('请输入至少 5 个字符的研究意图', 'error');
      return;
    }

    setCreating(true);
    try {
      const task = await createTask(text, topicId || null);
      setIntent('');
      setTopicId('');
      showToast(`任务「${task.title}」创建成功`, 'success');
    } catch (err) {
      showToast(err.message || '创建失败', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e, taskId) => {
    e.stopPropagation();
    if (!confirm('确定删除此任务？')) return;
    try {
      await deleteTask(taskId);
      showToast('已删除', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          研究任务
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          用自然语言定义研究意图，系统自动跟踪并沉淀知识卡片
        </p>
      </div>

      {/* Create form */}
      <div
        className="rounded-xl p-5 space-y-3"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-primary)' }}
      >
        <textarea
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="描述你的研究意图，例如：每天跟踪 LangChain 最新动态，沉淀到 AI 研究主题..."
          rows={3}
          className="w-full rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2"
          style={{
            background: 'var(--bg-base)',
            border: '1px solid var(--border-primary)',
            color: 'var(--text-primary)',
            '--tw-ring-color': 'var(--accent-500)',
          }}
        />

        <div className="flex items-center gap-3">
          <select
            value={topicId}
            onChange={(e) => setTopicId(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{
              background: 'var(--bg-base)',
              border: '1px solid var(--border-primary)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="">关联 Topic（可选）</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>

          <button
            onClick={handleCreate}
            disabled={creating || intent.trim().length < 5}
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
            style={{ background: 'var(--accent-500)' }}
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            创建任务
          </button>
        </div>
      </div>

      {/* Task list */}
      {loading && tasks.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <ListChecks className="w-12 h-12 mx-auto" style={{ color: 'var(--text-tertiary)' }} />
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            还没有研究任务，在上方输入研究意图开始
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const status = STATUS_CONFIG[task.status] || STATUS_CONFIG.active;
            return (
              <div
                key={task.id}
                onClick={() => navigate(`/tasks/${task.id}`)}
                className="rounded-xl p-4 cursor-pointer transition-all hover:shadow-md"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-primary)',
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {task.title}
                      </h3>
                      <span
                        className="flex-none text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ color: status.color, background: status.bg }}
                      >
                        {status.label}
                      </span>
                      {(task.pending_proposals || 0) > 0 && (
                        <span
                          className="flex-none text-xs px-2 py-0.5 rounded-full font-medium text-white"
                          style={{ background: '#f59e0b' }}
                        >
                          {task.pending_proposals} 待审批
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                      {task.intent}
                    </p>

                    <div className="mt-2 flex items-center gap-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {task.topic && (
                        <span className="flex items-center gap-1">
                          Topic: {task.topic.title}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {task.run_count || 0} 次运行
                      </span>
                      {task.last_run_at && (
                        <span>
                          上次: {new Date(task.last_run_at).toLocaleString('zh-CN')}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleDelete(e, task.id)}
                    className="flex-none p-1.5 rounded-lg transition-colors hover:bg-red-50"
                    style={{ color: 'var(--text-tertiary)' }}
                    title="删除任务"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TasksPage;
