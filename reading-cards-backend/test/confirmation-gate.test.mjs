import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('confirmation gate regression', () => {
  const source = readFileSync(
    new URL('../src/chat/orchestrator.mjs', import.meta.url), 'utf-8'
  );

  it('should NOT use the buggy hasWriteTools && !hasDraftTools pattern', () => {
    assert.ok(
      !source.includes('hasWriteTools && !hasDraftTools'),
      'orchestrator should not contain the buggy pattern that skips confirmation for mixed write+draft calls'
    );
  });

  it('should split tool calls into writeToolCalls and autoToolCalls', () => {
    assert.ok(
      source.includes('writeToolCalls') && source.includes('autoToolCalls'),
      'orchestrator should use split-group approach: writeToolCalls + autoToolCalls'
    );
  });

  it('should always gate on writeToolCalls.length > 0', () => {
    assert.ok(
      source.includes('writeToolCalls.length > 0'),
      'write tools should always require confirmation regardless of draft tools'
    );
  });

  it('chat mode must force explore group in BOTH chat() and chatWithConversation()', () => {
    // Both functions must use the same pattern to enforce chat mode = explore only
    const chatModePattern = /mode\s*===\s*['"]chat['"]\s*\?\s*['"]explore['"]/g;
    const matches = source.match(chatModePattern);
    assert.ok(
      matches && matches.length >= 2,
      `Both chat() and chatWithConversation() must enforce mode==='chat' → 'explore'. Found ${matches?.length || 0} occurrences, expected ≥2`
    );
  });
});
