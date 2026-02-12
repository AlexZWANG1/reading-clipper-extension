// ========= 假设验证 V2 API (云端版本) =========
// 使用 Supabase 存储的卡片数据

import { Router } from "express";
import { requireAuth } from "../../middleware/auth.mjs";
import { supabaseAdmin } from "../../config/supabase.mjs";
import { suggestHypotheses, runHypothesisEvaluatorV2 } from "../../services/agents.mjs";
import {
    ensureVectorStoreForUserTopic,
    syncCardsToVectorStoreForUserTopic
} from "../../services/vectorStoresV2.mjs";

const hypothesesRouterV2 = Router();

// 所有路由都需要认证
hypothesesRouterV2.use(requireAuth);

/**
 * POST /api/v2/hypotheses/suggest
 * AI 建议假设（基于用户的云端卡片）
 */
hypothesesRouterV2.post("/suggest", async (req, res) => {
    try {
        const userId = req.user.id;
        const { topic_id, card_ids, questions = [] } = req.body || {};

        const supabase = supabaseAdmin;

        // 获取卡片
        let cards = [];
        if (card_ids && card_ids.length > 0) {
            // 使用指定的卡片
            const { data, error } = await supabase
                .from("cards")
                .select("*")
                .eq("user_id", userId)
                .eq("deleted", false)
                .in("id", card_ids);

            if (error) throw new Error(error.message);
            cards = data || [];
        } else if (topic_id) {
            // 使用 Topic 下的所有卡片
            const { data, error } = await supabase
                .from("cards")
                .select("*")
                .eq("user_id", userId)
                .eq("topic_id", topic_id)
                .eq("deleted", false);

            if (error) throw new Error(error.message);
            cards = data || [];
        } else {
            // 没有指定范围，使用最近的 20 张卡片
            const { data, error } = await supabase
                .from("cards")
                .select("*")
                .eq("user_id", userId)
                .eq("deleted", false)
                .order("created_at", { ascending: false })
                .limit(20);

            if (error) throw new Error(error.message);
            cards = data || [];
        }

        if (cards.length === 0) {
            return res.status(400).json({
                ok: false,
                error: "no_cards",
                message: "没有找到可用的卡片来生成假设",
            });
        }

        // 获取 Topic 名称（如果有）
        let topicTitle = "未命名主题";
        if (topic_id) {
            const { data: topic } = await supabase
                .from("topics")
                .select("title")
                .eq("id", topic_id)
                .single();
            if (topic) topicTitle = topic.title;
        }

        // 提取卡片摘要
        const cardSummaries = cards
            .map(c => c.summary || c.raw_snippet || "")
            .filter(Boolean)
            .slice(0, 15);

        // 调用 AI 生成假设
        const hypotheses = await suggestHypotheses({
            topicTitle,
            questions,
            cardSummaries,
        });

        res.json({
            ok: true,
            hypotheses,
            cards_used: cards.length,
        });
    } catch (error) {
        console.error("AI 建议假设失败:", error);
        res.status(500).json({
            ok: false,
            error: error.message || "服务器内部错误",
        });
    }
});

/**
 * POST /api/v2/hypotheses/evaluate
 * 验证假设（使用用户的云端卡片和 Vector Store）
 */
hypothesesRouterV2.post("/evaluate", async (req, res) => {
    try {
        const userId = req.user.id;
        const { topic_id, card_ids, hypotheses, questions = [] } = req.body || {};

        // 验证假设参数
        if (!Array.isArray(hypotheses) || hypotheses.length === 0) {
            return res.status(400).json({
                ok: false,
                error: "hypotheses_required",
                message: "hypotheses 必须是非空数组",
            });
        }

        const supabase = supabaseAdmin;

        // 转换假设格式（添加 ID）
        const targetHypotheses = hypotheses.map((text, i) => ({
            id: `H${i + 1}`,
            text: typeof text === "string" ? text : text.text,
            question_id: null,
        }));

        // 转换问题格式
        const docQuestions = questions.map((text, i) => ({
            id: `Q${i + 1}`,
            text: typeof text === "string" ? text : text.text,
        }));

        // 确定 Topic 信息
        let topicTitle = "未分类";
        let effectiveTopicId = topic_id;
        let allowedCardIds = null;

        if (card_ids && card_ids.length > 0) {
            // 模式 B：手动选卡片
            console.log("=== 假设验证 V2（手动选卡片模式）===");
            console.log("选中卡片数:", card_ids.length);

            // 验证卡片存在
            const { data: selectedCards, error } = await supabase
                .from("cards")
                .select("id, topic_id")
                .eq("user_id", userId)
                .eq("deleted", false)
                .in("id", card_ids);

            if (error) throw new Error(error.message);

            if (!selectedCards || selectedCards.length === 0) {
                return res.status(400).json({
                    ok: false,
                    error: "no_valid_cards",
                    message: "选中的卡片不存在或已被删除",
                });
            }

            // 从卡片推断 Topic（取最常见的）
            const topicCounts = {};
            selectedCards.forEach(c => {
                if (c.topic_id) {
                    topicCounts[c.topic_id] = (topicCounts[c.topic_id] || 0) + 1;
                }
            });
            const sortedTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]);
            effectiveTopicId = sortedTopics[0]?.[0] || null;

            allowedCardIds = card_ids;
        } else if (topic_id) {
            // 模式 A：按 Topic
            console.log("=== 假设验证 V2（按 Topic 模式）===");
            effectiveTopicId = topic_id;
        } else {
            return res.status(400).json({
                ok: false,
                error: "source_required",
                message: "请提供 topic_id 或 card_ids",
            });
        }

        // 获取 Topic 名称
        if (effectiveTopicId) {
            const { data: topic } = await supabase
                .from("topics")
                .select("title")
                .eq("id", effectiveTopicId)
                .single();
            if (topic) topicTitle = topic.title;
        }

        console.log("Topic:", topicTitle);
        console.log("Hypotheses:", targetHypotheses.length);

        // 获取需要同步的卡片
        let cardsToSync = [];
        if (allowedCardIds) {
            const { data } = await supabase
                .from("cards")
                .select("*")
                .eq("user_id", userId)
                .eq("deleted", false)
                .in("id", allowedCardIds);
            cardsToSync = data || [];
        } else if (effectiveTopicId) {
            const { data } = await supabase
                .from("cards")
                .select("*")
                .eq("user_id", userId)
                .eq("topic_id", effectiveTopicId)
                .eq("deleted", false);
            cardsToSync = data || [];
        }

        if (cardsToSync.length === 0) {
            return res.status(400).json({
                ok: false,
                error: "no_cards_available",
                message: "没有可用于验证的卡片",
            });
        }

        // 确保 Vector Store 存在（用户 + Topic 独立的 Vector Store）
        const storeKey = `${userId}:${effectiveTopicId || "default"}`;
        let vectorStoreId;

        try {
            const storeRecord = await ensureVectorStoreForUserTopic(userId, topicTitle);
            vectorStoreId = storeRecord.vector_store_id;
            console.log("Vector Store ID:", vectorStoreId);

            // 同步卡片到 Vector Store
            console.log(`🔄 同步 ${cardsToSync.length} 张卡片...`);
            await syncCardsToVectorStoreForUserTopic(cardsToSync, userId, topicTitle);
            console.log("✅ 同步完成");
        } catch (storeError) {
            console.error("Vector Store 操作失败:", storeError);
            throw new Error(`Vector Store 操作失败: ${storeError.message}`);
        }

        // 调用 Hypothesis Evaluator
        console.log("调用 runHypothesisEvaluatorV2...");
        console.log("allowedCardIds:", allowedCardIds ? allowedCardIds.length : "无限制");

        const result = await runHypothesisEvaluatorV2({
            topicTitle,
            docQuestions,
            targetHypotheses,
            vectorStoreId,
            allowedCardIds,
        });
        console.log("✅ 验证完成");

        res.json({
            ok: true,
            result,
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
            original_error: errorMessage,
        });
    }
});

export default hypothesesRouterV2;
