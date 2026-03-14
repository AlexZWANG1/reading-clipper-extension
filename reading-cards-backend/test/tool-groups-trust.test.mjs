import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_DEFINITIONS, TOOL_MAP, getToolSideEffect } from '../src/chat/tools.mjs';
import { inferToolGroup, getToolsForGroup, getGroupDefinition, listGroups } from '../src/chat/toolGroups.mjs';

// ========= Trust Invariant Tests =========
// These tests verify safety properties defined in PRODUCT-SPEC §10-11 and ARCHITECTURE §4.
// They ensure that the tool system correctly enforces bounded AI autonomy.

describe('Trust Invariant: explore group has zero write tools', () => {
  const exploreTools = getGroupDefinition('explore');

  it('explore group should be defined and non-empty', () => {
    assert.ok(Array.isArray(exploreTools), 'explore group should be an array');
    assert.ok(exploreTools.length > 0, 'explore group should not be empty');
  });

  it('every tool in explore group must be read_only', () => {
    const violations = [];
    for (const name of exploreTools) {
      const sideEffect = getToolSideEffect(name);
      if (sideEffect !== 'read_only') {
        violations.push(`${name} has side_effect="${sideEffect}" but is in explore group`);
      }
    }
    assert.deepStrictEqual(violations, [],
      `Explore group must contain ONLY read_only tools. Violations:\n${violations.join('\n')}`
    );
  });

  it('explore group must not contain any known write tools', () => {
    const writeTools = TOOL_DEFINITIONS
      .filter(t => t.side_effect !== 'read_only')
      .map(t => t.function.name);

    for (const writeTool of writeTools) {
      assert.ok(
        !exploreTools.includes(writeTool),
        `Write tool "${writeTool}" must NOT appear in explore group`
      );
    }
  });
});

describe('Trust Invariant: tool side_effect classification', () => {
  it('every tool must have a side_effect field', () => {
    const missing = TOOL_DEFINITIONS
      .filter(t => !t.side_effect)
      .map(t => t.function.name);
    assert.deepStrictEqual(missing, [],
      `Tools without side_effect: ${missing.join(', ')}`
    );
  });

  it('side_effect must be one of the allowed values', () => {
    const allowed = new Set(['read_only', 'write', 'destructive', 'draft']);
    const invalid = TOOL_DEFINITIONS
      .filter(t => !allowed.has(t.side_effect))
      .map(t => `${t.function.name}: "${t.side_effect}"`);
    assert.deepStrictEqual(invalid, [],
      `Invalid side_effect values: ${invalid.join(', ')}`
    );
  });

  it('write/destructive tools must have confirm_template', () => {
    const needsConfirm = TOOL_DEFINITIONS
      .filter(t => t.side_effect === 'write' || t.side_effect === 'destructive')
      .filter(t => !t.confirm_template)
      .map(t => t.function.name);
    assert.deepStrictEqual(needsConfirm, [],
      `Write/destructive tools without confirm_template: ${needsConfirm.join(', ')}`
    );
  });

  it('delete_board_node must be classified as destructive', () => {
    assert.equal(getToolSideEffect('delete_board_node'), 'destructive');
  });

  it('propose_board_changes must be classified as draft', () => {
    assert.equal(getToolSideEffect('propose_board_changes'), 'draft');
  });

  it('create_card must be classified as write', () => {
    assert.equal(getToolSideEffect('create_card'), 'write');
  });

  it('delete_board_edge must be classified as destructive', () => {
    assert.equal(getToolSideEffect('delete_board_edge'), 'destructive');
  });

  it('create_board_edge must be classified as write', () => {
    assert.equal(getToolSideEffect('create_board_edge'), 'write');
  });
});

describe('Trust Invariant: inferToolGroup defaults to safe fallback', () => {
  it('empty message → explore (read-only)', () => {
    assert.equal(inferToolGroup('', null), 'explore');
  });

  it('null message → explore (read-only)', () => {
    assert.equal(inferToolGroup(null, null), 'explore');
  });

  it('unrelated message → explore (read-only)', () => {
    assert.equal(inferToolGroup('hello, how are you?', null), 'explore');
  });

  it('general surface → explore (read-only)', () => {
    assert.equal(inferToolGroup('test', { surface: 'general' }), 'explore');
  });
});

describe('Trust Invariant: surface context drives tool selection', () => {
  it('board surface → board group', () => {
    assert.equal(inferToolGroup('tell me about this', { surface: 'board' }), 'board');
  });

  it('reader surface without write intent → explore (read-only)', () => {
    assert.equal(inferToolGroup('what does this article say?', { surface: 'reader' }), 'explore');
  });

  it('reader surface with create intent → cards group', () => {
    assert.equal(inferToolGroup('帮我创建一张卡片', { surface: 'reader' }), 'cards');
  });
});

describe('Trust Invariant: board group write tools are correctly classified', () => {
  const boardTools = getGroupDefinition('board');

  it('board group should contain propose_board_changes (draft)', () => {
    assert.ok(boardTools.includes('propose_board_changes'));
  });

  it('board group should contain update_board_node (write)', () => {
    assert.ok(boardTools.includes('update_board_node'));
  });

  it('board group should contain delete_board_node (destructive)', () => {
    assert.ok(boardTools.includes('delete_board_node'));
  });

  it('board group must NOT contain create_card (wrong context)', () => {
    assert.ok(!boardTools.includes('create_card'),
      'create_card belongs in cards group, not board group');
  });

  it('board group must NOT contain ingest_url (wrong context)', () => {
    assert.ok(!boardTools.includes('ingest_url'),
      'ingest_url belongs in ingest group, not board group');
  });
});

describe('Trust Invariant: full group exposes all tools', () => {
  it('full group definition should be null (meaning all tools)', () => {
    assert.equal(getGroupDefinition('full'), null);
  });

  it('getToolsForGroup("full") should return all tool definitions', () => {
    const fullTools = getToolsForGroup('full');
    assert.equal(fullTools.length, TOOL_DEFINITIONS.length,
      'full group should expose every defined tool');
  });
});

describe('Trust Invariant: every tool in every group must exist in TOOL_DEFINITIONS', () => {
  const allToolNames = new Set(TOOL_DEFINITIONS.map(t => t.function.name));
  const groups = listGroups();

  for (const group of groups) {
    const toolNames = getGroupDefinition(group);
    if (toolNames === null) continue; // 'full' group uses all tools
    it(`all tools in "${group}" group must be defined in TOOL_DEFINITIONS`, () => {
      const missing = toolNames.filter(name => !allToolNames.has(name));
      assert.deepStrictEqual(missing, [],
        `Group "${group}" references undefined tools: ${missing.join(', ')}`
      );
    });
  }
});

describe('Trust Invariant: TOOL_MAP completeness', () => {
  it('every tool definition should have a TOOL_MAP entry', () => {
    for (const t of TOOL_DEFINITIONS) {
      assert.ok(TOOL_MAP[t.function.name],
        `Missing TOOL_MAP entry for "${t.function.name}"`);
    }
  });

  it('getToolSideEffect returns read_only for unknown tools (safe default)', () => {
    assert.equal(getToolSideEffect('nonexistent_tool'), 'read_only');
  });
});
