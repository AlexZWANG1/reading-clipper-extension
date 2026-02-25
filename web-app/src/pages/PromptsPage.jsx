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

// Prompt 类型颜色映射 — no longer needed with inline styles

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
            className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-xs font-mono"
            style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent-300)', border: '1px solid rgba(99,102,241,0.2)' }}
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
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)' }}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-5 py-4 flex items-center justify-between transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isEditable ? 'bg-emerald-50' : 'bg-slate-50'}`}>
            <Icon className={`w-5 h-5 ${isEditable ? 'text-emerald-600' : 'text-slate-500'}`} />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold" style={{ color: 'var(--text-0)' }}>{prompt.name}</h3>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: isEditable ? 'rgba(52,211,153,0.1)' : 'rgba(148,163,184,0.1)', color: isEditable ? '#34D399' : 'var(--text-2)', border: '1px solid ' + (isEditable ? 'rgba(52,211,153,0.2)' : 'var(--stroke-0)') }}>
                {prompt.type === 'inline' ? '可编辑' : 'Stored'}
              </span>
              {hasChanges && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,0.1)', color: '#FBBF24', border: '1px solid rgba(251,191,36,0.2)' }}>
                  未保存
                </span>
              )}
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>{prompt.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEditable ? (
            <Unlock className="w-4 h-4" style={{ color: '#34D399' }} />
          ) : (
            <Lock className="w-4 h-4" style={{ color: 'var(--text-2)' }} />
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
          {prompt.type === 'stored' && (
            <div className="mt-4">
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-1)' }}>
                OpenAI Stored Prompt ID
              </label>
              <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--stroke-0)' }}>
                <Code className="w-4 h-4" style={{ color: 'var(--text-2)' }} />
                <code className="text-sm font-mono" style={{ color: 'var(--text-1)' }}>{prompt.prompt_id}</code>
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--text-2)' }}>
                此 Prompt 存储在 OpenAI 服务器上，无法在此编辑。如需修改，请前往 OpenAI Platform。
              </p>
            </div>
          )}

          {prompt.type === 'inline' && (
            <div className="mt-4 space-y-4">
              {prompt.locked_vars && Object.keys(prompt.locked_vars).length > 0 && (
                <div className="p-3 rounded-lg" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-1" style={{ color: 'var(--accent-300)' }}>
                    <Lock className="w-4 h-4" />
                    锁定变量（不可删除）
                  </h4>
                  <div className="space-y-1">
                    {Object.keys(prompt.locked_vars).map((varName) => (
                      <div key={varName} className="text-xs font-mono" style={{ color: 'var(--accent-400)' }}>
                        {`{{${varName}}}`}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs mt-2" style={{ color: 'var(--text-2)' }}>
                    这些变量确保输出格式正确，模板中必须包含它们。
                  </p>
                </div>
              )}

              {prompt.output_fields && prompt.output_fields.length > 0 && (
                <div className="p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--stroke-0)' }}>
                  <h4 className="text-sm font-medium mb-2" style={{ color: 'var(--text-1)' }}>
                    期望输出字段
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {prompt.output_fields.map((field) => (
                      <span key={field} className="text-xs px-2 py-1 rounded font-mono" style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)', color: 'var(--text-1)' }}>
                        {field}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-1)' }}>
                  Prompt Template
                </label>
                <textarea
                  value={editedTemplate}
                  onChange={(e) => setEditedTemplate(e.target.value)}
                  rows={12}
                  className="w-full px-4 py-3 rounded-xl font-mono text-sm leading-relaxed input-focus resize-y"
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--stroke-0)', color: 'var(--text-0)' }}
                  placeholder="输入 prompt 内容..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-1)' }}>
                  预览（变量高亮）
                </label>
                <div className="p-4 rounded-xl text-sm whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--stroke-0)', color: 'var(--text-1)' }}>
                  {renderTemplateWithHighlights(editedTemplate)}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={handleReset}
                  disabled={!hasChanges || saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ color: 'var(--text-1)' }}
                >
                  <RotateCcw className="w-4 h-4" />
                  重置
                </button>
                <button
                  onClick={handleSave}
                  disabled={!hasChanges || saving}
                  className="flex items-center gap-2 px-4 py-2.5 font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'var(--accent-600)', color: 'white' }}
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-0)' }}>
            <Settings2 className="w-7 h-7" style={{ color: 'var(--accent-400)' }} />
            Prompt 管理
          </h1>
          <p className="mt-1" style={{ color: 'var(--text-2)' }}>
            查看和编辑 AI Agent 的 System Prompts
          </p>
        </div>
        {metadata?.last_updated && (
          <div className="text-xs" style={{ color: 'var(--text-2)' }}>
            上次更新: {new Date(metadata.last_updated).toLocaleString('zh-CN')}
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-400)' }} />
          <span className="ml-3" style={{ color: 'var(--text-2)' }}>加载中...</span>
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl" style={{ background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.2)' }}>
          <AlertCircle className="w-12 h-12 mb-4" style={{ color: '#FB7185' }} />
          <p className="font-medium" style={{ color: '#FB7185' }}>{error}</p>
          <button
            onClick={loadPrompts}
            className="mt-4 px-4 py-2 rounded-lg transition-colors"
            style={{ background: 'rgba(251,113,133,0.15)', color: '#FB7185' }}
          >
            重试
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-0)' }}>
              <Unlock className="w-5 h-5" style={{ color: '#34D399' }} />
              可编辑 Prompts
              <span className="text-sm font-normal" style={{ color: 'var(--text-2)' }}>
                ({editablePrompts.length})
              </span>
            </h2>
            <div className="space-y-4">
              {editablePrompts.map((prompt) => (
                <PromptCard key={prompt.id} prompt={prompt} onSave={handleSave} saving={saving} />
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-0)' }}>
              <Lock className="w-5 h-5" style={{ color: 'var(--text-2)' }} />
              Stored Prompts（只读）
              <span className="text-sm font-normal" style={{ color: 'var(--text-2)' }}>
                ({storedPrompts.length})
              </span>
            </h2>
            <div className="space-y-4">
              {storedPrompts.map((prompt) => (
                <PromptCard key={prompt.id} prompt={prompt} onSave={handleSave} saving={saving} />
              ))}
            </div>
          </div>

          <div className="p-4 rounded-xl" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)' }}>
            <h3 className="font-medium mb-2 flex items-center gap-2" style={{ color: '#FBBF24' }}>
              <AlertCircle className="w-5 h-5" />
              使用提示
            </h3>
            <ul className="text-sm space-y-1 list-disc list-inside" style={{ color: 'var(--text-1)' }}>
              <li>
                锁定变量（如 {`{{OUTPUT_FORMAT}}`}）不可删除，确保 AI 输出格式正确
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

