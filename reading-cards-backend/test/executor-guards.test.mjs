import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ========= Harness V2 Guard Tests =========
// Source-level regression tests for the simplified loop and execution gate.

describe('Harness V2: executeToolCalls + orchestrator guardrails', () => {
  const toolExecutorSource = readFileSync(
    new URL('../src/chat/toolExecutor.mjs', import.meta.url), 'utf-8'
  );
  const orchestratorSource = readFileSync(
    new URL('../src/chat/orchestrator.mjs', import.meta.url), 'utf-8'
  );
  const chatRouteSource = readFileSync(
    new URL('../src/routes/v2/chat.mjs', import.meta.url), 'utf-8'
  );

  it('toolExecutor must expose executeToolCalls', () => {
    assert.ok(
      toolExecutorSource.includes('export async function executeToolCalls'),
      'Harness V2 must route tool gating through executeToolCalls'
    );
  });

  it('chat mode restriction must happen inside executeToolCalls', () => {
    assert.ok(
      toolExecutorSource.includes('blockedByChatMode'),
      'chat mode must be enforced in executeToolCalls'
    );
  });

  it('orchestrator must apply confirm round upper bound', () => {
    assert.ok(orchestratorSource.includes('CONFIRM_ROUND_LIMIT = 3'));
    assert.ok(orchestratorSource.includes('confirmRound >= CONFIRM_ROUND_LIMIT'));
  });

  it('chat route should not expose execute-plan endpoint', () => {
    assert.ok(!chatRouteSource.includes('"/execute-plan"'));
  });

  it('chat route should not expose templates endpoint', () => {
    assert.ok(!chatRouteSource.includes('"/templates"'));
  });
});
