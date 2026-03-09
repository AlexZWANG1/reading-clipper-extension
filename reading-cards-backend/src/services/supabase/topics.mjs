// ========= Topic 存储服务（Supabase 版本）=========

/**
 * 获取用户的所有 topic
 * @param {Object} supabase - 带用户上下文的 Supabase 客户端
 * @param {string} userId - 用户 ID
 * @returns {Array} topic 数组
 */
export async function listTopics(supabase, userId) {
  const { data, error } = await supabase
    .from("topics")
    .select("*")
    .eq("user_id", userId)
    .order("title", { ascending: true });

  if (error) {
    console.error("获取 topic 列表失败:", error);
    throw new Error(`获取 topic 列表失败: ${error.message}`);
  }

  return data || [];
}

/**
 * 获取用户的所有 topic 标题（简化版，用于下拉选择）
 * @param {Object} supabase - 带用户上下文的 Supabase 客户端
 * @param {string} userId - 用户 ID
 * @returns {string[]} topic 标题数组
 */
export async function listTopicTitles(supabase, userId) {
  const topics = await listTopics(supabase, userId);
  return topics.map((t) => t.title);
}

/**
 * 创建新 topic
 * @param {Object} supabase - 带用户上下文的 Supabase 客户端
 * @param {string} userId - 用户 ID
 * @param {Object} topicData - topic 数据
 * @returns {Object} 创建后的 topic 对象
 */
export async function createTopic(supabase, userId, topicData) {
  const insertData = {
    user_id: userId,
    title: topicData.title,
    description: topicData.description || null,
    color: topicData.color || "#6366f1",
  };

  // 新增研究字段（可选）
  if (topicData.status !== undefined) insertData.status = topicData.status;
  if (topicData.research_context !== undefined) insertData.research_context = topicData.research_context;
  if (topicData.priority !== undefined) insertData.priority = topicData.priority;

  const { data, error } = await supabase
    .from("topics")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    // 检查是否是重复 title 错误
    if (error.code === "23505") {
      throw new Error(`Topic "${topicData.title}" 已存在`);
    }
    console.error("创建 topic 失败:", error);
    throw new Error(`创建 topic 失败: ${error.message}`);
  }

  return data;
}

/**
 * 获取单个 topic
 * @param {Object} supabase - 带用户上下文的 Supabase 客户端
 * @param {string} topicId - topic ID
 * @returns {Object|null} topic 对象或 null
 */
export async function getTopicById(supabase, topicId) {
  const { data, error } = await supabase
    .from("topics")
    .select("*")
    .eq("id", topicId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    console.error("获取 topic 失败:", error);
    throw new Error(`获取 topic 失败: ${error.message}`);
  }

  return data;
}

/**
 * 根据标题获取 topic
 * @param {Object} supabase - 带用户上下文的 Supabase 客户端
 * @param {string} userId - 用户 ID
 * @param {string} title - topic 标题
 * @returns {Object|null} topic 对象或 null
 */
export async function getTopicByTitle(supabase, userId, title) {
  const { data, error } = await supabase
    .from("topics")
    .select("*")
    .eq("user_id", userId)
    .eq("title", title)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    console.error("获取 topic 失败:", error);
    throw new Error(`获取 topic 失败: ${error.message}`);
  }

  return data;
}

/**
 * 更新 topic
 * @param {Object} supabase - 带用户上下文的 Supabase 客户端
 * @param {string} topicId - topic ID
 * @param {Object} updates - 要更新的字段
 * @returns {Object|null} 更新后的 topic，找不到返回 null
 */
export async function updateTopic(supabase, topicId, updates) {
  const updateData = {};

  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.color !== undefined) updateData.color = updates.color;

  // 新增研究字段支持
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.research_context !== undefined) updateData.research_context = updates.research_context;
  if (updates.priority !== undefined) updateData.priority = updates.priority;

  const { data, error } = await supabase
    .from("topics")
    .update(updateData)
    .eq("id", topicId)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    if (error.code === "23505") {
      throw new Error(`Topic 标题已存在`);
    }
    console.error("更新 topic 失败:", error);
    throw new Error(`更新 topic 失败: ${error.message}`);
  }

  return data;
}

/**
 * 删除 topic
 * @param {Object} supabase - 带用户上下文的 Supabase 客户端
 * @param {string} topicId - topic ID
 * @returns {boolean} 是否成功删除
 */
export async function deleteTopic(supabase, topicId) {
  const { data, error } = await supabase
    .from("topics")
    .delete()
    .eq("id", topicId)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return false;
    }
    console.error("删除 topic 失败:", error);
    throw new Error(`删除 topic 失败: ${error.message}`);
  }

  return !!data;
}

/**
 * 获取 topic 下的卡片数量
 * @param {Object} supabase - 带用户上下文的 Supabase 客户端
 * @param {string} topicId - topic ID
 * @returns {number} 卡片数量
 */
export async function getTopicCardCount(supabase, topicId) {
  const { count, error } = await supabase
    .from("cards")
    .select("*", { count: "exact", head: true })
    .eq("topic_id", topicId)
    .eq("deleted", false);

  if (error) {
    console.error("获取卡片数量失败:", error);
    return 0;
  }

  return count || 0;
}

/**
 * 获取用户的所有 topic 及其卡片数量
 * @param {Object} supabase - 带用户上下文的 Supabase 客户端
 * @param {string} userId - 用户 ID
 * @returns {Array} 带有卡片数量的 topic 数组
 */
export async function listTopicsWithCardCount(supabase, userId) {
  const topics = await listTopics(supabase, userId);

  // 获取每个 topic 的卡片数量
  const topicsWithCount = await Promise.all(
    topics.map(async (topic) => {
      const cardCount = await getTopicCardCount(supabase, topic.id);
      return {
        ...topic,
        card_count: cardCount,
      };
    })
  );

  return topicsWithCount;
}







