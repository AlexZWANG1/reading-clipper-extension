// ========= Tool Executor =========
// Dispatches AI tool calls to service-layer functions.
// Returns plain objects; the caller serialises to JSON for the LLM.

import { searchCards, listCards, findCardById, addCard } from "../services/supabase/cards.mjs";
import { listTopicsWithCardCount } from "../services/supabase/topics.mjs";
import {
  listBoards, getFullBoard,
  createNode, updateNode, deleteNode,
  createEdge,
} from "../services/supabase/boards.mjs";
import { listDocuments, getDocument } from "../services/supabase/documents.mjs";
import { listSources } from "../services/sources.mjs";

/**
 * Execute a single tool call.
 * @param {string} name   - tool name (must match tools.mjs)
 * @param {Object} args   - parsed arguments from the LLM
 * @param {Object} ctx    - { supabase, userId }
 * @returns {Promise<Object>} result payload
 */
export async function executeTool(name, args, ctx) {
  const { supabase, userId } = ctx;

  switch (name) {
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
      const card = await findCardById(supabase, args.card_id);
      if (!card) return { error: "card_not_found" };
      return { card };
    }

    // ── Cards (write) ──
    case "create_card": {
      const cardData = {
        topic_title: args.topic_title,
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
      const sources = listSources({
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
      const board = await getFullBoard(supabase, args.board_id);
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
      const doc = await getDocument(supabase, args.doc_id);
      if (!doc) return { error: "document_not_found" };
      return { document: doc };
    }

    // ── Board mutations (write) ──
    case "create_board_node": {
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
      const edge = await createEdge(supabase, args.board_id, {
        source_node_id: args.source_node_id,
        target_node_id: args.target_node_id,
        relation_type: args.relation_type,
      });
      return { edge, message: `已创建${args.relation_type}关系` };
    }

    default:
      return { error: `unknown_tool: ${name}` };
  }
}
