import { useEffect, useState } from 'react';
import {
  Settings2,
  Save,
  RotateCcw,
  Lock,
  Unlock,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  CheckCircle,
  Code,
  FileText,
  Search,
  FlaskConical,
  Image,
  Sparkles,
} from 'lucide-react';
import { promptsApi } from '../lib/api';
import { useUIStore } from '../lib/store';

// Prompt 类型图标映射
const PROMPT_ICONS = {
  vision_card_generator: Image,
  search_agent: Search,
  hypothesis_suggest: FlaskConical,
  full_document_generator: FileText,
  highlight_summarizer: Sparkles,
  hypothesis_evaluator: FlaskConical,
  document_storyline: FileText,
};

// Prompt 类型颜色映射
const PROMPT_COLORS = {
  inline: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  stored: 'bg-slate-100 text-slate-600 border-slate-200',
};

/**
 * 单个 Prompt 编辑卡片
 */
function PromptCard({ prompt, onSave, saving }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [editedTemplate, setEditedTemplate] = useState(prompt.template || '');
  const [hasChanges, setHasChanges] = useState(false);

  const Icon = PROMPT_ICONS[prompt.id] || Code;
  const isEditable = prompt.editable && prompt.type === 'inline';

  // 检测是否有未保存的更改
  useEffect(() => {
    if (prompt.template) {
      setHasChanges(editedTemplate !== prompt.template);
    }
  }, [editedTemplate, prompt.template]);

  // 重置为原始内容
  const handleReset = () => {
    setEditedTemplate(prompt.template || '');
    setHasChanges(false);
  };

  // 保存更改
  const handleSave = async () => {
    await onSave(prompt.id, editedTemplate);
    setHasChanges(false);
  };

  // 高亮显示模板变量
  const renderTemplateWithHighlights = (template) => {
    if (!template) return null;

    // 匹配 {{VAR_NAME}} 格式的变量
    const parts = template.split(/(\{\{[A-Z_]+\}\})/g);

    return parts.map((part, index) => {
      if (part.match(/^\{\{[A-Z_]+\}\}$/)) {
        return (
          <span
            key={index}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 bg-blue-100 text-blue-700 rounded text-xs font-mono border border-blue-200"
            title="锁定变量 - 不可删除"
          >
            <Lock className="w-3 h-3" />
            {part}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="bg-white rounded-xl border border-surface-100 overflow-hidden">
      {/* 头部 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-surface-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isEditable ? 'bg-emerald-50' : 'bg-slate-50'}`}>
            <Icon className={`w-5 h-5 ${isEditable ? 'text-emerald-600' : 'text-slate-500'}`} />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-surface-900">{prompt.name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${PROMPT_COLORS[prompt.type]}`}>
                {prompt.type === 'inline' ? '可编辑' : 'Stored'}
              </span>
              {hasChanges && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                  未保存
                </span>
              )}
            </div>
            <p className="text-xs text-surface-500 mt-0.5">{prompt.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEditable ? (
            <Unlock className="w-4 h-4 text-emerald-500" />
          ) : (
            <Lock className="w-4 h-4 text-slate-400" />
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
          {/* Stored Prompt：只显示 ID */}
          {prompt.type === 'stored' && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-surface-700 mb-2">
                OpenAI Stored Prompt ID
              </label>
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <Code className="w-4 h-4 text-slate-500" />
                <code className="text-sm text-slate-700 font-mono">{prompt.prompt_id}</code>
              </div>
              <p className="text-xs text-surface-400 mt-2">
                此 Prompt 存储在 OpenAI 服务器上，无法在此编辑。如需修改，请前往 OpenAI Platform。
              </p>
            </div>
          )}

          {/* Inline Prompt：可编辑 */}
          {prompt.type === 'inline' && (
            <div className="mt-4 space-y-4">
              {/* 锁定变量说明 */}
              {prompt.locked_vars && Object.keys(prompt.locked_vars).length > 0 && (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-1">
                    <Lock className="w-4 h-4" />
                    锁定变量（不可删除）
                  </h4>
                  <div className="space-y-1">
                    {Object.keys(prompt.locked_vars).map((varName) => (
                      <div key={varName} className="text-xs text-blue-700 font-mono">
                        {`{{${varName}}}`}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-blue-600 mt-2">
                    这些变量确保输出格式正确，模板中必须包含它们。
                  </p>
                </div>
              )}

              {/* 输出字段说明 */}
              {prompt.output_fields && prompt.output_fields.length > 0 && (
                <div className="p-3 bg-surface-50 rounded-lg border border-surface-200">
                  <h4 className="text-sm font-medium text-surface-700 mb-2">
                    期望输出字段
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {prompt.output_fields.map((field) => (
                      <span
                        key={field}
                        className="text-xs px-2 py-1 bg-white rounded border border-surface-200 font-mono"
                      >
                        {field}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Template 编辑器 */}
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">
                  Prompt Template
                </label>
                <textarea
                  value={editedTemplate}
                  onChange={(e) => setEditedTemplate(e.target.value)}
                  rows={12}
                  className="w-full px-4 py-3 bg-surface-50 border border-surface-200 rounded-xl text-surface-900 font-mono text-sm leading-relaxed input-focus resize-y"
                  placeholder="输入 prompt 内容..."
                />
              </div>

              {/* 预览：高亮显示变量 */}
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-2">
                  预览（变量高亮）
                </label>
                <div className="p-4 bg-white rounded-xl border border-surface-200 text-sm whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                  {renderTemplateWithHighlights(editedTemplate)}
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={handleReset}
                  disabled={!hasChanges || saving}
                  className="flex items-center gap-2 px-4 py-2 text-surface-600 hover:bg-surface-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-4 h-4" />
                  重置
                </button>
                <button
                  onClick={handleSave}
                  disabled={!hasChanges || saving}
                  className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  保存更改
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Prompts 管理页面
 */
function PromptsPage() {
  const { showToast } = useUIStore();

  const [prompts, setPrompts] = useState([]);
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // 加载 prompts
  useEffect(() => {
    loadPrompts();
  }, []);

  const loadPrompts = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await promptsApi.list();
      if (response.ok) {
        setPrompts(response.prompts || []);
        setMetadata(response.metadata || null);
      } else {
        const errorMsg = response.error || response.message || response.detail || '加载失败';
        throw new Error(errorMsg);
      }
    } catch (err) {
      console.error('加载 prompts 失败:', err);
      // 提取更详细的错误信息
      let errorMessage = err.message || '加载失败';
      if (err.data) {
        errorMessage = err.data.message || err.data.error || err.data.detail || errorMessage;
      }
      if (err.status === 401) {
        errorMessage = '未登录或登录已过期，请重新登录';
      } else if (err.status === 404) {
        errorMessage = 'API 端点不存在，请检查后端服务';
      } else if (err.status === 500) {
        errorMessage = `服务器错误: ${errorMessage}`;
      }
      setError(errorMessage);
      showToast(`加载 Prompts 失败: ${errorMessage}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // 保存 prompt
  const handleSave = async (id, template) => {
    setSaving(true);

    try {
      const response = await promptsApi.update(id, template);
      if (response.ok) {
        // 更新本地状态
        setPrompts((prev) =>
          prev.map((p) => (p.id === id ? { ...p, template } : p))
        );
        showToast('保存成功', 'success');
      } else {
        throw new Error(response.error || response.message || '保存失败');
      }
    } catch (err) {
      console.error('保存 prompt 失败:', err);
      showToast(err.message || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 分类：可编辑 vs 只读
  const editablePrompts = prompts.filter((p) => p.editable && p.type === 'inline');
  const storedPrompts = prompts.filter((p) => p.type === 'stored');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 flex items-center gap-2">
            <Settings2 className="w-7 h-7 text-primary-500" />
            Prompt 管理
          </h1>
          <p className="text-surface-500 mt-1">
            查看和编辑 AI Agent 的 System Prompts
          </p>
        </div>
        {metadata?.last_updated && (
          <div className="text-xs text-surface-400">
            上次更新: {new Date(metadata.last_updated).toLocaleString('zh-CN')}
          </div>
        )}
      </div>

      {/* 加载状态 */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          <span className="ml-3 text-surface-500">加载中...</span>
        </div>
      )}

      {/* 错误状态 */}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-16 bg-red-50 rounded-xl border border-red-200">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <p className="text-red-700 font-medium">{error}</p>
          <button
            onClick={loadPrompts}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            重试
          </button>
        </div>
      )}

      {/* 成功加载后显示内容 */}
      {!loading && !error && (
        <>
          {/* 可编辑 Prompts */}
          <div>
            <h2 className="text-lg font-semibold text-surface-900 mb-4 flex items-center gap-2">
              <Unlock className="w-5 h-5 text-emerald-500" />
              可编辑 Prompts
              <span className="text-sm font-normal text-surface-500">
                ({editablePrompts.length})
              </span>
            </h2>
            <div className="space-y-4">
              {editablePrompts.map((prompt) => (
                <PromptCard
                  key={prompt.id}
                  prompt={prompt}
                  onSave={handleSave}
                  saving={saving}
                />
              ))}
            </div>
          </div>

          {/* Stored Prompts */}
          <div>
            <h2 className="text-lg font-semibold text-surface-900 mb-4 flex items-center gap-2">
              <Lock className="w-5 h-5 text-slate-500" />
              Stored Prompts（只读）
              <span className="text-sm font-normal text-surface-500">
                ({storedPrompts.length})
              </span>
            </h2>
            <div className="space-y-4">
              {storedPrompts.map((prompt) => (
                <PromptCard
                  key={prompt.id}
                  prompt={prompt}
                  onSave={handleSave}
                  saving={saving}
                />
              ))}
            </div>
          </div>

          {/* 使用提示 */}
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
            <h3 className="font-medium text-amber-800 mb-2 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              使用提示
            </h3>
            <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
              <li>
                <strong>锁定变量</strong>（如 {`{{OUTPUT_FORMAT}}`}）不可删除，确保 AI 输出格式正确
              </li>
              <li>
                修改后需要点击"保存更改"，更改会立即生效
              </li>
              <li>
                Stored Prompts 存储在 OpenAI 服务器上，需在 OpenAI Platform 编辑
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

export default PromptsPage;

