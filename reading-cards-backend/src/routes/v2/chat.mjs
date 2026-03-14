// ========= Chat Route =========
// POST /api/v2/chat          — AI chat with conversation persistence + plan support
// POST /api/v2/chat/confirm  — Confirm pending write/destructive actions
// POST /api/v2/chat/execute-plan — Confirm and execute a generated plan

import { Router } from "express";
import { requireAuth } from "../../middleware/auth.mjs";
import { chat, chatConfirm, chatWithConversation, confirmAndExecutePlan } from "../../chat/orchestrator.mjs";
import { PLAN_TEMPLATES } from "../../chat/planner.mjs";

const chatRouter = Router();
chatRouter.use(requireAuth);

/**
 * POST /api/v2/chat
 * Body: { conversation_id?, user_message?, messages? }
 *
 * New mode (conversation-aware): provide conversation_id + user_message
 * Legacy mode (stateless): provide messages array
 */
chatRouter.post("/", async (req, res) => {
  try {
    const { conversation_id, user_message, messages, surface_context, mode } = req.body;

    // New conversation-aware mode
    if (user_message !== undefined) {
      const result = await chatWithConversation({
        conversationId: conversation_id || null,
        userMessage: user_message,
        userId: req.user.id,
        supabase: req.supabase,
        accessToken: req.accessToken,
        surfaceContext: surface_context || null,
        mode: mode || 'auto',
      });

      return res.json({
        ok: true,
        conversation_id: result.conversationId,
        reply: result.reply,
        message_type: result.messageType,
        plan: result.plan || null,
        pendingActions: result.pendingActions || null,
        pendingToolCalls: result.pendingToolCalls || null,
        draft_id: result.draftId || null,
        tool_call_log: result.toolCallLog || [],
      });
    }

    // Legacy stateless mode (for backward compatibility)
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "user_message or messages is required",
      });
    }

    const sanitized = messages.filter((m) =>
      ["user", "assistant", "system"].includes(m.role)
    );

    const result = await chat({
      messages: sanitized,
      userId: req.user.id,
      supabase: req.supabase,
      accessToken: req.accessToken,
      surfaceContext: surface_context || null,
      mode: mode || 'auto',
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
      tool_call_log: result.toolCallLog || [],
    });
  } catch (error) {
    console.error("Chat confirm error:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "Confirm request failed",
    });
  }
});

/**
 * POST /api/v2/chat/execute-plan
 * Body: { conversation_id, plan_spec, plan_display, topic_id? }
 * Confirms and starts executing a previously proposed plan.
 */
chatRouter.post("/execute-plan", async (req, res) => {
  try {
    const { conversation_id, plan_spec, plan_display, topic_id } = req.body;

    if (!conversation_id || !plan_spec) {
      return res.status(400).json({
        ok: false,
        error: "conversation_id and plan_spec are required",
      });
    }

    const result = await confirmAndExecutePlan({
      conversationId: conversation_id,
      planSpec: plan_spec,
      planDisplay: plan_display || {},
      topicId: topic_id || null,
      userId: req.user.id,
      supabase: req.supabase,
    });

    res.json({
      ok: true,
      task_id: result.taskId,
      status: result.status,
    });
  } catch (error) {
    console.error("Execute plan error:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "Plan execution failed",
    });
  }
});

/**
 * GET /api/v2/chat/templates
 * Returns available plan templates.
 */
chatRouter.get("/templates", (req, res) => {
  res.json({ ok: true, templates: PLAN_TEMPLATES });
});

export default chatRouter;
