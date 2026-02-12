// ========= 卡片相关路由 =========

import express from "express";
import multer from "multer";
import { addCard, listCards, findCardById, updateCard, softDeleteCard } from "../services/cards.mjs";
import { runAgent1, runSearchAgent, generateDocumentTitle, runFullDocumentCardGenerator } from "../services/agents.mjs";
import { matchSourceForCard } from "../services/sourceMatcher.mjs";

const router = express.Router();

// 配置 multer 用于文件上传（内存存储）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB 限制
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown'
    ];

    if (allowedTypes.includes(file.mimetype) ||
      file.originalname.match(/\.(pdf|doc|docx|txt|md)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型。仅支持 PDF、Word、文本文件。'));
    }
  }
});

/**
 * POST /api/cards/capture
 * 捕获一个新的知识卡片
 * 
 * 请求体：
 * {
 *   snippet: string,         // 必填：原始划线文本
 *   preSummary?: string,     // 可选：用户提供的一句话总结
 *   sourceName?: string,     // 可选：来源名称
 *   sourceUrl?: string,      // 可选：来源 URL
 *   topicTitle?: string      // 可选：采集时的主题名
 * }
 * 
 * 流程：
 * 1. 调用 Agent1（Reading Highlight Summarizer stored prompt）
 * 2. 解析返回的 JSON/Markdown，得到 summary / key_points / source / raw_snippet
 * 3. 保存为 Card
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
      source_id,
      title
    } = req.body || {};

    // 校验必填字段：必须有文本或图片
    if ((!snippet || typeof snippet !== "string" || !snippet.trim()) && !imageData) {
      return res.status(400).json({
        ok: false,
        error: "snippet_or_image_required"
      });
    }

    // 兼容 topicTitle (camelCase) 和 topic_title (snake_case)
    const finalTopicTitle = topic_title || topicTitle || null;

    // 1) 调 Agent1（支持文本和图片）
    const agentResult = await runAgent1({
      snippet: (snippet || "").trim(),
      imageData: imageData || null,
      preSummary,
      sourceName,
      sourceUrl
    });

    // ========= 调试日志 =========
    console.log("=== Agent1 返回的结果 ===");
    console.log(JSON.stringify(agentResult, null, 2));
    console.log("=========================");
    // ============================================

    // 2) 自动匹配信息源
    const finalSourceUrl = agentResult.source_url || sourceUrl || null;
    let finalSourceId = source_id || null;

    // 如果没有显式指定 source_id，尝试自动匹配
    if (!finalSourceId) {
      finalSourceId = await matchSourceForCard({
        sourceUrl: finalSourceUrl,
        sourceName: agentResult.source_name || sourceName,
        summary: agentResult.summary
      });

      if (finalSourceId) {
        console.log(`✅ 自动匹配到信息源: ${finalSourceId}`);
      }
    }

    // 3) 落卡片
    const card = addCard({
      source_id: finalSourceId,
      title: title || null,
      summary: agentResult.summary,
      key_points: agentResult.key_points || [],
      source_name: agentResult.source_name || null,
      source_url: finalSourceUrl,
      raw_snippet: agentResult.raw_snippet || (snippet && snippet.trim()) || "[图片卡片]",
      topic_title: finalTopicTitle,
      image_url: agentResult.image_url || imageData || null
    });

    // ========= 调试日志 =========
    console.log("=== 最终保存的卡片 ===");
    console.log(JSON.stringify(card, null, 2));
    console.log("=====================");
    // ============================================

    res.json({
      ok: true,
      card
    });
  } catch (error) {
    console.error("capture card error:", error);
    res.status(500).json({
      ok: false,
      error: "capture_error",
      detail: String(error)
    });
  }
});

/**
 * GET /api/cards
 * 获取卡片列表
 * 
 * 查询参数：
 * - topic_title?: string（按 topic_title 精确筛选）
 * - include_deleted?: "true"（是否包含已删除的卡片，默认 false）
 */
router.get("/", (req, res) => {
  try {
    const { topic_title, source_id, include_deleted } = req.query;

    const includeDeleted = include_deleted === "true";
    const cards = listCards({
      topic_title: topic_title || undefined,
      source_id: source_id || undefined,
      includeDeleted
    });

    // 动态导入 findSourceById（避免循环依赖）
    import("../services/sources.mjs").then(({ findSourceById }) => {
      // 为每个卡片附加 source 详情
      const cardsWithSource = cards.map(card => {
        if (card.source_id) {
          const source = findSourceById(card.source_id);
          return {
            ...card,
            source: source ? {
              name: source.name,
              category: source.category,
              importance_level: source.importance_level,
              region: source.region,
              url: source.url
            } : null
          };
        }
        return { ...card, source: null };
      });

      res.json({
        ok: true,
        cards: cardsWithSource
      });
    }).catch(err => {
      // 如果导入失败，返回原始卡片
      console.error("无法加载 sources 模块:", err);
      res.json({
        ok: true,
        cards
      });
    });
  } catch (error) {
    console.error("获取卡片列表失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误"
    });
  }
});

/**
 * POST /api/cards/search
 * 语义搜索卡片（基于 Search Agent）
 * 
 * 请求体：
 * {
 *   query: string,           // 必填：用户的搜索查询
 *   topic_title?: string     // 可选：限定在某个 topic 内搜索
 * }
 * 
 * 返回：
 * {
 *   ok: true,
 *   cards: Card[],           // 按相关性排序的卡片数组
 *   card_ids: string[]       // Agent 返回的卡片 ID 列表（用于调试）
 * }
 */
router.post("/search", async (req, res) => {
  try {
    const { query, topic_title } = req.body || {};

    if (!query || !query.trim()) {
      return res.status(400).json({
        ok: false,
        error: "query is required"
      });
    }

    // 获取候选卡片（未删除的）
    const all = listCards({
      topic_title: topic_title || undefined,
      includeDeleted: false
    });

    if (!all.length) {
      return res.json({ ok: true, cards: [], card_ids: [] });
    }

    // 调用 Search Agent 进行语义搜索
    const cardIds = await runSearchAgent({ query, cards: all });

    // 根据返回的 ID 列表筛选并排序卡片
    const idSet = new Set(cardIds);
    const selected = all.filter((c) => idSet.has(c.id));

    // 按 Agent 返回的顺序排列
    const ordered = cardIds
      .map((id) => selected.find((c) => c.id === id))
      .filter(Boolean);

    res.json({
      ok: true,
      cards: ordered,
      card_ids: cardIds
    });
  } catch (error) {
    console.error("语义搜索失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误"
    });
  }
});

/**
 * PATCH /api/cards/:id
 * 更新卡片的部分字段
 * 
 * 请求体可以是部分字段：
 * {
 *   source_id?: string,
 *   title?: string,
 *   summary?: string,
 *   key_points?: string[],
 *   source_name?: string,
 *   source_url?: string,
 *   topic_title?: string,
 *   note?: string
 * }
 */
router.patch("/:id", (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const updatedCard = updateCard(id, updates);

    if (!updatedCard) {
      return res.status(404).json({
        ok: false,
        error: "卡片不存在"
      });
    }

    res.json({
      ok: true,
      card: updatedCard
    });
  } catch (error) {
    console.error("更新卡片失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误"
    });
  }
});

/**
 * DELETE /api/cards/:id
 * 软删除卡片（设置 deleted = true）
 */
router.delete("/:id", (req, res) => {
  try {
    const { id } = req.params;
    const deleted = softDeleteCard(id);

    if (!deleted) {
      return res.status(404).json({
        ok: false,
        error: "卡片不存在"
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("删除卡片失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误"
    });
  }
});

/**
 * POST /api/cards/:id/suggest-structure
 * （预留）Agent2（Document 层）的入口
 * 
 * 未来用于基于一组 cards 生成 document-level 结构
 * 当前返回占位数据
 */
router.post("/:id/suggest-structure", (req, res) => {
  try {
    const { id } = req.params;
    const card = findCardById(id);

    if (!card) {
      return res.status(404).json({
        ok: false,
        error: "卡片不存在"
      });
    }

    // TODO: 未来在这里调用 Agent2
    res.json({
      ok: true,
      suggested: {
        doc_hint: "（示例结构文档）",
        section_hint: "（示例小节）"
      },
      message: "这是占位数据，未来会由 Agent2（Document 层）生成文档结构"
    });
  } catch (error) {
    console.error("生成结构建议失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误"
    });
  }
});

/**
 * POST /api/cards/generate-title
 * 根据卡片 ID 列表生成文档标题
 * 
 * 请求体：
 * {
 *   card_ids: string[]  // 卡片 ID 数组
 * }
 * 
 * 返回：
 * {
 *   ok: true,
 *   title: string  // 生成的标题（不超过 10 个字）
 * }
 */
router.post("/generate-title", async (req, res) => {
  try {
    const { card_ids } = req.body || {};

    if (!Array.isArray(card_ids) || card_ids.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "card_ids 必须是非空数组"
      });
    }

    // 根据 card_ids 获取卡片
    const allCards = listCards({ includeDeleted: false });
    const cards = card_ids
      .map(id => allCards.find(c => c.id === id))
      .filter(Boolean);

    if (cards.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "未找到指定的卡片"
      });
    }

    // 调用 AI 生成标题
    const title = await generateDocumentTitle(cards);

    res.json({
      ok: true,
      title
    });
  } catch (error) {
    console.error("生成文档标题失败：", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误"
    });
  }
});

/**
 * POST /api/cards/upload-file
 * 上传文件到 OpenAI Files API
 * 
 * 使用 multipart/form-data 格式
 * 文件字段名：file
 * 
 * 返回：
 * {
 *   ok: true,
 *   file_id: string,
 *   filename: string
 * }
 */
router.post("/upload-file", upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: "file_required",
        message: "请选择要上传的文件"
      });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "api_key_not_set",
        message: "OpenAI API Key 未配置"
      });
    }

    console.log("=== 文件上传开始 ===");
    console.log("文件名:", req.file.originalname);
    console.log("文件大小:", req.file.size, "bytes");
    console.log("文件类型:", req.file.mimetype);
    console.log("=====================");

    // 使用原生 fetch 上传文件到 OpenAI Files API（与项目其他 API 调用保持一致）
    const formData = new FormData();
    formData.append('purpose', 'user_data');
    formData.append('file', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname);

    const uploadResponse = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: formData
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("❌ OpenAI Files API 错误:", uploadResponse.status, errorText);
      throw new Error(`OpenAI Files API 错误: ${uploadResponse.status} - ${errorText}`);
    }

    const openaiFile = await uploadResponse.json();

    console.log("✅ 文件上传成功");
    console.log("OpenAI File ID:", openaiFile.id);
    console.log("Filename:", openaiFile.filename);

    res.json({
      ok: true,
      file_id: openaiFile.id,
      filename: openaiFile.filename || req.file.originalname
    });
  } catch (error) {
    console.error("❌ 文件上传失败：", error);
    res.status(500).json({
      ok: false,
      error: "upload_error",
      detail: String(error.message || error)
    });
  }
});

/**
 * POST /api/cards/generate-from-document
 * 按整文件生成卡片
 * 
 * 请求体：
 * {
 *   file_id: string,          // 必填：OpenAI 文件 ID
 *   source_name?: string,     // 可选：来源名称
 *   source_url?: string,      // 可选：来源 URL
 *   topic_title?: string      // 可选：主题
 * }
 * 
 * 返回：
 * {
 *   ok: true,
 *   cards: Card[],
 *   count: number
 * }
 */
router.post("/generate-from-document", async (req, res) => {
  try {
    const {
      file_id,
      source_name,
      source_url,
      topic_title
    } = req.body || {};

    if (!file_id) {
      return res.status(400).json({
        ok: false,
        error: "file_id_required",
        message: "file_id 是必填字段"
      });
    }

    console.log("=== 整文件生成卡片请求 ===");
    console.log("文件 ID:", file_id);
    console.log("来源:", source_name || "(none)");
    console.log("主题:", topic_title || "(none)");
    console.log("==========================");

    // 调用整文件生成卡片函数
    const cardDataArray = await runFullDocumentCardGenerator({
      fileId: file_id,
      sourceName: source_name,
      sourceUrl: source_url,
      topic: topic_title
    });

    if (!cardDataArray || cardDataArray.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "no_cards_generated",
        message: "未能从文档中生成任何卡片"
      });
    }

    // 保存每个卡片
    const savedCards = [];
    for (const cardData of cardDataArray) {
      const card = addCard({
        summary: cardData.summary,
        key_points: cardData.key_points || [],
        source_name: cardData.source_name || null,
        source_url: cardData.source_url || null,
        raw_snippet: cardData.raw_snippet || "",
        topic_title: topic_title || null
      });
      savedCards.push(card);
    }

    console.log(`✅ 成功生成并保存 ${savedCards.length} 张卡片`);

    res.json({
      ok: true,
      cards: savedCards,
      count: savedCards.length
    });
  } catch (error) {
    console.error("❌ 整文件生成卡片失败：", error);
    res.status(500).json({
      ok: false,
      error: "generate_from_document_error",
      detail: String(error.message || error)
    });
  }
});

export default router;
