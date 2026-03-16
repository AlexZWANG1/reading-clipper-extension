// ========= AI Hub Page =========
// Unified AI interaction hub: chat + task management + conversation history.
// Replaces the old TasksPage — now the primary AI entry point.

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send, Bot, User, Loader2, Trash2, ShieldCheck, ShieldAlert,
  X, Check, ListChecks,
  Plus, Clock, MessageCircle, BookOpen, Globe,
} from 'lucide-react';
import { chatApi, topicsApi } from '../lib/api';
import {
  useUIStore, useChatStore, useConversationsStore,
  useTasksStore, useTopicsStore,
} from '../lib/store';
import ConversationSidebar from '../components/ConversationSidebar';
import ChatMessage from '../components/ChatMessage';

const QUICK_PROMPTS = [
  '帮我总结最近一周新增卡片的核心趋势',
  '按 Topic 列出证据最充分和最薄弱的结论',
  '基于当前卡片，给出 3 个可验证的新假设',
];

function toFriendlyChatError(error) {
  const message = error?.message || '';
  const normalized = message.toLowerCase();
  if (normalized.includes('aborted') || normalized.includes('abort') || normalized.includes('timeout')) {
    return 'AI 响应超时，请稍后重试';
  }
  if (error?.status >= 500 || normalized.includes('fetch failed')) {
    return 'AI 服务暂时不可用，请检查后端服务与模型配置';
  }
  return message || '请求失败';
}

// ── Task Status ──

const STATUS_CONFIG = {
  active: { label: '运行中', color: 'var(--accent-500)', bg: 'rgba(13,110,253,0.1)' },
  paused: { label: '已暂停', color: 'var(--text-tertiary)', bg: 'var(--bg-muted)' },
  completed: { label: '已完成', color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  archived: { label: '已归档', color: 'var(--text-tertiary)', bg: 'var(--bg-muted)' },
};

// ── Main AI Hub Page ──

function AIHubPage() {
  const navigate = useNavigate();
  const { showToast } = useUIStore();

  const [activeTab, setActiveTab] = useState('chat');
  const [sidebarVisible, setSidebarVisible] = useState(true);

  // Chat state
  const {
    conversationId, messages, sending,
    sendMessage, newConversation,
    setSurfaceContext,
  } = useChatStore();
  const { fetchConversations } = useConversationsStore();

  // Tasks state
  const { tasks, loading: tasksLoading, fetchTasks, createTask, deleteTask } = useTasksStore();
  const { topics, fetchTopics } = useTopicsStore();

  // Chat input state
  const [input, setInput] = useState('');
  const [pendingActions, setPendingActions] = useState(null);
  const [pendingMessages, setPendingMessages] = useState(null);
  const [pendingToolCalls, setPendingToolCalls] = useState(null);
  const [selectedTopicId, setSelectedTopicId] = useState(null); // null = free mode
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Task form state
  const [taskIntent, setTaskIntent] = useState('');
  const [taskTopicId, setTaskTopicId] = useState('');
  const [creating, setCreating] = useState(false);

  // Update surfaceContext when topic selection changes
  useEffect(() => {
    if (selectedTopicId) {
      setSurfaceContext({ surface: 'topic', topicId: selectedTopicId });
    } else {
      setSurfaceContext({ surface: 'general' });
    }
  }, [selectedTopicId]);

  // Init
  useEffect(() => {
    fetchConversations();
    fetchTasks().catch(() => {});
    fetchTopics().catch(() => {});
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingActions]);

  useEffect(() => {
    if (activeTab === 'chat') inputRef.current?.focus();
  }, [conversationId, activeTab]);

  // ── Chat handlers ──

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    try {
      const result = await sendMessage(text);
      if (result?.pendingActions?.length > 0) {
        setPendingActions(result.pendingActions);
        setPendingMessages(result.messages);
        setPendingToolCalls(result.pendingToolCalls);
      }
      fetchConversations();
    } catch (err) {
      showToast(toFriendlyChatError(err), 'error');
    }
  };

  const handleConfirm = async () => {
    if (!pendingActions || !pendingMessages || !pendingToolCalls) return;
    try {
      const confirmedIds = pendingActions.map((a) => a.id);
      const data = await chatApi.confirm(pendingMessages, pendingToolCalls, confirmedIds);
      setPendingActions(null);
      setPendingMessages(null);
      setPendingToolCalls(null);
      if (data.pendingActions?.length > 0) {
        setPendingActions(data.pendingActions);
        setPendingMessages(data.messages);
        setPendingToolCalls(data.pendingToolCalls);
      }
    } catch (err) {
      showToast(toFriendlyChatError(err), 'error');
    }
  };

  const handleCancelActions = () => {
    setPendingActions(null);
    setPendingMessages(null);
    setPendingToolCalls(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Task handlers ──

  const handleCreateTask = async () => {
    const text = taskIntent.trim();
    if (!text || text.length < 5) {
      showToast('请输入至少 5 个字符的研究意图', 'error');
      return;
    }
    setCreating(true);
    try {
      const task = await createTask(text, taskTopicId || null);
      setTaskIntent('');
      setTaskTopicId('');
      showToast(`任务「${task.title}」创建成功`, 'success');
    } catch (err) {
      showToast(err.message || '创建失败', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTask = async (e, taskId) => {
    e.stopPropagation();
    if (!confirm('确定删除此任务？')) return;
    try {
      await deleteTask(taskId);
      showToast('已删除', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // ── Render ──

  const hasMessages = messages.length > 0;

  const TABS = [
    { id: 'chat', label: '对话', icon: MessageCircle },
    { id: 'tasks', label: '任务', icon: ListChecks },
  ];

  return (
    <div className="flex h-full">
      {/* Conversation sidebar */}
      {sidebarVisible && (
        <div className="w-56 flex-none hidden lg:block" style={{ background: 'var(--bg-elevated, var(--surface-1))' }}>
          <ConversationSidebar />
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header with tabs */}
        <div className="flex items-center justify-between px-4 py-2 flex-none" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarVisible(!sidebarVisible)}
              className="p-2 rounded-lg transition-colors hidden lg:block cursor-pointer"
              style={{ color: 'var(--text-tertiary)' }}
              aria-label="Toggle conversation sidebar"
            >
              <MessageCircle className="w-4 h-4" />
            </button>

            {/* Tab bar */}
            <div className="flex rounded-lg p-0.5" style={{ background: 'var(--bg-muted)' }}>
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer"
                  style={
                    activeTab === tab.id
                      ? { background: '#fff', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                      : { color: 'var(--text-tertiary)' }
                  }
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {tab.id === 'tasks' && tasks.length > 0 && (
                    <span
                      className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{ background: 'var(--accent-500)', color: '#fff' }}
                    >
                      {tasks.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Topic mode selector */}
            {activeTab === 'chat' && topics.length > 0 && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs ml-2"
                style={{
                  background: selectedTopicId ? 'var(--accent-blue-subtle)' : 'var(--bg-muted)',
                  border: '1px solid var(--border-primary)',
                }}
              >
                {selectedTopicId ? (
                  <BookOpen className="w-3 h-3 flex-none" style={{ color: 'var(--accent-600)' }} />
                ) : (
                  <Globe className="w-3 h-3 flex-none" style={{ color: 'var(--text-tertiary)' }} />
                )}
                <select
                  value={selectedTopicId || ''}
                  onChange={(e) => setSelectedTopicId(e.target.value || null)}
                  className="bg-transparent text-xs cursor-pointer outline-none"
                  style={{
                    color: selectedTopicId ? 'var(--accent-600)' : 'var(--text-secondary)',
                    border: 'none',
                  }}
                  aria-label="选择研究主题"
                >
                  <option value="">自由模式</option>
                  {topics.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.title}{t.card_count != null ? ` (${t.card_count})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            {activeTab === 'chat' && hasMessages && (
              <button
                onClick={() => { newConversation(); setPendingActions(null); }}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer"
                style={{ color: 'var(--text-secondary)', background: 'var(--bg-muted)' }}
              >
                <Plus className="w-3 h-3" />
                新会话
              </button>
            )}
          </div>
        </div>

        {activeTab === 'chat' ? (
          /* ── Chat View ── */
          <>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {!hasMessages && !pendingActions ? (
                <div className="h-full flex flex-col items-center justify-center gap-4 max-w-xl mx-auto">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--bg-muted)' }}>
                    <Bot className="w-6 h-6" style={{ color: 'var(--text-primary)' }} />
                  </div>
                  <p className="text-sm text-center" style={{ color: 'var(--text-tertiary)' }}>
                    {selectedTopicId
                      ? `已选定主题「${topics.find(t => t.id === selectedTopicId)?.title || ''}」— AI 将基于该主题下的材料回答问题`
                      : '自由模式 — 问我任何关于你的研究笔记的问题，或选择一个主题进行深度问答'}
                  </p>

                  {/* Quick prompts */}
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {QUICK_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => { setInput(prompt); inputRef.current?.focus(); }}
                        className="px-3 py-2 rounded-full text-xs transition-colors cursor-pointer"
                        style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>

                  {/* Recent tasks preview */}
                  {tasks.length > 0 && (
                    <div className="w-full mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>最近任务</p>
                        <button
                          onClick={() => setActiveTab('tasks')}
                          className="text-xs cursor-pointer transition-colors"
                          style={{ color: 'var(--accent-500)' }}
                        >
                          查看全部
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        {tasks.slice(0, 3).map((task) => {
                          const status = STATUS_CONFIG[task.status] || STATUS_CONFIG.active;
                          return (
                            <div
                              key={task.id}
                              onClick={() => navigate(`/tasks/${task.id}`)}
                              className="flex items-center gap-2 p-2.5 rounded-lg cursor-pointer transition-colors"
                              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-primary)' }}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{task.title}</p>
                              </div>
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-none"
                                style={{ color: status.color, background: status.bg }}
                              >
                                {status.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {messages.map((msg, i) => {
                    return (
                      <div key={msg.id || i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                        {msg.role === 'assistant' && (
                          <div className="w-7 h-7 rounded-full flex-none flex items-center justify-center mt-0.5" style={{ background: 'var(--bg-muted)' }}>
                            <Bot className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
                          </div>
                        )}
                        <div
                          className="max-w-[75%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed"
                          style={
                            msg.role === 'user'
                              ? { background: 'var(--interactive-primary)', color: '#fff' }
                              : { background: 'var(--bg-muted)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }
                          }
                        >
                          <ChatMessage content={msg.content} role={msg.role} />
                        </div>
                        {msg.role === 'user' && (
                          <div className="w-7 h-7 rounded-full flex-none flex items-center justify-center mt-0.5" style={{ background: 'var(--bg-muted)' }}>
                            <User className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Pending actions confirmation */}
                  {pendingActions && (
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-full flex-none flex items-center justify-center mt-0.5" style={{ background: 'rgba(245,158,11,0.15)' }}>
                        <ShieldCheck className="w-4 h-4" style={{ color: 'var(--warning)' }} />
                      </div>
                      <div className="flex-1 max-w-[85%] rounded-xl px-4 py-3" style={{ background: 'var(--bg-muted)', border: '1px solid rgba(245,158,11,0.3)' }}>
                        <p className="text-xs font-medium mb-2" style={{ color: 'var(--warning)' }}>AI 请求执行以下操作：</p>
                        <div className="space-y-1.5 mb-3">
                          {pendingActions.map((action) => (
                            <div key={action.id} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                              {action.risk_level === 'confirm_warn' ? (
                                <ShieldAlert className="w-3.5 h-3.5 flex-none" style={{ color: '#EF4444' }} />
                              ) : (
                                <ShieldCheck className="w-3.5 h-3.5 flex-none" style={{ color: 'var(--warning)' }} />
                              )}
                              <span>{action.confirm_message}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleConfirm} disabled={sending} className="btn btn-primary flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed">
                            {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            确认执行
                          </button>
                          <button onClick={handleCancelActions} disabled={sending} className="btn btn-secondary flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed">
                            <X className="w-3 h-3" /> 取消
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {sending && !pendingActions && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full flex-none flex items-center justify-center mt-0.5" style={{ background: 'var(--bg-muted)' }}>
                    <Bot className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
                  </div>
                  <div className="rounded-xl px-3.5 py-2.5" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border-primary)' }}>
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-secondary)' }} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Chat input */}
            <div className="px-4 py-3 flex-none" style={{ borderTop: '1px solid var(--border-primary)' }}>
              <div
                className="flex items-end gap-2 rounded-xl p-2"
                style={{ background: 'var(--surface)', border: '1px solid var(--border-primary)' }}
              >
                <textarea
                  ref={inputRef}
                  id="ai-hub-input"
                  name="ai_hub_input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  aria-label="Chat input"
                  placeholder={pendingActions ? '请先确认或取消待执行操作' : '输入问题或描述研究任务...'}
                  rows={1}
                  disabled={!!pendingActions}
                  className="textarea flex-1 resize-none text-sm px-2 py-2 disabled:opacity-50"
                  style={{ maxHeight: '120px' }}
                  onInput={(e) => {
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || sending || !!pendingActions}
                  aria-label="Send message"
                  className="btn btn-primary flex-none w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs px-1 mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Enter 发送 | Shift+Enter 换行
              </p>
            </div>
          </>
        ) : (
          /* ── Tasks View ── */
          <div className="flex-1 overflow-y-auto p-4 lg:p-6">
            <div className="max-w-3xl mx-auto space-y-5">
              {/* Create task form */}
              <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-primary)' }}>
                <textarea
                  value={taskIntent}
                  onChange={(e) => setTaskIntent(e.target.value)}
                  placeholder="描述你的研究意图，例如：每天跟踪 LangChain 最新动态..."
                  rows={2}
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
                    value={taskTopicId}
                    onChange={(e) => setTaskTopicId(e.target.value)}
                    className="rounded-lg px-3 py-2 text-sm focus:outline-none cursor-pointer"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }}
                  >
                    <option value="">关联 Topic（可选）</option>
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleCreateTask}
                    disabled={creating || taskIntent.trim().length < 5}
                    className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: 'var(--accent-500)' }}
                  >
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    创建任务
                  </button>
                </div>
              </div>

              {/* Task list */}
              {tasksLoading && tasks.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
                </div>
              ) : tasks.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <ListChecks className="w-10 h-10 mx-auto" style={{ color: 'var(--text-tertiary)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    还没有研究任务
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    在上方输入研究意图，或切换到对话标签通过 AI 生成任务
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tasks.map((task) => {
                    const status = STATUS_CONFIG[task.status] || STATUS_CONFIG.active;
                    return (
                      <div
                        key={task.id}
                        onClick={() => navigate(`/tasks/${task.id}`)}
                        className="rounded-xl p-4 cursor-pointer transition-all hover:shadow-md"
                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-primary)' }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{task.title}</h3>
                              <span className="flex-none text-xs px-2 py-0.5 rounded-full font-medium" style={{ color: status.color, background: status.bg }}>
                                {status.label}
                              </span>
                            </div>
                            <p className="mt-1 text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>{task.intent}</p>
                            <div className="mt-2 flex items-center gap-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                              {task.topic && <span>Topic: {task.topic.title}</span>}
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {task.run_count || 0} 次运行
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={(e) => handleDeleteTask(e, task.id)}
                            className="flex-none p-2 rounded-lg transition-colors cursor-pointer"
                            style={{ color: 'var(--text-tertiary)' }}
                            aria-label="Delete task"
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
          </div>
        )}
      </div>
    </div>
  );
}

export default AIHubPage;
