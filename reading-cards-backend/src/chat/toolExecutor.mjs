// ========= Tool Executor (Harness V2) =========
// Dispatches tool calls, applies context defaults, enforces validation,
// and handles risk-level based execution gating.

import { searchCards, listCards, findCardById, addCard } from "../services/supabase/cards.mjs";
import { listTopicsWithCardCount } from "../services/supabase/topics.mjs";
import {
  listBoards,
  getFullBoard,
  createNode,
  updateNode,
  deleteNode,
  createEdge,
  deleteEdge,
} from "../services/supabase/boards.mjs";
import { listDocuments, getDocument } from "../services/supabase/documents.mjs";
import { listSources } from "../services/supabase/sources.mjs";
import { searchSemantic } from "../services/searchService.mjs";
import { fetchRssItems } from "../tasks/fetchers/rss.mjs";
import { ingestUrl } from "../services/ingestion.mjs";
import { createDraft } from "../agents/draftEngine.mjs";
import { getResearchState, loadUserMethodology } from "../agents/researchContext.mjs";
import {
  TOOL_MAP,
  getToolRiskLevel,
  buildConfirmMessage,
  summarizeToolResult,
  isWriteCapableTool,
} from "./tools.mjs";
import { validateNodeHierarchy, validateCardData, validateEdgeRelation } from "./validation.mjs";

// ── Context auto-injection ─────────────────────────────
const CONTEXT_DEFAULTS = {
  topicId: {
    param: "topic_id",
    tools: ["semantic_search", "search_cards", "list_cards", "list_documents", "list_materials", "get_board_health", "ingest_url"],
  },
  boardId: {
    param: "board_id",
    tools: ["get_board", "propose_board_changes", "create_board_node", "create_board_edge"],
  },
  materialId: {
    param: "material_id",
    tools: ["semantic_search", "get_material"],
  },
};

const ID_PLACEHOLDERS = new Set([
  "current", "cur", "this", "active", "latest",
  "__current__", "__active__", "null", "undefined",
]);

function looksLikeUuid(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function shouldOverrideContextParam(param, providedValue, contextValue) {
  if (!contextValue) return false;
  if (providedValue === undefined || providedValue === null || providedValue === "") return true;
  if (typeof providedValue === "string") {
    const normalized = providedValue.trim().toLowerCase();
    if (!normalized) return true;
    if (ID_PLACEHOLDERS.has(normalized)) return true;
    if (param.endsWith("_id") && !looksLikeUuid(normalized)) return true;
  }
  return false;
}

function applyContextDefaults(name, args, surfaceContext) {
  if (!surfaceContext) return args || {};
  let patched = args || {};
  for (const [ctxKey, { param, tools }] of Object.entries(CONTEXT_DEFAULTS)) {
    if (!tools.includes(name)) continue;
    if (shouldOverrideContextParam(param, patched[param], surfaceContext[ctxKey])) {
      patched = { ...patched, [param]: surfaceContext[ctxKey] };
    }
  }
  return patched;
}

function parseToolArgs(toolCall) {
  try {
    return JSON.parse(toolCall?.function?.arguments || "{}");
  } catch {
    return {};
  }
}

function toStructuredError(error, fallbackMessage = "工具执行失败。") {
  if (error && typeof error === "object" && error.error) return error;
  return {
    error: "tool_execution_failed",
    message: fallbackMessage,
    hint: typeof error?.message === "string" ? error.message : undefined,
  };
}

async function listCandidateParents(supabase, boardId, expectedType) {
  if (!boardId || !expectedType) return [];
  const { data } = await supabase
    .from("board_nodes")
    .select("id, node_type, claim, content")
    .eq("board_id", boardId)
    .eq("node_type", expectedType)
    .order("created_at", { ascending: false })
    .limit(8);
  return (data || []).map((node) => ({
    id: node.id,
    type: node.node_type,
    text: node.claim || node.content?.text || "",
  }));
}

async function getParentNodeType(supabase, parentId) {
  if (!parentId) return null;
  const { data } = await supabase
    .from("board_nodes")
    .select("id, node_type")
    .eq("id", parentId)
    .maybeSingle();
  return data?.node_type || null;
}

async function withHierarchyOptions(supabase, boardId, nodeType, baseError) {
  if (!baseError || baseError.error !== "hierarchy_violation") return baseError;
  const expectedType = nodeType === "evidence" ? "hypothesis" : nodeType === "hypothesis" ? "question" : null;
  if (!expectedType) return baseError;
  const options = await listCandidateParents(supabase, boardId, expectedType);
  return {
    ...baseError,
    available_parents: options,
    available_options: options,
    suggestion: options.length > 0
      ? `请选择以下 ${expectedType} 节点之一作为 parent_id。`
      : `当前画板未找到可用的 ${expectedType} 节点，请先创建该类型节点。`,
  };
}

/**
 * Execute tool calls with risk-level based gating.
 */
export async function executeToolCalls({ assistantMsg, toolCalls, ctx }) {
  const {
    supabase,
    userId,
    accessToken,
    surfaceContext,
    mode = "auto",
    confirmRound = 0,
    onToolCall,
  } = ctx;

  const nextConfirmRound = Math.max(1, (confirmRound || 0) + 1);
  const autoToolCalls = [];
  const results = [];
  const pendingActions = [];
  const pendingToolCalls = [];
  const toolCallLog = [];
  let draftId = null;

  for (const tc of toolCalls || []) {
    const name = tc?.function?.name;
    if (!name || !TOOL_MAP[name]) {
      autoToolCalls.push(tc);
      const result = {
        error: "unknown_tool",
        message: `未知工具: ${name || "unknown"}`,
        suggestion: "请改用已定义的工具名称。",
      };
      results.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
      toolCallLog.push({
        id: tc.id,
        tool: name || "unknown",
        args: {},
        result_summary: summarizeToolResult(name || "unknown", result),
        status: "error",
      });
      continue;
    }

    const parsedArgs = parseToolArgs(tc);
    const riskLevel = getToolRiskLevel(name);
    const blockedByChatMode = mode === "chat" && (riskLevel !== "auto" || isWriteCapableTool(name));

    if (blockedByChatMode) {
      autoToolCalls.push(tc);
      const modeError = {
        error: "mode_restriction",
        message: `聊天模式下不能执行 ${name}。`,
        suggestion: "请提示用户切换到代理模式后再执行该操作。",
        hint: "聊天模式仅允许查询和分析。",
      };
      results.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(modeError) });
      const logEntry = {
        id: tc.id,
        tool: name,
        args: parsedArgs,
        result_summary: summarizeToolResult(name, modeError),
        status: "blocked",
      };
      toolCallLog.push(logEntry);
      if (onToolCall) onToolCall(logEntry);
      continue;
    }

    if (riskLevel === "auto") {
      autoToolCalls.push(tc);
      try {
        const rawResult = await executeTool(name, parsedArgs, { supabase, userId, accessToken, surfaceContext, mode });
        if (rawResult?.draft_id) draftId = rawResult.draft_id;
        const compressed = compressToolResult(name, rawResult);
        results.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(compressed),
        });
        const logEntry = {
          id: tc.id,
          tool: name,
          args: parsedArgs,
          result_summary: summarizeToolResult(name, rawResult),
          status: rawResult?.error ? "error" : "completed",
        };
        toolCallLog.push(logEntry);
        if (onToolCall) onToolCall(logEntry);
      } catch (err) {
        const structuredError = toStructuredError(err, `${name} 执行失败。`);
        results.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(structuredError),
        });
        const logEntry = {
          id: tc.id,
          tool: name,
          args: parsedArgs,
          result_summary: summarizeToolResult(name, structuredError),
          status: "error",
        };
        toolCallLog.push(logEntry);
        if (onToolCall) onToolCall(logEntry);
      }
      continue;
    }

    pendingActions.push({
      id: tc.id,
      name,
      args: parsedArgs,
      risk_level: riskLevel,
      confirm_message: buildConfirmMessage(name, parsedArgs),
    });
    pendingToolCalls.push({
      ...tc,
      __confirm_round: nextConfirmRound,
      __mode: mode,
    });
  }

  const assistantMessageForHistory = autoToolCalls.length > 0
    ? {
      role: "assistant",
      content: assistantMsg?.content ?? null,
      tool_calls: autoToolCalls,
    }
    : (assistantMsg?.content
      ? { role: "assistant", content: assistantMsg.content }
      : null);

  return {
    assistantMessageForHistory,
    results,
    pendingActions,
    pendingToolCalls,
    toolCallLog,
    draftId,
  };
}

/**
 * Execute a single tool call.
 */
export async function executeTool(name, args, ctx) {
  const { supabase, userId, surfaceContext } = ctx;
  args = applyContextDefaults(name, args, surfaceContext);

  switch (name) {
    case "semantic_search": {
      try {
        const data = await searchSemantic(supabase, userId, args.query, {
          limit: args.limit,
          min_score: args.min_score,
          topic_id: args.topic_id,
          material_id: args.material_id,
        });
        const total = data.total || 0;
        return {
          results: data.results || [],
          total,
          query: args.query,
          ...(total === 0 ? { hint: "没有找到匹配内容。可尝试换关键词，或改用 search_cards。" } : {}),
        };
      } catch (error) {
        return {
          error: "semantic_search_failed",
          message: "语义搜索失败。",
          hint: error.message,
          suggestion: "尝试更短关键词，或改用 search_cards 查询卡片摘要。",
        };
      }
    }

    case "search_cards": {
      const cards = await searchCards(supabase, userId, args.query, {
        topic_id: args.topic_id,
      });
      return { cards, count: cards.length };
    }

    case "list_cards": {
      const limit = Math.min(args.limit || 20, 50);
      const cards = await listCards(supabase, userId, {
        topic_id: args.topic_id,
      });
      return { cards: cards.slice(0, limit), total: cards.length };
    }

    case "get_card": {
      const card = await findCardById(supabase, args.card_id, userId);
      if (!card) {
        return {
          error: "card_not_found",
          message: `未找到卡片: ${args.card_id}`,
          suggestion: "先调用 search_cards 或 list_cards 获取可用卡片。",
        };
      }
      return { card };
    }

    case "create_card": {
      const cardValidationError = validateCardData(args);
      if (cardValidationError) return cardValidationError;

      const snippetCheck = await verifyRawSnippetAgainstKnowledge(supabase, userId, args.raw_snippet);
      if (snippetCheck?.error) return snippetCheck;

      const cardData = {
        topic_title: args.topic_title,
        title: args.title || "",
        fact_or_view: args.fact_or_view || "fact",
        summary: args.summary || "",
        key_points: Array.isArray(args.key_points) ? args.key_points : [],
        raw_snippet: args.raw_snippet || "",
        note: args.note || "",
        source_name: args.source_name || null,
        source_url: args.source_url || null,
      };

      const card = await addCard(supabase, userId, cardData);
      const result = { card, message: `已创建卡片，ID: ${card.id}` };
      if (snippetCheck?.warning) result.snippet_warning = snippetCheck.warning;
      return result;
    }

    case "list_topics": {
      const topics = await listTopicsWithCardCount(supabase, userId);
      return { topics };
    }

    case "list_materials": {
      const limit = Math.min(args.limit || 20, 50);
      let query = supabase
        .from("materials")
        .select("id, title, source_type, url, ingestion_status, word_count, chunk_count, topic_id, created_at", { count: "exact" })
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (args.topic_id) query = query.eq("topic_id", args.topic_id);
      if (args.status) query = query.eq("ingestion_status", args.status);

      const { data, error, count } = await query;
      if (error) return { error: "materials_query_failed", message: error.message };
      return { materials: data || [], total: count || 0 };
    }

    case "get_material": {
      const { data, error } = await supabase
        .from("materials")
        .select("id, title, source_type, url, ingestion_status, word_count, chunk_count, topic_id, excerpt, created_at")
        .eq("id", args.material_id)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) return { error: "material_query_failed", message: error.message };
      if (!data) {
        return {
          error: "material_not_found",
          message: `未找到材料: ${args.material_id}`,
          suggestion: "调用 list_materials 查看可用材料。",
        };
      }
      if (data.excerpt && data.excerpt.length > 500) data.excerpt = `${data.excerpt.slice(0, 500)}...`;
      return { material: data };
    }

    case "list_sources": {
      const sources = await listSources(supabase, userId, {
        category: args.category,
        status: args.status,
      });
      return { sources };
    }

    case "list_boards": {
      const boards = await listBoards(supabase, userId);
      return { boards };
    }

    case "get_board": {
      const board = await getFullBoard(supabase, args.board_id, userId);
      if (!board) {
        return {
          error: "board_not_found",
          message: `未找到画板: ${args.board_id}`,
          suggestion: "调用 list_boards 查看可用画板。",
        };
      }
      return { board };
    }

    case "list_documents": {
      const docs = await listDocuments(supabase, userId, {
        topic_id: args.topic_id,
      });
      return { documents: docs };
    }

    case "get_document": {
      const doc = await getDocument(supabase, args.doc_id, userId);
      if (!doc) {
        return {
          error: "document_not_found",
          message: `未找到文档: ${args.doc_id}`,
          suggestion: "调用 list_documents 查看可用文档。",
        };
      }
      return { document: doc };
    }

    case "fetch_rss": {
      const feeds = args.feeds || [];
      const maxItems = args.max_items || 20;
      try {
        let items = await fetchRssItems(feeds, { maxItems });
        if (Array.isArray(args.keywords) && args.keywords.length > 0) {
          const kws = args.keywords.map((k) => String(k).toLowerCase());
          items = items.filter((item) => {
            const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();
            return kws.some((kw) => text.includes(kw));
          });
        }
        return { items, count: items.length };
      } catch (error) {
        return {
          error: "fetch_rss_failed",
          message: "抓取 RSS 失败。",
          hint: error.message,
          suggestion: "检查 feed URL 是否有效。",
        };
      }
    }

    case "ingest_url": {
      try {
        return await ingestUrl(supabase, userId, {
          url: args.url,
          title: args.title,
          topic_id: args.topic_id,
        });
      } catch (error) {
        return {
          error: "ingest_failed",
          message: "URL 摄入失败。",
          hint: error.message,
          suggestion: "检查 URL 可访问性，或稍后重试。",
        };
      }
    }

    case "create_board_node": {
      const parentType = await getParentNodeType(supabase, args.parent_id);
      if (
        args.parent_id &&
        (args.node_type === "hypothesis" || args.node_type === "evidence") &&
        !parentType
      ) {
        return withHierarchyOptions(supabase, args.board_id, args.node_type, {
          error: "hierarchy_violation",
          message: `parent_id ${args.parent_id} 不存在或不可访问。`,
          current_state: { node_type: args.node_type, parent_id: args.parent_id },
          suggestion: "请从当前画板可用父节点中重新选择 parent_id。",
        });
      }
      const hierarchyError = validateNodeHierarchy(args.node_type, args.parent_id, parentType);
      if (hierarchyError) {
        return withHierarchyOptions(supabase, args.board_id, args.node_type, hierarchyError);
      }

      const nodeData = {
        node_type: args.node_type,
        parent_id: args.parent_id || null,
        card_id: args.card_id || null,
      };
      if (args.node_type === "hypothesis") {
        nodeData.claim = args.text;
        nodeData.hypo_state = "pending";
        nodeData.confidence = 0;
      } else {
        nodeData.content = { text: args.text };
      }
      if (args.node_type === "question") {
        nodeData.priority = "normal";
        nodeData.status = "open";
      }
      if (args.node_type === "evidence") {
        nodeData.evidence_type = "fact";
        nodeData.strength = 3;
      }
      const node = await createNode(supabase, args.board_id, nodeData);
      return { node, message: `已创建 ${args.node_type} 节点` };
    }

    case "update_board_node": {
      const updates = {};
      if (args.text !== undefined) {
        updates.content = { text: args.text };
        updates.claim = args.text;
      }
      if (args.status) updates.status = args.status;
      if (args.hypo_state) updates.hypo_state = args.hypo_state;
      if (args.confidence !== undefined) updates.confidence = args.confidence;
      if (args.priority) updates.priority = args.priority;
      const node = await updateNode(supabase, args.node_id, updates);
      return { node, message: "节点已更新" };
    }

    case "delete_board_node": {
      await deleteNode(supabase, args.node_id);
      return { success: true, message: "节点已删除" };
    }

    case "create_board_edge": {
      const relationError = validateEdgeRelation(args.relation_type);
      if (relationError) return relationError;
      const edge = await createEdge(supabase, args.board_id, {
        source_node_id: args.source_node_id,
        target_node_id: args.target_node_id,
        relation_type: args.relation_type,
      });
      return { edge, message: `已创建 ${args.relation_type} 关系` };
    }

    case "delete_board_edge": {
      await deleteEdge(supabase, args.edge_id);
      return { success: true, message: "关系已删除" };
    }

    case "propose_board_changes": {
      const changes = args.changes || [];
      for (const change of changes) {
        if (change.action === "create_node") {
          let parentType = null;
          const parentId = change.parent_id;
          if (parentId && !String(parentId).startsWith("$")) {
            parentType = await getParentNodeType(supabase, parentId);
            if (
              (change.node_type === "hypothesis" || change.node_type === "evidence") &&
              !parentType
            ) {
              return withHierarchyOptions(supabase, args.board_id, change.node_type, {
                error: "hierarchy_violation",
                message: `parent_id ${parentId} 不存在或不可访问。`,
                current_state: { node_type: change.node_type, parent_id: parentId },
                suggestion: "请改用可用父节点（question/hypothesis）重新提交。",
              });
            }
          }
          const hierarchyError = validateNodeHierarchy(change.node_type, parentId, parentType);
          if (hierarchyError) {
            return withHierarchyOptions(supabase, args.board_id, change.node_type, hierarchyError);
          }
        }
        if (change.action === "create_edge") {
          const relationError = validateEdgeRelation(change.relation_type);
          if (relationError) return relationError;
        }
      }

      try {
        const draft = await createDraft(
          supabase,
          userId,
          args.board_id,
          changes,
          args.reasoning || ""
        );
        return {
          draft_id: draft.id,
          board_id: draft.board_id,
          changes_count: changes.length,
          reasoning: args.reasoning,
          message: `已草拟 ${changes.length} 个更改，请在画板预览后确认。`,
        };
      } catch (err) {
        return {
          error: "draft_creation_failed",
          message: "草稿创建失败。",
          hint: err.message,
          suggestion: "检查 board_id 和 changes 字段格式。",
        };
      }
    }

    case "get_board_health": {
      if (!args.topic_id) {
        return {
          error: "no_topic",
          message: "需要在某个研究主题下才能查看论证健康状态。",
          suggestion: "调用 list_topics 查看可用主题，或确认当前是否在某个主题内。",
        };
      }
      try {
        const state = await getResearchState(supabase, args.topic_id);
        return state;
      } catch (err) {
        return {
          error: "board_health_failed",
          message: "获取论证健康状态失败。",
          hint: err.message,
        };
      }
    }

    case "get_methodology": {
      try {
        const methodology = await loadUserMethodology(supabase, userId);
        if (!methodology) {
          return {
            methodology: null,
            message: "当前用户未设置方法论。",
            hint: "可在设置页配置方法论模板。",
          };
        }
        return {
          methodology: {
            id: methodology.id,
            name: methodology.name,
            base_template: methodology.base_template,
            document: methodology.document || "",
            config: methodology.config || {},
          },
        };
      } catch (err) {
        return {
          error: "methodology_load_failed",
          message: "加载方法论失败。",
          hint: err.message,
        };
      }
    }

    default:
      return {
        error: "unknown_tool",
        message: `工具不存在: ${name}`,
        suggestion: "请改用已定义工具。",
      };
  }
}

export function compressToolResult(toolName, result) {
  if (!result || result.error) return result;

  switch (toolName) {
    case "list_cards":
    case "search_cards":
      return {
        cards: result.cards?.map((c) => ({
          id: c.id,
          title: c.title,
          summary: c.summary?.slice(0, 100),
          fact_or_view: c.fact_or_view,
          topic_id: c.topic_id,
        })),
        total: result.total || result.count,
      };

    case "get_board":
      return {
        board: {
          id: result.board?.id,
          title: result.board?.title,
          nodes: result.board?.nodes?.map((n) => ({
            id: n.id,
            node_type: n.node_type,
            text: n.claim || n.content?.text,
            parent_id: n.parent_id,
            status: n.status,
          })),
          edges: result.board?.edges?.map((e) => ({
            source: e.source_node_id,
            target: e.target_node_id,
            relation: e.relation_type,
          })),
        },
      };

    case "semantic_search":
      return {
        results: result.results?.map((r) => ({
          text: (r.content || r.chunk_text || "").slice(0, 200),
          score: r.similarity ?? r.score,
          source: r.material?.title || r.source_title || r.material_id,
          material_id: r.material_id,
        })),
        total: result.total,
      };

    case "list_topics":
      return {
        topics: result.topics?.map((t) => ({
          id: t.id,
          title: t.title,
          card_count: t.card_count,
        })),
      };

    case "list_materials":
      return {
        materials: result.materials?.map((m) => ({
          id: m.id,
          title: m.title,
          source_type: m.source_type,
          status: m.ingestion_status,
          word_count: m.word_count,
          chunk_count: m.chunk_count,
          topic_id: m.topic_id,
        })),
        total: result.total,
      };

    case "get_material":
      if (!result.material) return result;
      return {
        material: {
          id: result.material.id,
          title: result.material.title,
          source_type: result.material.source_type,
          url: result.material.url,
          status: result.material.ingestion_status,
          word_count: result.material.word_count,
          chunk_count: result.material.chunk_count,
          topic_id: result.material.topic_id,
          excerpt: result.material.excerpt?.slice(0, 500) || null,
        },
      };

    default: {
      if (typeof result !== "object" || result === null) return result;
      const compressed = {};
      for (const [key, value] of Object.entries(result)) {
        if (Array.isArray(value) && value.length > 10) {
          compressed[key] = value.slice(0, 10).map((item) => {
            if (typeof item === "object" && item !== null) {
              return {
                id: item.id,
                title: item.title,
                text: String(item.text || item.summary || "").slice(0, 100),
              };
            }
            return typeof item === "string" ? item.slice(0, 100) : item;
          });
          compressed[`${key}_total`] = value.length;
        } else if (typeof value === "string" && value.length > 500) {
          compressed[key] = `${value.slice(0, 500)}...`;
        } else {
          compressed[key] = value;
        }
      }
      return compressed;
    }
  }
}

async function verifyRawSnippetAgainstKnowledge(supabase, userId, rawSnippet) {
  const snippet = String(rawSnippet || "").trim();
  const probe = snippet.slice(0, 80);

  // 1) Search chunks first
  const { data: chunkMatches, error: chunkErr } = await supabase
    .from("chunks")
    .select("id, material_id")
    .ilike("content", `%${probe}%`)
    .limit(8);

  if (chunkErr) {
    return {
      error: "snippet_verification_failed",
      message: "raw_snippet 验证失败（chunks 查询错误）。",
      hint: chunkErr.message,
      suggestion: "稍后重试，或先调用 semantic_search 获取可复制的原文片段。",
    };
  }

  const chunkMaterialIds = [...new Set((chunkMatches || []).map((c) => c.material_id).filter(Boolean))];
  if (chunkMaterialIds.length > 0) {
    const { data: ownedMaterials } = await supabase
      .from("materials")
      .select("id")
      .eq("user_id", userId)
      .in("id", chunkMaterialIds)
      .limit(1);
    if ((ownedMaterials || []).length > 0) {
      return { ok: true };
    }
  }

  // 2) Fallback to materials.excerpt
  const { data: excerptMatches, error: excerptErr } = await supabase
    .from("materials")
    .select("id")
    .eq("user_id", userId)
    .ilike("excerpt", `%${probe}%`)
    .limit(1);

  if (excerptErr) {
    return {
      error: "snippet_verification_failed",
      message: "raw_snippet 验证失败（materials.excerpt 查询错误）。",
      hint: excerptErr.message,
      suggestion: "稍后重试，或先调用 semantic_search 获取可复制的原文片段。",
    };
  }

  if ((excerptMatches || []).length > 0) {
    return { ok: true };
  }

  // 3) Recent ingestion race window: soft warning
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: processingMaterials } = await supabase
    .from("materials")
    .select("id, title, ingestion_status, created_at")
    .eq("user_id", userId)
    .in("ingestion_status", ["pending", "processing", "retrying"])
    .gte("created_at", since)
    .limit(3);

  if ((processingMaterials || []).length > 0) {
    return {
      ok: true,
      warning: "raw_snippet 未在已完成分块中找到匹配，可能是材料仍在处理中。卡片已创建，建议稍后复核。",
      current_state: {
        processing_materials: processingMaterials.map((m) => ({
          id: m.id,
          title: m.title,
          status: m.ingestion_status,
          created_at: m.created_at,
        })),
      },
    };
  }

  return {
    error: "raw_snippet_not_found",
    message: "raw_snippet 未在知识库原文中找到匹配。",
    current_state: {
      snippet_preview: probe,
      snippet_length: snippet.length,
    },
    suggestion: "请先调用 semantic_search 搜索并复制原文 text 字段作为 raw_snippet。",
    hint: "不要使用改写后的句子作为 raw_snippet。",
  };
}
