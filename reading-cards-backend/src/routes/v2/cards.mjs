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
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
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
      cb(new Error("Unsupported file type. Only PDF, Word, TXT and Markdown are allowed."));
    }
  },
});

function normalizeOptionalText(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed || null;
}

async function resolveMaterialContext(supabase, userId, materialId) {
  if (!materialId) return null;

  const { data, error } = await supabase
    .from("materials")
    .select(
      `
      title,
      site_name,
      url,
      topic:topics(title)
    `
    )
    .eq("id", materialId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    source_name: normalizeOptionalText(data.site_name) || normalizeOptionalText(data.title),
    source_url: normalizeOptionalText(data.url),
    topic_title: normalizeOptionalText(data.topic?.title),
  };
}

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
      title,
      fact_or_view,
    } = req.body || {};

    const hasSnippet =
      snippet && typeof snippet === "string" && snippet.trim();
    const finalTopicTitle = normalizeOptionalText(topic_title) || normalizeOptionalText(topicTitle);
    const materialContext = await resolveMaterialContext(
      req.supabase,
      req.user.id,
      material_id
    );
    const resolvedTopicTitle = finalTopicTitle || materialContext?.topic_title || null;
    const resolvedSourceName =
      normalizeOptionalText(sourceName) || materialContext?.source_name || null;
    const resolvedSourceUrl =
      normalizeOptionalText(sourceUrl) || materialContext?.source_url || null;
    const resolvedNote = normalizeOptionalText(note) || null;
    const resolvedChunkId = locator?.chunk_id || null;

    // Reader fast path: save raw snippet directly without AI.
    if (raw_snippet && !hasSnippet && !imageData) {
      const card = await addCard(req.supabase, req.user.id, {
        summary: null,
        key_points: [],
        source_name: resolvedSourceName,
        source_url: resolvedSourceUrl,
        raw_snippet: raw_snippet.trim(),
        note: resolvedNote,
        topic_title: resolvedTopicTitle,
        title: title || null,
        fact_or_view: fact_or_view || null,
        material_id: material_id || null,
        chunk_id: resolvedChunkId,
        locator,
      });
      return res.json({ ok: true, card });
    }

    if (!hasSnippet && !imageData) {
      return res.status(400).json({
        ok: false,
        error: "snippet_or_image_required",
      });
    }

    const agentResult = await runAgent1({
      snippet: (snippet || "").trim(),
      imageData: imageData || null,
      preSummary,
      sourceName: resolvedSourceName,
      sourceUrl: resolvedSourceUrl,
    });

    const card = await addCard(req.supabase, req.user.id, {
      summary: agentResult.summary,
      key_points: agentResult.key_points || [],
      source_name: agentResult.source_name || resolvedSourceName || null,
      source_url: agentResult.source_url || resolvedSourceUrl || null,
      raw_snippet:
        agentResult.raw_snippet || (snippet && snippet.trim()) || "[image card]",
      note: resolvedNote,
      topic_title: resolvedTopicTitle,
      image_url: agentResult.image_url || imageData || null,
      title: agentResult.title || title || null,
      fact_or_view: agentResult.fact_or_view || fact_or_view || null,
      material_id: material_id || null,
      chunk_id: resolvedChunkId,
      locator,
    });

    res.json({ ok: true, card });
  } catch (error) {
    console.error("capture card error:", error);
    res.status(500).json({
      ok: false,
      error: "capture_error",
      detail: String(error),
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const { topic_title, topic_id, include_deleted, material_id, limit } = req.query;

    const includeDeleted = include_deleted === "true";
    const cards = await listCards(req.supabase, req.user.id, {
      topic_title: topic_title || undefined,
      topic_id: topic_id || undefined,
      material_id: material_id || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      includeDeleted,
    });

    res.json({ ok: true, cards });
  } catch (error) {
    console.error("list cards error:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "internal_server_error",
    });
  }
});

router.post("/search", async (req, res) => {
  try {
    const { query, topic_title, use_ai } = req.body || {};

    if (!query || !query.trim()) {
      return res.status(400).json({
        ok: false,
        error: "query_required",
      });
    }

    const all = await listCards(req.supabase, req.user.id, {
      topic_title: topic_title || undefined,
      includeDeleted: false,
    });

    if (!all.length) {
      return res.json({ ok: true, cards: [], card_ids: [] });
    }

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

    const cards = await searchCards(req.supabase, req.user.id, query, {
      topic_title: topic_title || undefined,
    });

    res.json({
      ok: true,
      cards,
      card_ids: cards.map((c) => c.id),
    });
  } catch (error) {
    console.error("search cards error:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "internal_server_error",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const card = await findCardById(req.supabase, req.params.id);

    if (!card) {
      return res.status(404).json({
        ok: false,
        error: "card_not_found",
      });
    }

    res.json({ ok: true, card });
  } catch (error) {
    console.error("get card error:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "internal_server_error",
    });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const updatedCard = await updateCard(req.supabase, req.user.id, id, updates);

    if (!updatedCard) {
      return res.status(404).json({
        ok: false,
        error: "card_not_found",
      });
    }

    res.json({ ok: true, card: updatedCard });
  } catch (error) {
    console.error("update card error:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "internal_server_error",
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await softDeleteCard(req.supabase, id);

    if (!deleted) {
      return res.status(404).json({
        ok: false,
        error: "card_not_found",
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("delete card error:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "internal_server_error",
    });
  }
});

router.post("/generate-title", async (req, res) => {
  try {
    const { card_ids } = req.body || {};

    if (!Array.isArray(card_ids) || card_ids.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "card_ids_required",
      });
    }

    const cards = await getCardsByIds(req.supabase, card_ids);
    if (cards.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "cards_not_found",
      });
    }

    const title = await generateDocumentTitle(cards);
    res.json({ ok: true, title });
  } catch (error) {
    console.error("generate title error:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "internal_server_error",
    });
  }
});

router.post("/upload-file", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: "file_required",
        message: "Please select a file to upload",
      });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "api_key_not_set",
        message: "OPENAI_API_KEY is not configured",
      });
    }

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
      throw new Error(`OpenAI Files API error: ${uploadResponse.status} - ${errorText}`);
    }

    const openaiFile = await uploadResponse.json();

    res.json({
      ok: true,
      file_id: openaiFile.id,
      filename: openaiFile.filename || req.file.originalname,
    });
  } catch (error) {
    console.error("upload file error:", error);
    res.status(500).json({
      ok: false,
      error: "upload_error",
      detail: String(error.message || error),
    });
  }
});

router.post("/generate-from-document", async (req, res) => {
  try {
    const { file_id, source_name, source_url, topic_title } = req.body || {};

    if (!file_id) {
      return res.status(400).json({
        ok: false,
        error: "file_id_required",
        message: "file_id is required",
      });
    }

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
        message: "No cards were generated from document",
      });
    }

    const savedCards = [];
    for (const cardData of cardDataArray) {
      const card = await addCard(req.supabase, req.user.id, {
        summary: cardData.summary,
        key_points: cardData.key_points || [],
        source_name: cardData.source_name || null,
        source_url: cardData.source_url || null,
        raw_snippet: cardData.raw_snippet || "",
        topic_title: cardData.topic || topic_title || null,
        title: cardData.title || null,
        fact_or_view: cardData.fact_or_view || null,
      });
      savedCards.push(card);
    }

    res.json({
      ok: true,
      cards: savedCards,
      count: savedCards.length,
    });
  } catch (error) {
    console.error("generate from document error:", error);
    res.status(500).json({
      ok: false,
      error: "generate_from_document_error",
      detail: String(error.message || error),
    });
  }
});

export default router;
