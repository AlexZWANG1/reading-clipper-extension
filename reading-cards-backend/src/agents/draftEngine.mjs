// ========= Board Draft Engine =========
// Creates, previews, commits, and rejects board draft proposals.
// Handles $temp_id resolution during commit.

import { createNode, createEdge } from "../services/supabase/boards.mjs";

/**
 * Create a new board draft with proposed changes.
 *
 * @param {Object} supabase
 * @param {string} userId
 * @param {string} boardId
 * @param {Array}  changes  - array of change operations
 * @param {string} reasoning - AI's explanation for the proposal
 * @returns {Object} the created draft record
 */
export async function createDraft(supabase, userId, boardId, changes, reasoning) {
  // Validate changes structure
  for (const change of changes) {
    if (!change.action) {
      throw new Error("Each change must have an 'action' field");
    }
    if (!['create_node', 'create_edge', 'update_node'].includes(change.action)) {
      throw new Error(`Unknown action: ${change.action}. Must be create_node, create_edge, or update_node.`);
    }
  }

  // Expire any existing pending drafts for this board
  await supabase
    .from('board_drafts')
    .update({ status: 'expired', resolved_at: new Date().toISOString() })
    .eq('board_id', boardId)
    .eq('user_id', userId)
    .eq('status', 'pending');

  // Create the new draft
  const { data, error } = await supabase
    .from('board_drafts')
    .insert({
      board_id: boardId,
      user_id: userId,
      changes,
      reasoning: reasoning || null,
      status: 'pending',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Commit a draft — resolve $temp_id references and create real nodes/edges.
 *
 * @param {Object} supabase
 * @param {string} draftId
 * @param {number[]|null} acceptedIndices - indices of changes to accept (null = all)
 * @returns {Object} { committed_count, created_nodes, created_edges }
 */
export async function commitDraft(supabase, draftId, acceptedIndices = null) {
  const { data: draft, error: fetchErr } = await supabase
    .from('board_drafts')
    .select('*')
    .eq('id', draftId)
    .single();

  if (fetchErr) throw fetchErr;
  if (!draft) throw new Error('Draft not found');
  if (draft.status !== 'pending') throw new Error(`Draft is ${draft.status}, not pending`);

  const allChanges = draft.changes || [];
  const changes = acceptedIndices
    ? allChanges.filter((_, i) => acceptedIndices.includes(i))
    : allChanges;

  const idMap = {}; // { "t1": "real-uuid", ... }
  const createdNodes = [];
  const createdEdges = [];

  for (const change of changes) {
    if (change.action === 'create_node') {
      const parentId = resolveRef(change.parent_id, idMap);
      const cardId = resolveRef(change.card_id, idMap);

      // Build content based on node type
      const content = {};
      if (change.node_type === 'question') {
        content.text = change.text || '';
      }

      const nodeData = {
        node_type: change.node_type,
        content,
        parent_id: parentId || null,
        card_id: cardId || null,
      };

      // Set type-specific fields
      if (change.node_type === 'hypothesis') {
        nodeData.claim = change.text || '';
      }
      if (change.node_type === 'evidence') {
        content.text = change.text || '';
      }

      const node = await createNode(supabase, draft.board_id, nodeData);
      if (change.temp_id) {
        idMap[change.temp_id] = node.id;
      }
      createdNodes.push(node);

    } else if (change.action === 'create_edge') {
      const sourceId = resolveRef(change.source_node_id, idMap);
      const targetId = resolveRef(change.target_node_id, idMap);

      if (!sourceId || !targetId) {
        console.warn('[draftEngine] Skipping edge with unresolved refs:', change);
        continue;
      }

      const edge = await createEdge(supabase, draft.board_id, {
        source_node_id: sourceId,
        target_node_id: targetId,
        relation_type: change.relation_type || 'neutral',
      });
      createdEdges.push(edge);
    }
  }

  // Update draft status
  const newStatus = acceptedIndices ? 'partially_accepted' : 'accepted';
  await supabase
    .from('board_drafts')
    .update({
      status: newStatus,
      resolved_at: new Date().toISOString(),
      accepted_changes: acceptedIndices ? { accepted: acceptedIndices } : null,
    })
    .eq('id', draftId);

  return {
    committed_count: createdNodes.length + createdEdges.length,
    created_nodes: createdNodes,
    created_edges: createdEdges,
  };
}

/**
 * Reject a draft.
 */
export async function rejectDraft(supabase, draftId) {
  const { error } = await supabase
    .from('board_drafts')
    .update({ status: 'rejected', resolved_at: new Date().toISOString() })
    .eq('id', draftId);

  if (error) throw error;
  return { ok: true };
}

/**
 * List pending drafts for a board.
 */
export async function listPendingDrafts(supabase, boardId) {
  const { data, error } = await supabase
    .from('board_drafts')
    .select('*')
    .eq('board_id', boardId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Resolve a $temp_id reference to a real UUID.
 */
function resolveRef(value, idMap) {
  if (!value) return value;
  if (typeof value === 'string' && value.startsWith('$')) {
    const key = value.slice(1);
    return idMap[key] || value;
  }
  return value;
}
