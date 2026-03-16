// ========= Context Budget Management =========
// Token estimation and context window budget allocation.
// Ensures conversation history fits within the model's context window.

/**
 * Estimate token count for a string.
 * Chinese: ~1.5 tokens per character (CJK tokenizers split aggressively)
 * English/other: ~0.3 tokens per character (~1.3 per word)
 * Includes 10% safety margin.
 */
export function estimateTokens(text) {
  if (!text) return 0;
  let tokens = 0;
  for (const char of text) {
    tokens += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(char) ? 1.5 : 0.3;
  }
  return Math.ceil(tokens * 1.1);
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
  const toolLoopReserve = 8000; // Fixed 8K tokens for tool call loop
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
