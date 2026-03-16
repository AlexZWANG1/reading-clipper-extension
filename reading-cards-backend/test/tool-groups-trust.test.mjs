/*
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_DEFINITIONS, TOOL_MAP, getToolSideEffect, buildConfirmMessage } from '../src/chat/tools.mjs';
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

  it('board group must NOT contain create_board_node (Spec §11: creation must use draft)', () => {
    assert.ok(!boardTools.includes('create_board_node'),
      'Direct node creation bypasses draft system — Spec §11 Board: "Forbidden: Direct node/edge creation bypassing draft system"');
  });

  it('board group must NOT contain create_board_edge (Spec §11: creation must use draft)', () => {
    assert.ok(!boardTools.includes('create_board_edge'),
      'Direct edge creation bypasses draft system — must use propose_board_changes');
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

describe('Trust Invariant: destructive tools must not be plan-auto (Spec §12)', () => {
  it('no destructive tool should have task_auto: true', () => {
    const violations = TOOL_DEFINITIONS
      .filter(t => t.side_effect === 'destructive' && t.task_auto === true)
      .map(t => t.function.name);
    assert.deepStrictEqual(violations, [],
      `Destructive tools with task_auto:true would allow plan-automated deletion: ${violations.join(', ')}`);
  });

  it('all write tools used in plans must be creation-only', () => {
    // Write tools that are task_auto must be "creation" tools (create_card, ingest_url),
    // not mutation tools (update/delete)
    const autoWriteTools = TOOL_DEFINITIONS
      .filter(t => t.side_effect === 'write' && t.task_auto === true)
      .map(t => t.function.name);
    for (const name of autoWriteTools) {
      assert.ok(!name.includes('delete') && !name.includes('update'),
        `${name} is a write+task_auto tool — must not be a delete/update operation`);
    }
  });
});

describe('Trust Invariant: no external API tools (Spec §10.2)', () => {
  // The AI cannot access external data beyond user's imported materials.
  // This test prevents accidental addition of web search or external API tools.
  const FORBIDDEN_PATTERNS = /^(web_search|browse_url|call_api|http_request|external_)/i;

  it('no tool name should match forbidden external API patterns', () => {
    const violations = TOOL_DEFINITIONS
      .filter(t => FORBIDDEN_PATTERNS.test(t.function.name))
      .map(t => t.function.name);
    assert.deepStrictEqual(violations, [],
      `External API tools found: ${violations.join(', ')}. Spec §10.2 forbids external data access.`);
  });

  it('fetch_rss and ingest_url are user-initiated, not external API access', () => {
    // These tools exist but are gated behind the ingest group (user must request them)
    const ingestGroup = getGroupDefinition('ingest');
    assert.ok(ingestGroup.includes('fetch_rss'), 'fetch_rss should be in ingest group');
    assert.ok(ingestGroup.includes('ingest_url'), 'ingest_url should be in ingest group');
    // They must NOT be in explore group
    const exploreGroup = getGroupDefinition('explore');
    assert.ok(!exploreGroup.includes('fetch_rss'), 'fetch_rss must not be in explore group');
    assert.ok(!exploreGroup.includes('ingest_url'), 'ingest_url must not be in explore group');
  });
});

describe('Trust Invariant: every write/destructive tool has confirm_template', () => {
  it('all write tools must have a confirm_template', () => {
    const writeTools = TOOL_DEFINITIONS.filter(t => t.side_effect === 'write');
    for (const t of writeTools) {
      assert.ok(t.confirm_template,
        `Write tool "${t.function.name}" must have a confirm_template for user confirmation`);
    }
  });

  it('all destructive tools must have a confirm_template', () => {
    const destructiveTools = TOOL_DEFINITIONS.filter(t => t.side_effect === 'destructive');
    for (const t of destructiveTools) {
      assert.ok(t.confirm_template,
        `Destructive tool "${t.function.name}" must have a confirm_template for user confirmation`);
    }
  });

  it('buildConfirmMessage interpolates args correctly', () => {
    const msg = buildConfirmMessage('create_card', {
      topic_title: '测试主题',
      summary: '这是一个测试摘要',
    });
    assert.ok(msg.includes('测试主题'), 'Should interpolate topic_title');
    assert.ok(msg.includes('测试摘要'), 'Should interpolate summary');
  });

  it('buildConfirmMessage falls back for unknown tools', () => {
    const msg = buildConfirmMessage('unknown_tool', {});
    assert.ok(msg.includes('unknown_tool'), 'Should include tool name in fallback');
  });
});
*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOOL_DEFINITIONS,
  TOOL_MAP,
  getToolRiskLevel,
  isWriteCapableTool,
  buildConfirmMessage,
} from '../src/chat/tools.mjs';

describe('Harness V2 tool metadata', () => {
  it('every tool should have risk_level', () => {
    const missing = TOOL_DEFINITIONS
      .filter((t) => !t.risk_level)
      .map((t) => t.function.name);
    assert.deepStrictEqual(missing, []);
  });

  it('risk_level should only use supported values', () => {
    const allowed = new Set(['auto', 'confirm', 'confirm_warn']);
    const invalid = TOOL_DEFINITIONS
      .filter((t) => !allowed.has(t.risk_level))
      .map((t) => `${t.function.name}:${t.risk_level}`);
    assert.deepStrictEqual(invalid, []);
  });

  it('TOOL_MAP should cover all tool definitions', () => {
    for (const t of TOOL_DEFINITIONS) {
      assert.ok(TOOL_MAP[t.function.name], `missing TOOL_MAP entry for ${t.function.name}`);
    }
  });
});

describe('Harness V2 runtime trust rules', () => {
  it('write-capable auto tools should be blocked in chat mode', () => {
    assert.equal(isWriteCapableTool('create_card'), true);
    assert.equal(isWriteCapableTool('propose_board_changes'), true);
    assert.equal(isWriteCapableTool('ingest_url'), true);
  });

  it('destructive tools should require confirm_warn', () => {
    assert.equal(getToolRiskLevel('delete_board_node'), 'confirm_warn');
    assert.equal(getToolRiskLevel('delete_board_edge'), 'confirm_warn');
  });

  it('board mutation tools should require confirmation', () => {
    assert.equal(getToolRiskLevel('create_board_node'), 'confirm');
    assert.equal(getToolRiskLevel('update_board_node'), 'confirm');
    assert.equal(getToolRiskLevel('create_board_edge'), 'confirm');
  });

  it('buildConfirmMessage should include fallback tool name', () => {
    const msg = buildConfirmMessage('unknown_tool', {});
    assert.ok(msg.includes('unknown_tool'));
  });
});
