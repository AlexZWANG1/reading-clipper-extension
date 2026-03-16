// ========= Chat Route =========
// POST /api/v2/chat          — chat with conversation persistence
// POST /api/v2/chat/confirm  — confirm pending write/destructive actions

import { Router } from "express";
import { requireAuth } from "../../middleware/auth.mjs";
import { chat, chatConfirm, chatWithConversation } from "../../chat/orchestrator.mjs";

const chatRouter = Router();
chatRouter.use(requireAuth);

chatRouter.post("/", async (req, res) => {
  try {
    const { conversation_id, user_message, messages, surface_context, mode } = req.body;

    if (user_message !== undefined) {
      const result = await chatWithConversation({
        conversationId: conversation_id || null,
        userMessage: user_message,
        userId: req.user.id,
        supabase: req.supabase,
        accessToken: req.accessToken,
        surfaceContext: surface_context || null,
        mode: mode || "auto",
      });

      return res.json({
        ok: true,
        conversation_id: result.conversationId,
        reply: result.reply,
        message_type: result.messageType,
        pendingActions: result.pendingActions || null,
        pendingToolCalls: result.pendingToolCalls || null,
        draft_id: result.draftId || null,
        tool_call_log: result.toolCallLog || [],
      });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "user_message or messages is required",
      });
    }

    const sanitized = messages.filter((m) =>
      ["user", "assistant", "system", "tool"].includes(m.role)
    );

    const result = await chat({
      messages: sanitized,
      userId: req.user.id,
      supabase: req.supabase,
      accessToken: req.accessToken,
      surfaceContext: surface_context || null,
      mode: mode || "auto",
    });

    return res.json({
      ok: true,
      reply: result.reply,
      messages: result.messages,
      pendingActions: result.pendingActions || null,
      pendingToolCalls: result.pendingToolCalls || null,
      draft_id: result.draftId || null,
      tool_call_log: result.toolCallLog || [],
    });
  } catch (error) {
    console.error("Chat error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "Chat request failed",
    });
  }
});

chatRouter.post("/confirm", async (req, res) => {
  try {
    const {
      messages,
      pendingToolCalls,
      confirmedIds,
      surface_context,
      mode,
    } = req.body;

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
      accessToken: req.accessToken,
      surfaceContext: surface_context || null,
      mode: mode || "auto",
    });

    return res.json({
      ok: true,
      reply: result.reply,
      messages: result.messages,
      pendingActions: result.pendingActions || null,
      pendingToolCalls: result.pendingToolCalls || null,
      draft_id: result.draftId || null,
      tool_call_log: result.toolCallLog || [],
    });
  } catch (error) {
    console.error("Chat confirm error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "Confirm request failed",
    });
  }
});

export default chatRouter;
