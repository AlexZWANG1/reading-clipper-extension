// ========= 独立的假设验证 API =========
// 不依赖 Document，可直接基于 Topic 或卡片进行假设验证

import { Router } from "express";
import { listCards } from "../services/cards.mjs";
import { suggestHypotheses, runHypothesisEvaluatorV2 } from "../services/agents.mjs";
import { ensureVectorStoreForTopic, syncCardsToVectorStoreForTopic } from "../services/vectorStores.mjs";

const hypothesesRouter = Router();

/**
 * POST /api/hypotheses/suggest
 * AI 建议假设（独立于 Document）
 * 
 * 请求体：
 * {
 *   topic_title: string,           // 主题（可选，用于上下文）
 *   card_ids?: string[],           // 指定卡片 ID（可选）
 *   questions?: string[]           // 研究问题（可选）
 * }
 * 
 * 返回：
 * {
 *   ok: true,
 *   hypotheses: string[]
 * }
 */
hypothesesRouter.post("/suggest", async (req, res) => {
  try {
    const { topic_title, card_ids, questions = [] } = req.body || {};

    // 获取卡片
    let cards = [];
    if (card_ids && card_ids.length > 0) {
      // 使用指定的卡片
      const allCards = listCards({ includeDeleted: false });
      cards = allCards.filter(c => card_ids.includes(c.id));
    } else if (topic_title) {
      // 使用 Topic 下的所有卡片
      const allCards = listCards({ includeDeleted: false });
      cards = allCards.filter(c => c.topic_title === topic_title);
    } else {
      // 没有指定范围，使用最近的 20 张卡片
      const allCards = listCards({ includeDeleted: false });
      cards = allCards
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 20);
    }

    if (cards.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "no_cards",
        message: "没有找到可用的卡片来生成假设"
      });
    }

    // 提取卡片摘要
    const cardSummaries = cards
      .map(c => c.summary || c.raw_snippet || "")
      .filter(Boolean)
      .slice(0, 15);

    // 调用 AI 生成假设
    const hypotheses = await suggestHypotheses({
      topicTitle: topic_title || "未命名主题",
      questions,
      cardSummaries
    });

    res.json({
      ok: true,
      hypotheses,
      cards_used: cards.length
    });
  } catch (error) {
    console.error("AI 建议假设失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误"
    });
  }
});

/**
 * POST /api/hypotheses/evaluate
 * 验证假设（独立于 Document）
 * 
 * 请求体（二选一）：
 * 
 * 模式 A - 按 Topic：
 * {
 *   topic_title: string,           // 主题（用于定位 Vector Store）
 *   hypotheses: string[],          // 要验证的假设列表（必需）
 *   questions?: string[]           // 研究问题（可选）
 * }
 * 
 * 模式 B - 手动选卡片：
 * {
 *   card_ids: string[],            // 指定卡片 ID 列表
 *   hypotheses: string[],          // 要验证的假设列表（必需）
 *   questions?: string[]           // 研究问题（可选）
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
hypothesesRouter.post("/evaluate", async (req, res) => {
  try {
    const { topic_title, card_ids, hypotheses, questions = [] } = req.body || {};

    // 验证假设参数
    if (!Array.isArray(hypotheses) || hypotheses.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "hypotheses_required",
        message: "hypotheses 必须是非空数组"
      });
    }

    // 转换假设格式（添加 ID）
    const targetHypotheses = hypotheses.map((text, i) => ({
      id: `H${i + 1}`,
      text: typeof text === 'string' ? text : text.text,
      question_id: null
    }));

    // 转换问题格式
    const docQuestions = questions.map((text, i) => ({
      id: `Q${i + 1}`,
      text: typeof text === 'string' ? text : text.text
    }));

    // 确定来源模式
    let effectiveTopicTitle = topic_title;
    let allowedCardIds = null;

    if (card_ids && card_ids.length > 0) {
      // 模式 B：手动选卡片
      console.log("=== 假设验证（手动选卡片模式）===");
      console.log("选中卡片数:", card_ids.length);

      // 获取选中的卡片
      const allCards = listCards({ includeDeleted: false });
      const selectedCards = allCards.filter(c => card_ids.includes(c.id));

      if (selectedCards.length === 0) {
        return res.status(400).json({
          ok: false,
          error: "no_valid_cards",
          message: "选中的卡片不存在或已被删除"
        });
      }

      // 从卡片推断 Topic（取最常见的）
      const topicCounts = {};
      selectedCards.forEach(c => {
        if (c.topic_title) {
          topicCounts[c.topic_title] = (topicCounts[c.topic_title] || 0) + 1;
        }
      });
      const sortedTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]);
      effectiveTopicTitle = sortedTopics[0]?.[0] || "未分类";

      console.log("推断 Topic:", effectiveTopicTitle);

      // 限制 AI 只使用这些卡片
      allowedCardIds = card_ids;

    } else if (topic_title) {
      // 模式 A：按 Topic
      console.log("=== 假设验证（按 Topic 模式）===");
      console.log("Topic:", topic_title);

    } else {
      return res.status(400).json({
        ok: false,
        error: "source_required",
        message: "请提供 topic_title 或 card_ids"
      });
    }

    console.log("Hypotheses:", targetHypotheses.length);

    // 确保 Vector Store 存在
    let storeRecord;
    try {
      storeRecord = await ensureVectorStoreForTopic(effectiveTopicTitle);
      console.log("Vector Store ID:", storeRecord.vector_store_id);
    } catch (storeError) {
      console.error("创建/获取 Vector Store 失败:", storeError);
      throw new Error(`无法创建或获取 Vector Store: ${storeError.message}`);
    }

    const vectorStoreId = storeRecord.vector_store_id;
    let fileCount = Object.keys(storeRecord.file_map || {}).length;
    console.log("Vector Store 文件数量:", fileCount);

    // 如果 Vector Store 为空，尝试同步卡片
    if (fileCount === 0) {
      console.log("⚠️ Vector Store 为空，尝试同步卡片...");
      
      const allCards = listCards({ includeDeleted: false });
      let cardsToSync;
      
      if (allowedCardIds) {
        // 手动选卡片模式：同步选中的卡片
        cardsToSync = allCards.filter(c => allowedCardIds.includes(c.id));
      } else {
        // Topic 模式：同步该 Topic 的所有卡片
        cardsToSync = allCards.filter(c => c.topic_title === effectiveTopicTitle);
      }
      
      if (cardsToSync.length > 0) {
        console.log(`🔄 同步 ${cardsToSync.length} 张卡片...`);
        try {
          const syncedCount = await syncCardsToVectorStoreForTopic(cardsToSync, effectiveTopicTitle);
          console.log(`✅ 成功同步 ${syncedCount} 张卡片`);
          
          // 重新获取
          storeRecord = await ensureVectorStoreForTopic(effectiveTopicTitle);
          fileCount = Object.keys(storeRecord.file_map || {}).length;
        } catch (syncError) {
          console.error("❌ 同步卡片失败:", syncError);
        }
      }
    }

    // 如果仍然为空
    if (fileCount === 0) {
      return res.status(400).json({
        ok: false,
        error: "no_cards_in_vector_store",
        message: allowedCardIds 
          ? "选中的卡片无法同步到 Vector Store，请检查卡片内容。"
          : `Topic "${effectiveTopicTitle}" 下没有卡片可用于验证。请先添加卡片到该 Topic。`
      });
    }

    // 调用 Hypothesis Evaluator
    console.log("调用 runHypothesisEvaluatorV2...");
    console.log("allowedCardIds:", allowedCardIds ? allowedCardIds.length : "无限制");
    
    const result = await runHypothesisEvaluatorV2({
      topicTitle: effectiveTopicTitle,
      docQuestions,
      targetHypotheses,
      vectorStoreId,
      allowedCardIds  // 新增参数：限制使用的卡片
    });
    console.log("✅ 验证完成");

    res.json({
      ok: true,
      result
    });
  } catch (error) {
    console.error("假设验证失败:", error);
    console.error("Stack:", error.stack);

    let errorMessage = String(error?.message || error);
    let errorDetail = errorMessage;

    if (errorMessage.includes("fetch failed") || errorMessage.includes("ECONNREFUSED")) {
      errorDetail = "无法连接到 OpenAI API，请检查网络连接";
    } else if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
      errorDetail = "API Key 无效或已过期";
    } else if (errorMessage.includes("429")) {
      errorDetail = "API 请求频率过高，请稍后重试";
    }

    res.status(500).json({
      ok: false,
      error: "internal_error",
      detail: errorDetail,
      original_error: errorMessage
    });
  }
});

export default hypothesesRouter;

