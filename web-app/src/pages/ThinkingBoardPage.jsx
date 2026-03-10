// ========= Thinking Board Page — V2 (React Flow) =========

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
    getSmoothStepPath,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { ArrowLeft, Plus, ExternalLink, Loader2, LayoutGrid, GripVertical, Search, Target } from 'lucide-react';
import { boardsApi } from '../lib/api';
import { useUIStore, useCardsStore } from '../lib/store';
import AddCardSection from '../components/AddCardSection';
import BoardChatPanel from '../components/BoardChatPanel';

// Custom nodes
import QuestionNode from '../components/board/QuestionNode';
import HypothesisNode from '../components/board/HypothesisNode';
import EvidenceNode from '../components/board/EvidenceNode';

const nodeTypes = {
    questionNode: QuestionNode,
    hypothesisNode: HypothesisNode,
    evidenceNode: EvidenceNode,
};

const BOARD_PALETTE = {
    question: '#2F80FF',
    hypothesis: '#2F80FF',
    hypothesisPending: '#2F80FF',
    evidence: '#18A06A',
    neutral: '#94A3B8',
    refute: '#C33A30',
};

// ========= Custom Edges =========
function MonoStepEdge({ id, sourceX, sourceY, targetX, targetY, style, markerEnd, data }) {
    const [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY });
    const glow = !!data?.isFocus;

    return (
        <>
            {/* hitbox (thick, transparent, clickable) */}
            <path d={path} fill="none" stroke="rgba(0,0,0,0)" strokeWidth={12} pointerEvents="stroke" />

            {/* visual (thin, colored) */}
            <path d={path} fill="none" strokeWidth={style?.strokeWidth || 1.6} stroke={style?.stroke} strokeDasharray={style?.strokeDasharray} markerEnd={markerEnd} />

            {/* glow (only focus chain) */}
            {glow && (
                <path
                    d={path}
                    fill="none"
                    stroke="var(--glow)"
                    strokeWidth={(style?.strokeWidth || 1.6) + 2}
                    strokeLinecap="round"
                    style={{ filter: 'drop-shadow(0 0 4px var(--glow))' }}
                />
            )}
        </>
    );
}

const edgeTypes = { monoStep: MonoStepEdge };

// ========= Dagre Layout =========
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const NODE_WIDTH = 320;

// Fixed node dimensions per type — keeps dagre layout and actual rendering in sync
const NODE_DIMS = {
    questionNode: { width: NODE_WIDTH, height: 160 },
    hypothesisNode: { width: NODE_WIDTH, height: 200 },
    evidenceNode: { width: 280, height: 180 },
};

function getLayoutedElements(nodes, edges, direction = 'TB') {
    dagreGraph.setGraph({ rankdir: direction, ranksep: 120, nodesep: 80, edgesep: 40 });

    // Clear previous graph
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
            // Set explicit dimensions so React Flow knows the real size
            style: { ...(node.style || {}), width: dims.width, height: dims.height },
        };
    });

    return { nodes: layoutedNodes, edges };
}

// ========= Edge styles =========
// Evidence edges (H→E): all SOLID, colored by relation
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
        default: // neutral
            return {
                stroke: BOARD_PALETTE.neutral,
                strokeWidth: 1.6,
                markerEnd: { type: MarkerType.ArrowClosed, color: BOARD_PALETTE.neutral },
            };
    }
}

// Parent-child edges (Q→Q, Q→H): style depends on target hypo_state
function getParentEdgeStyle(isHypoTarget, hypoState) {
    const baseColor = 'var(--stroke-1)';
    if (isHypoTarget) {
        // Pending = dashed, Verified = solid
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
    // Q→Q decompose: always solid gray
    return {
        stroke: baseColor,
        strokeWidth: 1.6,
        markerEnd: { type: MarkerType.ArrowClosed, color: baseColor },
    };
}

// ========= Build highlight URL =========
function buildHighlightUrl(baseUrl, rawSnippet) {
    if (!baseUrl || !rawSnippet) return baseUrl || '#';
    try {
        const url = new URL(baseUrl);
        const cleanText = rawSnippet.replace(/\s+/g, ' ').trim().slice(0, 80);
        if (!cleanText) return baseUrl;
        url.hash = `:~:text=${encodeURIComponent(cleanText).replace(/-/g, '%2D')}`;
        return url.toString();
    } catch { return baseUrl; }
}

// ========= Main Component =========
function ThinkingBoardPage() {
    return (
        <ReactFlowProvider>
            <ThinkingBoardInner />
        </ReactFlowProvider>
    );
}

function ThinkingBoardInner() {
    const { screenToFlowPosition, setCenter } = useReactFlow();
    const navigate = useNavigate();
    const { topicId } = useParams();
    const { showToast } = useUIStore();
    const { cards, fetchCards } = useCardsStore();

    // Board state
    const [boardId, setBoardId] = useState(null);
    const [topic, setTopic] = useState(null);
    const [loading, setLoading] = useState(true);

    // Zoom & LOD state — mini only at extreme zoom-out to avoid hiding content
    const zoom = useStore(s => s.transform[2]);
    const lod = zoom < 0.35 ? 'mini' : zoom < 1.15 ? 'normal' : 'full';

    // React Flow state
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    // Sidebar
    const [showAllCards, setShowAllCards] = useState(false);
    const [showAddCard, setShowAddCard] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [focusedChainIds, setFocusedChainIds] = useState(null); // Set<nodeId> or null

    // ========= Cinematic Focus Mode =========
    const handleSelectionChange = useCallback(({ nodes: selectedNodes }) => {
        if (!selectedNodes || selectedNodes.length === 0) {
            setFocusedChainIds(null); // Clear focus — show everything
            return;
        }
        if (selectedNodes.length > 1) {
            setFocusedChainIds(null); // Multi-select doesn't trigger focus
            return;
        }
        const selectedId = selectedNodes[0].id;
        const chain = new Set([selectedId]);

        // BFS: 2 hops from selected node
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

    // DB mapping: React Flow node id → DB node id (and vice versa)
    const dbNodeMapRef = useRef({}); // { rfId: dbNodeId }
    const dbEdgeMapRef = useRef({}); // { rfEdgeId: dbEdgeId }

    // ========= Load Board Data =========
    useEffect(() => {
        fetchCards(showAllCards ? {} : { topic_id: topicId });
    }, [topicId, fetchCards, showAllCards]);

    // ========= Load Board Data =========
    const loadBoard = useCallback(async () => {
        try {
            setLoading(true);
            const response = await boardsApi.getTopicBoard(topicId);
            const { board, topic: topicData } = response;

            setBoardId(board.id);
            setTopic(topicData);

            if (!board.nodes || board.nodes.length === 0) {
                setNodes([]);
                setEdges([]);
                setLoading(false);
                return;
            }

            // Convert DB nodes to React Flow nodes
            const rfNodes = [];
            const idMap = {}; // dbId → rfId (we use dbId as rfId for simplicity)

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

            // Build edges from parent_id (decompose tree) + board_edges (evidence relations)
            const rfEdges = [];

            // Parent-child edges from parent_id
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

            // Board edges (H↔E supports/refutes/neutral, etc.)
            for (const dbEdge of (board.edges || [])) {
                const rfEdgeId = `edge-${dbEdge.id}`;
                dbEdgeMapRef.current[rfEdgeId] = dbEdge.id;

                // Also tell the evidence node what its edge relation is
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

            // Always auto-layout on enter to prevent overlaps
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
    }, [topicId, showToast, setNodes, setEdges]);

    useEffect(() => {
        loadBoard();
    }, [loadBoard]);

    // ========= Node Action Callbacks =========
    // These get injected into node data so custom nodes can call them

    const handleNodeUpdate = useCallback(async (nodeId, updates) => {
        const dbId = dbNodeMapRef.current[nodeId] || nodeId;
        try {
            await boardsApi.updateNode(boardId, dbId, updates);
            // Update local node data
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
        // Find the edge connected to this evidence node
        const edge = edges.find(e => e.target === evidenceNodeId && e.data?.dbEdgeId);
        if (!edge) return;

        try {
            await boardsApi.updateEdge(boardId, edge.data.dbEdgeId, updates);

            // Update edge style
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

            // Update evidence node's edgeRelation
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

            // Auto re-layout
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

            // Remove node and all descendants + connected edges
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

            // Clean up maps
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
                // We use setTimeout to avoid batch update issues
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
        return nodes.map(node => {
            const childEdges = edges.filter(e => e.source === node.id && e.id.startsWith('parent-'));
            const childCount = childEdges.length;

            // Focus mode dimming
            const dimmed = focusedChainIds ? !focusedChainIds.has(node.id) : false;
            const focusStyle = dimmed
                ? { opacity: 0.30, transition: 'opacity 0.25s ease', pointerEvents: 'none' }
                : { opacity: 1, transition: 'opacity 0.25s ease', pointerEvents: 'auto' };

            const baseCallbacks = {
                onUpdate: handleNodeUpdate,
                onDelete: handleDeleteNode,
                childCount,
                lod, // Inject Level of Detail
                dimmed, // Expose dimmed state if nodes need it internal
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
    }, [nodes, edges, handleNodeUpdate, handleDeleteNode, createChildNode, handleEdgeUpdate, focusedChainIds]);

    // ========= Energy Packets + Edge Focus Styling =========
    const styledEdges = useMemo(() => {
        // Build a map of nodeId -> hypo_state for quick lookup
        const hypoStateMap = {};
        nodes.forEach(n => {
            if (n.type === 'hypothesisNode') {
                hypoStateMap[n.id] = n.data?.hypo_state || 'pending';
            }
        });

        return edges.map(edge => {
            let extraStyle = {};
            let animated = edge.animated || false;

            // For parent edges targeting a hypothesis, update dash based on live hypo_state
            if (edge.data?.isParent && edge.data?.isHypoTarget) {
                const targetState = hypoStateMap[edge.target] || 'pending';
                const isPending = targetState === 'pending';
                extraStyle = {
                    stroke: isPending ? BOARD_PALETTE.hypothesisPending : BOARD_PALETTE.hypothesis,
                    strokeWidth: isPending ? 1.6 : 2,
                    strokeDasharray: isPending ? '6 4' : '0',
                };
            }

            // Focus mode: dim edges not connecting focused nodes
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

    // ========= Drag card from sidebar → create Evidence =========
    const onDragOver = useCallback((event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const draggedCardRef = useRef(null);

    const handleDragStart = useCallback((card) => {
        draggedCardRef.current = card;
    }, []);

    const onDrop = useCallback(async (event) => {
        event.preventDefault();
        const card = draggedCardRef.current;
        if (!card) return;
        draggedCardRef.current = null;

        // Find the nearest hypothesis node to drop position
        // For now, we'll prompt user to drop ON a hypothesis — check if drop target intersects
        // Simple approach: find hypothesis under drop position
        // Simple approach: find hypothesis under drop position
        const position = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });
        const dropX = position.x;
        const dropY = position.y;

        // Find closest hypothesis node
        let closestHypo = null;
        let minDist = Infinity;
        for (const node of nodes) {
            if (node.type !== 'hypothesisNode') continue;
            const dims = NODE_DIMS[node.type] || { width: NODE_WIDTH, height: 180 };
            const nodeX = node.position.x + dims.width / 2;
            const nodeY = node.position.y + dims.height / 2;
            // Rough screen-to-flow transform (simplified, works at zoom=1)
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
            // 1. Create evidence node
            const result = await boardsApi.createNode(boardId, {
                node_type: 'evidence',
                card_id: card.id,
                content: { text: card.summary || card.raw_snippet || '' },
                evidence_type: 'fact',
                strength: 3,
            });
            const evidenceNode = result.node;

            // 2. Create edge (hypothesis → evidence, default supports)
            const edgeResult = await boardsApi.createEdge(boardId, {
                source_node_id: dbNodeMapRef.current[closestHypo.id] || closestHypo.id,
                target_node_id: evidenceNode.id,
                relation_type: 'supports',
            });

            // 3. Add to React Flow
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
                    card: card, // pass full card data for display
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
    }, [boardId, nodes, setNodes, setEdges, showToast, autoLayout]);

    // ========= Handle Connect (drag handle → handle) =========
    const onConnect = useCallback(async (connection) => {
        const { source, target } = connection;
        if (!source || !target || source === target) return;

        const sourceNode = nodes.find(n => n.id === source);
        const targetNode = nodes.find(n => n.id === target);
        if (!sourceNode || !targetNode) return;

        const srcType = sourceNode.type; // questionNode, hypothesisNode, evidenceNode
        const tgtType = targetNode.type;

        const dbSourceId = dbNodeMapRef.current[source] || source;
        const dbTargetId = dbNodeMapRef.current[target] || target;

        try {
            // Q→Q: set parent_id (sub-question decomposition)
            // Q→H: set parent_id (hypothesis under question)
            // H→H: set parent_id (sub-hypothesis)
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
            // H→E or E→H: create evidence edge (supports by default)
            else if (
                (srcType === 'hypothesisNode' && tgtType === 'evidenceNode') ||
                (srcType === 'evidenceNode' && tgtType === 'hypothesisNode')
            ) {
                const hypoId = srcType === 'hypothesisNode' ? source : target;
                const evidId = srcType === 'evidenceNode' ? source : target;
                const dbHypoId = dbNodeMapRef.current[hypoId] || hypoId;
                const dbEvidId = dbNodeMapRef.current[evidId] || evidId;

                // Also set parent_id on evidence → hypothesis
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

                // Update parent edge for evidence
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

                // Update evidence node's edgeRelation
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

    // ========= Sidebar Cards =========
    const filteredCards = useMemo(() => {
        let result = showAllCards ? cards : cards.filter(c => c.topic_id === topicId);
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            result = result.filter(c =>
                (c.summary || '').toLowerCase().includes(q) ||
                (c.raw_snippet || '').toLowerCase().includes(q) ||
                (c.source?.name || '').toLowerCase().includes(q)
            );
        }
        return result;
    }, [cards, showAllCards, topicId, searchQuery]);

    // ========= Loading =========
    if (loading) {
        return (
            <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg-0)' }}>
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-400)' }} />
                <span className="ml-3" style={{ color: 'var(--text-1)' }}>加载画板中...</span>
            </div>
        );
    }

    return (
        <div className="flex" style={{ height: '100vh', width: '100%', background: 'var(--bg-0)' }}>
            {/* ========= Canvas ========= */}
            <div className="flex-1 relative" style={{ height: '100%' }} onDragOver={onDragOver} onDrop={onDrop}>
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

                        {/* Floating bottom toolbar — merged Controls + MiniMap + Auto Layout */}
                        <Panel position="top-left">
                            <div className="flex items-center gap-2 px-4 py-2 rounded-xl glass-surface" style={{ boxShadow: '0 10px 22px rgba(31, 27, 20, 0.14)' }}>
                                <button
                                    onClick={() => navigate(-1)}
                                    className="p-2 rounded-lg transition-colors hover:bg-blue-500/10"
                                    style={{ color: 'var(--text-1)' }}
                                    title="返回"
                                >
                                    <ArrowLeft size={18} />
                                </button>
                                <div className="h-5 w-px" style={{ background: 'var(--stroke-0)' }} />
                                <h1 className="text-sm font-bold max-w-[200px] truncate" style={{ color: 'var(--text-0)' }}>
                                    {topic?.title || 'Thinking Board'}
                                </h1>
                            </div>
                        </Panel>

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
            </div>

            {/* ========= Sidebar ========= */}
            {sidebarOpen && (
                <div className="w-72 flex flex-col h-full shrink-0" style={{ background: 'var(--surface-1)', borderLeft: '1px solid var(--stroke-0)' }}>
                    {/* Sidebar header */}
                    <div className="p-4" style={{ borderBottom: '1px solid var(--stroke-1)' }}>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold text-sm" style={{ color: 'var(--text-0)' }}>证据池</h3>
                            <button
                                onClick={() => setSidebarOpen(false)}
                                className="p-1 rounded transition-colors hover:bg-blue-500/10"
                                style={{ color: 'var(--text-2)' }}
                                title="收起证据池"
                            >✕</button>
                        </div>
                        {/* Search bar */}
                        <div className="relative mb-3">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-2)' }} />
                            <input
                                id="board-evidence-search"
                                name="board_evidence_search"
                                aria-label="搜索证据"
                                type="text"
                                placeholder="搜索证据..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-8 pr-3 py-2 text-xs rounded-lg outline-none transition-all"
                                style={{
                                    background: 'var(--bg-0)',
                                    color: 'var(--text-0)',
                                    border: '1px solid var(--stroke-0)',
                                }}
                                onFocus={(e) => { e.target.style.borderColor = 'var(--accent-400)'; }}
                                onBlur={(e) => { e.target.style.borderColor = 'var(--stroke-0)'; }}
                            />
                        </div>
                        <div className="flex gap-1">
                            <button
                                onClick={() => setShowAllCards(false)}
                                className="flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors"
                                style={{
                                    background: !showAllCards ? 'rgba(13,110,253,0.12)' : 'transparent',
                                    color: !showAllCards ? 'var(--accent-300)' : 'var(--text-2)',
                                }}
                            >
                                当前 Topic
                            </button>
                            <button
                                onClick={() => setShowAllCards(true)}
                                className="flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors"
                                style={{
                                    background: showAllCards ? 'rgba(13,110,253,0.12)' : 'transparent',
                                    color: showAllCards ? 'var(--accent-300)' : 'var(--text-2)',
                                }}
                            >
                                全部卡片
                            </button>
                        </div>
                    </div>

                    {/* Card list */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {filteredCards.map(card => {
                            const sourceName = card.source?.name || (card.source_url ? (() => { try { return new URL(card.source_url).hostname.replace('www.', ''); } catch { return ''; } })() : '');
                            return (
                                <div
                                    key={card.id}
                                    draggable
                                    onDragStart={() => handleDragStart(card)}
                                    className="group/card flex items-start gap-2 p-3 rounded-xl cursor-grab text-sm transition-all hover:-translate-y-0.5"
                                    style={{
                                        background: 'var(--surface-0)',
                                        border: '1px solid var(--stroke-0)',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                }}
                            >
                                {/* Drag affordance icon */}
                                <div className="shrink-0 pt-0.5 opacity-30 group-hover/card:opacity-70 transition-opacity" style={{ color: 'var(--text-2)' }}>
                                    <GripVertical size={14} />
                                    </div>
                                    {/* Card content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between mb-1.5 gap-2">
                                            <div className="flex items-start gap-1.5 flex-1 min-w-0">
                                                <span
                                                    className="text-[9px] font-mono font-bold uppercase tracking-wide px-1 rounded-sm shrink-0"
                                                    style={{
                                                        color: '#fff',
                                                        backgroundColor: card.fact_or_view === 'view' ? 'var(--text-secondary)' : 'var(--text-primary)',
                                                        marginTop: '2px'
                                                    }}
                                                >
                                                    {card.fact_or_view === 'view' ? 'VIEW' : 'FACT'}
                                                </span>
                                                <span className="font-bold text-[12px] leading-snug line-clamp-2" style={{ color: 'var(--text-0)' }}>
                                                    {card.title || '暂未命名'}
                                                </span>
                                            </div>
                                            {card.source_url && (
                                                <a
                                                    href={buildHighlightUrl(card.source_url, card.raw_snippet)}
                                                    target="_blank" rel="noopener noreferrer"
                                                    className="opacity-0 group-hover/card:opacity-100 transition-all p-0.5 shrink-0"
                                                    style={{ color: 'var(--accent-300)' }}
                                                    title="跳转原文"
                                                    onClick={e => e.stopPropagation()}
                                                >
                                                    <ExternalLink size={11} />
                                                </a>
                                            )}
                                        </div>
                                        {sourceName && <div className="text-[10px] mb-1.5 truncate" style={{ color: 'var(--accent-300)' }}>📰 {sourceName}</div>}
                                        <div className="line-clamp-3 text-[11px] font-medium" style={{ color: 'var(--text-1)', lineHeight: '1.55' }}>{card.summary || '(无内容)'}</div>
                                        {card.raw_snippet && (
                                            <details className="mt-2">
                                                <summary className="text-[10px] cursor-pointer select-none" style={{ color: 'var(--text-2)' }}>查看原文</summary>
                                                <div className="mt-1 p-2 rounded text-[11px] max-h-24 overflow-y-auto whitespace-pre-wrap break-words" style={{ background: 'var(--bg-0)', border: '1px solid var(--stroke-0)', color: 'var(--text-2)', lineHeight: '1.55' }}>
                                                    {card.raw_snippet}
                                                </div>
                                            </details>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {filteredCards.length === 0 && (
                            <div className="text-center text-xs py-8" style={{ color: 'var(--text-2)' }}>暂无卡片</div>
                        )}
                    </div>

                    {/* Add card toggle */}
                    <div className="p-3" style={{ borderTop: '1px solid var(--stroke-1)' }}>
                        <button
                            onClick={() => setShowAddCard(!showAddCard)}
                            className="w-full text-xs py-2 rounded-lg font-medium transition-colors hover:bg-blue-500/10"
                            style={{ background: 'var(--bg-1)', border: '1px solid var(--stroke-0)', color: 'var(--text-1)' }}
                        >
                            {showAddCard ? '收起' : '+ 新建卡片'}
                        </button>
                        {showAddCard && (
                            <div className="mt-3">
                                <AddCardSection />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Sidebar toggle when closed */}
            {!sidebarOpen && (
                <button
                    onClick={() => setSidebarOpen(true)}
                    className="fixed right-4 top-1/2 -translate-y-1/2 rounded-xl px-2 py-4 transition-colors z-10 glass-surface"
                    style={{ color: 'var(--text-1)', boxShadow: '0 10px 22px rgba(31, 27, 20, 0.14)' }}
                    title="打开证据池"
                >
                    <span className="text-xs font-bold" style={{ writingMode: 'vertical-rl' }}>证据池</span>
                </button>
            )}

            {/* AI Chat Panel */}
            {boardId && (
                <BoardChatPanel
                    boardId={boardId}
                    topicId={topicId}
                    topicTitle={topic?.title}
                    onBoardMutated={loadBoard}
                />
            )}
        </div>
    );
}

export default ThinkingBoardPage;
