import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, calculateBudget, buildHistoryWithinBudget } from '../src/chat/contextBudget.mjs';

describe('estimateTokens', () => {
  it('should estimate English text', () => {
    const tokens = estimateTokens('Hello world this is a test');
    assert.ok(tokens > 0, 'should return positive tokens');
    assert.ok(tokens < 20, 'should be reasonable for short English');
  });

  it('should estimate Chinese text with higher ratio', () => {
    const en = estimateTokens('Hello');
    const cn = estimateTokens('你好世界');
    // Chinese chars should produce more tokens per character
    assert.ok(cn / 4 > en / 5, 'Chinese should have higher per-char token ratio');
  });

  it('should return 0 for empty input', () => {
    assert.equal(estimateTokens(''), 0);
    assert.equal(estimateTokens(null), 0);
    assert.equal(estimateTokens(undefined), 0);
  });
});

describe('calculateBudget', () => {
  it('should allocate budget with reserves', () => {
    const { historyBudget, toolLoopReserve } = calculateBudget(128000, 2000, 3000);
    assert.ok(historyBudget > 0, 'history budget should be positive');
    assert.ok(historyBudget < 128000, 'should be less than total context');
    assert.equal(toolLoopReserve, Math.floor(128000 * 0.25));
    // historyBudget = 128000 - 2000 - 3000 - 32000 - 4096 = 86904
    assert.equal(historyBudget, 86904);
  });

  it('should enforce minimum of 2000 tokens', () => {
    const { historyBudget } = calculateBudget(5000, 3000, 3000);
    assert.equal(historyBudget, 2000, 'should enforce minimum');
  });
});

describe('buildHistoryWithinBudget', () => {
  const makeMsg = (content, role = 'user') => ({ role, content });

  it('should select messages within budget (newest first)', () => {
    const messages = [
      makeMsg('newest message'),  // index 0 = newest
      makeMsg('middle message'),
      makeMsg('oldest message'),
    ];
    const result = buildHistoryWithinBudget(messages, 1000, null);
    assert.equal(result.length, 3, 'all should fit');
    // Result should be in chronological order (oldest first)
    assert.equal(result[0].content, 'oldest message');
    assert.equal(result[2].content, 'newest message');
  });

  it('should drop oldest when budget is tight', () => {
    const messages = [
      makeMsg('A'.repeat(500)),  // newest
      makeMsg('B'.repeat(500)),
      makeMsg('C'.repeat(500)),  // oldest
    ];
    // Budget only fits ~2 messages (500 chars * 0.25 = 125 tokens each)
    const result = buildHistoryWithinBudget(messages, 260, null);
    assert.ok(result.length < 3, 'should drop oldest');
    assert.equal(result[result.length - 1].content, 'A'.repeat(500), 'newest should survive');
  });

  it('should prepend conversation summary', () => {
    const messages = [makeMsg('hello')];
    const result = buildHistoryWithinBudget(messages, 1000, 'Previous discussion about AI');
    assert.equal(result[0].role, 'system');
    assert.ok(result[0].content.includes('Previous discussion about AI'));
    assert.equal(result[1].content, 'hello');
  });
});
