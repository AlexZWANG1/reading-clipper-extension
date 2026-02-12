// ========= Topic 列表路由 =========
// 从已有卡片中提取所有 topic_title，供前端下拉选择使用

import express from "express";
import { listCards } from "../services/cards.mjs";

const topicsRouter = express.Router();

/**
 * GET /api/topics
 * 获取所有已有的 topic 列表
 * 
 * 返回：
 * {
 *   ok: true,
 *   topics: string[]   // 去重、排序后的 topic 列表
 * }
 */
topicsRouter.get("/", (req, res) => {
  try {
    // 获取所有未删除的卡片
    const cards = listCards({ includeDeleted: false });
    
    // 提取所有 topic_title，去重
    const topicsSet = new Set();
    for (const card of cards) {
      if (card.topic_title && card.topic_title.trim()) {
        topicsSet.add(card.topic_title.trim());
      }
    }
    
    // 转为数组并排序
    const topics = Array.from(topicsSet).sort();
    
    res.json({ ok: true, topics });
  } catch (error) {
    console.error("获取 topic 列表失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误"
    });
  }
});

export default topicsRouter;


