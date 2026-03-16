// ========= Chat Orchestrator (Harness V2) =========
// Core loop only: call model -> execute tools -> append results -> continue.

import { createAIClientConfig, callChatAPI } from "../services/aiClient.mjs";
import { LLM_TOOL_DEFINITIONS, TOOL_DEFINITIONS } from "./tools.mjs";
import { executeTool, executeToolCalls } from "./toolExecutor.mjs";
import {
  createConversation,
  addMessage,
  updateConversation,
  listMessages,
} from "../services/supabase/conversations.mjs";
import { buildSystemPrompt } from "./promptBuilder.mjs";
import {
  buildContextMessages,
  shouldCompact,
  getMessagesForCompaction,
  generateStructuredSummary,
  roughTokenEstimate,
  isContextOverflowError,
  trimMessagesForRetry,
} from "./contextManager.mjs";

const CONTEXT_USAGE_LIMIT = 0.8;
const TOOL_ESTIMATE_BUFFER = 6000;
const CONFIRM_ROUND_LIMIT = 3;

// TODO: multi-instance deployment should replace this in-memory lock
// with a distributed lock (Postgres advisory lock or Redis SETNX).
const conversationLocks = new Map();

const summaryInProgress = new Set();
const summaryLastAttempt = new Map();

// ── Core Chat Loop ───────────────────────────────────

export async function chat({
  messages,
  userId,
  supabase,
  accessToken,
  onToolCall,
  surfaceContext,
  mode = "auto",
  confirmRound = 0,
}) {
  const aiConfig = await createAIClientConfig(userId, supabase);
  const systemPrompt = buildSystemPrompt({ surfaceContext, mode });

  const currentMessages = messages?.[0]?.role === "system"
    ? [...messages]
    : [{ role: "system", content: systemPrompt }, ...(messages || [])];

  const toolCallLog = [];
  let draftId = null;

  while (true) {
    if (isNearContextLimit(currentMessages, aiConfig.contextWindow)) {
      return finalizeWithoutTools(aiConfig, currentMessages, toolCallLog, draftId);
    }

    let response;
    try {
      response = await callWithTools(aiConfig, currentMessages);
    } catch (err) {
      if (!isContextOverflowError(err)) throw err;
      const trimmed = trimMessagesForRetry(currentMessages);
      currentMessages.splice(0, currentMessages.length, ...trimmed);
      response = await callWithTools(aiConfig, currentMessages);
    }

    const assistantMsg = response?.choices?.[0]?.message;
    if (!assistantMsg) throw new Error("Empty response from AI");

    const toolCalls = assistantMsg.tool_calls || [];
    if (toolCalls.length === 0) {
      currentMessages.push(assistantMsg);
      return {
        reply: sanitizeReply(assistantMsg.content || ""),
        messages: currentMessages,
        toolCallLog,
        draftId,
      };
    }

    const execResult = await executeToolCalls({
      assistantMsg,
      toolCalls,
      ctx: {
        supabase,
        userId,
        accessToken,
        surfaceContext,
        mode,
        confirmRound,
        onToolCall,
      },
    });

    if (execResult.assistantMessageForHistory) {
      currentMessages.push(execResult.assistantMessageForHistory);
    }
    if (execResult.results.length > 0) {
      currentMessages.push(...execResult.results);
    }
    toolCallLog.push(...execResult.toolCallLog);
    if (execResult.draftId) draftId = execResult.draftId;

    if (execResult.pendingActions.length > 0) {
      return {
        reply: "",
        messages: currentMessages,
        pendingActions: execResult.pendingActions,
        pendingToolCalls: execResult.pendingToolCalls,
        toolCallLog,
        draftId,
      };
    }
  }
}

export async function chatConfirm({
  messages,
  pendingToolCalls,
  confirmedIds,
  userId,
  supabase,
  accessToken,
  surfaceContext,
  mode = "auto",
}) {
  const aiConfig = await createAIClientConfig(userId, supabase);
  const toolCallLog = [];
  let draftId = null;

  const incomingRound = Math.max(
    1,
    ...(pendingToolCalls || []).map((tc) => Number(tc.__confirm_round || 1))
  );
  const effectiveMode = mode === "auto"
    ? ((pendingToolCalls || []).find((tc) => tc.__mode)?.__mode || "agent")
    : mode;

  const strippedToolCalls = (pendingToolCalls || []).map(stripPendingMeta);
  const assistantMsg = {
    role: "assistant",
    content: null,
    tool_calls: strippedToolCalls,
  };

  const currentMessages = [...(messages || []), assistantMsg];
  const confirmedSet = new Set(confirmedIds || []);

  const toolResults = await Promise.all(strippedToolCalls.map(async (tc) => {
    const name = tc?.function?.name;
    const args = parseArgs(tc?.function?.arguments);

    if (!confirmedSet.has(tc.id)) {
      const cancelledResult = { cancelled: true, message: "用户取消了该操作" };
      toolCallLog.push({
        id: tc.id,
        tool: name,
        args,
        result_summary: "用户取消",
        status: "cancelled",
      });
      return {
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(cancelledResult),
      };
    }

    try {
      const result = await executeTool(name, args, { supabase, userId, accessToken, surfaceContext, mode: effectiveMode });
      if (result?.draft_id) draftId = result.draft_id;
      toolCallLog.push({
        id: tc.id,
        tool: name,
        args,
        result_summary: result?.error ? `错误: ${result.error}` : "完成",
        status: result?.error ? "error" : "completed",
      });
      return {
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      };
    } catch (err) {
      const errorResult = {
        error: "tool_execution_failed",
        message: `${name} 执行失败`,
        hint: err.message,
      };
      toolCallLog.push({
        id: tc.id,
        tool: name,
        args,
        result_summary: `错误: ${err.message}`,
        status: "error",
      });
      return {
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(errorResult),
      };
    }
  }));

  currentMessages.push(...toolResults);

  let confirmRound = incomingRound;

  while (true) {
    if (isNearContextLimit(currentMessages, aiConfig.contextWindow)) {
      return finalizeWithoutTools(aiConfig, currentMessages, toolCallLog, draftId);
    }

    let response;
    try {
      response = await callWithTools(aiConfig, currentMessages);
    } catch (err) {
      if (!isContextOverflowError(err)) throw err;
      const trimmed = trimMessagesForRetry(currentMessages);
      currentMessages.splice(0, currentMessages.length, ...trimmed);
      response = await callWithTools(aiConfig, currentMessages);
    }

    const assistant = response?.choices?.[0]?.message;
    if (!assistant) throw new Error("Empty response from AI");

    const nextToolCalls = assistant.tool_calls || [];
    if (nextToolCalls.length === 0) {
      currentMessages.push(assistant);
      return {
        reply: sanitizeReply(assistant.content || ""),
        messages: currentMessages,
        toolCallLog,
        draftId,
      };
    }

    const execResult = await executeToolCalls({
      assistantMsg: assistant,
      toolCalls: nextToolCalls,
      ctx: {
        supabase,
        userId,
        accessToken,
        surfaceContext,
        mode: effectiveMode,
        confirmRound,
      },
    });

    if (execResult.assistantMessageForHistory) {
      currentMessages.push(execResult.assistantMessageForHistory);
    }
    if (execResult.results.length > 0) {
      currentMessages.push(...execResult.results);
    }
    toolCallLog.push(...execResult.toolCallLog);
    if (execResult.draftId) draftId = execResult.draftId;

    if (execResult.pendingActions.length > 0) {
      if (confirmRound >= CONFIRM_ROUND_LIMIT) {
        currentMessages.push({
          role: "system",
          content: "确认轮次已达到上限，请基于已有结果直接回复用户，不再发起新的写入请求。",
        });
        return finalizeWithoutTools(aiConfig, currentMessages, toolCallLog, draftId);
      }

      confirmRound += 1;
      return {
        reply: "",
        messages: currentMessages,
        pendingActions: execResult.pendingActions,
        pendingToolCalls: execResult.pendingToolCalls,
        toolCallLog,
        draftId,
      };
    }
  }
}

// ── Conversation Persistence ─────────────────────────

export async function chatWithConversation({
  conversationId,
  userMessage,
  userId,
  supabase,
  accessToken,
  surfaceContext,
  mode = "auto",
}) {
  const lockKey = conversationId || "new";
  while (conversationLocks.has(lockKey)) {
    await conversationLocks.get(lockKey);
  }
  let releaseLock;
  const lockPromise = new Promise((resolve) => { releaseLock = resolve; });
  conversationLocks.set(lockKey, lockPromise);

  try {
    return await _chatWithConversationInner({
      conversationId,
      userMessage,
      userId,
      supabase,
      accessToken,
      surfaceContext,
      mode,
    });
  } finally {
    conversationLocks.delete(lockKey);
    releaseLock();
  }
}

async function _chatWithConversationInner({
  conversationId,
  userMessage,
  userId,
  supabase,
  accessToken,
  surfaceContext,
  mode,
}) {
  let convId = conversationId;
  let isNewConversation = false;

  if (convId) {
    const { data: ownedConv, error: convCheckError } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", convId)
      .eq("user_id", userId)
      .maybeSingle();

    if (convCheckError) throw new Error(`会话校验失败: ${convCheckError.message}`);
    if (!ownedConv) convId = null;
  }

  if (!convId) {
    const conv = await createConversation(supabase, userId);
    convId = conv.id;
    isNewConversation = true;
  }

  await addMessage(supabase, convId, {
    role: "user",
    content: userMessage,
    message_type: "text",
  });

  const history = await listMessages(supabase, convId, { limit: 300 });
  const existingSummary = history.find((m) => m.message_type === "conversation_summary") || null;
  const contextMessages = buildContextMessages(history, existingSummary?.content || null);

  const result = await chat({
    messages: contextMessages,
    userId,
    supabase,
    accessToken,
    surfaceContext,
    mode,
  });

  if (result.toolCallLog?.length) {
    await addMessage(supabase, convId, {
      role: "assistant",
      content: formatToolCallLog(result.toolCallLog),
      message_type: "tool_calls",
      metadata: { tool_calls: result.toolCallLog },
    });
  }

  if (result.reply) {
    await addMessage(supabase, convId, {
      role: "assistant",
      content: result.reply,
      message_type: "text",
      metadata: result.pendingActions ? { pendingActions: result.pendingActions } : {},
    });
  }

  if (isNewConversation) {
    generateConversationTitle(userMessage, userId, supabase)
      .then((title) => updateConversation(supabase, userId, convId, { title }))
      .catch((err) => console.error("[orchestrator] auto-title failed:", err.message));
  }

  const lastCompactionAt = summaryLastAttempt.get(convId) || 0;
  if (
    shouldCompact(history, existingSummary, lastCompactionAt) &&
    !summaryInProgress.has(convId)
  ) {
    summaryInProgress.add(convId);
    summaryLastAttempt.set(convId, Date.now());
    compactConversation({
      convId,
      history,
      existingSummary,
      userId,
      supabase,
    })
      .catch((err) => console.error("[orchestrator] compaction failed:", err.message))
      .finally(() => summaryInProgress.delete(convId));
  }

  return {
    conversationId: convId,
    reply: result.reply,
    messageType: "text",
    messages: result.messages,
    toolCallLog: result.toolCallLog || [],
    pendingActions: result.pendingActions || null,
    pendingToolCalls: result.pendingToolCalls || null,
    draftId: result.draftId || null,
  };
}

async function compactConversation({ convId, history, existingSummary, userId, supabase }) {
  const messagesToSummarize = getMessagesForCompaction(history);
  if (!messagesToSummarize.length) return;

  const aiConfig = await createAIClientConfig(userId, supabase);
  const summary = await generateStructuredSummary({
    aiConfig,
    previousSummary: existingSummary?.content || "",
    messagesToSummarize,
  });
  if (!summary) return;

  await addMessage(supabase, convId, {
    role: "system",
    content: summary,
    message_type: "conversation_summary",
  });
}

async function generateConversationTitle(firstMessage, userId, supabase) {
  try {
    const aiConfig = await createAIClientConfig(userId, supabase);
    const messages = [
      {
        role: "system",
        content: "Generate a short Chinese title (5-15 chars). Output title text only.",
      },
      { role: "user", content: firstMessage },
    ];
    const response = await callChatAPI(aiConfig, messages, {
      temperature: 0.3,
      max_tokens: 30,
    });
    return response?.choices?.[0]?.message?.content?.trim() || firstMessage.slice(0, 20);
  } catch {
    return firstMessage.slice(0, 20);
  }
}

function callWithTools(aiConfig, messages) {
  return callChatAPI(aiConfig, messages, {
    tools: LLM_TOOL_DEFINITIONS,
    tool_choice: "auto",
  });
}

async function finalizeWithoutTools(aiConfig, currentMessages, toolCallLog, draftId) {
  currentMessages.push({
    role: "system",
    content: "上下文接近上限。请基于已有信息直接回复用户，不要再调用工具。",
  });
  const finalResponse = await callChatAPI(aiConfig, currentMessages);
  const finalMsg = finalResponse?.choices?.[0]?.message;
  if (finalMsg) currentMessages.push(finalMsg);
  return {
    reply: sanitizeReply(finalMsg?.content || "抱歉，我未能完成该请求。"),
    messages: currentMessages,
    toolCallLog,
    draftId,
  };
}

function isNearContextLimit(messages, contextWindow = 128000) {
  return roughTokenEstimate(messages) + TOOL_ESTIMATE_BUFFER > contextWindow * CONTEXT_USAGE_LIMIT;
}

function parseArgs(rawArgs) {
  try {
    return JSON.parse(rawArgs || "{}");
  } catch {
    return {};
  }
}

function stripPendingMeta(toolCall) {
  const { __confirm_round, __mode, ...rest } = toolCall || {};
  return rest;
}

function formatToolCallLog(toolCallLog) {
  if (!toolCallLog || toolCallLog.length === 0) return "";
  return toolCallLog
    .map((tc) => `工具 ${tc.tool}: ${tc.result_summary}`)
    .join("\n");
}

// ── Reply Sanitization ───────────────────────────────

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const TOOL_NAMES = new Set(TOOL_DEFINITIONS.map((t) => t.function.name));

function sanitizeReply(text) {
  if (!text) return text;
  let result = String(text);

  result = result.replace(UUID_REGEX, (match, offset) => {
    const before = result[offset - 1];
    if (before === '"' || before === "'" || before === "`") return match;
    return "[…]";
  });

  for (const name of TOOL_NAMES) {
    if (result.includes(name)) result = result.replaceAll(name, "");
  }

  return result
    .replace(/  +/g, " ")
    .replace(/「\s*」/g, "")
    .replace(/\(\s*\)/g, "")
    .trim();
}

