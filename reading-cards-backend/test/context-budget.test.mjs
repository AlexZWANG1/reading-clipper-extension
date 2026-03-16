import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContextMessages,
  findTurnBoundary,
  shouldCompact,
  roughTokenEstimate,
  trimMessagesForRetry,
} from '../src/chat/contextManager.mjs';

describe('contextManager: findTurnBoundary', () => {
  it('returns a boundary that ends on a user message turn', () => {
    const recentNewestFirst = [
      { role: 'assistant', content: 'A3' },
      { role: 'user', content: 'U2' },
      { role: 'assistant', content: 'A2' },
      { role: 'user', content: 'U1' },
    ];
    const boundary = findTurnBoundary(recentNewestFirst);
    assert.equal(boundary, 4);
  });

  it('falls back to full length when no user message exists', () => {
    const recentNewestFirst = [
      { role: 'assistant', content: 'A2' },
      { role: 'assistant', content: 'A1' },
    ];
    assert.equal(findTurnBoundary(recentNewestFirst), 2);
  });
});

describe('contextManager: buildContextMessages', () => {
  it('keeps chronological order and prepends conversation summary', () => {
    const historyNewestFirst = [
      { role: 'assistant', content: 'A2', message_type: 'text' },
      { role: 'user', content: 'U2', message_type: 'text' },
      { role: 'assistant', content: 'A1', message_type: 'text' },
      { role: 'user', content: 'U1', message_type: 'text' },
    ];
    const context = buildContextMessages(historyNewestFirst, '结构化摘要');
    assert.equal(context[0].role, 'user');
    assert.ok(context[0].content.includes('结构化摘要'));
    assert.equal(context[1].content, 'U1');
    assert.equal(context[4].content, 'A2');
  });
});

describe('contextManager: compaction + token fallback helpers', () => {
  it('shouldCompact returns false inside cooldown window', () => {
    const now = Date.now();
    const history = Array.from({ length: 80 }).map((_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      message_type: 'text',
      content: `m-${i}`,
      created_at: new Date(now - i * 1000).toISOString(),
    }));
    assert.equal(shouldCompact(history, null, now), false);
  });

  it('roughTokenEstimate returns positive numbers', () => {
    const tokens = roughTokenEstimate([
      { role: 'system', content: '规则' },
      { role: 'user', content: 'hello world' },
    ]);
    assert.ok(tokens > 0);
  });

  it('trimMessagesForRetry keeps system messages and drops half of non-system', () => {
    const messages = [
      { role: 'system', content: 'S1' },
      { role: 'system', content: 'S2' },
      { role: 'user', content: 'U1' },
      { role: 'assistant', content: 'A1' },
      { role: 'user', content: 'U2' },
      { role: 'assistant', content: 'A2' },
    ];
    const trimmed = trimMessagesForRetry(messages);
    assert.equal(trimmed[0].role, 'system');
    assert.equal(trimmed[1].role, 'system');
    assert.ok(trimmed.length < messages.length);
  });
});
