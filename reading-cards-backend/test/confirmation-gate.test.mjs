/*
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

  it('chatConfirm continuation loop must also gate on write tools', () => {
    assert.ok(
      source.includes('hasMoreWrites'),
      'chatConfirm should check hasMoreWrites in its continuation loop'
    );
    // The continuation loop after confirm must also pause for new writes
    const confirmSection = source.slice(source.indexOf('chatConfirm'));
    assert.ok(
      confirmSection.includes('pendingActions') && confirmSection.includes('hasMoreWrites'),
      'chatConfirm continuation must return pendingActions when AI requests more writes'
    );
  });

  it('plan generation error must be persisted to conversation', () => {
    // When plan generation fails, the error must be saved to conversation
    // so the user can see what happened (not silently swallowed)
    const planCatchBlock = source.slice(
      source.indexOf('Plan generation failed'),
      source.indexOf('Fall through')
    );
    assert.ok(
      planCatchBlock.includes('addMessage'),
      'Plan generation catch block must persist error via addMessage'
    );
    assert.ok(
      planCatchBlock.includes('message_type') && planCatchBlock.includes('error'),
      'Persisted plan error must have message_type: "error"'
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
*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('Harness V2 confirmation gate', () => {
  const orchestratorSource = readFileSync(
    new URL('../src/chat/orchestrator.mjs', import.meta.url), 'utf-8'
  );
  const toolExecutorSource = readFileSync(
    new URL('../src/chat/toolExecutor.mjs', import.meta.url), 'utf-8'
  );

  it('orchestrator should delegate gating to executeToolCalls', () => {
    assert.ok(orchestratorSource.includes('executeToolCalls'));
    assert.ok(!orchestratorSource.includes('LOW_RISK_WRITES'));
  });

  it('executeToolCalls should produce pendingActions for confirm tools', () => {
    assert.ok(toolExecutorSource.includes('pendingActions.push'));
    assert.ok(toolExecutorSource.includes('buildConfirmMessage'));
  });

  it('chat mode should block write-capable operations at execution layer', () => {
    assert.ok(toolExecutorSource.includes('blockedByChatMode'));
    assert.ok(toolExecutorSource.includes('mode_restriction'));
  });
});
