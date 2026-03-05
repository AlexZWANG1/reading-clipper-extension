// ========= 卡片存储服务（Supabase 版本）=========
// 使用 Supabase/PostgreSQL 存储，支持多用户

import { supabaseAdmin } from "../../config/supabase.mjs";

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

  const { data, error } = await supabase
    .from("cards")
    .insert({
      user_id: userId,
      topic_id: topicId,
      summary: cardData.summary || "",
      key_points: cardData.key_points || [],
      raw_snippet: cardData.raw_snippet || "",
      note: cardData.note || "",
      source_name: cardData.source_name || null,
      source_url: cardData.source_url || null,
      image_url: cardData.image_url || null,
      material_id: cardData.material_id || null,
      locator: cardData.locator || null,
      deleted: false,
    })
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

  return {
    id: dbCard.id,
    summary: dbCard.summary,
    key_points: dbCard.key_points || [],
    source_name: dbCard.source_name,
    source_url: dbCard.source_url,
    raw_snippet: dbCard.raw_snippet,
    topic_title: dbCard.topic?.title || null,
    topic_id: dbCard.topic_id,
    note: dbCard.note || "",
    image_url: dbCard.image_url,
    created_at: dbCard.created_at,
    updated_at: dbCard.updated_at,
    deleted: dbCard.deleted,
  };
}







