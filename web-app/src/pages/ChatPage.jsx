import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Trash2, ShieldCheck, ShieldAlert, X, Check } from 'lucide-react';
import { chatApi } from '../lib/api';
import { useUIStore } from '../lib/store';

const QUICK_PROMPTS = [
  '帮我总结最近一周新增卡片的核心趋势',
  '按 Topic 列出证据最充分和最薄弱的结论',
  '基于当前卡片，给出 3 个可验证的新假设',
];

function toFriendlyChatError(error) {
  const message = error?.message || '';
  const normalized = message.toLowerCase();

  if (error?.status >= 500 || normalized.includes('fetch failed')) {
    return 'AI 服务暂时不可用，请检查后端服务与模型配置';
  }

  return message || '请求失败';
}

function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingActions, setPendingActions] = useState(null);
  const [pendingMessages, setPendingMessages] = useState(null);
  const [pendingToolCalls, setPendingToolCalls] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const { showToast } = useUIStore();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => { scrollToBottom(); }, [messages, pendingActions]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const data = await chatApi.send(newMessages);
      if (!data.ok) {
        const errorMessage = toFriendlyChatError({ message: data.error, status: data.status });
        showToast(errorMessage, 'error');
        setMessages((prev) => [...prev, { role: 'assistant', content: `系统提示：${errorMessage}` }]);
        return;
      }

      if (data.pendingActions && data.pendingActions.length > 0) {
        setPendingActions(data.pendingActions);
        setPendingMessages(data.messages);
        setPendingToolCalls(data.pendingToolCalls);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
      }
    } catch (err) {
      const errorMessage = toFriendlyChatError(err);
      showToast(errorMessage, 'error');
      setMessages((prev) => [...prev, { role: 'assistant', content: `系统提示：${errorMessage}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!pendingActions || !pendingMessages || !pendingToolCalls) return;
    setLoading(true);

    try {
      const confirmedIds = pendingActions.map((a) => a.id);
      const data = await chatApi.confirm(pendingMessages, pendingToolCalls, confirmedIds);
      setPendingActions(null);
      setPendingMessages(null);
      setPendingToolCalls(null);

      if (!data.ok) {
        const errorMessage = toFriendlyChatError({ message: data.error, status: data.status });
        showToast(errorMessage, 'error');
        setMessages((prev) => [...prev, { role: 'assistant', content: `系统提示：${errorMessage}` }]);
        return;
      }

      if (data.pendingActions && data.pendingActions.length > 0) {
        setPendingActions(data.pendingActions);
        setPendingMessages(data.messages);
        setPendingToolCalls(data.pendingToolCalls);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
      }
    } catch (err) {
      const errorMessage = toFriendlyChatError(err);
      showToast(errorMessage, 'error');
      setMessages((prev) => [...prev, { role: 'assistant', content: `系统提示：${errorMessage}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setPendingActions(null);
    setPendingMessages(null);
    setPendingToolCalls(null);
    setMessages((prev) => [...prev, { role: 'assistant', content: '操作已取消。' }]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] lg:h-[calc(100vh-3rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>AI 对话</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>基于你的卡片和笔记进行智能对话</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => { setMessages([]); setPendingActions(null); setPendingMessages(null); setPendingToolCalls(null); }}
            className="btn btn-secondary flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            清空
          </button>
        )}
      </div>

      {/* Messages area */}
      <div
        className="flex-1 overflow-y-auto rounded-xl p-4 space-y-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border-primary)' }}
      >
        {messages.length === 0 && !pendingActions ? (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--bg-muted)' }}>
              <Bot className="w-6 h-6" style={{ color: 'var(--text-primary)' }} />
            </div>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>问我任何关于你的阅读笔记的问题</p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 max-w-[680px]">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => {
                    setInput(prompt);
                    inputRef.current?.focus();
                  }}
                  className="px-3 py-1.5 rounded-full text-xs transition-colors"
                  style={{
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full flex-none flex items-center justify-center mt-0.5" style={{ background: 'var(--bg-muted)' }}>
                    <Bot className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
                  </div>
                )}
                <div
                  className="max-w-[75%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
                  style={
                    msg.role === 'user'
                      ? { background: 'var(--interactive-primary)', color: '#fff' }
                      : { background: 'var(--bg-muted)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }
                  }
                >
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full flex-none flex items-center justify-center mt-0.5" style={{ background: 'var(--bg-muted)' }}>
                    <User className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
                  </div>
                )}
              </div>
            ))}

            {/* Pending actions confirmation card */}
            {pendingActions && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full flex-none flex items-center justify-center mt-0.5" style={{ background: 'rgba(245,158,11,0.15)' }}>
                  <ShieldCheck className="w-4 h-4" style={{ color: 'var(--warning)' }} />
                </div>
                <div
                  className="flex-1 max-w-[85%] rounded-xl px-4 py-3"
                  style={{ background: 'var(--bg-muted)', border: '1px solid rgba(245,158,11,0.3)' }}
                >
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
                    <button
                      onClick={handleConfirm}
                      disabled={loading}
                      className="btn btn-primary flex items-center gap-1.5"
                    >
                      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      确认执行
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={loading}
                      className="btn btn-secondary flex items-center gap-1.5"
                    >
                      <X className="w-3 h-3" />
                      取消
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {loading && !pendingActions && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full flex-none flex items-center justify-center mt-0.5" style={{ background: 'var(--bg-muted)' }}>
              <Bot className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
            </div>
            <div className="rounded-xl px-3.5 py-2.5 text-sm" style={{ background: 'var(--bg-muted)', border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}>
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="mt-3 space-y-2">
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
            placeholder={pendingActions ? '请先确认或取消待执行操作' : '输入你的问题...'}
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
            disabled={!input.trim() || loading || !!pendingActions}
            aria-label="Send message"
            className="btn btn-primary flex-none w-9 h-9 rounded-lg flex items-center justify-center"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs px-1" style={{ color: 'var(--text-tertiary)' }}>
          Enter 发送，Shift+Enter 换行
        </p>
      </div>
    </div>
  );
}

export default ChatPage;
