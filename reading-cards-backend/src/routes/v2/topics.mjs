// ========= Topic 相关路由 V2（支持云端存储和认证）=========

import express from "express";
import { requireAuth } from "../../middleware/auth.mjs";
import {
  listTopics,
  listTopicTitles,
  listTopicsWithCardCount,
  createTopic,
  getTopicById,
  updateTopic,
  deleteTopic,
} from "../../services/supabase/topics.mjs";

const router = express.Router();

// 所有 Topic 路由都需要认证
router.use(requireAuth);

/**
 * GET /api/v2/topics
 * 获取所有已有的 topic 列表
 *
 * 查询参数：
 * - with_count=true  返回每个 topic 的卡片数量
 * - titles_only=true 只返回标题数组（用于下拉选择）
 * - status=active    按状态过滤（active/investigating/resolved/archived）
 */
router.get("/", async (req, res) => {
  try {
    const { with_count, titles_only, status } = req.query;

    // 只返回标题数组
    if (titles_only === "true") {
      const titles = await listTopicTitles(req.supabase, req.user.id);
      return res.json({ ok: true, topics: titles });
    }

    // 返回带卡片数量的完整信息
    if (with_count === "true") {
      const topics = await listTopicsWithCardCount(req.supabase, req.user.id);
      // 如果有 status 过滤，在这里过滤
      const filtered = status ? topics.filter(t => t.status === status) : topics;
      return res.json({ ok: true, topics: filtered });
    }

    // 默认返回完整列表
    const topics = await listTopics(req.supabase, req.user.id);
    // 如果有 status 过滤，在这里过滤
    const filtered = status ? topics.filter(t => t.status === status) : topics;
    res.json({ ok: true, topics: filtered });
  } catch (error) {
    console.error("获取 topic 列表失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

/**
 * POST /api/v2/topics
 * 创建新 topic
 *
 * 请求体：
 * {
 *   title: string,
 *   description?: string,
 *   color?: string,
 *   status?: string,
 *   research_context?: string,
 *   priority?: string
 * }
 */
router.post("/", async (req, res) => {
  try {
    const { title, description, color, status, research_context, priority } = req.body || {};

    if (!title || !title.trim()) {
      return res.status(400).json({
        ok: false,
        error: "title_required",
        message: "Topic 标题不能为空",
      });
    }

    if (title.trim().length > 200) {
      return res.status(400).json({ ok: false, error: "title_too_long", message: "标题不能超过200字符" });
    }

    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return res.status(400).json({ ok: false, error: "invalid_color", message: "颜色格式必须为 #RRGGBB" });
    }

    const topic = await createTopic(req.supabase, req.user.id, {
      title: title.trim(),
      description,
      color,
      status,
      research_context,
      priority,
    });

    res.json({
      ok: true,
      topic,
    });
  } catch (error) {
    console.error("创建 topic 失败：", error);

    // 检查是否是重复标题错误
    if (error.message.includes("已存在")) {
      return res.status(400).json({
        ok: false,
        error: "title_exists",
        message: error.message,
      });
    }

    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

/**
 * GET /api/v2/topics/:id
 * 获取单个 topic 详情
 */
router.get("/:id", async (req, res) => {
  try {
    const topic = await getTopicById(req.supabase, req.params.id);

    if (!topic) {
      return res.status(404).json({
        ok: false,
        error: "Topic 不存在",
      });
    }

    res.json({
      ok: true,
      topic,
    });
  } catch (error) {
    console.error("获取 topic 失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

/**
 * PATCH /api/v2/topics/:id
 * 更新 topic
 * 
 * 请求体：
 * {
 *   title?: string,
 *   description?: string,
 *   color?: string
 * }
 */
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const updatedTopic = await updateTopic(req.supabase, id, updates);

    if (!updatedTopic) {
      return res.status(404).json({
        ok: false,
        error: "Topic 不存在",
      });
    }

    res.json({
      ok: true,
      topic: updatedTopic,
    });
  } catch (error) {
    console.error("更新 topic 失败：", error);

    if (error.message.includes("已存在")) {
      return res.status(400).json({
        ok: false,
        error: "title_exists",
        message: error.message,
      });
    }

    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

/**
 * DELETE /api/v2/topics/:id
 * 删除 topic
 * 
 * 注意：删除 topic 不会删除关联的卡片，卡片的 topic_id 会被设为 null
 */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await deleteTopic(req.supabase, id);

    if (!deleted) {
      return res.status(404).json({
        ok: false,
        error: "Topic 不存在",
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("删除 topic 失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

// ========= Topic-Board 关联 =========

import {
  getOrCreateBoardByTopic,
  getFullBoard
} from "../../services/supabase/boards.mjs";

/**
 * GET /api/v2/topics/:id/board
 * 获取或创建该 Topic 关联的思维画板 (幂等操作)
 * 
 * 返回完整画板数据（含节点和边）
 */
router.get("/:id/board", async (req, res) => {
  try {
    const topicId = req.params.id;

    // 先获取 Topic 信息
    const topic = await getTopicById(req.supabase, topicId);
    if (!topic) {
      return res.status(404).json({
        ok: false,
        error: "Topic 不存在",
      });
    }

    // 获取或创建关联的画板
    const board = await getOrCreateBoardByTopic(
      req.supabase,
      req.user.id,
      topicId,
      topic.title
    );

    // 获取完整画板数据（含节点和边）
    const fullBoard = await getFullBoard(req.supabase, board.id, req.user.id);

    res.json({
      ok: true,
      board: fullBoard,
      topic,
    });
  } catch (error) {
    console.error("获取 Topic 画板失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

export default router;







