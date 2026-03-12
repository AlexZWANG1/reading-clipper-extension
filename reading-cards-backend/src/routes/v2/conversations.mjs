// ========= Conversations Route =========
// CRUD for conversation history management.

import { Router } from "express";
import { requireAuth } from "../../middleware/auth.mjs";
import {
  createConversation,
  listConversations,
  getConversation,
  updateConversation,
  deleteConversation,
  listMessages,
} from "../../services/supabase/conversations.mjs";

const conversationsRouter = Router();
conversationsRouter.use(requireAuth);

/**
 * GET /api/v2/conversations
 * List user's conversations, newest first.
 */
conversationsRouter.get("/", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const conversations = await listConversations(req.supabase, req.user.id, { limit, offset });
    res.json({ ok: true, conversations });
  } catch (error) {
    console.error("List conversations error:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * POST /api/v2/conversations
 * Create a new empty conversation.
 */
conversationsRouter.post("/", async (req, res) => {
  try {
    const { title } = req.body || {};
    const conversation = await createConversation(req.supabase, req.user.id, title || null);
    res.json({ ok: true, conversation });
  } catch (error) {
    console.error("Create conversation error:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * GET /api/v2/conversations/:id
 * Get conversation with all messages.
 */
conversationsRouter.get("/:id", async (req, res) => {
  try {
    const conversation = await getConversation(req.supabase, req.user.id, req.params.id);
    const messages = await listMessages(req.supabase, req.params.id);
    res.json({ ok: true, conversation, messages });
  } catch (error) {
    console.error("Get conversation error:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * PATCH /api/v2/conversations/:id
 * Update conversation (rename).
 */
conversationsRouter.patch("/:id", async (req, res) => {
  try {
    const { title } = req.body;
    const conversation = await updateConversation(req.supabase, req.user.id, req.params.id, { title });
    res.json({ ok: true, conversation });
  } catch (error) {
    console.error("Update conversation error:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * DELETE /api/v2/conversations/:id
 * Delete conversation and all messages.
 */
conversationsRouter.delete("/:id", async (req, res) => {
  try {
    await deleteConversation(req.supabase, req.user.id, req.params.id);
    res.json({ ok: true });
  } catch (error) {
    console.error("Delete conversation error:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default conversationsRouter;
