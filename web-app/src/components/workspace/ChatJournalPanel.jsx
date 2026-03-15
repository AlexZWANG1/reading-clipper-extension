// ========= ChatJournalPanel — Workspace Chat + Journal Stream (Spec §5, §9) =========
// Always-visible right column in workspace. Evolved from GlobalChatPanel.
// Differences from GlobalChatPanel:
//   - Always visible (no open/close/minimize)
//   - Fixed column layout (not floating overlay)
//   - JournalBlock rendering for AI reasoning entries
//   - Wider panel, integrated surface context

import { useState, useRef, useEffect, useCallback } from 'react';
import {
    Send, Loader2, Check, Trash2, ShieldCheck, Wrench,
    Play, XCircle, ChevronDown, ChevronRight, BookOpen,
} from 'lucide-react';
import { useSurfaceContext } from '../../hooks/useSurfaceContext';
import { useChatStore, useWorkspaceStore } from '../../lib/store';
import { chatApi } from '../../lib/api';
import { shouldShowJournalBlock, AUTONOMY_TO_MODE } from '../../lib/chat-utils';
import ChatMessage from '../ChatMessage';
import ResearchRunProgress from './ResearchRunProgress';

const MODES = [
    { key: 'chat', label: '聊天' },
    { key: 'agent', label: '代理' },
    { key: 'auto', label: '自动' },
];

// ========= Sub-components =========

function ToolCallLog({ toolCalls }) {
    const [expanded, setExpanded] = useState(false);
    if (!toolCalls || toolCalls.length === 0) return null;

    return (
        <div className="rounded-lg text-xs" style={{ background: 'var(--surface-1)', border: '1px solid var(--stroke-0)' }}>
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-left"
                style={{ color: 'var(--text-2)' }}
            >
                <Wrench size={11} style={{ color: 'var(--accent-400)' }} />
                <span>执行了 {toolCalls.length} 个工具</span>
                {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </button>
            {expanded && (
                <div className="px-2.5 pb-2 space-y-1">
                    {toolCalls.map((tc) => (
                        <div
                            key={tc.id}
                            className="flex items-start gap-1.5 py-0.5"
                            style={{ color: tc.status === 'error' ? '#C33A30' : 'var(--text-2)' }}
                        >
                            <span
                                className="shrink-0 w-1.5 h-1.5 rounded-full mt-1"
                                style={{ background: tc.status === 'error' ? '#C33A30' : '#18A06A' }}
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

function PlanProposal({ plan, onExecute, onDismiss, executing }) {
    if (!plan) return null;

    return (
        <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid var(--accent-400)' }}>
            <div className="flex items-center gap-1.5 mb-2">
                <Play size={14} style={{ color: 'var(--accent-400)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--accent-400)' }}>
                    执行计划
                </span>
            </div>
            <div className="text-xs mb-2.5 space-y-1" style={{ color: 'var(--text-0)' }}>
                {plan.planDisplay?.summary && <p>{plan.planDisplay.summary}</p>}
                {plan.planSpec?.steps?.map((step, i) => (
                    <div key={step.id || i} style={{ color: 'var(--text-2)' }}>
                        {i + 1}. {step.title}
                    </div>
                ))}
            </div>
            <div className="flex gap-2">
                <button
                    onClick={onExecute}
                    disabled={executing}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-white disabled:opacity-50"
                    style={{ background: 'var(--accent-500)' }}
                >
                    {executing ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
                    执行
                </button>
                <button
                    onClick={onDismiss}
                    disabled={executing}
                    className="px-2.5 py-1 rounded-md text-xs"
                    style={{ color: 'var(--text-2)', background: 'var(--surface-1)' }}
                >
                    取消
                </button>
            </div>
        </div>
    );
}

function JournalBlock({ content, timestamp }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="rounded-xl px-3 py-2.5 my-2" style={{ background: 'var(--surface-1)', border: '1px solid var(--stroke-0)' }}>
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1.5 w-full text-left"
                style={{ color: 'var(--text-2)' }}
            >
                <BookOpen size={12} style={{ color: 'var(--accent-400)' }} />
                <span className="text-[11px] font-medium flex-1" style={{ color: 'var(--accent-400)' }}>
                    AI 推理过程
                </span>
                {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </button>
            {expanded && (
                <div className="mt-2 text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-1)' }}>
                    {content}
                </div>
            )}
        </div>
    );
}

// ========= Main Panel =========

const INTERVENTION_KEYWORDS = {
    '暂停': 'pause', 'pause': 'pause',
    '继续': 'resume', 'resume': 'resume',
    '停止': 'stop', 'stop': 'stop',
};

export default function ChatJournalPanel({ className }) {
    const [input, setInput] = useState('');
    const [error, setError] = useState(null);
    const [pendingActions, setPendingActions] = useState(null);
    const [pendingMessages, setPendingMessages] = useState(null);
    const [pendingToolCalls, setPendingToolCalls] = useState(null);
    const [confirming, setConfirming] = useState(false);

    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);
    const surfaceContext = useSurfaceContext();
    const {
        messages, sending, sendMessage, mode, setMode, setSurfaceContext, newConversation,
        activePlan, executing, executePlan, dismissPlan, surfaceContext: storedContext,
    } = useChatStore();

    const autonomyLevel = useWorkspaceStore(s => s.autonomyLevel);

    // Update surface context
    useEffect(() => {
        const stored = useChatStore.getState().surfaceContext;
        const routeHasSpecificContext = surfaceContext.topicId || surfaceContext.materialId;
        const surfaceChanged = !stored || stored.surface !== surfaceContext.surface;
        if (surfaceChanged || routeHasSpecificContext) {
            setSurfaceContext(surfaceContext);
        }
    }, [surfaceContext.surface, surfaceContext.topicId, surfaceContext.materialId]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, pendingActions, activePlan]);

    // Clear error after 5s
    useEffect(() => {
        if (error) {
            const t = setTimeout(() => setError(null), 5000);
            return () => clearTimeout(t);
        }
    }, [error]);

    // Intercept tool results during Research Run → push to board
    const handleToolResultForBoard = useCallback((toolCalls) => {
        const { autonomyLevel: level, addBoardNode } = useWorkspaceStore.getState();
        if (level !== 'run') return;
        for (const tc of toolCalls) {
            const name = tc.name || tc.function?.name || tc.tool;
            const result = tc.result || tc.output || tc.result_summary;
            if (!result) continue;
            if (name === 'create_board_node' && typeof result === 'object' && result.node) {
                addBoardNode(result.node);
            }
        }
    }, []);

    // Sync mode toggle → autonomy level
    const handleModeChange = useCallback((newMode) => {
        setMode(newMode);
        const levelMap = { chat: 'explore', agent: 'agent', auto: 'run' };
        useWorkspaceStore.getState().setAutonomyLevel(levelMap[newMode] || 'explore');
    }, [setMode]);

    const handleSend = useCallback(async () => {
        const text = input.trim();
        if (!text || sending) return;
        setInput('');
        setError(null);
        if (textareaRef.current) textareaRef.current.style.height = 'auto';

        // Intervention keyword detection during Research Run
        const { autonomyLevel: curLevel, activeResearchRun, setActiveResearchRun } = useWorkspaceStore.getState();
        if (curLevel === 'run') {
            const keyword = INTERVENTION_KEYWORDS[text.toLowerCase()];
            if (keyword === 'pause') {
                setActiveResearchRun({ ...activeResearchRun, status: 'paused' });
            } else if (keyword === 'resume') {
                setActiveResearchRun({ ...activeResearchRun, status: 'running' });
            } else if (keyword === 'stop') {
                setActiveResearchRun({ ...activeResearchRun, status: 'completed' });
                useWorkspaceStore.getState().setAutonomyLevel('explore');
                useWorkspaceStore.getState().invalidateBoard();
                useWorkspaceStore.getState().setLayoutMode('dagre');
            }
        }

        try {
            const result = await sendMessage(text);
            if (result?.pendingActions?.length > 0) {
                setPendingActions(result.pendingActions);
                setPendingMessages(result.messages);
                setPendingToolCalls(result.pendingToolCalls);
            }
            // Check for tool calls to forward to board
            if (result?.toolCalls) {
                handleToolResultForBoard(result.toolCalls);
            }
        } catch (err) {
            const msg = err?.message || '';
            if (msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timeout')) {
                setError('AI 响应超时，请稍后重试');
            } else {
                setError(msg || '请求失败，请重试');
            }
        }
    }, [input, sending, sendMessage, handleToolResultForBoard]);

    const handleConfirm = async () => {
        if (!pendingActions || !pendingMessages || !pendingToolCalls) return;
        setConfirming(true);
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

    const handleExecutePlan = async () => {
        try {
            await executePlan(storedContext?.topicId || null);
        } catch (err) {
            setError(err?.message || '计划执行失败');
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const hasMessages = messages.length > 0;
    const inputDisabled = sending || !!pendingActions || executing;

    const surfaceLabel = {
        workspace: '工作区',
        board: '画板',
        reader: '阅读器',
        cards: '卡片',
        general: null,
    }[surfaceContext.surface];

    return (
        <div
            className={`flex flex-col h-full ${className || ''}`}
            style={{ background: 'var(--surface-0)', borderLeft: '1px solid var(--stroke-0)' }}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 flex-none" style={{ borderBottom: '1px solid var(--stroke-0)' }}>
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm" style={{ color: 'var(--text-0)' }}>
                        Verity AI
                    </span>
                    {surfaceLabel && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(139,92,246,0.08)', color: 'var(--accent-400)' }}>
                            {surfaceLabel}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    {/* Mode toggle */}
                    <div className="flex rounded-lg p-0.5 mr-1" style={{ background: 'var(--surface-1)' }}>
                        {MODES.map((m) => (
                            <button
                                key={m.key}
                                onClick={() => handleModeChange(m.key)}
                                className="px-2 py-0.5 rounded-md text-[11px] transition-colors"
                                style={
                                    mode === m.key
                                        ? { background: 'var(--surface-0)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', fontWeight: 600, color: 'var(--text-0)' }
                                        : { color: 'var(--text-2)' }
                                }
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={handleNewConversation}
                        className="p-1.5 rounded-lg transition-colors hover:bg-blue-500/10"
                        style={{ color: 'var(--text-2)' }}
                        title="新对话"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            {/* Research Run progress bar */}
            <ResearchRunProgress className="shrink-0" />

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {!hasMessages && !sending && !pendingActions && !activePlan && (
                    <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--text-2)' }}>
                        <span className="text-sm">有什么可以帮你的？</span>
                        <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                            在这里向 AI 提问、指挥研究
                        </span>
                    </div>
                )}

                {messages.map((msg, i) => {
                    if (msg.message_type === 'tool_calls') {
                        return <ToolCallLog key={msg.id || i} toolCalls={msg.metadata?.tool_calls} />;
                    }
                    if (msg.message_type === 'journal') {
                        if (msg.role !== 'user' && !shouldShowJournalBlock(msg, autonomyLevel)) {
                            return null;
                        }
                        return <JournalBlock key={msg.id || i} content={msg.content} timestamp={msg.created_at} />;
                    }
                    return (
                        <div key={msg.id || i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div
                                className="rounded-xl px-3 py-2 text-sm max-w-[85%]"
                                style={
                                    msg.role === 'user'
                                        ? { background: 'var(--accent-500)', color: '#fff' }
                                        : { background: 'var(--surface-1)', border: '1px solid var(--stroke-0)', color: 'var(--text-0)' }
                                }
                            >
                                <ChatMessage message={msg} />
                            </div>
                        </div>
                    );
                })}

                {/* Plan proposal */}
                {activePlan && (
                    <PlanProposal
                        plan={activePlan}
                        onExecute={handleExecutePlan}
                        onDismiss={dismissPlan}
                        executing={executing}
                    />
                )}

                {/* Write confirmation */}
                {pendingActions && (
                    <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid var(--stroke-1)' }}>
                        <div className="flex items-center gap-1.5 mb-2">
                            <ShieldCheck size={14} style={{ color: '#D97706' }} />
                            <span className="text-xs font-medium" style={{ color: '#D97706' }}>
                                需要确认
                            </span>
                        </div>
                        <div className="space-y-1 mb-2.5">
                            {pendingActions.map((action) => (
                                <div key={action.id} className="text-xs" style={{ color: 'var(--text-1)' }}>
                                    • {action.confirm_message}
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleConfirm}
                                disabled={confirming}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-white disabled:opacity-50"
                                style={{ background: '#18A06A' }}
                            >
                                {confirming ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                                确认
                            </button>
                            <button
                                onClick={handleCancelActions}
                                disabled={confirming}
                                className="px-2.5 py-1 rounded-md text-xs"
                                style={{ color: 'var(--text-2)', background: 'var(--surface-1)' }}
                            >
                                取消
                            </button>
                        </div>
                    </div>
                )}

                {/* Sending indicator */}
                {sending && (
                    <div className="flex justify-start">
                        <div className="rounded-xl px-3 py-2 flex items-center gap-2" style={{ background: 'var(--surface-1)', border: '1px solid var(--stroke-0)' }}>
                            <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-400)' }} />
                            <span className="text-xs" style={{ color: 'var(--text-2)' }}>思考中...</span>
                        </div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(195,58,48,0.08)', border: '1px solid rgba(195,58,48,0.2)', color: '#C33A30' }}>
                        {error}
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 flex-none" style={{ borderTop: '1px solid var(--stroke-0)' }}>
                {/* Autonomy mode badge */}
                <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{
                        background: autonomyLevel === 'run' ? 'rgba(24,160,106,0.12)' :
                                    autonomyLevel === 'agent' ? 'rgba(13,110,253,0.12)' :
                                    'rgba(0,0,0,0.06)',
                        color: autonomyLevel === 'run' ? '#18A06A' :
                               autonomyLevel === 'agent' ? 'var(--accent-400)' :
                               'var(--text-2)',
                    }}>
                        {autonomyLevel === 'run' ? 'Research Run' :
                         autonomyLevel === 'agent' ? '代理' : '探索'}
                    </span>
                </div>
                <div className="flex items-end gap-2">
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => {
                            setInput(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                        }}
                        onKeyDown={handleKeyDown}
                        disabled={inputDisabled}
                        placeholder={inputDisabled ? '等待中...' :
                            autonomyLevel === 'run' ? '输入指令干预研究方向...' :
                            autonomyLevel === 'agent' ? '告诉 AI 你想做什么...' :
                            '问任何关于这个研究的问题...'}
                        rows={1}
                        className="flex-1 px-3 py-2 text-sm rounded-xl resize-none outline-none disabled:opacity-50"
                        style={{
                            background: 'var(--surface-1)',
                            border: '1px solid var(--stroke-0)',
                            color: 'var(--text-0)',
                            maxHeight: 120,
                        }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={inputDisabled || !input.trim()}
                        className="p-2 rounded-xl transition-colors disabled:opacity-30"
                        style={{ background: 'var(--accent-500)', color: '#fff' }}
                    >
                        <Send size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
