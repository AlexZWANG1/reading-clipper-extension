// ========= 文档存储服务（Supabase 版本）=========

/**
 * 添加新文档
 * @param {Object} supabase - 带用户上下文的 Supabase 客户端
 * @param {string} userId - 用户 ID
 * @param {Object} docData - 文档数据
 * @returns {Object} 创建后的完整文档对象
 */
export async function addDocument(supabase, userId, docData) {
  // 如果提供了 topic_title，先获取或创建对应的 topic
  let topicId = null;
  if (docData.topic_title) {
    const { data: topic } = await supabase.rpc("get_or_create_topic", {
      p_user_id: userId,
      p_title: docData.topic_title,
    });
    topicId = topic;
  }

  const { data, error } = await supabase
    .from("documents")
    .insert({
      user_id: userId,
      topic_id: topicId,
      title: docData.topic_title || docData.title || "未命名文档",
      doc_questions: docData.doc_questions || [],
      doc_hypotheses: docData.doc_hypotheses || [],
      story_units: docData.story_units || [],
    })
    .select(
      `
      *,
      topic:topics(id, title)
    `
    )
    .single();

  if (error) {
    console.error("添加文档失败:", error);
    throw new Error(`添加文档失败: ${error.message}`);
  }

  return transformDocument(data);
}

/**
 * 列出文档（支持筛选）
 * @param {Object} supabase - 带用户上下文的 Supabase 客户端
 * @param {string} userId - 用户 ID
 * @param {Object} filters - 筛选条件
 * @returns {Array} 文档数组
 */
export async function listDocuments(supabase, userId, filters = {}) {
  let query = supabase
    .from("documents")
    .select(
      `
      *,
      topic:topics(id, title)
    `
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  // 按 topic_title 筛选
  if (filters.topic_title) {
    const { data: topic } = await supabase
      .from("topics")
      .select("id")
      .eq("user_id", userId)
      .eq("title", filters.topic_title)
      .single();

    if (topic) {
      query = query.eq("topic_id", topic.id);
    } else {
      return [];
    }
  }

  // 按 topic_id 筛选
  if (filters.topic_id) {
    query = query.eq("topic_id", filters.topic_id);
  }

  const { data, error } = await query;

  if (error) {
    console.error("获取文档列表失败:", error);
    throw new Error(`获取文档列表失败: ${error.message}`);
  }

  return (data || []).map(transformDocument);
}

/**
 * 根据 ID 获取文档
 * @param {Object} supabase - 带用户上下文的 Supabase 客户端
 * @param {string} docId - 文档 ID
 * @returns {Object|null} 文档对象或 null
 */
export async function getDocument(supabase, docId) {
  const { data, error } = await supabase
    .from("documents")
    .select(
      `
      *,
      topic:topics(id, title)
    `
    )
    .eq("id", docId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    console.error("获取文档失败:", error);
    throw new Error(`获取文档失败: ${error.message}`);
  }

  return transformDocument(data);
}

/**
 * 更新文档
 * @param {Object} supabase - 带用户上下文的 Supabase 客户端
 * @param {string} userId - 用户 ID
 * @param {string} docId - 文档 ID
 * @param {Object} updates - 要更新的字段
 * @returns {Object|null} 更新后的文档，找不到返回 null
 */
export async function updateDocument(supabase, userId, docId, updates) {
  const updateData = {};

  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.doc_questions !== undefined)
    updateData.doc_questions = updates.doc_questions;
  if (updates.doc_hypotheses !== undefined)
    updateData.doc_hypotheses = updates.doc_hypotheses;
  if (updates.story_units !== undefined)
    updateData.story_units = updates.story_units;

  // 处理 topic_title 更新
  if (updates.topic_title !== undefined) {
    if (updates.topic_title) {
      const { data: topicId } = await supabase.rpc("get_or_create_topic", {
        p_user_id: userId,
        p_title: updates.topic_title,
      });
      updateData.topic_id = topicId;
      updateData.title = updates.topic_title;
    } else {
      updateData.topic_id = null;
    }
  }

  const { data, error } = await supabase
    .from("documents")
    .update(updateData)
    .eq("id", docId)
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
    console.error("更新文档失败:", error);
    throw new Error(`更新文档失败: ${error.message}`);
  }

  return transformDocument(data);
}

/**
 * 删除文档
 * @param {Object} supabase - 带用户上下文的 Supabase 客户端
 * @param {string} docId - 文档 ID
 * @returns {boolean} 是否成功删除
 */
export async function deleteDocument(supabase, docId) {
  const { data, error } = await supabase
    .from("documents")
    .delete()
    .eq("id", docId)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return false;
    }
    console.error("删除文档失败:", error);
    throw new Error(`删除文档失败: ${error.message}`);
  }

  return !!data;
}

// ========= 工具函数 =========

/**
 * 将数据库格式转换为 API 响应格式（兼容旧版）
 */
function transformDocument(dbDoc) {
  if (!dbDoc) return null;

  return {
    doc_id: dbDoc.id,
    topic_title: dbDoc.topic?.title || dbDoc.title,
    topic_id: dbDoc.topic_id,
    doc_questions: dbDoc.doc_questions || [],
    doc_hypotheses: dbDoc.doc_hypotheses || [],
    story_units: dbDoc.story_units || [],
    created_at: dbDoc.created_at,
    updated_at: dbDoc.updated_at,
  };
}







