import { useState, useRef, useEffect } from 'react';
import { Send, Bot, Loader2, X, Check, ShieldCheck, ShieldAlert, MessageCircle, Minimize2 } from 'lucide-react';
import { chatApi } from '../lib/api';
import { useUIStore } from '../lib/store';

/**
 * Floating chat panel for ThinkingBoard.
 * Props:
 *   boardId  - current board ID (injected into system prompt context)
 *   topicId  - current topic ID
 *   topicTitle - topic title for display
 *   onBoardMutated - callback when AI writes to the board (triggers reload)
 */
function BoardChatPanel({ boardId, topicId, topicTitle, onBoardMutated }) {
  const [open, setOpen] = useState(false);
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
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  // Build context-aware system message
  const buildSystemContext = () => ({
    role: 'system',
    content: `You are a research assistant helping the user work on their thinking board.
Current board_id: ${boardId}
Current topic_id: ${topicId}
Topic: ${topicTitle || 'Unknown'}

You can read the board data, search cards, and create/update/delete nodes and edges on this board.
When creating nodes, always use board_id "${boardId}".
When the user asks to add hypotheses, questions, or evidence, use the appropriate create_board_node tool.
Be concise. Answer in the same language the user uses.`,
  });

  // Check if response contains write operations that were executed
  const hasWriteOps = (data) => {
    if (!data.messages) return false;
    return data.messages.some(
      (m) => m.role === 'tool' && m.content && !m.content.includes('"error"') &&
        (m.content.includes('"node"') || m.content.includes('"edge"') || m.content.includes('"success":true'))
    );
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', content: text };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput('');
    setLoading(true);

    try {
      // Prepend system context
      const apiMessages = [buildSystemContext(), ...allMessages];
      const data = await chatApi.send(apiMessages);

      if (!data.ok) {
        showToast(data.error || '请求失败', 'error');
        return;
      }

      if (data.pendingActions?.length > 0) {
        setPendingActions(data.pendingActions);
        setPendingMessages(data.messages);
        setPendingToolCalls(data.pendingToolCalls);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
        if (hasWriteOps(data) && onBoardMutated) onBoardMutated();
      }
    } catch (err) {
      showToast(err.message || '网络错误', 'error');
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
        showToast(data.error || '执行失败', 'error');
        return;
      }

      if (data.pendingActions?.length > 0) {
        setPendingActions(data.pendingActions);
        setPendingMessages(data.messages);
        setPendingToolCalls(data.pendingToolCalls);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
        if (hasWriteOps(data) && onBoardMutated) onBoardMutated();
      }
    } catch (err) {
      showToast(err.message || '网络错误', 'error');
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

  // Collapsed: floating button
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full flex items-center justify-center transition-all glass-surface"
        style={{
          background: 'var(--accent-500)',
          color: '#fff',
          boxShadow: '0 4px 24px rgba(99,102,241,0.4)',
        }}
        title="AI 助手"
      >
        <MessageCircle className="w-5 h-5" />
      </button>
    );
  }

  // Expanded: chat panel
  return (
    <div
      className="fixed bottom-6 right-6 z-50 w-96 flex flex-col rounded-2xl overflow-hidden"
      style={{
        height: '520px',
        background: 'var(--surface-1)',
        border: '1px solid var(--stroke-0)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-none" style={{ borderBottom: '1px solid var(--stroke-0)' }}>
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4" style={{ color: 'var(--accent-400)' }} />
          <span className="text-sm font-bold" style={{ color: 'var(--text-0)' }}>AI 助手</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent-300)' }}>
            {topicTitle || 'Board'}
          </span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="p-1 rounded transition-colors"
          style={{ color: 'var(--text-2)' }}
        >
          <Minimize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && !pendingActions && (
          <div className="h-full flex flex-col items-center justify-center gap-2">
            <Bot className="w-8 h-8" style={{ color: 'var(--accent-400)', opacity: 0.4 }} />
            <p className="text-xs text-center" style={{ color: 'var(--text-2)' }}>
              试试: "帮我分析这个问题"<br />"基于卡片生成假说"
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full flex-none flex items-center justify-center mt-0.5" style={{ background: 'rgba(99,102,241,0.12)' }}>
                <Bot className="w-3.5 h-3.5" style={{ color: 'var(--accent-400)' }} />
              </div>
            )}
            <div
              className="max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap"
              style={
                msg.role === 'user'
                  ? { background: 'var(--accent-500)', color: '#fff' }
                  : { background: 'var(--bg-1)', color: 'var(--text-0)', border: '1px solid var(--stroke-0)' }
              }
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Pending actions */}
        {pendingActions && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full flex-none flex items-center justify-center mt-0.5" style={{ background: 'rgba(245,158,11,0.15)' }}>
              <ShieldCheck className="w-3.5 h-3.5" style={{ color: '#F59E0B' }} />
            </div>
            <div className="flex-1 rounded-xl px-3 py-2.5" style={{ background: 'var(--bg-1)', border: '1px solid rgba(245,158,11,0.3)' }}>
              <p className="text-[10px] font-medium mb-1.5" style={{ color: '#F59E0B' }}>请确认以下操作：</p>
              <div className="space-y-1 mb-2">
                {pendingActions.map((a) => (
                  <div key={a.id} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-0)' }}>
                    {a.side_effect === 'destructive'
                      ? <ShieldAlert className="w-3 h-3 flex-none" style={{ color: '#EF4444' }} />
                      : <ShieldCheck className="w-3 h-3 flex-none" style={{ color: '#F59E0B' }} />}
                    <span>{a.confirm_message}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5">
                <button onClick={handleConfirm} disabled={loading}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium disabled:opacity-50"
                  style={{ background: 'var(--accent-500)', color: '#fff' }}>
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} 确认
                </button>
                <button onClick={handleCancel} disabled={loading}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium disabled:opacity-50"
                  style={{ color: 'var(--text-2)', border: '1px solid var(--stroke-0)' }}>
                  <X className="w-3 h-3" /> 取消
                </button>
              </div>
            </div>
          </div>
        )}

        {loading && !pendingActions && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full flex-none flex items-center justify-center mt-0.5" style={{ background: 'rgba(99,102,241,0.12)' }}>
              <Bot className="w-3.5 h-3.5" style={{ color: 'var(--accent-400)' }} />
            </div>
            <div className="rounded-xl px-3 py-2" style={{ background: 'var(--bg-1)', border: '1px solid var(--stroke-0)' }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--text-2)' }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-none flex items-end gap-1.5 p-2" style={{ borderTop: '1px solid var(--stroke-0)' }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入指令..."
          rows={1}
          disabled={!!pendingActions}
          className="flex-1 resize-none bg-transparent text-xs px-2 py-2 outline-none disabled:opacity-50"
          style={{ color: 'var(--text-0)', maxHeight: '80px' }}
          onInput={(e) => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px';
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading || !!pendingActions}
          className="flex-none w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40"
          style={{ background: 'var(--accent-500)', color: '#fff' }}
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default BoardChatPanel;
