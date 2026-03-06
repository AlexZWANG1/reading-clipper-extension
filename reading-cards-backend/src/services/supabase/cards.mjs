// ========= 卡片存储服务（Supabase 版本）=========
// 使用 Supabase/PostgreSQL 存储，支持多用户

const VALID_FACT_OR_VIEW = new Set(["fact", "view"]);
const DEFAULT_FACT_OR_VIEW = "fact";
const FALLBACK_TITLE_MAX_LEN = 64;
const FALLBACK_SUMMARY_MAX_LEN = 240;

/**
 * 添加新卡片
 * @param {Object} supabase - 带用户上下文的 Supabase 客户端
 * @param {string} userId - 用户 ID
 * @param {Object} cardData - 卡片数据
 * @returns {Object} 创建后的完整卡片对象
 */
export async function addCard(supabase, userId, cardData) {
  // 如果提供了 topic_title，先获取或创建对应的 topic
  let topicId = null;
  if (cardData.topic_title) {
    const { data: topic, error: topicError } = await supabase.rpc(
      "get_or_create_topic",
      {
        p_user_id: userId,
        p_title: cardData.topic_title,
      }
    );

    if (topicError) {
      console.error("获取/创建 topic 失败:", topicError);
    } else {
      topicId = topic;
    }
  }

  const sanitizedRawSnippet =
    typeof cardData.raw_snippet === "string" ? cardData.raw_snippet.trim() : "";
  const resolvedSummary = buildSummary(cardData.summary, sanitizedRawSnippet);
  const resolvedTitle = buildTitle({
    title: cardData.title,
    summary: resolvedSummary,
    raw_snippet: sanitizedRawSnippet,
    source_name: cardData.source_name,
  });
  const resolvedFactOrView =
    normalizeFactOrView(cardData.fact_or_view) ?? DEFAULT_FACT_OR_VIEW;
  const resolvedChunkId =
    cardData.chunk_id || cardData.locator?.chunk_id || null;

  const insertData = {
    user_id: userId,
    topic_id: topicId,
    summary: resolvedSummary,
    key_points: cardData.key_points || [],
    raw_snippet: sanitizedRawSnippet,
    note: cardData.note || "",
    source_name: cardData.source_name || null,
    source_url: cardData.source_url || null,
    image_url: cardData.image_url || null,
    title: resolvedTitle,
    fact_or_view: resolvedFactOrView,
    material_id: cardData.material_id || null,
    chunk_id: resolvedChunkId,
    deleted: false,
  };
  if (cardData.locator !== undefined) {
    insertData.locator = cardData.locator;
  }

  const { data, error } = await supabase
    .from("cards")
    .insert(insertData)
    .select(
      `
      *,
      topic:topics(id, title)
    `
    )
    .single();

  if (error) {
    console.error("添加卡片失败:", error);
    throw new Error(`添加卡片失败: ${error.message}`);
  }

  // 转换为兼容旧格式的响应
  return transformCard(data);
}

/**
 * 列出卡片（支持筛选）
 * @param {Object} supabase - 带用户上下文的 Supabase 客户端
 * @param {string} userId - 用户 ID
 * @param {Object} filters - 筛选条件
 * @returns {Array} 卡片数组
 */
export async function listCards(supabase, userId, filters = {}) {
  let query = supabase
    .from("cards")
    .select(
      `
      *,
      topic:topics(id, title)
    `
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  // 默认不返回已删除的卡片
  if (filters.includeDeleted !== true) {
    query = query.eq("deleted", false);
  }

  // 按 topic_title 筛选
  if (filters.topic_title) {
    // 先查找 topic_id
    const { data: topic } = await supabase
      .from("topics")
      .select("id")
      .eq("user_id", userId)
      .eq("title", filters.topic_title)
      .single();

    if (topic) {
      query = query.eq("topic_id", topic.id);
    } else {
      // topic 不存在，返回空数组
      return [];
    }
  }

  // 按 topic_id 筛选
  if (filters.topic_id) {
    query = query.eq("topic_id", filters.topic_id);
  }

  // 按 material_id 筛选
  if (filters.material_id) {
    query = query.eq("material_id", filters.material_id);
  }

  // 限制数量
  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error("获取卡片列表失败:", error);
    throw new Error(`获取卡片列表失败: ${error.message}`);
  }

  return (data || []).map(transformCard);
}

/**
 * 根据 ID 查找卡片
 * @param {Object} supabase - 带用户上下文的 Supabase 客户端
 * @param {string} cardId - 卡片 ID
 * @returns {Object|null} 卡片对象或 null
 */
export async function findCardById(supabase, cardId) {
  const { data, error } = await supabase
    .from("cards")
    .select(
      `
      *,
      topic:topics(id, title)
    `
    )
    .eq("id", cardId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // 没有找到记录
      return null;
    }
    console.error("查找卡片失败:", error);
    throw new Error(`查找卡片失败: ${error.message}`);
  }

  return transformCard(data);
}

/**
 * 更新卡片
 * @param {Object} supabase - 带用户上下文的 Supabase 客户端
 * @param {string} userId - 用户 ID
 * @param {string} cardId - 卡片 ID
 * @param {Object} updates - 要更新的字段
 * @returns {Object|null} 更新后的卡片，找不到返回 null
 */
export async function updateCard(supabase, userId, cardId, updates) {
  const updateData = {};

  // 只更新提供的字段
  if (updates.summary !== undefined) updateData.summary = updates.summary;
  if (updates.key_points !== undefined) updateData.key_points = updates.key_points;
  if (updates.raw_snippet !== undefined) updateData.raw_snippet = updates.raw_snippet;
  if (updates.note !== undefined) updateData.note = updates.note;
  if (updates.source_name !== undefined) updateData.source_name = updates.source_name;
  if (updates.source_url !== undefined) updateData.source_url = updates.source_url;
  if (updates.image_url !== undefined) updateData.image_url = updates.image_url;
  if (updates.title !== undefined) updateData.title = sanitizeTitle(updates.title);
  if (updates.fact_or_view !== undefined) {
    updateData.fact_or_view = normalizeFactOrView(updates.fact_or_view);
  }
  if (updates.deleted !== undefined) updateData.deleted = updates.deleted;

  // 处理 topic_title 更新
  if (updates.topic_title !== undefined) {
    if (updates.topic_title) {
      const { data: topicId } = await supabase.rpc("get_or_create_topic", {
        p_user_id: userId,
        p_title: updates.topic_title,
      });
      updateData.topic_id = topicId;
    } else {
      updateData.topic_id = null;
    }
  }

  const { data, error } = await supabase
    .from("cards")
    .update(updateData)
    .eq("id", cardId)
    .select(
      `
      *,
      topic:topics(id, title)
    `
    )
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    console.error("更新卡片失败:", error);
    throw new Error(`更新卡片失败: ${error.message}`);
  }

  return transformCard(data);
}

/**
 * 软删除卡片
 * @param {Object} supabase - 带用户上下文的 Supabase 客户端
 * @param {string} cardId - 卡片 ID
 * @returns {boolean} 是否成功删除
 */
export async function softDeleteCard(supabase, cardId) {
  const { data, error } = await supabase
    .from("cards")
    .update({ deleted: true })
    .eq("id", cardId)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return false;
    }
    console.error("删除卡片失败:", error);
    throw new Error(`删除卡片失败: ${error.message}`);
  }

  return !!data;
}

/**
 * 搜索卡片（全文搜索）
 * @param {Object} supabase - 带用户上下文的 Supabase 客户端
 * @param {string} userId - 用户 ID
 * @param {string} query - 搜索关键词
 * @param {Object} filters - 额外筛选条件
 * @returns {Array} 匹配的卡片数组
 */
export async function searchCards(supabase, userId, query, filters = {}) {
  let dbQuery = supabase
    .from("cards")
    .select(
      `
      *,
      topic:topics(id, title)
    `
    )
    .eq("user_id", userId)
    .eq("deleted", false)
    .or(
      `summary.ilike.%${query}%,raw_snippet.ilike.%${query}%,note.ilike.%${query}%`
    )
    .order("created_at", { ascending: false })
    .limit(50);

  // 按 topic_title 筛选
  if (filters.topic_title) {
    const { data: topic } = await supabase
      .from("topics")
      .select("id")
      .eq("user_id", userId)
      .eq("title", filters.topic_title)
      .single();

    if (topic) {
      dbQuery = dbQuery.eq("topic_id", topic.id);
    } else {
      return [];
    }
  }

  const { data, error } = await dbQuery;

  if (error) {
    console.error("搜索卡片失败:", error);
    throw new Error(`搜索卡片失败: ${error.message}`);
  }

  return (data || []).map(transformCard);
}

/**
 * 根据 ID 列表批量获取卡片
 * @param {Object} supabase - 带用户上下文的 Supabase 客户端
 * @param {string[]} cardIds - 卡片 ID 数组
 * @returns {Array} 卡片数组
 */
export async function getCardsByIds(supabase, cardIds) {
  if (!cardIds || cardIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("cards")
    .select(
      `
      *,
      topic:topics(id, title)
    `
    )
    .in("id", cardIds);

  if (error) {
    console.error("批量获取卡片失败:", error);
    throw new Error(`批量获取卡片失败: ${error.message}`);
  }

  return (data || []).map(transformCard);
}

// ========= 工具函数 =========

/**
 * 将数据库格式转换为 API 响应格式（兼容旧版）
 */
function transformCard(dbCard) {
  if (!dbCard) return null;

  const transformedSummary = buildSummary(dbCard.summary, dbCard.raw_snippet);
  const transformedTitle =
    sanitizeTitle(dbCard.title) ??
    buildTitle({
      summary: transformedSummary,
      raw_snippet: dbCard.raw_snippet,
      source_name: dbCard.source_name,
    });

  return {
    id: dbCard.id,
    summary: transformedSummary,
    key_points: dbCard.key_points || [],
    source_name: dbCard.source_name,
    source_url: dbCard.source_url,
    raw_snippet: dbCard.raw_snippet,
    title: transformedTitle,
    fact_or_view: normalizeFactOrView(dbCard.fact_or_view) ?? DEFAULT_FACT_OR_VIEW,
    topic_title: dbCard.topic?.title || null,
    topic_id: dbCard.topic_id,
    material_id: dbCard.material_id ?? null,
    chunk_id: dbCard.chunk_id ?? dbCard.locator?.chunk_id ?? null,
    locator: dbCard.locator ?? null,
    note: dbCard.note || "",
    image_url: dbCard.image_url,
    created_at: dbCard.created_at,
    updated_at: dbCard.updated_at,
    deleted: dbCard.deleted,
  };
}

function sanitizeTitle(title) {
  if (title === undefined) return undefined;
  if (title === null) return null;
  const normalized = String(title).trim();
  return normalized || null;
}

function normalizeFactOrView(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim().toLowerCase();
  return VALID_FACT_OR_VIEW.has(normalized) ? normalized : null;
}

function normalizeText(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function truncateText(text, maxLen) {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1).trim()}…`;
}

function buildSummary(summary, rawSnippet) {
  const normalizedSummary = normalizeText(summary);
  if (normalizedSummary) {
    return truncateText(normalizedSummary, FALLBACK_SUMMARY_MAX_LEN);
  }
  const normalizedSnippet = normalizeText(rawSnippet);
  if (!normalizedSnippet) return "";
  return truncateText(normalizedSnippet, FALLBACK_SUMMARY_MAX_LEN);
}

function buildTitle({ title, summary, raw_snippet, source_name }) {
  const explicitTitle = sanitizeTitle(title);
  if (explicitTitle) {
    return truncateText(explicitTitle, FALLBACK_TITLE_MAX_LEN);
  }

  const fallbackCandidate =
    normalizeText(summary) ||
    normalizeText(raw_snippet) ||
    normalizeText(source_name);

  if (!fallbackCandidate) return null;
  return truncateText(fallbackCandidate, FALLBACK_TITLE_MAX_LEN);
}







