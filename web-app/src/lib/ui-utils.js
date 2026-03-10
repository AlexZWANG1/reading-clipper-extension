// ========= Shared UI Utilities =========
// Single source of truth for colors, helpers used across components

// Topic 颜色系统 — 单色灰阶，专业克制
export const TOPIC_COLORS = [
  { bg: 'rgba(24,24,27,0.04)',   text: '#18181B', border: 'rgba(24,24,27,0.15)' },    // zinc-900
  { bg: 'rgba(39,39,42,0.04)',   text: '#27272A', border: 'rgba(39,39,42,0.15)' },    // zinc-800
  { bg: 'rgba(63,63,70,0.04)',   text: '#3F3F46', border: 'rgba(63,63,70,0.15)' },    // zinc-700
  { bg: 'rgba(82,82,91,0.04)',   text: '#52525B', border: 'rgba(82,82,91,0.15)' },    // zinc-600
  { bg: 'rgba(113,113,122,0.04)', text: '#71717A', border: 'rgba(113,113,122,0.15)' }, // zinc-500
  { bg: 'rgba(161,161,170,0.04)', text: '#A1A1AA', border: 'rgba(161,161,170,0.15)' }, // zinc-400
  { bg: 'rgba(37,99,235,0.04)',  text: '#2563EB', border: 'rgba(37,99,235,0.15)' },   // blue-600 (accent)
  { bg: 'rgba(59,130,246,0.04)', text: '#3B82F6', border: 'rgba(59,130,246,0.15)' },  // blue-500
  { bg: 'rgba(22,163,74,0.04)',  text: '#16A34A', border: 'rgba(22,163,74,0.15)' },   // green-600
  { bg: 'rgba(202,138,4,0.04)',  text: '#CA8A04', border: 'rgba(202,138,4,0.15)' },   // yellow-600
];

// 根据 topic 名称生成一致的颜色
export function getTopicColor(topicTitle) {
  if (!topicTitle) return TOPIC_COLORS[0];
  const hash = topicTitle.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return TOPIC_COLORS[hash % TOPIC_COLORS.length];
}

/**
 * 构建带 Text Fragment 的高亮链接
 * Web 标准 Text Fragments API — Chrome 80+, Edge 80+
 */
export function buildHighlightUrl(baseUrl, rawSnippet) {
  if (!baseUrl || !rawSnippet) return baseUrl || '#';
  try {
    const url = new URL(baseUrl);
    const cleanText = rawSnippet.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!cleanText) return baseUrl;
    url.hash = `:~:text=${encodeURIComponent(cleanText).replace(/-/g, '%2D')}`;
    return url.toString();
  } catch {
    return baseUrl;
  }
}

// 获取来源显示名称
export function getSourceDisplayName(card) {
  if (card.source?.name) return card.source.name;
  if (card.source_url) {
    try {
      return new URL(card.source_url).hostname.replace('www.', '');
    } catch {
      return '';
    }
  }
  return '';
}

// 提取 hostname
export function extractHostname(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}
