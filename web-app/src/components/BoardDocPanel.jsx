import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, ChevronRight, ChevronDown, AlertCircle, ExternalLink } from 'lucide-react';
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
  supports: { label: '支持', color: 'var(--workbench-green)', bg: 'rgba(31,157,103,0.10)', icon: '↑' },
  refutes: { label: '反驳', color: 'var(--workbench-red)', bg: 'rgba(195,74,60,0.10)', icon: '↓' },
  neutral: { label: '中立', color: 'var(--workbench-text-muted)', bg: 'rgba(130,121,106,0.10)', icon: '—' },
};

function normalizeConfidencePercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 1) return Math.round(Math.max(0, numeric) * 100);
  return Math.round(Math.max(0, Math.min(100, numeric)));
}

function buildTree(nodes, edges) {
  const edgeRelMap = {};
  (edges || []).forEach((edge) => {
    edgeRelMap[edge.target_node_id] = edge.relation_type || 'neutral';
  });

  const childrenMap = {};
  const nodeMap = {};
  const hasParent = new Set();

  nodes.forEach((node) => {
    nodeMap[node.id] = { ...node, edgeRelation: edgeRelMap[node.id] };
    if (!childrenMap[node.id]) childrenMap[node.id] = [];
  });

  nodes.forEach((node) => {
    if (node.parent_id && nodeMap[node.parent_id]) {
      if (!childrenMap[node.parent_id]) childrenMap[node.parent_id] = [];
      childrenMap[node.parent_id].push(node.id);
      hasParent.add(node.id);
    }
  });

  (edges || []).forEach((edge) => {
    const source = edge.source_node_id;
    const target = edge.target_node_id;
    if (nodeMap[source] && nodeMap[target] && !hasParent.has(target)) {
      if (!childrenMap[source]) childrenMap[source] = [];
      childrenMap[source].push(target);
      hasParent.add(target);
    }
  });

  const roots = nodes.filter((node) => !hasParent.has(node.id));
  return { roots, childrenMap, nodeMap };
}

function QuestionDoc({ nodeId, nodeMap, childrenMap, depth = 0 }) {
  const [expanded, setExpanded] = useState(true);
  const node = nodeMap[nodeId];
  if (!node) return null;

  const children = childrenMap[nodeId] || [];
  const hasChildren = children.length > 0;
  const text = node.content?.text || '未命名问题';
  const isRoot = depth === 0;

  return (
    <div style={{ marginTop: depth > 0 ? 8 : 0 }}>
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
        className="flex items-start gap-2 w-full text-left group"
        style={{
          padding: isRoot ? '10px 10px' : '8px 10px',
          background: 'var(--workbench-card)',
          border: '1px solid var(--workbench-border)',
          borderRadius: 10,
          boxShadow: isRoot ? '0 4px 12px rgba(30,26,18,0.07)' : 'none',
        }}
      >
        <div
          className="shrink-0 rounded-sm"
          style={{
            width: 3,
            minHeight: isRoot ? 20 : 16,
            alignSelf: 'stretch',
            background: isRoot ? 'var(--workbench-blue)' : 'rgba(47,128,255,0.36)',
            marginTop: 2,
          }}
        />
        <div className="flex-1 min-w-0 flex items-start gap-1.5">
          {hasChildren && (
            expanded
              ? <ChevronDown size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--workbench-text-muted)' }} />
              : <ChevronRight size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--workbench-text-muted)' }} />
          )}
          <span
            className={`leading-snug ${isRoot ? 'text-[14px] font-bold' : 'text-[13px] font-semibold'}`}
            style={{ color: 'var(--workbench-text)' }}
          >
            {text}
          </span>
          {node.status === 'resolved' && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ml-1"
              style={{ background: 'rgba(31,157,103,0.10)', color: 'var(--workbench-green)', borderColor: 'rgba(31,157,103,0.30)' }}
            >
              已解决
            </span>
          )}
          {node.status === 'blocked' && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ml-1"
              style={{ background: 'rgba(195,74,60,0.10)', color: 'var(--workbench-red)', borderColor: 'rgba(195,74,60,0.30)' }}
            >
              受阻
            </span>
          )}
        </div>
      </button>

      {expanded && hasChildren && (
        <div style={{ marginLeft: 12 }}>
          {children.map((childId) => (
            <DocNode key={childId} nodeId={childId} nodeMap={nodeMap} childrenMap={childrenMap} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function HypothesisDoc({ nodeId, nodeMap, childrenMap, depth = 0 }) {
  const [expanded, setExpanded] = useState(true);
  const node = nodeMap[nodeId];
  if (!node) return null;

  const children = childrenMap[nodeId] || [];
  const hasChildren = children.length > 0;
  const claim = node.claim || node.content?.text || '未命名假说';
  const state = STATE_STYLES[node.hypo_state] || STATE_STYLES.pending;
  const confidence = normalizeConfidencePercent(node.confidence);

  return (
    <div style={{ marginTop: 6 }}>
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
        className="w-full text-left rounded-lg transition-colors"
        style={{
          padding: '8px 10px',
          background: 'var(--workbench-card)',
          border: '1px solid var(--workbench-border)',
          borderLeft: `3px solid ${state.border}`,
          boxShadow: '0 4px 10px rgba(30,26,18,0.06)',
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider rounded-full border px-1.5 py-0.5"
            style={{ color: state.color, background: state.bg, borderColor: state.border }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: state.border }} />
            {state.label}
          </span>
          {confidence > 0 && (
            <span className="text-[10px] tabular-nums font-medium" style={{ color: 'var(--workbench-text-muted)' }}>
              置信度 {confidence}%
            </span>
          )}
          {hasChildren && (
            <span className="ml-auto shrink-0">
              {expanded
                ? <ChevronDown size={12} style={{ color: state.color }} />
                : <ChevronRight size={12} style={{ color: state.color }} />
              }
            </span>
          )}
        </div>
        <p className="text-[13px] leading-relaxed" style={{ color: 'var(--workbench-text-soft)' }}>
          {claim}
        </p>
      </button>

      {expanded && hasChildren && (
        <div style={{ marginLeft: 8, marginTop: 4 }}>
          {children.map((childId) => (
            <DocNode key={childId} nodeId={childId} nodeMap={nodeMap} childrenMap={childrenMap} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function EvidenceDoc({ nodeId, nodeMap }) {
  const node = nodeMap[nodeId];
  if (!node) return null;

  const relation = RELATION_STYLES[node.edgeRelation] || RELATION_STYLES.neutral;
  const text = node.content?.text || node.card?.summary || '证据';
  const sourceName = node.card?.source?.name || (() => {
    if (!node.card?.source_url) return '';
    try {
      return new URL(node.card.source_url).hostname.replace('www.', '');
    } catch {
      return '';
    }
  })();
  const sourceUrl = node.card?.source_url || '';

  return (
    <div
      className="flex items-start gap-2 rounded-lg border"
      style={{
        padding: '6px 8px',
        marginTop: 3,
        background: 'var(--workbench-card)',
        borderColor: 'var(--workbench-border)',
        borderLeft: `2px solid ${relation.color}`,
      }}
    >
      <span
        className="text-[10px] font-bold shrink-0 rounded-full border px-1.5 py-0.5 mt-px"
        style={{ color: relation.color, background: relation.bg, borderColor: relation.color }}
      >
        {relation.icon} {relation.label}
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-[12px] leading-snug line-clamp-3" style={{ color: 'var(--workbench-text-soft)' }}>
          {text}
        </p>
        {sourceName && (
          <div className="flex items-center gap-1 mt-1">
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] truncate transition-colors hover:underline flex items-center gap-0.5"
                style={{ color: 'var(--workbench-blue-ink)' }}
                onClick={(event) => event.stopPropagation()}
              >
                <ExternalLink size={9} className="shrink-0" />
                {sourceName}
              </a>
            ) : (
              <span className="text-[10px] truncate" style={{ color: 'var(--workbench-text-muted)' }}>{sourceName}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DocNode({ nodeId, nodeMap, childrenMap, depth = 0 }) {
  const node = nodeMap[nodeId];
  if (!node) return null;

  if (node.node_type === 'question') {
    return <QuestionDoc nodeId={nodeId} nodeMap={nodeMap} childrenMap={childrenMap} depth={depth} />;
  }
  if (node.node_type === 'hypothesis') {
    return <HypothesisDoc nodeId={nodeId} nodeMap={nodeMap} childrenMap={childrenMap} depth={depth} />;
  }
  if (node.node_type === 'evidence') {
    return <EvidenceDoc nodeId={nodeId} nodeMap={nodeMap} />;
  }
  return null;
}

function BoardDocPanel({ topicId }) {
  const [loading, setLoading] = useState(true);
  const [boardData, setBoardData] = useState(null);
  const [error, setError] = useState(null);

  const loadBoard = useCallback(async () => {
    if (!topicId) return;
    setLoading(true);
    setError(null);
    try {
      const { board } = await boardsApi.getTopicBoard(topicId);
      setBoardData(board);
    } catch (err) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const tree = useMemo(() => {
    if (!boardData?.nodes?.length) return null;
    return buildTree(boardData.nodes, boardData.edges);
  }, [boardData]);

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
          尚无假说文档
          <br />
          在论证板中创建问题和假说后
          <br />
          将在此显示结构化大纲
        </p>
      </div>
    );
  }

  const questionCount = boardData.nodes.filter((node) => node.node_type === 'question').length;
  const hypoCount = boardData.nodes.filter((node) => node.node_type === 'hypothesis').length;
  const evidenceCount = boardData.nodes.filter((node) => node.node_type === 'evidence').length;

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
        {tree.roots.map((root) => (
          <DocNode
            key={root.id}
            nodeId={root.id}
            nodeMap={tree.nodeMap}
            childrenMap={tree.childrenMap}
            depth={0}
          />
        ))}
      </div>
    </div>
  );
}

export default BoardDocPanel;
