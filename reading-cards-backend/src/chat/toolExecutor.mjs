// ========= Tool Executor =========
// Dispatches AI tool calls to service-layer functions.
// Includes methodology guards for board mutations.
// Returns plain objects; the caller serialises to JSON for the LLM.

import { searchCards, listCards, findCardById, addCard } from "../services/supabase/cards.mjs";
import { listTopicsWithCardCount } from "../services/supabase/topics.mjs";
import {
  listBoards, getFullBoard,
  createNode, updateNode, deleteNode,
  createEdge, deleteEdge,
} from "../services/supabase/boards.mjs";
import { listDocuments, getDocument } from "../services/supabase/documents.mjs";
import { listSources } from "../services/supabase/sources.mjs";
import { searchSemantic } from "../services/searchService.mjs";
import { fetchRssItems } from "../tasks/fetchers/rss.mjs";
import { ingestUrl } from "../services/ingestion.mjs";
import { createDraft } from "../agents/draftEngine.mjs";
import { getResearchState } from "../agents/researchContext.mjs";

// ── Context auto-injection ─────────────────────────────
// Maps surfaceContext fields to tool parameter names.
// Any ID the frontend sends in surfaceContext is automatically injected
// into matching tool parameters — AI never needs to extract UUIDs from prompt text.
const CONTEXT_DEFAULTS = {
  topicId:    { param: 'topic_id',    tools: ['semantic_search', 'search_cards', 'list_cards', 'list_documents', 'list_materials', 'get_board_health', 'ingest_url'] },
  boardId:    { param: 'board_id',    tools: ['get_board', 'propose_board_changes', 'create_board_node', 'create_board_edge'] },
  materialId: { param: 'material_id', tools: ['semantic_search', 'get_material'] },
};

const ID_PLACEHOLDERS = new Set([
  'current', 'cur', 'this', 'active', 'latest',
  '__current__', '__active__',
  'null', 'undefined',
]);

function looksLikeUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function shouldOverrideContextParam(param, providedValue, contextValue) {
  if (!contextValue) return false;
  if (providedValue === undefined || providedValue === null || providedValue === '') return true;

  if (typeof providedValue === 'string') {
    const normalized = providedValue.trim().toLowerCase();
    if (!normalized) return true;
    if (ID_PLACEHOLDERS.has(normalized)) return true;
    if (param.endsWith('_id') && !looksLikeUuid(normalized)) return true;
  }

  return false;
}

function applyContextDefaults(name, args, surfaceContext) {
  if (!surfaceContext) return args;
  let patched = args || {};
  for (const [ctxKey, { param, tools }] of Object.entries(CONTEXT_DEFAULTS)) {
    if (!tools.includes(name)) continue;
    if (shouldOverrideContextParam(param, patched[param], surfaceContext[ctxKey])) {
      patched = { ...patched, [param]: surfaceContext[ctxKey] };
    }
  }
  return patched;
}

/**
 * Execute a single tool call.
 * @param {string} name   - tool name (must match tools.mjs)
 * @param {Object} args   - parsed arguments from the LLM
 * @param {Object} ctx    - { supabase, userId, accessToken, surfaceContext }
 * @returns {Promise<Object>} result payload
 */
export async function executeTool(name, args, ctx) {
  const { supabase, userId, accessToken, surfaceContext } = ctx;

  // Auto-inject IDs from surfaceContext into tool args
  args = applyContextDefaults(name, args, surfaceContext);

  switch (name) {
    // ── Semantic Search ──
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
          ...(total === 0 ? { hint: "没有找到匹配的文档内容。尝试用不同关键词搜索，或用 search_cards 搜索卡片摘要。" } : {}),
        };
      } catch (error) {
        console.error('Semantic search error:', error);
        return { error: error.message, results: [], hint: "语义搜索失败。尝试用 search_cards 按关键词搜索卡片摘要。" };
      }
    }

    // ── Cards (read) ──
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
      if (!card) return { error: "card_not_found", hint: "调用 search_cards 按关键词搜索卡片，或 list_cards 查看所有卡片。" };
      return { card };
    }

    // ── Cards (write) ──
    case "create_card": {
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

      // Best-effort raw_snippet traceability check (Spec §12)
      let snippetWarning = null;
      if (args.raw_snippet && args.source_url) {
        try {
          snippetWarning = await verifyRawSnippet(supabase, userId, args.source_url, args.raw_snippet);
        } catch {
          // Non-blocking — don't fail card creation over verification errors
        }
      }

      const result = { card, message: `已创建卡片，ID: ${card.id}` };
      if (snippetWarning) result.snippet_warning = snippetWarning;
      return result;
    }

    // ── Topics (read) ──
    case "list_topics": {
      const topics = await listTopicsWithCardCount(supabase, userId);
      return { topics };
    }

    // ── Materials (read) ──
    case "list_materials": {
      const limit = Math.min(args.limit || 20, 50);
      let query = supabase
        .from('materials')
        .select('id, title, source_type, url, ingestion_status, word_count, chunk_count, topic_id, created_at', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (args.topic_id) query = query.eq('topic_id', args.topic_id);
      if (args.status) query = query.eq('ingestion_status', args.status);

      const { data, error, count } = await query;
      if (error) return { error: error.message, materials: [] };
      return { materials: data || [], total: count || 0 };
    }

    case "get_material": {
      const { data, error } = await supabase
        .from('materials')
        .select('id, title, source_type, url, ingestion_status, word_count, chunk_count, topic_id, excerpt, created_at')
        .eq('id', args.material_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) return { error: error.message };
      if (!data) return { error: "material_not_found", hint: "调用 list_materials 查看可用材料。" };
      // Truncate excerpt to 500 chars to avoid context bloat
      if (data.excerpt && data.excerpt.length > 500) {
        data.excerpt = data.excerpt.slice(0, 500) + '...';
      }
      return { material: data };
    }

    // ── Sources (read) ──
    case "list_sources": {
      const sources = await listSources(supabase, userId, {
        category: args.category,
        status: args.status,
      });
      return { sources };
    }

    // ── Boards (read) ──
    case "list_boards": {
      const boards = await listBoards(supabase, userId);
      return { boards };
    }

    case "get_board": {
      const board = await getFullBoard(supabase, args.board_id, userId);
      if (!board) return { error: "board_not_found", hint: "调用 list_boards 查看当前用户的所有画板，确认 board_id 是否正确。" };
      return { board };
    }

    // ── Documents (read) ──
    case "list_documents": {
      const docs = await listDocuments(supabase, userId, {
        topic_id: args.topic_id,
      });
      return { documents: docs };
    }

    case "get_document": {
      const doc = await getDocument(supabase, args.doc_id, userId);
      if (!doc) return { error: "document_not_found", hint: "调用 list_documents 查看当前主题下的文档。" };
      return { document: doc };
    }

    // ── RSS + Ingestion (task-oriented) ──
    case "fetch_rss": {
      const feeds = args.feeds || [];
      const maxItems = args.max_items || 20;
      try {
        let items = await fetchRssItems(feeds, { maxItems });
        // Optional keyword filter
        if (Array.isArray(args.keywords) && args.keywords.length > 0) {
          const kws = args.keywords.map((k) => k.toLowerCase());
          items = items.filter((item) => {
            const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase();
            return kws.some((kw) => text.includes(kw));
          });
        }
        return { items, count: items.length };
      } catch (error) {
        return { error: error.message, items: [], hint: "检查 RSS URL 是否正确。确保 URL 指向有效的 RSS/Atom feed。" };
      }
    }

    case "ingest_url": {
      try {
        const result = await ingestUrl(supabase, userId, {
          url: args.url,
          title: args.title,
          topic_id: args.topic_id,
        });
        return result;
      } catch (error) {
        return { error: error.message, hint: "检查 URL 是否可访问。如果是付费内容，可能无法摄入。" };
      }
    }

    // ── Board mutations (write) — with methodology guards ──
    case "create_board_node": {
      // Methodology guard: enforce Q→H→E hierarchy (ARCHITECTURE §5.3)
      if (args.node_type === "evidence" && !args.parent_id) {
        return {
          error: "methodology_violation",
          message: "Evidence nodes must have parent_id pointing to a hypothesis node.",
          suggestion: "Call get_board first to find the relevant hypothesis, then create evidence with parent_id set.",
        };
      }
      if (args.node_type === "hypothesis" && !args.parent_id) {
        return {
          error: "methodology_violation",
          message: "Hypothesis nodes must have parent_id pointing to a question node.",
          suggestion: "Call get_board first to find the relevant question, then create hypothesis with parent_id set.",
        };
      }

      // Validate parent node_type matches hierarchy (ARCHITECTURE §5.3)
      if (args.parent_id && (args.node_type === "evidence" || args.node_type === "hypothesis")) {
        const expectedParentType = args.node_type === "evidence" ? "hypothesis" : "question";
        try {
          const { data: parentNode } = await supabase
            .from("board_nodes")
            .select("node_type")
            .eq("id", args.parent_id)
            .single();
          if (parentNode && parentNode.node_type !== expectedParentType) {
            return {
              error: "methodology_violation",
              message: `${args.node_type} parent must be a ${expectedParentType}, but parent ${args.parent_id} is a ${parentNode.node_type}.`,
              suggestion: `Find a ${expectedParentType} node to attach this ${args.node_type} to.`,
            };
          }
        } catch {
          // Non-blocking: if parent lookup fails (e.g., node not found), let the DB handle it
        }
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
      return { node, message: `已创建${args.node_type}节点` };
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
      // Methodology guard: validate relation_type
      if (!['supports', 'refutes', 'neutral'].includes(args.relation_type)) {
        return {
          error: "methodology_violation",
          message: `relation_type must be supports, refutes, or neutral. Got "${args.relation_type}".`,
        };
      }
      const edge = await createEdge(supabase, args.board_id, {
        source_node_id: args.source_node_id,
        target_node_id: args.target_node_id,
        relation_type: args.relation_type,
      });
      return { edge, message: `已创建${args.relation_type}关系` };
    }

    case "delete_board_edge": {
      await deleteEdge(supabase, args.edge_id);
      return { success: true, message: "关系已删除" };
    }

    // ── Draft tool (creates preview, not real data) ──
    case "propose_board_changes": {
      // Methodology guard: validate Q→H→E hierarchy in proposed changes (ARCHITECTURE §5.3)
      const changes = args.changes || [];
      for (const change of changes) {
        if (change.action !== 'create_node') continue;
        if ((change.node_type === 'evidence' || change.node_type === 'hypothesis') && !change.parent_id) {
          return {
            error: "methodology_violation",
            message: `${change.node_type} nodes must have parent_id. Evidence → hypothesis, hypothesis → question.`,
            suggestion: "Call get_board first to find the parent node, then include parent_id (real UUID or $temp_id reference) in each hypothesis/evidence change.",
          };
        }
        // Validate parent node_type when parent_id is a real UUID (not a $temp_id reference)
        if (change.parent_id && !String(change.parent_id).startsWith('$')
            && (change.node_type === 'evidence' || change.node_type === 'hypothesis')) {
          const expectedParent = change.node_type === 'evidence' ? 'hypothesis' : 'question';
          try {
            const { data: parentNode } = await supabase
              .from("board_nodes").select("node_type").eq("id", change.parent_id).single();
            if (parentNode && parentNode.node_type !== expectedParent) {
              return {
                error: "methodology_violation",
                message: `${change.node_type} parent must be a ${expectedParent}, but parent ${change.parent_id} is a ${parentNode.node_type}.`,
                suggestion: `Find a ${expectedParent} node to use as parent.`,
              };
            }
          } catch {
            // Non-blocking: parent lookup may fail for temp IDs or missing nodes
          }
        }
      }
      try {
        const draft = await createDraft(
          supabase, userId, args.board_id,
          changes, args.reasoning || ""
        );
        return {
          draft_id: draft.id,
          board_id: draft.board_id,
          changes_count: (args.changes || []).length,
          reasoning: args.reasoning,
          message: `已草拟 ${(args.changes || []).length} 个更改，请在画板上查看并确认。`,
        };
      } catch (err) {
        return { error: err.message, hint: "检查 board_id 是否正确，以及 changes 数组格式是否符合要求（每项需要 action 字段）。" };
      }
    }

    // ── Health tool (read-only computation) ──
    case "get_board_health": {
      try {
        const state = await getResearchState(supabase, args.topic_id);
        return state;
      } catch (err) {
        return { error: err.message };
      }
    }

    // ── Meta tool (plan request) ──
    case "request_plan": {
      return { plan_requested: true, intent: args.intent };
    }

    default:
      return { error: `unknown_tool: ${name}`, hint: "此工具不存在。检查工具名称拼写是否正确。" };
  }
}

// ── Helpers ──────────────────────────────────────────

/**
 * Best-effort verification that raw_snippet is an exact substring of source material.
 * Returns a warning string if verification fails, null if verified or skipped.
 */
async function verifyRawSnippet(supabase, userId, sourceUrl, rawSnippet) {
  if (!rawSnippet || rawSnippet.length < 10) return null; // Too short to verify meaningfully

  // Find material by URL
  const { data: material } = await supabase
    .from('materials')
    .select('id')
    .eq('user_id', userId)
    .eq('url', sourceUrl)
    .maybeSingle();

  if (!material) return null; // Material not found — can't verify, skip

  // Check if snippet exists in any chunk
  const { data: matchingChunks } = await supabase
    .from('chunks')
    .select('id')
    .eq('material_id', material.id)
    .ilike('content', `%${rawSnippet.slice(0, 100)}%`) // Use first 100 chars to avoid query limits
    .limit(1);

  if (!matchingChunks || matchingChunks.length === 0) {
    return "raw_snippet 未在源材料中找到精确匹配。请确认引用的是原文而非改写。";
  }

  return null; // Verified
}
