// ========= Context Manager =========
// Handles context shaping, structured compaction, and overflow fallbacks.

import { callChatAPI } from "../services/aiClient.mjs";

export const RECENT_MESSAGES_TO_KEEP = 40;
export const COMPACTION_TRIGGER = 60;
export const COMPACTION_COOLDOWN_MS = 10 * 60 * 1000;

function normalizeToolSummary(toolCalls) {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return null;
  return toolCalls
    .slice(0, 8)
    .map((tc) => {
      const summary = typeof tc?.result_summary === "string"
        ? tc.result_summary
        : JSON.stringify(tc?.result_summary || "");
      return `[${tc?.tool || "tool"}] -> ${summary.slice(0, 180)}`;
    })
    .join("\n");
}

function normalizeHistory(history) {
  return (history || [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => m.message_type !== "conversation_summary")
    .map((m) => {
      if (m.message_type === "tool_calls" && m.metadata?.tool_calls) {
        const summary = normalizeToolSummary(m.metadata.tool_calls);
        return { role: m.role, content: summary || "[tool calls]" };
      }
      return { role: m.role, content: String(m.content || "") };
    })
    .filter((m) => m.content.trim().length > 0);
}

/**
 * Do not cut a turn in the middle.
 * Input is newest-first.
 * Returns safe boundary index (exclusive) for keeping head slice.
 */
export function findTurnBoundary(messagesNewestFirst) {
  if (!Array.isArray(messagesNewestFirst) || messagesNewestFirst.length === 0) {
    return 0;
  }

  for (let i = messagesNewestFirst.length - 1; i >= 0; i--) {
    if (messagesNewestFirst[i].role === "user") {
      return i + 1;
    }
  }

  return messagesNewestFirst.length;
}

/**
 * Build context messages for chat call.
 * history input must be newest-first.
 */
export function buildContextMessages(history, conversationSummary = null) {
  const normalized = normalizeHistory(history);
  if (normalized.length === 0) {
    return conversationSummary
      ? [{ role: "user", content: wrapConversationSummary(conversationSummary) }]
      : [];
  }

  const recent = normalized.slice(0, RECENT_MESSAGES_TO_KEEP);
  const safeBoundary = findTurnBoundary(recent);
  const keptNewestFirst = recent.slice(0, safeBoundary || recent.length);
  const chronological = [...keptNewestFirst].reverse();

  if (conversationSummary) {
    chronological.unshift({
      role: "user",
      content: wrapConversationSummary(conversationSummary),
    });
  }

  return chronological;
}

export function shouldCompact(history, existingSummary, lastCompactionAt = 0) {
  const now = Date.now();
  if (lastCompactionAt && now - lastCompactionAt < COMPACTION_COOLDOWN_MS) {
    return false;
  }

  const textMessages = (history || []).filter(
    (m) =>
      (m.role === "user" || m.role === "assistant") &&
      (m.message_type === "text" || m.message_type === "tool_calls" || m.message_type === "error")
  );

  if (textMessages.length <= COMPACTION_TRIGGER) return false;

  if (!existingSummary?.created_at) return true;

  const newerCount = textMessages.filter(
    (m) => new Date(m.created_at).getTime() > new Date(existingSummary.created_at).getTime()
  ).length;
  return newerCount >= 20;
}

export function getMessagesForCompaction(history) {
  const normalized = normalizeHistory(history);
  if (normalized.length <= RECENT_MESSAGES_TO_KEEP) return [];
  return normalized
    .slice(RECENT_MESSAGES_TO_KEEP)
    .reverse()
    .slice(-120);
}

function wrapConversationSummary(summary) {
  return [
    "以下是历史对话压缩摘要，请作为上下文参考：",
    "<conversation_summary>",
    summary,
    "</conversation_summary>",
  ].join("\n");
}

function ensureSections(rawText) {
  const sections = [
    "## 研究主题",
    "## 关键发现",
    "## 用户判断",
    "## 已执行操作",
    "## 当前状态",
  ];
  let text = String(rawText || "").trim();
  if (!text) {
    text = [
      "## 研究主题\n无",
      "## 关键发现\n无",
      "## 用户判断\n无",
      "## 已执行操作\n无",
      "## 当前状态\n无",
    ].join("\n\n");
    return text;
  }
  for (const header of sections) {
    if (!text.includes(header)) {
      text += `\n\n${header}\n无`;
    }
  }
  return text;
}

export async function generateStructuredSummary({
  aiConfig,
  previousSummary,
  messagesToSummarize,
}) {
  if (!messagesToSummarize?.length) return null;

  const serialized = messagesToSummarize
    .map((m) => `${m.role}: ${String(m.content || "").slice(0, 300)}`)
    .join("\n");

  const messages = [
    {
      role: "system",
      content: [
        "你是对话压缩器。输出固定 5 个分区，且每个分区都必须存在：",
        "## 研究主题",
        "## 关键发现",
        "## 用户判断",
        "## 已执行操作",
        "## 当前状态",
        "规则：",
        "- 每个分区至少一行内容，没有内容就写“无”",
        "- 不要输出这五个分区之外的任何标题",
        "- 保留用户已经表达过的判断、偏好和否定意见",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        previousSummary ? `已有摘要:\n${previousSummary}\n` : "已有摘要: 无\n",
        `新对话片段:\n${serialized}`,
        "\n请合并更新后输出完整结构化摘要。",
      ].join("\n\n"),
    },
  ];

  try {
    const resp = await callChatAPI(aiConfig, messages, {
      temperature: 0.2,
      max_tokens: 700,
    });
    const summary = resp?.choices?.[0]?.message?.content?.trim();
    return ensureSections(summary);
  } catch (err) {
    console.error("[contextManager] structured summary generation failed:", err.message);
    return ensureSections(previousSummary);
  }
}

export function roughTokenEstimate(messages = []) {
  let tokens = 0;
  for (const msg of messages) {
    const content = typeof msg?.content === "string" ? msg.content : JSON.stringify(msg?.content || "");
    for (const ch of content) {
      tokens += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 1.1 : 0.28;
    }
    if (Array.isArray(msg?.tool_calls)) {
      tokens += JSON.stringify(msg.tool_calls).length * 0.3;
    }
  }
  return Math.ceil(tokens);
}

export function isContextOverflowError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("context") && (msg.includes("length") || msg.includes("window") || msg.includes("overflow"))
  ) || msg.includes("too many tokens");
}

export function trimMessagesForRetry(messages = []) {
  const systemMessages = messages.filter((m) => m.role === "system");
  const other = messages.filter((m) => m.role !== "system");
  const keepFrom = Math.floor(other.length / 2);
  return [...systemMessages, ...other.slice(keepFrom)];
}
