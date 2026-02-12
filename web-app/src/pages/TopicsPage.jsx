import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Folder,
  MoreVertical,
  Edit3,
  Trash2,
  CreditCard,
  X,
  Loader2,
} from 'lucide-react';
import { useTopicsStore, useUIStore } from '../lib/store';

function TopicCard({ topic, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const colors = [
    'bg-primary-100 text-primary-600',
    'bg-emerald-100 text-emerald-600',
    'bg-amber-100 text-amber-600',
    'bg-rose-100 text-rose-600',
    'bg-cyan-100 text-cyan-600',
    'bg-violet-100 text-violet-600',
  ];

  const colorIndex =
    topic.title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) %
    colors.length;

  return (
    <div className="bg-white rounded-xl border border-surface-100 p-5 card-hover group">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colors[colorIndex]}`}>
          <Folder className="w-6 h-6" />
        </div>
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
                    onEdit(topic);
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-surface-700 hover:bg-surface-50 flex items-center gap-2"
                >
                  <Edit3 className="w-4 h-4" />
                  编辑
                </button>
                <button
                  onClick={() => {
                    onDelete(topic.id);
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
      </div>

      <Link to={`/topics/${topic.id}`} className="block">
        <h3 className="text-lg font-semibold text-surface-900 mb-1 hover:text-primary-600 transition-colors">
          {topic.title}
        </h3>
        {topic.description && (
          <p className="text-sm text-surface-500 line-clamp-2 mb-3">
            {topic.description}
          </p>
        )}
        <div className="flex items-center gap-1.5 text-sm text-surface-500">
          <CreditCard className="w-4 h-4" />
          <span>{topic.card_count || 0} 张卡片</span>
        </div>
      </Link>
    </div>
  );
}

function CreateTopicModal({ isOpen, onClose, onSubmit, editingTopic }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (editingTopic) {
      setTitle(editingTopic.title);
      setDescription(editingTopic.description || '');
    } else {
      setTitle('');
      setDescription('');
    }
  }, [editingTopic]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      await onSubmit({ title: title.trim(), description: description.trim() });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-surface-900">
            {editingTopic ? '编辑 Topic' : '新建 Topic'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              名称
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入 Topic 名称"
              className="w-full px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-surface-900 placeholder-surface-400 input-focus"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              描述 <span className="text-surface-400">(可选)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要描述这个 Topic"
              rows={3}
              className="w-full px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-surface-900 placeholder-surface-400 input-focus resize-none"
            />
          </div>

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
              disabled={!title.trim() || loading}
              className="flex-1 px-4 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingTopic ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TopicsPage() {
  const { topics, loading, fetchTopics, createTopic, updateTopic, deleteTopic } =
    useTopicsStore();
  const { showToast } = useUIStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState(null);

  useEffect(() => {
    fetchTopics(true);
  }, [fetchTopics]);

  const handleCreate = async (data) => {
    try {
      if (editingTopic) {
        await updateTopic(editingTopic.id, data);
        showToast('Topic 已更新', 'success');
      } else {
        await createTopic(data);
        showToast('Topic 已创建', 'success');
      }
      setEditingTopic(null);
    } catch (error) {
      showToast(error.message || '操作失败', 'error');
      throw error;
    }
  };

  const handleEdit = (topic) => {
    setEditingTopic(topic);
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这个 Topic 吗？关联的卡片不会被删除。')) return;
    try {
      await deleteTopic(id);
      showToast('Topic 已删除', 'success');
    } catch (error) {
      showToast('删除失败', 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Topics</h1>
          <p className="text-surface-500 mt-1">管理你的知识主题</p>
        </div>
        <button
          onClick={() => {
            setEditingTopic(null);
            setModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors btn-press"
        >
          <Plus className="w-5 h-5" />
          新建 Topic
        </button>
      </div>

      {/* Topic 列表 */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-40 skeleton rounded-xl" />
          ))}
        </div>
      ) : topics.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {topics.map((topic) => (
            <TopicCard
              key={topic.id}
              topic={topic}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-xl border border-surface-100">
          <Folder className="w-12 h-12 mx-auto mb-4 text-surface-300" />
          <p className="text-surface-600 font-medium">还没有任何 Topic</p>
          <p className="text-surface-400 text-sm mt-1">
            创建一个 Topic 来组织你的知识卡片
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
          >
            创建第一个 Topic
          </button>
        </div>
      )}

      {/* 创建/编辑模态框 */}
      <CreateTopicModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingTopic(null);
        }}
        onSubmit={handleCreate}
        editingTopic={editingTopic}
      />
    </div>
  );
}

export default TopicsPage;







