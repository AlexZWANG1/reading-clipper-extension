import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  FileText,
  MoreVertical,
  Edit3,
  Trash2,
  Clock,
  HelpCircle,
  Lightbulb,
  X,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { useDocumentsStore, useTopicsStore, useUIStore } from '../lib/store';

function DocumentCard({ document, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const questionsCount = document.doc_questions?.length || 0;
  const hypothesesCount = document.doc_hypotheses?.length || 0;
  const unitsCount = document.story_units?.length || 0;

  return (
    <div className="bg-white rounded-xl border border-surface-100 p-5 card-hover group">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
          <FileText className="w-5 h-5" />
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
                    onEdit(document);
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-surface-700 hover:bg-surface-50 flex items-center gap-2"
                >
                  <Edit3 className="w-4 h-4" />
                  编辑
                </button>
                <button
                  onClick={() => {
                    onDelete(document.doc_id);
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

      <h3 className="text-lg font-semibold text-surface-900 mb-2 line-clamp-2">
        {document.topic_title}
      </h3>

      <div className="flex items-center gap-4 text-sm text-surface-500 mb-3">
        <span className="flex items-center gap-1">
          <HelpCircle className="w-4 h-4" />
          {questionsCount} 问题
        </span>
        <span className="flex items-center gap-1">
          <Lightbulb className="w-4 h-4" />
          {hypothesesCount} 假设
        </span>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-surface-100">
        <span className="text-xs text-surface-400 flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {new Date(document.updated_at || document.created_at).toLocaleDateString(
            'zh-CN',
            { month: 'short', day: 'numeric' }
          )}
        </span>
        <span className="text-xs text-primary-600 font-medium">
          {unitsCount} 个故事单元
        </span>
      </div>
    </div>
  );
}

function CreateDocumentModal({ isOpen, onClose, onSubmit, topics }) {
  const [topicTitle, setTopicTitle] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const title = selectedTopicId
      ? topics.find((t) => t.id === selectedTopicId)?.title
      : topicTitle.trim();

    if (!title) return;

    setLoading(true);
    try {
      await onSubmit({ topic_title: title });
      setTopicTitle('');
      setSelectedTopicId('');
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
          <h2 className="text-xl font-semibold text-surface-900">新建文档</h2>
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
              选择 Topic
            </label>
            <div className="relative">
              <select
                value={selectedTopicId}
                onChange={(e) => {
                  setSelectedTopicId(e.target.value);
                  if (e.target.value) setTopicTitle('');
                }}
                className="appearance-none w-full px-4 py-2.5 pr-10 bg-surface-50 border border-surface-200 rounded-xl text-surface-900 input-focus cursor-pointer"
              >
                <option value="">（从现有 Topic 选择）</option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.title}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400 pointer-events-none" />
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-surface-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs text-surface-400">或</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              新建 Topic
            </label>
            <input
              type="text"
              value={topicTitle}
              onChange={(e) => {
                setTopicTitle(e.target.value);
                if (e.target.value) setSelectedTopicId('');
              }}
              placeholder="输入新的 Topic 名称"
              className="w-full px-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-surface-900 placeholder-surface-400 input-focus"
              disabled={!!selectedTopicId}
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
              disabled={(!topicTitle.trim() && !selectedTopicId) || loading}
              className="flex-1 px-4 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              创建
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DocumentsPage() {
  const { documents, loading, fetchDocuments, createDocument, deleteDocument } =
    useDocumentsStore();
  const { topics, fetchTopics } = useTopicsStore();
  const { showToast } = useUIStore();

  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    fetchDocuments();
    fetchTopics();
  }, [fetchDocuments, fetchTopics]);

  const handleCreate = async (data) => {
    try {
      await createDocument(data);
      showToast('文档已创建', 'success');
    } catch (error) {
      showToast(error.message || '创建失败', 'error');
      throw error;
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这个文档吗？')) return;
    try {
      await deleteDocument(id);
      showToast('文档已删除', 'success');
    } catch (error) {
      showToast('删除失败', 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">文档</h1>
          <p className="text-surface-500 mt-1">管理你的研究文档和故事线</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors btn-press"
        >
          <Plus className="w-5 h-5" />
          新建文档
        </button>
      </div>

      {/* 文档列表 */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-44 skeleton rounded-xl" />
          ))}
        </div>
      ) : documents.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.doc_id}
              document={doc}
              onEdit={() => {}}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-xl border border-surface-100">
          <FileText className="w-12 h-12 mx-auto mb-4 text-surface-300" />
          <p className="text-surface-600 font-medium">还没有任何文档</p>
          <p className="text-surface-400 text-sm mt-1">
            基于卡片创建文档，整理你的研究思路
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
          >
            创建第一个文档
          </button>
        </div>
      )}

      {/* 创建模态框 */}
      <CreateDocumentModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreate}
        topics={topics}
      />
    </div>
  );
}

export default DocumentsPage;







