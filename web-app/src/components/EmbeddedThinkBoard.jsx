// ========= Embedded Think Board 鈥?Right Panel Canvas =========
// Stripped-down ReactFlow canvas for embedding inside CardsPage right panel.
// No Evidence Pool sidebar (that lives in the main panel).
// Exposes an onExpandFull callback for "open full screen" button.

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
  getSmoothStepPath,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { Plus, Loader2, LayoutGrid } from 'lucide-react';
import { boardsApi } from '../lib/api';
import { useUIStore } from '../lib/store';

import QuestionNode from './board/QuestionNode';
import HypothesisNode from './board/HypothesisNode';
import EvidenceNode from './board/EvidenceNode';

// 鈹€鈹€ Node / Edge type registries 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

const nodeTypes = {
  questionNode: QuestionNode,
  hypothesisNode: HypothesisNode,
  evidenceNode: EvidenceNode,
};

const BOARD_PALETTE = {
  question: '#2F80FF',
  hypothesis: '#2F80FF',
  hypothesisPending: '#2F80FF',
  evidence: '#1F9D67',
  neutral: '#8D8576',
  refute: '#C34A3C',
};

function MonoStepEdge({ sourceX, sourceY, targetX, targetY, style, markerEnd, data }) {
  const [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY });
  const glow = !!data?.isFocus;
  return (
    <>
      <path d={path} fill="none" stroke="rgba(0,0,0,0)" strokeWidth={12} pointerEvents="stroke" />
      <path
        d={path}
        fill="none"
        strokeWidth={style?.strokeWidth || 1.6}
        stroke={style?.stroke}
        strokeDasharray={style?.strokeDasharray}
        markerEnd={markerEnd}
      />
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

// 鈹€鈹€ Dagre layout 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const NODE_DIMS = {
  questionNode: { width: 224, height: 102 },
  hypothesisNode: { width: 224, height: 110 },
  evidenceNode: { width: 214, height: 92 },
};

function getLayoutedElements(nodes, edges, direction = 'TB') {
  dagreGraph.setGraph({ rankdir: direction, ranksep: 82, nodesep: 44, edgesep: 22 });
  dagreGraph.nodes().forEach(n => dagreGraph.removeNode(n));
  nodes.forEach(node => {
    const dims = NODE_DIMS[node.type] || { width: 240, height: 110 };
    dagreGraph.setNode(node.id, { width: dims.width, height: dims.height });
  });
  edges.forEach(edge => dagreGraph.setEdge(edge.source, edge.target));
  dagre.layout(dagreGraph);
  return {
    nodes: nodes.map(node => {
      const pos = dagreGraph.node(node.id);
      const dims = NODE_DIMS[node.type] || { width: 240, height: 110 };
      return {
        ...node,
        position: { x: pos.x - dims.width / 2, y: pos.y - dims.height / 2 },
        style: { ...(node.style || {}), width: dims.width, height: dims.height },
      };
    }),
    edges,
  };
}

// 鈹€鈹€ Edge style helpers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function getEvidenceEdgeStyle(rel) {
  if (rel === 'supports') {
    return { stroke: BOARD_PALETTE.evidence, strokeWidth: 2, markerEnd: { type: MarkerType.ArrowClosed, color: BOARD_PALETTE.evidence } };
  }
  if (rel === 'refutes') {
    return { stroke: BOARD_PALETTE.refute, strokeWidth: 2, markerEnd: { type: MarkerType.ArrowClosed, color: BOARD_PALETTE.refute } };
  }
  return { stroke: BOARD_PALETTE.neutral, strokeWidth: 1.6, markerEnd: { type: MarkerType.ArrowClosed, color: BOARD_PALETTE.neutral } };
}

function getParentEdgeStyle(isHypo, hypoState) {
  if (isHypo) {
    const pending = !hypoState || hypoState === 'pending';
    return {
      stroke: pending ? BOARD_PALETTE.hypothesisPending : BOARD_PALETTE.hypothesis,
      strokeWidth: pending ? 1.6 : 2,
      strokeDasharray: pending ? '6 4' : '0',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: pending ? BOARD_PALETTE.hypothesisPending : BOARD_PALETTE.hypothesis,
      },
    };
  }
  return {
    stroke: 'var(--stroke-1)',
    strokeWidth: 1.6,
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--stroke-1)' },
  };
}

// 鈹€鈹€ DB 鈫?React Flow conversion 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function dbNodeToRF(dbNode) {
  const pos = { x: dbNode.position_x || 0, y: dbNode.position_y || 0 };
  if (dbNode.node_type === 'question') {
    return { id: dbNode.id, type: 'questionNode', position: pos, data: { content: dbNode.content || {}, priority: dbNode.priority || 'normal', status: dbNode.status || 'open', decomposition_type: dbNode.decomposition_type } };
  }
  if (dbNode.node_type === 'hypothesis') {
    return { id: dbNode.id, type: 'hypothesisNode', position: pos, data: { claim: dbNode.claim || dbNode.content?.text || '', hypo_state: dbNode.hypo_state || 'pending', confidence: dbNode.confidence || 0 } };
  }
  if (dbNode.node_type === 'evidence') {
    return { id: dbNode.id, type: 'evidenceNode', position: pos, data: { content: dbNode.content || {}, card: dbNode.card || null, evidence_type: dbNode.evidence_type || 'fact', strength: dbNode.strength || 3 } };
  }
  return null;
}

function collectBranchIds(nodeId, edges) {
  const branch = new Set([nodeId]);
  const linkedEdges = edges.filter((edge) => edge.data?.isParent || edge.data?.dbEdgeId);

  const walkDown = (startId) => {
    linkedEdges
      .filter((edge) => edge.source === startId)
      .forEach((edge) => {
        if (branch.has(edge.target)) return;
        branch.add(edge.target);
        walkDown(edge.target);
      });
  };

  const walkUp = (startId) => {
    linkedEdges
      .filter((edge) => edge.target === startId)
      .forEach((edge) => {
        if (branch.has(edge.source)) return;
        branch.add(edge.source);
        walkUp(edge.source);
      });
  };

  walkDown(nodeId);
  walkUp(nodeId);
  return branch;
}
// 鈹€鈹€ Inner component (needs ReactFlowProvider in parent) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function EmbeddedThinkBoardInner({
  topicId,
  topic,
  selectedNodeId: externalSelectedNodeId,
  focusRequest,
  boardRefreshToken = 0,
  onSelectionChange,
  onBoardMutated,
}) {
  const { screenToFlowPosition, setCenter } = useReactFlow();
  const { showToast } = useUIStore();
  const zoom = useStore(s => s.transform[2]);
  const lod = zoom < 0.35 ? 'mini' : zoom < 1.15 ? 'normal' : 'full';

  const [boardId, setBoardId]             = useState(null);
  const [loading, setLoading]             = useState(true);
  const [nodes, setNodes, onNodesChange]  = useNodesState([]);
  const [edges, setEdges, onEdgesChange]  = useEdgesState([]);
  const [focusedChainIds, setFocusedChainIds] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [compactMode, setCompactMode] = useState(true);

  const dbNodeMapRef = useRef({});
  const dbEdgeMapRef = useRef({});
  const skipNextRefreshRef = useRef(false);
  const pendingLocalClearRef = useRef(null);
  const loadRequestSeqRef = useRef(0);
  const selectedNodeIdRef = useRef(null);
  const suppressSelectionOnceRef = useRef(false);

  const notifyBoardMutated = useCallback(() => {
    skipNextRefreshRef.current = true;
    onBoardMutated?.();
  }, [onBoardMutated]);

  // 鈹€鈹€ Load board data 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  // react-best-practices: no waterfall 鈥?board fetch is a single request
  const loadBoard = useCallback(async () => {
    if (!topicId) return;
    const requestId = loadRequestSeqRef.current + 1;
    loadRequestSeqRef.current = requestId;
    try {
      setLoading(true);
      const { board } = await boardsApi.getTopicBoard(topicId);
      if (requestId !== loadRequestSeqRef.current) return;

      setBoardId(board.id);

      if (!board.nodes?.length) {
        setNodes([]);
        setEdges([]);
        return;
      }

      const rfNodes = board.nodes.map(dbNodeToRF).filter(Boolean);
      const idSet = new Set(rfNodes.map(n => n.id));

      // Attach edge relation data to evidence nodes
      const rfEdges = [];
      board.nodes.forEach(dbNode => {
        if (dbNode.parent_id && idSet.has(dbNode.parent_id)) {
          const isHypo = dbNode.node_type === 'hypothesis';
          rfEdges.push({
            id: `parent-${dbNode.id}`,
            source: dbNode.parent_id,
            target: dbNode.id,
            type: 'monoStep',
            style: getParentEdgeStyle(isHypo, dbNode.hypo_state),
            data: { isParent: true, isHypoTarget: isHypo },
          });
        }
      });
      (board.edges || []).forEach(dbEdge => {
        const rfEdgeId = `edge-${dbEdge.id}`;
        dbEdgeMapRef.current[rfEdgeId] = dbEdge.id;
        const targetNode = rfNodes.find(n => n.id === dbEdge.target_node_id);
        if (targetNode?.type === 'evidenceNode') {
          targetNode.data.edgeRelation = dbEdge.relation_type;
          targetNode.data._edgeId = rfEdgeId;
        }
        rfEdges.push({
          id: rfEdgeId,
          source: dbEdge.source_node_id,
          target: dbEdge.target_node_id,
          type: 'monoStep',
          style: getEvidenceEdgeStyle(dbEdge.relation_type),
          data: { relation_type: dbEdge.relation_type, dbEdgeId: dbEdge.id },
        });
      });

      rfNodes.forEach(n => { dbNodeMapRef.current[n.id] = n.id; });

      if (rfNodes.length > 0) {
        const { nodes: layouted } = getLayoutedElements(rfNodes, rfEdges, 'TB');
        setNodes(layouted);
      } else {
        setNodes(rfNodes);
      }
      setEdges(rfEdges);
    } catch {
      if (requestId === loadRequestSeqRef.current) {
        showToast('鍔犺浇鐢绘澘澶辫触', 'error');
      }
    } finally {
      if (requestId === loadRequestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [topicId, showToast, setNodes, setEdges]);

  useEffect(() => {
    loadRequestSeqRef.current += 1;
    setBoardId(null);
    dbNodeMapRef.current = {};
    dbEdgeMapRef.current = {};
    skipNextRefreshRef.current = false;
    setFocusedChainIds(null);
    setSelectedNodeId(null);
    selectedNodeIdRef.current = null;
    onSelectionChange?.(null, []);
    loadBoard();
  }, [topicId, loadBoard, onSelectionChange]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  useEffect(() => {
    if (!topicId) return;
    if (skipNextRefreshRef.current) {
      skipNextRefreshRef.current = false;
      return;
    }
    loadBoard();
  }, [topicId, boardRefreshToken, loadBoard]);

  // 鈹€鈹€ Auto layout 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  const autoLayout = useCallback(() => {
    setNodes(cur => {
      setEdges(eds => {
        const { nodes: layouted } = getLayoutedElements(cur, eds, 'TB');
        setTimeout(() => setNodes(layouted), 0);
        return eds;
      });
      return cur;
    });
  }, [setNodes, setEdges]);

  // 鈹€鈹€ CRUD handlers 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  const handleNodeUpdate = useCallback(async (nodeId, updates) => {
    const dbId = dbNodeMapRef.current[nodeId] || nodeId;
    try {
      await boardsApi.updateNode(boardId, dbId, updates);
      setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n));
      notifyBoardMutated();
    } catch {
      showToast('鏇存柊澶辫触', 'error');
    }
  }, [boardId, notifyBoardMutated, setNodes, showToast]);

  const handleEdgeUpdate = useCallback(async (evidenceNodeId, updates) => {
    const edge = edges.find(e => e.target === evidenceNodeId && e.data?.dbEdgeId);
    if (!edge) return;
    try {
      await boardsApi.updateEdge(boardId, edge.data.dbEdgeId, updates);
      const newRel = updates.relation_type || edge.data?.relation_type;
      setEdges(eds => eds.map(e => e.id !== edge.id ? e : { ...e, style: getEvidenceEdgeStyle(newRel), data: { ...e.data, relation_type: newRel } }));
      setNodes(nds => nds.map(n => n.id === evidenceNodeId ? { ...n, data: { ...n.data, edgeRelation: updates.relation_type } } : n));
      notifyBoardMutated();
    } catch {
      showToast('鏇存柊鍏崇郴澶辫触', 'error');
    }
  }, [boardId, edges, notifyBoardMutated, setEdges, setNodes, showToast]);

  const createChildNode = useCallback(async (parentId, nodeType, extraData = {}) => {
    const dbParentId = dbNodeMapRef.current[parentId] || parentId;
    try {
      const result = await boardsApi.createNode(boardId, { node_type: nodeType, parent_id: dbParentId, content: extraData.content || { text: '' }, claim: extraData.claim || '', ...extraData });
      const newNode = result.node;
      dbNodeMapRef.current[newNode.id] = newNode.id;
      const parentNode = nodes.find(n => n.id === parentId);
      const rfNode = {
        id: newNode.id,
        type: nodeType === 'question' ? 'questionNode' : 'hypothesisNode',
        position: { x: (parentNode?.position?.x || 0) + 40, y: (parentNode?.position?.y || 0) + 180 },
        data: nodeType === 'question'
          ? { content: newNode.content || {}, priority: 'normal', status: 'open' }
          : { claim: newNode.claim || '', hypo_state: 'pending', confidence: 0 },
      };
      const isHypo = nodeType === 'hypothesis';
      setNodes(nds => [...nds, rfNode]);
      setEdges(eds => [...eds, { id: `parent-${newNode.id}`, source: parentId, target: newNode.id, type: 'monoStep', style: getParentEdgeStyle(isHypo, 'pending'), data: { isParent: true, isHypoTarget: isHypo } }]);
      setTimeout(autoLayout, 100);
      notifyBoardMutated();
      showToast(nodeType === 'question' ? '已添加子问题' : '已添加假说', 'success');
    } catch {
      showToast('鍒涘缓澶辫触', 'error');
    }
  }, [boardId, nodes, notifyBoardMutated, setNodes, setEdges, autoLayout, showToast]);

  const createEvidenceNode = useCallback(async (hypothesisId, card = null, relationType = 'supports') => {
    if (!boardId) return null;
    const hypoNode = nodes.find(n => n.id === hypothesisId);
    if (!hypoNode || hypoNode.type !== 'hypothesisNode') return null;

    try {
      const evidenceText = card?.summary || card?.raw_snippet || '';
      const result = await boardsApi.createNode(boardId, {
        node_type: 'evidence',
        card_id: card?.id || undefined,
        content: { text: evidenceText },
        evidence_type: card?.fact_or_view === 'view' ? 'view' : 'fact',
        strength: 3,
      });
      const evidenceNode = result.node;

      const edgeResult = await boardsApi.createEdge(boardId, {
        source_node_id: dbNodeMapRef.current[hypothesisId] || hypothesisId,
        target_node_id: evidenceNode.id,
        relation_type: relationType,
      });

      dbNodeMapRef.current[evidenceNode.id] = evidenceNode.id;
      const rfEdgeId = `edge-${edgeResult.edge.id}`;
      dbEdgeMapRef.current[rfEdgeId] = edgeResult.edge.id;

      setNodes(nds => [...nds, {
        id: evidenceNode.id,
        type: 'evidenceNode',
        position: { x: hypoNode.position.x + 24, y: hypoNode.position.y + 150 },
        data: {
          content: evidenceNode.content,
          card: card || evidenceNode.card || null,
          evidence_type: evidenceNode.evidence_type || 'fact',
          strength: evidenceNode.strength || 3,
          edgeRelation: relationType,
          _edgeId: rfEdgeId,
        },
      }]);
      setEdges(eds => [...eds, {
        id: rfEdgeId,
        source: hypothesisId,
        target: evidenceNode.id,
        type: 'monoStep',
        style: getEvidenceEdgeStyle(relationType),
        data: { relation_type: relationType, dbEdgeId: edgeResult.edge.id },
      }]);

      setTimeout(autoLayout, 100);
      notifyBoardMutated();
      return evidenceNode;
    } catch {
      showToast('娣诲姞璇佹嵁澶辫触', 'error');
      return null;
    }
  }, [boardId, nodes, notifyBoardMutated, setNodes, setEdges, autoLayout, showToast]);

  const handleDeleteNode = useCallback(async (nodeId) => {
    const dbId = dbNodeMapRef.current[nodeId] || nodeId;
    try {
      await boardsApi.deleteNode(boardId, dbId);
      const desc = new Set();
      const findDesc = (id) => {
        desc.add(id);
        edges.filter(e => e.source === id && e.id.startsWith('parent-')).forEach(e => findDesc(e.target));
      };
      findDesc(nodeId);
      setNodes(nds => nds.filter(n => !desc.has(n.id)));
      setEdges(eds => eds.filter(e => !desc.has(e.source) && !desc.has(e.target)));
      desc.forEach(id => delete dbNodeMapRef.current[id]);
      notifyBoardMutated();
      showToast('已删除', 'success');
    } catch {
      showToast('鍒犻櫎澶辫触', 'error');
    }
  }, [boardId, edges, notifyBoardMutated, setNodes, setEdges, showToast]);

  const createRootQuestion = useCallback(async () => {
    if (!boardId) return;
    try {
      const result = await boardsApi.createNode(boardId, { node_type: 'question', content: { text: topic?.title || '鏍稿績闂' }, priority: 'high', status: 'open' });
      const newNode = result.node;
      dbNodeMapRef.current[newNode.id] = newNode.id;
      const dims = NODE_DIMS.questionNode;
      setNodes([{ id: newNode.id, type: 'questionNode', position: { x: 0, y: 0 }, data: { content: newNode.content || {}, priority: 'high', status: 'open' }, style: { width: dims.width, height: dims.height } }]);
      setEdges([]);
      notifyBoardMutated();
    } catch {
      showToast('创建根问题失败', 'error');
    }
  }, [boardId, topic, notifyBoardMutated, setNodes, setEdges, showToast]);

  const selectNodeBranch = useCallback((nodeId, options = {}) => {
    if (!nodeId) return;
    pendingLocalClearRef.current = null;
    const branch = collectBranchIds(nodeId, edges);
    selectedNodeIdRef.current = nodeId;
    setSelectedNodeId(nodeId);
    setFocusedChainIds(branch);
    setNodes((nds) => nds.map((node) => (
      node.selected === (node.id === nodeId) ? node : { ...node, selected: node.id === nodeId }
    )));

    if (options.center !== false) {
      const target = nodes.find((node) => node.id === nodeId);
      if (target) {
        const dims = NODE_DIMS[target.type] || { width: 220, height: 100 };
        setCenter(target.position.x + dims.width / 2, target.position.y + dims.height / 2, { duration: 0 });
      }
    }

    if (options.notify !== false) {
      onSelectionChange?.(nodeId, Array.from(branch));
    }
  }, [edges, nodes, onSelectionChange, setCenter, setNodes]);

  const clearSelection = useCallback(() => {
    const currentSelectedNodeId = selectedNodeIdRef.current;
    if (currentSelectedNodeId) {
      // Guard against stale externalSelectedNodeId immediately re-selecting this node.
      pendingLocalClearRef.current = currentSelectedNodeId;
    }
    setFocusedChainIds(null);
    selectedNodeIdRef.current = null;
    setSelectedNodeId(null);
    setNodes((nds) => nds.map((node) => (node.selected ? { ...node, selected: false } : node)));
    onSelectionChange?.(null, []);
  }, [onSelectionChange, setNodes]);

  const handleSelectionChange = useCallback(({ nodes: sel }) => {
    if (suppressSelectionOnceRef.current) {
      suppressSelectionOnceRef.current = false;
      return;
    }

    if (!sel?.length) {
      if (selectedNodeIdRef.current) clearSelection();
      return;
    }
    if (sel.length > 1) return;
    const nextId = sel[0].id;
    if (!nextId || nextId === selectedNodeIdRef.current) return;
    selectNodeBranch(nextId, { center: false, notify: true });
  }, [clearSelection, selectNodeBranch]);

  // 鈹€鈹€ Focus mode 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  const handleNodeClick = useCallback((event, node) => {
    if (!node?.id) return;
    if (event?.detail > 1) return;
    if (selectedNodeIdRef.current === node.id) {
      suppressSelectionOnceRef.current = true;
      clearSelection();
      return;
    }
    selectNodeBranch(node.id, { center: false, notify: true });
  }, [clearSelection, selectNodeBranch]);

  const handlePaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  useEffect(() => {
    if (!externalSelectedNodeId) {
      pendingLocalClearRef.current = null;
      return;
    }
    if (
      pendingLocalClearRef.current
      && pendingLocalClearRef.current === externalSelectedNodeId
      && !selectedNodeIdRef.current
    ) {
      return;
    }
    if (externalSelectedNodeId === selectedNodeIdRef.current) {
      return;
    }
    const exists = nodes.some((node) => node.id === externalSelectedNodeId);
    if (!exists) return;
    selectNodeBranch(externalSelectedNodeId, { center: false, notify: false });
  }, [externalSelectedNodeId, nodes, selectNodeBranch]);

  useEffect(() => {
    const requestedNodeId = focusRequest?.nodeId;
    if (!requestedNodeId) return;
    if (requestedNodeId === selectedNodeIdRef.current) return;
    const exists = nodes.some((node) => node.id === requestedNodeId);
    if (!exists) return;
    selectNodeBranch(requestedNodeId, { center: false, notify: false });
  }, [focusRequest, nodes, selectNodeBranch]);

  // 鈹€鈹€ Drag card from sidebar 鈫?create Evidence node 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(async (e) => {
    e.preventDefault();
    let card;
    try { card = JSON.parse(e.dataTransfer.getData('application/json')); } catch { return; }
    if (!card?.id || !boardId) return;

    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });

    // Find closest hypothesis node
    let closestHypo = null;
    let minDist = Infinity;
    for (const node of nodes) {
      if (node.type !== 'hypothesisNode') continue;
      const dims = NODE_DIMS[node.type] || { width: 240, height: 110 };
      const cx = node.position.x + dims.width / 2;
      const cy = node.position.y + dims.height / 2;
      const dist = Math.sqrt((position.x - cx) ** 2 + (position.y - cy) ** 2);
      if (dist < minDist) { minDist = dist; closestHypo = node; }
    }

    if (!closestHypo || minDist > 400) {
      showToast('请拖拽到某个假说节点附近', 'warning');
      return;
    }

    const created = await createEvidenceNode(closestHypo.id, card, 'supports');
    if (created) {
      showToast('证据已关联到假说', 'success');
    }
  }, [boardId, nodes, showToast, screenToFlowPosition, createEvidenceNode]);

  const defaultQuestionAnchor = useMemo(() => {
    const questionNodes = nodes.filter((node) => node.type === 'questionNode');
    if (!questionNodes.length) return null;

    const parentEdges = edges.filter((edge) => edge.id?.startsWith('parent-'));
    const rootQuestions = questionNodes.filter(
      (node) => !parentEdges.some((edge) => edge.target === node.id),
    );

    const candidates = rootQuestions.length ? rootQuestions : questionNodes;
    return candidates
      .slice()
      .sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x))[0] || null;
  }, [nodes, edges]);

  const selectedNode = useMemo(
    () => nodes.find(node => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  );
  const canAddQuestion = selectedNode?.type === 'questionNode' || (!selectedNode && !!defaultQuestionAnchor);
  const canAddHypothesis = (
    (!!selectedNode && (selectedNode.type === 'questionNode' || selectedNode.type === 'hypothesisNode'))
    || (!selectedNode && !!defaultQuestionAnchor)
  );
  const canAddEvidence = selectedNode?.type === 'hypothesisNode';

  const addQuestionFromSelection = useCallback(async () => {
    if (selectedNode && selectedNode.type !== 'questionNode') {
      showToast('瀛愰棶棰樺彧鑳芥坊鍔犲埌闂鑺傜偣', 'warning');
      return;
    }
    const anchor = selectedNode || defaultQuestionAnchor;
    if (!anchor) {
      showToast('请先创建问题节点', 'warning');
      return;
    }
    await createChildNode(anchor.id, 'question', { content: { text: '' } });
  }, [selectedNode, defaultQuestionAnchor, createChildNode, showToast]);

  const addHypothesisFromSelection = useCallback(async () => {
    const anchor = selectedNode || defaultQuestionAnchor;
    if (!anchor) {
      showToast('请先创建问题节点', 'warning');
      return;
    }
    if (anchor.type === 'questionNode' || anchor.type === 'hypothesisNode') {
      await createChildNode(anchor.id, 'hypothesis', { claim: '' });
      return;
    }
    showToast('假说只能添加到问题或假说节点', 'warning');
  }, [selectedNode, defaultQuestionAnchor, createChildNode, showToast]);

  const addEvidenceFromSelection = useCallback(async () => {
    if (!selectedNode || selectedNode.type !== 'hypothesisNode') {
      showToast('请先选中假说节点', 'warning');
      return;
    }
    const created = await createEvidenceNode(selectedNode.id, null, 'supports');
    if (created) showToast('已新增证据节点', 'success');
  }, [selectedNode, createEvidenceNode, showToast]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        clearSelection();
        return;
      }

      const target = event.target;
      const tag = target?.tagName;
      if (target?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (event.key === 'Tab') {
        event.preventDefault();
        setCompactMode(prev => !prev);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        autoLayout();
        return;
      }

      const key = event.key.toLowerCase();

      if (key === 'q') {
        event.preventDefault();
        addQuestionFromSelection();
        return;
      }
      if (key === 'h') {
        event.preventDefault();
        addHypothesisFromSelection();
        return;
      }
      if (key === 'f') {
        event.preventDefault();
        addEvidenceFromSelection();
        return;
      }
      if (!selectedNode) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        handleDeleteNode(selectedNode.id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    selectedNode,
    clearSelection,
    autoLayout,
    addQuestionFromSelection,
    addHypothesisFromSelection,
    addEvidenceFromSelection,
    handleDeleteNode,
  ]);

  // 鈹€鈹€ Derived node/edge data for rendering 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  const nodesWithCallbacks = useMemo(() => nodes.map(node => {
    const dimmed = focusedChainIds ? !focusedChainIds.has(node.id) : false;
    const focusStyle = { opacity: dimmed ? 0.92 : 1, pointerEvents: 'auto' };
    const childCount = edges.filter((edge) => edge.source === node.id).length;
    const base = { onUpdate: handleNodeUpdate, onDelete: handleDeleteNode, childCount, lod, compactMode };
    const styled = { ...node, style: { ...(node.style || {}), ...focusStyle } };
    if (node.type === 'questionNode')   return { ...styled, data: { ...node.data, ...base, onAddSubQuestion: id => createChildNode(id, 'question', { content: { text: '' } }), onAddHypothesis: id => createChildNode(id, 'hypothesis', { claim: '' }) } };
    if (node.type === 'hypothesisNode') return { ...styled, data: { ...node.data, ...base, onAddSubHypothesis: id => createChildNode(id, 'hypothesis', { claim: '' }), onAddEvidence: id => createEvidenceNode(id, null, 'supports') } };
    if (node.type === 'evidenceNode')   return { ...styled, data: { ...node.data, ...base, onEdgeUpdate: handleEdgeUpdate } };
    return styled;
  }), [nodes, edges, handleNodeUpdate, handleDeleteNode, createChildNode, createEvidenceNode, handleEdgeUpdate, focusedChainIds, lod, compactMode]);

  const styledEdges = useMemo(() => edges.map(e => {
    if (!focusedChainIds) return e;
    const inChain = focusedChainIds.has(e.source) && focusedChainIds.has(e.target);
    return { ...e, data: { ...e.data, isFocus: inChain }, style: { ...e.style, opacity: inChain ? 1 : 0.8 } };
  }), [edges, focusedChainIds]);

  // 鈹€鈹€ Render 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  if (loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'var(--workbench-canvas)' }}>
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--workbench-blue)' }} />
        <span className="ml-2 text-xs" style={{ color: 'var(--workbench-text-muted)' }}>加载中...</span>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6" style={{ background: 'var(--workbench-canvas)' }}>
        {/* Abstract graph icon 鈥?not a generic lucide icon */}
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" style={{ marginBottom: 4 }}>
          <circle cx="18" cy="8" r="4" fill="rgba(47,128,255,0.2)" stroke="#2F80FF" strokeWidth="1.5" />
          <circle cx="8" cy="26" r="4" fill="rgba(47,128,255,0.16)" stroke="#2F80FF" strokeWidth="1.5" />
          <circle cx="28" cy="26" r="4" fill="rgba(24,160,106,0.16)" stroke="#18A06A" strokeWidth="1.5" />
          <line x1="18" y1="12" x2="9.4" y2="22.4" stroke="#2F80FF" strokeWidth="1.2" strokeDasharray="3 2" opacity="0.7" />
          <line x1="18" y1="12" x2="26.6" y2="22.4" stroke="#2F80FF" strokeWidth="1.2" strokeDasharray="3 2" opacity="0.7" />
        </svg>
        <p className="text-sm font-medium" style={{ color: 'var(--workbench-text)' }}>
          从核心问题开始
        </p>
        <p className="text-xs text-center leading-relaxed" style={{ color: 'var(--workbench-text-muted)' }}>
          拆解问题 · 提出假说 · 收集证据
        </p>
        <button
          onClick={createRootQuestion}
          className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-all hover:-translate-y-0.5"
          style={{
            background: 'var(--workbench-blue)',
            color: 'white',
            boxShadow: '0 10px 18px rgba(47, 128, 255, 0.24)',
          }}
        >
          <Plus size={13} /> 创建根问题
        </button>
      </div>
    );
  }

  return (
    <div className="absolute inset-0" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodesWithCallbacks}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodesDelete={deleted => deleted.forEach(n => handleDeleteNode(n.id))}
        onSelectionChange={handleSelectionChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1, minZoom: 0.45 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'var(--workbench-canvas)' }}
      >
        <Background id="grid-bg" variant={BackgroundVariant.Lines} gap={42} size={1} color="rgba(130,121,106,0.10)" />
        <Background id="dots-bg" variant={BackgroundVariant.Dots} gap={21} size={1} color="rgba(130,121,106,0.14)" />

        <Panel position="top-center">
          <div
            className="flex items-center gap-1 px-2 py-1.5 rounded-xl"
            style={{
              background: 'var(--workbench-card)',
              border: '1px solid var(--workbench-border)',
              boxShadow: '0 8px 14px rgba(30,26,18,0.10)',
            }}
          >
            <button
              onClick={addQuestionFromSelection}
              disabled={!canAddQuestion}
              className="px-2 py-1 rounded text-[11px] font-semibold transition-colors hover:bg-blue-500/10 disabled:opacity-40 disabled:hover:bg-transparent"
              style={{ color: canAddQuestion ? 'var(--workbench-text-soft)' : 'var(--workbench-text-muted)' }}
              title="添加子问题 (Q)"
            >
              +Q
            </button>
            <button
              onClick={addHypothesisFromSelection}
              disabled={!canAddHypothesis}
              className="px-2 py-1 rounded text-[11px] font-semibold transition-colors hover:bg-blue-500/10 disabled:opacity-40 disabled:hover:bg-transparent"
              style={{ color: canAddHypothesis ? 'var(--workbench-text-soft)' : 'var(--workbench-text-muted)' }}
              title="添加假说 (H)"
            >
              +H
            </button>
            <button
              onClick={addEvidenceFromSelection}
              disabled={!canAddEvidence}
              className="px-2 py-1 rounded text-[11px] font-semibold transition-colors hover:bg-blue-500/10 disabled:opacity-40 disabled:hover:bg-transparent"
              style={{ color: canAddEvidence ? 'var(--workbench-text-soft)' : 'var(--workbench-text-muted)' }}
              title="添加证据 (F)"
            >
              +FACT
            </button>
            <div className="h-4 w-px" style={{ background: 'var(--workbench-border)' }} />
            <button
              onClick={() => setCompactMode(prev => !prev)}
              className="px-2 py-1 rounded text-[11px] font-medium transition-colors hover:bg-blue-500/10"
              style={{ color: compactMode ? 'var(--workbench-blue-ink)' : 'var(--workbench-text-soft)' }}
              title="切换紧凑模式 (Tab)"
            >
              {compactMode ? '紧凑' : '展开'}
            </button>
            <span className="ml-1 text-[10px] hidden lg:inline" style={{ color: 'var(--workbench-text-muted)' }}>
              快捷键: Q / H / F / Tab
            </span>
          </div>
        </Panel>

        <Panel position="bottom-center">
          <button
            onClick={autoLayout}
            className="p-1.5 rounded-lg transition-colors hover:bg-blue-500/10"
            title="自动排布"
            style={{
              background: 'var(--workbench-card)',
              border: '1px solid var(--workbench-border)',
              color: 'var(--workbench-text-soft)',
              boxShadow: '0 8px 14px rgba(30,26,18,0.10)',
            }}
          >
            <LayoutGrid size={13} />
          </button>
        </Panel>

        <Controls
          position="bottom-left"
          showInteractive={false}
          style={{
            background: 'var(--workbench-card)',
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--workbench-border)',
            borderRadius: '12px',
            boxShadow: '0 10px 18px rgba(30, 26, 18, 0.12)',
          }}
        />
        <MiniMap
          position="bottom-right"
          nodeColor={n => n.type === 'questionNode' ? BOARD_PALETTE.question : n.type === 'hypothesisNode' ? BOARD_PALETTE.hypothesis : BOARD_PALETTE.evidence}
          maskColor="rgba(248,245,238,0.84)"
          style={{
            background: 'var(--workbench-card)',
            border: '1px solid var(--workbench-border)',
            borderRadius: '12px',
            boxShadow: '0 10px 18px rgba(30, 26, 18, 0.12)',
          }}
        />
      </ReactFlow>
    </div>
  );
}

// 鈹€鈹€ Public export 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

function EmbeddedThinkBoard({
  topicId,
  topic,
  selectedNodeId,
  focusRequest,
  boardRefreshToken,
  onSelectionChange,
  onBoardMutated,
}) {
  return (
    <ReactFlowProvider>
      <EmbeddedThinkBoardInner
        topicId={topicId}
        topic={topic}
        selectedNodeId={selectedNodeId}
        focusRequest={focusRequest}
        boardRefreshToken={boardRefreshToken}
        onSelectionChange={onSelectionChange}
        onBoardMutated={onBoardMutated}
      />
    </ReactFlowProvider>
  );
}

export default EmbeddedThinkBoard;


