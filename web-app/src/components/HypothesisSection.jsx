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
      support: 'border-green-300 bg-green-50',
      oppose: 'border-red-300 bg-red-50',
      mixed: 'border-yellow-300 bg-yellow-50',
    };
    const icons = {
      support: <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />,
      oppose: <XCircle className="w-4 h-4 text-red-600 shrink-0" />,
      mixed: <HelpCircle className="w-4 h-4 text-yellow-600 shrink-0" />,
    };

    return (
      <div
        key={evidence.card_id}
        className={`p-3 rounded-lg border ${colors[type]} mb-2`}
      >
        <div className="flex items-start gap-2">
          {icons[type]}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-surface-700 leading-relaxed">
              {evidence.rationale}
            </p>
            <div className="flex items-center gap-2 mt-2 text-xs text-surface-500">
              <FileText className="w-3 h-3" />
              <span className="truncate">卡片: {evidence.card_id}</span>
              {evidence.strength && (
                <span className="px-1.5 py-0.5 bg-surface-200 rounded text-[10px]">
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
    const verdictColors = {
      strong_support: 'text-green-700 bg-green-100',
      leaning_support: 'text-green-600 bg-green-50',
      supported: 'text-green-600 bg-green-50',
      rejected: 'text-red-600 bg-red-50',
      strong_against: 'text-red-700 bg-red-100',
      leaning_against: 'text-red-600 bg-red-50',
      mixed_or_uncertain: 'text-yellow-700 bg-yellow-100',
      inconclusive: 'text-yellow-600 bg-yellow-50',
      partially_supported: 'text-blue-600 bg-blue-50',
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

    return (
      <div className="space-y-4">
        {/* 假设文本 */}
        <div className="p-3 bg-surface-50 rounded-lg border border-surface-200">
          <p className="text-surface-800 font-medium">{evaluation.hypothesis_text}</p>
        </div>

        {/* 结论 */}
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${verdictColors[verdict] || 'text-surface-600 bg-surface-100'}`}>
            {verdictLabels[verdict] || verdict}
          </span>
          {evaluation.net_confidence !== undefined && (
            <span className="text-sm text-surface-500">
              置信度: {(evaluation.net_confidence * 100).toFixed(0)}%
            </span>
          )}
          {evaluation.risk_level && (
            <span className={`text-xs px-2 py-0.5 rounded ${
              evaluation.risk_level === 'high' ? 'bg-red-100 text-red-700' :
              evaluation.risk_level === 'medium' ? 'bg-yellow-100 text-yellow-700' :
              'bg-green-100 text-green-700'
            }`}>
              风险: {evaluation.risk_level}
            </span>
          )}
        </div>

        {/* 证据列表 */}
        {evaluation.supporting_evidence?.length > 0 && (
          <div>
            <h5 className="text-xs font-semibold text-green-700 mb-2 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              支持证据 ({evaluation.supporting_evidence.length})
            </h5>
            {evaluation.supporting_evidence.map(e => renderEvidenceItem(e, 'support'))}
          </div>
        )}
        {evaluation.opposing_evidence?.length > 0 && (
          <div>
            <h5 className="text-xs font-semibold text-red-700 mb-2 flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" />
              反对证据 ({evaluation.opposing_evidence.length})
            </h5>
            {evaluation.opposing_evidence.map(e => renderEvidenceItem(e, 'oppose'))}
          </div>
        )}
        {evaluation.mixed_evidence?.length > 0 && (
          <div>
            <h5 className="text-xs font-semibold text-yellow-700 mb-2 flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5" />
              混合证据 ({evaluation.mixed_evidence.length})
            </h5>
            {evaluation.mixed_evidence.map(e => renderEvidenceItem(e, 'mixed'))}
          </div>
        )}

        {/* 证据缺口 */}
        {evaluation.gaps?.length > 0 && (
          <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <h5 className="text-xs font-semibold text-amber-800 mb-2">📋 证据缺口</h5>
            <ul className="space-y-1">
              {evaluation.gaps.map((gap, i) => (
                <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                  <span className="text-amber-500 mt-1">•</span>
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
    <div className="bg-white rounded-xl border border-surface-100 overflow-hidden mb-6">
      {/* 标题栏 - 可折叠 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-surface-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-50 rounded-lg">
            <FlaskConical className="w-5 h-5 text-purple-600" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-surface-900">假设验证</h3>
            <p className="text-xs text-surface-500">
              输入假设，用卡片证据验证真伪
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <span className="text-xs px-2 py-1 bg-primary-100 text-primary-700 rounded-full">
              已选 {selectedCount} 张卡片
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-surface-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-surface-400" />
          )}
        </div>
      </button>

      {/* 展开内容 */}
      {isExpanded && (
        <div className="px-5 pb-5 border-t border-surface-100">
          {/* 假设输入区 */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-surface-700 mb-2">
              输入你的假设
            </label>
            <input
              type="text"
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              placeholder="例如：AI 技术将在 2025 年前显著改变办公效率"
              disabled={loading}
              className="w-full px-4 py-3 bg-surface-50 border border-surface-200 rounded-xl text-surface-900 placeholder-surface-400 input-focus disabled:opacity-50"
            />
          </div>

          {/* 证据来源选择 */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-surface-700 mb-3">
              选择证据来源
            </label>
            <div className="flex gap-4 mb-4">
              {/* 按 Topic */}
              <label className={`flex-1 flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                sourceMode === 'topic' 
                  ? 'border-primary-400 bg-primary-50' 
                  : 'border-surface-200 hover:border-surface-300'
              }`}>
                <input
                  type="radio"
                  name="sourceMode"
                  value="topic"
                  checked={sourceMode === 'topic'}
                  onChange={(e) => setSourceMode(e.target.value)}
                  className="sr-only"
                />
                <Layers className={`w-5 h-5 ${sourceMode === 'topic' ? 'text-primary-600' : 'text-surface-400'}`} />
                <div>
                  <div className={`font-medium ${sourceMode === 'topic' ? 'text-primary-900' : 'text-surface-700'}`}>
                    按 Topic
                  </div>
                  <div className="text-xs text-surface-500">使用整个 Topic 的卡片</div>
                </div>
              </label>

              {/* 手动勾选 */}
              <label className={`flex-1 flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                sourceMode === 'manual' 
                  ? 'border-primary-400 bg-primary-50' 
                  : 'border-surface-200 hover:border-surface-300'
              }`}>
                <input
                  type="radio"
                  name="sourceMode"
                  value="manual"
                  checked={sourceMode === 'manual'}
                  onChange={(e) => setSourceMode(e.target.value)}
                  className="sr-only"
                />
                <MousePointer2 className={`w-5 h-5 ${sourceMode === 'manual' ? 'text-primary-600' : 'text-surface-400'}`} />
                <div>
                  <div className={`font-medium ${sourceMode === 'manual' ? 'text-primary-900' : 'text-surface-700'}`}>
                    手动勾选
                  </div>
                  <div className="text-xs text-surface-500">在下方卡片列表勾选</div>
                </div>
              </label>
            </div>

            {/* Topic 选择器 或 已选卡片信息 */}
            {sourceMode === 'topic' ? (
              <div className="relative">
                <select
                  value={selectedTopicTitle}
                  onChange={(e) => setSelectedTopicTitle(e.target.value)}
                  disabled={loading}
                  className="w-full px-4 py-2.5 bg-white border border-surface-200 rounded-xl text-surface-900 appearance-none cursor-pointer disabled:opacity-50"
                >
                  <option value="">选择 Topic...</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.title}>
                      {topic.title}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" />
              </div>
            ) : (
              <div className="px-4 py-3 bg-surface-50 rounded-xl border border-surface-200">
                {selectedCount > 0 ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-primary-700 font-medium">{selectedCount}</span>
                      <span className="text-surface-600"> 张卡片已选中</span>
                      {inferredTopicFromCards && (
                        <span className="text-surface-500 text-sm ml-2">
                          (主要来自: {inferredTopicFromCards})
                        </span>
                      )}
                    </div>
                    <button
                      onClick={onClearSelection}
                      className="text-xs text-surface-500 hover:text-surface-700 underline"
                    >
                      清空选择
                    </button>
                  </div>
                ) : (
                  <p className="text-surface-500 text-sm">
                    请在下方卡片列表中勾选要作为证据的卡片
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={handleSuggestHypothesis}
              disabled={loading || (sourceMode === 'topic' ? !selectedTopicTitle : selectedCount === 0)}
              className="flex items-center gap-2 px-4 py-2.5 bg-purple-50 text-purple-700 font-medium rounded-xl hover:bg-purple-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading && loadingText.includes('验证') ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              开始验证
            </button>

            {loading && (
              <span className="flex items-center text-sm text-surface-500">
                {loadingText}
              </span>
            )}
          </div>

          {/* 验证结果 */}
          {evaluationResult && (
            <div className="mt-6 pt-6 border-t border-surface-200">
              {/* 全局摘要 */}
              {evaluationResult.global_summary && (
                <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl">
                  <h4 className="font-semibold text-surface-900 mb-2">📊 综合分析</h4>
                  <p className="text-sm text-surface-700 leading-relaxed">
                    {evaluationResult.global_summary}
                  </p>
                </div>
              )}

              {/* 评估详情 */}
              {evaluationResult.evaluations?.length > 0 && (
                <div>
                  <h4 className="font-semibold text-surface-900 mb-4">假设评估结果</h4>
                  {evaluationResult.evaluations.map((evaluation, i) => (
                    <div key={evaluation.hypothesis_id || i}>
                      {renderEvaluation(evaluation)}
                    </div>
                  ))}
                </div>
              )}

              {/* 使用的卡片数量 */}
              {evaluationResult.used_card_ids?.length > 0 && (
                <div className="mt-4 text-xs text-surface-500">
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
