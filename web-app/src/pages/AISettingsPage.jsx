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
    XCircle,
    Code,
    FileText,
    Search,
    FlaskConical,
    Image,
    Sparkles,
    Key,
    Cpu,
    MessageSquare,
    Zap,
    Database,
} from 'lucide-react';
import { promptsApi, settingsApi } from '../lib/api';
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

// 模型分配总览数据
const MODEL_OVERVIEW = [
    {
        group: '卡片生成',
        color: '#34D399',
        items: [
            {
                func: '卡片生成（纯文字）',
                model: 'gpt-5.2',
                tier: 'complex',
                api: 'Responses API',
                promptType: 'Inline (highlight_summarizer)',
                note: '文字高亮 → 结构化笔记卡片',
            },
            {
                func: '卡片生成（图片）',
                model: 'gpt-5.2',
                tier: 'complex',
                api: 'Responses API',
                promptType: 'Inline (vision_card_generator)',
                note: 'Vision API，分析图片内容',
            },
            {
                func: '整文件生成卡片',
                model: 'gpt-5.2',
                tier: 'complex',
                api: 'Responses API',
                promptType: 'Inline (full_document_generator)',
                note: 'PDF/Word 全文 → 多张卡片',
            },
        ],
    },
    {
        group: '搜索与假设',
        color: '#FBBF24',
        items: [
            {
                func: 'AI 语义搜索',
                model: 'gpt-5.2',
                tier: 'complex',
                api: 'Responses API',
                promptType: 'Inline (search_agent)',
                note: '从卡片列表中找出最相关结果',
            },
            {
                func: '假设建议',
                model: 'gpt-5.2',
                tier: 'complex',
                api: 'Responses API',
                promptType: 'Inline (hypothesis_suggest)',
                note: '基于主题和卡片生成候选假设',
            },
            {
                func: '假设验证',
                model: 'gpt-5.2',
                tier: 'complex',
                api: 'Responses API',
                promptType: 'Inline (hypothesis_evaluator) + file_search',
                note: 'Vector Store 检索证据，评估假设支持度',
            },
        ],
    },
    {
        group: '对话助手（用户配置模型）',
        color: '#60A5FA',
        items: [
            {
                func: '看板 Chat 助手',
                model: '用户配置',
                tier: 'user',
                api: 'Chat Completions',
                promptType: '硬编码 System Prompt',
                note: '多轮工具调用，管理看板节点',
            },
            {
                func: '根因分析 Agent',
                model: '用户配置',
                tier: 'user',
                api: 'Chat Completions',
                promptType: '硬编码 System Prompt',
                note: '分析看板中的根因关系',
            },
            {
                func: '证据验证 Agent',
                model: '用户配置',
                tier: 'user',
                api: 'Chat Completions',
                promptType: '硬编码 System Prompt',
                note: '验证看板节点的证据链',
            },
        ],
    },
];

const TIER_STYLES = {
    complex: { label: 'gpt-5.2', bg: 'rgba(129,140,248,0.15)', color: '#818CF8', border: 'rgba(129,140,248,0.3)' },
    user: { label: '用户配置', bg: 'rgba(96,165,250,0.12)', color: '#60A5FA', border: 'rgba(96,165,250,0.25)' },
};

/**
 * 模型分配总览卡片
 */
function ModelOverviewCard() {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)' }}>
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full px-6 py-4 flex items-center justify-between"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg" style={{ background: 'rgba(99,102,241,0.1)' }}>
                        <Cpu className="w-5 h-5" style={{ color: 'var(--accent-400)' }} />
                    </div>
                    <div className="text-left">
                        <h2 className="font-semibold" style={{ color: 'var(--text-0)' }}>模型分配总览</h2>
                        <p className="text-sm" style={{ color: 'var(--text-2)' }}>各功能使用的模型、API 类型和 Prompt 来源</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center gap-2">
                        {Object.entries(TIER_STYLES).map(([tier, s]) => (
                            <span key={tier} className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                                {s.label}
                            </span>
                        ))}
                    </div>
                    {expanded ? <ChevronUp className="w-5 h-5" style={{ color: 'var(--text-2)' }} /> : <ChevronDown className="w-5 h-5" style={{ color: 'var(--text-2)' }} />}
                </div>
            </button>

            {expanded && (
                <div className="px-6 pb-6 space-y-5" style={{ borderTop: '1px solid var(--stroke-0)' }}>
                    <div className="pt-4 flex flex-wrap gap-3">
                        {Object.entries(TIER_STYLES).map(([tier, s]) => (
                            <div key={tier} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
                                <span className="px-2 py-0.5 rounded-full font-mono" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>{s.label}</span>
                                <span>
                                    {tier === 'complex' && '旗舰模型 · 所有AI功能'}
                                    {tier === 'user' && '跟随用户 API 设置'}
                                </span>
                            </div>
                        ))}
                    </div>

                    {MODEL_OVERVIEW.map((group) => (
                        <div key={group.group}>
                            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: group.color }}>
                                <span className="w-2 h-2 rounded-full inline-block" style={{ background: group.color }} />
                                {group.group}
                            </h3>
                            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--stroke-0)' }}>
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr style={{ background: 'rgba(0,0,0,0.15)' }}>
                                            <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-2)', width: '22%' }}>功能</th>
                                            <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-2)', width: '14%' }}>模型</th>
                                            <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-2)', width: '16%' }}>API 类型</th>
                                            <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-2)', width: '24%' }}>Prompt 来源</th>
                                            <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-2)' }}>说明</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {group.items.map((item, i) => {
                                            const ts = TIER_STYLES[item.tier];
                                            return (
                                                <tr key={i} style={{ borderTop: i > 0 ? '1px solid var(--stroke-0)' : undefined }}>
                                                    <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text-0)' }}>{item.func}</td>
                                                    <td className="px-4 py-2.5">
                                                        <span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ background: ts.bg, color: ts.color, border: `1px solid ${ts.border}` }}>
                                                            {item.model}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-xs font-mono" style={{ color: 'var(--text-1)' }}>{item.api}</td>
                                                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-1)' }}>{item.promptType}</td>
                                                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-2)' }}>{item.note}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * OpenAI API 配置卡片
 */
function APIConfigCard({ settings, onUpdate, saving, testing, testResult, onTest }) {
    const [apiKey, setApiKey] = useState('');
    const [model, setModel] = useState(settings?.model || 'gpt-5-mini');
    const [models, setModels] = useState([]);

    // 加载模型列表
    useEffect(() => {
        loadModels();
    }, []);

    // 同步settings变化
    useEffect(() => {
        if (settings?.model) {
            setModel(settings.model);
        }
    }, [settings?.model]);

    const loadModels = async () => {
        try {
            const res = await settingsApi.getModels('openai');
            if (res.ok) {
                setModels(res.models || []);
            }
        } catch (error) {
            console.error('加载模型列表失败:', error);
        }
    };

    const handleSave = () => {
        const updates = { provider: 'openai', model };
        if (apiKey.trim()) {
            updates.api_key = apiKey.trim();
        }
        onUpdate(updates);
        setApiKey(''); // 清空输入
    };

    const handleTest = () => {
        onTest({
            provider: 'openai',
            model,
            api_key: apiKey.trim() || undefined,
        });
    };

    const inputStyle = { background: 'var(--surface-0)', border: '1px solid var(--stroke-0)', color: 'var(--text-0)' };

    return (
        <div className="rounded-xl p-6 space-y-5" style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)' }}>
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ background: 'rgba(99,102,241,0.1)' }}>
                    <Key className="w-5 h-5" style={{ color: 'var(--accent-400)' }} />
                </div>
                <div>
                    <h2 className="font-semibold" style={{ color: 'var(--text-0)' }}>OpenAI API 配置</h2>
                    <p className="text-sm" style={{ color: 'var(--text-2)' }}>配置 AI 模型和 API 密钥</p>
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-1)' }}>
                    模型选择
                </label>
                <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl input-focus"
                    style={inputStyle}
                >
                    {models.map((m) => (
                        <option key={m.id} value={m.id}>
                            {m.name} - {m.description}
                        </option>
                    ))}
                </select>
            </div>

            <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-1)' }}>
                    API 密钥
                    {settings?.has_custom_api_key && (
                        <span className="ml-2 text-xs font-normal" style={{ color: '#34D399' }}>
                            ✓ 已配置
                        </span>
                    )}
                </label>
                <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={settings?.has_custom_api_key ? '留空保持不变，输入新值则覆盖' : '输入 OpenAI API Key'}
                    className="w-full px-4 py-3 rounded-xl input-focus font-mono text-sm"
                    style={inputStyle}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-2)' }}>
                    如不提供，将使用系统默认配置
                </p>
            </div>

            <div className="flex items-center gap-3 pt-2" style={{ borderTop: '1px solid var(--stroke-0)' }}>
                <button
                    onClick={handleTest}
                    disabled={testing}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                    style={{ color: 'var(--text-1)' }}
                >
                    {testing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <AlertCircle className="w-4 h-4" />
                    )}
                    测试连接
                </button>

                {testResult && (
                    <div className="flex items-center gap-2 text-sm" style={{ color: testResult.success ? '#34D399' : '#FB7185' }}>
                        {testResult.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        {testResult.message}
                    </div>
                )}

                <div className="flex-1" />

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 font-medium rounded-xl transition-colors disabled:opacity-50"
                    style={{ background: 'var(--accent-600)', color: 'white' }}
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    保存
                </button>
            </div>
        </div>
    );
}

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

        const parts = template.split(/(\\{\\{[A-Za-z_]+\\}\\})/g);

        return parts.map((part, index) => {
            if (part.match(/^\\{\\{[A-Za-z_]+\\}\\}$/)) {
                return (
                    <span
                        key={index}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-xs font-mono"
                        style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent-300)', border: '1px solid rgba(99,102,241,0.25)' }}
                        title="模板变量"
                    >
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
                    <div className="p-2 rounded-lg" style={{ background: isEditable ? 'rgba(52,211,153,0.1)' : 'rgba(148,163,184,0.1)' }}>
                        <Icon className="w-5 h-5" style={{ color: isEditable ? '#34D399' : 'var(--text-2)' }} />
                    </div>
                    <div className="text-left">
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold" style={{ color: 'var(--text-0)' }}>{prompt.name}</h3>
                            {isEditable ? (
                                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(52,211,153,0.1)', color: '#34D399', border: '1px solid rgba(52,211,153,0.2)' }}>
                                    可编辑
                                </span>
                            ) : (
                                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(148,163,184,0.1)', color: 'var(--text-2)', border: '1px solid rgba(148,163,184,0.15)' }}>
                                    只读
                                </span>
                            )}
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
                            <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--stroke-0)' }}>
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
                                            <div key={varName} className="text-xs font-mono" style={{ color: 'var(--accent-300)' }}>
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
                                            <span
                                                key={field}
                                                className="text-xs px-2 py-1 rounded font-mono"
                                                style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--stroke-0)', color: 'var(--text-1)' }}
                                            >
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
                                    disabled={!isEditable}
                                    rows={12}
                                    className="w-full px-4 py-3 rounded-xl font-mono text-sm leading-relaxed input-focus resize-y disabled:opacity-60 disabled:cursor-not-allowed"
                                    style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)', color: 'var(--text-0)' }}
                                    placeholder="输入 prompt 内容..."
                                />
                            </div>

                            {isEditable && (
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
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * AI 设置页面（合并 Settings + Prompts）
 */
function AISettingsPage() {
    const { showToast } = useUIStore();

    // API 设置状态
    const [settings, setSettings] = useState(null);
    const [settingsLoading, setSettingsLoading] = useState(true);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState(null);

    // Prompts 状态
    const [prompts, setPrompts] = useState([]);
    const [promptsLoading, setPromptsLoading] = useState(true);
    const [promptSaving, setPromptSaving] = useState(false);
    const [error, setError] = useState(null);

    // 加载数据
    useEffect(() => {
        loadSettings();
        loadPrompts();
    }, []);

    const loadSettings = async () => {
        setSettingsLoading(true);
        try {
            const res = await settingsApi.get();
            if (res.ok) {
                setSettings(res.settings);
            }
        } catch (err) {
            console.error('加载设置失败:', err);
        } finally {
            setSettingsLoading(false);
        }
    };

    const loadPrompts = async () => {
        setPromptsLoading(true);
        setError(null);
        try {
            const response = await promptsApi.list();
            if (response.ok) {
                setPrompts(response.prompts || []);
            } else {
                throw new Error(response.error || '加载失败');
            }
        } catch (err) {
            console.error('加载 prompts 失败:', err);
            setError(err.message || '加载失败');
        } finally {
            setPromptsLoading(false);
        }
    };

    const handleUpdateSettings = async (updates) => {
        setSettingsSaving(true);
        try {
            const res = await settingsApi.update(updates);
            if (res.ok) {
                setSettings(res.settings);
                showToast('设置已保存', 'success');
                setTestResult(null);
            }
        } catch (err) {
            showToast(err.message || '保存失败', 'error');
        } finally {
            setSettingsSaving(false);
        }
    };

    const handleTestApi = async (config) => {
        setTesting(true);
        setTestResult(null);
        try {
            const res = await settingsApi.testApi(config);
            if (res.ok) {
                setTestResult({ success: true, message: 'API连接测试成功' });
            } else {
                setTestResult({ success: false, message: res.message || '测试失败' });
            }
        } catch (err) {
            setTestResult({ success: false, message: err.message || '测试失败' });
        } finally {
            setTesting(false);
        }
    };

    const handleSavePrompt = async (id, template) => {
        setPromptSaving(true);
        try {
            const response = await promptsApi.update(id, template);
            if (response.ok) {
                setPrompts((prev) =>
                    prev.map((p) => (p.id === id ? { ...p, template } : p))
                );
                showToast('Prompt 已保存', 'success');
            } else {
                throw new Error(response.error || '保存失败');
            }
        } catch (err) {
            showToast(err.message || '保存失败', 'error');
        } finally {
            setPromptSaving(false);
        }
    };

    // 分类 prompts
    const editablePrompts = prompts.filter((p) => p.editable && p.type === 'inline');
    const storedPrompts = prompts.filter((p) => p.type === 'stored');

    const isLoading = settingsLoading || promptsLoading;

    return (
        <div className="space-y-6 animate-fade-in">
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-0)' }}>
                    <Settings2 className="w-7 h-7" style={{ color: 'var(--accent-400)' }} />
                    AI 设置
                </h1>
                <p className="mt-1" style={{ color: 'var(--text-2)' }}>
                    配置 OpenAI API、查看模型分配和管理 AI Prompts
                </p>
            </div>

            {isLoading && (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-400)' }} />
                    <span className="ml-3" style={{ color: 'var(--text-2)' }}>加载中...</span>
                </div>
            )}

            {error && !isLoading && (
                <div className="flex flex-col items-center justify-center py-16 rounded-xl" style={{ background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.2)' }}>
                    <AlertCircle className="w-12 h-12 mb-4" style={{ color: '#FB7185' }} />
                    <p className="font-medium" style={{ color: '#FB7185' }}>{error}</p>
                    <button
                        onClick={() => { loadSettings(); loadPrompts(); }}
                        className="mt-4 px-4 py-2 rounded-lg transition-colors"
                        style={{ background: 'rgba(251,113,133,0.15)', color: '#FB7185' }}
                    >
                        重试
                    </button>
                </div>
            )}

            {!isLoading && !error && (
                <>
                    <APIConfigCard
                        settings={settings}
                        onUpdate={handleUpdateSettings}
                        saving={settingsSaving}
                        testing={testing}
                        testResult={testResult}
                        onTest={handleTestApi}
                    />

                    <ModelOverviewCard />

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
                                <PromptCard
                                    key={prompt.id}
                                    prompt={prompt}
                                    onSave={handleSavePrompt}
                                    saving={promptSaving}
                                />
                            ))}
                        </div>
                    </div>

                    {storedPrompts.length > 0 && (
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
                                    <PromptCard
                                        key={prompt.id}
                                        prompt={prompt}
                                        onSave={handleSavePrompt}
                                        saving={promptSaving}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="p-4 rounded-xl" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)' }}>
                        <h3 className="font-medium mb-2 flex items-center gap-2" style={{ color: '#FBBF24' }}>
                            <AlertCircle className="w-5 h-5" />
                            使用提示
                        </h3>
                        <ul className="text-sm space-y-1 list-disc list-inside" style={{ color: 'var(--text-1)' }}>
                            <li>
                                如不提供 API 密钥，将使用系统默认配置
                            </li>
                            <li>
                                <strong>锁定变量</strong>（如 {`{{OUTPUT_FORMAT}}`}）不可删除，确保 AI 输出格式正确
                            </li>
                            <li>
                                修改 Prompt 后需要点击"保存更改"，更改会立即生效
                            </li>
                        </ul>
                    </div>
                </>
            )}
        </div>
    );
}

export default AISettingsPage;
