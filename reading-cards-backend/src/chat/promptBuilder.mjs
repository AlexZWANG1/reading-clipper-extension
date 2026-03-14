// ========= Dynamic System Prompt Builder =========
// Replaces the monolithic SYSTEM_PROMPT with modular, context-aware assembly.
// Prompt is built from components: base identity, methodology, research state, tool instructions.

// ── Prompt Constants ──────────────────────────────────

const BASE_IDENTITY = `You are a research assistant for "Verity" (求真), an evidence-driven research workbench. You help users manage their reading knowledge base: cards, topics, thinking boards, documents, sources, and ingested materials.

Answer in the same language the user uses. Be concise and helpful. Always ground your answers in the user's actual data — call tools to look up data before answering.

When presenting cards or data to the user, format them cleanly:
- Use the card's title as a heading, not its UUID
- Show key points as a bullet list
- Include source name if available
- Use markdown formatting for readability`;

const DATA_MODEL_BRIEF = `## Data Model

- **Topics** — Top-level research categories. Each topic contains Cards and at most one Thinking Board.
- **Cards** — Atomic knowledge units with summary, key_points[], fact_or_view classification, source attribution.
- **Thinking Boards** — Visual reasoning canvases with a node tree:
  - **question** → **hypothesis** (child via parent_id) → **evidence** (child via parent_id, linked to card via card_id)
  - **Edges** express relationships: supports / refutes / neutral
- **Materials** — Ingested documents with embeddings for semantic search.
- **Documents** — Story-building documents with questions, hypotheses, and story units.
- **Sources** — Information sources the user tracks.`;

const IRON_CLAD_RULES = `## Hard Rules (enforced by code — violations return errors)

- Evidence nodes MUST have parent_id pointing to a hypothesis node.
- Hypothesis nodes MUST have parent_id pointing to a question node.
- Edges MUST have relation_type: supports, refutes, or neutral.
- Evidence nodes SHOULD have card_id linking to a source card.
- If a tool call is rejected, read the error message and self-correct.`;

const NEGATIVE_CONSTRAINTS = `## Absolute Prohibitions

- NEVER create, modify, or delete any data unless the user EXPLICITLY asks you to.
- When the user asks for information, ONLY use read/search tools to look up and answer.
- NEVER fabricate data — always call tools to retrieve real data.
- NEVER proactively create cards, nodes, or edges as a "helpful" side effect.
- If unsure whether the user wants you to create something, ASK first.
- NEVER show internal IDs (UUIDs) in your responses. Reference data by its title, summary, or content. Users don't need to see database identifiers.
- NEVER use create_card to store your own analysis, summaries, or communication. Cards are EVIDENCE — only create cards from actual source material (articles, papers, documents) that the user explicitly asks you to extract. Your analysis, opinions, and answers belong in your text response, NOT in cards.`;

const MODE_INSTRUCTIONS = {
  chat: `\n## 当前模式：聊天模式\n你当前处于"聊天"模式。你只能查询和搜索数据来回答问题，不能创建、修改或删除任何内容。如果用户要求你执行写操作，告诉他们切换到"代理"模式。`,
  agent: `\n## 当前模式：代理模式\n你当前处于"代理"模式。你可以执行操作，但写操作需要用户确认。`,
  auto: '',
};

const PLAN_DETECTION = `## Complex Tasks

If the user describes a task requiring 4+ steps, involving multiple sources, or setting up monitoring, respond with ONLY:
\`\`\`json
{"_plan_request": true, "intent": "your understanding of what the user wants"}
\`\`\`
The system will generate an execution plan for the user to review.`;

const TOOL_GROUP_INSTRUCTIONS = {
  explore: `## Available Actions
You have read-only tools. Search and list data to answer questions. You CANNOT create or modify anything in this context. If the user asks to create something, tell them you can help — describe what you'd create and ask them to confirm.`,

  board: `## Available Actions
You can read board state and propose batch changes via propose_board_changes. Use propose_board_changes INSTEAD of individual create_board_node calls — it creates a visual draft on the canvas for user review. You can also search for relevant cards to link as evidence.`,

  cards: `## Available Actions
You can create cards and search existing ones. When creating a card, confirm the topic with the user first. You can also search the knowledge base to provide context.`,

  ingest: `## Available Actions
You can ingest URLs and fetch RSS feeds into the knowledge base. Always confirm the URL/feed with the user before ingesting. You can search existing content to check for duplicates.`,

  full: `## Available Actions
You have all tools available. This is plan execution mode — follow the plan steps precisely.`,
};

// ── Builder Function ──────────────────────────────────

/**
 * Build a dynamic system prompt from modular components.
 *
 * @param {Object} opts
 * @param {Object|null} opts.surfaceContext  - { surface: 'board'|'reader'|'cards'|'general', topicId?, ... }
 * @param {Object|null} opts.methodology    - { document: string, config: object } from user_methodologies
 * @param {Object|null} opts.researchState  - computed research state for the topic
 * @param {string}      opts.toolGroup      - 'explore'|'board'|'cards'|'ingest'|'full'
 * @returns {string} assembled system prompt
 */
export function buildSystemPrompt({ surfaceContext, methodology, researchState, toolGroup, mode }) {
  const parts = [];

  // Always included
  parts.push(BASE_IDENTITY);
  parts.push(DATA_MODEL_BRIEF);
  parts.push(IRON_CLAD_RULES);

  // User's methodology document (natural language, truncated)
  if (methodology?.document) {
    const doc = truncateToTokens(methodology.document, 400);
    parts.push(`## 用户的研究方法论\n${doc}\n\n请按照上述方法论指导你的分析和建议。`);
  }

  // Current research state for the topic
  if (researchState && Object.keys(researchState).length > 0 && researchState.total_hypotheses > 0) {
    parts.push(`## 当前研究状态\n${formatResearchStateForPrompt(researchState)}`);
  }

  // Surface context — tell AI what page the user is on
  if (surfaceContext) {
    const surfaceDesc = describeSurface(surfaceContext);
    if (surfaceDesc) parts.push(surfaceDesc);
  }

  // Plan detection
  parts.push(PLAN_DETECTION);

  // Tool-group specific instructions
  const groupInstructions = TOOL_GROUP_INSTRUCTIONS[toolGroup] || TOOL_GROUP_INSTRUCTIONS.explore;
  parts.push(groupInstructions);

  // Mode instruction — BEFORE NEGATIVE_CONSTRAINTS (constraints must stay last for maximum attention)
  const modeInstruction = MODE_INSTRUCTIONS[mode] || '';
  if (modeInstruction) parts.push(modeInstruction);

  // Negative constraints — ALWAYS last for maximum attention
  parts.push(NEGATIVE_CONSTRAINTS);

  return parts.join('\n\n');
}

// ── Helpers ──────────────────────────────────────────

/**
 * Rough token truncation (~4 chars per token).
 */
function truncateToTokens(text, maxTokens) {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n...(方法论文档已截断)';
}

/**
 * Format research state into a readable string for the AI prompt.
 */
function formatResearchStateForPrompt(state) {
  if (!state || !state.hypotheses_summary?.length) return '';

  const lines = [];
  lines.push(`假说数: ${state.total_hypotheses}, 证据数: ${state.total_evidence}, 盲点: ${state.blind_spots}`);

  for (const h of state.hypotheses_summary) {
    const statusLabel = {
      no_evidence: '无证据',
      insufficient: '证据不足',
      bias_warning: '⚠ 偏见警告',
      strong_support: '强支持',
      strong_against: '强反对',
      mixed: '正反兼有',
    }[h.status] || h.status;

    lines.push(`- "${h.text}" → ${h.support}支持/${h.refute}反对 [${statusLabel}]`);
  }

  if (state.unanswered_questions > 0) {
    lines.push(`\n${state.unanswered_questions} 个问题尚未有假说。`);
  }

  return lines.join('\n');
}

/**
 * Describe the user's current surface for the AI prompt.
 */
function describeSurface(ctx) {
  if (!ctx?.surface || ctx.surface === 'general') return null;

  switch (ctx.surface) {
    case 'board':
      return `## 当前上下文\n用户正在查看**思维画板** (Thinking Board)${ctx.topicId ? `，关联主题 ID: ${ctx.topicId}` : ''}。你应该优先使用 board 相关工具来帮助用户分析和操作画板内容。`;
    case 'reader':
      return `## 当前上下文\n用户正在**阅读器**中阅读材料${ctx.materialId ? ` (material ID: ${ctx.materialId})` : ''}。你应该优先帮助用户从材料中提取证据和制作卡片。`;
    case 'cards':
      return `## 当前上下文\n用户正在**卡片**页面，浏览和管理知识卡片。`;
    default:
      return null;
  }
}

// Export constants for testing
export { BASE_IDENTITY, DATA_MODEL_BRIEF, IRON_CLAD_RULES, NEGATIVE_CONSTRAINTS, TOOL_GROUP_INSTRUCTIONS, MODE_INSTRUCTIONS };
