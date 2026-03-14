// ========= Conversations + Chat Messages CRUD =========

/**
 * Create a new conversation.
 */
export async function createConversation(supabase, userId, title = null) {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId, title })
    .select()
    .single();
  if (error) throw new Error(`创建会话失败: ${error.message}`);
  return data;
}

/**
 * List conversations for a user, newest first.
 */
export async function listConversations(supabase, userId, { limit = 50, offset = 0 } = {}) {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(`获取会话列表失败: ${error.message}`);
  return data || [];
}

/**
 * Get a single conversation by ID.
 */
export async function getConversation(supabase, userId, conversationId) {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .single();
  if (error) throw new Error(`获取会话失败: ${error.message}`);
  return data;
}

/**
 * Update conversation (title, updated_at).
 */
export async function updateConversation(supabase, userId, conversationId, updates) {
  const { data, error } = await supabase
    .from("conversations")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw new Error(`更新会话失败: ${error.message}`);
  return data;
}

/**
 * Delete a conversation (cascade deletes messages).
 */
export async function deleteConversation(supabase, userId, conversationId) {
  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", conversationId)
    .eq("user_id", userId);
  if (error) throw new Error(`删除会话失败: ${error.message}`);
}

// ── Chat Messages ──

/**
 * Add a message to a conversation.
 */
export async function addMessage(supabase, conversationId, { role, content, message_type = "text", metadata = {} }) {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({ conversation_id: conversationId, role, content, message_type, metadata })
    .select()
    .single();
  if (error) throw new Error(`添加消息失败: ${error.message}`);

  // Touch conversation updated_at + last_message_at
  const { error: touchError } = await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString(), last_message_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (touchError) {
    // Non-fatal: message is already saved.
    console.warn(`[conversations] touch failed: ${touchError.message}`);
  }

  return data;
}

/**
 * List messages for a conversation, newest-first order.
 * The caller receives newest messages first; downstream functions
 * (buildHistoryWithinBudget) handle chronological reordering.
 */
export async function listMessages(supabase, conversationId, { limit = 200 } = {}) {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`获取消息失败: ${error.message}`);
  return data || [];
}

/**
 * Batch add multiple messages (for persisting tool round-trips).
 */
export async function addMessages(supabase, conversationId, messages) {
  if (!messages || messages.length === 0) return [];

  const rows = messages.map((m) => ({
    conversation_id: conversationId,
    role: m.role,
    content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    message_type: m.message_type || "text",
    metadata: m.metadata || {},
  }));

  const { data, error } = await supabase
    .from("chat_messages")
    .insert(rows)
    .select();
  if (error) throw new Error(`批量添加消息失败: ${error.message}`);

  // Touch conversation
  const { error: touchError } = await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString(), last_message_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (touchError) {
    // Non-fatal: batch messages are already saved.
    console.warn(`[conversations] touch failed: ${touchError.message}`);
  }

  return data || [];
}
