import { XMLParser } from 'fast-xml-parser';
import { normalizeFeedUrl, normalizeUrl, xmlEscape } from './utils.mjs';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
});

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function collectOutlines(node, bucket = []) {
  for (const outline of toArray(node)) {
    if (!outline || typeof outline !== 'object') continue;

    const feedUrl = normalizeFeedUrl(outline['@_xmlUrl']);
    if (feedUrl) {
      const title = outline['@_title'] || outline['@_text'] || feedUrl;
      const siteUrl = normalizeUrl(outline['@_htmlUrl']);
      const category = outline['@_category'] || '';
      const tags = category
        ? category.split(',').map((v) => v.trim()).filter(Boolean)
        : [];

      bucket.push({
        title,
        feed_url: feedUrl,
        site_url: siteUrl,
        description: outline['@_description'] || null,
        tags,
      });
    }

    if (outline.outline) {
      collectOutlines(outline.outline, bucket);
    }
  }

  return bucket;
}

export function parseOpmlText(opmlText) {
  if (!opmlText || typeof opmlText !== 'string') {
    throw new Error('invalid_opml_text');
  }

  let parsed;
  try {
    parsed = xmlParser.parse(opmlText);
  } catch (error) {
    throw new Error(`invalid_opml_xml: ${error.message}`);
  }

  const outlines = parsed?.opml?.body?.outline;
  const candidates = collectOutlines(outlines, []);
  if (!candidates.length) {
    throw new Error('opml_contains_no_feed');
  }

  const deduped = new Map();
  for (const candidate of candidates) {
    if (!candidate.feed_url) continue;
    if (!deduped.has(candidate.feed_url)) {
      deduped.set(candidate.feed_url, candidate);
    }
  }

  return [...deduped.values()];
}

export function buildOpml(subscriptions) {
  const now = new Date().toUTCString();
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="1.1">',
    '  <head>',
    '    <title>Verity RSS Export</title>',
    `    <dateCreated>${xmlEscape(now)}</dateCreated>`,
    '  </head>',
    '  <body>',
  ];

  for (const sub of subscriptions || []) {
    const title = xmlEscape(sub.title || sub.feed_url || 'Untitled');
    const feedUrl = xmlEscape(sub.feed_url || '');
    const htmlUrl = xmlEscape(sub.site_url || '');
    const description = xmlEscape(sub.description || '');
    const category = xmlEscape((sub.tags || []).join(','));

    lines.push(
      `    <outline text="${title}" title="${title}" type="rss" xmlUrl="${feedUrl}" htmlUrl="${htmlUrl}" description="${description}" category="${category}" />`
    );
  }

  lines.push('  </body>');
  lines.push('</opml>');
  return lines.join('\n');
}
