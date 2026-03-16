// ========= DocumentView — Editable Research Report (Spec §4, §14) =========
// Two-face ("一体两面") of the same board data as BoardCanvas.
// Each question becomes a section, hypotheses become subsections with
// evidence bullets and confidence indicators.
// Editing here saves via boardsApi and syncs back to BoardCanvas.

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
    Loader2, FileText, AlertTriangle, CheckCircle, HelpCircle,
    Plus, Trash2, ChevronDown,
} from 'lucide-react';
import { boardsApi } from '../../lib/api';
import { useWorkspaceStore } from '../../lib/store';
import { BOARD_PALETTE } from './BoardCanvas';

const CONFIDENCE_LABELS = {
    0: { text: '待验证', color: 'var(--text-2)', icon: HelpCircle },
    1: { text: '低置信', color: '#C33A30', icon: AlertTriangle },
    2: { text: '低置信', color: '#C33A30', icon: AlertTriangle },
    3: { text: '中等', color: '#D97706', icon: HelpCircle },
    4: { text: '较高', color: '#18A06A', icon: CheckCircle },
    5: { text: '高置信', color: '#18A06A', icon: CheckCircle },
};

function getConfidence(level) {
    return CONFIDENCE_LABELS[level] || CONFIDENCE_LABELS[0];
}

const HYPO_STATES = [
    { value: 'pending', label: '待验证', color: 'var(--text-2)' },
    { value: 'supported', label: '已支持', color: '#18A06A' },
    { value: 'refuted', label: '已否定', color: '#C33A30' },
    { value: 'revised', label: '已修订', color: '#D97706' },
];

const RELATION_TYPES = [
    { value: 'supports', label: '支持', color: BOARD_PALETTE.evidence, symbol: '✓' },
    { value: 'refutes', label: '反驳', color: BOARD_PALETTE.refute, symbol: '✗' },
    { value: 'neutral', label: '中立', color: BOARD_PALETTE.neutral, symbol: '–' },
];

// ─── Inline editable text ───
function InlineEdit({ value, onSave, className, style, tag: Tag = 'span', placeholder = '点击编辑...' }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    const inputRef = useRef(null);

    useEffect(() => { setDraft(value); }, [value]);
    useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

    const commit = () => {
        setEditing(false);
        const trimmed = draft.trim();
        if (trimmed && trimmed !== value) onSave(trimmed);
        else setDraft(value);
    };

    if (!editing) {
        return (
            <Tag
                className={`cursor-text hover:bg-black/5 rounded px-0.5 -mx-0.5 transition-colors ${className || ''}`}
                style={style}
                onClick={() => setEditing(true)}
                title="点击编辑"
            >
                {value || placeholder}
            </Tag>
        );
    }

    return (
        <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
            className={`outline-none bg-transparent border-b-2 w-full ${className || ''}`}
            style={{ ...style, borderColor: 'var(--accent-400)' }}
            placeholder={placeholder}
        />
    );
}

export default function DocumentView({ topicId, boardId, className }) {
    const [loading, setLoading] = useState(true);
    const [boardData, setBoardData] = useState(null);
    const [topicData, setTopicData] = useState(null);
    const boardRefreshToken = useWorkspaceStore(s => s.boardRefreshToken);
    const invalidateBoard = useWorkspaceStore(s => s.invalidateBoard);

    // Reload when topicId changes or board is invalidated
    useEffect(() => {
        if (!topicId) return;
        setLoading(true);
        boardsApi.getTopicBoard(topicId)
            .then(({ board, topic }) => {
                setBoardData(board);
                setTopicData(topic);
            })
            .catch(err => console.error('DocumentView load failed:', err))
            .finally(() => setLoading(false));
    }, [topicId, boardRefreshToken]);

    const resolvedBoardId = boardId || boardData?.id;

    // ─── Node CRUD helpers ───
    const updateNode = useCallback(async (nodeId, updates) => {
        if (!resolvedBoardId) return;
        try {
            await boardsApi.updateNode(resolvedBoardId, nodeId, updates);
            invalidateBoard();
        } catch (err) {
            console.error('DocumentView updateNode failed:', err);
        }
    }, [resolvedBoardId, invalidateBoard]);

    const createNode = useCallback(async (data) => {
        if (!resolvedBoardId) return null;
        try {
            const node = await boardsApi.createNode(resolvedBoardId, data);
            invalidateBoard();
            return node;
        } catch (err) {
            console.error('DocumentView createNode failed:', err);
            return null;
        }
    }, [resolvedBoardId, invalidateBoard]);

    const deleteNode = useCallback(async (nodeId) => {
        if (!resolvedBoardId) return;
        try {
            await boardsApi.deleteNode(resolvedBoardId, nodeId);
            invalidateBoard();
        } catch (err) {
            console.error('DocumentView deleteNode failed:', err);
        }
    }, [resolvedBoardId, invalidateBoard]);

    const updateEdge = useCallback(async (edgeId, updates) => {
        if (!resolvedBoardId) return;
        try {
            await boardsApi.updateEdge(resolvedBoardId, edgeId, updates);
            invalidateBoard();
        } catch (err) {
            console.error('DocumentView updateEdge failed:', err);
        }
    }, [resolvedBoardId, invalidateBoard]);

    // Build tree structure from flat nodes/edges
    const { sections, edgeMap } = useMemo(() => {
        if (!boardData?.nodes?.length) return { sections: [], edgeMap: {} };

        const nodes = boardData.nodes;
        const edges = boardData.edges || [];

        const childrenMap = {};
        const nodeMap = {};
        const rootIds = new Set();

        nodes.forEach(n => {
            nodeMap[n.id] = n;
            if (!n.parent_id) {
                rootIds.add(n.id);
            } else {
                if (!childrenMap[n.parent_id]) childrenMap[n.parent_id] = [];
                childrenMap[n.parent_id].push(n);
            }
        });

        // Build edge map: targetNodeId → edge object
        const eMap = {};
        edges.forEach(e => { eMap[e.target_node_id] = e; });

        function buildSection(node, depth = 0) {
            const children = childrenMap[node.id] || [];
            const hypotheses = children.filter(c => c.node_type === 'hypothesis');
            const subQuestions = children.filter(c => c.node_type === 'question');

            return {
                node,
                depth,
                hypotheses: hypotheses.map(h => {
                    const hChildren = childrenMap[h.id] || [];
                    const evidence = hChildren.filter(c => c.node_type === 'evidence');
                    return {
                        node: h,
                        evidence: evidence.map(e => ({
                            node: e,
                            relation: eMap[e.id]?.relation_type || 'neutral',
                            edgeId: eMap[e.id]?.id,
                        })),
                    };
                }),
                subSections: subQuestions.map(sq => buildSection(sq, depth + 1)),
            };
        }

        const rootNodes = nodes.filter(n => rootIds.has(n.id) && n.node_type === 'question');
        return { sections: rootNodes.map(r => buildSection(r)), edgeMap: eMap };
    }, [boardData]);

    if (loading) {
        return (
            <div className={`flex items-center justify-center h-full ${className || ''}`} style={{ background: 'var(--bg-0)' }}>
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent-400)' }} />
                <span className="ml-2 text-sm" style={{ color: 'var(--text-2)' }}>加载研究报告...</span>
            </div>
        );
    }

    if (!boardData?.nodes?.length) {
        return (
            <div className={`flex flex-col items-center justify-center h-full gap-3 ${className || ''}`} style={{ background: 'var(--bg-0)' }}>
                <FileText size={32} style={{ color: 'var(--text-2)' }} />
                <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                    在论证板上添加问题和假说后，研究报告会自动生成
                </p>
                <button
                    onClick={() => createNode({ node_type: 'question', content: '新研究问题', position_x: 0, position_y: 0 })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                    style={{ background: 'var(--accent-500)', color: '#fff' }}
                >
                    <Plus size={14} /> 添加第一个问题
                </button>
            </div>
        );
    }

    return (
        <div className={`h-full overflow-y-auto ${className || ''}`} style={{ background: 'var(--bg-0)' }}>
            <div className="max-w-3xl mx-auto px-8 py-8">
                {/* Title */}
                <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-0)' }}>
                    {topicData?.title || '研究报告'}
                </h1>
                <p className="text-sm mb-8" style={{ color: 'var(--text-2)' }}>
                    双击文本可直接编辑 · {boardData.nodes.length} 个节点
                </p>

                <div className="h-px mb-8" style={{ background: 'var(--stroke-0)' }} />

                {/* Sections */}
                {sections.map((section, i) => (
                    <Section
                        key={section.node.id}
                        section={section}
                        index={i + 1}
                        onUpdateNode={updateNode}
                        onCreateNode={createNode}
                        onDeleteNode={deleteNode}
                        onUpdateEdge={updateEdge}
                    />
                ))}

                {/* Add root question */}
                <button
                    onClick={() => createNode({ node_type: 'question', content: '新研究问题', position_x: 0, position_y: 100 * sections.length })}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors mt-4 cursor-pointer"
                    style={{ color: 'var(--accent-400)', border: '1px dashed var(--stroke-1)' }}
                >
                    <Plus size={13} /> 添加问题
                </button>
            </div>
        </div>
    );
}

function Section({ section, index, parentIndex = '', onUpdateNode, onCreateNode, onDeleteNode, onUpdateEdge }) {
    const { node, hypotheses, subSections, depth } = section;
    const sectionNum = parentIndex ? `${parentIndex}.${index}` : `${index}`;
    const questionText = (typeof node.content === 'string' ? node.content : node.content?.text) || '未命名问题';
    const [hovered, setHovered] = useState(false);

    const headingSize = depth === 0 ? 'text-xl' : depth === 1 ? 'text-lg' : 'text-base';

    const handleSaveQuestion = (text) => {
        onUpdateNode(node.id, { content: text });
    };

    const handleAddHypothesis = () => {
        onCreateNode({
            node_type: 'hypothesis',
            claim: '新假说',
            parent_id: node.id,
            hypo_state: 'pending',
            confidence: 0,
            position_x: 0,
            position_y: 0,
        });
    };

    const handleAddSubQuestion = () => {
        onCreateNode({
            node_type: 'question',
            content: '子问题',
            parent_id: node.id,
            position_x: 0,
            position_y: 0,
        });
    };

    return (
        <div
            className="mb-8 group/section"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div className="flex items-start gap-2">
                <div className="flex-1">
                    <span className={`${headingSize} font-bold`} style={{ color: 'var(--accent-400)' }}>{sectionNum}.</span>{' '}
                    <InlineEdit
                        value={questionText}
                        onSave={handleSaveQuestion}
                        className={`${headingSize} font-bold`}
                        style={{ color: 'var(--text-0)' }}
                        tag="span"
                    />
                </div>
                {hovered && (
                    <button
                        onClick={() => { if (confirm('删除此问题及其所有子节点？')) onDeleteNode(node.id); }}
                        className="shrink-0 p-1 rounded opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
                        style={{ color: '#C33A30' }}
                        title="删除问题"
                    >
                        <Trash2 size={14} />
                    </button>
                )}
            </div>

            {hypotheses.length === 0 && subSections.length === 0 && (
                <p className="text-sm italic mt-2" style={{ color: 'var(--text-2)' }}>
                    暂无假说或子问题
                </p>
            )}

            {hypotheses.map((hypo, hi) => (
                <HypothesisBlock
                    key={hypo.node.id}
                    hypo={hypo}
                    index={hi + 1}
                    onUpdateNode={onUpdateNode}
                    onCreateNode={onCreateNode}
                    onDeleteNode={onDeleteNode}
                    onUpdateEdge={onUpdateEdge}
                    parentId={node.id}
                />
            ))}

            {subSections.map((sub, si) => (
                <Section
                    key={sub.node.id}
                    section={sub}
                    index={si + 1}
                    parentIndex={sectionNum}
                    onUpdateNode={onUpdateNode}
                    onCreateNode={onCreateNode}
                    onDeleteNode={onDeleteNode}
                    onUpdateEdge={onUpdateEdge}
                />
            ))}

            {/* Add buttons */}
            {hovered && (
                <div className="flex items-center gap-2 mt-3 ml-4">
                    <button
                        onClick={handleAddHypothesis}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer"
                        style={{ color: BOARD_PALETTE.hypothesis, border: `1px dashed ${BOARD_PALETTE.hypothesis}40` }}
                    >
                        <Plus size={11} /> 假说
                    </button>
                    <button
                        onClick={handleAddSubQuestion}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer"
                        style={{ color: 'var(--accent-400)', border: '1px dashed var(--stroke-1)' }}
                    >
                        <Plus size={11} /> 子问题
                    </button>
                </div>
            )}
        </div>
    );
}

function HypothesisBlock({ hypo, index, onUpdateNode, onCreateNode, onDeleteNode, onUpdateEdge, parentId }) {
    const { node, evidence } = hypo;
    const claim = node.claim || (typeof node.content === 'string' ? node.content : node.content?.text) || '未命名假说';
    const state = node.hypo_state || 'pending';
    const confidence = getConfidence(node.confidence || 0);
    const ConfIcon = confidence.icon;
    const [hovered, setHovered] = useState(false);
    const [stateDropdown, setStateDropdown] = useState(false);

    const currentState = HYPO_STATES.find(s => s.value === state) || HYPO_STATES[0];

    const handleSaveClaim = (text) => {
        onUpdateNode(node.id, { claim: text });
    };

    const handleStateChange = (newState) => {
        onUpdateNode(node.id, { hypo_state: newState });
        setStateDropdown(false);
    };

    const handleConfidenceChange = (delta) => {
        const newConf = Math.max(0, Math.min(5, (node.confidence || 0) + delta));
        onUpdateNode(node.id, { confidence: newConf });
    };

    const handleAddEvidence = () => {
        onCreateNode({
            node_type: 'evidence',
            content: '新证据',
            parent_id: node.id,
            evidence_type: 'manual',
            position_x: 0,
            position_y: 0,
        });
    };

    return (
        <div
            className="ml-4 mb-6 pl-4 group/hypo"
            style={{ borderLeft: `2px solid ${BOARD_PALETTE.hypothesis}` }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => { setHovered(false); setStateDropdown(false); }}
        >
            {/* Hypothesis header */}
            <div className="flex items-start gap-2 mb-2">
                <span className="text-sm font-semibold shrink-0" style={{ color: 'var(--text-0)' }}>
                    假说 {index}:
                </span>
                <InlineEdit
                    value={claim}
                    onSave={handleSaveClaim}
                    className="text-sm flex-1"
                    style={{ color: 'var(--text-0)' }}
                />
                {hovered && (
                    <button
                        onClick={() => { if (confirm('删除此假说及其证据？')) onDeleteNode(node.id); }}
                        className="shrink-0 p-1 rounded opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
                        style={{ color: '#C33A30' }}
                        title="删除假说"
                    >
                        <Trash2 size={13} />
                    </button>
                )}
            </div>

            {/* Status badges — editable */}
            <div className="flex items-center gap-3 mb-3">
                <div className="relative">
                    <button
                        onClick={() => setStateDropdown(!stateDropdown)}
                        className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium cursor-pointer transition-colors"
                        style={{ background: `${currentState.color}15`, color: currentState.color }}
                    >
                        {currentState.label}
                        <ChevronDown size={10} />
                    </button>
                    {stateDropdown && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setStateDropdown(false)} />
                            <div className="absolute left-0 top-full mt-1 rounded-lg shadow-lg py-1 z-20 min-w-[90px]" style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)' }}>
                                {HYPO_STATES.map(s => (
                                    <button
                                        key={s.value}
                                        onClick={() => handleStateChange(s.value)}
                                        className="w-full px-3 py-1 text-left text-[11px] cursor-pointer transition-colors hover:bg-black/5"
                                        style={{ color: s.color }}
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Confidence — click to cycle */}
                <button
                    onClick={() => handleConfidenceChange(1)}
                    onContextMenu={e => { e.preventDefault(); handleConfidenceChange(-1); }}
                    className="inline-flex items-center gap-1 text-[10px] cursor-pointer transition-colors"
                    style={{ color: confidence.color }}
                    title="左键 +1 / 右键 -1"
                >
                    <ConfIcon size={11} />
                    {confidence.text}
                </button>
            </div>

            {/* Evidence list */}
            {evidence.length > 0 && (
                <div className="space-y-2">
                    {evidence.map(({ node: ev, relation, edgeId }) => (
                        <EvidenceBullet
                            key={ev.id}
                            evidence={ev}
                            relation={relation}
                            edgeId={edgeId}
                            onUpdateNode={onUpdateNode}
                            onDeleteNode={onDeleteNode}
                            onUpdateEdge={onUpdateEdge}
                        />
                    ))}
                </div>
            )}

            {evidence.length === 0 && (
                <p className="text-xs italic" style={{ color: 'var(--text-2)' }}>
                    暂无证据
                </p>
            )}

            {/* Add evidence button */}
            {hovered && (
                <button
                    onClick={handleAddEvidence}
                    className="flex items-center gap-1 px-2 py-1 mt-2 rounded text-[11px] font-medium transition-colors cursor-pointer"
                    style={{ color: BOARD_PALETTE.evidence, border: `1px dashed ${BOARD_PALETTE.evidence}40` }}
                >
                    <Plus size={11} /> 证据
                </button>
            )}
        </div>
    );
}

function EvidenceBullet({ evidence, relation, edgeId, onUpdateNode, onDeleteNode, onUpdateEdge }) {
    const text = (typeof evidence.content === 'string' ? evidence.content : evidence.content?.text) || '';
    const cardTitle = evidence.card?.title;
    const sourceName = evidence.card?.source?.name;
    const [hovered, setHovered] = useState(false);

    const relationConfig = RELATION_TYPES.find(r => r.value === relation) || RELATION_TYPES[2];

    const handleSaveContent = (newText) => {
        onUpdateNode(evidence.id, { content: newText });
    };

    const cycleRelation = () => {
        if (!edgeId) return;
        const idx = RELATION_TYPES.findIndex(r => r.value === relation);
        const next = RELATION_TYPES[(idx + 1) % RELATION_TYPES.length];
        onUpdateEdge(edgeId, { relation_type: next.value });
    };

    return (
        <div
            className="flex items-start gap-2 py-1.5 px-3 rounded-lg text-xs"
            style={{ background: 'var(--surface-1)' }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <button
                onClick={cycleRelation}
                className="shrink-0 font-bold mt-0.5 cursor-pointer transition-colors"
                style={{ color: relationConfig.color }}
                title="点击切换：支持/反驳/中立"
            >
                {relationConfig.symbol}
            </button>
            <div className="flex-1 min-w-0">
                <InlineEdit
                    value={text || '(无内容)'}
                    onSave={handleSaveContent}
                    style={{ color: 'var(--text-1)' }}
                />
                {cardTitle && (
                    <span className="ml-1 text-[10px]" style={{ color: 'var(--accent-400)' }}>
                        [{cardTitle}]
                    </span>
                )}
                {sourceName && (
                    <span className="ml-1 text-[10px]" style={{ color: 'var(--text-2)' }}>
                        — {sourceName}
                    </span>
                )}
            </div>
            <span
                onClick={cycleRelation}
                className="shrink-0 text-[9px] px-1.5 py-0.5 rounded cursor-pointer"
                style={{ background: `${relationConfig.color}15`, color: relationConfig.color }}
                title="点击切换关系类型"
            >
                {relationConfig.label}
            </span>
            {hovered && (
                <button
                    onClick={() => onDeleteNode(evidence.id)}
                    className="shrink-0 p-0.5 rounded opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
                    style={{ color: '#C33A30' }}
                    title="删除证据"
                >
                    <Trash2 size={11} />
                </button>
            )}
        </div>
    );
}
