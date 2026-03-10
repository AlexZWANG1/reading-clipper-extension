// ========= Board Document Panel — Structured hypothesis outline =========
// Q → H → E tree as a readable document. Visual hierarchy:
//   Question = section header with left accent bar
//   Hypothesis = card with colored left border + state badge
//   Evidence = compact row with relation indicator + source

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, ChevronRight, ChevronDown, AlertCircle, ExternalLink } from 'lucide-react';
import { boardsApi } from '../lib/api';

// ── Visual constants ─────────────────────────────────────────────────────────

const STATE_STYLES = {
  pending:   { label: '待验证', bg: 'rgba(168,85,247,0.10)', color: '#A855F7', border: '#A855F7' },
  validated: { label: '已验证', bg: 'rgba(16,185,129,0.10)', color: '#10B981', border: '#10B981' },
  falsified: { label: '已否定', bg: 'rgba(239,68,68,0.10)',  color: '#EF4444', border: '#EF4444' },
};

const RELATION_STYLES = {
  supports: { label: '支持', color: '#10B981', bg: 'rgba(16,185,129,0.08)', icon: '↑' },
  refutes:  { label: '反驳', color: '#EF4444', bg: 'rgba(239,68,68,0.08)',  icon: '↓' },
  neutral:  { label: '中立', color: '#94A3B8', bg: 'rgba(148,163,184,0.08)', icon: '—' },
};

// ── Tree builder ─────────────────────────────────────────────────────────────

function buildTree(nodes, edges) {
  // Map edge relations: targetNodeId → relation_type
  const edgeRelMap = {};
  (edges || []).forEach(e => { edgeRelMap[e.target_node_id] = e.relation_type || 'neutral'; });

  const childrenMap = {};
  const nodeMap = {};
  const hasParent = new Set(); // track nodes that have a parent (via parent_id or edge)

  nodes.forEach(n => {
    nodeMap[n.id] = { ...n, edgeRelation: edgeRelMap[n.id] };
    if (!childrenMap[n.id]) childrenMap[n.id] = [];
  });

  // 1) parent_id based relationships (Q→Q, Q→H, H→H)
  nodes.forEach(n => {
    if (n.parent_id && nodeMap[n.parent_id]) {
      if (!childrenMap[n.parent_id]) childrenMap[n.parent_id] = [];
      childrenMap[n.parent_id].push(n.id);
      hasParent.add(n.id);
    }
  });

  // 2) board_edges based relationships (H→E supports/refutes/neutral)
  //    Evidence nodes are linked via edges, not parent_id
  (edges || []).forEach(e => {
    const source = e.source_node_id;
    const target = e.target_node_id;
    if (nodeMap[source] && nodeMap[target] && !hasParent.has(target)) {
      if (!childrenMap[source]) childrenMap[source] = [];
      childrenMap[source].push(target);
      hasParent.add(target);
    }
  });

  const roots = nodes.filter(n => !hasParent.has(n.id));
  return { roots, childrenMap, nodeMap };
}

// ── Question node ────────────────────────────────────────────────────────────

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
      {/* Question header */}
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
        className="flex items-start gap-2 w-full text-left group"
        style={{ padding: '6px 0' }}
      >
        {/* Left accent bar */}
        <div
          className="shrink-0 rounded-sm"
          style={{
            width: 3,
            minHeight: isRoot ? 20 : 16,
            alignSelf: 'stretch',
            background: isRoot ? '#3B82F6' : 'rgba(59,130,246,0.35)',
            marginTop: 2,
          }}
        />
        <div className="flex-1 min-w-0 flex items-start gap-1.5">
          {hasChildren && (
            expanded
              ? <ChevronDown size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--text-2)' }} />
              : <ChevronRight size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--text-2)' }} />
          )}
          <span
            className={`leading-snug ${isRoot ? 'text-sm font-bold' : 'text-[13px] font-semibold'}`}
            style={{ color: 'var(--text-0)' }}
          >
            {text}
          </span>
          {node.status === 'resolved' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 ml-1" style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981' }}>已解决</span>
          )}
          {node.status === 'blocked' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 ml-1" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>受阻</span>
          )}
        </div>
      </button>

      {/* Children */}
      {expanded && hasChildren && (
        <div style={{ marginLeft: 12 }}>
          {children.map(cid => (
            <DocNode key={cid} nodeId={cid} nodeMap={nodeMap} childrenMap={childrenMap} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Hypothesis node ──────────────────────────────────────────────────────────

function HypothesisDoc({ nodeId, nodeMap, childrenMap, depth = 0 }) {
  const [expanded, setExpanded] = useState(true);
  const node = nodeMap[nodeId];
  if (!node) return null;

  const children = childrenMap[nodeId] || [];
  const hasChildren = children.length > 0;
  const claim = node.claim || node.content?.text || '未命名假说';
  const state = STATE_STYLES[node.hypo_state] || STATE_STYLES.pending;
  const confidence = node.confidence || 0;

  return (
    <div style={{ marginTop: 6 }}>
      {/* Hypothesis card */}
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
        className="w-full text-left rounded-lg transition-colors"
        style={{
          padding: '8px 10px',
          background: state.bg,
          borderLeft: `3px solid ${state.border}`,
        }}
      >
        {/* State badge row */}
        <div className="flex items-center gap-2 mb-1">
          <span
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: state.color }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: state.border }} />
            {state.label}
          </span>
          {confidence > 0 && (
            <span className="text-[10px] tabular-nums font-medium" style={{ color: 'var(--text-2)' }}>
              CONFIDENCE {confidence}%
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
        {/* Claim text */}
        <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-0)' }}>
          {claim}
        </p>
      </button>

      {/* Children (evidence) */}
      {expanded && hasChildren && (
        <div style={{ marginLeft: 8, marginTop: 4 }}>
          {children.map(cid => (
            <DocNode key={cid} nodeId={cid} nodeMap={nodeMap} childrenMap={childrenMap} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Evidence node ────────────────────────────────────────────────────────────

function EvidenceDoc({ nodeId, nodeMap }) {
  const node = nodeMap[nodeId];
  if (!node) return null;

  const rel = RELATION_STYLES[node.edgeRelation] || RELATION_STYLES.neutral;
  const text = node.content?.text || node.card?.summary || '证据';
  const sourceName = node.card?.source?.name || (() => {
    if (!node.card?.source_url) return '';
    try { return new URL(node.card.source_url).hostname.replace('www.', ''); } catch { return ''; }
  })();
  const sourceUrl = node.card?.source_url || '';

  return (
    <div
      className="flex items-start gap-2 rounded-md"
      style={{
        padding: '6px 8px',
        marginTop: 3,
        background: rel.bg,
      }}
    >
      {/* Relation indicator */}
      <span
        className="text-[10px] font-bold shrink-0 rounded px-1 py-0.5 mt-px"
        style={{ color: rel.color, background: `${rel.color}18` }}
      >
        {rel.icon} {rel.label}
      </span>
      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] leading-snug line-clamp-3" style={{ color: 'var(--text-1)' }}>
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
                style={{ color: 'var(--accent-300)' }}
                onClick={e => e.stopPropagation()}
              >
                <ExternalLink size={9} className="shrink-0" />
                {sourceName}
              </a>
            ) : (
              <span className="text-[10px] truncate" style={{ color: 'var(--text-2)' }}>{sourceName}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

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

// ── Main panel ───────────────────────────────────────────────────────────────

function BoardDocPanel({ topicId, topic }) {
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

  useEffect(() => { loadBoard(); }, [loadBoard]);

  const tree = useMemo(() => {
    if (!boardData?.nodes?.length) return null;
    return buildTree(boardData.nodes, boardData.edges);
  }, [boardData]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent-400)' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6">
        <AlertCircle size={20} style={{ color: 'var(--text-2)' }} />
        <p className="text-xs" style={{ color: 'var(--text-2)' }}>{error}</p>
      </div>
    );
  }

  if (!tree) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6">
        <svg width="36" height="28" viewBox="0 0 36 28" fill="none" opacity="0.4">
          <rect x="4" y="2" width="28" height="4" rx="2" fill="var(--text-2)" />
          <rect x="8" y="10" width="24" height="3" rx="1.5" fill="var(--text-2)" opacity="0.5" />
          <rect x="8" y="17" width="20" height="3" rx="1.5" fill="var(--text-2)" opacity="0.35" />
          <rect x="8" y="24" width="16" height="3" rx="1.5" fill="var(--text-2)" opacity="0.2" />
        </svg>
        <p className="text-xs text-center" style={{ color: 'var(--text-2)' }}>
          尚无假说文档<br />在论证板中创建问题和假说后<br />将在此显示结构化大纲
        </p>
      </div>
    );
  }

  const questionCount = boardData.nodes.filter(n => n.node_type === 'question').length;
  const hypoCount = boardData.nodes.filter(n => n.node_type === 'hypothesis').length;
  const evidenceCount = boardData.nodes.filter(n => n.node_type === 'evidence').length;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Stats strip */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 text-[11px] font-medium"
        style={{ borderBottom: '1px solid var(--stroke-0)' }}
      >
        <span style={{ color: '#3B82F6' }}>{questionCount} 问题</span>
        <span style={{ color: 'var(--stroke-1)' }}>·</span>
        <span style={{ color: '#A855F7' }}>{hypoCount} 假说</span>
        <span style={{ color: 'var(--stroke-1)' }}>·</span>
        <span style={{ color: '#10B981' }}>{evidenceCount} 证据</span>
      </div>

      {/* Document tree */}
      <div className="p-4 space-y-2">
        {tree.roots.map(root => (
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
