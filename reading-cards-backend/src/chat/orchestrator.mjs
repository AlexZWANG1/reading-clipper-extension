// ========= Chat Orchestrator =========
// AI-first architecture with modular prompt, scoped tools, and methodology awareness.
// Dynamic prompt assembly replaces monolithic SYSTEM_PROMPT.
// Tool groups prevent AI from accessing write tools when user is only querying.

import { createAIClientConfig, callChatAPI } from "../services/aiClient.mjs";
import { getToolSideEffect, buildConfirmMessage, summarizeToolResult, TOOL_DEFINITIONS } from "./tools.mjs";
import { executeTool } from "./toolExecutor.mjs";
import { generatePlan, generateConversationTitle } from "./planner.mjs";
import { executePlan, cancelExecution } from "./executor.mjs";
import {
  createConversation, addMessage, addMessages, updateConversation, listMessages,
} from "../services/supabase/conversations.mjs";
import { createTask } from "../services/supabase/tasks.mjs";
import { supabaseAdmin } from "../config/supabase.mjs";
import { buildSystemPrompt } from "./promptBuilder.mjs";
import { inferToolGroup, getToolsForGroup } from "./toolGroups.mjs";
import { getResearchState, loadUserMethodology, computeResearchState } from "../agents/researchContext.mjs";
import { estimateTokens, calculateBudget, buildHistoryWithinBudget } from "./contextBudget.mjs";

const MAX_TOOL_ROUNDS = 12;

// P01 — Per-conversation serial lock
const conversationLocks = new Map();

// P06 — Dedup guard for conversation summary generation
const summaryInProgress = new Set();
const summaryLastAttempt = new Map();

// P24 — Low-risk writes that auto-execute without confirmation
const LOW_RISK_WRITES = new Set(['create_card', 'ingest_url']);

/**
 * Run a chat turn with dynamic prompt and scoped tools.
 * May return pendingActions if write tools need confirmation.
 *
 * @param {Object} opts
 * @param {Array}  opts.messages        - conversation history [{role, content}, ...]
 * @param {string} opts.userId
 * @param {Object} opts.supabase
 * @param {string} opts.accessToken     - JWT token for API calls
 * @param {Function} opts.onToolCall    - optional callback for tool call visibility
 * @param {Object|null} opts.surfaceContext  - { surface, topicId, materialId, ... }
 * @param {string|null} opts.toolGroupOverride - force a specific tool group (e.g. 'full' for plan execution)
 * @returns {Promise<{reply: string, messages: Array, pendingActions?: Array, pendingToolCalls?: Array, toolCallLog?: Array, draftId?: string}>}
 */
export async function chat({ messages, userId, supabase, accessToken, onToolCall, surfaceContext, toolGroupOverride, mode }) {
  const aiConfig = await createAIClientConfig(userId, supabase);

  // ── Build dynamic system prompt ──
  let methodology = null;
  let researchState = null;

  try {
    methodology = await loadUserMethodology(supabase, userId);
  } catch (err) {
    console.error("[orchestrator] Failed to load methodology:", err.message);
  }

  // Load research state if we have a topic context
  const topicId = surfaceContext?.topicId || null;
  if (topicId) {
    try {
      researchState = await getResearchState(supabase, topicId, methodology?.config);
    } catch (err) {
      console.error("[orchestrator] Failed to load research state:", err.message);
    }
  }

  // Enrich surface context with topic title for prompt (skip if already enriched)
  let enrichedSurfaceContext = surfaceContext;
  if (topicId && !surfaceContext?.topicTitle) {
    try {
      const { data: topicRow } = await supabase.from('topics').select('title').eq('id', topicId).single();
      if (topicRow) {
        enrichedSurfaceContext = { ...surfaceContext, topicTitle: topicRow.title };
      }
    } catch (_err) {
      // non-fatal
    }
  }

  // Determine tool group
  const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
  const inferredGroup = inferToolGroup(lastUserMsg, surfaceContext);
  const toolGroup = toolGroupOverride || (mode === 'chat' ? 'explore' : inferredGroup);

  // Write-intent detection: log when chat mode suppresses a write-capable toolGroup
  if (mode === 'chat' && inferredGroup !== 'explore') {
    console.info(`[orchestrator] Write-intent detected in chat mode (inferred: ${inferredGroup}, forced: explore)`);
  }
  const scopedTools = getToolsForGroup(toolGroup);

  // Build the system prompt
  const systemPrompt = buildSystemPrompt({
    surfaceContext: enrichedSurfaceContext,
    methodology,
    researchState,
    toolGroup,
    mode,
  });

  const fullMessages = messages[0]?.role === "system"
    ? messages
    : [{ role: "system", content: systemPrompt }, ...messages];

  let currentMessages = [...fullMessages];
  let rounds = 0;
  const toolCallLog = []; // Track all tool calls for visibility
  let draftId = null;

  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    const response = await callWithTools(aiConfig, currentMessages, scopedTools);
    const choice = response.choices?.[0];
    if (!choice) throw new Error("Empty response from AI");

    const assistantMsg = choice.message;
    currentMessages.push(assistantMsg);

    const toolCalls = assistantMsg.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      return { reply: sanitizeReply(assistantMsg.content || ""), messages: currentMessages, toolCallLog, draftId };
    }

    // Split tool calls into write (need confirmation) and auto (safe to execute)
    // P24: Low-risk writes (create_card, ingest_url) auto-execute without confirmation
    const writeToolCalls = toolCalls.filter((tc) => {
      const effect = getToolSideEffect(tc.function.name);
      return (effect === "write" || effect === "destructive") && !LOW_RISK_WRITES.has(tc.function.name);
    });
    const autoToolCalls = toolCalls.filter((tc) => {
      const effect = getToolSideEffect(tc.function.name);
      return effect === "read_only" || effect === "draft" || LOW_RISK_WRITES.has(tc.function.name);
    });

    // Auto-execute read_only + draft tools immediately
    if (autoToolCalls.length > 0) {
      const autoResults = [];
      for (const tc of autoToolCalls) {
        let args = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
        try {
          const rawResult = await executeTool(tc.function.name, args, {
            supabase, userId, accessToken, surfaceContext: enrichedSurfaceContext,
          });
          const compressed = compressToolResult(tc.function.name, rawResult);
          autoResults.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(compressed),
          });
          const logEntry = {
            id: tc.id,
            tool: tc.function.name,
            args,
            result_summary: summarizeToolResult(tc.function.name, rawResult),
            status: rawResult.error ? "error" : "completed",
          };
          toolCallLog.push(logEntry);
          if (onToolCall) onToolCall(logEntry);
        } catch (err) {
          autoResults.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({ error: err.message }),
          });
          const logEntry = {
            id: tc.id,
            tool: tc.function.name,
            args,
            result_summary: `error: ${err.message}`,
            status: "error",
          };
          toolCallLog.push(logEntry);
          if (onToolCall) onToolCall(logEntry);
        }
      }

      // Check if any tool result is a plan request
      const planToolResult = autoResults.find(tr => {
        try {
          const parsed = JSON.parse(tr.content);
          return parsed.plan_requested === true;
        } catch { return false; }
      });

      if (planToolResult) {
        try {
          const parsed = JSON.parse(planToolResult.content);
          return {
            reply: '',
            messages: currentMessages,
            planRequest: { intent: parsed.intent },
            toolCallLog,
          };
        } catch {
          // Content was parsed successfully at line 154 — this should never happen,
          // but if it does, fall through to normal response handling
        }
      }

      // Handle draft ID extraction from propose_board_changes
      for (const ar of autoResults) {
        try {
          const parsed = JSON.parse(ar.content);
          if (parsed.draft_id) draftId = parsed.draft_id;
        } catch {}
      }

      // If there are also write tool calls, we need a separate assistant message
      // for the auto tool calls so the conversation stays well-formed
      if (writeToolCalls.length > 0) {
        // Insert assistant message with only auto tool calls, then tool results
        currentMessages.push({
          role: "assistant",
          content: null,
          tool_calls: autoToolCalls,
        });
        currentMessages.push(...autoResults);
      } else {
        // No write tools — just add results to the existing assistant message
        currentMessages.push(...autoResults);
      }
    }

    // If write tools exist, pause for confirmation
    if (writeToolCalls.length > 0) {
      const pending = writeToolCalls.map((tc) => {
        let parsedArgs = {};
        try { parsedArgs = JSON.parse(tc.function.arguments || "{}"); } catch {}
        return {
          id: tc.id,
          name: tc.function.name,
          args: parsedArgs,
          side_effect: getToolSideEffect(tc.function.name),
          confirm_message: buildConfirmMessage(tc.function.name, parsedArgs),
        };
      });

      return {
        reply: "",
        messages: currentMessages,
        pendingActions: pending,
        pendingToolCalls: writeToolCalls,
        toolCallLog,
        draftId,
      };
    }

    // Post-action hook: recompute research state if board was mutated
    if (topicId && toolCalls.some(tc => isBoardMutation(tc.function.name))) {
      computeResearchState(supabase, topicId, methodology?.config).catch(err =>
        console.error("[orchestrator] Background research state recompute failed:", err.message)
      );
    }
  }

  // Exhausted rounds — inject last-round warning, then one final call without tools
  currentMessages.push({
    role: "system",
    content: "这是你的最后一轮。请基于已获取的信息，直接回复用户。不要再调用工具。"
  });
  const finalResponse = await callChatAPI(aiConfig, currentMessages);
  const finalMsg = finalResponse.choices?.[0]?.message;
  if (finalMsg) currentMessages.push(finalMsg);

  return {
    reply: sanitizeReply(finalMsg?.content || "Sorry, I could not complete the request."),
    messages: currentMessages,
    toolCallLog,
    draftId,
  };
}

// ── Reply sanitization — code-enforced guardrail against UUID/tool name leakage ──
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const TOOL_NAMES = new Set(TOOL_DEFINITIONS.map(t => t.function.name));

function sanitizeReply(text) {
  if (!text) return text;
  let result = text;

  // 1. Strip leaked UUIDs (not inside quotes/backticks)
  result = result.replace(UUID_REGEX, (match, offset) => {
    const before = result[offset - 1];
    if (before === '"' || before === '`' || before === "'") return match;
    return '[…]';
  });

  // 2. Strip leaked tool names (e.g. "我调用了 semantic_search 找到了...")
  for (const name of TOOL_NAMES) {
    if (result.includes(name)) {
      result = result.replaceAll(name, '');
    }
  }

  // 3. Clean up artifacts from stripping (double spaces, empty brackets)
  result = result.replace(/  +/g, ' ').replace(/「\s*」/g, '').replace(/\(\s*\)/g, '');

  return result;
}

function isBoardMutation(toolName) {
  return ['create_board_node', 'update_board_node', 'delete_board_node',
          'create_board_edge', 'delete_board_edge', 'propose_board_changes'].includes(toolName);
}

/**
 * Continue after user confirms pending write actions.
 */
export async function chatConfirm({ messages, pendingToolCalls, confirmedIds, userId, supabase, toolGroup, surfaceContext }) {
  const aiConfig = await createAIClientConfig(userId, supabase);

  const assistantMsg = {
    role: "assistant",
    content: null,
    tool_calls: pendingToolCalls,
  };

  let currentMessages = [...messages, assistantMsg];
  const toolCallLog = [];

  // Execute each tool call — confirmed ones run, others return "cancelled"
  const confirmedSet = new Set(confirmedIds);
  const toolResults = await Promise.all(
    pendingToolCalls.map(async (tc) => {
      if (!confirmedSet.has(tc.id)) {
        return {
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ cancelled: true, message: "用户取消了该操作" }),
        };
      }

      let args = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch { args = {}; }

      try {
        const result = await executeTool(tc.function.name, args, { supabase, userId, surfaceContext });
        toolCallLog.push({
          id: tc.id,
          tool: tc.function.name,
          args,
          result_summary: summarizeToolResult(tc.function.name, result),
          status: "completed",
        });
        return {
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        };
      } catch (err) {
        toolCallLog.push({
          id: tc.id,
          tool: tc.function.name,
          args,
          result_summary: `错误: ${err.message}`,
          status: "error",
        });
        return {
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ error: err.message }),
        };
      }
    })
  );

  currentMessages.push(...toolResults);

  // Continue the normal loop — use scoped tool set (preserve original toolGroup, not escalate to 'full')
  const scopedTools = getToolsForGroup(toolGroup || 'explore');
  let rounds = 0;
  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    const response = await callWithTools(aiConfig, currentMessages, scopedTools);
    const choice = response.choices?.[0];
    if (!choice) throw new Error("Empty response from AI");

    const nextMsg = choice.message;
    currentMessages.push(nextMsg);

    const nextToolCalls = nextMsg.tool_calls;
    if (!nextToolCalls || nextToolCalls.length === 0) {
      return { reply: sanitizeReply(nextMsg.content || ""), messages: currentMessages, toolCallLog };
    }

    const hasMoreWrites = nextToolCalls.some((tc) => {
      const effect = getToolSideEffect(tc.function.name);
      return effect === "write" || effect === "destructive";
    });

    if (hasMoreWrites) {
      const pending = nextToolCalls.map((tc) => {
        let args = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch { args = {}; }
        return {
          id: tc.id,
          name: tc.function.name,
          args,
          side_effect: getToolSideEffect(tc.function.name),
          confirm_message: buildConfirmMessage(tc.function.name, args),
        };
      });

      const messagesBeforeToolCall = currentMessages.slice(0, -1);
      return {
        reply: "",
        messages: messagesBeforeToolCall,
        pendingActions: pending,
        pendingToolCalls: nextToolCalls,
        toolCallLog,
      };
    }

    // All read_only — execute
    const results = await executeAllTools(nextToolCalls, { supabase, userId, surfaceContext });
    currentMessages.push(...results);

    for (let i = 0; i < nextToolCalls.length; i++) {
      const tc = nextToolCalls[i];
      let args = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch { args = {}; }
      let result = {};
      try { result = JSON.parse(results[i].content); } catch { result = {}; }
      toolCallLog.push({
        id: tc.id,
        tool: tc.function.name,
        args,
        result_summary: summarizeToolResult(tc.function.name, result),
        status: result.error ? "error" : "completed",
      });
    }
  }

  const finalResponse = await callChatAPI(aiConfig, currentMessages);
  const finalMsg = finalResponse.choices?.[0]?.message;
  if (finalMsg) currentMessages.push(finalMsg);

  return {
    reply: sanitizeReply(finalMsg?.content || "Sorry, I could not complete the request."),
    messages: currentMessages,
    toolCallLog,
  };
}

// ── Helpers ──────────────────────────────────────────

function compressToolResult(toolName, result) {
  if (!result || result.error) return result;

  switch (toolName) {
    case 'list_cards':
    case 'search_cards':
      return {
        cards: result.cards?.map(c => ({
          id: c.id, title: c.title, summary: c.summary?.slice(0, 100),
          fact_or_view: c.fact_or_view, topic_id: c.topic_id,
        })),
        total: result.total || result.count,
      };

    case 'get_board':
      return {
        board: {
          id: result.board?.id,
          title: result.board?.title,
          nodes: result.board?.nodes?.map(n => ({
            id: n.id, node_type: n.node_type,
            text: n.claim || n.content?.text,
            parent_id: n.parent_id, status: n.status,
          })),
          edges: result.board?.edges?.map(e => ({
            source: e.source_node_id, target: e.target_node_id,
            relation: e.relation_type,
          })),
        },
      };

    case 'semantic_search':
      return {
        results: result.results?.map(r => ({
          text: r.chunk_text?.slice(0, 200),
          score: r.score,
          source: r.source_title || r.material_id,
        })),
        total: result.total,
      };

    case 'list_topics':
      return { topics: result.topics?.map(t => ({ id: t.id, title: t.title, card_count: t.card_count })) };

    default: {
      // P09: Generic compression — truncate arrays and long strings
      if (typeof result !== 'object' || result === null) return result;
      const compressed = {};
      for (const [key, value] of Object.entries(result)) {
        if (Array.isArray(value) && value.length > 10) {
          compressed[key] = value.slice(0, 10).map(item => {
            if (typeof item === 'object' && item !== null) {
              return { id: item.id, title: item.title, text: (item.text || item.summary || '').slice(0, 100) };
            }
            return typeof item === 'string' ? item.slice(0, 100) : item;
          });
          compressed[`${key}_total`] = value.length;
        } else if (typeof value === 'string' && value.length > 500) {
          compressed[key] = value.slice(0, 500) + '...';
        } else {
          compressed[key] = value;
        }
      }
      return compressed;
    }
  }
}

async function executeAllTools(toolCalls, ctx) {
  return Promise.all(
    toolCalls.map(async (tc) => {
      let args = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch { args = {}; }
      try {
        const rawResult = await executeTool(tc.function.name, args, ctx);
        const compressed = compressToolResult(tc.function.name, rawResult);
        return { role: "tool", tool_call_id: tc.id, content: JSON.stringify(compressed) };
      } catch (err) {
        return { role: "tool", tool_call_id: tc.id, content: JSON.stringify({ error: err.message }) };
      }
    })
  );
}

function callWithTools(aiConfig, messages, scopedTools) {
  return callChatAPI(aiConfig, messages, {
    tools: scopedTools,
    tool_choice: "auto",
  });
}

// ══════════════════════════════════════════════════════
// Conversation-aware chat (primary entry point)
// ══════════════════════════════════════════════════════

/**
 * Chat with conversation persistence — AI-first, with surface context awareness.
 * ALL user input goes to AI. AI decides whether to chat or request a plan.
 * Surface context drives tool group selection and prompt assembly.
 *
 * @param {Object} opts
 * @param {string|null} opts.conversationId
 * @param {string} opts.userMessage
 * @param {string} opts.userId
 * @param {Object} opts.supabase
 * @param {string} opts.accessToken
 * @param {Object|null} opts.surfaceContext - { surface, topicId, materialId, boardId }
 * @returns {Promise<Object>}
 */
export async function chatWithConversation({ conversationId, userMessage, userId, supabase, accessToken, surfaceContext, mode }) {
  // P01 — Per-conversation serial lock
  const lockKey = conversationId || 'new';
  while (conversationLocks.has(lockKey)) {
    await conversationLocks.get(lockKey);
  }
  let releaseLock;
  const lockPromise = new Promise(r => { releaseLock = r; });
  conversationLocks.set(lockKey, lockPromise);

  try {
  return await _chatWithConversationInner({ conversationId, userMessage, userId, supabase, accessToken, surfaceContext, mode });
  } finally {
    conversationLocks.delete(lockKey);
    releaseLock();
  }
}

async function _chatWithConversationInner({ conversationId, userMessage, userId, supabase, accessToken, surfaceContext, mode }) {
  const userSb = supabase;
  let convId = conversationId;
  let isNewConversation = false;

  // Guard against stale/foreign conversation ids (e.g. after account switch).
  // If conversation is not visible to current user, start a fresh conversation.
  if (convId) {
    const { data: ownedConv, error: convCheckError } = await userSb
      .from("conversations")
      .select("id")
      .eq("id", convId)
      .eq("user_id", userId)
      .maybeSingle();

    if (convCheckError) {
      throw new Error(`会话校验失败: ${convCheckError.message}`);
    }

    if (!ownedConv) {
      console.warn(`[orchestrator] Conversation ${convId} is not accessible by user ${userId}; creating a new conversation.`);
      convId = null;
    }
  }

  if (!convId) {
    const conv = await createConversation(userSb, userId);
    convId = conv.id;
    isNewConversation = true;
  }

  // Persist user message
  await addMessage(userSb, convId, {
    role: "user",
    content: userMessage,
    message_type: "text",
  });

  // Load conversation history (newest-first after P0-1 fix)
  const history = await listMessages(userSb, convId, { limit: 200 });

  // Build system prompt and scoped tools (needed for budget calculation)
  const topicId = surfaceContext?.topicId || null;
  const [methodology, researchState, topicRow] = await Promise.all([
    loadUserMethodology(supabase, userId).catch(() => null),
    topicId ? getResearchState(supabase, topicId).catch(() => null) : null,
    topicId ? supabase.from('topics').select('title').eq('id', topicId).single().then(r => r.data).catch(() => null) : null,
  ]);

  // Enrich surface context with topic title
  const enrichedSurfaceContext = (topicId && topicRow)
    ? { ...surfaceContext, topicTitle: topicRow.title }
    : surfaceContext;

  const inferredGroupConv = inferToolGroup(userMessage, surfaceContext);
  const toolGroup = mode === 'chat' ? 'explore' : inferredGroupConv;

  // Write-intent detection: log when chat mode suppresses a write-capable toolGroup
  if (mode === 'chat' && inferredGroupConv !== 'explore') {
    console.info(`[orchestrator] Write-intent detected in chat mode (inferred: ${inferredGroupConv}, forced: explore)`);
  }

  const systemPrompt = buildSystemPrompt({ surfaceContext: enrichedSurfaceContext, methodology, researchState, toolGroup, mode });
  const scopedTools = getToolsForGroup(toolGroup);

  // Calculate token budget
  const aiConfig = await createAIClientConfig(userId, supabase);
  const systemPromptTokens = estimateTokens(systemPrompt);
  const toolDefTokens = estimateTokens(JSON.stringify(scopedTools));
  const { historyBudget } = calculateBudget(aiConfig.contextWindow, systemPromptTokens, toolDefTokens);

  // Find conversation summary if it exists
  const conversationSummary = history
    .find(m => m.message_type === 'conversation_summary')?.content || null;

  // Convert DB messages to chat format, preserving tool call history
  // P08: Keep last 3 tool_calls messages with compressed results, older ones get brief summary
  // Note: history is newest-first, so first tool_calls encountered are the most recent
  let toolCallCount = 0;
  const chatMessages = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      if (m.message_type === 'tool_calls' && m.metadata?.tool_calls) {
        toolCallCount++;
        if (toolCallCount <= 3) {
          // Recent: keep compressed results
          return {
            role: m.role,
            content: m.metadata.tool_calls
              .map(tc => `[Tool: ${tc.tool}] → ${JSON.stringify(tc.result_summary || 'done').slice(0, 300)}`)
              .join('\n'),
          };
        } else {
          // Older: brief summary only
          return { role: m.role, content: `[之前的工具调用: ${m.metadata.tool_calls.map(tc => tc.tool).join(', ')}]` };
        }
      }
      return { role: m.role, content: m.content };
    });

  // Select messages within token budget
  const budgetedMessages = buildHistoryWithinBudget(chatMessages, historyBudget, conversationSummary);

  // ALL input goes to AI — AI decides whether to chat or request a plan
  const result = await chat({ messages: budgetedMessages, userId, supabase, accessToken, surfaceContext: enrichedSurfaceContext, mode });

  // Check if AI requested a plan
  if (result.planRequest) {
    try {
      const { listSources } = await import("../services/supabase/sources.mjs");
      const userSources = await listSources(supabase, userId, {}).catch(() => []);
      const planConversationSummary = conversationSummary
        || chatMessages.slice(-6).map(m => `${m.role}: ${m.content.slice(0, 80)}`).join('\n');

      const { planSpec, planDisplay, suggestedTopicId, title } = await generatePlan(
        result.planRequest.intent,
        userId,
        supabase,
        { conversationSummary: planConversationSummary, userSources, researchState }
      );

      const planMessage = formatPlanProposalMessage(planDisplay, planSpec);
      await addMessage(userSb, convId, {
        role: "assistant",
        content: planMessage,
        message_type: "plan_proposal",
        metadata: { plan_spec: planSpec, plan_display: planDisplay, suggested_topic_id: suggestedTopicId },
      });

      // Auto-title
      if (isNewConversation) {
        generateConversationTitle(userMessage, userId, supabase)
          .then((t) => updateConversation(userSb, userId, convId, { title: t }))
          .catch((err) => console.error("[orchestrator] Auto-title failed:", err.message));
      }

      return {
        conversationId: convId,
        reply: planMessage,
        messageType: "plan_proposal",
        plan: { planSpec, planDisplay, suggestedTopicId },
        toolCallLog: result.toolCallLog || [],
        pendingActions: null,
        pendingToolCalls: null,
      };
    } catch (err) {
      console.error("Plan generation failed, returning AI response as text:", err);
      // Persist error to conversation so user sees what happened
      try {
        await addMessage(userSb, convId, {
          role: "assistant",
          content: `计划生成失败: ${err.message}`,
          message_type: "error",
          metadata: { error: err.message },
        });
      } catch (msgErr) {
        console.error("Failed to persist plan error:", msgErr);
      }
      // Fall through — use the AI's original text response
    }
  }

  // Normal chat response — persist tool call log + reply
  const toolCallLog = result.toolCallLog || [];

  // Persist tool call visibility messages
  if (toolCallLog.length > 0) {
    await addMessage(userSb, convId, {
      role: "assistant",
      content: formatToolCallLog(toolCallLog),
      message_type: "tool_calls",
      metadata: { tool_calls: toolCallLog },
    });
  }

  // Persist assistant reply
  if (result.reply) {
    await addMessage(userSb, convId, {
      role: "assistant",
      content: result.reply,
      message_type: "text",
      metadata: result.pendingActions ? { pendingActions: result.pendingActions } : {},
    });
  }

  // Auto-title
  if (isNewConversation) {
    generateConversationTitle(userMessage, userId, supabase)
      .then((t) => updateConversation(userSb, userId, convId, { title: t }))
      .catch((err) => console.error("[orchestrator] Auto-title failed:", err.message));
  }

  // Async conversation summary trigger (non-blocking)
  const textMessageCount = history.filter(m => m.message_type === 'text').length;
  const existingSummary = history.find(m => m.message_type === 'conversation_summary');
  const summaryAge = existingSummary
    ? history.filter(m => m.message_type === 'text' && m.created_at > existingSummary.created_at).length
    : Infinity;

  // P06: Dedup guard — skip if already in progress or attempted < 5 min ago
  const summaryRecentlyAttempted = summaryLastAttempt.has(convId) &&
    (Date.now() - summaryLastAttempt.get(convId)) < 5 * 60 * 1000;

  if (textMessageCount > 20 && summaryAge > 10 && !summaryInProgress.has(convId) && !summaryRecentlyAttempted) {
    summaryInProgress.add(convId);
    summaryLastAttempt.set(convId, Date.now());
    generateConversationSummary(userSb, convId, history, userId, supabase)
      .catch(err => console.error('[orchestrator] Summary generation failed:', err.message))
      .finally(() => summaryInProgress.delete(convId));
  }

  return {
    conversationId: convId,
    reply: result.reply,
    messageType: "text",
    messages: result.messages,
    toolCallLog,
    pendingActions: result.pendingActions || null,
    pendingToolCalls: result.pendingToolCalls || null,
    draftId: result.draftId || null,
  };
}

async function generateConversationSummary(supabase, convId, history, userId, supabaseClient) {
  try {
    const aiConfig = await createAIClientConfig(userId, supabaseClient);
    const recentTexts = history
      .filter(m => m.message_type === 'text' && (m.role === 'user' || m.role === 'assistant'))
      .slice(-20)
      .map(m => `${m.role}: ${m.content.slice(0, 200)}`)
      .join('\n');

    const messages = [
      {
        role: 'system',
        content: '根据以下对话历史，生成一段简洁的上下文摘要（3-5句话）。包含：讨论了什么主题、做了哪些关键操作、当前研究状态、用户可能的下一步意图。只输出摘要文本。',
      },
      { role: 'user', content: recentTexts },
    ];

    const response = await callChatAPI(aiConfig, messages, { temperature: 0.3, max_tokens: 300 });
    const summary = response.choices?.[0]?.message?.content?.trim();
    if (!summary) return;

    await addMessage(supabase, convId, {
      role: 'system',
      content: summary,
      message_type: 'conversation_summary',
    });
  } catch (err) {
    console.error('[orchestrator] Summary generation failed:', err.message);
  }
}

/**
 * Confirm and execute a plan that the user approved.
 */
export async function confirmAndExecutePlan({ conversationId, planSpec, planDisplay, topicId, userId, supabase }) {
  const adminSb = supabaseAdmin;

  const { data: ownedConv, error: convCheckError } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (convCheckError) {
    throw new Error(`会话校验失败: ${convCheckError.message}`);
  }
  if (!ownedConv) {
    throw new Error("会话不存在或无权限");
  }

  await addMessage(adminSb, conversationId, {
    role: "user",
    content: "确认执行计划",
    message_type: "plan_confirmed",
  });

  const task = await createTask(adminSb, userId, {
    title: planSpec.intent_summary || "研究任务",
    intent: planSpec.intent_summary,
    task_spec: planSpec,
    plan_display: planDisplay,
    topic_id: topicId || null,
    conversation_id: conversationId,
    status: "active",
    schedule: { type: "manual" },
  });

  // Execute in background (fire-and-forget)
  executePlan({
    task,
    planSpec,
    conversationId,
    supabase: adminSb,
  }).catch(async (err) => {
    console.error('[executor] Plan execution failed:', err);
    try {
      await addMessage(adminSb, conversationId, {
        role: 'assistant',
        content: `执行计划失败: ${err.message}`,
        message_type: 'error',
        metadata: { task_id: task.id },
      });
    } catch (msgErr) {
      console.error('[executor] Failed to write error message:', msgErr);
    }
  });

  return { taskId: task.id, status: "running" };
}

/**
 * Cancel a running plan execution.
 */
export function cancelPlanExecution(taskId) {
  cancelExecution(taskId);
}

/**
 * Format a plan proposal into a readable message string.
 */
function formatPlanProposalMessage(planDisplay, planSpec) {
  const lines = [];
  lines.push(`**执行计划**\n`);
  lines.push(planDisplay.summary);
  lines.push("");

  if (planDisplay.why_this_plan) {
    lines.push(`**策略**: ${planDisplay.why_this_plan}`);
    lines.push("");
  }

  if (planSpec.steps?.length > 0) {
    lines.push("**步骤:**");
    for (const step of planSpec.steps) {
      const explanation = planDisplay.step_explanations?.find((e) => e.step_id === step.id);
      lines.push(`${step.id.replace("step_", "")}. **${step.title}** (${step.tool}) — ${explanation?.explanation || step.goal}`);
    }
    lines.push("");
  }

  if (planDisplay.selected_sources?.length > 0) {
    lines.push(`**数据源**: ${planDisplay.selected_sources.join(", ")}`);
  }
  if (planDisplay.selected_tools?.length > 0) {
    lines.push(`**工具**: ${planDisplay.selected_tools.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * Format tool call log into a readable message.
 */
function formatToolCallLog(toolCallLog) {
  if (!toolCallLog || toolCallLog.length === 0) return "";
  return toolCallLog
    .map((tc) => `🔧 **${tc.tool}** → ${tc.result_summary}`)
    .join("\n");
}
