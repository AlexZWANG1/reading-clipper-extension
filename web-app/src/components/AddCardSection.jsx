import { useState, useRef, useCallback } from 'react';
import {
  Plus,
  Upload,
  Image,
  FileText,
  X,
  Loader2,
  ChevronDown,
  Link as LinkIcon,
  Tag,
} from 'lucide-react';
import { cardsApi } from '../lib/api';
import { useTopicsStore, useUIStore, useCardsStore } from '../lib/store';

const ACCEPTED_FILE_TYPES = '.pdf,.doc,.docx,.txt,.md';

function AddCardSection({ onCardAdded }) {
  const { topics } = useTopicsStore();
  const { showToast } = useUIStore();
  const { fetchCards } = useCardsStore();

  // 表单状态
  const [snippet, setSnippet] = useState('');
  const [imageData, setImageData] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [topicTitle, setTopicTitle] = useState('');

  // UI 状态
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [showOptions, setShowOptions] = useState(false);

  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  // 处理粘贴事件（支持图片）
  const handlePaste = useCallback((e) => {
    const clipboardData = e.clipboardData || window.clipboardData;
    const items = clipboardData.items;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        const reader = new FileReader();

        reader.onload = (event) => {
          setImageData(event.target.result);
          // 如果文本区为空，添加占位符
          if (!snippet.trim()) {
            setSnippet('[图片内容]');
          }
        };

        reader.readAsDataURL(file);
        break;
      }
    }
  }, [snippet]);

  // 移除图片
  const removeImage = () => {
    setImageData(null);
    if (snippet === '[图片内容]') {
      setSnippet('');
    }
  };

  // 处理文件选择
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  // 移除文件
  const removeFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 从文字/图片生成卡片
  const handleCaptureCard = async () => {
    const rawSnippet = snippet.trim();

    if (!rawSnippet && !imageData) {
      showToast('请输入内容或粘贴图片', 'error');
      return;
    }

    setLoading(true);
    setLoadingText('正在生成卡片...');

    try {
      const captureSnippet = rawSnippet === '[图片内容]' ? '' : rawSnippet;

      await cardsApi.capture({
        snippet: captureSnippet,
        imageData: imageData || null,
        sourceName: sourceName.trim() || null,
        sourceUrl: sourceUrl.trim() || null,
        topic_title: topicTitle || null,
      });

      // 重置表单
      setSnippet('');
      setImageData(null);
      setSourceName('');
      setSourceUrl('');
      setTopicTitle('');

      showToast('卡片生成成功！', 'success');

      // 刷新卡片列表
      await fetchCards();
      onCardAdded?.();
    } catch (error) {
      console.error('生成卡片失败:', error);
      showToast(error.message || '生成卡片失败', 'error');
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  // 从文件生成卡片
  const handleGenerateFromFile = async () => {
    if (!selectedFile) {
      showToast('请先选择文件', 'error');
      return;
    }

    setLoading(true);

    try {
      // 第一步：上传文件
      setLoadingText('正在上传文件...');
      const uploadResult = await cardsApi.uploadFile(selectedFile);

      if (!uploadResult.ok) {
        throw new Error(uploadResult.error || '文件上传失败');
      }

      const fileId = uploadResult.file_id;

      // 第二步：生成卡片
      setLoadingText('正在生成卡片（可能需要1-2分钟）...');
      const generateResult = await cardsApi.generateFromDocument({
        file_id: fileId,
        source_name: sourceName.trim() || selectedFile.name,
        source_url: sourceUrl.trim() || null,
        topic_title: topicTitle || null,
      });

      if (!generateResult.ok) {
        throw new Error(generateResult.error || '生成卡片失败');
      }

      const count = generateResult.count || generateResult.cards?.length || 0;

      // 重置表单
      setSelectedFile(null);
      setSourceName('');
      setSourceUrl('');
      setTopicTitle('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      showToast(`成功生成 ${count} 张卡片！`, 'success');

      // 刷新卡片列表
      await fetchCards();
      onCardAdded?.();
    } catch (error) {
      console.error('从文件生成卡片失败:', error);
      showToast(error.message || '从文件生成卡片失败', 'error');
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  // 提交处理
  const handleSubmit = () => {
    if (selectedFile) {
      handleGenerateFromFile();
    } else {
      handleCaptureCard();
    }
  };

  const canSubmit = (snippet.trim() || imageData || selectedFile) && !loading;

  const inputStyle = { background: 'var(--surface-0)', border: '1px solid var(--stroke-0)', color: 'var(--text-0)' };

  return (
    <div className="rounded-xl p-5 mb-6" style={{ background: 'var(--surface-0)', border: '1px solid var(--stroke-0)' }}>
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-0)' }}>
        <Plus className="w-5 h-5" style={{ color: 'var(--accent-400)' }} />
        添加新卡片
      </h3>

      <div className="mb-4">
        <div className="flex items-center gap-3 mb-3">
          <input ref={fileInputRef} type="file" accept={ACCEPTED_FILE_TYPES} onChange={handleFileSelect} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
            style={{ border: '1px solid var(--stroke-0)', color: 'var(--text-1)' }}
          >
            <Upload className="w-4 h-4" />
            上传文件
          </button>
          <span className="text-xs" style={{ color: 'var(--text-2)' }}>支持 PDF、Word、TXT、Markdown</span>
        </div>

        {selectedFile && (
          <div className="flex items-center gap-2 p-3 rounded-lg mb-3" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <FileText className="w-5 h-5" style={{ color: 'var(--accent-400)' }} />
            <span className="flex-1 text-sm truncate" style={{ color: 'var(--accent-300)' }}>{selectedFile.name}</span>
            <button onClick={removeFile} className="p-1 rounded" style={{ color: 'var(--text-2)' }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {!selectedFile && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px" style={{ background: 'var(--stroke-1)' }} />
            <span className="text-xs" style={{ color: 'var(--text-2)' }}>或</span>
            <div className="flex-1 h-px" style={{ background: 'var(--stroke-1)' }} />
          </div>

          <div className="mb-4">
            <textarea
              ref={textareaRef}
              value={snippet}
              onChange={(e) => setSnippet(e.target.value)}
              onPaste={handlePaste}
              placeholder="在此粘贴文字内容或图片...（支持 Ctrl+V 粘贴图片）"
              rows={4}
              disabled={loading}
              className="w-full px-4 py-3 rounded-xl input-focus resize-none disabled:opacity-50"
              style={inputStyle}
            />
          </div>

          {imageData && (
            <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--stroke-0)' }}>
              <div className="flex items-start gap-3">
                <img src={imageData} alt="预览图片" className="max-w-[200px] max-h-[150px] rounded-lg object-cover" style={{ border: '1px solid var(--stroke-0)' }} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm mb-2" style={{ color: 'var(--text-1)' }}>
                    <Image className="w-4 h-4" />
                    已粘贴图片
                  </div>
                  <button onClick={removeImage} disabled={loading} className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors disabled:opacity-50" style={{ color: '#FB7185' }}>
                    <X className="w-3 h-3" />
                    移除图片
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="mb-4">
        <button
          onClick={() => setShowOptions(!showOptions)}
          className="flex items-center gap-1 text-sm transition-colors"
          style={{ color: 'var(--text-2)' }}
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${showOptions ? 'rotate-180' : ''}`} />
          更多选项（来源、Topic）
        </button>

        {showOptions && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>
                <LinkIcon className="w-3 h-3 inline mr-1" />来源名称
              </label>
              <input type="text" value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="文章标题/网站名称" disabled={loading} className="w-full px-3 py-2 text-sm rounded-lg input-focus disabled:opacity-50" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>
                <LinkIcon className="w-3 h-3 inline mr-1" />来源链接
              </label>
              <input type="text" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." disabled={loading} className="w-full px-3 py-2 text-sm rounded-lg input-focus disabled:opacity-50" style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>
                <Tag className="w-3 h-3 inline mr-1" />归属 Topic
              </label>
              <select value={topicTitle} onChange={(e) => setTopicTitle(e.target.value)} disabled={loading} className="w-full px-3 py-2 text-sm rounded-lg input-focus cursor-pointer disabled:opacity-50" style={inputStyle}>
                <option value="">选择 Topic...</option>
                {topics.map((topic) => (<option key={topic.id} value={topic.title}>{topic.title}</option>))}
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: 'var(--text-2)' }}>
          {selectedFile ? '将从文件中提取内容并生成多张卡片' : '将根据内容自动生成摘要和要点'}
        </p>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex items-center gap-2 px-4 py-2.5 font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'var(--accent-600)', color: '#ffffff' }}
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" />{loadingText || '处理中...'}</>
          ) : (
            <><Plus className="w-4 h-4" />{selectedFile ? '从文件生成卡片' : '生成并添加卡片'}</>
          )}
        </button>
      </div>
    </div>
  );
}

export default AddCardSection;





