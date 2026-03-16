import { useState, useRef, useEffect } from 'react';
import {
  Send, Bot, User, Loader2, Trash2, ShieldCheck, ShieldAlert,
  X, Check, ListChecks, ChevronRight, Sparkles, PlayCircle,
  BookOpen, Globe,
} from 'lucide-react';
import { chatApi, topicsApi } from '../lib/api';
import { useUIStore, useChatStore, useConversationsStore } from '../lib/store';
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
    return 'AI 响应超时，请稍后重试（复杂问题可能需要更长时间）';
  }
  if (error?.status >= 500 || normalized.includes('fetch failed')) {
    return 'AI 服务暂时不可用，请检查后端服务与模型配置';
  }
  return message || '请求失败';
}

// ── Message Renderers ──

function PlanProposalCard({ message, onExecute, onDismiss, executing }) {
  const metadata = message.metadata || {};
  const planDisplay = metadata.plan_display || {};
  const planSpec = metadata.plan_spec || {};
  const steps = planSpec.steps || [];

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--bg-elevated, var(--surface-1))', border: '1px solid var(--border-primary)' }}
    >
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-primary)' }}>
        <div className="flex items-center gap-2 mb-1">
          <ListChecks className="w-4 h-4" style={{ color: 'var(--accent-500)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            执行计划
          </span>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {planDisplay.summary || planSpec.intent_summary}
        </p>
      </div>

      {planDisplay.why_this_plan && (
        <div className="px-4 py-2" style={{ background: 'var(--bg-muted)' }}>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {planDisplay.why_this_plan}
          </p>
        </div>
      )}

      <div className="px-4 py-3 space-y-2">
        {steps.map((step, i) => {
          const explanation = planDisplay.step_explanations?.find((e) => e.step_id === step.id);
          return (
            <div key={step.id} className="flex items-start gap-2.5">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center flex-none mt-0.5 text-[10px] font-bold"
                style={{ background: 'var(--accent-blue-subtle)', color: 'var(--accent-600)' }}
              >
                {i + 1}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                    {step.title}
                  </span>
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px]"
                    style={{ background: 'var(--bg-muted)', color: 'var(--text-tertiary)' }}
                  >
                    {step.tool}
                  </span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  {explanation?.explanation || step.goal}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {(planDisplay.selected_sources?.length > 0 || planDisplay.selected_tools?.length > 0) && (
        <div className="px-4 py-2 flex flex-wrap gap-3 text-[10px]" style={{ borderTop: '1px solid var(--border-primary)', color: 'var(--text-tertiary)' }}>
          {planDisplay.selected_sources?.length > 0 && (
            <span>数据源: {planDisplay.selected_sources.join(', ')}</span>
          )}
          {planDisplay.selected_tools?.length > 0 && (
            <span>工具: {planDisplay.selected_tools.join(', ')}</span>
          )}
        </div>
      )}

      {onExecute && (
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--border-primary)' }}>
          <button
            onClick={onExecute}
            disabled={executing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'var(--accent-500)' }}
          >
            {executing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
            {executing ? '执行中...' : '开始执行'}
          </button>
          <button
            onClick={onDismiss}
            disabled={executing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer disabled:cursor-not-allowed"
            style={{ color: 'var(--text-secondary)', background: 'var(--bg-muted)' }}
          >
            <X className="w-3.5 h-3.5" />
            取消
          </button>
        </div>
      )}
    </div>
  );
}

function StepProgressMessage({ message }) {
  const meta = message.metadata || {};
  const status = meta.status || 'completed';
  const statusColor = status === 'completed' ? '#22c55e' : status === 'failed' ? '#ef4444' : 'var(--accent-500)';

  return (
    <div className="flex items-start gap-2 text-xs">
      <div
        className="w-4 h-4 rounded-full flex items-center justify-center flex-none mt-0.5"
        style={{ background: statusColor + '20' }}
      >
        {status === 'completed' ? (
          <Check className="w-2.5 h-2.5" style={{ color: statusColor }} />
        ) : status === 'failed' ? (
          <X className="w-2.5 h-2.5" style={{ color: statusColor }} />
        ) : (
          <Loader2 className="w-2.5 h-2.5 animate-spin" style={{ color: statusColor }} />
        )}
      </div>
      <div>
        <span style={{ color: 'var(--text-secondary)' }}>{message.content}</span>
      </div>
    </div>
  );
}

function PlanCompleteMessage({ message }) {
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)' }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Check className="w-4 h-4" style={{ color: '#22c55e' }} />
        <span className="text-sm font-medium" style={{ color: '#22c55e' }}>执行完成</span>
      </div>
      <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
        {message.content}
      </p>
    </div>
  );
}

// ── Template Selector ──

function TemplateSelector({ templates, onSelect }) {
  const [expandedId, setExpandedId] = useState(null);
  const [variables, setVariables] = useState({});

  if (!templates || templates.length === 0) return null;

  const handleUse = (template) => {
    let prompt = template.prompt;
    for (const v of template.variables || []) {
      prompt = prompt.replace(`{${v}}`, variables[v] || `{${v}}`);
    }
    onSelect(prompt);
    setExpandedId(null);
    setVariables({});
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
        研究任务模板
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {templates.map((t) => (
          <div
            key={t.id}
            className="rounded-xl transition-all cursor-pointer"
            style={{ background: 'var(--bg-elevated, var(--surface-1))', border: '1px solid var(--border-primary)' }}
          >
            <div
              onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
              className="flex items-center gap-2 px-3 py-2.5"
            >
              <Sparkles className="w-3.5 h-3.5 flex-none" style={{ color: 'var(--accent-500)' }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{t.label}</p>
                <p className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>{t.description}</p>
              </div>
              <ChevronRight
                className="w-3.5 h-3.5 flex-none transition-transform"
                style={{ color: 'var(--text-tertiary)', transform: expandedId === t.id ? 'rotate(90deg)' : 'none' }}
              />
            </div>

            {expandedId === t.id && (
              <div className="px-3 pb-3 space-y-2" style={{ borderTop: '1px solid var(--border-primary)' }}>
                {(t.variables || []).map((v) => (
                  <div key={v} className="pt-2">
                    <label className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                      {v}
                    </label>
                    <input
                      value={variables[v] || ''}
                      onChange={(e) => setVariables((prev) => ({ ...prev, [v]: e.target.value }))}
                      placeholder={`输入 ${v}...`}
                      className="w-full mt-1 px-2 py-1.5 rounded-lg text-xs"
                      style={{
                        background: 'var(--bg-muted)',
                        border: '1px solid var(--border-primary)',
                        color: 'var(--text-primary)',
                        outline: 'none',
                      }}
                    />
                  </div>
                ))}
                <button
                  onClick={() => handleUse(t)}
                  className="w-full mt-1 px-3 py-2 rounded-lg text-xs font-medium text-white cursor-pointer transition-colors"
                  style={{ background: 'var(--accent-500)' }}
                >
                  使用此模板
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main ChatPage ──

function ChatPage() {
  const {
    conversationId, messages, sending, activePlan, executing, templates,
    sendMessage, executePlan, dismissPlan, newConversation, fetchTemplates,
    setSurfaceContext, surfaceContext: storedContext,
  } = useChatStore();
  const { fetchConversations } = useConversationsStore();
  const { showToast } = useUIStore();

  const [input, setInput] = useState('');
  const [pendingActions, setPendingActions] = useState(null);
  const [pendingMessages, setPendingMessages] = useState(null);
  const [pendingToolCalls, setPendingToolCalls] = useState(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [topics, setTopics] = useState([]);
  const [selectedTopicId, setSelectedTopicId] = useState(null); // null = free mode
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Load topics for the topic selector
  useEffect(() => {
    topicsApi.list({ with_count: true })
      .then(data => setTopics(data.topics || []))
      .catch(() => {});
  }, []);

  // Update surfaceContext when topic selection changes
  useEffect(() => {
    if (selectedTopicId) {
      setSurfaceContext({ surface: 'topic', topicId: selectedTopicId });
    } else {
      setSurfaceContext({ surface: 'general' });
    }
  }, [selectedTopicId]);

  useEffect(() => {
    fetchConversations();
    fetchTemplates();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingActions, executing]);

  useEffect(() => { inputRef.current?.focus(); }, [conversationId]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = 'auto';

    try {
      const result = await sendMessage(text);

      // Handle legacy pendingActions (for write tool confirmation)
      if (result?.pendingActions?.length > 0) {
        setPendingActions(result.pendingActions);
        setPendingMessages(result.messages);
        setPendingToolCalls(result.pendingToolCalls);
      }

      // Refresh conversation list
      fetchConversations();
    } catch (err) {
      showToast(toFriendlyChatError(err), 'error');
    }
  };

  const handleConfirm = async () => {
    if (!pendingActions || !pendingMessages || !pendingToolCalls) return;

    try {
      const confirmedIds = pendingActions.map((a) => a.id);
      const data = await chatApi.confirm(pendingMessages, pendingToolCalls, confirmedIds, {
        surfaceContext: storedContext,
      });
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

  const handleExecutePlan = async () => {
    try {
      await executePlan(activePlan?.suggestedTopicId);
      fetchConversations();
    } catch (err) {
      showToast(toFriendlyChatError(err), 'error');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTemplateSelect = (prompt) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  // ── Render ──

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-[calc(100vh-7rem)] lg:h-[calc(100vh-3rem)]">
      {/* Conversation sidebar */}
      {sidebarVisible && (
        <div className="w-56 flex-none hidden lg:block" style={{ background: 'var(--bg-elevated, var(--surface-1))' }}>
          <ConversationSidebar />
        </div>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarVisible(!sidebarVisible)}
              className="p-2 rounded-lg transition-colors hover:bg-black/5 hidden lg:block cursor-pointer"
              style={{ color: 'var(--text-tertiary)' }}
              aria-label="Toggle conversation sidebar"
            >
              <ListChecks className="w-4 h-4" />
            </button>
            <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              AI 对话
            </h1>
            {/* Topic mode selector */}
            <div className="flex items-center gap-1.5 ml-2">
              <div
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs"
                style={{
                  background: selectedTopicId ? 'var(--accent-blue-subtle)' : 'var(--bg-muted)',
                  border: '1px solid var(--border-primary)',
                }}
              >
                {selectedTopicId ? (
                  <BookOpen className="w-3 h-3" style={{ color: 'var(--accent-600)' }} />
                ) : (
                  <Globe className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
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
            </div>
          </div>
          <div className="flex items-center gap-1">
            {hasMessages && (
              <button
                onClick={() => { newConversation(); setPendingActions(null); }}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer"
                style={{ color: 'var(--text-secondary)', background: 'var(--bg-muted)' }}
              >
                <Trash2 className="w-3 h-3" />
                新会话
              </button>
            )}
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {!hasMessages && !pendingActions ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 max-w-xl mx-auto">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--bg-muted)' }}>
                <Bot className="w-6 h-6" style={{ color: 'var(--text-primary)' }} />
              </div>
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                {selectedTopicId
                  ? `已选定主题「${topics.find(t => t.id === selectedTopicId)?.title || ''}」— AI 将基于该主题下的材料回答问题`
                  : '自由模式 — 问我任何关于你的阅读笔记的问题，或选择一个主题进行深度问答'}
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

              {/* Templates */}
              <div className="w-full mt-4">
                <TemplateSelector templates={templates} onSelect={handleTemplateSelect} />
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => {
                // Plan proposal message
                if (msg.message_type === 'plan_proposal') {
                  const isLatestPlan = !messages.slice(i + 1).some((m) => m.message_type === 'plan_confirmed');
                  return (
                    <div key={msg.id || i} className="flex gap-3">
                      <div className="w-7 h-7 rounded-full flex-none flex items-center justify-center mt-0.5" style={{ background: 'var(--bg-muted)' }}>
                        <Bot className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
                      </div>
                      <div className="max-w-[85%]">
                        <PlanProposalCard
                          message={msg}
                          onExecute={isLatestPlan && activePlan ? handleExecutePlan : null}
                          onDismiss={isLatestPlan && activePlan ? dismissPlan : null}
                          executing={executing}
                        />
                      </div>
                    </div>
                  );
                }

                // Step progress message
                if (msg.message_type === 'step_progress') {
                  return (
                    <div key={msg.id || i} className="ml-10">
                      <StepProgressMessage message={msg} />
                    </div>
                  );
                }

                // Plan complete message
                if (msg.message_type === 'plan_complete') {
                  return (
                    <div key={msg.id || i} className="flex gap-3">
                      <div className="w-7 h-7 rounded-full flex-none flex items-center justify-center mt-0.5" style={{ background: 'rgba(34,197,94,0.1)' }}>
                        <Bot className="w-4 h-4" style={{ color: '#22c55e' }} />
                      </div>
                      <div className="max-w-[85%]">
                        <PlanCompleteMessage message={msg} />
                      </div>
                    </div>
                  );
                }

                // Plan confirmed message
                if (msg.message_type === 'plan_confirmed') {
                  return (
                    <div key={msg.id || i} className="flex justify-end gap-3">
                      <div className="px-3 py-1.5 rounded-xl text-xs" style={{ background: 'var(--accent-blue-subtle)', color: 'var(--accent-600)' }}>
                        已确认执行计划
                      </div>
                    </div>
                  );
                }

                // Normal text message
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

              {/* Legacy pending actions confirmation */}
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
                          {action.side_effect === 'destructive' ? (
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
                        <X className="w-3 h-3" />
                        取消
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Execution progress indicator */}
              {executing && (
                <div className="ml-10 flex items-center gap-2 text-xs" style={{ color: 'var(--accent-500)' }}>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>正在执行计划...</span>
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

        {/* Input area */}
        <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border-primary)' }}>
          <div
            className="flex items-end gap-2 rounded-xl p-2"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-primary)' }}
          >
            <textarea
              ref={inputRef}
              id="chat-input"
              name="chat_input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Chat input"
              placeholder={pendingActions ? '请先确认或取消待执行操作' : '输入问题或描述研究任务...'}
              rows={1}
              disabled={!!pendingActions || executing}
              className="textarea flex-1 resize-none text-sm px-2 py-2 disabled:opacity-50"
              style={{ maxHeight: '120px' }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending || !!pendingActions || executing}
              aria-label="Send message"
              className="btn btn-primary flex-none w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs px-1 mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Enter 发送 | Shift+Enter 换行 | 输入研究意图将自动生成执行计划
          </p>
        </div>
      </div>
    </div>
  );
}

export default ChatPage;
