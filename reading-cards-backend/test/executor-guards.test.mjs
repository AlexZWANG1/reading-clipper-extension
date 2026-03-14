import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ========= Executor Safety Guard Tests =========
// Verify that the plan executor blocks destructive tools (Spec §12).
// Source-level regression tests — guards cannot be removed without failing CI.

describe('Executor: destructive tool guard (Spec §12)', () => {
  const source = readFileSync(
    new URL('../src/chat/executor.mjs', import.meta.url), 'utf-8'
  );

  it('must define BLOCKED_IN_PLAN set with destructive tools', () => {
    assert.ok(
      source.includes('BLOCKED_IN_PLAN'),
      'Executor must define BLOCKED_IN_PLAN to restrict destructive tools during plan execution'
    );
  });

  it('must block delete_board_node in plan execution', () => {
    assert.ok(
      source.includes('delete_board_node'),
      'BLOCKED_IN_PLAN must include delete_board_node'
    );
  });

  it('must block delete_board_edge in plan execution', () => {
    assert.ok(
      source.includes('delete_board_edge'),
      'BLOCKED_IN_PLAN must include delete_board_edge'
    );
  });

  it('must check BLOCKED_IN_PLAN before executeTool call', () => {
    // The guard must appear BEFORE the executeTool call in the step loop
    const guardIdx = source.indexOf('BLOCKED_IN_PLAN.has');
    const execIdx = source.indexOf('executeTool(planStep.tool');
    assert.ok(guardIdx > 0, 'Must check BLOCKED_IN_PLAN.has() in step loop');
    assert.ok(execIdx > 0, 'Must call executeTool in step loop');
    assert.ok(guardIdx < execIdx,
      'BLOCKED_IN_PLAN check must come BEFORE executeTool call');
  });

  it('planner system prompt must state no-deletion rule', () => {
    const plannerSource = readFileSync(
      new URL('../src/chat/planner.mjs', import.meta.url), 'utf-8'
    );
    assert.ok(
      plannerSource.includes('不能删除'),
      'Planner prompt must explicitly forbid deletion in research plans'
    );
  });

  it('guard must throw an error (not silently skip)', () => {
    // Extract the code around the BLOCKED_IN_PLAN check
    const guardSection = source.slice(
      source.indexOf('BLOCKED_IN_PLAN.has'),
      source.indexOf('BLOCKED_IN_PLAN.has') + 300
    );
    assert.ok(
      guardSection.includes('throw'),
      'Destructive tool guard must throw an error, not silently skip the step'
    );
  });
});
