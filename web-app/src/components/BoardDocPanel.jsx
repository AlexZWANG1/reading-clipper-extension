import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader2,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  ExternalLink,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
} from 'lucide-react';
import { boardsApi } from '../lib/api';

const STATE_STYLES = {
  pending: {
    label: '待验证',
    bg: 'rgba(47,128,255,0.10)',
    color: 'var(--workbench-blue-ink)',
    border: 'rgba(47,128,255,0.48)',
  },
  validated: {
    label: '已验证',
    bg: 'rgba(31,157,103,0.10)',
    color: 'var(--workbench-green)',
    border: 'rgba(31,157,103,0.48)',
  },
  falsified: {
    label: '已证伪',
    bg: 'rgba(195,74,60,0.10)',
    color: 'var(--workbench-red)',
    border: 'rgba(195,74,60,0.48)',
  },
};

const RELATION_STYLES = {
  supports: { label: '支持', color: 'var(--workbench-green)', bg: 'rgba(31,157,103,0.10)', icon: '↗' },
  refutes: { label: '反驳', color: 'var(--workbench-red)', bg: 'rgba(195,74,60,0.10)', icon: '↘' },
  neutral: { label: '中立', color: 'var(--workbench-text-muted)', bg: 'rgba(130,121,106,0.10)', icon: '·' },
};

function normalizeConfidencePercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 1) return Math.round(Math.max(0, numeric) * 100);
  return Math.round(Math.max(0, Math.min(100, numeric)));
}

function buildTree(nodes, edges) {
  const edgeRelMap = {};
  const evidenceEdgeMap = {};
  (edges || []).forEach((edge) => {
    edgeRelMap[edge.target_node_id] = edge.relation_type || 'neutral';
    evidenceEdgeMap[edge.target_node_id] = edge;
  });

  const nodeMap = {};
  const childrenMap = {};
  const parentMap = {};
  const hasParent = new Set();

  (nodes || []).forEach((node) => {
    nodeMap[node.id] = { ...node, edgeRelation: edgeRelMap[node.id] };
    if (!childrenMap[node.id]) childrenMap[node.id] = [];
    if (!parentMap[node.id]) parentMap[node.id] = [];
  });

  (nodes || []).forEach((node) => {
    if (node.parent_id && nodeMap[node.parent_id]) {
      childrenMap[node.parent_id].push(node.id);
      parentMap[node.id].push(node.parent_id);
      hasParent.add(node.id);
    }
  });

  (edges || []).forEach((edge) => {
    const source = edge.source_node_id;
    const target = edge.target_node_id;
    if (!nodeMap[source] || !nodeMap[target]) return;

    if (!childrenMap[source].includes(target)) {
      childrenMap[source].push(target);
    }
    if (!parentMap[target].includes(source)) {
      parentMap[target].push(source);
    }
    hasParent.add(target);
  });

  const roots = (nodes || []).filter((node) => !hasParent.has(node.id));
  return { roots, childrenMap, parentMap, nodeMap, evidenceEdgeMap };
}

function collectBranchIds(nodeId, childrenMap, parentMap) {
  const branch = new Set([nodeId]);

  const walkDown = (startId) => {
    const children = childrenMap[startId] || [];
    children.forEach((childId) => {
      if (branch.has(childId)) return;
      branch.add(childId);
      walkDown(childId);
    });
  };

  const walkUp = (startId) => {
    const parents = parentMap[startId] || [];
    parents.forEach((parentId) => {
      if (branch.has(parentId)) return;
      branch.add(parentId);
      walkUp(parentId);
    });
  };

  walkDown(nodeId);
  walkUp(nodeId);
  return Array.from(branch);
}

function parseDraggedCard(event) {
  try {
    const raw = event.dataTransfer.getData('application/json');
    if (!raw) return null;
    const card = JSON.parse(raw);
    return card?.id ? card : null;
  } catch {
    return null;
  }
}

function BoardDocPanel({
  topicId,
  selectedNodeId = null,
  focusedNodeIds = [],
  boardRefreshToken = 0,
  onSelectNode,
  onBoardMutated,
}) {
  const [loading, setLoading] = useState(true);
  const [boardData, setBoardData] = useState(null);
  const [error, setError] = useState(null);
  const [expandedMap, setExpandedMap] = useState({});
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dragOverHypothesisId, setDragOverHypothesisId] = useState(null);
  const [confidenceDrafts, setConfidenceDrafts] = useState({});
  const skipNextRefreshRef = useMemo(() => ({ current: false }), []);
  const loadRequestSeqRef = useMemo(() => ({ current: 0 }), []);

  const loadBoard = useCallback(async () => {
    if (!topicId) return;
    const requestId = loadRequestSeqRef.current + 1;
    loadRequestSeqRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const { board } = await boardsApi.getTopicBoard(topicId);
      if (requestId !== loadRequestSeqRef.current) return;
      setBoardData(board);
    } catch (err) {
      if (requestId === loadRequestSeqRef.current) {
        setError(err.message || '加载失败');
      }
    } finally {
      if (requestId === loadRequestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [topicId, loadRequestSeqRef]);

  useEffect(() => {
    if (skipNextRefreshRef.current) {
      skipNextRefreshRef.current = false;
      return;
    }
    loadBoard();
  }, [loadBoard, boardRefreshToken, skipNextRefreshRef]);

  useEffect(() => {
    setConfidenceDrafts({});
  }, [topicId, boardRefreshToken]);

  const tree = useMemo(() => {
    if (!boardData?.nodes?.length) return null;
    return buildTree(boardData.nodes, boardData.edges || []);
  }, [boardData]);

  const focusedSet = useMemo(() => new Set(focusedNodeIds || []), [focusedNodeIds]);

  const toggleExpanded = useCallback((nodeId) => {
    setExpandedMap((prev) => ({
      ...prev,
      [nodeId]: !(prev[nodeId] ?? true),
    }));
  }, []);

  const triggerSync = useCallback(async () => {
    await loadBoard();
    skipNextRefreshRef.current = true;
    onBoardMutated?.();
  }, [loadBoard, onBoardMutated, skipNextRefreshRef]);

  const handleSelect = useCallback((nodeId) => {
    if (!tree) return;
    if (nodeId === selectedNodeId) {
      onSelectNode?.(null, []);
      return;
    }
    const branchIds = collectBranchIds(nodeId, tree.childrenMap, tree.parentMap);
    onSelectNode?.(nodeId, branchIds);
  }, [onSelectNode, selectedNodeId, tree]);

  const handleDeleteNode = useCallback(async (nodeId) => {
    if (!boardData?.id) return;
    try {
      await boardsApi.deleteNode(boardData.id, nodeId);
      setEditingNodeId(null);
      await triggerSync();
    } catch {
      // no-op
    }
  }, [boardData?.id, triggerSync]);

  const handleCreateChild = useCallback(async (parentId, nodeType) => {
    if (!boardData?.id) return;
    const payload = {
      node_type: nodeType,
      parent_id: parentId,
    };
    if (nodeType === 'question') {
      payload.content = { text: '' };
      payload.status = 'open';
      payload.priority = 'normal';
    } else if (nodeType === 'hypothesis') {
      payload.claim = '';
      payload.hypo_state = 'pending';
      payload.confidence = 0;
    }

    try {
      const result = await boardsApi.createNode(boardData.id, payload);
      await triggerSync();
      if (result?.node?.id) {
        handleSelect(result.node.id);
      }
    } catch {
      // no-op
    }
  }, [boardData?.id, handleSelect, triggerSync]);

  const handleCreateEvidence = useCallback(async (hypothesisId, card = null) => {
    if (!boardData?.id) return;

    try {
      const nodeResult = await boardsApi.createNode(boardData.id, {
        node_type: 'evidence',
        card_id: card?.id || undefined,
        content: { text: card?.summary || card?.raw_snippet || '' },
        evidence_type: card?.fact_or_view === 'view' ? 'view' : 'fact',
        strength: 3,
      });
      const evidenceNodeId = nodeResult?.node?.id;
      if (!evidenceNodeId) return;

      await boardsApi.createEdge(boardData.id, {
        source_node_id: hypothesisId,
        target_node_id: evidenceNodeId,
        relation_type: 'supports',
      });

      await triggerSync();
      handleSelect(evidenceNodeId);
    } catch {
      // no-op
    }
  }, [boardData?.id, handleSelect, triggerSync]);

  const handleDropToHypothesis = useCallback(async (event, hypothesisId) => {
    event.preventDefault();
    setDragOverHypothesisId(null);
    const card = parseDraggedCard(event);
    if (!card) return;
    await handleCreateEvidence(hypothesisId, card);
  }, [handleCreateEvidence]);

  const handleNodeUpdate = useCallback(async (nodeId, updates) => {
    if (!boardData?.id) return;
    try {
      await boardsApi.updateNode(boardData.id, nodeId, updates);
      await triggerSync();
    } catch {
      // no-op
    }
  }, [boardData?.id, triggerSync]);

  const handleEvidenceRelationUpdate = useCallback(async (evidenceNodeId, relationType) => {
    if (!boardData?.id || !tree?.evidenceEdgeMap?.[evidenceNodeId]) return;
    const edgeId = tree.evidenceEdgeMap[evidenceNodeId].id;
    try {
      await boardsApi.updateEdge(boardData.id, edgeId, { relation_type: relationType });
      await triggerSync();
    } catch {
      // no-op
    }
  }, [boardData?.id, tree?.evidenceEdgeMap, triggerSync]);

  const getConfidenceValue = useCallback((nodeId, fallback) => {
    const draft = confidenceDrafts[nodeId];
    return Number.isFinite(draft) ? draft : fallback;
  }, [confidenceDrafts]);

  const handleConfidenceDraftChange = useCallback((nodeId, value) => {
    if (!Number.isFinite(value)) return;
    setConfidenceDrafts((prev) => (prev[nodeId] === value ? prev : { ...prev, [nodeId]: value }));
  }, []);

  const commitConfidenceDraft = useCallback(async (nodeId, committedValue) => {
    const draft = confidenceDrafts[nodeId];
    if (!Number.isFinite(draft) || draft === committedValue) return;

    setConfidenceDrafts((prev) => {
      if (!(nodeId in prev)) return prev;
      const next = { ...prev };
      delete next[nodeId];
      return next;
    });

    await handleNodeUpdate(nodeId, { confidence: draft / 100 });
  }, [confidenceDrafts, handleNodeUpdate]);

  const startEdit = useCallback((node) => {
    if (!node) return;
    if (node.node_type === 'question') {
      setEditingValue(node.content?.text || '');
    } else {
      setEditingValue(node.claim || node.content?.text || '');
    }
    setEditingNodeId(node.id);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingNodeId(null);
    setEditingValue('');
  }, []);

  const saveEdit = useCallback(async (node) => {
    if (!node || !editingNodeId) return;
    const text = editingValue.trim();
    if (!text) {
      cancelEdit();
      return;
    }

    setSubmitting(true);
    try {
      if (node.node_type === 'question') {
        await handleNodeUpdate(node.id, { content: { ...(node.content || {}), text } });
      } else if (node.node_type === 'hypothesis') {
        await handleNodeUpdate(node.id, { claim: text });
      }
      setEditingNodeId(null);
      setEditingValue('');
    } finally {
      setSubmitting(false);
    }
  }, [cancelEdit, editingNodeId, editingValue, handleNodeUpdate]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--workbench-blue)' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6">
        <AlertCircle size={20} style={{ color: 'var(--workbench-text-muted)' }} />
        <p className="text-xs" style={{ color: 'var(--workbench-text-muted)' }}>{error}</p>
      </div>
    );
  }

  if (!tree) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6">
        <svg width="36" height="28" viewBox="0 0 36 28" fill="none" opacity="0.4">
          <rect x="4" y="2" width="28" height="4" rx="2" fill="var(--workbench-text-muted)" />
          <rect x="8" y="10" width="24" height="3" rx="1.5" fill="var(--workbench-text-muted)" opacity="0.5" />
          <rect x="8" y="17" width="20" height="3" rx="1.5" fill="var(--workbench-text-muted)" opacity="0.35" />
          <rect x="8" y="24" width="16" height="3" rx="1.5" fill="var(--workbench-text-muted)" opacity="0.2" />
        </svg>
        <p className="text-xs text-center" style={{ color: 'var(--workbench-text-muted)' }}>
          暂无假说文档
          <br />
          在论证板创建问题与假说后
          <br />
          这里会自动同步为结构化文档
        </p>
      </div>
    );
  }

  const questionCount = boardData.nodes.filter((node) => node.node_type === 'question').length;
  const hypoCount = boardData.nodes.filter((node) => node.node_type === 'hypothesis').length;
  const evidenceCount = boardData.nodes.filter((node) => node.node_type === 'evidence').length;

  const renderNode = (nodeId, depth = 0) => {
    const node = tree.nodeMap[nodeId];
    if (!node) return null;

    const children = tree.childrenMap[nodeId] || [];
    const hasChildren = children.length > 0;
    const expanded = expandedMap[nodeId] ?? true;

    const isSelected = selectedNodeId === nodeId;
    const inBranch = isSelected || focusedSet.has(nodeId);
    const showCollapsedStack = !expanded && hasChildren;
    const baseBorderColor = isSelected ? 'var(--workbench-blue)' : inBranch ? 'rgba(47,128,255,0.30)' : 'var(--workbench-border)';

    const baseStyle = {
      background: 'var(--workbench-card)',
      borderStyle: 'solid',
      borderWidth: 1,
      borderTopColor: baseBorderColor,
      borderRightColor: baseBorderColor,
      borderBottomColor: baseBorderColor,
      borderLeftColor: baseBorderColor,
      boxShadow: isSelected ? '0 0 0 2px rgba(47,128,255,0.14)' : '0 1px 2px rgba(30,26,18,0.06)',
      opacity: focusedSet.size > 0 && !inBranch ? 0.45 : 1,
    };

    const stackLayers = showCollapsedStack ? (
      <>
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            zIndex: -1,
            left: 4,
            right: 4,
            top: 4,
            bottom: -4,
            borderRadius: 9,
            background: 'var(--workbench-card)',
            border: '1px solid rgba(130,121,106,0.2)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            zIndex: -2,
            left: 8,
            right: 8,
            top: 8,
            bottom: -8,
            borderRadius: 8,
            background: 'rgba(247,243,235,0.88)',
            border: '1px solid rgba(130,121,106,0.16)',
          }}
        />
      </>
    ) : null;

    if (node.node_type === 'question') {
      const text = node.content?.text || '未命名问题';

      return (
        <div key={nodeId} className="relative" style={{ marginTop: depth > 0 ? 8 : 0 }}>
          {stackLayers}
          <div
            className="relative z-10 rounded-lg px-2.5 py-2 cursor-pointer"
            style={baseStyle}
            onClick={() => handleSelect(nodeId)}
          >
            <div className="flex items-start gap-2">
              {hasChildren ? (
                <button
                  type="button"
                  className="mt-0.5"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleExpanded(nodeId);
                  }}
                  style={{ color: 'var(--workbench-text-muted)' }}
                >
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : (
                <span className="mt-0.5 w-[14px]" />
              )}

              <div className="flex-1 min-w-0">
                {editingNodeId === nodeId ? (
                  <textarea
                    value={editingValue}
                    onChange={(event) => setEditingValue(event.target.value)}
                    rows={2}
                    className="w-full text-[12px] rounded-md p-2 resize-none focus:outline-none"
                    style={{ border: '1px solid var(--workbench-border)', background: 'var(--workbench-card-soft)', color: 'var(--workbench-text)' }}
                    onClick={(event) => event.stopPropagation()}
                  />
                ) : (
                  <p className="text-[13px] font-semibold leading-snug" style={{ color: 'var(--workbench-text)' }}>{text}</p>
                )}

                <div className="mt-1.5 flex items-center gap-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border" style={{ borderColor: 'rgba(47,128,255,0.28)', color: 'var(--workbench-blue-ink)', background: 'rgba(47,128,255,0.10)' }}>
                    Q
                  </span>

                  {editingNodeId === nodeId ? (
                    <>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={(event) => {
                          event.stopPropagation();
                          saveEdit(node);
                        }}
                        className="p-1 rounded"
                        style={{ color: 'var(--workbench-green)' }}
                      >
                        <Check size={12} />
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={(event) => {
                          event.stopPropagation();
                          cancelEdit();
                        }}
                        className="p-1 rounded"
                        style={{ color: 'var(--workbench-text-muted)' }}
                      >
                        <X size={12} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="p-1 rounded"
                        style={{ color: 'var(--workbench-text-muted)' }}
                        onClick={(event) => {
                          event.stopPropagation();
                          startEdit(node);
                        }}
                        title="编辑"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        className="p-1 rounded"
                        style={{ color: 'var(--workbench-text-muted)' }}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleCreateChild(nodeId, 'question');
                        }}
                        title="新增子问题"
                      >
                        <Plus size={12} />
                      </button>
                      <button
                        type="button"
                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                        style={{ color: 'var(--workbench-blue-ink)', background: 'rgba(47,128,255,0.08)' }}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleCreateChild(nodeId, 'hypothesis');
                        }}
                        title="新增假说"
                      >
                        +H
                      </button>
                      <button
                        type="button"
                        className="p-1 rounded"
                        style={{ color: 'var(--workbench-text-muted)' }}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteNode(nodeId);
                        }}
                        title="删除"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {expanded && hasChildren && (
            <div style={{ marginLeft: 12 }}>
              {children.map((childId) => renderNode(childId, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    if (node.node_type === 'hypothesis') {
      const claim = node.claim || node.content?.text || '未命名假说';
      const state = STATE_STYLES[node.hypo_state] || STATE_STYLES.pending;
      const confidence = normalizeConfidencePercent(node.confidence);
      const confidenceValue = getConfidenceValue(nodeId, confidence);

      return (
        <div key={nodeId} className="relative" style={{ marginTop: 6 }}>
          {stackLayers}
          <div
            className="relative z-10 rounded-lg px-2.5 py-2 cursor-pointer"
            style={{
              ...baseStyle,
              borderLeftWidth: 3,
              borderLeftColor: state.border,
              background: dragOverHypothesisId === nodeId ? 'rgba(47,128,255,0.08)' : baseStyle.background,
            }}
            onClick={() => handleSelect(nodeId)}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOverHypothesisId(nodeId);
            }}
            onDragLeave={() => {
              if (dragOverHypothesisId === nodeId) setDragOverHypothesisId(null);
            }}
            onDrop={(event) => handleDropToHypothesis(event, nodeId)}
          >
            <div className="flex items-start gap-2">
              {hasChildren ? (
                <button
                  type="button"
                  className="mt-0.5"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleExpanded(nodeId);
                  }}
                  style={{ color: 'var(--workbench-text-muted)' }}
                >
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : (
                <span className="mt-0.5 w-[14px]" />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border" style={{ background: state.bg, color: state.color, borderColor: state.border }}>
                    {state.label}
                  </span>
                  <select
                    value={node.hypo_state || 'pending'}
                    onChange={(event) => handleNodeUpdate(nodeId, { hypo_state: event.target.value })}
                    className="text-[10px] px-1 rounded border"
                    style={{ borderColor: 'var(--workbench-border)', color: 'var(--workbench-text-soft)', background: 'var(--workbench-card)' }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <option value="pending">待验证</option>
                    <option value="validated">已验证</option>
                    <option value="falsified">已证伪</option>
                  </select>
                  <span className="text-[10px] ml-auto" style={{ color: 'var(--workbench-text-muted)' }}>{confidenceValue}%</span>
                </div>

                {editingNodeId === nodeId ? (
                  <textarea
                    value={editingValue}
                    onChange={(event) => setEditingValue(event.target.value)}
                    rows={2}
                    className="w-full text-[12px] rounded-md p-2 resize-none focus:outline-none"
                    style={{ border: '1px solid var(--workbench-border)', background: 'var(--workbench-card-soft)', color: 'var(--workbench-text)' }}
                    onClick={(event) => event.stopPropagation()}
                  />
                ) : (
                  <p className="text-[12.5px] leading-snug" style={{ color: 'var(--workbench-text-soft)' }}>{claim}</p>
                )}

                <div className="mt-1.5 flex items-center gap-1">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={confidenceValue}
                    className="flex-1 h-1.5"
                    style={{ accentColor: 'var(--workbench-blue)' }}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      const value = Number.parseInt(event.target.value, 10);
                      handleConfidenceDraftChange(nodeId, value);
                    }}
                    onMouseUp={() => commitConfidenceDraft(nodeId, confidence)}
                    onTouchEnd={() => commitConfidenceDraft(nodeId, confidence)}
                    onBlur={() => commitConfidenceDraft(nodeId, confidence)}
                    onKeyUp={(event) => {
                      if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End' || event.key === 'PageUp' || event.key === 'PageDown') {
                        commitConfidenceDraft(nodeId, confidence);
                      }
                    }}
                  />

                  {editingNodeId === nodeId ? (
                    <>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={(event) => {
                          event.stopPropagation();
                          saveEdit(node);
                        }}
                        className="p-1 rounded"
                        style={{ color: 'var(--workbench-green)' }}
                      >
                        <Check size={12} />
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={(event) => {
                          event.stopPropagation();
                          cancelEdit();
                        }}
                        className="p-1 rounded"
                        style={{ color: 'var(--workbench-text-muted)' }}
                      >
                        <X size={12} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="p-1 rounded"
                        style={{ color: 'var(--workbench-text-muted)' }}
                        onClick={(event) => {
                          event.stopPropagation();
                          startEdit(node);
                        }}
                        title="编辑"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                        style={{ color: 'var(--workbench-blue-ink)', background: 'rgba(47,128,255,0.08)' }}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleCreateChild(nodeId, 'hypothesis');
                        }}
                        title="新增子假说"
                      >
                        +H
                      </button>
                      <button
                        type="button"
                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                        style={{ color: 'var(--workbench-green)', background: 'rgba(31,157,103,0.10)' }}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleCreateEvidence(nodeId, null);
                        }}
                        title="新增证据"
                      >
                        +FACT
                      </button>
                      <button
                        type="button"
                        className="p-1 rounded"
                        style={{ color: 'var(--workbench-text-muted)' }}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteNode(nodeId);
                        }}
                        title="删除"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {expanded && hasChildren && (
            <div style={{ marginLeft: 10, marginTop: 4 }}>
              {children.map((childId) => renderNode(childId, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    const relation = RELATION_STYLES[node.edgeRelation] || RELATION_STYLES.neutral;
    const summaryText = (node.content?.text || node.card?.summary || '证据').replace(/\s+/g, ' ').trim();

    let sourceName = node.card?.source?.name || '';
    if (!sourceName && node.card?.source_url) {
      try {
        sourceName = new URL(node.card.source_url).hostname.replace('www.', '');
      } catch {
        sourceName = '';
      }
    }

    return (
      <div key={nodeId} style={{ marginTop: 4 }}>
        <div
          className="rounded-lg px-2.5 py-2 cursor-pointer"
          style={{
            ...baseStyle,
            borderLeftWidth: 2,
            borderLeftColor: relation.color,
          }}
          onClick={() => handleSelect(nodeId)}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-semibold" style={{ color: relation.color, borderColor: relation.color, background: relation.bg }}>
              {relation.icon} {relation.label}
            </span>
            <select
              value={node.edgeRelation || 'neutral'}
              onChange={(event) => handleEvidenceRelationUpdate(nodeId, event.target.value)}
              className="text-[10px] px-1 rounded border"
              style={{ borderColor: 'var(--workbench-border)', color: 'var(--workbench-text-soft)', background: 'var(--workbench-card)' }}
              onClick={(event) => event.stopPropagation()}
            >
              <option value="supports">支持</option>
              <option value="refutes">反驳</option>
              <option value="neutral">中立</option>
            </select>
            <span className="text-[10px] ml-auto px-1.5 py-0.5 rounded" style={{ background: 'var(--workbench-card-soft)', color: 'var(--workbench-text-muted)' }}>
              FACT
            </span>
          </div>

          <p className="text-[12px] leading-snug line-clamp-1" style={{ color: 'var(--workbench-text-soft)' }}>
            {summaryText || '证据'}
          </p>

          <div className="mt-1 flex items-center gap-1 text-[10px]" style={{ color: 'var(--workbench-text-muted)' }}>
            <span className="truncate">{sourceName || '未标注来源'}</span>
            {node.card?.source_url && (
              <a
                href={node.card.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto"
                style={{ color: 'var(--workbench-blue-ink)' }}
                onClick={(event) => event.stopPropagation()}
              >
                <ExternalLink size={10} />
              </a>
            )}
            <button
              type="button"
              className="p-0.5 rounded"
              style={{ color: 'var(--workbench-text-muted)' }}
              onClick={(event) => {
                event.stopPropagation();
                handleDeleteNode(nodeId);
              }}
              title="删除"
            >
              <Trash2 size={10} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: '1px solid var(--workbench-border)', background: 'var(--workbench-card-soft)' }}
      >
        <span className="text-[11px] font-semibold px-2 py-1 rounded-full border" style={{ color: 'var(--workbench-blue)', borderColor: 'rgba(47,128,255,0.30)', background: 'rgba(47,128,255,0.08)' }}>
          {questionCount} 问题
        </span>
        <span className="text-[11px] font-semibold px-2 py-1 rounded-full border" style={{ color: 'var(--workbench-blue-ink)', borderColor: 'rgba(47,128,255,0.30)', background: 'rgba(47,128,255,0.08)' }}>
          {hypoCount} 假说
        </span>
        <span className="text-[11px] font-semibold px-2 py-1 rounded-full border" style={{ color: 'var(--workbench-green)', borderColor: 'rgba(31,157,103,0.28)', background: 'rgba(31,157,103,0.08)' }}>
          {evidenceCount} 证据
        </span>
      </div>

      <div className="p-4 space-y-2">
        {tree.roots.map((root) => renderNode(root.id, 0))}
      </div>
    </div>
  );
}

export default BoardDocPanel;
