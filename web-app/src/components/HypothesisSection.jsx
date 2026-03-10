import { useEffect, useMemo, useState } from 'react';
import {
  FlaskConical,
  Sparkles,
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Loader2,
  FileText,
  Layers,
  MousePointer2,
} from 'lucide-react';
import { hypothesesApi } from '../lib/api';
import { useUIStore } from '../lib/store';

const EVIDENCE_STYLE = {
  support: {
    label: '支持证据',
    bg: 'rgba(24,138,75,0.08)',
    border: '1px solid rgba(24,138,75,0.22)',
    color: 'var(--success)',
    icon: <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--success)' }} />,
  },
  oppose: {
    label: '反对证据',
    bg: 'rgba(195,58,48,0.08)',
    border: '1px solid rgba(195,58,48,0.22)',
    color: 'var(--error)',
    icon: <XCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--error)' }} />,
  },
  mixed: {
    label: '混合证据',
    bg: 'rgba(194,107,31,0.08)',
    border: '1px solid rgba(194,107,31,0.22)',
    color: 'var(--warning)',
    icon: <HelpCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--warning)' }} />,
  },
};

const VERDICT_STYLE = {
  supported: { label: '支持', bg: 'rgba(24,138,75,0.1)', color: 'var(--success)' },
  refuted: { label: '不支持', bg: 'rgba(195,58,48,0.1)', color: 'var(--error)' },
  mixed: { label: '证据混合', bg: 'rgba(194,107,31,0.1)', color: 'var(--warning)' },
  unknown: { label: '待判断', bg: 'rgba(127,117,102,0.16)', color: 'var(--text-2)' },
};

function normalizeVerdict(rawVerdict) {
  const text = String(rawVerdict || '').toLowerCase();
  if (['supported', 'support', 'validated', 'true', 'yes'].includes(text)) return 'supported';
  if (['refuted', 'reject', 'falsified', 'false', 'no'].includes(text)) return 'refuted';
  if (['mixed', 'partial', 'uncertain'].includes(text)) return 'mixed';
  return 'unknown';
}

function HypothesisSection({
  topics = [],
  selectedCardIds,
  cards = [],
  onClearSelection,
  activeTopicId = '',
  activeTopicTitle = '',
}) {
  const { showToast } = useUIStore();

  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [evaluationResult, setEvaluationResult] = useState(null);
  const [sourceMode, setSourceMode] = useState('topic');
  const [selectedTopicId, setSelectedTopicId] = useState('');

  const selectedCount = selectedCardIds?.size || 0;
  const sourceReady = sourceMode === 'topic' ? !!selectedTopicId : selectedCount > 0;

  useEffect(() => {
    if (sourceMode !== 'topic' || !activeTopicId) return;
    setSelectedTopicId((prev) => (prev === activeTopicId ? prev : activeTopicId));
  }, [activeTopicId, sourceMode]);

  const selectedTopicTitle = useMemo(() => {
    if (!selectedTopicId) return '';
    return topics.find((topic) => topic.id === selectedTopicId)?.title || '';
  }, [topics, selectedTopicId]);

  const preferredTopicTitle = selectedTopicTitle || activeTopicTitle;

  const inferredTopicFromCards = useMemo(() => {
    if (selectedCount === 0) return null;

    const topicCounts = {};
    cards.forEach((card) => {
      if (selectedCardIds.has(card.id) && card.topic_title) {
        topicCounts[card.topic_title] = (topicCounts[card.topic_title] || 0) + 1;
      }
    });

    const sorted = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || null;
  }, [selectedCardIds, cards, selectedCount]);

  const handleSourceModeChange = (nextMode) => {
    setSourceMode(nextMode);
    if (nextMode === 'topic' && !selectedTopicId && activeTopicId) {
      setSelectedTopicId(activeTopicId);
    }
  };

  const handleSuggestHypothesis = async () => {
    setLoading(true);
    setLoadingText('AI 正在分析卡片...');

    try {
      const params = {};

      if (sourceMode === 'topic' && selectedTopicId) {
        params.topic_id = selectedTopicId;
      } else if (sourceMode === 'manual' && selectedCount > 0) {
        params.card_ids = Array.from(selectedCardIds);
      } else {
        showToast('请先选择 Topic 或勾选卡片', 'error');
        setLoading(false);
        return;
      }

      const response = await hypothesesApi.suggest(params);

      if (response.ok && response.hypotheses?.length > 0) {
        setHypothesis(response.hypotheses[0]);
        showToast(`已生成假设建议（共 ${response.hypotheses.length} 条）`, 'success');
      } else {
        throw new Error(response.error || '生成假设失败');
      }
    } catch (error) {
      console.error('suggest hypothesis error:', error);
      showToast(error.message || 'AI 提炼假设失败', 'error');
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  const handleEvaluate = async () => {
    if (!hypothesis.trim()) {
      showToast('请先输入假设', 'error');
      return;
    }

    if (sourceMode === 'topic' && !selectedTopicId) {
      showToast('请先选择一个 Topic', 'error');
      return;
    }

    if (sourceMode === 'manual' && selectedCount === 0) {
      showToast('请先勾选卡片作为证据', 'error');
      return;
    }

    setLoading(true);
    setLoadingText('AI 正在验证假设...');
    setEvaluationResult(null);

    try {
      const params = {
        hypotheses: [hypothesis.trim()],
      };

      if (sourceMode === 'topic') {
        params.topic_id = selectedTopicId;
      } else {
        params.card_ids = Array.from(selectedCardIds);
      }

      const response = await hypothesesApi.evaluate(params);

      if (response.ok && response.result) {
        setEvaluationResult(response.result);
        showToast('假设验证完成', 'success');
      } else {
        throw new Error(response.error || response.detail || '验证失败');
      }
    } catch (error) {
      console.error('evaluate hypothesis error:', error);
      showToast(error.message || '假设验证失败', 'error');
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  const renderEvidenceItem = (evidence, type) => {
    const style = EVIDENCE_STYLE[type] || EVIDENCE_STYLE.mixed;

    return (
      <div key={`${type}-${evidence.card_id}`} className="p-3 rounded-lg mb-2" style={{ background: style.bg, border: style.border }}>
        <div className="flex items-start gap-2">
          {style.icon}
          <div className="flex-1 min-w-0">
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-1)' }}>
              {evidence.rationale}
            </p>
            <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: 'var(--text-2)' }}>
              <FileText className="w-3 h-3" />
              <span className="truncate">卡片: {evidence.card_id}</span>
              {evidence.strength && (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px]"
                  style={{ background: 'rgba(23,20,15,0.08)', color: 'var(--text-1)' }}
                >
                  强度 {evidence.strength}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderEvaluations = () => {
    const evaluations = evaluationResult?.evaluations || [];
    if (evaluations.length === 0) return null;

    return (
      <div className="space-y-5">
        {evaluations.map((evaluation, idx) => {
          const verdictRaw = evaluation.overall_judgement || evaluation.verdict || 'unknown';
          const verdict = normalizeVerdict(verdictRaw);
          const verdictStyle = VERDICT_STYLE[verdict] || VERDICT_STYLE.unknown;
          const confidenceValue = evaluation.net_confidence !== undefined
            ? Math.max(0, Math.min(100, Math.round(evaluation.net_confidence * 100)))
            : null;

          return (
            <div
              key={evaluation.hypothesis_id || idx}
              className="p-4 rounded-xl"
              style={{
                border: '1px solid var(--stroke-0)',
                background: 'linear-gradient(180deg, var(--surface-0) 0%, var(--surface-1) 100%)',
                boxShadow: '0 8px 20px rgba(31, 27, 20, 0.06)',
              }}
            >
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-xs px-2 py-1 rounded-full" style={{ background: verdictStyle.bg, color: verdictStyle.color }}>
                  {verdictStyle.label}
                </span>
                {confidenceValue !== null && (
                  <span className="text-xs tabular-nums" style={{ color: 'var(--text-2)' }}>
                    置信度 {confidenceValue}%
                  </span>
                )}
              </div>

              <p className="font-semibold mb-3 leading-relaxed" style={{ color: 'var(--text-0)' }}>
                {evaluation.hypothesis_text || hypothesis}
              </p>

              {confidenceValue !== null && (
                <div className="h-1.5 rounded-full overflow-hidden mb-4" style={{ background: 'rgba(127,117,102,0.2)' }}>
                  <div
                    className="h-full transition-all"
                    style={{ width: `${confidenceValue}%`, background: 'var(--accent-500)' }}
                  />
                </div>
              )}

              {evaluation.supporting_evidence?.length > 0 && (
                <div className="mb-3">
                  <h5 className="text-xs font-semibold mb-2" style={{ color: EVIDENCE_STYLE.support.color }}>
                    {EVIDENCE_STYLE.support.label} ({evaluation.supporting_evidence.length})
                  </h5>
                  {evaluation.supporting_evidence.map((e) => renderEvidenceItem(e, 'support'))}
                </div>
              )}

              {evaluation.opposing_evidence?.length > 0 && (
                <div className="mb-3">
                  <h5 className="text-xs font-semibold mb-2" style={{ color: EVIDENCE_STYLE.oppose.color }}>
                    {EVIDENCE_STYLE.oppose.label} ({evaluation.opposing_evidence.length})
                  </h5>
                  {evaluation.opposing_evidence.map((e) => renderEvidenceItem(e, 'oppose'))}
                </div>
              )}

              {evaluation.mixed_evidence?.length > 0 && (
                <div>
                  <h5 className="text-xs font-semibold mb-2" style={{ color: EVIDENCE_STYLE.mixed.color }}>
                    {EVIDENCE_STYLE.mixed.label} ({evaluation.mixed_evidence.length})
                  </h5>
                  {evaluation.mixed_evidence.map((e) => renderEvidenceItem(e, 'mixed'))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="rounded-2xl overflow-hidden mb-6"
      style={{
        background: 'linear-gradient(180deg, var(--surface-0) 0%, var(--surface-1) 100%)',
        border: '1px solid var(--stroke-0)',
        boxShadow: '0 10px 24px rgba(31, 27, 20, 0.08)',
      }}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-5 py-4 flex items-center justify-between transition-colors hover:bg-white/40"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ background: 'rgba(13, 110, 253, 0.1)' }}>
            <FlaskConical className="w-5 h-5" style={{ color: 'var(--text-0)' }} />
          </div>
          <div className="text-left">
            <h3 className="font-semibold" style={{ color: 'var(--text-0)' }}>假设验证</h3>
            <p className="text-xs" style={{ color: 'var(--text-2)' }}>
              先定义命题，再由 AI 基于证据给出结论与置信度
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {preferredTopicTitle && (
            <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(13,110,253,0.08)', color: 'var(--accent-500)' }}>
              Topic: {preferredTopicTitle}
            </span>
          )}
          {selectedCount > 0 && (
            <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(37,99,235,0.08)', color: 'var(--accent-500)' }}>
              已选 {selectedCount} 张卡片
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5" style={{ color: 'var(--text-2)' }} />
          ) : (
            <ChevronDown className="w-5 h-5" style={{ color: 'var(--text-2)' }} />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-5 pb-5" style={{ borderTop: '1px solid var(--stroke-0)' }}>
          <div className="mt-4">
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-1)' }}>输入你的假设</label>
            <input
              id="hypothesis-input"
              name="hypothesis_input"
              type="text"
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              placeholder="例如：企业采购环节中，AI Agent 会在一年内替代 30% 的手动流程"
              disabled={loading}
              className="w-full px-4 py-3 rounded-xl input-focus disabled:opacity-50"
              style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)', color: 'var(--text-0)' }}
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium mb-3" style={{ color: 'var(--text-1)' }}>选择证据来源</label>

            <div className="flex gap-4 mb-4">
              <label
                className="flex-1 flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all"
                style={{
                  border: sourceMode === 'topic' ? '2px solid var(--accent-500)' : '2px solid var(--stroke-0)',
                  background: sourceMode === 'topic' ? 'rgba(13, 110, 253, 0.08)' : 'rgba(255,255,255,0.4)',
                }}
              >
                <input
                  type="radio"
                  name="sourceMode"
                  value="topic"
                  checked={sourceMode === 'topic'}
                  onChange={() => handleSourceModeChange('topic')}
                  className="sr-only"
                />
                <Layers className="w-5 h-5" style={{ color: sourceMode === 'topic' ? 'var(--accent-400)' : 'var(--text-2)' }} />
                <div>
                  <div className="font-medium" style={{ color: sourceMode === 'topic' ? 'var(--accent-300)' : 'var(--text-1)' }}>按 Topic</div>
                  <div className="text-xs" style={{ color: 'var(--text-2)' }}>使用整个 Topic 的卡片</div>
                </div>
              </label>

              <label
                className="flex-1 flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all"
                style={{
                  border: sourceMode === 'manual' ? '2px solid var(--accent-500)' : '2px solid var(--stroke-0)',
                  background: sourceMode === 'manual' ? 'rgba(13, 110, 253, 0.08)' : 'rgba(255,255,255,0.4)',
                }}
              >
                <input
                  type="radio"
                  name="sourceMode"
                  value="manual"
                  checked={sourceMode === 'manual'}
                  onChange={() => handleSourceModeChange('manual')}
                  className="sr-only"
                />
                <MousePointer2 className="w-5 h-5" style={{ color: sourceMode === 'manual' ? 'var(--accent-400)' : 'var(--text-2)' }} />
                <div>
                  <div className="font-medium" style={{ color: sourceMode === 'manual' ? 'var(--accent-300)' : 'var(--text-1)' }}>手动勾选</div>
                  <div className="text-xs" style={{ color: 'var(--text-2)' }}>在下方卡片列表中选择</div>
                </div>
              </label>
            </div>

            {sourceMode === 'topic' ? (
              <div className="relative">
                <select
                  id="hypothesis-topic-select"
                  name="hypothesis_topic_select"
                  value={selectedTopicId}
                  onChange={(e) => setSelectedTopicId(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-2.5 rounded-xl appearance-none cursor-pointer disabled:opacity-50"
                  style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)', color: 'var(--text-0)' }}
                >
                  <option value="">选择 Topic...</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>{topic.title}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-2)' }} />
              </div>
            ) : (
              <div
                className="px-4 py-3 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid var(--stroke-0)' }}
              >
                {selectedCount > 0 ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium" style={{ color: 'var(--accent-300)' }}>{selectedCount}</span>
                      <span style={{ color: 'var(--text-1)' }}> 张卡片已选中</span>
                      {inferredTopicFromCards && (
                        <span className="text-sm ml-2" style={{ color: 'var(--text-2)' }}>
                          (主要来自: {inferredTopicFromCards})
                        </span>
                      )}
                    </div>
                    <button onClick={onClearSelection} className="text-xs underline" style={{ color: 'var(--text-2)' }}>
                      清空选择
                    </button>
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--text-2)' }}>请在下方卡片列表中勾选证据卡片</p>
                )}
              </div>
            )}
          </div>

          <div className="mt-3 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(13,110,253,0.06)', color: 'var(--text-2)', border: '1px solid rgba(13,110,253,0.16)' }}>
            {sourceMode === 'topic'
              ? (selectedTopicTitle
                ? `当前证据范围：Topic「${selectedTopicTitle}」`
                : '请选择一个 Topic 作为证据范围')
              : (selectedCount > 0
                ? `当前证据范围：手动选中的 ${selectedCount} 张卡片`
                : '请在下方卡片列表中勾选证据卡片')}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={handleSuggestHypothesis}
              disabled={loading || !sourceReady}
              className="flex items-center gap-2 px-4 py-2.5 font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              style={{
                background: 'rgba(255,255,255,0.5)',
                color: 'var(--text-0)',
                border: '1px solid var(--stroke-0)',
              }}
            >
              {loading && loadingText.includes('分析') ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              AI 提炼假设
            </button>

            <button
              onClick={handleEvaluate}
              disabled={loading || !hypothesis.trim() || !sourceReady}
              className="flex items-center gap-2 px-4 py-2.5 font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              style={{
                background: 'linear-gradient(135deg, var(--accent-500) 0%, var(--interactive-hover) 100%)',
                color: 'white',
              }}
            >
              {loading && loadingText.includes('验证') ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              开始验证
            </button>

            {loading && (
              <span className="flex items-center text-sm" style={{ color: 'var(--text-2)' }}>
                {loadingText}
              </span>
            )}
          </div>

          {evaluationResult && (
            <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--stroke-0)' }}>
              {evaluationResult.global_summary && (
                <div
                  className="mb-6 p-4 rounded-xl"
                  style={{
                    background: 'rgba(13, 110, 253, 0.06)',
                    border: '1px solid rgba(13, 110, 253, 0.2)',
                  }}
                >
                  <h4 className="font-semibold mb-2" style={{ color: 'var(--text-0)' }}>综合分析</h4>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-1)' }}>
                    {evaluationResult.global_summary}
                  </p>
                </div>
              )}

              {renderEvaluations()}

              {evaluationResult.used_card_ids?.length > 0 && (
                <div className="mt-4 text-xs" style={{ color: 'var(--text-2)' }}>
                  共使用 {evaluationResult.used_card_ids.length} 张卡片进行验证
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default HypothesisSection;
