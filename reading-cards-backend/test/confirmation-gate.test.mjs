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
});
