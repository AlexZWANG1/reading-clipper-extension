// ========= Context Budget Management =========
// Token estimation and context window budget allocation.
// Ensures conversation history fits within the model's context window.

/**
 * Estimate token count for a string.
 * Chinese: ~0.7 tokens per character
 * English/other: ~0.25 tokens per character (~1.3 per word)
 */
export function estimateTokens(text) {
  if (!text) return 0;
  let tokens = 0;
  for (const char of text) {
    tokens += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(char) ? 0.7 : 0.25;
  }
  return Math.ceil(tokens);
}

/**
 * Calculate how many tokens are available for conversation history.
 *
 * @param {number} contextWindow - Model's total context window
 * @param {number} systemPromptTokens - Actual system prompt token count
 * @param {number} toolDefinitionTokens - Token count of scoped tool definitions JSON
 * @returns {{ historyBudget: number, toolLoopReserve: number }}
 */
export function calculateBudget(contextWindow, systemPromptTokens, toolDefinitionTokens) {
  const toolLoopReserve = Math.floor(contextWindow * 0.25);
  const outputReserve = 4096;
  const historyBudget = contextWindow - systemPromptTokens - toolDefinitionTokens - toolLoopReserve - outputReserve;
  return {
    historyBudget: Math.max(historyBudget, 2000),
    toolLoopReserve,
  };
}

/**
 * Build conversation history within a token budget.
 * Takes newest messages first, stops when budget is exhausted.
 * Prepends conversation summary if available.
 *
 * @param {Array} messages - All messages, newest-first (from DB after P0-1 fix)
 * @param {number} budget - Token budget for history
 * @param {string|null} conversationSummary - Summary of older conversation
 * @returns {Array} messages in chronological order (oldest-first), fitting within budget
 */
export function buildHistoryWithinBudget(messages, budget, conversationSummary = null) {
  let remaining = budget;
  const selected = [];

  if (conversationSummary) {
    const summaryTokens = estimateTokens(conversationSummary);
    remaining -= summaryTokens;
  }

  for (const msg of messages) {
    const msgTokens = estimateTokens(msg.content);
    if (remaining - msgTokens < 0) break;
    selected.unshift(msg);
    remaining -= msgTokens;
  }

  if (conversationSummary) {
    selected.unshift({
      role: 'system',
      content: `<conversation_summary>\n${conversationSummary}\n</conversation_summary>`,
    });
  }

  return selected;
}
