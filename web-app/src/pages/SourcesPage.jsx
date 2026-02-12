import { useEffect, useState } from 'react';
import {
  Plus,
  Globe,
  MoreVertical,
  Edit3,
  Trash2,
  X,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { useSourcesStore, useUIStore } from '../lib/store';

const CATEGORIES = [
  { value: '官方一手', label: '官方一手' },
  { value: '科技媒体', label: '科技媒体' },
  { value: '独立研究机构', label: '独立研究机构' },
  { value: '投资机构报告', label: '投资机构报告' },
  { value: '技术博客', label: '技术博客' },
  { value: '社交/社区/视频', label: '社交/社区/视频' },
  { value: '其他', label: '其他' },
];

const IMPORTANCE_LEVELS = [
  { value: 1, label: '🔴 重要 (Level 1)', color: 'bg-red-500' },
  { value: 2, label: '🟠 普通 (Level 2)', color: 'bg-orange-400' },
  { value: 3, label: '⚪ 闲聊 (Level 3)', color: 'bg-gray-300' },
];

const REGIONS = [
  { value: 'overseas', label: '🌍 海外', icon: '🌍' },
  { value: 'domestic', label: '🇨🇳 国内', icon: '🇨🇳' },
];

function SourceModal({ isOpen, onClose, onSubmit, editingSource }) {
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    category: '官方一手',
    importance_level: 2,
    region: 'overseas',
    description: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (editingSource) {
      setFormData({
        name: editingSource.name || '',
        url: editingSource.url || '',
        category: editingSource.category || '官方一手',
        importance_level: editingSource.importance_level || 2,
        region: editingSource.region || 'overseas',
        description: editingSource.description || '',
      });
    } else {
      setFormData({
        name: '',
        url: '',
        category: '官方一手',
        importance_level: 2,
        region: 'overseas',
        description: '',
      });
    }
  }, [editingSource]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.url.trim()) return;

    setLoading(true);
    try {
      await onSubmit({
        ...formData,
        name: formData.name.trim(),
        url: formData.url.trim(),
        importance_level: Number(formData.importance_level),
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-surface-900">
            {editingSource ? '编辑信息源' : '添加信息源'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 名称 */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              信息源名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="例如: OpenAI Blog"
              className="w-full px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-surface-900 placeholder-surface-400 input-focus"
              required
            />
          </div>

          {/* URL */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              网站地址 <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="https://..."
              className="w-full px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-surface-900 placeholder-surface-400 input-focus"
              required
            />
          </div>

          {/* 分类 */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              分类
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-surface-900 input-focus cursor-pointer"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* 重要度和地区 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                重要度
              </label>
              <select
                value={formData.importance_level}
                onChange={(e) =>
                  setFormData({ ...formData, importance_level: Number(e.target.value) })
                }
                className="w-full px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-surface-900 input-focus cursor-pointer"
              >
                {IMPORTANCE_LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">
                地区
              </label>
              <select
                value={formData.region}
                onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                className="w-full px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-surface-900 input-focus cursor-pointer"
              >
                {REGIONS.map((region) => (
                  <option key={region.value} value={region.value}>
                    {region.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 描述 */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              描述 <span className="text-surface-400">(可选，有助于 AI 匹配)</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="额外的关键词或描述..."
              rows={3}
              className="w-full px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-surface-900 placeholder-surface-400 input-focus resize-none"
            />
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-surface-100 text-surface-700 font-medium rounded-xl hover:bg-surface-200 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!formData.name.trim() || !formData.url.trim() || loading}
              className="flex-1 px-4 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingSource ? '保存' : '添加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SourceRow({ source, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const importanceLevel = IMPORTANCE_LEVELS.find(
    (l) => l.value === source.importance_level
  );
  const region = REGIONS.find((r) => r.value === source.region);

  let hostname = '';
  try {
    hostname = new URL(source.url).hostname.replace('www.', '');
  } catch {
    hostname = source.url;
  }

  return (
    <tr className="hover:bg-surface-50 transition-colors group">
      {/* 信息源 */}
      <td className="px-4 py-4">
        <div className="flex flex-col gap-1">
          <span className="font-medium text-surface-900">{source.name}</span>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-surface-400 hover:text-primary-600 flex items-center gap-1"
          >
            {hostname}
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </td>

      {/* 分类 */}
      <td className="px-4 py-4">
        <span className="px-2.5 py-1 bg-surface-100 text-surface-600 text-xs font-medium rounded-lg">
          {source.category}
        </span>
      </td>

      {/* 重要度 */}
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${importanceLevel?.color || 'bg-gray-300'}`}
          />
          <span className="text-sm text-surface-600">Level {source.importance_level}</span>
        </div>
      </td>

      {/* 地区 */}
      <td className="px-4 py-4">
        <span className="text-sm text-surface-600">
          {region?.icon} {region?.value === 'overseas' ? '海外' : '国内'}
        </span>
      </td>

      {/* 操作 */}
      <td className="px-4 py-4">
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-surface-100 py-1 z-20 min-w-[120px]">
                <button
                  onClick={() => {
                    onEdit(source);
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-surface-700 hover:bg-surface-50 flex items-center gap-2"
                >
                  <Edit3 className="w-4 h-4" />
                  编辑
                </button>
                <button
                  onClick={() => {
                    onDelete(source.source_id);
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  删除
                </button>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function SourcesPage() {
  const { sources, loading, fetchSources, createSource, updateSource, deleteSource } =
    useSourcesStore();
  const { showToast } = useUIStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState(null);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const handleCreate = async (data) => {
    try {
      if (editingSource) {
        await updateSource(editingSource.source_id, data);
        showToast('信息源已更新', 'success');
      } else {
        await createSource(data);
        showToast('信息源已添加', 'success');
      }
      setEditingSource(null);
    } catch (error) {
      showToast(error.message || '操作失败', 'error');
      throw error;
    }
  };

  const handleEdit = (source) => {
    setEditingSource(source);
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这个信息源吗？这可能会影响已有的卡片。')) return;
    try {
      await deleteSource(id);
      showToast('信息源已删除', 'success');
    } catch (error) {
      showToast('删除失败', 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">信息源管理</h1>
          <p className="text-surface-500 mt-1">
            管理你的信息来源，帮助 AI 更好地匹配卡片
          </p>
        </div>
        <button
          onClick={() => {
            setEditingSource(null);
            setModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors btn-press"
        >
          <Plus className="w-5 h-5" />
          添加信息源
        </button>
      </div>

      {/* 信息源列表 */}
      {loading ? (
        <div className="bg-white rounded-xl border border-surface-100 overflow-hidden">
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-surface-400" />
            <span className="ml-2 text-surface-500">加载中...</span>
          </div>
        </div>
      ) : sources.length > 0 ? (
        <div className="bg-white rounded-xl border border-surface-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-surface-50 border-b border-surface-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">
                  信息源
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">
                  分类
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">
                  重要度
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">
                  地区
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider w-16">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {sources.map((source) => (
                <SourceRow
                  key={source.source_id}
                  source={source}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-xl border border-surface-100">
          <Globe className="w-12 h-12 mx-auto mb-4 text-surface-300" />
          <p className="text-surface-600 font-medium">还没有任何信息源</p>
          <p className="text-surface-400 text-sm mt-1">
            添加信息源可以帮助系统更好地归类你的阅读卡片
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
          >
            添加第一个信息源
          </button>
        </div>
      )}

      {/* 创建/编辑模态框 */}
      <SourceModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingSource(null);
        }}
        onSubmit={handleCreate}
        editingSource={editingSource}
      />
    </div>
  );
}

export default SourcesPage;





