// ========= Embedded Think Board — Right Panel Canvas =========
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

// ── Node / Edge type registries ──────────────────────────────────────────────

const nodeTypes = {
  questionNode: QuestionNode,
  hypothesisNode: HypothesisNode,
  evidenceNode: EvidenceNode,
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

// ── Dagre layout ─────────────────────────────────────────────────────────────

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const NODE_DIMS = {
  questionNode:   { width: 280, height: 140 },
  hypothesisNode: { width: 280, height: 180 },
  evidenceNode:   { width: 240, height: 160 },
};

function getLayoutedElements(nodes, edges, direction = 'TB') {
  dagreGraph.setGraph({ rankdir: direction, ranksep: 100, nodesep: 60, edgesep: 30 });
  dagreGraph.nodes().forEach(n => dagreGraph.removeNode(n));
  nodes.forEach(node => {
    const dims = NODE_DIMS[node.type] || { width: 280, height: 160 };
    dagreGraph.setNode(node.id, { width: dims.width, height: dims.height });
  });
  edges.forEach(edge => dagreGraph.setEdge(edge.source, edge.target));
  dagre.layout(dagreGraph);
  return {
    nodes: nodes.map(node => {
      const pos = dagreGraph.node(node.id);
      const dims = NODE_DIMS[node.type] || { width: 280, height: 160 };
      return {
        ...node,
        position: { x: pos.x - dims.width / 2, y: pos.y - dims.height / 2 },
        style: { ...(node.style || {}), width: dims.width, height: dims.height },
      };
    }),
    edges,
  };
}

// ── Edge style helpers ────────────────────────────────────────────────────────

function getEvidenceEdgeStyle(rel) {
  if (rel === 'supports') return { stroke: '#10B981', strokeWidth: 2, markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981' } };
  if (rel === 'refutes')  return { stroke: '#EF4444', strokeWidth: 2, markerEnd: { type: MarkerType.ArrowClosed, color: '#EF4444' } };
  return { stroke: '#94A3B8', strokeWidth: 1.6, markerEnd: { type: MarkerType.ArrowClosed, color: '#94A3B8' } };
}

function getParentEdgeStyle(isHypo, hypoState) {
  if (isHypo) {
    const pending = !hypoState || hypoState === 'pending';
    return {
      stroke: pending ? '#A855F7' : '#7C3AED',
      strokeWidth: pending ? 1.6 : 2,
      strokeDasharray: pending ? '6 4' : '0',
      markerEnd: { type: MarkerType.ArrowClosed, color: pending ? '#A855F7' : '#7C3AED' },
    };
  }
  return {
    stroke: 'var(--stroke-1)',
    strokeWidth: 1.6,
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--stroke-1)' },
  };
}

// ── DB → React Flow conversion ────────────────────────────────────────────────

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

// ── Inner component (needs ReactFlowProvider in parent) ──────────────────────

function EmbeddedThinkBoardInner({ topicId, topic }) {
  const { screenToFlowPosition } = useReactFlow();
  const { showToast } = useUIStore();
  const zoom = useStore(s => s.transform[2]);
  const lod = zoom < 0.35 ? 'mini' : zoom < 1.15 ? 'normal' : 'full';

  const [boardId, setBoardId]             = useState(null);
  const [loading, setLoading]             = useState(true);
  const [nodes, setNodes, onNodesChange]  = useNodesState([]);
  const [edges, setEdges, onEdgesChange]  = useEdgesState([]);
  const [focusedChainIds, setFocusedChainIds] = useState(null);

  const dbNodeMapRef = useRef({});
  const dbEdgeMapRef = useRef({});

  // ── Load board data ─────────────────────────────────────────────────────────
  // react-best-practices: no waterfall — board fetch is a single request
  const loadBoard = useCallback(async () => {
    if (!topicId) return;
    const ignore = { cancelled: false };
    try {
      setLoading(true);
      const { board } = await boardsApi.getTopicBoard(topicId);
      if (ignore.cancelled) return;

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
      if (!ignore.cancelled) showToast('加载画板失败', 'error');
    } finally {
      if (!ignore.cancelled) setLoading(false);
    }
    return () => { ignore.cancelled = true; };
  }, [topicId, showToast, setNodes, setEdges]);

  useEffect(() => {
    setBoardId(null);
    dbNodeMapRef.current = {};
    dbEdgeMapRef.current = {};
    setFocusedChainIds(null);
    loadBoard();
  }, [loadBoard]);

  // ── Auto layout ─────────────────────────────────────────────────────────────
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

  // ── CRUD handlers ───────────────────────────────────────────────────────────
  const handleNodeUpdate = useCallback(async (nodeId, updates) => {
    const dbId = dbNodeMapRef.current[nodeId] || nodeId;
    try {
      await boardsApi.updateNode(boardId, dbId, updates);
      setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n));
    } catch {
      showToast('更新失败', 'error');
    }
  }, [boardId, setNodes, showToast]);

  const handleEdgeUpdate = useCallback(async (evidenceNodeId, updates) => {
    const edge = edges.find(e => e.target === evidenceNodeId && e.data?.dbEdgeId);
    if (!edge) return;
    try {
      await boardsApi.updateEdge(boardId, edge.data.dbEdgeId, updates);
      const newRel = updates.relation_type || edge.data?.relation_type;
      setEdges(eds => eds.map(e => e.id !== edge.id ? e : { ...e, style: getEvidenceEdgeStyle(newRel), data: { ...e.data, relation_type: newRel } }));
      setNodes(nds => nds.map(n => n.id === evidenceNodeId ? { ...n, data: { ...n.data, edgeRelation: updates.relation_type } } : n));
    } catch {
      showToast('更新关系失败', 'error');
    }
  }, [boardId, edges, setEdges, setNodes, showToast]);

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
      showToast(nodeType === 'question' ? '子问题已添加' : '假说已添加', 'success');
    } catch {
      showToast('创建失败', 'error');
    }
  }, [boardId, nodes, setNodes, setEdges, autoLayout, showToast]);

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
      showToast('已删除', 'success');
    } catch {
      showToast('删除失败', 'error');
    }
  }, [boardId, edges, setNodes, setEdges, showToast]);

  const createRootQuestion = useCallback(async () => {
    if (!boardId) return;
    try {
      const result = await boardsApi.createNode(boardId, { node_type: 'question', content: { text: topic?.title || '核心问题' }, priority: 'high', status: 'open' });
      const newNode = result.node;
      dbNodeMapRef.current[newNode.id] = newNode.id;
      const dims = NODE_DIMS.questionNode;
      setNodes([{ id: newNode.id, type: 'questionNode', position: { x: 0, y: 0 }, data: { content: newNode.content || {}, priority: 'high', status: 'open' }, style: { width: dims.width, height: dims.height } }]);
      setEdges([]);
    } catch {
      showToast('创建根问题失败', 'error');
    }
  }, [boardId, topic, setNodes, setEdges, showToast]);

  // ── Focus mode ──────────────────────────────────────────────────────────────
  const handleSelectionChange = useCallback(({ nodes: sel }) => {
    if (!sel?.length || sel.length > 1) { setFocusedChainIds(null); return; }
    const chain = new Set([sel[0].id]);
    let frontier = [sel[0].id];
    for (let hop = 0; hop < 2; hop++) {
      const next = [];
      for (const nid of frontier) {
        edges.forEach(e => {
          if (e.source === nid && !chain.has(e.target)) { chain.add(e.target); next.push(e.target); }
          if (e.target === nid && !chain.has(e.source)) { chain.add(e.source); next.push(e.source); }
        });
      }
      frontier = next;
    }
    setFocusedChainIds(chain);
  }, [edges]);

  // ── Drag card from sidebar → create Evidence node ───────────────────────────
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
      const dims = NODE_DIMS[node.type] || { width: 280, height: 180 };
      const cx = node.position.x + dims.width / 2;
      const cy = node.position.y + dims.height / 2;
      const dist = Math.sqrt((position.x - cx) ** 2 + (position.y - cy) ** 2);
      if (dist < minDist) { minDist = dist; closestHypo = node; }
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

      dbNodeMapRef.current[evidenceNode.id] = evidenceNode.id;
      const rfEdgeId = `edge-${edgeResult.edge.id}`;
      dbEdgeMapRef.current[rfEdgeId] = edgeResult.edge.id;

      setNodes(nds => [...nds, {
        id: evidenceNode.id,
        type: 'evidenceNode',
        position: { x: closestHypo.position.x + 30, y: closestHypo.position.y + 200 },
        data: {
          content: evidenceNode.content,
          card,
          evidence_type: 'fact',
          strength: 3,
          edgeRelation: 'supports',
          _edgeId: rfEdgeId,
        },
      }]);
      setEdges(eds => [...eds, {
        id: rfEdgeId,
        source: closestHypo.id,
        target: evidenceNode.id,
        type: 'monoStep',
        style: getEvidenceEdgeStyle('supports'),
        data: { relation_type: 'supports', dbEdgeId: edgeResult.edge.id },
      }]);

      setTimeout(autoLayout, 100);
      showToast('证据已关联到假说', 'success');
    } catch {
      showToast('添加证据失败', 'error');
    }
  }, [boardId, nodes, setNodes, setEdges, showToast, autoLayout, screenToFlowPosition]);

  // ── Derived node/edge data for rendering ────────────────────────────────────
  const nodesWithCallbacks = useMemo(() => nodes.map(node => {
    const dimmed = focusedChainIds ? !focusedChainIds.has(node.id) : false;
    const focusStyle = { opacity: dimmed ? 0.25 : 1, transition: 'opacity 0.2s ease', pointerEvents: dimmed ? 'none' : 'auto' };
    const childCount = edges.filter(e => e.source === node.id && e.id.startsWith('parent-')).length;
    const base = { onUpdate: handleNodeUpdate, onDelete: handleDeleteNode, childCount, lod };
    const styled = { ...node, style: { ...(node.style || {}), ...focusStyle } };
    if (node.type === 'questionNode')   return { ...styled, data: { ...node.data, ...base, onAddSubQuestion: id => createChildNode(id, 'question', { content: { text: '' } }), onAddHypothesis: id => createChildNode(id, 'hypothesis', { claim: '' }) } };
    if (node.type === 'hypothesisNode') return { ...styled, data: { ...node.data, ...base, onAddSubHypothesis: id => createChildNode(id, 'hypothesis', { claim: '' }) } };
    if (node.type === 'evidenceNode')   return { ...styled, data: { ...node.data, ...base, onEdgeUpdate: handleEdgeUpdate } };
    return styled;
  }), [nodes, edges, handleNodeUpdate, handleDeleteNode, createChildNode, handleEdgeUpdate, focusedChainIds, lod]);

  const styledEdges = useMemo(() => edges.map(e => {
    if (!focusedChainIds) return e;
    const inChain = focusedChainIds.has(e.source) && focusedChainIds.has(e.target);
    return { ...e, data: { ...e.data, isFocus: inChain }, style: { ...e.style, opacity: inChain ? 1 : 0.12 } };
  }), [edges, focusedChainIds]);

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'var(--bg-0)' }}>
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent-400)' }} />
        <span className="ml-2 text-xs" style={{ color: 'var(--text-2)' }}>加载中…</span>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6" style={{ background: 'var(--bg-0)' }}>
        {/* Abstract graph icon — not a generic lucide icon */}
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" style={{ marginBottom: 4 }}>
          <circle cx="18" cy="8"  r="4" fill="rgba(99,102,241,0.18)" stroke="#6366F1" strokeWidth="1.5"/>
          <circle cx="8"  cy="26" r="4" fill="rgba(168,85,247,0.14)" stroke="#A855F7" strokeWidth="1.5"/>
          <circle cx="28" cy="26" r="4" fill="rgba(16,185,129,0.14)" stroke="#10B981" strokeWidth="1.5"/>
          <line x1="18" y1="12" x2="9.4"  y2="22.4" stroke="#6366F1" strokeWidth="1.2" strokeDasharray="3 2" opacity="0.7"/>
          <line x1="18" y1="12" x2="26.6" y2="22.4" stroke="#6366F1" strokeWidth="1.2" strokeDasharray="3 2" opacity="0.7"/>
        </svg>
        <p className="text-sm font-medium" style={{ color: 'var(--text-0)' }}>
          从核心问题开始
        </p>
        <p className="text-xs text-center leading-relaxed" style={{ color: 'var(--text-2)' }}>
          拆解问题 · 提出假说 · 收集证据
        </p>
        <button
          onClick={createRootQuestion}
          className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-all"
          style={{
            background: 'var(--accent-600)',
            color: 'white',
            boxShadow: '0 0 16px rgba(99,102,241,0.2)',
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
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1, minZoom: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'var(--bg-0)' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(148,163,184,0.07)" />

        <Panel position="bottom-center">
          <button
            onClick={autoLayout}
            className="p-1.5 rounded-lg transition-colors"
            title="自动排列"
            style={{
              background: 'var(--surface-0)',
              border: '1px solid var(--stroke-0)',
              color: 'var(--text-2)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <LayoutGrid size={13} />
          </button>
        </Panel>

        <Controls
          position="bottom-left"
          showInteractive={false}
          style={{
            background: 'var(--surface-0)',
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--stroke-0)',
            borderRadius: '10px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
          }}
        />
        <MiniMap
          position="bottom-right"
          nodeColor={n => n.type === 'questionNode' ? '#1D4ED8' : n.type === 'hypothesisNode' ? '#6B21A8' : '#10B981'}
          maskColor="rgba(248,250,252,0.8)"
          style={{
            background: 'var(--surface-0)',
            border: '1px solid var(--stroke-0)',
            borderRadius: '10px',
          }}
        />
      </ReactFlow>
    </div>
  );
}

// ── Public export ─────────────────────────────────────────────────────────────

function EmbeddedThinkBoard({ topicId, topic }) {
  return (
    <ReactFlowProvider>
      <EmbeddedThinkBoardInner topicId={topicId} topic={topic} />
    </ReactFlowProvider>
  );
}

export default EmbeddedThinkBoard;
