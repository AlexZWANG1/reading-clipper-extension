import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Minus, Send, Loader2, Check, Trash2, ShieldCheck, Wrench, ChevronDown, ChevronRight } from 'lucide-react';
import { useSurfaceContext } from '../hooks/useSurfaceContext';
import { useChatStore } from '../lib/store';
import { chatApi } from '../lib/api';
import ChatMessage from './ChatMessage';

const MODES = [
  { key: 'chat', label: '聊天' },
  { key: 'agent', label: '代理' },
  { key: 'auto', label: '自动' },
];

function ToolCallLog({ toolCalls }) {
  const [expanded, setExpanded] = useState(false);
  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div
      className="rounded-lg text-xs"
      style={{
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border-primary)',
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-left"
        style={{ color: 'var(--text-secondary)' }}
      >
        <Wrench size={11} style={{ color: 'var(--ai-accent)' }} />
        <span>执行了 {toolCalls.length} 个工具</span>
        {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </button>
      {expanded && (
        <div className="px-2.5 pb-2 space-y-1">
          {toolCalls.map((tc) => (
            <div
              key={tc.id}
              className="flex items-start gap-1.5 py-0.5"
              style={{ color: tc.status === 'error' ? 'var(--error)' : 'var(--text-secondary)' }}
            >
              <span
                className="shrink-0 w-1.5 h-1.5 rounded-full mt-1"
                style={{ background: tc.status === 'error' ? 'var(--error)' : 'var(--success)' }}
              />
              <span>
                <strong>{tc.tool}</strong> → {tc.result_summary}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GlobalChatPanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState(null);
  // pendingActions state for write confirmation
  const [pendingActions, setPendingActions] = useState(null);
  const [pendingMessages, setPendingMessages] = useState(null);
  const [pendingToolCalls, setPendingToolCalls] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const textareaRef = useRef(null);
  const surfaceContext = useSurfaceContext();
  const {
    messages, sending, sendMessage, mode, setMode, setSurfaceContext, newConversation,
    surfaceContext: storedContext,
  } = useChatStore();

  // Update surface context when route changes
  // Only overwrite if route provides topicId/materialId, or if surface type changed
  useEffect(() => {
    const stored = useChatStore.getState().surfaceContext;
    const routeHasSpecificContext = surfaceContext.topicId || surfaceContext.materialId;
    const surfaceChanged = !stored || stored.surface !== surfaceContext.surface;
    if (surfaceChanged || routeHasSpecificContext) {
      setSurfaceContext(surfaceContext);
    }
  }, [surfaceContext.surface, surfaceContext.topicId, surfaceContext.materialId, surfaceContext.boardId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingActions]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Clear error after 5s
  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(t);
    }
  }, [error]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setError(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      const result = await sendMessage(text);

      // Handle pendingActions (write tool confirmation)
      if (result?.pendingActions?.length > 0) {
        setPendingActions(result.pendingActions);
        setPendingMessages(result.messages);
        setPendingToolCalls(result.pendingToolCalls);
      }
    } catch (err) {
      const msg = err?.message || '';
      if (msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timeout')) {
        setError('AI 响应超时，请稍后重试');
      } else {
        setError(msg || '请求失败，请重试');
      }
    }
  };

  const handleConfirm = async () => {
    if (!pendingActions || !pendingMessages || !pendingToolCalls) return;
    setConfirming(true);
    try {
      const confirmedIds = pendingActions.map((a) => a.id);
      const data = await chatApi.confirm(pendingMessages, pendingToolCalls, confirmedIds, {
        surfaceContext: storedContext,
      });
      setPendingActions(null);
      setPendingMessages(null);
      setPendingToolCalls(null);

      // If more pending actions returned, handle them
      if (data.pendingActions?.length > 0) {
        setPendingActions(data.pendingActions);
        setPendingMessages(data.messages);
        setPendingToolCalls(data.pendingToolCalls);
      }
    } catch (err) {
      setError(err?.message || '确认操作失败');
    } finally {
      setConfirming(false);
    }
  };

  const handleCancelActions = () => {
    setPendingActions(null);
    setPendingMessages(null);
    setPendingToolCalls(null);
  };

  const handleNewConversation = () => {
    newConversation();
    setPendingActions(null);
    setPendingMessages(null);
    setPendingToolCalls(null);
    setError(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasMessages = messages.length > 0;

  // Surface context indicator
  const surfaceLabel = {
    board: '画板',
    reader: '阅读器',
    cards: '卡片',
    general: null,
  }[surfaceContext.surface];

  // Collapsed state: floating purple button
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full flex items-center justify-center transition-all"
        style={{
          background: 'var(--ai-accent)',
          color: '#fff',
          boxShadow: '0 10px 24px rgba(139, 92, 246, 0.35)',
        }}
        title="Verity AI"
      >
        <MessageCircle size={22} />
      </button>
    );
  }

  // Expanded state: chat panel
  return (
    <div
      className="fixed bottom-6 right-6 z-50 rounded-2xl flex flex-col overflow-hidden"
      style={{
        width: 'min(400px, calc(100vw - 48px))',
        height: 'min(560px, calc(100vh - 100px))',
        background: 'var(--surface)',
        border: '1px solid var(--border-primary)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 flex-none"
        style={{
          borderBottom: '1px solid var(--border-primary)',
          background: 'var(--bg-subtle)',
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="font-semibold text-sm"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
          >
            Verity AI
          </span>
          {surfaceLabel && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-md"
              style={{ background: 'var(--ai-accent-subtle)', color: 'var(--ai-accent)' }}
            >
              {surfaceLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Mode toggle */}
          <div
            className="flex rounded-lg p-0.5 mr-1"
            style={{ background: 'var(--bg-muted)' }}
          >
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className="px-2 py-0.5 rounded-md text-[11px] transition-colors"
                style={
                  mode === m.key
                    ? {
                        background: 'var(--surface-raised)',
                        boxShadow: 'var(--shadow-sm)',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                      }
                    : { color: 'var(--text-tertiary)' }
                }
                title={m.label}
              >
                {m.label}
              </button>
            ))}
          </div>
          {/* New conversation */}
          {hasMessages && (
            <button
              onClick={handleNewConversation}
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--text-tertiary)' }}
              title="新会话"
            >
              <Trash2 size={13} />
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
            title="最小化"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
            title="关闭"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && !sending && !pendingActions && (
          <div
            className="text-center text-sm mt-8"
            style={{ color: 'var(--text-tertiary)' }}
          >
            有什么可以帮你的？
          </div>
        )}
        {messages.map((msg, i) => {
          // Render tool call log as collapsible component
          if (msg.message_type === 'tool_calls' && msg.metadata?.tool_calls) {
            return (
              <ToolCallLog key={msg.id || i} toolCalls={msg.metadata.tool_calls} />
            );
          }

          return (
            <div
              key={msg.id || i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className="max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed"
                style={
                  msg.role === 'user'
                    ? { background: 'var(--ai-accent)', color: '#fff' }
                    : {
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-primary)',
                      }
                }
              >
                <ChatMessage content={msg.content} role={msg.role} />
              </div>
            </div>
          );
        })}

        {/* Pending write actions confirmation */}
        {pendingActions && (
          <div
            className="rounded-xl px-3 py-2.5"
            style={{
              background: 'var(--warning-subtle)',
              border: '1px solid var(--warning)',
            }}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <ShieldCheck size={14} style={{ color: 'var(--warning)' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--warning)' }}>
                AI 请求执行操作
              </span>
            </div>
            <div className="space-y-1 mb-2.5">
              {pendingActions.map((action) => (
                <div key={action.id} className="text-xs" style={{ color: 'var(--text-primary)' }}>
                  • {action.confirm_message}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-white disabled:opacity-50"
                style={{ background: 'var(--success)' }}
              >
                {confirming ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                确认
              </button>
              <button
                onClick={handleCancelActions}
                disabled={confirming}
                className="px-2.5 py-1 rounded-md text-xs"
                style={{ color: 'var(--text-secondary)', background: 'var(--bg-muted)' }}
              >
                取消
              </button>
            </div>
          </div>
        )}

        {sending && (
          <div className="flex justify-start">
            <div
              className="px-3 py-2 rounded-xl text-sm flex items-center gap-2"
              style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-tertiary)',
              }}
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              思考中...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error bar */}
      {error && (
        <div
          className="px-3 py-2 text-xs"
          style={{ background: 'var(--error-subtle)', color: 'var(--error)' }}
        >
          {error}
        </div>
      )}

      {/* Input */}
      <div
        className="flex-none px-3 py-2 flex items-center gap-2"
        style={{ borderTop: '1px solid var(--border-primary)' }}
      >
        <textarea
          ref={(el) => { inputRef.current = el; textareaRef.current = el; }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={pendingActions ? '请先确认或取消操作' : '输入消息...'}
          rows={1}
          disabled={sending || !!pendingActions}
          className="flex-1 resize-none text-sm rounded-lg px-3 py-2 outline-none disabled:opacity-50"
          style={{
            background: 'var(--surface-raised)',
            border: '1px solid var(--border-primary)',
            color: 'var(--text-primary)',
          }}
          onInput={(e) => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending || !!pendingActions}
          className="p-2 rounded-lg transition-colors disabled:opacity-40 flex items-center justify-center"
          style={{ background: 'var(--ai-accent)', color: '#fff' }}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
