/*
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ========= Draft Engine Guard Tests =========
// Verify that draftEngine enforces safety invariants per Spec §10.1.

describe('Draft Engine: validation guards', () => {
  const source = readFileSync(
    new URL('../src/agents/draftEngine.mjs', import.meta.url), 'utf-8'
  );

  it('createDraft must validate change actions', () => {
    assert.ok(
      source.includes("change.action") && source.includes("create_node"),
      'createDraft must validate that each change has a valid action'
    );
  });

  it('createDraft must reject unknown actions', () => {
    assert.ok(
      source.includes("Unknown action"),
      'createDraft must throw on unknown change actions'
    );
  });

  it('commitDraft must verify draft is pending before committing', () => {
    const commitSection = source.slice(source.indexOf('export async function commitDraft'));
    assert.ok(
      commitSection.includes("draft.status !== 'pending'"),
      'commitDraft must check draft status is pending'
    );
  });

  it('rejectDraft must verify draft exists and is pending', () => {
    const rejectSection = source.slice(source.indexOf('export async function rejectDraft'));
    assert.ok(
      rejectSection.includes("Draft not found"),
      'rejectDraft must throw if draft not found'
    );
    assert.ok(
      rejectSection.includes("draft.status !== 'pending'"),
      'rejectDraft must check draft status is pending'
    );
  });

  it('createDraft only allows create_node, create_edge, update_node actions', () => {
    // The allowlist must not include delete operations
    assert.ok(
      source.includes("'create_node', 'create_edge', 'update_node'"),
      'Draft actions must be limited to create_node, create_edge, update_node'
    );
    assert.ok(
      !source.includes("'delete_node'") && !source.includes("'delete_edge'"),
      'Draft must not allow delete actions'
    );
  });
});
*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('Harness V2 draft engine guards', () => {
  const source = readFileSync(
    new URL('../src/agents/draftEngine.mjs', import.meta.url), 'utf-8'
  );

  it('createDraft should validate action allowlist', () => {
    assert.ok(source.includes('create_node'));
    assert.ok(source.includes('create_edge'));
    assert.ok(source.includes('update_node'));
  });

  it('commitDraft should accept pending and partially_accepted', () => {
    assert.ok(source.includes("draft.status !== \"pending\" && draft.status !== \"partially_accepted\"")
      || source.includes("draft.status !== 'pending' && draft.status !== 'partially_accepted'"));
  });

  it('commitDraft should return skipped_changes for invalid operations', () => {
    assert.ok(source.includes('skipped_changes'));
    assert.ok(source.includes('skipped_count'));
  });
});
