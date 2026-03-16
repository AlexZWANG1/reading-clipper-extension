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
    { bg: 'rgba(99,102,241,0.15)', color: '#818CF8' },
    { bg: 'rgba(52,211,153,0.15)', color: '#34D399' },
    { bg: 'rgba(251,191,36,0.15)', color: '#FBBF24' },
    { bg: 'rgba(251,113,133,0.15)', color: '#FB7185' },
    { bg: 'rgba(34,211,238,0.15)', color: '#22D3EE' },
    { bg: 'rgba(167,139,250,0.15)', color: '#A78BFA' },
  ];

  const colorIndex =
    topic.title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) %
    colors.length;

  return (
    <div className="rounded-xl p-5 card-hover group" style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)' }}>
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: colors[colorIndex].bg, color: colors[colorIndex].color }}>
          <Folder className="w-6 h-6" />
        </div>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
            aria-label="Open topic actions"
            style={{ color: 'var(--text-2)' }}
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 rounded-lg shadow-lg py-1 z-20 min-w-[120px] glass-surface">
                <button
                  onClick={() => { onEdit(topic); setMenuOpen(false); }}
                  className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors cursor-pointer"
                  style={{ color: 'var(--text-1)' }}
                >
                  <Edit3 className="w-4 h-4" />
                  编辑
                </button>
                <button
                  onClick={() => { onDelete(topic.id); setMenuOpen(false); }}
                  className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors cursor-pointer"
                  style={{ color: '#FB7185' }}
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
        <h3 className="text-lg font-semibold mb-1 transition-colors" style={{ color: 'var(--text-0)' }}>
          {topic.title}
        </h3>
        {topic.description && (
          <p className="text-sm line-clamp-2 mb-3" style={{ color: 'var(--text-2)' }}>
            {topic.description}
          </p>
        )}
        <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-2)' }}>
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

  const inputStyle = { background: 'var(--surface-0)', border: '1px solid var(--stroke-0)', color: 'var(--text-0)' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div className="relative rounded-2xl shadow-xl w-full max-w-md p-6 animate-slide-up glass-surface">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text-0)' }}>
            {editingTopic ? '编辑 Topic' : '新建 Topic'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg transition-colors cursor-pointer" aria-label="Close topic modal" style={{ color: 'var(--text-2)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-1)' }}>名称</label>
            <input
              id="topic-title"
              name="topic_title"
              aria-label="Topic title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入 Topic 名称"
              className="w-full px-4 py-2.5 rounded-xl input-focus"
              style={inputStyle}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-1)' }}>
              描述 <span style={{ color: 'var(--text-2)' }}>(可选)</span>
            </label>
            <textarea
              id="topic-description"
              name="topic_description"
              aria-label="Topic description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要描述这个 Topic"
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl input-focus resize-none"
              style={inputStyle}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 font-medium rounded-xl transition-colors cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-1)', border: '1px solid var(--stroke-0)' }}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!title.trim() || loading}
              className="flex-1 px-4 py-2.5 font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
              style={{ background: 'var(--accent-600)', color: 'white' }}
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
      await fetchTopics(true);
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
      await fetchTopics(true);
    } catch (error) {
      showToast('删除失败', 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-0)' }}>Topics</h1>
          <p className="mt-1" style={{ color: 'var(--text-2)' }}>管理你的知识主题</p>
        </div>
        <button
          onClick={() => { setEditingTopic(null); setModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2.5 font-medium rounded-xl transition-colors btn-press cursor-pointer"
          style={{ background: 'var(--accent-600)', color: 'white' }}
        >
          <Plus className="w-5 h-5" />
          新建 Topic
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-40 skeleton rounded-xl" />
          ))}
        </div>
      ) : topics.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {topics.map((topic) => (
            <TopicCard key={topic.id} topic={topic} onEdit={handleEdit} onDelete={handleDelete} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 rounded-xl" style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)' }}>
          <Folder className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-2)' }} />
          <p className="font-medium" style={{ color: 'var(--text-1)' }}>还没有任何 Topic</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>创建一个 Topic 来组织你的知识卡片</p>
          <button
            onClick={() => setModalOpen(true)}
            className="mt-4 px-4 py-2.5 rounded-lg font-medium transition-colors cursor-pointer"
            style={{ background: 'var(--accent-600)', color: 'white' }}
          >
            创建第一个 Topic
          </button>
        </div>
      )}

      <CreateTopicModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingTopic(null); }}
        onSubmit={handleCreate}
        editingTopic={editingTopic}
      />
    </div>
  );
}

export default TopicsPage;







