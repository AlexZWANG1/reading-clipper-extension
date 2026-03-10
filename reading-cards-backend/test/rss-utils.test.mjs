import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildItemGuid,
  clampInt,
  computeNextScheduledAt,
  normalizeFeedUrl,
  normalizeQuery,
  normalizeUrl,
  parsePublishedAt,
} from '../src/services/rss/utils.mjs';

test('normalizeUrl normalizes protocol/host and strips hash', () => {
  const normalized = normalizeUrl('Example.com/path/#section');
  assert.equal(normalized, 'https://example.com/path');
});

test('normalizeFeedUrl rejects unsupported protocols', () => {
  assert.equal(normalizeFeedUrl('ftp://example.com/feed.xml'), null);
  assert.equal(normalizeFeedUrl('https://example.com/feed.xml'), 'https://example.com/feed.xml');
});

test('normalizeQuery trims, lowers, and collapses spaces', () => {
  assert.equal(normalizeQuery('  AI   News  Daily  '), 'ai news daily');
});

test('clampInt applies boundaries and fallback', () => {
  assert.equal(clampInt('120', { min: 5, max: 1440, fallback: 60 }), 120);
  assert.equal(clampInt('2', { min: 5, max: 1440, fallback: 60 }), 5);
  assert.equal(clampInt('5000', { min: 5, max: 1440, fallback: 60 }), 1440);
  assert.equal(clampInt('abc', { min: 5, max: 1440, fallback: 60 }), 60);
});

test('computeNextScheduledAt applies failure backoff and cap', () => {
  const now = new Date('2026-03-10T00:00:00.000Z');
  const normal = new Date(
    computeNextScheduledAt({ pollIntervalMinutes: 30, consecutiveFailures: 0, now })
  );
  const backoff = new Date(
    computeNextScheduledAt({ pollIntervalMinutes: 30, consecutiveFailures: 3, now })
  );
  const capped = new Date(
    computeNextScheduledAt({ pollIntervalMinutes: 1440, consecutiveFailures: 6, now })
  );

  assert.equal(normal.toISOString(), '2026-03-10T00:30:00.000Z');
  assert.equal(backoff.toISOString(), '2026-03-10T04:00:00.000Z');
  assert.equal(capped.toISOString(), '2026-03-11T00:00:00.000Z');
});

test('buildItemGuid uses source guid when present and url hash fallback otherwise', () => {
  assert.equal(buildItemGuid({ guid: 'item-guid-1' }, null), 'item-guid-1');
  assert.ok(buildItemGuid({}, 'https://example.com/item').startsWith('url:'));
  assert.ok(buildItemGuid({ title: 'A', published: '2026-03-10' }, null).startsWith('fallback:'));
});

test('parsePublishedAt returns iso string or null', () => {
  assert.equal(parsePublishedAt('2026-03-10T12:00:00Z'), '2026-03-10T12:00:00.000Z');
  assert.equal(parsePublishedAt('not-a-date'), null);
  assert.equal(parsePublishedAt(null), null);
});

