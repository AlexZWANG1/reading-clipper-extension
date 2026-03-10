import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOpml, parseOpmlText } from '../src/services/rss/opml.mjs';

test('parseOpmlText extracts feeds and deduplicates by feed_url', () => {
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.1">
  <head><title>test</title></head>
  <body>
    <outline text="Tech">
      <outline text="Feed A" type="rss" xmlUrl="https://example.com/feed.xml" htmlUrl="https://example.com" />
      <outline text="Feed A Duplicate" type="rss" xmlUrl="https://example.com/feed.xml" />
      <outline text="Feed B" type="rss" xmlUrl="https://another.com/rss" category="dev,news" />
    </outline>
  </body>
</opml>`;

  const feeds = parseOpmlText(text);
  assert.equal(feeds.length, 2);

  const feedA = feeds.find((f) => f.feed_url === 'https://example.com/feed.xml');
  const feedB = feeds.find((f) => f.feed_url === 'https://another.com/rss');

  assert.ok(feedA);
  assert.equal(feedA.title, 'Feed A');
  assert.equal(feedA.site_url, 'https://example.com/');

  assert.ok(feedB);
  assert.deepEqual(feedB.tags, ['dev', 'news']);
});

test('parseOpmlText throws for invalid payload', () => {
  assert.throws(() => parseOpmlText(''), /invalid_opml_text/);
  assert.throws(() => parseOpmlText('<opml></opml>'), /opml_contains_no_feed/);
});

test('buildOpml renders rss outlines', () => {
  const xml = buildOpml([
    {
      title: 'Feed A',
      feed_url: 'https://example.com/feed.xml',
      site_url: 'https://example.com',
      description: 'A feed',
      tags: ['tech'],
    },
  ]);

  assert.match(xml, /<opml version="1.1">/);
  assert.match(xml, /xmlUrl="https:\/\/example.com\/feed.xml"/);
  assert.match(xml, /title="Feed A"/);
  assert.match(xml, /category="tech"/);
});

