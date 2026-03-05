import { useRef, useEffect, useState } from 'react';
import DOMPurify from 'dompurify';

/**
 * ReaderContent — 渲染 material 正文（DOMPurify 防 XSS）
 * Props:
 *   text: string — material.full_text（纯文本或 HTML）
 *   chunks: array — 已加载的 chunks，用于计算选中文本所在 chunk
 *   cardHighlights: array — 需高亮的卡片 locators [{ chunk_id, chunk_relative_start, chunk_relative_end, quote_selector }]
 *   focusChunkIds: array — Focus Lens 命中的 chunk_id 列表
 *   onSelection: fn(selectionData) — 用户选中文本后回调
 */
export default function ReaderContent({ text, chunks, cardHighlights = [], focusChunkIds = [], onSelection }) {
  const contentRef = useRef(null);
  const [renderedHtml, setRenderedHtml] = useState('');

  // 1. 将 full_text 处理为安全 HTML
  useEffect(() => {
    if (!text) {
      setRenderedHtml('');
      return;
    }
    // 如果 full_text 包含 HTML 标签则视为 HTML，否则按纯文本处理（换行→<br>）
    const isHtml = /<[a-z][\s\S]*>/i.test(text);
    let html;
    if (isHtml) {
      html = DOMPurify.sanitize(text, {
        ALLOWED_TAGS: [
          'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'mark',
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'ul', 'ol', 'li',
          'blockquote', 'q', 'cite',
          'a', 'img', 'figure', 'figcaption',
          'code', 'pre',
          'table', 'thead', 'tbody', 'tr', 'th', 'td',
          'div', 'span',
        ],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target'],
        ALLOW_DATA_ATTR: false,
        KEEP_CONTENT: true,
      });
    } else {
      html = text
        .split('\n')
        .map(line => line.trim() ? `<p>${line}</p>` : '<br>')
        .join('');
    }
    setRenderedHtml(html);
  }, [text]);

  // 2. 高亮已有卡片（基于 chunk_id + chunk_relative_offsets 或 quote_selector）
  useEffect(() => {
    if (!contentRef.current || !renderedHtml || cardHighlights.length === 0) return;

    // 简单的文本高亮：通过 TextQuoteSelector 的 exact 匹配定位并 wrap <mark>
    cardHighlights.forEach(locator => {
      const exact = locator?.quote_selector?.exact;
      if (!exact || exact.length < 3) return;
      try {
        highlightTextInElement(contentRef.current, exact, 'card-highlight');
      } catch (e) {
        // 忽略定位失败
      }
    });
  }, [renderedHtml, cardHighlights]);

  // 3. Focus Lens 高亮（chunk 内容整段）
  useEffect(() => {
    if (!contentRef.current || !chunks || focusChunkIds.length === 0) return;

    focusChunkIds.forEach(chunkId => {
      const chunk = chunks.find(c => c.id === chunkId);
      if (!chunk?.content || chunk.content.length < 5) return;
      // 取 chunk 内容前60字作为匹配锚点
      const anchor = chunk.content.slice(0, 60).trim();
      try {
        highlightTextInElement(contentRef.current, anchor, 'focus-highlight');
      } catch (e) {
        // 忽略定位失败
      }
    });
  }, [renderedHtml, focusChunkIds, chunks]);

  // 4. 监听文本选择
  const handleMouseUp = () => {
    if (!onSelection) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      onSelection(null);
      return;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText || selectedText.length < 2) {
      onSelection(null);
      return;
    }

    // 获取选区位置（用于定位浮窗）
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // 生成 TextQuoteSelector
    const containerText = contentRef.current?.innerText || '';
    const selectionStart = containerText.indexOf(selectedText);
    const prefix = selectionStart > 0
      ? containerText.slice(Math.max(0, selectionStart - 32), selectionStart)
      : '';
    const suffix = containerText.slice(
      selectionStart + selectedText.length,
      selectionStart + selectedText.length + 32
    );

    // 查找所在 chunk
    let matchedChunk = null;
    let chunkRelativeStart = null;
    let chunkRelativeEnd = null;

    if (chunks && chunks.length > 0) {
      for (const chunk of chunks) {
        const idx = chunk.content.indexOf(selectedText);
        if (idx !== -1) {
          matchedChunk = chunk;
          chunkRelativeStart = idx;
          chunkRelativeEnd = idx + selectedText.length;
          break;
        }
      }
    }

    onSelection({
      exact: selectedText,
      prefix,
      suffix,
      chunk_id: matchedChunk?.id || null,
      chunk_relative_start: chunkRelativeStart,
      chunk_relative_end: chunkRelativeEnd,
      rect,
    });
  };

  if (!text) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <p>该材料暂无可读取的正文内容</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <style>{`
        .card-highlight {
          background-color: #fef08a;
          border-radius: 2px;
          cursor: pointer;
          padding: 0 1px;
        }
        .focus-highlight {
          border-left: 3px solid #f97316;
          background-color: #fff7ed;
          padding-left: 8px;
          margin-left: -11px;
          display: block;
        }
        .reader-body {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 18px;
          line-height: 1.85;
          color: #1f2937;
          max-width: 700px;
          margin: 0 auto;
        }
        .reader-body p { margin-bottom: 1.2em; }
        .reader-body h1, .reader-body h2, .reader-body h3 {
          font-family: system-ui, sans-serif;
          font-weight: 700;
          margin: 1.5em 0 0.5em;
          color: #111827;
        }
        .reader-body a { color: #4f46e5; }
        .reader-body blockquote {
          border-left: 3px solid #e5e7eb;
          padding-left: 1em;
          margin: 0;
          color: #6b7280;
          font-style: italic;
        }
        .reader-body img { max-width: 100%; height: auto; border-radius: 4px; }
        .reader-body pre, .reader-body code {
          font-family: monospace;
          background: #f3f4f6;
          border-radius: 4px;
          font-size: 0.9em;
        }
        .reader-body pre { padding: 1em; overflow-x: auto; }
        .reader-body code { padding: 2px 4px; }
      `}</style>
      <div
        ref={contentRef}
        className="reader-body px-4 py-6 select-text"
        onMouseUp={handleMouseUp}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </div>
  );
}

// 工具函数：在 element 内查找 text 并 wrap 成 <mark class=className>
function highlightTextInElement(element, text, className) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
  const nodesToProcess = [];

  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeValue.includes(text)) {
      nodesToProcess.push(node);
    }
  }

  nodesToProcess.forEach(textNode => {
    const idx = textNode.nodeValue.indexOf(text);
    if (idx === -1) return;

    const before = textNode.nodeValue.slice(0, idx);
    const after = textNode.nodeValue.slice(idx + text.length);

    const mark = document.createElement('mark');
    mark.className = className;
    mark.textContent = text;

    const parent = textNode.parentNode;
    if (!parent) return;

    const fragment = document.createDocumentFragment();
    if (before) fragment.appendChild(document.createTextNode(before));
    fragment.appendChild(mark);
    if (after) fragment.appendChild(document.createTextNode(after));

    parent.replaceChild(fragment, textNode);
  });
}
