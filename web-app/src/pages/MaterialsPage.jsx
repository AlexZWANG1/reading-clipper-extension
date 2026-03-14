import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  FileText,
  ExternalLink,
  Clock,
  Trash2,
  MoreVertical,
  FileType,
  Plus,
  X,
  Link as LinkIcon,
  Upload,
  Loader2,
  CheckCircle,
} from 'lucide-react';
import { materialsApi } from '../lib/api';
import { useUIStore } from '../lib/store';
import { extractHostname } from '../lib/ui-utils';

export default function MaterialsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const topicId = searchParams.get('topic');
  const { showToast } = useUIStore();

  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadType, setUploadType] = useState('url');
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadText, setUploadText] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const loadRequestRef = useRef(0);

  const loadMaterials = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    try {
      setLoading(true);
      const params = {};
      if (topicId) params.topic_id = topicId;
      const response = await materialsApi.list(params);
      if (requestId !== loadRequestRef.current) return;
      setMaterials(response.materials || []);
    } catch (error) {
      if (requestId !== loadRequestRef.current) return;
      console.error('Failed to load materials:', error);
    } finally {
      if (requestId !== loadRequestRef.current) return;
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    loadMaterials();
    return () => {
      loadRequestRef.current += 1;
    };
  }, [loadMaterials]);

  // Status polling for pending/processing materials
  useEffect(() => {
    const pendingIds = materials
      .filter(m => ['pending', 'processing'].includes(m.ingestion_status))
      .map(m => m.id);

    if (pendingIds.length === 0) return;

    const interval = setInterval(async () => {
      let changed = false;
      const updated = [...materials];
      for (const id of pendingIds) {
        try {
          const latest = await materialsApi.get(id);
          const idx = updated.findIndex(m => m.id === id);
          if (idx >= 0 && updated[idx].ingestion_status !== latest.ingestion_status) {
            updated[idx] = latest;
            changed = true;
          }
        } catch {}
      }
      if (changed) setMaterials(updated);
    }, 5000);

    return () => clearInterval(interval);
  }, [materials]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      showToast('文件大小不能超过 50MB', 'error');
      return;
    }
    try {
      await materialsApi.upload(file, topicId || undefined);
      showToast('文件上传成功，正在后台处理...', 'success');
      loadMaterials();
    } catch (error) {
      console.error('Drop upload failed:', error);
      showToast('上传失败：' + (error.message || '未知错误'), 'error');
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
      showToast('材料已删除', 'success');
    } catch (error) {
      console.error('Failed to delete material:', error);
      showToast('删除失败', 'error');
    }
  };

  const handleUpload = async () => {
    if (uploading) return;

    if (uploadType === 'url' && !uploadUrl.trim()) {
      showToast('请输入 URL', 'error');
      return;
    }
    if (uploadType === 'text' && !uploadText.trim()) {
      showToast('请输入文本内容', 'error');
      return;
    }
    if (uploadType === 'file' && !uploadFile) {
      showToast('请选择文件', 'error');
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
        // Client-side size validation
        if (uploadFile.size > 50 * 1024 * 1024) {
          showToast('文件大小不能超过 50MB', 'error');
          return;
        }
        // Use FormData upload for binary files (PDF, DOCX, etc.)
        await materialsApi.upload(uploadFile, topicId || undefined);
        setUploadSuccess(true);
        setTimeout(() => {
          setShowUploadModal(false);
          setUploadSuccess(false);
          resetUploadForm();
          loadMaterials();
        }, 1200);
        return; // Skip the shared ingest path below
      }

      await materialsApi.ingest(payload);
      setUploadSuccess(true);
      setTimeout(() => {
        setShowUploadModal(false);
        setUploadSuccess(false);
        resetUploadForm();
        loadMaterials();
      }, 1200);
    } catch (error) {
      console.error('Upload failed:', error);
      showToast('上传失败：' + (error.message || '未知错误'), 'error');
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

  const STATUS_LABELS = {
    pending: '等待中',
    processing: '处理中',
    completed: '已完成',
    failed: '失败',
  };

  const STATUS_COLORS = {
    pending: { bg: 'rgba(245,158,11,0.08)', color: 'var(--warning)' },
    processing: { bg: 'rgba(37,99,235,0.08)', color: 'var(--accent-blue)' },
    completed: { bg: 'rgba(16,185,129,0.08)', color: 'var(--success)' },
    failed: { bg: 'rgba(220,38,38,0.08)', color: 'var(--error)' },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>来源库</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {filteredMaterials.length} 个材料
          </p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          添加材料
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
        <input
          id="materials-search"
          name="materials_search"
          type="text"
          aria-label="Search materials"
          placeholder="搜索材料..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input w-full pl-11"
        />
      </div>

      {/* Materials list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 skeleton rounded-lg" />
          ))}
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="card text-center py-16">
          <FileText className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
          <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>暂无材料</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>使用浏览器插件保存整页内容</p>
        </div>
      ) : (
        <div
          className="space-y-2"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={isDragOver ? {
            outline: '2px dashed var(--interactive-primary)',
            borderRadius: '8px',
            background: 'rgba(37,99,235,0.04)',
          } : undefined}
        >
          {filteredMaterials.map((material) => (
            <MaterialItem
              key={material.id}
              material={material}
              statusLabels={STATUS_LABELS}
              statusColors={STATUS_COLORS}
              onDelete={handleDelete}
              onClick={() => navigate(`/materials/${material.id}`)}
            />
          ))}
          {isDragOver && (
            <div className="text-center py-6 text-sm" style={{ color: 'var(--interactive-primary)' }}>
              释放以上传文件
            </div>
          )}
        </div>
      )}

      {/* Upload modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div
            className="rounded-xl shadow-lg w-full max-w-lg mx-4 p-6 animate-slide-up"
            style={{ background: '#fff', border: '1px solid var(--border-primary)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {uploadSuccess ? (
              <div className="flex flex-col items-center py-8 gap-3">
                <CheckCircle className="w-10 h-10" style={{ color: 'var(--success)' }} />
                <p className="font-medium" style={{ color: 'var(--text-primary)' }}>材料已添加</p>
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>正在后台处理...</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>添加材料</h3>
                  <button
                    onClick={() => { setShowUploadModal(false); resetUploadForm(); }}
                    className="p-1.5 rounded-lg transition-colors cursor-pointer"
                    aria-label="Close upload modal"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Type selector */}
                <div className="flex gap-2 mb-5">
                  {[
                    { key: 'url', icon: LinkIcon, label: 'URL' },
                    { key: 'file', icon: Upload, label: '文件' },
                    { key: 'text', icon: FileText, label: '文本' },
                  ].map(({ key, icon: Icon, label }) => (
                    <button
                      key={key}
                      onClick={() => setUploadType(key)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                      style={{
                        border: uploadType === key ? '2px solid var(--interactive-primary)' : '2px solid var(--border-primary)',
                        background: uploadType === key ? 'var(--bg-muted)' : 'transparent',
                        color: uploadType === key ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>

                {/* Title */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>标题（可选）</label>
                  <input
                    id="material-upload-title"
                    name="material_upload_title"
                    aria-label="Material title"
                    type="text"
                    placeholder="留空则自动提取"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    className="input w-full"
                  />
                </div>

                {/* URL input */}
                {uploadType === 'url' && (
                  <div className="mb-5">
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>网页地址</label>
                    <input
                      id="material-upload-url"
                      name="material_upload_url"
                      aria-label="Material URL"
                      type="url"
                      placeholder="https://example.com/article"
                      value={uploadUrl}
                      onChange={(e) => setUploadUrl(e.target.value)}
                      className="input w-full"
                    />
                  </div>
                )}

                {/* File input */}
                {uploadType === 'file' && (
                  <div className="mb-5">
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>选择文件</label>
                    <input
                      id="material-upload-file"
                      name="material_upload_file"
                      aria-label="Material file upload"
                      type="file"
                      accept=".pdf,.docx,.pptx,.txt,.md"
                      onChange={(e) => setUploadFile(e.target.files[0])}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }}
                    />
                    <p className="text-xs mt-1.5" style={{ color: 'var(--text-tertiary)' }}>支持 PDF、Word、PPT、TXT、Markdown</p>
                  </div>
                )}

                {/* Text input */}
                {uploadType === 'text' && (
                  <div className="mb-5">
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>文本内容</label>
                    <textarea
                      id="material-upload-text"
                      name="material_upload_text"
                      aria-label="Material text content"
                      placeholder="粘贴或输入文本内容..."
                      value={uploadText}
                      onChange={(e) => setUploadText(e.target.value)}
                      rows={8}
                      className="w-full px-3 py-2 rounded-lg input-focus text-sm resize-none"
                      style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }}
                    />
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => { setShowUploadModal(false); resetUploadForm(); }}
                    className="px-4 py-2 text-sm rounded-lg transition-colors cursor-pointer"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    取消
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
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

function MaterialItem({ material, statusLabels, statusColors, onDelete, onClick }) {
  const [showMenu, setShowMenu] = useState(false);

  const sourceTypeIcon = {
    url: ExternalLink,
    file: FileType,
    text: FileText,
  };
  const Icon = sourceTypeIcon[material.source_type] || FileText;
  const status = statusColors[material.ingestion_status] || statusColors.pending;

  return (
    <div
      className="card card-hover cursor-pointer group p-4"
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: 'var(--bg-muted)' }}
        >
          <Icon className="w-4 h-4" style={{ color: 'var(--interactive-primary)' }} />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
            {material.title || '无标题'}
          </h3>

          {material.excerpt && (
            <p className="text-sm line-clamp-2 mt-1" style={{ color: 'var(--text-secondary)' }}>
              {material.excerpt}
            </p>
          )}

          <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(material.created_at).toLocaleDateString('zh-CN')}
            </span>

            {material.word_count > 0 && (
              <span>{material.word_count.toLocaleString()} 字</span>
            )}

            {material.chunk_count > 0 && (
              <span>{material.chunk_count} 段</span>
            )}

            <span
              className="badge badge-status px-1.5 py-0.5 rounded text-[11px] font-medium"
              style={{ background: status.bg, color: status.color }}
            >
              {statusLabels[material.ingestion_status] || '等待中'}
            </span>
          </div>

          {material.url && (
            <a
              href={material.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs mt-2 inline-flex items-center gap-1 transition-colors hover:underline"
              style={{ color: 'var(--interactive-primary)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {extractHostname(material.url)}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            className="p-1.5 rounded-lg opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
            aria-label="Open material actions"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div
                className="absolute right-0 top-full mt-1 z-20 rounded-lg shadow-lg py-1 min-w-[120px]"
                style={{ background: 'var(--surface)', border: '1px solid var(--border-primary)' }}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(material.id); setShowMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors cursor-pointer"
                  style={{ color: 'var(--error)' }}
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
