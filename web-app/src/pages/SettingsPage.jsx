import { useEffect, useState } from 'react';
import {
  Settings2,
  Save,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Key,
  Globe,
  Sparkles,
} from 'lucide-react';
import { settingsApi } from '../lib/api';
import { useUIStore } from '../lib/store';

function SettingsPage() {
  const { showToast } = useUIStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [providers, setProviders] = useState([]);
  const [models, setModels] = useState([]);
  const [settings, setSettings] = useState({
    provider: 'openai',
    model: 'gpt-5-mini',
    api_endpoint: null,
    has_custom_api_key: false,
  });
  const [formData, setFormData] = useState({
    provider: 'openai',
    model: 'gpt-5-mini',
    api_key: '',
    api_endpoint: '',
  });
  const [testResult, setTestResult] = useState(null);

  // 加载设置和提供商列表
  useEffect(() => {
    loadData();
  }, []);

  // 当provider改变时，加载对应的模型列表
  useEffect(() => {
    if (formData.provider) {
      loadModels(formData.provider);
    }
  }, [formData.provider]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 并行加载设置和提供商列表
      const [settingsRes, providersRes] = await Promise.all([
        settingsApi.get().catch(() => ({ ok: false, settings: null })),
        settingsApi.getProviders(),
      ]);

      if (settingsRes.ok && settingsRes.settings) {
        const s = settingsRes.settings;
        setSettings(s);
        setFormData({
          provider: s.provider || 'openai',
          model: s.model || 'gpt-5-mini',
          api_key: '',
          api_endpoint: s.api_endpoint || '',
        });
      }

      if (providersRes.ok) {
        setProviders(providersRes.providers || []);
      }
    } catch (error) {
      console.error('加载设置失败:', error);
      showToast('加载设置失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadModels = async (provider) => {
    try {
      const res = await settingsApi.getModels(provider);
      if (res.ok) {
        setModels(res.models || []);
        // 如果当前模型不在新provider的模型列表中，重置为默认模型
        const modelIds = res.models.map(m => m.id);
        if (!modelIds.includes(formData.model) && res.models.length > 0) {
          setFormData(prev => ({
            ...prev,
            model: res.models[0].id,
          }));
        }
      }
    } catch (error) {
      console.error('加载模型列表失败:', error);
      setModels([]);
    }
  };

  const handleTestApi = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const testConfig = {
        provider: formData.provider,
        model: formData.model,
        api_key: formData.api_key || undefined,
        api_endpoint: formData.provider === 'custom' ? formData.api_endpoint : undefined,
      };

      const res = await settingsApi.testApi(testConfig);
      if (res.ok) {
        setTestResult({ success: true, message: 'API连接测试成功' });
        showToast('API连接测试成功', 'success');
      } else {
        setTestResult({ success: false, message: res.message || 'API连接测试失败' });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: error.message || 'API连接测试失败',
      });
      showToast(error.message || 'API连接测试失败', 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = {
        provider: formData.provider,
        model: formData.model,
      };

      // 只有自定义提供商需要api_endpoint
      if (formData.provider === 'custom') {
        if (!formData.api_endpoint) {
          showToast('自定义API需要提供API端点', 'error');
          setSaving(false);
          return;
        }
        updates.api_endpoint = formData.api_endpoint;
      }

      // 如果提供了新的API Key，更新它
      if (formData.api_key && formData.api_key.trim()) {
        updates.api_key = formData.api_key.trim();
      }

      const res = await settingsApi.update(updates);
      if (res.ok) {
        setSettings(res.settings);
        setFormData(prev => ({
          ...prev,
          api_key: '', // 清空API Key输入框（安全考虑）
        }));
        showToast('设置已保存', 'success');
        setTestResult(null);
      }
    } catch (error) {
      showToast(error.message || '保存设置失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        <span className="ml-3 text-surface-500">加载中...</span>
      </div>
    );
  }

  const currentProvider = providers.find(p => p.id === formData.provider);
  const showApiKeyInput = formData.provider === 'custom' || formData.provider === 'anthropic';
  const showApiEndpointInput = formData.provider === 'custom';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-surface-900 flex items-center gap-2">
          <Settings2 className="w-7 h-7 text-primary-500" />
          AI模型设置
        </h1>
        <p className="text-surface-500 mt-1">
          配置AI模型提供商和API密钥
        </p>
      </div>

      {/* 设置表单 */}
      <div className="bg-white rounded-xl border border-surface-100 p-6 space-y-6">
        {/* 提供商选择 */}
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-2">
            <Globe className="w-4 h-4 inline mr-1" />
            AI提供商
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {providers.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, provider: provider.id }))}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  formData.provider === provider.id
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-surface-200 hover:border-surface-300'
                }`}
              >
                <div className="font-medium text-surface-900">{provider.name}</div>
                <div className="text-xs text-surface-500 mt-1">{provider.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 模型选择 */}
        {currentProvider && (
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-2">
              <Sparkles className="w-4 h-4 inline mr-1" />
              模型选择
            </label>
            <select
              value={formData.model}
              onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
              className="w-full px-4 py-3 bg-surface-50 border border-surface-200 rounded-xl text-surface-900 input-focus"
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} - {model.description}
                </option>
              ))}
            </select>
            {models.length === 0 && (
              <p className="text-xs text-surface-400 mt-1">加载模型中...</p>
            )}
          </div>
        )}

        {/* API端点（仅自定义提供商） */}
        {showApiEndpointInput && (
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-2">
              API端点
            </label>
            <input
              type="url"
              value={formData.api_endpoint}
              onChange={(e) => setFormData(prev => ({ ...prev, api_endpoint: e.target.value }))}
              placeholder="https://api.example.com/v1"
              className="w-full px-4 py-3 bg-surface-50 border border-surface-200 rounded-xl text-surface-900 placeholder-surface-400 input-focus font-mono text-sm"
            />
            <p className="text-xs text-surface-400 mt-1">
              自定义API端点，需兼容OpenAI格式
            </p>
          </div>
        )}

        {/* API Key输入 */}
        {showApiKeyInput && (
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-2">
              <Key className="w-4 h-4 inline mr-1" />
              API密钥 {formData.provider === 'custom' && <span className="text-red-500">*</span>}
            </label>
            <input
              type="password"
              value={formData.api_key}
              onChange={(e) => setFormData(prev => ({ ...prev, api_key: e.target.value }))}
              placeholder={formData.provider === 'custom' ? '输入你的API密钥' : '留空则使用系统默认'}
              className="w-full px-4 py-3 bg-surface-50 border border-surface-200 rounded-xl text-surface-900 placeholder-surface-400 input-focus font-mono text-sm"
            />
            {settings.has_custom_api_key && !formData.api_key && (
              <p className="text-xs text-surface-400 mt-1">
                已配置API密钥，留空则保持不变
              </p>
            )}
            {formData.provider === 'custom' && (
              <p className="text-xs text-red-500 mt-1">
                自定义API需要提供API密钥
              </p>
            )}
          </div>
        )}

        {/* 测试连接 */}
        <div className="flex items-center gap-3 pt-4 border-t border-surface-100">
          <button
            type="button"
            onClick={handleTestApi}
            disabled={testing || (formData.provider === 'custom' && !formData.api_endpoint)}
            className="flex items-center gap-2 px-4 py-2 text-surface-600 hover:bg-surface-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            测试连接
          </button>
          {testResult && (
            <div className={`flex items-center gap-2 text-sm ${
              testResult.success ? 'text-green-600' : 'text-red-600'
            }`}>
              {testResult.success ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              {testResult.message}
            </div>
          )}
        </div>

        {/* 保存按钮 */}
        <div className="flex justify-end pt-4 border-t border-surface-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            保存设置
          </button>
        </div>
      </div>

      {/* 提示信息 */}
      <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
        <h3 className="font-medium text-amber-800 mb-2 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          使用提示
        </h3>
        <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
          <li>OpenAI提供商：如果不提供API密钥，将使用系统默认配置</li>
          <li>Anthropic提供商：需要提供自己的API密钥</li>
          <li>自定义API：需要提供API端点和API密钥，且需兼容OpenAI格式</li>
          <li>API密钥会加密存储，不会在日志中暴露</li>
        </ul>
      </div>
    </div>
  );
}

export default SettingsPage;


