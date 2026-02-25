import { useState, useMemo } from 'react';
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

/**
 * 假设验证功能组件
 * 支持：手动输入假设（单个）、AI 提炼假设、验证假设
 * 证据来源：按 Topic 或手动勾选卡片（二选一）
 */
function HypothesisSection({ topics = [], selectedCardIds, cards = [], onClearSelection }) {
  const { showToast } = useUIStore();

  // UI 状态
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');

  // 数据状态
  const [hypothesis, setHypothesis] = useState(''); // 单个假设
  const [evaluationResult, setEvaluationResult] = useState(null);

  // 来源选择模式
  const [sourceMode, setSourceMode] = useState('topic'); // 'topic' | 'manual'
  const [selectedTopicTitle, setSelectedTopicTitle] = useState('');

  // 选中的卡片数量
  const selectedCount = selectedCardIds?.size || 0;

  // 从选中的卡片推断 topic
  const inferredTopicFromCards = useMemo(() => {
    if (selectedCount === 0) return null;
    const topicCounts = {};
    cards.forEach(card => {
      if (selectedCardIds.has(card.id) && card.topic_title) {
        topicCounts[card.topic_title] = (topicCounts[card.topic_title] || 0) + 1;
      }
    });
    const sorted = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || null;
  }, [selectedCardIds, cards, selectedCount]);

  // AI 提炼假设
  const handleSuggestHypothesis = async () => {
    setLoading(true);
    setLoadingText('AI 正在分析卡片...');

    try {
      const params = {};
      
      if (sourceMode === 'topic' && selectedTopicTitle) {
        params.topic_title = selectedTopicTitle;
      } else if (sourceMode === 'manual' && selectedCount > 0) {
        params.card_ids = Array.from(selectedCardIds);
      } else {
        showToast('请先选择 Topic 或勾选卡片', 'error');
        setLoading(false);
        return;
      }

      const response = await hypothesesApi.suggest(params);

      if (response.ok && response.hypotheses?.length > 0) {
        // 取第一个建议的假设
        setHypothesis(response.hypotheses[0]);
        showToast(`已生成假设建议（共 ${response.hypotheses.length} 条，已填入第一条）`, 'success');
      } else {
        throw new Error(response.error || '生成假设失败');
      }
    } catch (error) {
      console.error('AI 提炼假设失败:', error);
      showToast(error.message || 'AI 提炼假设失败', 'error');
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  // 验证假设
  const handleEvaluate = async () => {
    if (!hypothesis.trim()) {
      showToast('请先输入假设', 'error');
      return;
    }

    // 验证来源
    if (sourceMode === 'topic' && !selectedTopicTitle) {
      showToast('请先选择一个 Topic', 'error');
      return;
    }
    if (sourceMode === 'manual' && selectedCount === 0) {
      showToast('请先勾选卡片作为证据', 'error');
      return;
    }

    setLoading(true);
    setLoadingText('AI 正在验证假设（可能需要 30 秒）...');
    setEvaluationResult(null);

    try {
      const params = {
        hypotheses: [hypothesis.trim()],
      };

      if (sourceMode === 'topic') {
        params.topic_title = selectedTopicTitle;
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
      console.error('假设验证失败:', error);
      showToast(error.message || '假设验证失败', 'error');
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  // 渲染证据项
  const renderEvidenceItem = (evidence, type) => {
    const colors = {
      support: { background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)' },
      oppose: { background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.2)' },
      mixed: { background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' },
    };
    const iconColors = { support: '#34D399', oppose: '#FB7185', mixed: '#FBBF24' };
    const icons = {
      support: <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: iconColors.support }} />,
      oppose: <XCircle className="w-4 h-4 shrink-0" style={{ color: iconColors.oppose }} />,
      mixed: <HelpCircle className="w-4 h-4 shrink-0" style={{ color: iconColors.mixed }} />,
    };

    return (
      <div key={evidence.card_id} className="p-3 rounded-lg mb-2" style={colors[type]}>
        <div className="flex items-start gap-2">
          {icons[type]}
          <div className="flex-1 min-w-0">
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-1)' }}>
              {evidence.rationale}
            </p>
            <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: 'var(--text-2)' }}>
              <FileText className="w-3 h-3" />
              <span className="truncate">卡片: {evidence.card_id}</span>
              {evidence.strength && (
                <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'rgba(0,0,0,0.2)', color: 'var(--text-2)' }}>
                  {evidence.strength}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 渲染评估结果
  const renderEvaluation = (evaluation) => {
    const verdictStyles = {
      strong_support: { color: '#34D399', background: 'rgba(52,211,153,0.1)' },
      leaning_support: { color: '#34D399', background: 'rgba(52,211,153,0.08)' },
      supported: { color: '#34D399', background: 'rgba(52,211,153,0.08)' },
      rejected: { color: '#FB7185', background: 'rgba(251,113,133,0.08)' },
      strong_against: { color: '#FB7185', background: 'rgba(251,113,133,0.1)' },
      leaning_against: { color: '#FB7185', background: 'rgba(251,113,133,0.08)' },
      mixed_or_uncertain: { color: '#FBBF24', background: 'rgba(251,191,36,0.1)' },
      inconclusive: { color: '#FBBF24', background: 'rgba(251,191,36,0.08)' },
      partially_supported: { color: 'var(--accent-300)', background: 'rgba(99,102,241,0.08)' },
    };
    const verdictLabels = {
      strong_support: '✅ 强力支持',
      leaning_support: '✅ 倾向支持',
      supported: '✅ 支持',
      rejected: '❌ 被否定',
      strong_against: '❌ 强力反对',
      leaning_against: '❌ 倾向反对',
      mixed_or_uncertain: '⚖️ 存在争议',
      inconclusive: '❓ 证据不足',
      partially_supported: '⚖️ 部分支持',
    };

    const verdict = evaluation.overall_judgement || evaluation.verdict;
    const vStyle = verdictStyles[verdict] || { color: 'var(--text-1)', background: 'rgba(0,0,0,0.1)' };

    return (
      <div className="space-y-4">
        <div className="p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--stroke-0)' }}>
          <p className="font-medium" style={{ color: 'var(--text-0)' }}>{evaluation.hypothesis_text}</p>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 rounded-full text-sm font-medium" style={vStyle}>
            {verdictLabels[verdict] || verdict}
          </span>
          {evaluation.net_confidence !== undefined && (
            <span className="text-sm" style={{ color: 'var(--text-2)' }}>
              置信度: {(evaluation.net_confidence * 100).toFixed(0)}%
            </span>
          )}
          {evaluation.risk_level && (
            <span className="text-xs px-2 py-0.5 rounded" style={{
              background: evaluation.risk_level === 'high' ? 'rgba(251,113,133,0.1)' :
                evaluation.risk_level === 'medium' ? 'rgba(251,191,36,0.1)' : 'rgba(52,211,153,0.1)',
              color: evaluation.risk_level === 'high' ? '#FB7185' :
                evaluation.risk_level === 'medium' ? '#FBBF24' : '#34D399',
            }}>
              风险: {evaluation.risk_level}
            </span>
          )}
        </div>

        {evaluation.supporting_evidence?.length > 0 && (
          <div>
            <h5 className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: '#34D399' }}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              支持证据 ({evaluation.supporting_evidence.length})
            </h5>
            {evaluation.supporting_evidence.map(e => renderEvidenceItem(e, 'support'))}
          </div>
        )}
        {evaluation.opposing_evidence?.length > 0 && (
          <div>
            <h5 className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: '#FB7185' }}>
              <XCircle className="w-3.5 h-3.5" />
              反对证据 ({evaluation.opposing_evidence.length})
            </h5>
            {evaluation.opposing_evidence.map(e => renderEvidenceItem(e, 'oppose'))}
          </div>
        )}
        {evaluation.mixed_evidence?.length > 0 && (
          <div>
            <h5 className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: '#FBBF24' }}>
              <HelpCircle className="w-3.5 h-3.5" />
              混合证据 ({evaluation.mixed_evidence.length})
            </h5>
            {evaluation.mixed_evidence.map(e => renderEvidenceItem(e, 'mixed'))}
          </div>
        )}

        {evaluation.gaps?.length > 0 && (
          <div className="mt-4 p-3 rounded-lg" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)' }}>
            <h5 className="text-xs font-semibold mb-2" style={{ color: '#FBBF24' }}>📋 证据缺口</h5>
            <ul className="space-y-1">
              {evaluation.gaps.map((gap, i) => (
                <li key={i} className="text-sm flex items-start gap-2" style={{ color: 'var(--text-1)' }}>
                  <span className="mt-1" style={{ color: '#FBBF24' }}>•</span>
                  <span>{gap.description}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
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
          <div className="p-2 rounded-lg" style={{ background: 'rgba(168,85,247,0.1)' }}>
            <FlaskConical className="w-5 h-5" style={{ color: '#A855F7' }} />
          </div>
          <div className="text-left">
            <h3 className="font-semibold" style={{ color: 'var(--text-0)' }}>假设验证</h3>
            <p className="text-xs" style={{ color: 'var(--text-2)' }}>
              输入假设，用卡片证据验证真伪
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--accent-300)' }}>
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
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-1)' }}>
              输入你的假设
            </label>
            <input
              type="text"
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              placeholder="例如：AI 技术将在 2025 年前显著改变办公效率"
              disabled={loading}
              className="w-full px-4 py-3 rounded-xl input-focus disabled:opacity-50"
              style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)', color: 'var(--text-0)' }}
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium mb-3" style={{ color: 'var(--text-1)' }}>
              选择证据来源
            </label>
            <div className="flex gap-4 mb-4">
              <label className="flex-1 flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all" style={{
                border: sourceMode === 'topic' ? '2px solid var(--accent-400)' : '2px solid var(--stroke-0)',
                background: sourceMode === 'topic' ? 'rgba(99,102,241,0.08)' : 'transparent',
              }}>
                <input type="radio" name="sourceMode" value="topic" checked={sourceMode === 'topic'} onChange={(e) => setSourceMode(e.target.value)} className="sr-only" />
                <Layers className="w-5 h-5" style={{ color: sourceMode === 'topic' ? 'var(--accent-400)' : 'var(--text-2)' }} />
                <div>
                  <div className="font-medium" style={{ color: sourceMode === 'topic' ? 'var(--accent-300)' : 'var(--text-1)' }}>按 Topic</div>
                  <div className="text-xs" style={{ color: 'var(--text-2)' }}>使用整个 Topic 的卡片</div>
                </div>
              </label>

              <label className="flex-1 flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all" style={{
                border: sourceMode === 'manual' ? '2px solid var(--accent-400)' : '2px solid var(--stroke-0)',
                background: sourceMode === 'manual' ? 'rgba(99,102,241,0.08)' : 'transparent',
              }}>
                <input type="radio" name="sourceMode" value="manual" checked={sourceMode === 'manual'} onChange={(e) => setSourceMode(e.target.value)} className="sr-only" />
                <MousePointer2 className="w-5 h-5" style={{ color: sourceMode === 'manual' ? 'var(--accent-400)' : 'var(--text-2)' }} />
                <div>
                  <div className="font-medium" style={{ color: sourceMode === 'manual' ? 'var(--accent-300)' : 'var(--text-1)' }}>手动勾选</div>
                  <div className="text-xs" style={{ color: 'var(--text-2)' }}>在下方卡片列表勾选</div>
                </div>
              </label>
            </div>

            {sourceMode === 'topic' ? (
              <div className="relative">
                <select
                  value={selectedTopicTitle}
                  onChange={(e) => setSelectedTopicTitle(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-2.5 rounded-xl appearance-none cursor-pointer disabled:opacity-50"
                  style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)', color: 'var(--text-0)' }}
                >
                  <option value="">选择 Topic...</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.title}>{topic.title}</option>
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
                  <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                    请在下方卡片列表中勾选要作为证据的卡片
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={handleSuggestHypothesis}
              disabled={loading || (sourceMode === 'topic' ? !selectedTopicTitle : selectedCount === 0)}
              className="flex items-center gap-2 px-4 py-2.5 font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'rgba(168,85,247,0.1)', color: '#A855F7' }}
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
              disabled={loading || !hypothesis.trim() || (sourceMode === 'topic' ? !selectedTopicTitle : selectedCount === 0)}
              className="flex items-center gap-2 px-4 py-2.5 font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'var(--accent-600)', color: 'white' }}
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
                <div className="mb-6 p-4 rounded-xl" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.15)' }}>
                  <h4 className="font-semibold mb-2" style={{ color: 'var(--text-0)' }}>📊 综合分析</h4>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-1)' }}>
                    {evaluationResult.global_summary}
                  </p>
                </div>
              )}

              {evaluationResult.evaluations?.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-4" style={{ color: 'var(--text-0)' }}>假设评估结果</h4>
                  {evaluationResult.evaluations.map((evaluation, i) => (
                    <div key={evaluation.hypothesis_id || i}>
                      {renderEvaluation(evaluation)}
                    </div>
                  ))}
                </div>
              )}

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
