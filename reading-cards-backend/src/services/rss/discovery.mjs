import Parser from 'rss-parser';
import {
  getDiscoveryCache,
  upsertDiscoveryCache,
} from '../supabase/rss.mjs';
import {
  extractUrlFromText,
  normalizeFeedUrl,
  normalizeQuery,
  normalizeUrl,
} from './utils.mjs';

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Verity/1.0 RSS Discovery',
  },
});

const MAX_CANDIDATES = 20;

function sanitizeForIlike(value) {
  return String(value || '').replace(/[%_,]/g, ' ').trim();
}

function scoreFeedCandidate(feed, feedUrl, source) {
  let score = 0.5;
  if (feed?.items?.length) score += 0.2;
  if (feed?.title) score += 0.1;
  if (feed?.description) score += 0.05;
  if (source === 'feed_url') score += 0.1;
  if (source === 'website_autodiscovery') score += 0.05;
  return Math.min(score, 0.99);
}

function dedupeCandidates(candidates, limit) {
  const seen = new Set();
  const result = [];

  for (const candidate of candidates) {
    const key = candidate.feed_url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
    if (result.length >= limit) break;
  }

  return result;
}

async function loadFeedMetadata(feedUrl, source = 'feed_url') {
  try {
    const normalized = normalizeFeedUrl(feedUrl);
    if (!normalized) return null;

    const feed = await parser.parseURL(normalized);
    const siteUrl = normalizeUrl(feed?.link) || null;

    return {
      title: feed?.title || siteUrl || normalized,
      feed_url: normalized,
      site_url: siteUrl,
      description: feed?.description || null,
      language: feed?.language || null,
      score: scoreFeedCandidate(feed, normalized, source),
      source,
    };
  } catch {
    return null;
  }
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Verity/1.0 RSS Discovery',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch website: ${response.status}`);
  }
  return response.text();
}

function parseAttributes(tag) {
  const attrs = {};
  const regex = /([^\s=]+)\s*=\s*['"]([^'"]*)['"]/g;
  let match = regex.exec(tag);
  while (match) {
    attrs[match[1].toLowerCase()] = match[2];
    match = regex.exec(tag);
  }
  return attrs;
}

function extractFeedLinksFromHtml(html, baseUrl) {
  const candidates = new Set();

  const linkTags = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of linkTags) {
    const attrs = parseAttributes(tag);
    const rel = (attrs.rel || '').toLowerCase();
    const type = (attrs.type || '').toLowerCase();
    const href = attrs.href;

    if (!href) continue;
    const isAlternate = rel.includes('alternate');
    const isFeedType = type.includes('rss') || type.includes('atom') || type.includes('xml');
    const looksLikeFeed = /\/(rss|feed|atom)(\.xml)?$/i.test(href) || href.includes('feed=');

    if (!(isAlternate && (isFeedType || looksLikeFeed))) continue;

    try {
      candidates.add(new URL(href, baseUrl).toString());
    } catch {
      // ignore malformed URL
    }
  }

  const anchorTags = html.match(/<a\b[^>]*>/gi) || [];
  for (const tag of anchorTags) {
    const attrs = parseAttributes(tag);
    const href = attrs.href;
    if (!href) continue;
    if (!/(rss|atom|feed|\.xml)/i.test(href)) continue;

    try {
      candidates.add(new URL(href, baseUrl).toString());
    } catch {
      // ignore malformed URL
    }
  }

  return [...candidates];
}

function generateCommonFeedPaths(websiteUrl) {
  const paths = [
    '/feed',
    '/rss',
    '/rss.xml',
    '/feed.xml',
    '/atom.xml',
    '/index.xml',
    '/feeds/posts/default',
  ];

  const result = [];
  for (const path of paths) {
    try {
      result.push(new URL(path, websiteUrl).toString());
    } catch {
      // ignore malformed URL
    }
  }
  return result;
}

export async function discoverFromWebsite(websiteUrl, limit = 10) {
  const normalizedWebsite = normalizeUrl(websiteUrl);
  if (!normalizedWebsite) {
    throw new Error('invalid_website_url');
  }

  const html = await fetchHtml(normalizedWebsite);
  const fromHtml = extractFeedLinksFromHtml(html, normalizedWebsite);
  const fromCommonPaths = generateCommonFeedPaths(normalizedWebsite);
  const discoveredUrls = dedupeCandidates(
    [...fromHtml, ...fromCommonPaths].map((url) => ({ feed_url: normalizeFeedUrl(url) || url })),
    MAX_CANDIDATES
  ).map((item) => item.feed_url);

  const candidates = [];
  for (const feedUrl of discoveredUrls) {
    const metadata = await loadFeedMetadata(feedUrl, 'website_autodiscovery');
    if (metadata) {
      candidates.push(metadata);
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return dedupeCandidates(candidates, limit);
}

export async function discoverFromQuery(supabase, userId, rawQuery, limit = 10) {
  const normalizedQuery = normalizeQuery(rawQuery);
  if (!normalizedQuery) return [];

  const maybeUrl = extractUrlFromText(rawQuery);
  if (maybeUrl) {
    return discoverFromWebsite(maybeUrl, limit);
  }

  const ilikeTerm = sanitizeForIlike(normalizedQuery);
  if (!ilikeTerm) return [];

  const localCandidates = [];

  const { data: subs } = await supabase
    .from('rss_subscriptions')
    .select('title, feed_url, site_url, description, language, region')
    .eq('user_id', userId)
    .or(`title.ilike.%${ilikeTerm}%,feed_url.ilike.%${ilikeTerm}%,site_url.ilike.%${ilikeTerm}%`)
    .limit(limit);

  for (const row of subs || []) {
    const feedUrl = normalizeFeedUrl(row.feed_url);
    if (!feedUrl) continue;
    localCandidates.push({
      title: row.title || feedUrl,
      feed_url: feedUrl,
      site_url: normalizeUrl(row.site_url),
      description: row.description || null,
      language: row.language || null,
      region: row.region || null,
      score: 0.85,
      source: 'local_subscription',
    });
  }

  // Lightweight "query -> website -> feed" fallback from existing source archive.
  const { data: sources } = await supabase
    .from('sources')
    .select('url, name, description, region')
    .eq('user_id', userId)
    .not('url', 'is', null)
    .or(`name.ilike.%${ilikeTerm}%,description.ilike.%${ilikeTerm}%,url.ilike.%${ilikeTerm}%`)
    .limit(5);

  for (const source of sources || []) {
    const sourceUrl = normalizeUrl(source.url);
    if (!sourceUrl) continue;
    try {
      const candidates = await discoverFromWebsite(sourceUrl, 2);
      for (const candidate of candidates) {
        localCandidates.push({
          ...candidate,
          region: candidate.region || source.region || null,
          source: 'query_source_autodiscovery',
          score: Math.min((candidate.score || 0.7) + 0.05, 0.98),
        });
      }
    } catch {
      // ignore source-level discovery failures
    }
  }

  localCandidates.sort((a, b) => b.score - a.score);
  return dedupeCandidates(localCandidates, limit);
}

export async function discoverFeeds({
  supabase,
  userId,
  sourceType,
  value,
  limit = 10,
  useCache = true,
}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 10, 1), MAX_CANDIDATES);
  let normalizedInput = null;

  if (sourceType === 'nl_query') {
    normalizedInput = normalizeQuery(value);
  } else {
    normalizedInput = normalizeUrl(value);
  }

  if (!normalizedInput) {
    throw new Error('invalid_input');
  }

  if (useCache) {
    const cache = await getDiscoveryCache(supabase, userId, sourceType, normalizedInput);
    if (cache) {
      return {
        normalized_input: normalizedInput,
        candidates: cache.discovery_result || [],
        cached: true,
      };
    }
  }

  let candidates = [];
  if (sourceType === 'feed_url') {
    const candidate = await loadFeedMetadata(value, 'feed_url');
    candidates = candidate ? [candidate] : [];
  } else if (sourceType === 'website_url') {
    candidates = await discoverFromWebsite(value, safeLimit);
  } else if (sourceType === 'nl_query') {
    candidates = await discoverFromQuery(supabase, userId, value, safeLimit);
  } else {
    throw new Error('unsupported_source_type');
  }

  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
  await upsertDiscoveryCache(supabase, userId, sourceType, normalizedInput, candidates, expiresAt);

  return {
    normalized_input: normalizedInput,
    candidates,
    cached: false,
  };
}
