// ========= RSS Fetcher =========
import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Verity/1.0 Research Agent',
  },
});

/**
 * Fetch items from RSS feeds.
 * @param {string[]} feedUrls
 * @param {Object} opts - { maxItems?, processedUrls? }
 * @returns {Array<{ title, url, summary, published, feedTitle }>}
 */
export async function fetchRssItems(feedUrls, opts = {}) {
  const maxItems = opts.maxItems || 20;
  const processedUrls = opts.processedUrls || new Set();
  const allItems = [];

  for (const feedUrl of feedUrls) {
    try {
      const feed = await parser.parseURL(feedUrl);
      for (const item of feed.items || []) {
        const url = item.link || item.guid;
        if (!url) continue;
        if (processedUrls.has(url)) continue;

        allItems.push({
          title: item.title || '',
          url,
          summary: item.contentSnippet || item.content || '',
          published: item.isoDate || item.pubDate || null,
          feedTitle: feed.title || feedUrl,
        });
      }
    } catch (err) {
      console.warn(`[rss] failed to fetch ${feedUrl}:`, err.message);
    }
  }

  // Sort by published date (newest first), then limit
  allItems.sort((a, b) => {
    if (!a.published || !b.published) return 0;
    return new Date(b.published) - new Date(a.published);
  });

  return allItems.slice(0, maxItems);
}
