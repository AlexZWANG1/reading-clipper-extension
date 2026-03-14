// ========= Tool Groups & Dynamic Tool Selection =========
// Scopes the AI's available tools based on conversation context and surface.
// Prevents AI from accessing write tools when user is only querying.

import { TOOL_DEFINITIONS } from './tools.mjs';

// ── Group Definitions ──────────────────────────────────

const TOOL_GROUPS = {
  // Read-only tools — safe default, no mutations possible
  explore: [
    'semantic_search', 'search_cards', 'list_cards', 'get_card',
    'list_topics', 'list_sources', 'list_boards', 'get_board',
    'list_documents', 'get_document', 'get_board_health', 'request_plan',
  ],

  // Board-focused tools — includes propose_board_changes (draft, not direct mutation)
  board: [
    'get_board', 'get_board_health', 'propose_board_changes',
    'search_cards', 'semantic_search', 'get_card', 'list_cards',
    'list_topics', 'list_boards',
    'update_board_node', 'delete_board_node', 'delete_board_edge',
    'request_plan',
  ],

  // Card creation context
  cards: [
    'create_card', 'search_cards', 'list_cards', 'get_card',
    'semantic_search', 'list_topics', 'request_plan',
  ],

  // Content ingestion context
  ingest: [
    'ingest_url', 'fetch_rss', 'semantic_search', 'search_cards',
    'list_cards', 'list_topics', 'request_plan',
  ],

  // All tools — only used during plan execution
  full: null, // null means "use all TOOL_DEFINITIONS"
};

// ── Keyword patterns for group inference ──────────────

const GROUP_PATTERNS = [
  {
    group: 'board',
    pattern: /假[设说]|hypothes|证据|evidence|画板|board|分解|decompos|论证|思维板|子问题|sub.?question|验证|verify|MECE/i,
  },
  {
    group: 'cards',
    pattern: /创建.*卡片|create\s*card|保存.*卡|save.*card|生成.*卡片|generate\s*card|新建.*卡片|摘录/i,
  },
  {
    group: 'ingest',
    pattern: /摄入|ingest|导入.*(?:url|链接|文章)|import.*(?:url|article)|订阅|subscri|rss|feed/i,
  },
];

// ── Public API ──────────────────────────────────────────

/**
 * Infer which tool group to use based on user message and surface context.
 *
 * Priority:
 *   1. Surface context (if on board page → board tools)
 *   2. Keyword detection
 *   3. Default → explore (read-only, safe)
 *
 * @param {string} userMessage
 * @param {Object|null} surfaceContext - { surface: 'board'|'reader'|'cards'|'general', ... }
 * @returns {string} group name
 */
export function inferToolGroup(userMessage, surfaceContext) {
  // Priority 1: Surface context drives tool selection
  if (surfaceContext?.surface === 'board') return 'board';
  if (surfaceContext?.surface === 'reader') {
    const wantsCreate = /创建|保存|提取|制作|create|save|extract|摘录/i.test(userMessage);
    return wantsCreate ? 'cards' : 'explore';
  }

  // Priority 2: Keyword-based detection from user message
  if (userMessage) {
    for (const { group, pattern } of GROUP_PATTERNS) {
      if (pattern.test(userMessage)) return group;
    }
  }

  // Priority 3: Safe default — read-only
  return 'explore';
}

/**
 * Get the filtered TOOL_DEFINITIONS array for a given group.
 *
 * @param {string} groupName - 'explore'|'board'|'cards'|'ingest'|'full'
 * @returns {Array} filtered tool definitions
 */
export function getToolsForGroup(groupName) {
  const allowedNames = TOOL_GROUPS[groupName];
  if (allowedNames === null || allowedNames === undefined) {
    return TOOL_DEFINITIONS.map(t => ({ type: t.type, function: t.function }));
  }
  const allowedSet = new Set(allowedNames);
  return TOOL_DEFINITIONS
    .filter(t => allowedSet.has(t.function.name))
    .map(t => ({ type: t.type, function: t.function }));
}

/**
 * Get the group definition (list of tool names) for debugging/testing.
 *
 * @param {string} groupName
 * @returns {string[]|null}
 */
export function getGroupDefinition(groupName) {
  return TOOL_GROUPS[groupName] ?? null;
}

/**
 * List all available group names.
 * @returns {string[]}
 */
export function listGroups() {
  return Object.keys(TOOL_GROUPS);
}
