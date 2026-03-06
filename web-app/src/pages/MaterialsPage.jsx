import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  FileText,
  ExternalLink,
  Clock,
  Trash2,
  MoreVertical,
  BookOpen,
  FileType,
  Plus,
  X,
  Link as LinkIcon,
  Upload,
  Loader2,
  CheckCircle,
} from 'lucide-react';
import { materialsApi } from '../lib/api';
import TopicsSidebar from '../components/TopicsSidebar';

export default function MaterialsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const topicId = searchParams.get('topic');

  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // 上传弹窗状态
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadType, setUploadType] = useState('url'); // 'url' | 'file' | 'text'
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadText, setUploadText] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  useEffect(() => {
    loadMaterials();
  }, [topicId]);

  const loadMaterials = async () => {
    try {
      setLoading(true);
      const params = {};
      if (topicId) params.topic_id = topicId;

      const response = await materialsApi.list(params);
      setMaterials(response.materials || []);
    } catch (error) {
      console.error('Failed to load materials:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredMaterials = materials.filter(m =>
    !searchQuery ||
    m.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.excerpt?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async (id) => {
    if (!confirm('确定要删除这个材料吗？关联的卡片不会被删除。')) return;

    try {
      await materialsApi.delete(id);
      setMaterials(materials.filter(m => m.id !== id));
    } catch (error) {
      console.error('Failed to delete material:', error);
      alert('删除失败');
    }
  };

  const handleUpload = async () => {
    if (uploading) return;

    // 验证输入
    if (uploadType === 'url' && !uploadUrl.trim()) {
      alert('请输入 URL');
      return;
    }
    if (uploadType === 'text' && !uploadText.trim()) {
      alert('请输入文本内容');
      return;
    }
    if (uploadType === 'file' && !uploadFile) {
      alert('请选择文件');
      return;
    }

    try {
      setUploading(true);

      let payload = {
        topic_id: topicId || undefined,
        title: uploadTitle.trim() || undefined,
      };

      if (uploadType === 'url') {
        payload.source_type = 'url';
        payload.url = uploadUrl.trim();
      } else if (uploadType === 'text') {
        payload.source_type = 'text';
        payload.text = uploadText.trim();
      } else if (uploadType === 'file') {
        // 文件上传需要先读取内容
        const text = await uploadFile.text();
        payload.source_type = 'file';
        payload.text = text;
        payload.file_path = uploadFile.name;
      }

      await materialsApi.ingest(payload);

      setUploadSuccess(true);
      setTimeout(() => {
        setShowUploadModal(false);
        setUploadSuccess(false);
        resetUploadForm();
        loadMaterials(); // 刷新列表
      }, 1500);
    } catch (error) {
      console.error('Upload failed:', error);
      alert('上传失败：' + (error.message || '未知错误'));
    } finally {
      setUploading(false);
    }
  };

  const resetUploadForm = () => {
    setUploadType('url');
    setUploadUrl('');
    setUploadText('');
    setUploadFile(null);
    setUploadTitle('');
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 左侧边栏 */}
      <TopicsSidebar />

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部搜索栏 */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="搜索材料..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              添加材料
            </button>
          </div>
        </div>

        {/* 材料列表 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="text-center py-12 text-gray-500">加载中...</div>
          ) : filteredMaterials.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>暂无材料</p>
              <p className="text-sm mt-2">使用浏览器插件保存整页内容</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredMaterials.map((material) => (
                <MaterialItem
                  key={material.id}
                  material={material}
                  onDelete={handleDelete}
                  onClick={() => navigate(`/materials/${material.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 上传弹窗 */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
            {uploadSuccess ? (
              <div className="flex flex-col items-center py-8 gap-3">
                <CheckCircle className="w-12 h-12 text-green-500" />
                <p className="text-lg font-medium text-gray-800">材料已添加</p>
                <p className="text-sm text-gray-500">正在后台处理...</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">添加材料</h3>
                  <button
                    onClick={() => {
                      setShowUploadModal(false);
                      resetUploadForm();
                    }}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>

                {/* 类型选择 */}
                <div className="flex gap-2 mb-6">
                  <button
                    onClick={() => setUploadType('url')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-colors ${
                      uploadType === 'url'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <LinkIcon className="w-4 h-4" />
                    URL
                  </button>
                  <button
                    onClick={() => setUploadType('file')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-colors ${
                      uploadType === 'file'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <Upload className="w-4 h-4" />
                    文件
                  </button>
                  <button
                    onClick={() => setUploadType('text')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-colors ${
                      uploadType === 'text'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    文本
                  </button>
                </div>

                {/* 标题输入（可选） */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    标题（可选）
                  </label>
                  <input
                    type="text"
                    placeholder="留空则自动提取"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>

                {/* URL 输入 */}
                {uploadType === 'url' && (
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      网页地址
                    </label>
                    <input
                      type="url"
                      placeholder="https://example.com/article"
                      value={uploadUrl}
                      onChange={(e) => setUploadUrl(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                )}

                {/* 文件上传 */}
                {uploadType === 'file' && (
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      选择文件
                    </label>
                    <input
                      type="file"
                      accept=".txt,.md,.pdf"
                      onChange={(e) => setUploadFile(e.target.files[0])}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <p className="text-xs text-gray-500 mt-1">支持 TXT、Markdown、PDF</p>
                  </div>
                )}

                {/* 文本输入 */}
                {uploadType === 'text' && (
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      文本内容
                    </label>
                    <textarea
                      placeholder="粘贴或输入文本内容..."
                      value={uploadText}
                      onChange={(e) => setUploadText(e.target.value)}
                      rows={8}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                    />
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowUploadModal(false);
                      resetUploadForm();
                    }}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {uploading ? '上传中...' : '添加'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MaterialItem({ material, onDelete, onClick }) {
  const [showMenu, setShowMenu] = useState(false);

  const sourceTypeIcon = {
    url: ExternalLink,
    file: FileType,
    text: FileText,
  };

  const Icon = sourceTypeIcon[material.source_type] || FileText;

  const statusColor = {
    pending: 'text-yellow-600 bg-yellow-50',
    processing: 'text-blue-600 bg-blue-50',
    completed: 'text-green-600 bg-green-50',
    failed: 'text-red-600 bg-red-50',
  };

  return (
    <div
      className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start gap-4">
        {/* 图标 */}
        <div className="flex-shrink-0 w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
          <Icon className="w-5 h-5 text-indigo-600" />
        </div>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          {/* 标题 */}
          <h3 className="text-lg font-medium text-gray-900 mb-1 truncate">
            {material.title || '无标题'}
          </h3>

          {/* 摘要 */}
          {material.excerpt && (
            <p className="text-sm text-gray-600 line-clamp-2 mb-2">
              {material.excerpt}
            </p>
          )}

          {/* 元信息 */}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(material.created_at).toLocaleDateString('zh-CN')}
            </span>

            {material.word_count && (
              <span>{material.word_count.toLocaleString()} 字</span>
            )}

            {material.chunk_count > 0 && (
              <span>{material.chunk_count} 个片段</span>
            )}

            <span className={`px-2 py-0.5 rounded-full ${statusColor[material.ingestion_status] || ''}`}>
              {material.ingestion_status === 'completed' ? '已完成' :
               material.ingestion_status === 'processing' ? '处理中' :
               material.ingestion_status === 'failed' ? '失败' : '等待中'}
            </span>
          </div>

          {/* 来源链接 */}
          {material.url && (
            <a
              href={material.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-600 hover:underline mt-2 inline-block"
              onClick={(e) => e.stopPropagation()}
            >
              查看原文 ↗
            </a>
          )}
        </div>

        {/* 操作菜单 */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <MoreVertical className="w-5 h-5 text-gray-400" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-8 z-20 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[120px]">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(material.id);
                    setShowMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  删除
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
