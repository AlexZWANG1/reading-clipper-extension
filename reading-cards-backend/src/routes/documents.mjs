// ========= 文档（故事线）相关路由 =========
// 为未来的 Document / Storyline 新 UI 预留的后端骨架

import express from "express";
import { listCards } from "../services/cards.mjs";
import { runAgent2, suggestQuestions, suggestHypotheses, suggestUnitTitles, runDocQHAssistant, runStoryUnitRefiner, runHypothesisEvaluatorV2 } from "../services/agents.mjs";
import { addDocument, listDocuments, getDocument, updateDocument, deleteDocument } from "../services/documents.mjs";
import { ensureVectorStoreForTopic, syncCardsToVectorStoreForTopic } from "../services/vectorStores.mjs";

const documentsRouter = express.Router();

/**
 * POST /api/documents/from-cards
 * 基于一批卡片生成文档（故事线）
 * 
 * 这个接口同时支持两种文档创建路径：
 * 1. Doc-first：在某个 topic 的「文档页」点击"用当前 topic 全部卡片生成故事线"，不传 card_ids
 * 2. Card-first：在卡片列表里多选卡片，把选中的 card_ids 和 topic_title 一起 POST
 * 
 * 请求体：
 * {
 *   topic_title: string,           // 必填：文档标题 = 研究主题
 *   card_ids?: string[],           // 可选：指定的卡片 ID 列表，不传则使用该 topic 下全部卡片
 *   docQuestions?: string,         // 可选：用户提供的文档问题（文本形式）
 *   docHypotheses?: string         // 可选：用户提供的文档假设（文本形式）
 * }
 * 
 * 返回：
 * {
 *   ok: true,
 *   document: Document   // 创建的文档对象
 * }
 */
documentsRouter.post("/from-cards", async (req, res) => {
  try {
    const { topic_title, card_ids, docQuestions, docHypotheses } = req.body || {};

    if (!topic_title) {
      return res.status(400).json({
        ok: false,
        error: "topic_title is required"
      });
    }

    // 如果指定了 card_ids，则使用这些卡片（可能跨 topic）
    // 否则，使用该 topic_title 下所有未删除的卡片
    let selected;
    if (card_ids && card_ids.length > 0) {
      // Card-first 模式：使用指定的卡片（可能来自不同 topic）
      const allCards = listCards({ includeDeleted: false });
      selected = allCards.filter((c) => card_ids.includes(c.id));
    } else {
      // Topic-first 模式：使用该 topic 下的全部卡片
      selected = listCards({ topic_title, includeDeleted: false });
    }

    if (!selected.length) {
      return res.status(400).json({
        ok: false,
        error: "no cards available"
      });
    }

    // 调用 Agent2 生成文档结构
    const output = await runAgent2({
      topicTitle: topic_title,
      cards: selected,
      docQuestions: docQuestions || "",
      docHypotheses: docHypotheses || ""
    });

    // 创建并保存文档
    const doc = addDocument({
      topic_title,
      doc_questions: output.doc_questions,
      doc_hypotheses: output.doc_hypotheses,
      story_units: output.story_units
    });

    res.json({ ok: true, document: doc });
  } catch (error) {
    console.error("创建 Document 失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误"
    });
  }
});

/**
 * GET /api/documents
 * 获取文档列表
 * 
 * 查询参数：
 * - topic_title?: string（按 topic_title 精确筛选）
 * 
 * 返回：
 * {
 *   ok: true,
 *   documents: Document[]
 * }
 */
documentsRouter.get("/", (req, res) => {
  try {
    const { topic_title } = req.query;
    const docs = listDocuments({ topic_title: topic_title || undefined });
    res.json({ ok: true, documents: docs });
  } catch (error) {
    console.error("获取文档列表失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误"
    });
  }
});

/**
 * GET /api/documents/:doc_id
 * 获取单个文档详情
 * 
 * 返回：
 * {
 *   ok: true,
 *   document: Document
 * }
 */
documentsRouter.get("/:doc_id", (req, res) => {
  try {
    const doc = getDocument(req.params.doc_id);

    if (!doc) {
      return res.status(404).json({
        ok: false,
        error: "document not found"
      });
    }

    res.json({ ok: true, document: doc });
  } catch (error) {
    console.error("获取文档详情失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误"
    });
  }
});

/**
 * PATCH /api/documents/:doc_id
 * 更新文档
 * 
 * 请求体可以是部分字段：
 * {
 *   topic_title?: string,
 *   doc_questions?: Question[],
 *   doc_hypotheses?: Hypothesis[],
 *   story_units?: StoryUnit[]
 * }
 * 
 * 返回：
 * {
 *   ok: true,
 *   document: Document
 * }
 */
documentsRouter.patch("/:doc_id", (req, res) => {
  try {
    const { doc_id } = req.params;
    const updates = req.body;

    const updatedDoc = updateDocument(doc_id, updates);

    if (!updatedDoc) {
      return res.status(404).json({
        ok: false,
        error: "文档不存在"
      });
    }

    res.json({
      ok: true,
      document: updatedDoc
    });
  } catch (error) {
    console.error("更新文档失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误"
    });
  }
});

/**
 * DELETE /api/documents/:doc_id
 * 删除文档
 * 
 * 返回：
 * {
 *   ok: true
 * }
 */
documentsRouter.delete("/:doc_id", (req, res) => {
  try {
    const { doc_id } = req.params;
    const deleted = deleteDocument(doc_id);

    if (!deleted) {
      return res.status(404).json({
        ok: false,
        error: "文档不存在"
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("删除文档失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误"
    });
  }
});

/**
 * POST /api/documents
 * 创建空文档
 * 
 * 请求体：
 * {
 *   topic_title: string,           // 文档主题
 *   preload_cards?: boolean        // 是否预加载 Topic 下所有卡片（默认 true）
 * }
 */
documentsRouter.post("/", async (req, res) => {
  try {
    const { topic_title, preload_cards = true } = req.body || {};

    if (!topic_title) {
      return res.status(400).json({
        ok: false,
        error: "topic_title is required"
      });
    }

    // 创建空文档
    const doc = addDocument({
      topic_title,
      doc_questions: [],
      doc_hypotheses: [],
      story_units: []
    });

    // 如果需要预加载卡片，获取该 Topic 下的所有卡片
    let cards = [];
    if (preload_cards) {
      cards = listCards({ topic_title, includeDeleted: false });
    }

    res.json({ ok: true, document: doc, cards });
  } catch (error) {
    console.error("创建文档失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误"
    });
  }
});

/**
 * POST /api/documents/suggest-questions
 * AI 建议问题
 * 
 * 请求体：
 * {
 *   topic_title: string,
 *   card_summaries: string[]
 * }
 */
documentsRouter.post("/suggest-questions", async (req, res) => {
  try {
    const { topic_title, card_summaries = [] } = req.body || {};

    const questions = await suggestQuestions({
      topicTitle: topic_title,
      cardSummaries: card_summaries
    });

    res.json({ ok: true, questions });
  } catch (error) {
    console.error("AI 建议问题失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误"
    });
  }
});

/**
 * POST /api/documents/suggest-hypotheses
 * AI 建议假设
 * 
 * 请求体：
 * {
 *   topic_title: string,
 *   questions: string[],
 *   card_summaries: string[]
 * }
 */
documentsRouter.post("/suggest-hypotheses", async (req, res) => {
  try {
    const { topic_title, questions = [], card_summaries = [] } = req.body || {};

    const hypotheses = await suggestHypotheses({
      topicTitle: topic_title,
      questions,
      cardSummaries: card_summaries
    });

    res.json({ ok: true, hypotheses });
  } catch (error) {
    console.error("AI 建议假设失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误"
    });
  }
});

/**
 * POST /api/documents/suggest-unit-title
 * AI 建议故事单元标题
 * 
 * 请求体：
 * {
 *   core_point: string,
 *   card_summaries: string[]
 * }
 */
documentsRouter.post("/suggest-unit-title", async (req, res) => {
  try {
    const { core_point, card_summaries = [] } = req.body || {};

    const titles = await suggestUnitTitles({
      corePoint: core_point,
      cardSummaries: card_summaries
    });

    res.json({ ok: true, titles });
  } catch (error) {
    console.error("AI 建议标题失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误"
    });
  }
});

/**
 * POST /api/documents/:doc_id/ai-qh
 * 文档级问题 & 假设 AI 微调
 * 
 * 请求体：
 * {
 *   mode: "questions" | "hypotheses" | "both"
 * }
 * 
 * 返回 AI 建议的 doc_questions 和 doc_hypotheses，不自动覆盖，由前端确认后保存
 */
documentsRouter.post("/:doc_id/ai-qh", async (req, res) => {
  try {
    const { doc_id } = req.params;
    const { mode } = req.body || {};

    const doc = getDocument(doc_id);
    if (!doc) {
      return res.status(404).json({ ok: false, error: "document_not_found" });
    }

    // 获取该文档关联的卡片
    const allCards = listCards({ includeDeleted: false });
    // 优先使用文档 story_units 中的卡片，如果没有则使用全部卡片
    let cards = allCards;
    const usedCardIds = new Set();
    (doc.story_units || []).forEach(unit => {
      (unit.card_ids || []).forEach(id => usedCardIds.add(id));
    });
    if (usedCardIds.size > 0) {
      cards = allCards.filter(c => usedCardIds.has(c.id));
    }

    const docQuestionsText = (doc.doc_questions || []).map(q => q.text).join("\n");
    const docHypothesesText = (doc.doc_hypotheses || []).map(h => h.text).join("\n");

    const aiOutput = await runDocQHAssistant({
      mode: mode || "both",
      topicTitle: doc.topic_title,
      docQuestions: docQuestionsText,
      docHypotheses: docHypothesesText,
      cards
    });

    // 返回 AI 建议，不自动覆盖，让前端确认
    res.json({
      ok: true,
      doc_id,
      ai_doc_questions: aiOutput.doc_questions,
      ai_doc_hypotheses: aiOutput.doc_hypotheses
    });
  } catch (error) {
    console.error("Q/H Assistant 失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误"
    });
  }
});

/**
 * POST /api/documents/:doc_id/story-units/:unit_id/ai-refine
 * 单个 Story Unit 的 AI 改写
 * 
 * 返回 AI 建议的 title, core_point, notes_for_writer，不自动覆盖
 */
documentsRouter.post("/:doc_id/story-units/:unit_id/ai-refine", async (req, res) => {
  try {
    const { doc_id, unit_id } = req.params;

    const doc = getDocument(doc_id);
    if (!doc) {
      return res.status(404).json({ ok: false, error: "document_not_found" });
    }

    const targetUnit = (doc.story_units || []).find(u => u.unit_id === unit_id);
    if (!targetUnit) {
      return res.status(404).json({ ok: false, error: "story_unit_not_found" });
    }

    // 获取该 unit 使用的卡片
    const allCards = listCards({ includeDeleted: false });
    const cardsMap = new Map(allCards.map(c => [c.id, c]));
    const cardsForUnit = (targetUnit.card_ids || [])
      .map(id => cardsMap.get(id))
      .filter(Boolean);

    const aiResult = await runStoryUnitRefiner({
      topicTitle: doc.topic_title,
      docQuestions: doc.doc_questions || [],
      docHypotheses: doc.doc_hypotheses || [],
      targetStoryUnit: targetUnit,
      cards: cardsForUnit
    });

    // 返回 AI 建议，不自动覆盖
    res.json({
      ok: true,
      doc_id,
      unit_id,
      ai_title: aiResult.title,
      ai_core_point: aiResult.core_point,
      ai_notes_for_writer: aiResult.notes_for_writer || []
    });
  } catch (error) {
    console.error("Story Unit Refiner 失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误"
    });
  }
});

/**
 * POST /api/documents/:doc_id/hypotheses/evaluate
 * Hypothesis 验证台（V2，基于 Vector Store + file_search）
 * 
 * 请求体：
 * {
 *   hypothesis_ids: string[]  // 要评估的假设 ID 列表
 * }
 * 
 * 返回：
 * {
 *   ok: true,
 *   result: {
 *     topic_title: string,
 *     global_summary: string,
 *     evaluations: HypothesisEvaluation[],
 *     used_card_ids: string[]
 *   }
 * }
 */
documentsRouter.post("/:doc_id/hypotheses/evaluate", async (req, res) => {
  try {
    const { doc_id } = req.params;
    const { hypothesis_ids } = req.body || {};

    if (!Array.isArray(hypothesis_ids) || !hypothesis_ids.length) {
      return res.status(400).json({
        ok: false,
        error: "hypothesis_ids_required",
        message: "hypothesis_ids 必须是非空数组"
      });
    }

    const doc = getDocument(doc_id);
    if (!doc) {
      return res.status(404).json({
        ok: false,
        error: "document_not_found"
      });
    }

    const allHypotheses = doc.doc_hypotheses || [];
    const targetHypotheses = allHypotheses.filter(h => hypothesis_ids.includes(h.id));

    if (!targetHypotheses.length) {
      return res.status(400).json({
        ok: false,
        error: "no_matching_hypotheses",
        message: "未找到匹配的假设"
      });
    }

    // 确保当前 topic 有对应的 vector store（如果没有会自动创建）
    console.log("=== Hypothesis Evaluate 开始 ===");
    console.log("Document Topic:", doc.topic_title);
    console.log("Target Hypotheses:", targetHypotheses.map(h => h.id).join(", "));
    
    let storeRecord;
    try {
      storeRecord = await ensureVectorStoreForTopic(doc.topic_title);
      console.log("Vector Store Record:", {
        topic_title: storeRecord.topic_title,
        vector_store_id: storeRecord.vector_store_id,
        file_count: Object.keys(storeRecord.file_map || {}).length
      });
    } catch (storeError) {
      console.error("创建/获取 Vector Store 失败:", storeError);
      throw new Error(`无法创建或获取 Vector Store: ${storeError.message}`);
    }

    const vectorStoreId = storeRecord.vector_store_id;
    if (!vectorStoreId) {
      throw new Error("Vector Store ID 为空");
    }

    // 检查 vector store 是否有文件
    let fileCount = Object.keys(storeRecord.file_map || {}).length;
    console.log("Vector Store 文件数量:", fileCount);
    
    // 如果 Vector Store 为空，尝试从文档的 story_units 中同步卡片
    if (fileCount === 0) {
      console.log("⚠️ Vector Store 为空，尝试从文档的 story_units 中同步卡片...");
      
      // 收集文档中引用的所有卡片 ID
      const cardIds = new Set();
      (doc.story_units || []).forEach(unit => {
        (unit.card_ids || []).forEach(id => cardIds.add(id));
      });
      
      if (cardIds.size > 0) {
        console.log(`📋 找到 ${cardIds.size} 张卡片需要同步:`, Array.from(cardIds));
        
        // 获取这些卡片
        const allCards = listCards({ includeDeleted: false });
        const cardsToSync = allCards.filter(c => cardIds.has(c.id));
        
        if (cardsToSync.length > 0) {
          console.log(`🔄 开始同步 ${cardsToSync.length} 张卡片到 topic "${doc.topic_title}"...`);
          try {
            const syncedCount = await syncCardsToVectorStoreForTopic(cardsToSync, doc.topic_title);
            console.log(`✅ 成功同步 ${syncedCount} 张卡片`);
            
            // 重新获取 Vector Store 记录
            storeRecord = await ensureVectorStoreForTopic(doc.topic_title);
            fileCount = Object.keys(storeRecord.file_map || {}).length;
            console.log("同步后 Vector Store 文件数量:", fileCount);
          } catch (syncError) {
            console.error("❌ 同步卡片失败:", syncError);
            // 继续执行，如果还是为空则返回错误
          }
        } else {
          console.warn("⚠️ 未找到需要同步的卡片（可能已被删除）");
        }
      } else {
        console.warn("⚠️ 文档中没有引用任何卡片");
      }
    }
    
    // 如果同步后仍然为空，返回错误
    if (fileCount === 0) {
      return res.status(400).json({
        ok: false,
        error: "no_cards_in_vector_store",
        message: `当前 topic "${doc.topic_title}" 的 Vector Store 中没有卡片。文档中引用的卡片可能已被删除，或者卡片的 topic_title 与文档不一致。请先添加卡片或检查文档的 story_units。`
      });
    }

    // 调用 Hypothesis Evaluator V2
    console.log("准备调用 runHypothesisEvaluatorV2...");
    const result = await runHypothesisEvaluatorV2({
      topicTitle: doc.topic_title,
      docQuestions: doc.doc_questions || [],
      targetHypotheses,
      vectorStoreId
    });
    console.log("✅ runHypothesisEvaluatorV2 调用成功");

    res.json({
      ok: true,
      result
    });
  } catch (error) {
    console.error("Hypothesis evaluate V2 error:", error);
    console.error("Error Stack:", error.stack);
    
    // 提取更详细的错误信息
    let errorMessage = String(error?.message || error);
    let errorDetail = errorMessage;
    
    // 如果是网络错误，提供更友好的提示
    if (errorMessage.includes("fetch failed") || errorMessage.includes("ECONNREFUSED")) {
      errorDetail = "无法连接到 OpenAI API，请检查网络连接";
    } else if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
      errorDetail = "API Key 无效或已过期，请检查 .env 文件中的 OPENAI_API_KEY";
    } else if (errorMessage.includes("429")) {
      errorDetail = "API 请求频率过高，请稍后重试";
    } else if (errorMessage.includes("500") || errorMessage.includes("internal_error")) {
      errorDetail = "OpenAI 服务器内部错误，可能是请求格式问题或服务暂时不可用";
    }
    
    res.status(500).json({
      ok: false,
      error: "internal_error",
      detail: errorDetail,
      original_error: errorMessage
    });
  }
});

export default documentsRouter;


