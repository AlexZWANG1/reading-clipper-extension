// ========= Chat Orchestrator =========
// Manages multi-turn AI chat with tool-calling loop.
// Implements confirmation gate for write/destructive operations.

import { createAIClientConfig, callChatAPI } from "../services/aiClient.mjs";
import { TOOL_DEFINITIONS, getToolSideEffect, buildConfirmMessage } from "./tools.mjs";
import { executeTool } from "./toolExecutor.mjs";

const MAX_TOOL_ROUNDS = 6;

const SYSTEM_PROMPT = `You are a research assistant for the "Reading Clipper" app. You help users manage their reading knowledge base: cards, topics, thinking boards, documents, sources, and ingested materials.

Answer in the same language the user uses. Be concise and helpful. Always ground your answers in the user's actual data — call tools to look up data before answering.

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
 * @returns {Promise<{reply: string, messages: Array, pendingActions?: Array, pendingToolCalls?: Array}>}
 */
export async function chat({ messages, userId, supabase, accessToken }) {
  const aiConfig = await createAIClientConfig(userId, supabase);

  const fullMessages = messages[0]?.role === "system"
    ? messages
    : [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

  let currentMessages = [...fullMessages];
  let rounds = 0;

  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    const response = await callWithTools(aiConfig, currentMessages);
    const choice = response.choices?.[0];
    if (!choice) throw new Error("Empty response from AI");

    const assistantMsg = choice.message;
    currentMessages.push(assistantMsg);

    const toolCalls = assistantMsg.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      return { reply: assistantMsg.content || "", messages: currentMessages };
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

      // Return messages WITHOUT the assistant tool_calls message.
      // We strip it so the message array stays valid for OpenAI.
      // The raw tool calls are sent separately as pendingToolCalls.
      const messagesBeforeToolCall = currentMessages.slice(0, -1);

      return {
        reply: "",
        messages: messagesBeforeToolCall,
        pendingActions: pending,
        pendingToolCalls: toolCalls,
      };
    }

    // All read_only — execute immediately
    const toolResults = await executeAllTools(toolCalls, { supabase, userId, accessToken });
    currentMessages.push(...toolResults);
  }

  // Exhausted rounds — one final call without tools
  const finalResponse = await callChatAPI(aiConfig, currentMessages);
  const finalMsg = finalResponse.choices?.[0]?.message;
  if (finalMsg) currentMessages.push(finalMsg);

  return {
    reply: finalMsg?.content || "Sorry, I could not complete the request.",
    messages: currentMessages,
  };
}

/**
 * Continue after user confirms pending write actions.
 * Re-issues the tool calls to the AI, executes them, then continues the loop.
 *
 * @param {Object} opts
 * @param {Array}  opts.messages        - messages up to (but NOT including) the assistant tool_calls msg
 * @param {Array}  opts.pendingToolCalls - the raw tool_calls from the assistant message
 * @param {Array}  opts.confirmedIds    - tool call IDs the user confirmed (others are cancelled)
 * @param {string} opts.userId
 * @param {Object} opts.supabase
 */
export async function chatConfirm({ messages, pendingToolCalls, confirmedIds, userId, supabase }) {
  const aiConfig = await createAIClientConfig(userId, supabase);

  // Reconstruct: add the assistant message with tool_calls back
  const assistantMsg = {
    role: "assistant",
    content: null,
    tool_calls: pendingToolCalls,
  };

  let currentMessages = [...messages, assistantMsg];

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
        return {
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        };
      } catch (err) {
        return {
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ error: err.message }),
        };
      }
    })
  );

  currentMessages.push(...toolResults);

  // Continue the normal loop — AI sees the tool results and responds
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
      return { reply: nextMsg.content || "", messages: currentMessages };
    }

    // If more write tools appear, pause again
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
      };
    }

    // All read_only — execute
    const results = await executeAllTools(nextToolCalls, { supabase, userId });
    currentMessages.push(...results);
  }

  const finalResponse = await callChatAPI(aiConfig, currentMessages);
  const finalMsg = finalResponse.choices?.[0]?.message;
  if (finalMsg) currentMessages.push(finalMsg);

  return {
    reply: finalMsg?.content || "Sorry, I could not complete the request.",
    messages: currentMessages,
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
