import assert from 'node:assert/strict';
import test from 'node:test';
import { __rssDiscoveryTestables } from '../src/services/rss/discovery.mjs';

const {
  decodeDuckDuckGoResultUrl,
  extractSearchResultUrls,
} = __rssDiscoveryTestables;

test('decodeDuckDuckGoResultUrl resolves redirect uddg target', () => {
  const decoded = decodeDuckDuckGoResultUrl(
    'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Ffeed.xml'
  );
  assert.equal(decoded, 'https://example.com/feed.xml');
});

test('extractSearchResultUrls keeps external links and removes search engines', () => {
  const html = `
    <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fblog">A</a>
    <a class="result__a" href="https://another.net/feed">B</a>
    <a href="https://duckduckgo.com/?q=rss">ignore</a>
  `;

  const urls = extractSearchResultUrls(html, 10);
  assert.deepEqual(urls, [
    'https://example.com/blog',
    'https://another.net/feed',
  ]);
});
