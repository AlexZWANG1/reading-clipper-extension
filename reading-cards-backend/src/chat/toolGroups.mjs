// ========= Tool Groups & Dynamic Tool Selection =========
// Scopes available tools by context and user intent.

import { TOOL_DEFINITIONS } from './tools.mjs';

const TOOL_GROUPS = {
  // Safe default: read-only.
  explore: [
    'semantic_search', 'search_cards', 'list_cards', 'get_card',
    'list_topics', 'list_materials', 'get_material',
    'get_board', 'get_board_health', 'request_plan',
  ],

  // Board-focused flow (draft-first for structural changes).
  // get_material included so AI can trace evidence back to source.
  board: [
    'get_board', 'get_board_health', 'propose_board_changes',
    'search_cards', 'semantic_search', 'get_card', 'list_cards',
    'get_material', 'list_topics',
    'request_plan',
  ],

  // Card creation flow.
  cards: [
    'create_card', 'search_cards', 'list_cards', 'get_card',
    'semantic_search', 'list_topics', 'list_materials', 'get_material',
    'request_plan',
  ],

  // Ingestion flow.
  ingest: [
    'ingest_url', 'fetch_rss', 'semantic_search', 'search_cards',
    'list_cards', 'list_topics', 'list_materials', 'get_material',
    'request_plan',
  ],

  // Full access (used by planner/executor only).
  full: null,
};

const GROUP_PATTERNS = [
  {
    group: 'board',
    pattern: /假[设说]|hypothes|证据|evidence|画板|board|分解|decompos|论证|思维板|子问题|sub.?question|验证|verify|MECE/i,
  },
  {
    group: 'cards',
    pattern: /创建.*卡片|create\s*card|保存.*卡|save.*card|生成.*卡片|generate\s*card|新建.*卡片|摘录|新增.*卡片/i,
  },
  {
    group: 'ingest',
    pattern: /摄入|ingest|导入.*(?:url|链接|文章)|import.*(?:url|article)|订阅|subscri|rss|feed/i,
  },
];

/**
 * Infer which tool group to use based on user message and surface context.
 *
 * Priority:
 * 1. Surface context
 * 2. Keyword detection
 * 3. Safe default (explore)
 */
export function inferToolGroup(userMessage, surfaceContext) {
  const fromKeywords = inferByKeywords(userMessage);

  if (surfaceContext?.surface === 'board') return 'board';
  if (surfaceContext?.surface === 'workspace') {
    // Workspace defaults to board, but should still respect card/ingest intent.
    return fromKeywords || 'board';
  }
  if (surfaceContext?.surface === 'reader') {
    const wantsCreate = /创建|保存|提取|制作|create|save|extract|摘录/i.test(userMessage || '');
    return wantsCreate ? 'cards' : 'explore';
  }

  if (fromKeywords) return fromKeywords;
  return 'explore';
}

function inferByKeywords(userMessage) {
  if (!userMessage) return null;
  for (const { group, pattern } of GROUP_PATTERNS) {
    if (pattern.test(userMessage)) return group;
  }
  return null;
}

/**
 * Get filtered tool definitions for the given group.
 */
export function getToolsForGroup(groupName) {
  const allowedNames = TOOL_GROUPS[groupName];
  if (allowedNames === null || allowedNames === undefined) {
    return TOOL_DEFINITIONS.map((t) => ({ type: t.type, function: t.function }));
  }
  const allowedSet = new Set(allowedNames);
  return TOOL_DEFINITIONS
    .filter((t) => allowedSet.has(t.function.name))
    .map((t) => ({ type: t.type, function: t.function }));
}

export function getGroupDefinition(groupName) {
  return TOOL_GROUPS[groupName] ?? null;
}

export function listGroups() {
  return Object.keys(TOOL_GROUPS);
}
