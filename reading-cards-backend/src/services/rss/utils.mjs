import crypto from 'crypto';

export function normalizeUrl(value) {
  if (!value || typeof value !== 'string') return null;
  let raw = value.trim();
  if (!raw) return null;

  // Only prepend https:// when no URI scheme is present.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }

  try {
    const url = new URL(raw);
    url.hash = '';
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname !== '/') {
      url.pathname = url.pathname.replace(/\/+$/, '');
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeFeedUrl(value) {
  const normalized = normalizeUrl(value);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeQuery(value) {
  if (!value || typeof value !== 'string') return null;
  return value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200) || null;
}

export function hashText(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function parsePublishedAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function clampInt(value, { min, max, fallback }) {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export function extractUrlFromText(value) {
  if (!value || typeof value !== 'string') return null;
  const match = value.match(/https?:\/\/[^\s]+/i);
  if (!match) return null;
  return normalizeUrl(match[0]);
}

export function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function computeNextScheduledAt({
  pollIntervalMinutes = 60,
  consecutiveFailures = 0,
  now = new Date(),
}) {
  const baseMinutes = clampInt(pollIntervalMinutes, {
    min: 5,
    max: 1440,
    fallback: 60,
  });
  const backoffMultiplier = consecutiveFailures > 0
    ? Math.min(2 ** Math.min(consecutiveFailures, 6), 64)
    : 1;
  const minutes = Math.min(baseMinutes * backoffMultiplier, 24 * 60);
  return new Date(now.getTime() + minutes * 60 * 1000).toISOString();
}

export function buildItemGuid(item, normalizedUrl) {
  const sourceGuid = item?.guid || item?.id || item?.uuid;
  if (sourceGuid && String(sourceGuid).trim()) {
    return String(sourceGuid).trim();
  }
  if (normalizedUrl) {
    const hash = hashText(normalizedUrl);
    if (hash) return `url:${hash}`;
  }

  const title = item?.title || '';
  const published = item?.isoDate || item?.pubDate || item?.published || '';
  const fallbackHash = hashText(`${title}|${published}`);
  return `fallback:${fallbackHash}`;
}
