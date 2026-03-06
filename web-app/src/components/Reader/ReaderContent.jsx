'use client';

import { useRef, useEffect, useState } from 'react';
import DOMPurify from 'dompurify';

const SAVED_HIGHLIGHT_BG = {
  yellow: 'rgba(250, 204, 21, 0.35)',
  green: 'rgba(74, 222, 128, 0.32)',
  blue: 'rgba(96, 165, 250, 0.30)',
  pink: 'rgba(244, 114, 182, 0.30)',
};

function normalizeHighlightText(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function buildSearchCandidates(text) {
  const normalized = normalizeHighlightText(text);
  if (!normalized) return [];
  const candidates = [normalized];
  if (normalized.length > 120) candidates.push(normalized.slice(0, 120));
  if (normalized.length > 80) candidates.push(normalized.slice(0, 80));
  return [...new Set(candidates)];
}

function normalizeTextWithMap(rawText) {
  let normalized = '';
  const map = [];
  let inWhitespace = false;

  for (let i = 0; i < rawText.length; i += 1) {
    const ch = rawText[i];
    if (/\s/.test(ch)) {
      if (!inWhitespace) {
        normalized += ' ';
        map.push(i);
        inWhitespace = true;
      }
      continue;
    }

    normalized += ch;
    map.push(i);
    inWhitespace = false;
  }

  while (normalized.startsWith(' ')) {
    normalized = normalized.slice(1);
    map.shift();
  }

  while (normalized.endsWith(' ')) {
    normalized = normalized.slice(0, -1);
    map.pop();
  }

  return { text: normalized, map };
}

function normalizedRangeToRawRange(indexMap, normalizedStart, normalizedLength) {
  if (!indexMap || indexMap.length === 0 || normalizedLength <= 0) return null;

  const safeStart = Math.max(0, Math.min(normalizedStart, indexMap.length - 1));
  const safeEndExclusive = Math.max(
    safeStart + 1,
    Math.min(normalizedStart + normalizedLength, indexMap.length)
  );

  const rawStart = indexMap[safeStart];
  const rawEnd = indexMap[safeEndExclusive - 1] + 1;
  return { start: rawStart, end: rawEnd };
}

function clearInjectedHighlights(container) {
  if (!container) return;
  const marks = container.querySelectorAll('mark[data-rc-highlight="true"]');
  marks.forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent || ''));
  });
  container.normalize();
}

function buildTextIndex(container) {
  const nodes = [];
  let fullText = '';
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_SKIP;
        if (node.parentElement?.closest('mark[data-rc-highlight="true"]')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  let current = walker.nextNode();
  while (current) {
    const value = current.nodeValue;
    const start = fullText.length;
    fullText += value;
    nodes.push({ node: current, start, end: fullText.length });
    current = walker.nextNode();
  }

  return { fullText, nodes };
}

function locateTextPosition(nodes, index) {
  if (!nodes.length) return null;

  if (index <= 0) return { node: nodes[0].node, offset: 0 };

  const totalLength = nodes[nodes.length - 1].end;
  const safeIndex = Math.max(0, Math.min(index, totalLength));

  for (const item of nodes) {
    if (safeIndex >= item.start && safeIndex <= item.end) {
      return { node: item.node, offset: safeIndex - item.start };
    }
  }

  const last = nodes[nodes.length - 1];
  return { node: last.node, offset: last.node.nodeValue.length };
}

function scoreContextMatch(normalizedFullText, matchStart, exactLength, prefix, suffix) {
  let score = 0;

  if (prefix) {
    const before = normalizedFullText.slice(
      Math.max(0, matchStart - Math.max(prefix.length + 24, 24)),
      matchStart
    );
    if (before.endsWith(prefix)) {
      score += 6;
    } else {
      const prefixProbe = prefix.slice(-Math.min(prefix.length, 16));
      if (prefixProbe && before.includes(prefixProbe)) score += 3;
    }
  }

  if (suffix) {
    const after = normalizedFullText.slice(
      matchStart + exactLength,
      matchStart + exactLength + Math.max(suffix.length + 24, 24)
    );
    if (after.startsWith(suffix)) {
      score += 6;
    } else {
      const suffixProbe = suffix.slice(0, Math.min(suffix.length, 16));
      if (suffixProbe && after.includes(suffixProbe)) score += 3;
    }
  }

  if (!prefix && !suffix) {
    score += 1;
  }

  return score;
}

function findRangeByQuote(container, target, fromIndex = 0) {
  const exactCandidates = buildSearchCandidates(target?.exact || target);
  if (exactCandidates.length === 0) return null;

  const { fullText, nodes } = buildTextIndex(container);
  if (!fullText || !nodes.length) return null;

  const normalizedFull = normalizeTextWithMap(fullText);
  if (!normalizedFull.text) return null;

  const prefix = normalizeHighlightText(target?.prefix);
  const suffix = normalizeHighlightText(target?.suffix);

  let bestMatch = null;

  for (const candidate of exactCandidates) {
    let cursor = Math.max(0, fromIndex);
    while (cursor < normalizedFull.text.length) {
      const idx = normalizedFull.text.indexOf(candidate, cursor);
      if (idx === -1) break;

      const score = scoreContextMatch(normalizedFull.text, idx, candidate.length, prefix, suffix);
      const record = {
        normalizedStart: idx,
        normalizedEnd: idx + candidate.length,
        score,
      };

      if (
        !bestMatch ||
        record.score > bestMatch.score ||
        (record.score === bestMatch.score && record.normalizedStart < bestMatch.normalizedStart)
      ) {
        bestMatch = record;
      }

      if (score >= 12) break;
      cursor = idx + candidate.length;
    }

    if (bestMatch?.score >= 12) break;
  }

  if (!bestMatch) return null;

  const rawRange = normalizedRangeToRawRange(
    normalizedFull.map,
    bestMatch.normalizedStart,
    bestMatch.normalizedEnd - bestMatch.normalizedStart
  );
  if (!rawRange) return null;

  const startPos = locateTextPosition(nodes, rawRange.start);
  const endPos = locateTextPosition(nodes, rawRange.end);
  if (!startPos || !endPos) return null;

  const range = document.createRange();
  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset);

  if (range.collapsed) return null;
  return { range, endIndex: bestMatch.normalizedEnd };
}

function styleForHighlightTarget(target) {
  const base = {
    borderRadius: '3px',
    padding: '0',
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
  };

  if (target.kind === 'card') {
    return {
      ...base,
      backgroundColor: 'rgba(99, 102, 241, 0.30)',
      borderBottom: '2px solid rgba(79, 70, 229, 0.65)',
    };
  }

  if (target.kind === 'focus') {
    return {
      ...base,
      backgroundColor: 'rgba(251, 146, 60, 0.28)',
      borderBottom: '2px solid rgba(249, 115, 22, 0.60)',
    };
  }

  return {
    ...base,
    backgroundColor: SAVED_HIGHLIGHT_BG[target.color] || SAVED_HIGHLIGHT_BG.yellow,
  };
}

function applyHighlightRange(range, target) {
  try {
    const mark = document.createElement('mark');
    mark.dataset.rcHighlight = 'true';
    mark.dataset.highlightKind = target.kind;
    if (target.id) mark.dataset.highlightId = String(target.id);
    Object.assign(mark.style, styleForHighlightTarget(target));

    const fragment = range.extractContents();
    mark.appendChild(fragment);
    range.insertNode(mark);
    return true;
  } catch {
    return false;
  }
}

function buildFocusTargets(chunks, focusChunkIds) {
  if (!Array.isArray(focusChunkIds) || focusChunkIds.length === 0) return [];
  const chunkIdSet = new Set(focusChunkIds);

  return (chunks || [])
    .filter((chunk) => chunkIdSet.has(chunk.id))
    .map((chunk, index) => {
      const quoteText = normalizeHighlightText(chunk?.quote);
      const contentPreview = normalizeHighlightText(
        chunk?.content ? String(chunk.content).slice(0, 180) : ''
      );
      const exact = quoteText || contentPreview;
      if (!exact) return null;
      return {
        id: `focus-${chunk.id || index}`,
        kind: 'focus',
        exact,
      };
    })
    .filter(Boolean);
}

export default function ReaderContent({
  material,
  chunks = [],
  highlights = [],
  cardHighlights = [],
  activeCardHighlightId = null,
  focusChunkIds = [],
  onSelection,
}) {
  const contentRef = useRef(null);
  const [renderedHtml, setRenderedHtml] = useState('');

  // Render article HTML
  useEffect(() => {
    // Prioritize article_html, fallback to text_content or full_text
    const content = material.article_html || material.text_content || material.full_text;

    if (!content) {
      setRenderedHtml('');
      return;
    }

    const isHtml = /<[a-z][\s\S]*>/i.test(content);
    let html;

    if (isHtml) {
      html = DOMPurify.sanitize(content, {
        ALLOWED_TAGS: [
          'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'mark',
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'ul', 'ol', 'li',
          'blockquote', 'q', 'cite',
          'a', 'img', 'figure', 'figcaption', 'picture', 'source',
          'code', 'pre',
          'table', 'thead', 'tbody', 'tr', 'th', 'td',
          'div', 'span', 'article', 'section',
        ],
        ALLOWED_ATTR: ['href', 'src', 'srcset', 'alt', 'title', 'target', 'class', 'loading', 'width', 'height'],
        ALLOW_DATA_ATTR: false,
        KEEP_CONTENT: true,
      });
    } else {
      // Plain text fallback
      html = content
        .split('\n')
        .map(line => line.trim() ? `<p>${line}</p>` : '<br>')
        .join('');
    }

    setRenderedHtml(html);
  }, [material]);

  // Render persisted highlights / card anchors / focus chunks
  useEffect(() => {
    const container = contentRef.current;
    if (!container || !renderedHtml) return;

    clearInjectedHighlights(container);

    const savedTargets = (highlights || [])
      .map((item, index) => {
        const exact = normalizeHighlightText(item?.exact);
        if (!exact) return null;
        return {
          id: item?.id || `saved-${index}`,
          kind: 'saved',
          color: item?.color || 'yellow',
          exact,
          prefix: normalizeHighlightText(item?.prefix),
          suffix: normalizeHighlightText(item?.suffix),
        };
      })
      .filter(Boolean);

    const cardTargets = (cardHighlights || [])
      .map((item, index) => {
        const exact = normalizeHighlightText(item?.exact);
        if (!exact) return null;
        return {
          id: item?.id || `card-${index}`,
          kind: 'card',
          exact,
          prefix: normalizeHighlightText(item?.prefix),
          suffix: normalizeHighlightText(item?.suffix),
        };
      })
      .filter(Boolean);

    const focusTargets = buildFocusTargets(chunks, focusChunkIds);
    const targets = [...savedTargets, ...cardTargets, ...focusTargets];
    if (targets.length === 0) return;

    const cursorByText = new Map();
    for (const target of targets) {
      const cursorKey = `${target.exact}::${target.prefix || ''}::${target.suffix || ''}`;
      const currentCursor = cursorByText.get(cursorKey) || 0;
      const match =
        findRangeByQuote(container, target, currentCursor) ||
        findRangeByQuote(container, target, 0);

      if (!match) continue;
      if (applyHighlightRange(match.range, target)) {
        cursorByText.set(cursorKey, match.endIndex);
      }
    }

    if (activeCardHighlightId) {
      const targetMark = Array.from(
        container.querySelectorAll('mark[data-highlight-id]')
      ).find((el) => el.dataset.highlightId === String(activeCardHighlightId));

      if (targetMark) {
        targetMark.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        if (typeof targetMark.animate === 'function') {
          targetMark.animate(
            [
              { boxShadow: '0 0 0 0 rgba(79,70,229,0.0)' },
              { boxShadow: '0 0 0 6px rgba(79,70,229,0.28)' },
              { boxShadow: '0 0 0 0 rgba(79,70,229,0.0)' },
            ],
            { duration: 700, easing: 'ease-out' }
          );
        }
      }
    }
  }, [renderedHtml, highlights, cardHighlights, activeCardHighlightId, focusChunkIds, chunks]);

  // Handle text selection
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

    const range = selection.getRangeAt(0);
    if (contentRef.current && !contentRef.current.contains(range.commonAncestorContainer)) {
      onSelection(null);
      return;
    }
    const rect = range.getBoundingClientRect();

    // Generate TextQuoteSelector
    const containerText = contentRef.current?.innerText || '';
    const preRange = range.cloneRange();
    preRange.selectNodeContents(contentRef.current);
    preRange.setEnd(range.startContainer, range.startOffset);
    const selectionStart = preRange.toString().length;
    const prefix = selectionStart > 0
      ? containerText.slice(Math.max(0, selectionStart - 32), selectionStart)
      : '';
    const suffix = containerText.slice(
      selectionStart + selectedText.length,
      selectionStart + selectedText.length + 32
    );

    // Find matching chunk
    let matchedChunk = null;
    let chunkRelativeStart = null;
    let chunkRelativeEnd = null;

    for (const chunk of chunks) {
      const chunkText = chunk?.content || '';
      const idx = chunkText.indexOf(selectedText);
      if (idx !== -1) {
        matchedChunk = chunk;
        chunkRelativeStart = idx;
        chunkRelativeEnd = idx + selectedText.length;
        break;
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

  if (!renderedHtml) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <p>该材料暂无可读取的正文内容</p>
      </div>
    );
  }

  return (
    <article className="reader-container">
      {/* Hero Image */}
      {material.lead_image_url && (
        <div className="reader-hero-image">
          <img
            src={material.lead_image_url}
            alt={material.title}
            loading="eager"
            className="w-full h-auto object-cover max-h-[480px] rounded-xl"
          />
        </div>
      )}

      {/* Article Header */}
      <header className="reader-header">
        <h1 className="reader-title">{material.title}</h1>

        {(material.byline || material.site_name || material.published_time) && (
          <div className="reader-meta">
            {material.byline && <span className="reader-author">{material.byline}</span>}
            {material.site_name && <span className="reader-site">{material.site_name}</span>}
            {material.published_time && (
              <time className="reader-date">
                {new Date(material.published_time).toLocaleDateString('zh-CN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </time>
            )}
          </div>
        )}

        {/* Extraction status indicator */}
        {material.extraction_status && material.extraction_status !== 'success' && (
          <div className="mt-3 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
            {material.extraction_status === 'partial' && '⚠️ 内容提取不完整，可能缺少部分格式'}
            {material.extraction_status === 'failed' && '❌ 内容提取失败，显示原始文本'}
          </div>
        )}
      </header>

      {/* Article Content */}
      <div
        ref={contentRef}
        className="reader-prose"
        onMouseUp={handleMouseUp}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />

      {/* Source Link */}
      {material.url && (
        <footer className="reader-footer">
          <a
            href={material.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-indigo-600 hover:text-indigo-700 underline"
          >
            查看原文 →
          </a>
        </footer>
      )}

      <style jsx>{`
        /* Reader Container */
        .reader-container {
          max-width: 720px;
          margin: 0 auto;
          padding: 2rem 1.5rem;
        }

        /* Hero Image */
        .reader-hero-image {
          margin: 0 -1.5rem 2.5rem;
          overflow: hidden;
        }

        /* Article Header */
        .reader-header {
          margin-bottom: 2.5rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .reader-title {
          font-size: 2.25rem;
          font-weight: 800;
          line-height: 1.2;
          color: #111827;
          margin-bottom: 1rem;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        .reader-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          font-size: 0.875rem;
          color: #6b7280;
        }

        .reader-author {
          font-weight: 600;
          color: #374151;
        }

        .reader-site::before,
        .reader-date::before {
          content: '•';
          margin-right: 0.75rem;
          color: #d1d5db;
        }

        /* Article Prose */
        :global(.reader-prose) {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 1.125rem;
          line-height: 1.75;
          color: #1f2937;
        }

        :global(.reader-prose p) {
          margin-bottom: 1.5em;
        }

        :global(.reader-prose h1),
        :global(.reader-prose h2),
        :global(.reader-prose h3),
        :global(.reader-prose h4) {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-weight: 700;
          margin-top: 2em;
          margin-bottom: 0.75em;
          color: #111827;
          line-height: 1.3;
        }

        :global(.reader-prose h1) { font-size: 2em; }
        :global(.reader-prose h2) { font-size: 1.5em; }
        :global(.reader-prose h3) { font-size: 1.25em; }
        :global(.reader-prose h4) { font-size: 1.1em; }

        :global(.reader-prose a) {
          color: #4f46e5;
          text-decoration: underline;
          text-decoration-color: #c7d2fe;
          transition: all 0.2s;
        }

        :global(.reader-prose a:hover) {
          color: #4338ca;
          text-decoration-color: #4f46e5;
        }

        :global(.reader-prose blockquote) {
          border-left: 4px solid #e5e7eb;
          padding-left: 1.5em;
          margin: 2em 0;
          color: #6b7280;
          font-style: italic;
        }

        :global(.reader-prose img) {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin: 2em auto;
          display: block;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }

        :global(.reader-prose figure) {
          margin: 2.5em 0;
        }

        :global(.reader-prose figcaption) {
          text-align: center;
          font-size: 0.875em;
          color: #6b7280;
          margin-top: 0.75em;
          font-style: italic;
        }

        :global(.reader-prose ul),
        :global(.reader-prose ol) {
          margin: 1.5em 0;
          padding-left: 2em;
        }

        :global(.reader-prose li) {
          margin-bottom: 0.5em;
        }

        :global(.reader-prose pre) {
          background: #f3f4f6;
          border-radius: 8px;
          padding: 1.25em;
          overflow-x: auto;
          font-size: 0.875em;
          line-height: 1.6;
          margin: 2em 0;
        }

        :global(.reader-prose code) {
          font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
          background: #f3f4f6;
          padding: 0.2em 0.4em;
          border-radius: 3px;
          font-size: 0.9em;
        }

        :global(.reader-prose pre code) {
          background: none;
          padding: 0;
        }

        :global(.reader-prose table) {
          width: 100%;
          border-collapse: collapse;
          margin: 1.5em 0;
          font-size: 0.9em;
        }

        :global(.reader-prose th),
        :global(.reader-prose td) {
          border: 1px solid #e5e7eb;
          padding: 0.75em;
          text-align: left;
        }

        :global(.reader-prose th) {
          background: #f9fafb;
          font-weight: 600;
        }

        /* Footer */
        .reader-footer {
          margin-top: 3rem;
          padding-top: 2rem;
          border-top: 1px solid #e5e7eb;
          text-align: center;
        }

        /* Responsive */
        @media (max-width: 640px) {
          .reader-container {
            padding: 1rem;
          }

          .reader-title {
            font-size: 1.75rem;
          }

          :global(.reader-prose) {
            font-size: 1rem;
          }
        }
      `}</style>
    </article>
  );
}


