// ========= 卡片相关路由 V2（支持云端存储和认证）=========

import express from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/auth.mjs";
import {
  addCard,
  listCards,
  findCardById,
  updateCard,
  softDeleteCard,
  searchCards,
  getCardsByIds,
} from "../../services/supabase/cards.mjs";
import {
  runAgent1,
  runSearchAgent,
  generateDocumentTitle,
  runFullDocumentCardGenerator,
} from "../../services/agents.mjs";

const router = express.Router();

// 所有卡片路由都需要认证
router.use(requireAuth);

// 配置 multer 用于文件上传（内存存储）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB 限制
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/markdown",
    ];

    if (
      allowedTypes.includes(file.mimetype) ||
      file.originalname.match(/\.(pdf|doc|docx|txt|md)$/i)
    ) {
      cb(null, true);
    } else {
      cb(new Error("不支持的文件类型。仅支持 PDF、Word、文本文件。"));
    }
  },
});

/**
 * POST /api/v2/cards/capture
 * 捕获一个新的知识卡片
 */
router.post("/capture", async (req, res) => {
  try {
    const {
      snippet,
      imageData,
      preSummary,
      sourceName,
      sourceUrl,
      topicTitle,
      topic_title,
      material_id,
      raw_snippet,
      locator,
      note,
    } = req.body || {};

    // 校验必填字段：必须有文本或图片
    if (
      (!snippet || typeof snippet !== "string" || !snippet.trim()) &&
      !imageData
    ) {
      return res.status(400).json({
        ok: false,
        error: "snippet_or_image_required",
      });
    }

    // 兼容 topicTitle (camelCase) 和 topic_title (snake_case)
    const finalTopicTitle = topic_title || topicTitle || null;

    // 如果是来自阅读器的直接建卡（有 raw_snippet，跳过 AI 处理）
    if (raw_snippet && !snippet && !imageData) {
      const card = await addCard(req.supabase, req.user.id, {
        summary: null,
        key_points: [],
        source_name: sourceName || null,
        source_url: sourceUrl || null,
        raw_snippet: raw_snippet.trim(),
        note: note || null,
        topic_title: finalTopicTitle,
        material_id: material_id || null,
        locator: locator || null,
      });
      return res.json({ ok: true, card });
    }

    // 1) 调 Agent1（支持文本和图片）
    const agentResult = await runAgent1({
      snippet: (snippet || "").trim(),
      imageData: imageData || null,
      preSummary,
      sourceName,
      sourceUrl,
    });

    console.log("=== Agent1 返回的结果 ===");
    console.log(JSON.stringify(agentResult, null, 2));

    // 2) 保存卡片到 Supabase
    const card = await addCard(req.supabase, req.user.id, {
      summary: agentResult.summary,
      key_points: agentResult.key_points || [],
      source_name: agentResult.source_name || null,
      source_url: agentResult.source_url || null,
      raw_snippet:
        agentResult.raw_snippet || (snippet && snippet.trim()) || "[图片卡片]",
      topic_title: finalTopicTitle,
      image_url: agentResult.image_url || imageData || null,
      material_id: material_id || null,
      locator: locator || null,
    });

    console.log("=== 保存的卡片 ===");
    console.log(JSON.stringify(card, null, 2));

    res.json({
      ok: true,
      card,
    });
  } catch (error) {
    console.error("capture card error:", error);
    res.status(500).json({
      ok: false,
      error: "capture_error",
      detail: String(error),
    });
  }
});

/**
 * GET /api/v2/cards
 * 获取卡片列表
 */
router.get("/", async (req, res) => {
  try {
    const { topic_title, topic_id, include_deleted, material_id, limit } = req.query;

    const includeDeleted = include_deleted === "true";
    const cards = await listCards(req.supabase, req.user.id, {
      topic_title: topic_title || undefined,
      topic_id: topic_id || undefined,
      material_id: material_id || undefined,
      limit: limit ? parseInt(limit) : undefined,
      includeDeleted,
    });

    res.json({
      ok: true,
      cards,
    });
  } catch (error) {
    console.error("获取卡片列表失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

/**
 * POST /api/v2/cards/search
 * 语义搜索卡片
 */
router.post("/search", async (req, res) => {
  try {
    const { query, topic_title, use_ai } = req.body || {};

    if (!query || !query.trim()) {
      return res.status(400).json({
        ok: false,
        error: "query is required",
      });
    }

    // 获取候选卡片
    const all = await listCards(req.supabase, req.user.id, {
      topic_title: topic_title || undefined,
      includeDeleted: false,
    });

    if (!all.length) {
      return res.json({ ok: true, cards: [], card_ids: [] });
    }

    // 如果启用 AI 搜索，使用 Search Agent
    if (use_ai) {
      const cardIds = await runSearchAgent({ query, cards: all });
      const idSet = new Set(cardIds);
      const selected = all.filter((c) => idSet.has(c.id));
      const ordered = cardIds
        .map((id) => selected.find((c) => c.id === id))
        .filter(Boolean);

      return res.json({
        ok: true,
        cards: ordered,
        card_ids: cardIds,
      });
    }

    // 否则使用数据库全文搜索
    const cards = await searchCards(req.supabase, req.user.id, query, {
      topic_title: topic_title || undefined,
    });

    res.json({
      ok: true,
      cards,
      card_ids: cards.map((c) => c.id),
    });
  } catch (error) {
    console.error("语义搜索失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

/**
 * GET /api/v2/cards/:id
 * 获取单个卡片详情
 */
router.get("/:id", async (req, res) => {
  try {
    const card = await findCardById(req.supabase, req.params.id);

    if (!card) {
      return res.status(404).json({
        ok: false,
        error: "卡片不存在",
      });
    }

    res.json({
      ok: true,
      card,
    });
  } catch (error) {
    console.error("获取卡片失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

/**
 * PATCH /api/v2/cards/:id
 * 更新卡片的部分字段
 */
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const updatedCard = await updateCard(
      req.supabase,
      req.user.id,
      id,
      updates
    );

    if (!updatedCard) {
      return res.status(404).json({
        ok: false,
        error: "卡片不存在",
      });
    }

    res.json({
      ok: true,
      card: updatedCard,
    });
  } catch (error) {
    console.error("更新卡片失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

/**
 * DELETE /api/v2/cards/:id
 * 软删除卡片
 */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await softDeleteCard(req.supabase, id);

    if (!deleted) {
      return res.status(404).json({
        ok: false,
        error: "卡片不存在",
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("删除卡片失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

/**
 * POST /api/v2/cards/generate-title
 * 根据卡片 ID 列表生成文档标题
 */
router.post("/generate-title", async (req, res) => {
  try {
    const { card_ids } = req.body || {};

    if (!Array.isArray(card_ids) || card_ids.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "card_ids 必须是非空数组",
      });
    }

    const cards = await getCardsByIds(req.supabase, card_ids);

    if (cards.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "未找到指定的卡片",
      });
    }

    const title = await generateDocumentTitle(cards);

    res.json({
      ok: true,
      title,
    });
  } catch (error) {
    console.error("生成文档标题失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

/**
 * POST /api/v2/cards/upload-file
 * 上传文件到 OpenAI Files API
 */
router.post("/upload-file", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: "file_required",
        message: "请选择要上传的文件",
      });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "api_key_not_set",
        message: "OpenAI API Key 未配置",
      });
    }

    console.log("=== 文件上传开始 ===");
    console.log("文件名:", req.file.originalname);
    console.log("文件大小:", req.file.size, "bytes");
    console.log("用户:", req.user.email);

    const formData = new FormData();
    formData.append("purpose", "user_data");
    formData.append(
      "file",
      new Blob([req.file.buffer], { type: req.file.mimetype }),
      req.file.originalname
    );

    const uploadResponse = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("❌ OpenAI Files API 错误:", uploadResponse.status, errorText);
      throw new Error(
        `OpenAI Files API 错误: ${uploadResponse.status} - ${errorText}`
      );
    }

    const openaiFile = await uploadResponse.json();

    console.log("✅ 文件上传成功, File ID:", openaiFile.id);

    res.json({
      ok: true,
      file_id: openaiFile.id,
      filename: openaiFile.filename || req.file.originalname,
    });
  } catch (error) {
    console.error("❌ 文件上传失败：", error);
    res.status(500).json({
      ok: false,
      error: "upload_error",
      detail: String(error.message || error),
    });
  }
});

/**
 * POST /api/v2/cards/generate-from-document
 * 按整文件生成卡片
 */
router.post("/generate-from-document", async (req, res) => {
  try {
    const { file_id, source_name, source_url, topic_title } = req.body || {};

    if (!file_id) {
      return res.status(400).json({
        ok: false,
        error: "file_id_required",
        message: "file_id 是必填字段",
      });
    }

    console.log("=== 整文件生成卡片请求 ===");
    console.log("文件 ID:", file_id);
    console.log("用户:", req.user.email);

    const cardDataArray = await runFullDocumentCardGenerator({
      fileId: file_id,
      sourceName: source_name,
      sourceUrl: source_url,
      topic: topic_title,
    });

    if (!cardDataArray || cardDataArray.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "no_cards_generated",
        message: "未能从文档中生成任何卡片",
      });
    }

    // 保存每个卡片
    const savedCards = [];
    for (const cardData of cardDataArray) {
      const card = await addCard(req.supabase, req.user.id, {
        summary: cardData.summary,
        key_points: cardData.key_points || [],
        source_name: cardData.source_name || null,
        source_url: cardData.source_url || null,
        raw_snippet: cardData.raw_snippet || "",
        topic_title: topic_title || null,
      });
      savedCards.push(card);
    }

    console.log(`✅ 成功生成并保存 ${savedCards.length} 张卡片`);

    res.json({
      ok: true,
      cards: savedCards,
      count: savedCards.length,
    });
  } catch (error) {
    console.error("❌ 整文件生成卡片失败：", error);
    res.status(500).json({
      ok: false,
      error: "generate_from_document_error",
      detail: String(error.message || error),
    });
  }
});

export default router;







