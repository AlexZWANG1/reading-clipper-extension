// ========= Chat Orchestrator =========
// AI-first architecture with modular prompt, scoped tools, and methodology awareness.
// Dynamic prompt assembly replaces monolithic SYSTEM_PROMPT.
// Tool groups prevent AI from accessing write tools when user is only querying.

import { createAIClientConfig, callChatAPI } from "../services/aiClient.mjs";
import { getToolSideEffect, buildConfirmMessage } from "./tools.mjs";
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

const MAX_TOOL_ROUNDS = 6;

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

  // Determine tool group
  const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
  const toolGroup = toolGroupOverride || (mode === 'chat' ? 'explore' : inferToolGroup(lastUserMsg, surfaceContext));
  const scopedTools = getToolsForGroup(toolGroup);

  // Build the system prompt
  const systemPrompt = buildSystemPrompt({
    surfaceContext,
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
      return { reply: assistantMsg.content || "", messages: currentMessages, toolCallLog, draftId };
    }

    // Split tool calls into write (need confirmation) and auto (safe to execute)
    const writeToolCalls = toolCalls.filter((tc) => {
      const effect = getToolSideEffect(tc.function.name);
      return effect === "write" || effect === "destructive";
    });
    const autoToolCalls = toolCalls.filter((tc) => {
      const effect = getToolSideEffect(tc.function.name);
      return effect === "read_only" || effect === "draft";
    });

    // Auto-execute read_only + draft tools immediately
    if (autoToolCalls.length > 0) {
      const autoResults = [];
      for (const tc of autoToolCalls) {
        let args = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
        try {
          const rawResult = await executeTool(tc.function.name, args, {
            supabase, userId, accessToken,
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
            result_summary: summarizeResult(rawResult),
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
        const parsed = JSON.parse(planToolResult.content);
        return {
          reply: '',
          messages: currentMessages,
          planRequest: { intent: parsed.intent },
          toolCallLog,
        };
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

  // Exhausted rounds — one final call without tools
  const finalResponse = await callChatAPI(aiConfig, currentMessages);
  const finalMsg = finalResponse.choices?.[0]?.message;
  if (finalMsg) currentMessages.push(finalMsg);

  return {
    reply: finalMsg?.content || "Sorry, I could not complete the request.",
    messages: currentMessages,
    toolCallLog,
    draftId,
  };
}

function isBoardMutation(toolName) {
  return ['create_board_node', 'update_board_node', 'delete_board_node',
          'create_board_edge', 'delete_board_edge', 'propose_board_changes'].includes(toolName);
}

/**
 * Continue after user confirms pending write actions.
 */
export async function chatConfirm({ messages, pendingToolCalls, confirmedIds, userId, supabase }) {
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
        const result = await executeTool(tc.function.name, args, { supabase, userId });
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

  // Continue the normal loop — use full tool set since user already confirmed
  const allTools = getToolsForGroup('full');
  let rounds = 0;
  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    const response = await callWithTools(aiConfig, currentMessages, allTools);
    const choice = response.choices?.[0];
    if (!choice) throw new Error("Empty response from AI");

    const nextMsg = choice.message;
    currentMessages.push(nextMsg);

    const nextToolCalls = nextMsg.tool_calls;
    if (!nextToolCalls || nextToolCalls.length === 0) {
      return { reply: nextMsg.content || "", messages: currentMessages, toolCallLog };
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
    const results = await executeAllTools(nextToolCalls, { supabase, userId });
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
    reply: finalMsg?.content || "Sorry, I could not complete the request.",
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

    default:
      return result;
  }
}

function summarizeArgs(args) {
  if (!args) return '';
  const entries = Object.entries(args);
  if (entries.length === 0) return '';
  return entries
    .slice(0, 3)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v.slice(0, 30) : JSON.stringify(v).slice(0, 30)}`)
    .join(', ');
}

function summarizeResult(result) {
  if (!result) return 'null';
  if (result.error) return `error: ${result.error}`;
  const keys = Object.keys(result);
  return keys.slice(0, 3).map(k => {
    const v = result[k];
    if (Array.isArray(v)) return `${k}: ${v.length} items`;
    if (typeof v === 'string') return `${k}: ${v.slice(0, 40)}`;
    return `${k}: ${JSON.stringify(v).slice(0, 40)}`;
  }).join(', ');
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

/**
 * Summarize a tool result for display.
 */
function summarizeToolResult(tool, result) {
  if (!result) return "无结果";
  if (result.error) return `错误: ${result.error}`;

  switch (tool) {
    case "fetch_rss":
      return `抓取了 ${result.items?.length || 0} 条 RSS 条目`;
    case "semantic_search":
      return `找到 ${result.total || result.results?.length || 0} 条相关内容`;
    case "search_cards":
      return `找到 ${result.count || result.cards?.length || 0} 张相关卡片`;
    case "ingest_url":
      return `已摄入: ${result.title || result.material_id || "unknown"}`;
    case "create_card":
      return `已创建卡片: ${result.card?.title || result.message || ""}`;
    case "list_cards":
      return `列出 ${result.total || result.cards?.length || 0} 张卡片`;
    case "list_topics":
      return `列出 ${result.topics?.length || 0} 个主题`;
    case "list_boards":
      return `列出 ${result.boards?.length || 0} 个论证板`;
    case "get_board":
      return `加载论证板: ${result.board?.title || ""}`;
    case "list_documents":
      return `列出 ${result.documents?.length || 0} 份文档`;
    case "get_document":
      return `加载文档: ${result.document?.title || ""}`;
    case "list_sources":
      return `列出 ${result.sources?.length || 0} 个来源`;
    case "get_card":
      return result.card ? `卡片: ${result.card.title || result.card.summary?.slice(0, 30) || ""}` : "未找到";
    case "create_board_node":
      return result.message || "节点已创建";
    case "update_board_node":
      return result.message || "节点已更新";
    case "delete_board_node":
      return result.message || "节点已删除";
    case "create_board_edge":
      return result.message || "关系已创建";
    case "delete_board_edge":
      return result.message || "关系已删除";
    case "propose_board_changes":
      return `草拟了 ${result.changes_count || 0} 个更改 (draft: ${result.draft_id || "?"})`;
    case "get_board_health":
      return `假说: ${result.total_hypotheses || 0}, 盲点: ${result.blind_spots || 0}`;
    default:
      return JSON.stringify(result).slice(0, 80);
  }
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
  const adminSb = supabaseAdmin;
  let convId = conversationId;
  let isNewConversation = false;

  if (!convId) {
    const conv = await createConversation(adminSb, userId);
    convId = conv.id;
    isNewConversation = true;
  }

  // Persist user message
  await addMessage(adminSb, convId, {
    role: "user",
    content: userMessage,
    message_type: "text",
  });

  // Load conversation history (newest-first after P0-1 fix)
  const history = await listMessages(adminSb, convId, { limit: 200 });

  // Build system prompt and scoped tools (needed for budget calculation)
  const topicId = surfaceContext?.topicId || null;
  const [methodology, researchState] = await Promise.all([
    loadUserMethodology(supabase, userId).catch(() => null),
    topicId ? getResearchState(supabase, topicId).catch(() => null) : null,
  ]);
  const toolGroup = inferToolGroup(userMessage, surfaceContext);

  const systemPrompt = buildSystemPrompt({ surfaceContext, methodology, researchState, toolGroup, mode });
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
  const chatMessages = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      // For tool_calls messages, include a compressed summary
      if (m.message_type === 'tool_calls' && m.metadata?.tool_calls) {
        return {
          role: m.role,
          content: m.metadata.tool_calls
            .map(tc => `[Tool: ${tc.tool}(${summarizeArgs(tc.args)}) → ${tc.result_summary || 'done'}]`)
            .join('\n'),
        };
      }
      return { role: m.role, content: m.content };
    });

  // Select messages within token budget
  const budgetedMessages = buildHistoryWithinBudget(chatMessages, historyBudget, conversationSummary);

  // ALL input goes to AI — AI decides whether to chat or request a plan
  const result = await chat({ messages: budgetedMessages, userId, supabase, accessToken, surfaceContext, mode });

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
      await addMessage(adminSb, convId, {
        role: "assistant",
        content: planMessage,
        message_type: "plan_proposal",
        metadata: { plan_spec: planSpec, plan_display: planDisplay, suggested_topic_id: suggestedTopicId },
      });

      // Auto-title
      if (isNewConversation) {
        generateConversationTitle(userMessage, userId, supabase)
          .then((t) => updateConversation(adminSb, userId, convId, { title: t }))
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
      // Fall through — use the AI's original text response
    }
  }

  // Normal chat response — persist tool call log + reply
  const toolCallLog = result.toolCallLog || [];

  // Persist tool call visibility messages
  if (toolCallLog.length > 0) {
    await addMessage(adminSb, convId, {
      role: "assistant",
      content: formatToolCallLog(toolCallLog),
      message_type: "tool_calls",
      metadata: { tool_calls: toolCallLog },
    });
  }

  // Persist assistant reply
  if (result.reply) {
    await addMessage(adminSb, convId, {
      role: "assistant",
      content: result.reply,
      message_type: "text",
      metadata: result.pendingActions ? { pendingActions: result.pendingActions } : {},
    });
  }

  // Auto-title
  if (isNewConversation) {
    generateConversationTitle(userMessage, userId, supabase)
      .then((t) => updateConversation(adminSb, userId, convId, { title: t }))
      .catch((err) => console.error("[orchestrator] Auto-title failed:", err.message));
  }

  // Async conversation summary trigger (non-blocking)
  const textMessageCount = history.filter(m => m.message_type === 'text').length;
  const existingSummary = history.find(m => m.message_type === 'conversation_summary');
  const summaryAge = existingSummary
    ? history.filter(m => m.message_type === 'text' && m.created_at > existingSummary.created_at).length
    : Infinity;

  if (textMessageCount > 20 && summaryAge > 10) {
    generateConversationSummary(adminSb, convId, history, userId, supabase)
      .catch(err => console.error('[orchestrator] Summary generation failed:', err.message));
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
