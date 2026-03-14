import { useState } from 'react';
import { Sparkles, Loader2, AlertCircle, Send, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import { materialsApi } from '../../lib/api';

export default function AIPanel({ materialId, onHighlightQuote }) {
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState(null);

  const [qaHistory, setQaHistory] = useState([]);
  const [qaInput, setQaInput] = useState('');
  const [qaLoading, setQaLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('insights');

  const handleGenerateInsights = async () => {
    try {
      setInsightsLoading(true);
      setInsightsError(null);
      const data = await materialsApi.analyze(materialId, 'summary');
      setInsights(data.result);
    } catch (err) {
      console.error('AI insights failed:', err);
      setInsightsError(err.message || 'AI 分析失败');
    } finally {
      setInsightsLoading(false);
    }
  };

  const handleAskQuestion = async () => {
    const question = qaInput.trim();
    if (!question || qaLoading) return;

    setQaInput('');
    setQaHistory(prev => [...prev, { role: 'user', content: question }]);
    setQaLoading(true);

    try {
      const data = await materialsApi.analyze(materialId, 'qa', question);
      setQaHistory(prev => [...prev, { role: 'assistant', ...data.result }]);
    } catch (err) {
      console.error('AI Q&A failed:', err);
      setQaHistory(prev => [...prev, { role: 'error', content: err.message || 'AI 回答失败' }]);
    } finally {
      setQaLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Tab header */}
      <div className="flex border-b border-gray-200 flex-shrink-0">
        <button
          onClick={() => setActiveTab('insights')}
          className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'insights'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            洞察
          </span>
        </button>
        <button
          onClick={() => setActiveTab('qa')}
          className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'qa'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" />
            问答
          </span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'insights' ? (
          <InsightsTab
            insights={insights}
            loading={insightsLoading}
            error={insightsError}
            onGenerate={handleGenerateInsights}
            onHighlightQuote={onHighlightQuote}
          />
        ) : (
          <QATab
            history={qaHistory}
            loading={qaLoading}
            input={qaInput}
            onInputChange={setQaInput}
            onSubmit={handleAskQuestion}
            onHighlightQuote={onHighlightQuote}
          />
        )}
      </div>
    </div>
  );
}

function InsightsTab({ insights, loading, error, onGenerate, onHighlightQuote }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        <p className="text-sm text-gray-500">AI 正在分析文章...</p>
        <p className="text-xs text-gray-400">这可能需要 10-30 秒</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <AlertCircle className="w-6 h-6 text-red-400" />
        <p className="text-sm text-red-500">{error}</p>
        <button
          onClick={onGenerate}
          className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          重试
        </button>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-indigo-500" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700">AI 文章分析</p>
          <p className="text-xs text-gray-400 mt-1">生成摘要、关键论点和探索问题</p>
        </div>
        <button
          onClick={onGenerate}
          className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          生成洞察
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      {/* Summary */}
      {insights.summary && (
        <section>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">摘要</h4>
          <p className="text-sm text-gray-700 leading-relaxed">{insights.summary}</p>
        </section>
      )}

      {/* Key points */}
      {insights.key_points?.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">关键论点</h4>
          <div className="space-y-3">
            {insights.key_points.map((point, i) => (
              <KeyPointCard key={i} point={point} onHighlightQuote={onHighlightQuote} />
            ))}
          </div>
        </section>
      )}

      {/* Questions */}
      {insights.questions?.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">值得探索的问题</h4>
          <ul className="space-y-1.5">
            {insights.questions.map((q, i) => (
              <li key={i} className="text-sm text-gray-600 flex gap-2">
                <span className="text-indigo-400 flex-shrink-0">?</span>
                {q}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Regenerate */}
      <button
        onClick={onGenerate}
        className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        重新生成
      </button>
    </div>
  );
}

function KeyPointCard({ point, onHighlightQuote }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <p className="text-sm text-gray-800 font-medium">{point.claim}</p>
      {point.significance && (
        <p className="text-xs text-gray-500 mt-1">{point.significance}</p>
      )}
      {point.quote && (
        <div className="mt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            原文引用
          </button>
          {expanded && (
            <blockquote
              onClick={() => onHighlightQuote?.(point.quote)}
              className="mt-1.5 pl-3 border-l-2 border-indigo-300 text-xs text-gray-600 italic cursor-pointer hover:bg-indigo-50 transition-colors rounded-r py-1 pr-2"
              title="点击高亮原文"
            >
              "{point.quote}"
            </blockquote>
          )}
        </div>
      )}
    </div>
  );
}

function QATab({ history, loading, input, onInputChange, onSubmit, onHighlightQuote }) {
  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {history.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <MessageSquare className="w-8 h-8 text-gray-300" />
            <p className="text-sm text-gray-400 text-center">
              向 AI 提问关于这篇文章的问题
            </p>
          </div>
        )}

        {history.map((msg, i) => (
          <QAMessage key={i} message={msg} onHighlightQuote={onHighlightQuote} />
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            AI 正在思考...
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-200 flex-shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && onSubmit()}
            placeholder="输入你的问题..."
            disabled={loading}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
          />
          <button
            onClick={onSubmit}
            disabled={loading || !input.trim()}
            className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function QAMessage({ message, onHighlightQuote }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-indigo-600 text-white px-3 py-2 rounded-lg rounded-br-sm text-sm max-w-[85%]">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === 'error') {
    return (
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-red-500">{message.content}</p>
      </div>
    );
  }

  // assistant
  return (
    <div className="space-y-2">
      <div className="bg-gray-50 border border-gray-100 px-3 py-2 rounded-lg rounded-bl-sm text-sm text-gray-700 max-w-[95%]">
        {message.answer}
      </div>
      {message.sources?.length > 0 && (
        <div className="space-y-1 pl-2">
          {message.sources.map((src, i) => (
            <blockquote
              key={i}
              onClick={() => onHighlightQuote?.(src.quote)}
              className="pl-2 border-l-2 border-indigo-200 text-xs text-gray-500 italic cursor-pointer hover:bg-indigo-50 transition-colors rounded-r py-0.5 pr-1"
              title="点击高亮原文"
            >
              "{src.quote}"
            </blockquote>
          ))}
        </div>
      )}
    </div>
  );
}
