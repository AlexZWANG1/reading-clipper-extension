import { useMemo, useState } from 'react';
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

function HypothesisSection({ topics = [], selectedCardIds, cards = [], onClearSelection }) {
  const { showToast } = useUIStore();

  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [evaluationResult, setEvaluationResult] = useState(null);
  const [sourceMode, setSourceMode] = useState('topic');
  const [selectedTopicId, setSelectedTopicId] = useState('');

  const selectedCount = selectedCardIds?.size || 0;

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
    const palette = {
      support: {
        bg: 'rgba(52,211,153,0.08)',
        border: '1px solid rgba(52,211,153,0.2)',
        color: '#34D399',
        icon: <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#34D399' }} />,
      },
      oppose: {
        bg: 'rgba(251,113,133,0.08)',
        border: '1px solid rgba(251,113,133,0.2)',
        color: '#FB7185',
        icon: <XCircle className="w-4 h-4 shrink-0" style={{ color: '#FB7185' }} />,
      },
      mixed: {
        bg: 'rgba(251,191,36,0.08)',
        border: '1px solid rgba(251,191,36,0.2)',
        color: '#FBBF24',
        icon: <HelpCircle className="w-4 h-4 shrink-0" style={{ color: '#FBBF24' }} />,
      },
    };

    const style = palette[type] || palette.mixed;

    return (
      <div key={evidence.card_id} className="p-3 rounded-lg mb-2" style={{ background: style.bg, border: style.border }}>
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
                <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'rgba(0,0,0,0.2)' }}>
                  {evidence.strength}
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
          const verdict = evaluation.overall_judgement || evaluation.verdict || 'unknown';
          return (
            <div key={evaluation.hypothesis_id || idx} className="p-4 rounded-xl" style={{ border: '1px solid var(--stroke-0)', background: 'rgba(0,0,0,0.1)' }}>
              <p className="font-medium mb-3" style={{ color: 'var(--text-0)' }}>
                {evaluation.hypothesis_text || hypothesis}
              </p>
              <div className="text-sm mb-3" style={{ color: 'var(--text-1)' }}>
                结论: {verdict}
                {evaluation.net_confidence !== undefined && (
                  <span style={{ color: 'var(--text-2)' }}> · 置信度 {(evaluation.net_confidence * 100).toFixed(0)}%</span>
                )}
              </div>

              {evaluation.supporting_evidence?.length > 0 && (
                <div className="mb-3">
                  <h5 className="text-xs font-semibold mb-2" style={{ color: '#34D399' }}>支持证据 ({evaluation.supporting_evidence.length})</h5>
                  {evaluation.supporting_evidence.map((e) => renderEvidenceItem(e, 'support'))}
                </div>
              )}

              {evaluation.opposing_evidence?.length > 0 && (
                <div className="mb-3">
                  <h5 className="text-xs font-semibold mb-2" style={{ color: '#FB7185' }}>反对证据 ({evaluation.opposing_evidence.length})</h5>
                  {evaluation.opposing_evidence.map((e) => renderEvidenceItem(e, 'oppose'))}
                </div>
              )}

              {evaluation.mixed_evidence?.length > 0 && (
                <div>
                  <h5 className="text-xs font-semibold mb-2" style={{ color: '#FBBF24' }}>混合证据 ({evaluation.mixed_evidence.length})</h5>
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
    <div className="rounded-xl overflow-hidden mb-6" style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)' }}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-5 py-4 flex items-center justify-between transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ background: 'rgba(24,24,27,0.06)' }}>
            <FlaskConical className="w-5 h-5" style={{ color: 'var(--text-0)' }} />
          </div>
          <div className="text-left">
            <h3 className="font-semibold" style={{ color: 'var(--text-0)' }}>假设验证</h3>
            <p className="text-xs" style={{ color: 'var(--text-2)' }}>输入假设并用卡片证据验证</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
              type="text"
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              placeholder="例如：AI 技术将在办公效率上持续提升"
              disabled={loading}
              className="w-full px-4 py-3 rounded-xl input-focus disabled:opacity-50"
              style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)', color: 'var(--text-0)' }}
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium mb-3" style={{ color: 'var(--text-1)' }}>选择证据来源</label>

            <div className="flex gap-4 mb-4">
              <label className="flex-1 flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all" style={{
                border: sourceMode === 'topic' ? '2px solid var(--accent-500)' : '2px solid var(--stroke-0)',
                background: sourceMode === 'topic' ? 'rgba(37,99,235,0.04)' : 'transparent',
              }}>
                <input
                  type="radio"
                  name="sourceMode"
                  value="topic"
                  checked={sourceMode === 'topic'}
                  onChange={(e) => setSourceMode(e.target.value)}
                  className="sr-only"
                />
                <Layers className="w-5 h-5" style={{ color: sourceMode === 'topic' ? 'var(--accent-400)' : 'var(--text-2)' }} />
                <div>
                  <div className="font-medium" style={{ color: sourceMode === 'topic' ? 'var(--accent-300)' : 'var(--text-1)' }}>按 Topic</div>
                  <div className="text-xs" style={{ color: 'var(--text-2)' }}>使用整个 Topic 的卡片</div>
                </div>
              </label>

              <label className="flex-1 flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all" style={{
                border: sourceMode === 'manual' ? '2px solid var(--accent-500)' : '2px solid var(--stroke-0)',
                background: sourceMode === 'manual' ? 'rgba(37,99,235,0.04)' : 'transparent',
              }}>
                <input
                  type="radio"
                  name="sourceMode"
                  value="manual"
                  checked={sourceMode === 'manual'}
                  onChange={(e) => setSourceMode(e.target.value)}
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
              <div className="px-4 py-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--stroke-0)' }}>
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

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={handleSuggestHypothesis}
              disabled={loading || (sourceMode === 'topic' ? !selectedTopicId : selectedCount === 0)}
              className="flex items-center gap-2 px-4 py-2.5 font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              style={{ background: 'rgba(24,24,27,0.06)', color: 'var(--text-0)' }}
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
              disabled={loading || !hypothesis.trim() || (sourceMode === 'topic' ? !selectedTopicId : selectedCount === 0)}
              className="flex items-center gap-2 px-4 py-2.5 font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              style={{ background: 'var(--accent-500)', color: 'white' }}
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
                <div className="mb-6 p-4 rounded-xl" style={{ background: 'rgba(24,24,27,0.03)', border: '1px solid var(--stroke-0)' }}>
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
