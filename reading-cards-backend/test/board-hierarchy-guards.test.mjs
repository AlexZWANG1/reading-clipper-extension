/*
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executeTool } from '../src/chat/toolExecutor.mjs';

// ========= Board Hierarchy Guard Tests =========
// Verify that toolExecutor enforces Q→H→E hierarchy for board mutations.
// These are the code-level guards referenced in ARCHITECTURE §5.3:
// "These guards cannot be bypassed by prompt engineering."

// Stub context — board mutations that violate hierarchy should fail
// before reaching the database, so we don't need real Supabase.
const ctx = {
  supabase: null,
  userId: 'test-user',
  accessToken: null,
};

describe('Board hierarchy guard: evidence nodes', () => {
  it('rejects evidence without parent_id', async () => {
    const result = await executeTool('create_board_node', {
      board_id: 'board-1',
      node_type: 'evidence',
      text: 'Some evidence',
      // no parent_id
    }, ctx);

    assert.equal(result.error, 'methodology_violation');
    assert.ok(result.message.includes('parent_id'),
      'Error message should mention parent_id');
  });
});

describe('Board hierarchy guard: hypothesis nodes', () => {
  it('rejects hypothesis without parent_id', async () => {
    const result = await executeTool('create_board_node', {
      board_id: 'board-1',
      node_type: 'hypothesis',
      text: 'Some hypothesis',
      // no parent_id
    }, ctx);

    assert.equal(result.error, 'methodology_violation');
    assert.ok(result.message.includes('parent_id'),
      'Error message should mention parent_id');
  });
});

describe('Board hierarchy guard: edge relation_type', () => {
  it('rejects edge with invalid relation_type', async () => {
    const result = await executeTool('create_board_edge', {
      board_id: 'board-1',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      relation_type: 'causes', // invalid
    }, ctx);

    assert.equal(result.error, 'methodology_violation');
    assert.ok(result.message.includes('relation_type'),
      'Error message should mention relation_type');
  });

  it('accepts valid relation_type values', () => {
    // These should NOT be rejected by the guard
    // (they'll fail at database level since we have no real supabase,
    //  but they should pass the methodology guard)
    for (const valid of ['supports', 'refutes', 'neutral']) {
      // We can't fully test these without DB, but we verify the guard
      // pattern accepts them by checking the relation_type validation
      assert.ok(['supports', 'refutes', 'neutral'].includes(valid));
    }
  });
});

describe('Board hierarchy guard: propose_board_changes validates hierarchy', () => {
  it('rejects proposed evidence without parent_id', async () => {
    const result = await executeTool('propose_board_changes', {
      board_id: 'board-1',
      changes: [
        { action: 'create_node', node_type: 'evidence', text: 'orphan evidence' },
      ],
      reasoning: 'test',
    }, ctx);

    assert.equal(result.error, 'methodology_violation');
    assert.ok(result.message.includes('parent_id'));
  });

  it('rejects proposed hypothesis without parent_id', async () => {
    const result = await executeTool('propose_board_changes', {
      board_id: 'board-1',
      changes: [
        { action: 'create_node', node_type: 'hypothesis', text: 'orphan hypothesis' },
      ],
      reasoning: 'test',
    }, ctx);

    assert.equal(result.error, 'methodology_violation');
    assert.ok(result.message.includes('parent_id'));
  });

  it('allows proposed question without parent_id', async () => {
    // Questions are top-level nodes — no parent needed
    // This will fail at DB level since we have no real supabase,
    // but it should NOT be caught by the methodology guard
    try {
      await executeTool('propose_board_changes', {
        board_id: 'board-1',
        changes: [
          { action: 'create_node', node_type: 'question', text: 'a question' },
        ],
        reasoning: 'test',
      }, ctx);
    } catch {
      // Expected: fails at createDraft since no DB, but NOT methodology_violation
    }
    // If we got here without methodology_violation, the guard correctly passes questions
  });

  it('allows create_edge changes (no parent_id needed)', async () => {
    try {
      await executeTool('propose_board_changes', {
        board_id: 'board-1',
        changes: [
          { action: 'create_edge', source_node_id: 'n1', target_node_id: 'n2', relation_type: 'supports' },
        ],
        reasoning: 'test',
      }, ctx);
    } catch {
      // Expected: fails at createDraft since no DB
    }
  });
});

describe('Board hierarchy guard: parent node_type validation (ARCHITECTURE §5.3)', () => {
  // Source-level test: the guard must exist in code, preventing evidence→evidence
  // and evidence→question links. Can't test the DB query without real supabase,
  // but we verify the guard code is present.
  const source = readFileSync(
    new URL('../src/chat/toolExecutor.mjs', import.meta.url), 'utf-8'
  );

  it('create_board_node must validate parent node_type', () => {
    // The guard must check expectedParentType against the actual parent node
    assert.ok(
      source.includes('expectedParentType') || source.includes('expectedParent'),
      'create_board_node must validate that the parent node has the correct type'
    );
  });

  it('evidence parent must be validated as hypothesis', () => {
    assert.ok(
      source.includes("evidence' ? 'hypothesis'") || source.includes('evidence" ? "hypothesis"'),
      'Evidence → parent must be hypothesis validation must exist'
    );
  });

  it('hypothesis parent must be validated as question (via ternary else branch)', () => {
    // The code uses: evidence ? "hypothesis" : "question" — the else covers hypothesis→question
    assert.ok(
      source.includes(': "question"') || source.includes(": 'question'"),
      'Ternary must have "question" as the else branch for hypothesis parent validation'
    );
  });

  it('propose_board_changes must also validate parent node_type for real UUIDs', () => {
    // Draft changes with real UUIDs (not $temp_id) should be validated too
    const draftSection = source.slice(
      source.indexOf('propose_board_changes'),
      source.indexOf('propose_board_changes') + 2000
    );
    assert.ok(
      draftSection.includes('expectedParent') || draftSection.includes('expectedParentType'),
      'propose_board_changes must validate parent node_type for real UUID parents'
    );
  });

  it('propose_board_changes must skip validation for $temp_id references', () => {
    const draftSection = source.slice(
      source.indexOf('propose_board_changes'),
      source.indexOf('propose_board_changes') + 2000
    );
    assert.ok(
      draftSection.includes('$temp') || draftSection.includes('startsWith'),
      'propose_board_changes must skip parent validation for $temp_id references'
    );
  });
});

describe('Board hierarchy guard: error messages include suggestions', () => {
  it('evidence rejection suggests calling get_board first', async () => {
    const result = await executeTool('create_board_node', {
      board_id: 'board-1',
      node_type: 'evidence',
      text: 'orphan evidence',
    }, ctx);

    assert.ok(result.suggestion, 'Should include a suggestion for how to fix');
    assert.ok(result.suggestion.includes('get_board'),
      'Suggestion should recommend get_board to find parent');
  });

  it('hypothesis rejection suggests calling get_board first', async () => {
    const result = await executeTool('create_board_node', {
      board_id: 'board-1',
      node_type: 'hypothesis',
      text: 'orphan hypothesis',
    }, ctx);

    assert.ok(result.suggestion, 'Should include a suggestion for how to fix');
    assert.ok(result.suggestion.includes('get_board'),
      'Suggestion should recommend get_board to find parent');
  });
});
*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateNodeHierarchy, validateEdgeRelation } from '../src/chat/validation.mjs';

describe('Harness V2 hierarchy validation', () => {
  it('evidence without parent_id should fail', () => {
    const err = validateNodeHierarchy('evidence', null, null);
    assert.equal(err?.error, 'hierarchy_violation');
    assert.ok(err?.message?.includes('parent_id'));
  });

  it('hypothesis under question should pass', () => {
    const err = validateNodeHierarchy('hypothesis', 'q-1', 'question');
    assert.equal(err, null);
  });

  it('evidence under non-hypothesis should fail', () => {
    const err = validateNodeHierarchy('evidence', 'q-1', 'question');
    assert.equal(err?.error, 'hierarchy_violation');
  });

  it('invalid edge relation should fail', () => {
    const err = validateEdgeRelation('causes');
    assert.equal(err?.error, 'edge_validation_failed');
    assert.ok(Array.isArray(err?.available_options));
  });
});

describe('Harness V2 toolExecutor wiring', () => {
  const source = readFileSync(new URL('../src/chat/toolExecutor.mjs', import.meta.url), 'utf-8');

  it('create_board_node should call validateNodeHierarchy', () => {
    const section = source.slice(source.indexOf('case "create_board_node"'), source.indexOf('case "update_board_node"'));
    assert.ok(section.includes('validateNodeHierarchy'));
  });

  it('propose_board_changes should call validateNodeHierarchy', () => {
    const section = source.slice(source.indexOf('case "propose_board_changes"'), source.indexOf('case "get_board_health"'));
    assert.ok(section.includes('validateNodeHierarchy'));
  });
});
