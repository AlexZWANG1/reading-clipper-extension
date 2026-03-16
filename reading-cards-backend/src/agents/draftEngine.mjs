// ========= Board Draft Engine =========
// Creates, previews, commits, and rejects board draft proposals.
// Commit stage enforces hierarchy validation and supports partial skip.

import { createNode, createEdge } from "../services/supabase/boards.mjs";
import { validateNodeHierarchy } from "../chat/validation.mjs";

/**
 * Create a new board draft with proposed changes.
 */
export async function createDraft(supabase, userId, boardId, changes, reasoning) {
  for (const change of changes || []) {
    if (!change.action) {
      throw new Error("Each change must have an 'action' field");
    }
    if (!["create_node", "create_edge", "update_node"].includes(change.action)) {
      throw new Error(`Unknown action: ${change.action}. Must be create_node, create_edge, or update_node.`);
    }
  }

  await supabase
    .from("board_drafts")
    .update({ status: "expired", resolved_at: new Date().toISOString() })
    .eq("board_id", boardId)
    .eq("user_id", userId)
    .eq("status", "pending");

  const { data, error } = await supabase
    .from("board_drafts")
    .insert({
      board_id: boardId,
      user_id: userId,
      changes: changes || [],
      reasoning: reasoning || null,
      status: "pending",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Commit a draft — resolve $temp_id references and create real nodes/edges.
 * Hierarchy violations are skipped, not fatal.
 */
export async function commitDraft(supabase, draftId, acceptedIndices = null) {
  const { data: draft, error: fetchErr } = await supabase
    .from("board_drafts")
    .select("*")
    .eq("id", draftId)
    .single();

  if (fetchErr) throw fetchErr;
  if (!draft) throw new Error("Draft not found");
  if (draft.status !== "pending" && draft.status !== "partially_accepted") {
    throw new Error(`Draft is ${draft.status}, cannot commit`);
  }

  const allChanges = draft.changes || [];
  const alreadyAccepted = new Set(draft.accepted_changes?.accepted || []);
  const indexedChanges = allChanges
    .map((change, index) => ({ change, index }))
    .filter(({ index }) => {
      if (alreadyAccepted.has(index)) return false;
      if (Array.isArray(acceptedIndices) && acceptedIndices.length > 0) {
        return acceptedIndices.includes(index);
      }
      return true;
    });

  const idMap = {};
  const skippedTempIds = new Set();
  const createdNodes = [];
  const createdEdges = [];
  const skippedChanges = [];

  const markSkipped = (index, change, reason, detail = null) => {
    console.warn(`[draftEngine] skipping change #${index}: ${reason}`);
    const tempKey = change?.temp_id || change?.__temp_id;
    if (tempKey) skippedTempIds.add(tempKey);
    skippedChanges.push({
      index,
      action: change?.action || "unknown",
      reason,
      ...(detail ? { detail } : {}),
    });
  };

  for (const { change, index } of indexedChanges) {
    if (change.action === "create_node") {
      const parentRefKey = parseDraftRefKey(change.parent_id);
      if (parentRefKey && skippedTempIds.has(parentRefKey)) {
        markSkipped(index, change, "parent_reference_skipped", `parent ${change.parent_id} was skipped earlier`);
        continue;
      }

      const parentId = resolveRef(change.parent_id, idMap);
      const cardRefKey = parseDraftRefKey(change.card_id);
      if (cardRefKey && skippedTempIds.has(cardRefKey)) {
        markSkipped(index, change, "card_reference_skipped", `card ref ${change.card_id} was skipped earlier`);
        continue;
      }
      const cardId = resolveRef(change.card_id, idMap);

      if (change.parent_id && !parentId) {
        markSkipped(index, change, "unresolved_parent_reference", `cannot resolve ${change.parent_id}`);
        continue;
      }
      if (change.card_id && !cardId) {
        markSkipped(index, change, "unresolved_card_reference", `cannot resolve ${change.card_id}`);
        continue;
      }

      let parentNodeType = null;
      if (parentId && (change.node_type === "hypothesis" || change.node_type === "evidence")) {
        const { data: parentNode } = await supabase
          .from("board_nodes")
          .select("id, node_type")
          .eq("id", parentId)
          .maybeSingle();
        parentNodeType = parentNode?.node_type || null;
        if (!parentNodeType) {
          markSkipped(index, change, "parent_not_found", `parent ${parentId} not found`);
          continue;
        }
      }

      const hierarchyError = validateNodeHierarchy(change.node_type, parentId, parentNodeType);
      if (hierarchyError) {
        markSkipped(index, change, "hierarchy_violation", hierarchyError.message);
        continue;
      }

      const content = {};
      if (change.node_type === "question" || change.node_type === "evidence") {
        content.text = change.text || "";
      }

      const nodeData = {
        node_type: change.node_type,
        content,
        parent_id: parentId || null,
        card_id: cardId || null,
      };

      if (change.node_type === "hypothesis") {
        nodeData.claim = change.text || "";
      }

      try {
        const node = await createNode(supabase, draft.board_id, nodeData);
        const tempId = change.temp_id || change.__temp_id;
        if (tempId) idMap[tempId] = node.id;
        createdNodes.push(node);
      } catch (err) {
        markSkipped(index, change, "create_node_failed", err.message);
      }
      continue;
    }

    if (change.action === "create_edge") {
      const sourceRefKey = parseDraftRefKey(change.source_node_id);
      const targetRefKey = parseDraftRefKey(change.target_node_id);
      if ((sourceRefKey && skippedTempIds.has(sourceRefKey)) || (targetRefKey && skippedTempIds.has(targetRefKey))) {
        markSkipped(index, change, "edge_reference_skipped", "source or target references a skipped temp node");
        continue;
      }

      const sourceId = resolveRef(change.source_node_id, idMap);
      const targetId = resolveRef(change.target_node_id, idMap);
      if (!sourceId || !targetId) {
        markSkipped(index, change, "unresolved_edge_reference", "source or target cannot be resolved");
        continue;
      }

      try {
        const edge = await createEdge(supabase, draft.board_id, {
          source_node_id: sourceId,
          target_node_id: targetId,
          relation_type: change.relation_type || "neutral",
        });
        createdEdges.push(edge);
      } catch (err) {
        markSkipped(index, change, "create_edge_failed", err.message);
      }
      continue;
    }

    markSkipped(index, change, "unsupported_action", `action=${change.action}`);
  }

  const acceptedSet = new Set([
    ...alreadyAccepted,
    ...indexedChanges.map((item) => item.index),
  ]);
  const acceptedArray = [...acceptedSet].sort((a, b) => a - b);
  const fullyResolved = acceptedArray.length >= allChanges.length;
  const newStatus = fullyResolved ? "accepted" : "partially_accepted";

  await supabase
    .from("board_drafts")
    .update({
      status: newStatus,
      resolved_at: fullyResolved ? new Date().toISOString() : null,
      accepted_changes: { accepted: acceptedArray },
    })
    .eq("id", draftId);

  return {
    committed_count: createdNodes.length + createdEdges.length,
    created_nodes: createdNodes,
    created_edges: createdEdges,
    skipped_count: skippedChanges.length,
    skipped_changes: skippedChanges,
  };
}

/**
 * Reject a draft. Verifies draft exists and is pending or partially accepted.
 */
export async function rejectDraft(supabase, draftId) {
  const { data: draft, error: fetchErr } = await supabase
    .from("board_drafts")
    .select("id, status")
    .eq("id", draftId)
    .single();

  if (fetchErr || !draft) throw new Error("Draft not found");
  if (draft.status !== "pending" && draft.status !== "partially_accepted") {
    throw new Error(`Draft is ${draft.status}, cannot reject`);
  }

  const { error } = await supabase
    .from("board_drafts")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("id", draftId);

  if (error) throw error;
  return { ok: true };
}

/**
 * List pending drafts for a board.
 */
export async function listPendingDrafts(supabase, boardId) {
  const { data, error } = await supabase
    .from("board_drafts")
    .select("*")
    .eq("board_id", boardId)
    .in("status", ["pending", "partially_accepted"])
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

function resolveRef(value, idMap) {
  if (!value) return value;
  if (typeof value === "string") {
    const key = parseDraftRefKey(value);
    if (key) {
      return idMap[key] || null;
    }
  }
  return value;
}

function parseDraftRefKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (raw.startsWith("$")) {
    return raw.slice(1).trim() || null;
  }

  const braceMatch = raw.match(/^\{\{\s*new_node\s*:\s*([^}]+)\s*\}\}$/i);
  if (braceMatch) return braceMatch[1].trim() || null;

  const legacyMatch = raw.match(/^__new_node__(?::(.+))?$/i);
  if (legacyMatch) return (legacyMatch[1] || "").trim() || "__new_node__";

  return null;
}
