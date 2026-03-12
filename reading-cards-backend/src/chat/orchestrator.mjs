// ========= Chat Orchestrator =========
// AI-first architecture: ALL user input goes to AI, AI decides everything.
// No keyword heuristics — AI understands intent, picks tools, generates plans.
// Tool calls are visible to the user during all interactions.

import { createAIClientConfig, callChatAPI } from "../services/aiClient.mjs";
import { TOOL_DEFINITIONS, getToolSideEffect, buildConfirmMessage } from "./tools.mjs";
import { executeTool } from "./toolExecutor.mjs";
import { generatePlan, generateConversationTitle } from "./planner.mjs";
import { executePlan, cancelExecution } from "./executor.mjs";
import {
  createConversation, addMessage, addMessages, updateConversation, listMessages,
} from "../services/supabase/conversations.mjs";
import { createTask } from "../services/supabase/tasks.mjs";
import { supabaseAdmin } from "../config/supabase.mjs";

const MAX_TOOL_ROUNDS = 6;

const SYSTEM_PROMPT = `You are a research assistant for "Verity" (求真), an evidence-driven research workbench. You help users manage their reading knowledge base: cards, topics, thinking boards, documents, sources, and ingested materials.

Answer in the same language the user uses. Be concise and helpful. Always ground your answers in the user's actual data — call tools to look up data before answering.

## Intent Understanding

You must intelligently understand every user message and decide how to respond:

1. **Simple Q&A** — The user asks a question or makes a request you can handle directly with 0-3 tool calls. Just answer normally using tools as needed.

2. **Complex multi-step research task** — The user describes a task that requires 4+ steps, involves collecting data from external sources (RSS, URLs), processing multiple items, or setting up ongoing monitoring. For these, you MUST respond with a structured plan proposal.

### When to propose a plan:
- User asks to "track", "monitor", "collect", "research", "analyze" something over time
- User wants to process multiple URLs or RSS feeds systematically
- User wants to "create cards from" a large set of sources
- The task naturally decomposes into collect → filter → process → synthesize steps
- The task would take more than 3-4 tool calls to complete

### How to propose a plan:
When you determine a task needs a plan, respond with ONLY a JSON block in this exact format (no other text before or after):

\`\`\`json
{"_plan_request": true, "intent": "your understanding of what the user wants to accomplish"}
\`\`\`

The system will then generate a detailed execution plan for the user to review and confirm.

### For everything else:
Just respond naturally. Use tools to look up data, create cards, manage boards, etc. Every tool call you make will be visible to the user, so be purposeful.

## Data Model

1. **Topics** — Top-level categories (e.g., "AI Safety", "Climate Economics").
   - Each topic contains many **Cards** (the global card pool).
   - Each topic has at most one **Thinking Board** (1:1).

2. **Cards** — The core knowledge unit. Fields: summary, key_points[], raw_snippet, note, source_name, source_url, topic_title/topic_id. Each card has a globally unique ID.

3. **Materials** — Ingested documents (URLs, PDFs, text) that have been processed into searchable chunks with embeddings. Use semantic_search to find information across these materials.

4. **Thinking Boards** — Visual reasoning canvases. Each board contains:
   - **Nodes** of three types, forming a tree via parent_id:
     - **question** — A research question (priority, status)
     - **hypothesis** — A testable claim (claim text, hypo_state, confidence)
     - **evidence** — A piece of evidence (evidence_type, strength, card_id referencing a card from the global pool)
   - **Edges** — Relationships between nodes: supports / refutes / neutral
     - Edges have source_node_id → target_node_id and a relation_type

   Typical board tree: question → hypothesis (child via parent_id) → evidence (child via parent_id, linked to card via card_id).
   Edges express the semantic relationship (supports/refutes) between nodes.

5. **Documents** — Story-building documents with questions, hypotheses, and story units.
6. **Sources** — Information sources the user tracks.

## Tool Usage Patterns

### Searching for Information

**When to use semantic_search:**
- User asks questions about their documents or materials
- User wants to find information across their knowledge base
- User asks "what do my documents say about X?"
- User wants to research a topic using their ingested content

**When to use search_cards:**
- User wants to find specific cards they've created
- User asks about their card collection
- User wants to search card summaries and notes

**Example workflow:**
User: "What do my documents say about AI safety?"
1. Use semantic_search with query="AI safety" to find relevant document chunks
2. Synthesize the information from the search results
3. Present the findings to the user with source references

### Creating a Card
When the user asks to "generate a card", "create a card", "save this as a card":
- Use \`create_card\` with topic_title, summary, key_points, and other fields.
- The topic is auto-created if it doesn't exist.
- The returned card includes its ID — you can use it as card_id when creating evidence nodes later.

### Creating a Question on a Board
When the user provides a new question:
1. Use \`get_board\` to see the existing board structure (especially existing questions).
2. If the board already has questions, ask the user: "This looks like it could be a sub-question of [existing question]. Should I add it under that question, or create it as a new root question?" Present the existing questions as options.
3. Only create the question node after the user confirms where it belongs. Set parent_id to the chosen parent question, or leave it null for a root question.

### Creating a Hypothesis on a Board
When creating a hypothesis on a thinking board:
1. Use \`get_board\` to understand the current board structure.
2. Create the hypothesis with \`create_board_node\` — set node_type="hypothesis", provide the claim text, and **always set parent_id** to the relevant question node ID.
3. After creation, use \`create_board_edge\` to link it to related nodes if appropriate.

### Creating Evidence on a Board
When adding evidence to support or refute a hypothesis:
1. Use \`search_cards\` first to find relevant existing cards.
2. Create the evidence node with \`create_board_node\` — set node_type="evidence", **set parent_id** to the hypothesis node ID, and **set card_id** to reference the source card.
3. Create an edge with \`create_board_edge\` — source_node_id=evidence, target_node_id=hypothesis, relation_type="supports" or "refutes" or "neutral".

### Proactive Multi-Step Workflow
When the user asks to "generate a hypothesis", "analyze this question", or "help me think about this":
1. \`get_board\` — Load the board to see existing questions and structure.
2. \`search_cards\` — Search for cards relevant to the question/topic.
3. \`create_board_node\` (hypothesis) — Create the hypothesis with parent_id pointing to the question.
4. If relevant cards were found, for each relevant card:
   a. \`create_board_node\` (evidence) — Create evidence node with card_id and parent_id pointing to the hypothesis.
   b. \`create_board_edge\` — Create supports/refutes edge linking evidence to hypothesis.

### Card + Evidence Combo
If the user provides text that should become both a card AND evidence on a board:
1. \`create_card\` first — to get the card ID.
2. \`create_board_node\` (evidence) — with that card_id and parent_id pointing to the hypothesis.
3. \`create_board_edge\` — link evidence to hypothesis.

## HARD RULES — Node Relationship Confirmation (MANDATORY)

**Before creating ANY node (question, hypothesis, or evidence) on a board, you MUST follow this protocol:**

1. **Always call \`get_board\` first** to load the full board structure.
2. **Analyze existing nodes** and infer where the new node logically belongs in the tree.
3. **Present your inference to the user and ask for confirmation.** You must NOT silently create isolated/orphan nodes.

### Confirmation Protocol

When the user asks to create a node but does NOT specify its parent or relationship:

**For questions:**
- List all existing question nodes on the board.
- Propose: "Based on the board structure, this question seems related to [existing question X]. Should I add it as a sub-question of X, or as a new independent root question?"
- If multiple candidates exist, list them all with your reasoning for each.
- Wait for the user's answer before calling \`create_board_node\`.

**For hypotheses:**
- List all existing question nodes.
- Propose: "This hypothesis seems to address [question X]. Should I attach it under question X?"
- If the hypothesis could relate to multiple questions, explain your reasoning and let the user choose.
- Wait for confirmation, then create with the correct parent_id.

**For evidence:**
- List all existing hypothesis nodes.
- Propose: "This evidence seems relevant to [hypothesis Y]. Should I link it as supporting/refuting evidence for Y?"
- Suggest the relation_type (supports/refutes/neutral) with your reasoning.
- Wait for confirmation, then create with correct parent_id, card_id, and edge.

### What "analyze" means
- Read the content/claim of each existing node.
- Compare semantically with the new node the user wants to create.
- Identify the most likely parent based on topic relevance.
- If no good match exists, say so explicitly: "I don't see a clear parent for this on the current board. I'll create it as a root node."

### Absolute prohibitions
- **NEVER create a hypothesis or evidence node without parent_id** unless the user explicitly says "create it standalone".
- **NEVER create an evidence node without also creating an edge** (supports/refutes/neutral).
- **NEVER skip the confirmation step.** Even if the relationship seems obvious, confirm it.
- **NEVER create multiple nodes in a single tool-call batch without confirming the full plan first.** Present the entire creation plan (which nodes, which parents, which edges) and get user approval.
- **Always set card_id** on evidence nodes when the evidence comes from an existing card.
- **Never fabricate data.** If you need information, call the appropriate tool to look it up.
- When unsure which board to use, call \`list_boards\` first and ask the user to clarify.`;

/**
 * Run a chat turn. May return pendingActions if write tools need confirmation.
 *
 * @param {Object} opts
 * @param {Array}  opts.messages  - conversation history [{role, content}, ...]
 * @param {string} opts.userId
 * @param {Object} opts.supabase
 * @param {string} opts.accessToken - JWT token for API calls
 * @param {Function} opts.onToolCall - optional callback for tool call visibility
 * @returns {Promise<{reply: string, messages: Array, pendingActions?: Array, pendingToolCalls?: Array, toolCallLog?: Array}>}
 */
export async function chat({ messages, userId, supabase, accessToken, onToolCall }) {
  const aiConfig = await createAIClientConfig(userId, supabase);

  const fullMessages = messages[0]?.role === "system"
    ? messages
    : [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

  let currentMessages = [...fullMessages];
  let rounds = 0;
  const toolCallLog = []; // Track all tool calls for visibility

  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    const response = await callWithTools(aiConfig, currentMessages);
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
      return { reply: assistantMsg.content || "", messages: currentMessages, toolCallLog };
    }

    // Check if any tool calls need confirmation
    const hasWriteTools = toolCalls.some((tc) => {
      const effect = getToolSideEffect(tc.function.name);
      return effect === "write" || effect === "destructive";
    });

    if (hasWriteTools) {
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

    // All read_only — execute immediately and log for visibility
    const toolResults = await executeAllTools(toolCalls, { supabase, userId, accessToken });
    currentMessages.push(...toolResults);

    // Log tool calls for frontend visibility
    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      let args = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch { args = {}; }
      let result = {};
      try { result = JSON.parse(toolResults[i].content); } catch { result = {}; }
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
  }

  // Exhausted rounds — one final call without tools
  const finalResponse = await callChatAPI(aiConfig, currentMessages);
  const finalMsg = finalResponse.choices?.[0]?.message;
  if (finalMsg) currentMessages.push(finalMsg);

  return {
    reply: finalMsg?.content || "Sorry, I could not complete the request.",
    messages: currentMessages,
    toolCallLog,
  };
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

  // Continue the normal loop
  let rounds = 0;
  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    const response = await callWithTools(aiConfig, currentMessages);
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

function callWithTools(aiConfig, messages) {
  return callChatAPI(aiConfig, messages, {
    tools: TOOL_DEFINITIONS,
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
    default:
      return JSON.stringify(result).slice(0, 80);
  }
}

// ══════════════════════════════════════════════════════
// Conversation-aware chat (primary entry point)
// ══════════════════════════════════════════════════════

/**
 * Chat with conversation persistence — AI-first, no keyword classification.
 * ALL user input goes to AI. AI decides whether to chat or request a plan.
 *
 * @param {Object} opts
 * @param {string|null} opts.conversationId
 * @param {string} opts.userMessage
 * @param {string} opts.userId
 * @param {Object} opts.supabase
 * @param {string} opts.accessToken
 * @returns {Promise<Object>}
 */
export async function chatWithConversation({ conversationId, userMessage, userId, supabase, accessToken }) {
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
  const result = await chat({ messages, userId, supabase, accessToken });

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
