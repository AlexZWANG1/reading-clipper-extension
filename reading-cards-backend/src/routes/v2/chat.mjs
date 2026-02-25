// ========= Chat Route =========
// POST /api/v2/chat          — AI chat with tool-calling support
// POST /api/v2/chat/confirm  — Confirm pending write/destructive actions

import { Router } from "express";
import { requireAuth } from "../../middleware/auth.mjs";
import { chat, chatConfirm } from "../../chat/orchestrator.mjs";

const chatRouter = Router();
chatRouter.use(requireAuth);

/**
 * POST /api/v2/chat
 * Body: { messages: [{role, content}, ...] }
 * Returns: { ok, reply, messages, pendingActions?, pendingToolCalls? }
 */
chatRouter.post("/", async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "messages is required and must be a non-empty array",
      });
    }

    const sanitized = messages.filter((m) =>
      ["user", "assistant", "system"].includes(m.role)
    );

    const result = await chat({
      messages: sanitized,
      userId: req.user.id,
      supabase: req.supabase,
    });

    res.json({
      ok: true,
      reply: result.reply,
      messages: result.messages,
      pendingActions: result.pendingActions || null,
      pendingToolCalls: result.pendingToolCalls || null,
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "Chat request failed",
    });
  }
});

/**
 * POST /api/v2/chat/confirm
 * Body: { messages, pendingToolCalls, confirmedIds }
 *   messages         — the message array returned by /chat (without the tool_calls assistant msg)
 *   pendingToolCalls — the raw tool_calls array returned by /chat
 *   confirmedIds     — array of tool_call IDs the user approved
 */
chatRouter.post("/confirm", async (req, res) => {
  try {
    const { messages, pendingToolCalls, confirmedIds } = req.body;

    if (!Array.isArray(messages) || !Array.isArray(pendingToolCalls) || !Array.isArray(confirmedIds)) {
      return res.status(400).json({
        ok: false,
        error: "messages, pendingToolCalls, and confirmedIds are required arrays",
      });
    }

    const result = await chatConfirm({
      messages,
      pendingToolCalls,
      confirmedIds,
      userId: req.user.id,
      supabase: req.supabase,
    });

    res.json({
      ok: true,
      reply: result.reply,
      messages: result.messages,
      pendingActions: result.pendingActions || null,
      pendingToolCalls: result.pendingToolCalls || null,
    });
  } catch (error) {
    console.error("Chat confirm error:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "Confirm request failed",
    });
  }
});

export default chatRouter;
