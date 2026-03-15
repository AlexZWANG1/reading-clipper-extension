// ========= DocumentView — Structured Research Report (Spec §4, §14) =========
// Stage 1: Auto-generated read-only report from Q→H→E board data.
// Each question becomes a section, hypotheses become subsections with
// evidence bullets and confidence indicators.
// Same data as structure view — both read from board nodes/edges.

import { useState, useEffect, useMemo } from 'react';
import { Loader2, FileText, AlertTriangle, CheckCircle, HelpCircle } from 'lucide-react';
import { boardsApi } from '../../lib/api';
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

export default function DocumentView({ topicId, className }) {
    const [loading, setLoading] = useState(true);
    const [boardData, setBoardData] = useState(null);
    const [topicData, setTopicData] = useState(null);

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
    }, [topicId]);

    // Build tree structure from flat nodes/edges
    const sections = useMemo(() => {
        if (!boardData?.nodes?.length) return [];

        const nodes = boardData.nodes;
        const edges = boardData.edges || [];

        // Build parent→children map
        const childrenMap = {}; // parentId → [child nodes]
        const nodeMap = {};     // id → node
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

        // Build edge relation map for evidence
        const edgeRelMap = {}; // targetNodeId → relation_type
        edges.forEach(e => {
            edgeRelMap[e.target_node_id] = e.relation_type;
        });

        // Recursive section builder
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
                            relation: edgeRelMap[e.id] || 'neutral',
                        })),
                    };
                }),
                subSections: subQuestions.map(sq => buildSection(sq, depth + 1)),
            };
        }

        // Start from root question nodes
        const rootNodes = nodes.filter(n => rootIds.has(n.id) && n.node_type === 'question');
        return rootNodes.map(r => buildSection(r));
    }, [boardData]);

    if (loading) {
        return (
            <div className={`flex items-center justify-center h-full ${className || ''}`} style={{ background: 'var(--bg-0)' }}>
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent-400)' }} />
                <span className="ml-2 text-sm" style={{ color: 'var(--text-2)' }}>生成研究报告...</span>
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
                    基于论证板数据自动生成 · {boardData.nodes.length} 个节点
                </p>

                <div className="h-px mb-8" style={{ background: 'var(--stroke-0)' }} />

                {/* Sections */}
                {sections.map((section, i) => (
                    <Section key={section.node.id} section={section} index={i + 1} />
                ))}
            </div>
        </div>
    );
}

function Section({ section, index, parentIndex = '' }) {
    const { node, hypotheses, subSections, depth } = section;
    const sectionNum = parentIndex ? `${parentIndex}.${index}` : `${index}`;
    const questionText = node.content?.text || node.content || '未命名问题';

    const HeadingTag = depth === 0 ? 'h2' : depth === 1 ? 'h3' : 'h4';
    const headingSize = depth === 0 ? 'text-xl' : depth === 1 ? 'text-lg' : 'text-base';

    return (
        <div className="mb-8">
            <HeadingTag className={`${headingSize} font-bold mb-4`} style={{ color: 'var(--text-0)' }}>
                <span style={{ color: 'var(--accent-400)' }}>{sectionNum}.</span>{' '}
                {questionText}
            </HeadingTag>

            {hypotheses.length === 0 && subSections.length === 0 && (
                <p className="text-sm italic" style={{ color: 'var(--text-2)' }}>
                    暂无假说或子问题
                </p>
            )}

            {hypotheses.map((hypo, hi) => (
                <HypothesisBlock key={hypo.node.id} hypo={hypo} index={hi + 1} />
            ))}

            {subSections.map((sub, si) => (
                <Section key={sub.node.id} section={sub} index={si + 1} parentIndex={sectionNum} />
            ))}
        </div>
    );
}

function HypothesisBlock({ hypo, index }) {
    const { node, evidence } = hypo;
    const claim = node.claim || node.content?.text || '未命名假说';
    const state = node.hypo_state || 'pending';
    const confidence = getConfidence(node.confidence || 0);
    const ConfIcon = confidence.icon;

    const stateLabel = {
        pending: '待验证',
        supported: '已支持',
        refuted: '已否定',
        revised: '已修订',
    }[state] || state;

    const stateColor = {
        pending: 'var(--text-2)',
        supported: '#18A06A',
        refuted: '#C33A30',
        revised: '#D97706',
    }[state] || 'var(--text-2)';

    return (
        <div className="ml-4 mb-6 pl-4" style={{ borderLeft: `2px solid ${BOARD_PALETTE.hypothesis}` }}>
            {/* Hypothesis header */}
            <div className="flex items-start gap-2 mb-2">
                <span className="text-sm font-semibold" style={{ color: 'var(--text-0)' }}>
                    假说 {index}:
                </span>
                <span className="text-sm flex-1" style={{ color: 'var(--text-0)' }}>
                    {claim}
                </span>
            </div>

            {/* Status badges */}
            <div className="flex items-center gap-3 mb-3">
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${stateColor}15`, color: stateColor }}>
                    {stateLabel}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: confidence.color }}>
                    <ConfIcon size={11} />
                    {confidence.text}
                </span>
            </div>

            {/* Evidence list */}
            {evidence.length > 0 && (
                <div className="space-y-2">
                    {evidence.map(({ node: ev, relation }) => (
                        <EvidenceBullet key={ev.id} evidence={ev} relation={relation} />
                    ))}
                </div>
            )}

            {evidence.length === 0 && (
                <p className="text-xs italic" style={{ color: 'var(--text-2)' }}>
                    暂无证据
                </p>
            )}
        </div>
    );
}

function EvidenceBullet({ evidence, relation }) {
    const text = evidence.content?.text || evidence.content || '';
    const cardTitle = evidence.card?.title;
    const sourceName = evidence.card?.source?.name;

    const relationConfig = {
        supports: { label: '支持', color: BOARD_PALETTE.evidence, symbol: '✓' },
        refutes: { label: '反驳', color: BOARD_PALETTE.refute, symbol: '✗' },
        neutral: { label: '中立', color: BOARD_PALETTE.neutral, symbol: '–' },
    }[relation] || { label: '证据', color: BOARD_PALETTE.neutral, symbol: '•' };

    return (
        <div className="flex items-start gap-2 py-1.5 px-3 rounded-lg text-xs" style={{ background: 'var(--surface-1)' }}>
            <span className="shrink-0 font-bold mt-0.5" style={{ color: relationConfig.color }}>
                {relationConfig.symbol}
            </span>
            <div className="flex-1 min-w-0">
                <span style={{ color: 'var(--text-1)' }}>{text || '(无内容)'}</span>
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
            <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${relationConfig.color}15`, color: relationConfig.color }}>
                {relationConfig.label}
            </span>
        </div>
    );
}
