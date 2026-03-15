// ========= BoardCanvas — Core Board Rendering (Spec §4, §9) =========
// Extracted from ThinkingBoardPage (1390 lines).
// Contains: ReactFlow setup, node/edge rendering, dagre layout, LOD,
// selection/focus, draft display, DraftCommitBar, node CRUD, drag-drop,
// edge connection.
// Does NOT contain: page chrome (back button/title), evidence pool sidebar.
// CRITICAL: Must never unmount when toggling structure/document views.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    ReactFlow,
    ReactFlowProvider,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    MarkerType,
    Panel,
    useReactFlow,
    BackgroundVariant,
    useStore,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { Plus, Loader2, LayoutGrid, Target, Keyboard } from 'lucide-react';
import { boardsApi } from '../../lib/api';
import { useUIStore, useChatStore } from '../../lib/store';
import DraftNode from '../DraftNode';
import DraftCommitBar from '../DraftCommitBar';
import HealthSidebar from '../HealthSidebar';

import QuestionNode from '../board/QuestionNode';
import HypothesisNode from '../board/HypothesisNode';
import EvidenceNode from '../board/EvidenceNode';
import MonoStepEdge from '../board/MonoStepEdge';

const nodeTypes = {
    questionNode: QuestionNode,
    hypothesisNode: HypothesisNode,
    evidenceNode: EvidenceNode,
    draftNode: DraftNode,
};

const edgeTypes = { monoStep: MonoStepEdge };

export const BOARD_PALETTE = {
    question: '#2F80FF',
    hypothesis: '#2F80FF',
    hypothesisPending: '#2F80FF',
    evidence: '#18A06A',
    neutral: '#94A3B8',
    refute: '#C33A30',
};

// ========= Dagre Layout =========
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const NODE_WIDTH = 320;

const NODE_DIMS = {
    questionNode: { width: NODE_WIDTH, height: 160 },
    hypothesisNode: { width: NODE_WIDTH, height: 200 },
    evidenceNode: { width: 280, height: 180 },
};

function getLayoutedElements(nodes, edges, direction = 'TB') {
    dagreGraph.setGraph({ rankdir: direction, ranksep: 120, nodesep: 80, edgesep: 40 });
    dagreGraph.nodes().forEach(n => dagreGraph.removeNode(n));

    nodes.forEach(node => {
        const dims = NODE_DIMS[node.type] || { width: NODE_WIDTH, height: 180 };
        dagreGraph.setNode(node.id, { width: dims.width, height: dims.height });
    });

    edges.forEach(edge => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map(node => {
        const nodeWithPosition = dagreGraph.node(node.id);
        const dims = NODE_DIMS[node.type] || { width: NODE_WIDTH, height: 180 };
        return {
            ...node,
            position: {
                x: nodeWithPosition.x - dims.width / 2,
                y: nodeWithPosition.y - dims.height / 2,
            },
            style: { ...(node.style || {}), width: dims.width, height: dims.height },
        };
    });

    return { nodes: layoutedNodes, edges };
}

// ========= Edge styles =========
function getEvidenceEdgeStyle(relationType) {
    switch (relationType) {
        case 'supports':
            return {
                stroke: BOARD_PALETTE.evidence,
                strokeWidth: 2,
                markerEnd: { type: MarkerType.ArrowClosed, color: BOARD_PALETTE.evidence },
            };
        case 'refutes':
            return {
                stroke: BOARD_PALETTE.refute,
                strokeWidth: 2,
                markerEnd: { type: MarkerType.ArrowClosed, color: BOARD_PALETTE.refute },
            };
        default:
            return {
                stroke: BOARD_PALETTE.neutral,
                strokeWidth: 1.6,
                markerEnd: { type: MarkerType.ArrowClosed, color: BOARD_PALETTE.neutral },
            };
    }
}

function getParentEdgeStyle(isHypoTarget, hypoState) {
    const baseColor = 'var(--stroke-1)';
    if (isHypoTarget) {
        const isPending = !hypoState || hypoState === 'pending';
        return {
            stroke: isPending ? BOARD_PALETTE.hypothesisPending : BOARD_PALETTE.hypothesis,
            strokeWidth: isPending ? 1.6 : 2,
            strokeDasharray: isPending ? '6 4' : '0',
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: isPending ? BOARD_PALETTE.hypothesisPending : BOARD_PALETTE.hypothesis,
            },
        };
    }
    return {
        stroke: baseColor,
        strokeWidth: 1.6,
        markerEnd: { type: MarkerType.ArrowClosed, color: baseColor },
    };
}

// ========= Exported BoardCanvas =========
export default function BoardCanvas({ topicId, onBoardLoaded, onOpenReaderAtQuote, dragCardRef, focusCardId, className }) {
    return (
        <ReactFlowProvider>
            <BoardCanvasInner
                topicId={topicId}
                onBoardLoaded={onBoardLoaded}
                onOpenReaderAtQuote={onOpenReaderAtQuote}
                dragCardRef={dragCardRef}
                focusCardId={focusCardId}
                className={className}
            />
        </ReactFlowProvider>
    );
}

function BoardCanvasInner({ topicId, onBoardLoaded, onOpenReaderAtQuote, dragCardRef, focusCardId, className }) {
    const { screenToFlowPosition, setCenter } = useReactFlow();
    const { showToast } = useUIStore();
    const { boardInvalidateCounter } = useChatStore();

    // Board state
    const [boardId, setBoardId] = useState(null);
    const [topic, setTopic] = useState(null);
    const [loading, setLoading] = useState(true);

    // Draft state
    const [pendingDraft, setPendingDraft] = useState(null);

    // Zoom & LOD
    const zoom = useStore(s => s.transform[2]);
    const lod = zoom < 0.35 ? 'mini' : zoom < 1.15 ? 'normal' : 'full';

    // React Flow state
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    const [focusedChainIds, setFocusedChainIds] = useState(null);

    // DB mapping
    const dbNodeMapRef = useRef({});
    const dbEdgeMapRef = useRef({});

    // ========= Load Board Data =========
    const loadBoard = useCallback(async () => {
        try {
            setLoading(true);
            const response = await boardsApi.getTopicBoard(topicId);
            const { board, topic: topicData } = response;

            setBoardId(board.id);
            setTopic(topicData);
            onBoardLoaded?.(board.id, topicData);

            if (!board.nodes || board.nodes.length === 0) {
                setNodes([]);
                setEdges([]);
                setLoading(false);
                return;
            }

            const rfNodes = [];
            const idMap = {};

            for (const dbNode of board.nodes) {
                const rfId = dbNode.id;
                idMap[dbNode.id] = rfId;
                dbNodeMapRef.current[rfId] = dbNode.id;

                let rfNode;
                if (dbNode.node_type === 'question') {
                    rfNode = {
                        id: rfId,
                        type: 'questionNode',
                        position: { x: dbNode.position_x || 0, y: dbNode.position_y || 0 },
                        data: {
                            content: dbNode.content || {},
                            priority: dbNode.priority || 'normal',
                            status: dbNode.status || 'open',
                            decomposition_type: dbNode.decomposition_type,
                        },
                    };
                } else if (dbNode.node_type === 'hypothesis') {
                    rfNode = {
                        id: rfId,
                        type: 'hypothesisNode',
                        position: { x: dbNode.position_x || 0, y: dbNode.position_y || 0 },
                        data: {
                            claim: dbNode.claim || dbNode.content?.text || '',
                            hypo_state: dbNode.hypo_state || 'pending',
                            confidence: dbNode.confidence || 0,
                        },
                    };
                } else if (dbNode.node_type === 'evidence') {
                    rfNode = {
                        id: rfId,
                        type: 'evidenceNode',
                        position: { x: dbNode.position_x || 0, y: dbNode.position_y || 0 },
                        data: {
                            content: dbNode.content || {},
                            card: dbNode.card || null,
                            evidence_type: dbNode.evidence_type || 'fact',
                            strength: dbNode.strength || 3,
                        },
                    };
                }

                if (rfNode) rfNodes.push(rfNode);
            }

            const rfEdges = [];

            for (const dbNode of board.nodes) {
                if (dbNode.parent_id && idMap[dbNode.parent_id]) {
                    const isHypo = dbNode.node_type === 'hypothesis';
                    rfEdges.push({
                        id: `parent-${dbNode.id}`,
                        source: idMap[dbNode.parent_id],
                        target: idMap[dbNode.id],
                        type: 'monoStep',
                        animated: false,
                        style: getParentEdgeStyle(isHypo, dbNode.hypo_state),
                        data: { isParent: true, isHypoTarget: isHypo },
                    });
                }
            }

            for (const dbEdge of (board.edges || [])) {
                const rfEdgeId = `edge-${dbEdge.id}`;
                dbEdgeMapRef.current[rfEdgeId] = dbEdge.id;

                const targetNode = rfNodes.find(n => n.id === dbEdge.target_node_id);
                if (targetNode && targetNode.type === 'evidenceNode') {
                    targetNode.data.edgeRelation = dbEdge.relation_type;
                    targetNode.data._edgeId = rfEdgeId;
                }

                rfEdges.push({
                    id: rfEdgeId,
                    source: dbEdge.source_node_id,
                    target: dbEdge.target_node_id,
                    type: 'monoStep',
                    animated: false,
                    style: getEvidenceEdgeStyle(dbEdge.relation_type),
                    data: {
                        relation_type: dbEdge.relation_type,
                        dbEdgeId: dbEdge.id,
                    },
                });
            }

            if (rfNodes.length > 0) {
                const { nodes: layouted } = getLayoutedElements(rfNodes, rfEdges, 'TB');
                setNodes(layouted);
            } else {
                setNodes(rfNodes);
            }
            setEdges(rfEdges);

        } catch (err) {
            console.error('Failed to load board:', err);
            const msg = err.message || err.error || '未知错误';
            showToast(`加载画板失败: ${msg}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [topicId, showToast, setNodes, setEdges, onBoardLoaded]);

    useEffect(() => { loadBoard(); }, [loadBoard]);

    // Reload when chat invalidates board
    useEffect(() => {
        if (boardInvalidateCounter > 0) loadBoard();
    }, [boardInvalidateCounter, loadBoard]);

    // ========= Cinematic Focus Mode =========
    // Evidence node double-click → open reader at quote (Spec §1.3)
    const handleNodeDoubleClick = useCallback((event, node) => {
        if (node.type === 'evidenceNode' && node.data?.card) {
            const card = node.data.card;
            if (card.material_id && onOpenReaderAtQuote) {
                const locator = (() => {
                    const raw = card.locator;
                    if (!raw) return null;
                    if (typeof raw === 'object') return raw;
                    if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return null; } }
                    return null;
                })();
                onOpenReaderAtQuote(card.material_id, locator?.quote_selector || locator);
            }
        }
    }, [onOpenReaderAtQuote]);

    const handleSelectionChange = useCallback(({ nodes: selectedNodes }) => {
        if (!selectedNodes || selectedNodes.length === 0) {
            setFocusedChainIds(null);
            return;
        }
        if (selectedNodes.length > 1) {
            setFocusedChainIds(null);
            return;
        }
        const selectedId = selectedNodes[0].id;
        const chain = new Set([selectedId]);

        let frontier = [selectedId];
        for (let hop = 0; hop < 2; hop++) {
            const nextFrontier = [];
            for (const nodeId of frontier) {
                edges.forEach(e => {
                    if (e.source === nodeId && !chain.has(e.target)) {
                        chain.add(e.target);
                        nextFrontier.push(e.target);
                    }
                    if (e.target === nodeId && !chain.has(e.source)) {
                        chain.add(e.source);
                        nextFrontier.push(e.source);
                    }
                });
            }
            frontier = nextFrontier;
        }
        setFocusedChainIds(chain);
    }, [edges]);

    // ========= Draft Fetching =========
    const fetchDrafts = useCallback(async () => {
        if (!boardId) return;
        try {
            const data = await boardsApi.getDrafts(boardId);
            if (data.ok && data.drafts?.length > 0) {
                setPendingDraft(data.drafts[0]);
            } else {
                setPendingDraft(null);
            }
        } catch (err) {
            console.error('Failed to fetch drafts:', err);
        }
    }, [boardId]);

    useEffect(() => { fetchDrafts(); }, [fetchDrafts]);

    // ========= Draft Handlers =========
    const handleCommitAll = useCallback(async (draftId) => {
        try {
            await boardsApi.commitDraft(boardId, draftId);
            setPendingDraft(null);
            loadBoard();
        } catch (err) {
            console.error('Commit draft failed:', err);
            showToast('提交草稿失败', 'error');
        }
    }, [boardId, loadBoard, showToast]);

    const handleRejectAll = useCallback(async (draftId) => {
        try {
            await boardsApi.rejectDraft(boardId, draftId);
            setPendingDraft(null);
        } catch (err) {
            console.error('Reject draft failed:', err);
            showToast('拒绝草稿失败', 'error');
        }
    }, [boardId, showToast]);

    const handleReview = useCallback(() => {
        if (!pendingDraft?.changes?.length) return;
        const firstDraft = pendingDraft.changes.findIndex(c => c.action === 'add_node');
        if (firstDraft >= 0) {
            const nodeId = `draft-${firstDraft}`;
            const node = nodes.find(n => n.id === nodeId);
            if (node) {
                setCenter(node.position.x + 100, node.position.y + 50, { zoom: 1.2, duration: 350 });
            }
        }
    }, [pendingDraft, nodes, setCenter]);

    const handleAcceptNode = useCallback(async (draftNodeId) => {
        if (!pendingDraft) return;
        const idx = parseInt(draftNodeId.replace('draft-', ''), 10);
        try {
            await boardsApi.commitDraft(boardId, pendingDraft.id, [idx]);
            const remaining = (pendingDraft.changes || []).filter((_, i) => i !== idx);
            if (remaining.length === 0) {
                setPendingDraft(null);
            } else {
                setPendingDraft({ ...pendingDraft, changes: remaining });
            }
            loadBoard();
        } catch (err) {
            console.error('Accept node failed:', err);
            showToast('接受节点失败', 'error');
        }
    }, [boardId, pendingDraft, loadBoard, showToast]);

    const handleRejectNode = useCallback(async (draftNodeId) => {
        if (!pendingDraft) return;
        const idx = parseInt(draftNodeId.replace('draft-', ''), 10);
        const remaining = (pendingDraft.changes || []).filter((_, i) => i !== idx);
        if (remaining.length === 0) {
            try {
                await boardsApi.rejectDraft(boardId, pendingDraft.id);
            } catch (err) {
                console.error('Reject draft failed:', err);
            }
            setPendingDraft(null);
        } else {
            setPendingDraft({ ...pendingDraft, changes: remaining });
        }
    }, [boardId, pendingDraft]);

    // ========= Node Action Callbacks =========
    const handleNodeUpdate = useCallback(async (nodeId, updates) => {
        const dbId = dbNodeMapRef.current[nodeId] || nodeId;
        try {
            await boardsApi.updateNode(boardId, dbId, updates);
            setNodes(nds => nds.map(n => {
                if (n.id === nodeId) {
                    return { ...n, data: { ...n.data, ...updates } };
                }
                return n;
            }));
        } catch (err) {
            console.error('Update node failed:', err);
            showToast('更新失败', 'error');
        }
    }, [boardId, setNodes, showToast]);

    const handleEdgeUpdate = useCallback(async (evidenceNodeId, updates) => {
        const edge = edges.find(e => e.target === evidenceNodeId && e.data?.dbEdgeId);
        if (!edge) return;

        try {
            await boardsApi.updateEdge(boardId, edge.data.dbEdgeId, updates);

            setEdges(eds => eds.map(e => {
                if (e.id === edge.id) {
                    const newRel = updates.relation_type || e.data?.relation_type;
                    return {
                        ...e,
                        style: getEvidenceEdgeStyle(newRel),
                        animated: false,
                        data: { ...e.data, relation_type: newRel },
                    };
                }
                return e;
            }));

            setNodes(nds => nds.map(n => {
                if (n.id === evidenceNodeId) {
                    return { ...n, data: { ...n.data, edgeRelation: updates.relation_type } };
                }
                return n;
            }));
        } catch (err) {
            console.error('Update edge failed:', err);
            showToast('更新关系失败', 'error');
        }
    }, [boardId, edges, setEdges, setNodes, showToast]);

    const createChildNode = useCallback(async (parentId, nodeType, extraData = {}) => {
        const dbParentId = dbNodeMapRef.current[parentId] || parentId;
        try {
            const nodeData = {
                node_type: nodeType,
                parent_id: dbParentId,
                content: extraData.content || { text: '' },
                claim: extraData.claim || '',
                ...extraData,
            };
            const result = await boardsApi.createNode(boardId, nodeData);
            const newNode = result.node;

            const rfId = newNode.id;
            dbNodeMapRef.current[rfId] = newNode.id;

            const parentNode = nodes.find(n => n.id === parentId);
            const rfNode = {
                id: rfId,
                type: nodeType === 'question' ? 'questionNode' : 'hypothesisNode',
                position: {
                    x: (parentNode?.position?.x || 0) + 40,
                    y: (parentNode?.position?.y || 0) + 180,
                },
                data: {
                    ...(nodeType === 'question' ? {
                        content: newNode.content || {},
                        priority: newNode.priority || 'normal',
                        status: newNode.status || 'open',
                    } : {
                        claim: newNode.claim || '',
                        hypo_state: newNode.hypo_state || 'pending',
                        confidence: newNode.confidence || 0,
                    }),
                },
            };

            const isHypo = nodeType === 'hypothesis';
            const newEdge = {
                id: `parent-${newNode.id}`,
                source: parentId,
                target: rfId,
                type: 'monoStep',
                style: getParentEdgeStyle(isHypo, 'pending'),
                data: { isParent: true, isHypoTarget: isHypo },
            };

            setNodes(nds => [...nds, rfNode]);
            setEdges(eds => [...eds, newEdge]);

            setTimeout(() => autoLayout(), 100);

            showToast(nodeType === 'question' ? '子问题已添加' : '假说已添加', 'success');
            return newNode;
        } catch (err) {
            console.error('Create child node failed:', err);
            showToast('创建失败', 'error');
        }
    }, [boardId, nodes, setNodes, setEdges, showToast]);

    const handleDeleteNode = useCallback(async (nodeId) => {
        const dbId = dbNodeMapRef.current[nodeId] || nodeId;
        try {
            await boardsApi.deleteNode(boardId, dbId);

            const descendantIds = new Set();
            const findDescendants = (id) => {
                descendantIds.add(id);
                edges.filter(e => e.source === id && e.id.startsWith('parent-')).forEach(e => {
                    findDescendants(e.target);
                });
            };
            findDescendants(nodeId);

            setNodes(nds => nds.filter(n => !descendantIds.has(n.id)));
            setEdges(eds => eds.filter(e => !descendantIds.has(e.source) && !descendantIds.has(e.target)));

            descendantIds.forEach(id => delete dbNodeMapRef.current[id]);

            showToast('已删除', 'success');
        } catch (err) {
            console.error('Delete node failed:', err);
            showToast('删除失败', 'error');
        }
    }, [boardId, edges, setNodes, setEdges, showToast]);

    // ========= Auto Layout =========
    const autoLayout = useCallback(() => {
        setNodes(currentNodes => {
            setEdges(currentEdges => {
                const { nodes: layouted, edges: layoutedEdges } = getLayoutedElements(
                    currentNodes, currentEdges, 'TB'
                );
                setTimeout(() => setNodes(layouted), 0);
                return layoutedEdges;
            });
            return currentNodes;
        });
    }, [setNodes, setEdges]);

    const focusRootQuestion = useCallback(() => {
        const questionNodes = nodes.filter((node) => node.type === 'questionNode');
        if (questionNodes.length === 0) {
            showToast('暂无问题节点可聚焦', 'warning');
            return;
        }

        const parentTargets = new Set(
            edges
                .filter((edge) => edge.data?.isParent)
                .map((edge) => edge.target)
        );

        const rootNode = questionNodes.find((node) => !parentTargets.has(node.id)) || questionNodes[0];
        const dims = NODE_DIMS[rootNode.type] || { width: NODE_WIDTH, height: 180 };
        const centerX = rootNode.position.x + dims.width / 2;
        const centerY = rootNode.position.y + dims.height / 2;

        setCenter(centerX, centerY, { zoom: 0.95, duration: 350 });
    }, [nodes, edges, setCenter, showToast]);

    // ========= Inject callbacks into node data =========
    const nodesWithCallbacks = useMemo(() => {
        const mapped = nodes.map(node => {
            const childEdges = edges.filter(e => e.source === node.id && e.id.startsWith('parent-'));
            const childCount = childEdges.length;

            const dimmed = focusedChainIds ? !focusedChainIds.has(node.id) : false;
            const focusStyle = dimmed
                ? { opacity: 0.30, transition: 'opacity 0.25s ease', pointerEvents: 'none' }
                : { opacity: 1, transition: 'opacity 0.25s ease', pointerEvents: 'auto' };

            const baseCallbacks = {
                onUpdate: handleNodeUpdate,
                onDelete: handleDeleteNode,
                childCount,
                lod,
                dimmed,
            };

            const applyFocus = (n) => ({
                ...n,
                style: { ...(n.style || {}), ...focusStyle },
            });

            if (node.type === 'questionNode') {
                return applyFocus({
                    ...node,
                    data: {
                        ...node.data,
                        ...baseCallbacks,
                        onAddSubQuestion: (parentId) => createChildNode(parentId, 'question', { content: { text: '' } }),
                        onAddHypothesis: (parentId) => createChildNode(parentId, 'hypothesis', { claim: '' }),
                    },
                });
            } else if (node.type === 'hypothesisNode') {
                return applyFocus({
                    ...node,
                    data: {
                        ...node.data,
                        ...baseCallbacks,
                        onAddSubHypothesis: (parentId) => createChildNode(parentId, 'hypothesis', { claim: '' }),
                    },
                });
            } else if (node.type === 'evidenceNode') {
                return applyFocus({
                    ...node,
                    data: {
                        ...node.data,
                        ...baseCallbacks,
                        onEdgeUpdate: handleEdgeUpdate,
                    },
                });
            }
            return applyFocus(node);
        });

        const draftNodes = (pendingDraft?.changes || [])
            .filter(c => c.action === 'add_node')
            .map((c, i) => ({
                id: `draft-${i}`,
                type: 'draftNode',
                position: { x: 400 + i * 50, y: 500 + i * 80 },
                data: {
                    text: c.text || c.claim || '',
                    node_type: c.node_type,
                    onAccept: handleAcceptNode,
                    onReject: handleRejectNode,
                },
            }));

        return [...mapped, ...draftNodes];
    }, [nodes, edges, handleNodeUpdate, handleDeleteNode, createChildNode, handleEdgeUpdate, focusedChainIds, pendingDraft, handleAcceptNode, handleRejectNode, lod]);

    // ========= Edge Focus Styling =========
    const styledEdges = useMemo(() => {
        const hypoStateMap = {};
        nodes.forEach(n => {
            if (n.type === 'hypothesisNode') {
                hypoStateMap[n.id] = n.data?.hypo_state || 'pending';
            }
        });

        return edges.map(edge => {
            let extraStyle = {};
            let animated = edge.animated || false;

            if (edge.data?.isParent && edge.data?.isHypoTarget) {
                const targetState = hypoStateMap[edge.target] || 'pending';
                const isPending = targetState === 'pending';
                extraStyle = {
                    stroke: isPending ? BOARD_PALETTE.hypothesisPending : BOARD_PALETTE.hypothesis,
                    strokeWidth: isPending ? 1.6 : 2,
                    strokeDasharray: isPending ? '6 4' : '0',
                };
            }

            let inChain = false;
            if (focusedChainIds) {
                inChain = focusedChainIds.has(edge.source) && focusedChainIds.has(edge.target);
                if (!inChain) {
                    extraStyle.opacity = 0.12;
                } else {
                    extraStyle.opacity = 1;
                }
            }

            return {
                ...edge,
                data: { ...(edge.data || {}), isFocus: inChain },
                animated,
                style: { ...(edge.style || {}), ...extraStyle, transition: 'opacity 0.3s ease' },
            };
        });
    }, [edges, nodes, focusedChainIds]);

    // ========= Drag card → create Evidence =========
    const onDragOver = useCallback((event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(async (event) => {
        event.preventDefault();
        const card = dragCardRef?.current;
        if (!card) return;
        dragCardRef.current = null;

        const position = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });
        const dropX = position.x;
        const dropY = position.y;

        let closestHypo = null;
        let minDist = Infinity;
        for (const node of nodes) {
            if (node.type !== 'hypothesisNode') continue;
            const dims = NODE_DIMS[node.type] || { width: NODE_WIDTH, height: 180 };
            const nodeX = node.position.x + dims.width / 2;
            const nodeY = node.position.y + dims.height / 2;
            const dist = Math.sqrt((dropX - nodeX) ** 2 + (dropY - nodeY) ** 2);
            if (dist < minDist) {
                minDist = dist;
                closestHypo = node;
            }
        }

        if (!closestHypo || minDist > 400) {
            showToast('请拖放到一个假说节点附近', 'warning');
            return;
        }

        try {
            const result = await boardsApi.createNode(boardId, {
                node_type: 'evidence',
                card_id: card.id,
                content: { text: card.summary || card.raw_snippet || '' },
                evidence_type: 'fact',
                strength: 3,
            });
            const evidenceNode = result.node;

            const edgeResult = await boardsApi.createEdge(boardId, {
                source_node_id: dbNodeMapRef.current[closestHypo.id] || closestHypo.id,
                target_node_id: evidenceNode.id,
                relation_type: 'supports',
            });

            const rfId = evidenceNode.id;
            dbNodeMapRef.current[rfId] = evidenceNode.id;

            const rfEdgeId = `edge-${edgeResult.edge.id}`;
            dbEdgeMapRef.current[rfEdgeId] = edgeResult.edge.id;

            const rfNode = {
                id: rfId,
                type: 'evidenceNode',
                position: {
                    x: closestHypo.position.x + 30,
                    y: closestHypo.position.y + 200,
                },
                data: {
                    content: evidenceNode.content,
                    card: card,
                    evidence_type: 'fact',
                    strength: 3,
                    edgeRelation: 'supports',
                    _edgeId: rfEdgeId,
                },
            };

            const rfEdge = {
                id: rfEdgeId,
                source: closestHypo.id,
                target: rfId,
                type: 'monoStep',
                animated: false,
                style: getEvidenceEdgeStyle('supports'),
                data: { relation_type: 'supports', dbEdgeId: edgeResult.edge.id },
            };

            setNodes(nds => [...nds, rfNode]);
            setEdges(eds => [...eds, rfEdge]);

            setTimeout(() => autoLayout(), 100);
            showToast(`证据已关联到假说`, 'success');

        } catch (err) {
            console.error('Drop card failed:', err);
            showToast('添加证据失败', 'error');
        }
    }, [boardId, nodes, setNodes, setEdges, showToast, autoLayout, dragCardRef, screenToFlowPosition]);

    // ========= Handle Connect =========
    const onConnect = useCallback(async (connection) => {
        const { source, target } = connection;
        if (!source || !target || source === target) return;

        const sourceNode = nodes.find(n => n.id === source);
        const targetNode = nodes.find(n => n.id === target);
        if (!sourceNode || !targetNode) return;

        const srcType = sourceNode.type;
        const tgtType = targetNode.type;

        const dbSourceId = dbNodeMapRef.current[source] || source;
        const dbTargetId = dbNodeMapRef.current[target] || target;

        try {
            if (
                (srcType === 'questionNode' && tgtType === 'questionNode') ||
                (srcType === 'questionNode' && tgtType === 'hypothesisNode') ||
                (srcType === 'hypothesisNode' && tgtType === 'hypothesisNode')
            ) {
                await boardsApi.updateNode(boardId, dbTargetId, { parent_id: dbSourceId });

                const isHypo = tgtType === 'hypothesisNode';
                const newEdge = {
                    id: `parent-${target}`,
                    source,
                    target,
                    type: 'monoStep',
                    style: getParentEdgeStyle(isHypo, targetNode.data?.hypo_state || 'pending'),
                    data: { isParent: true, isHypoTarget: isHypo },
                };
                setEdges(eds => [...eds.filter(e => e.id !== `parent-${target}`), newEdge]);
                showToast('已建立父子关系', 'success');
            }
            else if (
                (srcType === 'hypothesisNode' && tgtType === 'evidenceNode') ||
                (srcType === 'evidenceNode' && tgtType === 'hypothesisNode')
            ) {
                const hypoId = srcType === 'hypothesisNode' ? source : target;
                const evidId = srcType === 'evidenceNode' ? source : target;
                const dbHypoId = dbNodeMapRef.current[hypoId] || hypoId;
                const dbEvidId = dbNodeMapRef.current[evidId] || evidId;

                await boardsApi.updateNode(boardId, dbEvidId, { parent_id: dbHypoId });

                const edgeResult = await boardsApi.createEdge(boardId, {
                    source_node_id: dbHypoId,
                    target_node_id: dbEvidId,
                    relation_type: 'supports',
                });

                const rfEdgeId = `edge-${edgeResult.edge.id}`;
                dbEdgeMapRef.current[rfEdgeId] = edgeResult.edge.id;

                const rfEdge = {
                    id: rfEdgeId,
                    source: hypoId,
                    target: evidId,
                    type: 'monoStep',
                    style: getEvidenceEdgeStyle('supports'),
                    data: { relation_type: 'supports', dbEdgeId: edgeResult.edge.id },
                };

                const parentEdgeId = `parent-${evidId}`;
                const parentEdge = {
                    id: parentEdgeId,
                    source: hypoId,
                    target: evidId,
                    type: 'monoStep',
                    style: getParentEdgeStyle(false),
                    data: { isParent: true, isHypoTarget: false },
                };

                setEdges(eds => [...eds.filter(e => e.id !== parentEdgeId), parentEdge, rfEdge]);

                setNodes(nds => nds.map(n => {
                    if (n.id === evidId) {
                        return { ...n, data: { ...n.data, edgeRelation: 'supports', _edgeId: rfEdgeId } };
                    }
                    return n;
                }));

                showToast('已建立证据关系（默认支持）', 'success');
            } else {
                showToast('不支持的连接类型', 'warning');
                return;
            }

            setTimeout(() => autoLayout(), 100);
        } catch (err) {
            console.error('Connect failed:', err);
            showToast('连接失败', 'error');
        }
    }, [boardId, nodes, setEdges, setNodes, showToast, autoLayout]);

    // ========= Save positions on drag end =========
    const onNodeDragStop = useCallback(async (event, node) => {
        const dbId = dbNodeMapRef.current[node.id] || node.id;
        try {
            await boardsApi.updateNode(boardId, dbId, {
                position_x: node.position.x,
                position_y: node.position.y,
            });
        } catch (err) {
            console.warn('Position save failed:', err);
        }
    }, [boardId]);

    // ========= Create Root Question =========
    const createRootQuestion = useCallback(async () => {
        if (!boardId) {
            showToast('画板尚未加载完全，请稍后再试', 'warning');
            return;
        }
        try {
            const result = await boardsApi.createNode(boardId, {
                node_type: 'question',
                content: { text: topic?.title || '核心问题' },
                priority: 'critical',
                status: 'open',
                position_x: 400,
                position_y: 50,
            });
            const newNode = result.node;
            dbNodeMapRef.current[newNode.id] = newNode.id;

            setNodes([{
                id: newNode.id,
                type: 'questionNode',
                position: { x: 400, y: 50 },
                data: {
                    content: newNode.content,
                    priority: 'critical',
                    status: 'open',
                },
            }]);
            showToast('根问题已创建', 'success');
        } catch (err) {
            console.error('Create root failed:', err);
            showToast(`创建失败: ${err.message}`, 'error');
        }
    }, [boardId, topic, setNodes, showToast]);

    // ========= Keyboard Shortcuts (Spec §4) =========
    useEffect(() => {
        const handler = (e) => {
            // Don't fire when typing in inputs/textareas
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

            if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                autoLayout();
                return;
            }

            // Q — create sub-question under selected node
            if (e.key === 'q' || e.key === 'Q') {
                const selected = nodes.find(n => n.selected);
                if (selected && (selected.type === 'questionNode' || selected.type === 'hypothesisNode')) {
                    createChildNode(selected.id, 'question', { content: { text: '' } });
                }
                return;
            }

            // H — create hypothesis under selected node
            if (e.key === 'h' || e.key === 'H') {
                const selected = nodes.find(n => n.selected);
                if (selected && selected.type === 'questionNode') {
                    createChildNode(selected.id, 'hypothesis', { claim: '' });
                }
                return;
            }
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [nodes, autoLayout, createChildNode]);

    // ========= Focus on card's evidence node (Spec §3, §9) =========
    useEffect(() => {
        if (!focusCardId || nodes.length === 0) return;
        const evidenceNode = nodes.find(n =>
            n.type === 'evidenceNode' && n.data?.card?.id === focusCardId
        );
        if (evidenceNode) {
            const dims = NODE_DIMS[evidenceNode.type] || { width: NODE_WIDTH, height: 180 };
            setCenter(
                evidenceNode.position.x + dims.width / 2,
                evidenceNode.position.y + dims.height / 2,
                { zoom: 1.2, duration: 350 }
            );
        }
    }, [focusCardId, nodes, setCenter]);

    // ========= Loading =========
    if (loading) {
        return (
            <div className={`h-full flex items-center justify-center ${className || ''}`} style={{ background: 'var(--bg-0)' }}>
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-400)' }} />
                <span className="ml-3" style={{ color: 'var(--text-1)' }}>加载画板中...</span>
            </div>
        );
    }

    return (
        <div className={`relative h-full ${className || ''}`} style={{ background: 'var(--bg-0)' }} onDragOver={onDragOver} onDrop={onDrop}>
            {nodes.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4" style={{ height: '100%', background: 'var(--surface-1)' }}>
                    <div className="text-center">
                        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-0)' }}>
                            {topic?.title || 'Thinking Board'}
                        </h2>
                        <p className="text-sm mb-6" style={{ color: 'var(--text-2)' }}>
                            从一个核心问题开始，逐步拆解、提出假说、收集证据
                        </p>
                        <button
                            onClick={createRootQuestion}
                            className="inline-flex items-center gap-2 px-6 py-3 font-medium rounded-xl transition-all hover:-translate-y-0.5"
                            style={{
                                background: 'linear-gradient(135deg, var(--accent-500) 0%, var(--interactive-hover) 100%)',
                                color: '#fff',
                                boxShadow: '0 10px 24px rgba(31, 58, 95, 0.28)',
                            }}
                        >
                            <Plus size={18} /> 创建根问题
                        </button>
                    </div>
                </div>
            ) : (
                <ReactFlow
                    nodes={nodesWithCallbacks}
                    edges={styledEdges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodesDelete={(deleted) => deleted.forEach(n => handleDeleteNode(n.id))}
                    onNodeDragStop={onNodeDragStop}
                    onSelectionChange={handleSelectionChange}
                    onNodeDoubleClick={handleNodeDoubleClick}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.3, maxZoom: 1, minZoom: 0.55 }}
                    minZoom={0.25}
                    maxZoom={2}
                    proOptions={{ hideAttribution: true }}
                    style={{ background: 'var(--bg-0)' }}
                >
                    <Background
                        variant={BackgroundVariant.Dots}
                        gap={24}
                        size={1}
                        color="rgba(148,163,184,0.10)"
                    />

                    <Panel position="bottom-center">
                        <div className="flex items-center gap-1 px-3 py-2 rounded-xl glass-surface" style={{ boxShadow: '0 10px 22px rgba(31, 27, 20, 0.14)' }}>
                            <button
                                onClick={focusRootQuestion}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors hover:bg-blue-500/10"
                                style={{ color: 'var(--text-1)' }}
                                title="聚焦核心问题"
                            >
                                <span className="inline-flex items-center gap-1.5">
                                    <Target size={15} />
                                    聚焦核心问题
                                </span>
                            </button>
                            <button
                                onClick={autoLayout}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors hover:bg-blue-500/10"
                                style={{ color: 'var(--text-1)' }}
                                title="自动排列"
                            >
                                <span className="inline-flex items-center gap-1.5">
                                    <LayoutGrid size={16} />
                                    自动排列
                                </span>
                            </button>
                        </div>
                    </Panel>

                    <Controls
                        position="bottom-left"
                        showInteractive={false}
                        style={{
                            background: 'var(--surface-0)',
                            backdropFilter: 'blur(12px)',
                            border: '1px solid var(--stroke-0)',
                            borderRadius: '12px',
                            boxShadow: '0 10px 22px rgba(31, 27, 20, 0.14)',
                        }}
                    />
                    <MiniMap
                        position="bottom-right"
                        nodeColor={(n) => {
                            if (n.type === 'questionNode') return BOARD_PALETTE.question;
                            if (n.type === 'hypothesisNode') return BOARD_PALETTE.hypothesis;
                            if (n.type === 'draftNode') return '#8B5CF6';
                            return BOARD_PALETTE.evidence;
                        }}
                        maskColor="rgba(248,250,252,0.8)"
                        style={{
                            background: 'var(--surface-0)',
                            border: '1px solid var(--stroke-0)',
                            borderRadius: '12px',
                            boxShadow: '0 10px 22px rgba(31, 27, 20, 0.14)',
                        }}
                    />
                </ReactFlow>
            )}

            {/* Draft Commit Bar */}
            <DraftCommitBar
                draft={pendingDraft}
                onCommitAll={handleCommitAll}
                onRejectAll={handleRejectAll}
                onReview={handleReview}
            />

            {/* Health Sidebar overlay (Spec §4, §11) */}
            {boardId && (
                <div className="absolute top-4 right-4 z-10">
                    <HealthSidebar boardId={boardId} invalidateCounter={0} />
                </div>
            )}
        </div>
    );
}
