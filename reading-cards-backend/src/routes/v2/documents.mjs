// ========= 文档相关路由 V2（支持云端存储和认证）=========

import express from "express";
import { requireAuth } from "../../middleware/auth.mjs";
import {
  addDocument,
  listDocuments,
  getDocument,
  updateDocument,
  deleteDocument,
} from "../../services/supabase/documents.mjs";
import { listCards, getCardsByIds } from "../../services/supabase/cards.mjs";
import {
  runAgent2,
  suggestQuestions,
  suggestHypotheses,
  suggestUnitTitles,
  runDocQHAssistant,
  runStoryUnitRefiner,
} from "../../services/agents.mjs";

const router = express.Router();

// 所有文档路由都需要认证
router.use(requireAuth);

/**
 * GET /api/v2/documents
 * 获取文档列表
 */
router.get("/", async (req, res) => {
  try {
    const { topic_title, topic_id } = req.query;
    const docs = await listDocuments(req.supabase, req.user.id, {
      topic_title: topic_title || undefined,
      topic_id: topic_id || undefined,
    });
    res.json({ ok: true, documents: docs });
  } catch (error) {
    console.error("获取文档列表失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

/**
 * POST /api/v2/documents
 * 创建空文档
 */
router.post("/", async (req, res) => {
  try {
    const {
      topic_title,
      topic_id,
      title,
      doc_questions = [],
      doc_hypotheses = [],
      story_units = [],
      preload_cards = true,
    } = req.body || {};

    if (!topic_title && !topic_id) {
      return res.status(400).json({
        ok: false,
        error: "topic_title_or_topic_id is required",
      });
    }

    const doc = await addDocument(req.supabase, req.user.id, {
      topic_title: topic_title || undefined,
      topic_id: topic_id || undefined,
      title: title || undefined,
      doc_questions,
      doc_hypotheses,
      story_units,
    });

    let cards = [];
    if (preload_cards) {
      cards = await listCards(req.supabase, req.user.id, {
        topic_title: topic_title || undefined,
        topic_id: topic_id || undefined,
        includeDeleted: false,
      });
    }

    res.json({ ok: true, document: doc, cards });
  } catch (error) {
    console.error("create document failed:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "internal_server_error",
    });
  }
});

/**
 * POST /api/v2/documents/from-cards
 * 基于一批卡片生成文档（故事线）
 */
router.post("/from-cards", async (req, res) => {
  try {
    const { topic_title, card_ids, docQuestions, docHypotheses } =
      req.body || {};

    if (!topic_title) {
      return res.status(400).json({
        ok: false,
        error: "topic_title is required",
      });
    }

    // 获取卡片
    let selected;
    if (card_ids && card_ids.length > 0) {
      selected = await getCardsByIds(req.supabase, card_ids);
    } else {
      selected = await listCards(req.supabase, req.user.id, {
        topic_title,
        includeDeleted: false,
      });
    }

    if (!selected.length) {
      return res.status(400).json({
        ok: false,
        error: "no cards available",
      });
    }

    // 调用 Agent2 生成文档结构
    const output = await runAgent2({
      topicTitle: topic_title,
      cards: selected,
      docQuestions: docQuestions || "",
      docHypotheses: docHypotheses || "",
    });

    // 创建并保存文档
    const doc = await addDocument(req.supabase, req.user.id, {
      topic_title,
      doc_questions: output.doc_questions,
      doc_hypotheses: output.doc_hypotheses,
      story_units: output.story_units,
    });

    res.json({ ok: true, document: doc });
  } catch (error) {
    console.error("创建 Document 失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

/**
 * GET /api/v2/documents/:doc_id
 * 获取单个文档详情
 */
router.get("/:doc_id", async (req, res) => {
  try {
    const doc = await getDocument(req.supabase, req.params.doc_id);

    if (!doc) {
      return res.status(404).json({
        ok: false,
        error: "document not found",
      });
    }

    res.json({ ok: true, document: doc });
  } catch (error) {
    console.error("获取文档详情失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

/**
 * PATCH /api/v2/documents/:doc_id
 * 更新文档
 */
router.patch("/:doc_id", async (req, res) => {
  try {
    const { doc_id } = req.params;
    const updates = req.body;

    const updatedDoc = await updateDocument(
      req.supabase,
      req.user.id,
      doc_id,
      updates
    );

    if (!updatedDoc) {
      return res.status(404).json({
        ok: false,
        error: "文档不存在",
      });
    }

    res.json({
      ok: true,
      document: updatedDoc,
    });
  } catch (error) {
    console.error("更新文档失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

/**
 * DELETE /api/v2/documents/:doc_id
 * 删除文档
 */
router.delete("/:doc_id", async (req, res) => {
  try {
    const { doc_id } = req.params;
    const deleted = await deleteDocument(req.supabase, doc_id);

    if (!deleted) {
      return res.status(404).json({
        ok: false,
        error: "文档不存在",
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("删除文档失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

/**
 * POST /api/v2/documents/suggest-questions
 * AI 建议问题
 */
router.post("/suggest-questions", async (req, res) => {
  try {
    const { topic_title, card_summaries = [] } = req.body || {};

    const questions = await suggestQuestions({
      topicTitle: topic_title,
      cardSummaries: card_summaries,
    });

    res.json({ ok: true, questions });
  } catch (error) {
    console.error("AI 建议问题失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

/**
 * POST /api/v2/documents/suggest-hypotheses
 * AI 建议假设
 */
router.post("/suggest-hypotheses", async (req, res) => {
  try {
    const { topic_title, questions = [], card_summaries = [] } = req.body || {};

    const hypotheses = await suggestHypotheses({
      topicTitle: topic_title,
      questions,
      cardSummaries: card_summaries,
    });

    res.json({ ok: true, hypotheses });
  } catch (error) {
    console.error("AI 建议假设失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

/**
 * POST /api/v2/documents/suggest-unit-title
 * AI 建议故事单元标题
 */
router.post("/suggest-unit-title", async (req, res) => {
  try {
    const { core_point, card_summaries = [] } = req.body || {};

    const titles = await suggestUnitTitles({
      corePoint: core_point,
      cardSummaries: card_summaries,
    });

    res.json({ ok: true, titles });
  } catch (error) {
    console.error("AI 建议标题失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

/**
 * POST /api/v2/documents/:doc_id/ai-qh
 * 文档级问题 & 假设 AI 微调
 */
router.post("/:doc_id/ai-qh", async (req, res) => {
  try {
    const { doc_id } = req.params;
    const { mode } = req.body || {};

    const doc = await getDocument(req.supabase, doc_id);
    if (!doc) {
      return res.status(404).json({ ok: false, error: "document_not_found" });
    }

    // 获取该文档关联的卡片
    const usedCardIds = new Set();
    (doc.story_units || []).forEach((unit) => {
      (unit.card_ids || []).forEach((id) => usedCardIds.add(id));
    });

    let cards = [];
    if (usedCardIds.size > 0) {
      cards = await getCardsByIds(req.supabase, Array.from(usedCardIds));
    }

    const docQuestionsText = (doc.doc_questions || [])
      .map((q) => q.text)
      .join("\n");
    const docHypothesesText = (doc.doc_hypotheses || [])
      .map((h) => h.text)
      .join("\n");

    const aiOutput = await runDocQHAssistant({
      mode: mode || "both",
      topicTitle: doc.topic_title,
      docQuestions: docQuestionsText,
      docHypotheses: docHypothesesText,
      cards,
    });

    res.json({
      ok: true,
      doc_id,
      ai_doc_questions: aiOutput.doc_questions,
      ai_doc_hypotheses: aiOutput.doc_hypotheses,
    });
  } catch (error) {
    console.error("Q/H Assistant 失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

/**
 * POST /api/v2/documents/:doc_id/story-units/:unit_id/ai-refine
 * 单个 Story Unit 的 AI 改写
 */
router.post("/:doc_id/story-units/:unit_id/ai-refine", async (req, res) => {
  try {
    const { doc_id, unit_id } = req.params;

    const doc = await getDocument(req.supabase, doc_id);
    if (!doc) {
      return res.status(404).json({ ok: false, error: "document_not_found" });
    }

    const targetUnit = (doc.story_units || []).find(
      (u) => u.unit_id === unit_id
    );
    if (!targetUnit) {
      return res
        .status(404)
        .json({ ok: false, error: "story_unit_not_found" });
    }

    // 获取该 unit 使用的卡片
    const cardsForUnit = await getCardsByIds(
      req.supabase,
      targetUnit.card_ids || []
    );

    const aiResult = await runStoryUnitRefiner({
      topicTitle: doc.topic_title,
      docQuestions: doc.doc_questions || [],
      docHypotheses: doc.doc_hypotheses || [],
      targetStoryUnit: targetUnit,
      cards: cardsForUnit,
    });

    res.json({
      ok: true,
      doc_id,
      unit_id,
      ai_title: aiResult.title,
      ai_core_point: aiResult.core_point,
      ai_notes_for_writer: aiResult.notes_for_writer || [],
    });
  } catch (error) {
    console.error("Story Unit Refiner 失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

export default router;







