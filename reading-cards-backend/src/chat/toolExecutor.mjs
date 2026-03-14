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

/**
 * Execute a single tool call.
 * @param {string} name   - tool name (must match tools.mjs)
 * @param {Object} args   - parsed arguments from the LLM
 * @param {Object} ctx    - { supabase, userId, accessToken }
 * @returns {Promise<Object>} result payload
 */
export async function executeTool(name, args, ctx) {
  const { supabase, userId, accessToken } = ctx;

  switch (name) {
    // ── Semantic Search ──
    case "semantic_search": {
      try {
        const data = await searchSemantic(supabase, userId, args.query, {
          limit: args.limit,
          min_score: args.min_score,
          topic_id: args.topic_id,
        });
        return {
          results: data.results || [],
          total: data.total || 0,
          query: args.query,
        };
      } catch (error) {
        console.error('Semantic search error:', error);
        return { error: error.message, results: [] };
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
      if (!card) return { error: "card_not_found" };
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
      return { card, message: `已创建卡片，ID: ${card.id}` };
    }

    // ── Topics (read) ──
    case "list_topics": {
      const topics = await listTopicsWithCardCount(supabase, userId);
      return { topics };
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
      if (!board) return { error: "board_not_found" };
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
      if (!doc) return { error: "document_not_found" };
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
        return { error: error.message, items: [] };
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
        return { error: error.message };
      }
    }

    // ── Board mutations (write) — with methodology guards ──
    case "create_board_node": {
      // Methodology guard: enforce Q→H→E hierarchy
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
      try {
        const draft = await createDraft(
          supabase, userId, args.board_id,
          args.changes || [], args.reasoning || ""
        );
        return {
          draft_id: draft.id,
          board_id: draft.board_id,
          changes_count: (args.changes || []).length,
          reasoning: args.reasoning,
          message: `已草拟 ${(args.changes || []).length} 个更改，请在画板上查看并确认。`,
        };
      } catch (err) {
        return { error: err.message };
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

    default:
      return { error: `unknown_tool: ${name}` };
  }
}
