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

    // Check if AI is requesting a plan (via _plan_request JSON)
    if (!assistantMsg.tool_calls && assistantMsg.content) {
      const planRequest = extractPlanRequest(assistantMsg.content);
      if (planRequest) {
        return {
          reply: assistantMsg.content,
          messages: currentMessages,
          planRequest: planRequest,
          toolCallLog,
        };
      }
    }

    const toolCalls = assistantMsg.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      return { reply: assistantMsg.content || "", messages: currentMessages, toolCallLog, draftId };
    }

    // Classify tool calls by side effect
    const hasWriteTools = toolCalls.some((tc) => {
      const effect = getToolSideEffect(tc.function.name);
      return effect === "write" || effect === "destructive";
    });

    // Draft tools are auto-executed (they create previews, not real data)
    const hasDraftTools = toolCalls.some((tc) => getToolSideEffect(tc.function.name) === "draft");

    if (hasWriteTools && !hasDraftTools) {
      // Build pending actions list for the frontend
      const pending = toolCalls.map((tc) => {
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
        pendingToolCalls: toolCalls,
        toolCallLog,
      };
    }

    // Read-only and draft tools — execute immediately and log for visibility
    const toolResults = await executeAllTools(toolCalls, { supabase, userId, accessToken });
    currentMessages.push(...toolResults);

    // Log tool calls for frontend visibility
    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      let args = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch { args = {}; }
      let result = {};
      try { result = JSON.parse(toolResults[i].content); } catch { result = {}; }

      // Capture draft_id if a draft was created
      if (tc.function.name === 'propose_board_changes' && result.draft_id) {
        draftId = result.draft_id;
      }

      const logEntry = {
        id: tc.id,
        tool: tc.function.name,
        args,
        result_summary: summarizeToolResult(tc.function.name, result),
        status: result.error ? "error" : "completed",
      };
      toolCallLog.push(logEntry);
      if (onToolCall) onToolCall(logEntry);
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

async function executeAllTools(toolCalls, ctx) {
  return Promise.all(
    toolCalls.map(async (tc) => {
      let args = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch { args = {}; }
      try {
        const result = await executeTool(tc.function.name, args, ctx);
        return { role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) };
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
 * Extract a _plan_request from AI response content.
 * AI responds with ```json {"_plan_request": true, "intent": "..."} ``` when it wants a plan.
 */
function extractPlanRequest(content) {
  if (!content) return null;
  // Try to find JSON with _plan_request
  const jsonMatch = content.match(/```json\s*(\{[\s\S]*?\})\s*```/) ||
                    content.match(/(\{"_plan_request"\s*:\s*true[\s\S]*?\})/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[1]);
    if (parsed._plan_request && parsed.intent) {
      return { intent: parsed.intent };
    }
  } catch {}
  return null;
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

  // Load conversation history for context
  const history = await listMessages(adminSb, convId, { limit: 50 });

  // Convert DB messages to OpenAI format (skip plan metadata messages)
  const messages = history
    .filter((m) => m.message_type === "text" || m.message_type === "plan_complete" || m.message_type === "step_progress")
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  // ALL input goes to AI — AI decides whether to chat or request a plan
  const result = await chat({ messages, userId, supabase, accessToken, surfaceContext, mode });

  // Check if AI requested a plan
  if (result.planRequest) {
    try {
      const { planSpec, planDisplay, suggestedTopicId, title } = await generatePlan(
        result.planRequest.intent,
        userId,
        supabase
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
  }).catch((err) => {
    console.error("[executor] Plan execution failed:", err);
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
