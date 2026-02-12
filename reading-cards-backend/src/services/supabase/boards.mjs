// ========= 思维画板相关 Supabase 服务 =========

/**
 * 获取用户的所有思维画板
 */
export async function listBoards(supabase, userId) {
    const { data, error } = await supabase
        .from("thinking_boards")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

    if (error) throw error;
    return data || [];
}

/**
 * 根据 ID 获取单个画板
 */
export async function getBoardById(supabase, boardId) {
    const { data, error } = await supabase
        .from("thinking_boards")
        .select("*")
        .eq("id", boardId)
        .single();

    if (error && error.code !== "PGRST116") throw error;
    return data;
}

/**
 * 创建新画板
 */
export async function createBoard(supabase, userId, { title, description, topic_id }) {
    const { data, error } = await supabase
        .from("thinking_boards")
        .insert({
            user_id: userId,
            title: title || "未命名画板",
            description: description || null,
            topic_id: topic_id || null,
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * 获取或创建 Topic 关联的画板 (幂等操作)
 * 如果该 Topic 已有画板则返回，否则创建新的
 */
export async function getOrCreateBoardByTopic(supabase, userId, topicId, topicTitle) {
    // 先尝试查找已存在的画板
    const { data: existing, error: findError } = await supabase
        .from("thinking_boards")
        .select("*")
        .eq("topic_id", topicId)
        .single();

    // 如果找到了，直接返回
    if (existing && !findError) {
        return existing;
    }

    // 没找到，创建新的
    // 使用 upsert 确保并发安全 (基于 topic_id 唯一约束)
    const { data, error } = await supabase
        .from("thinking_boards")
        .upsert({
            user_id: userId,
            topic_id: topicId,
            title: topicTitle || "未命名画板",
        }, {
            onConflict: 'topic_id',
            ignoreDuplicates: false,
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * 更新画板
 */
export async function updateBoard(supabase, boardId, updates) {
    const { data, error } = await supabase
        .from("thinking_boards")
        .update(updates)
        .eq("id", boardId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * 删除画板（级联删除所有节点和边）
 */
export async function deleteBoard(supabase, boardId) {
    const { error } = await supabase
        .from("thinking_boards")
        .delete()
        .eq("id", boardId);

    if (error) throw error;
    return true;
}

// ========= 节点 (Nodes) 操作 =========

/**
 * 获取画板的所有节点
 */
export async function listNodes(supabase, boardId) {
    const { data, error } = await supabase
        .from("board_nodes")
        .select(`
      *,
      card:cards(id, summary, key_points, source_name, source_url, raw_snippet)
    `)
        .eq("board_id", boardId)
        .order("created_at", { ascending: true });

    if (error) throw error;
    return data || [];
}

/**
 * 创建节点
 */
export async function createNode(supabase, boardId, {
    node_type,
    content,
    card_id,
    position_x,
    position_y,
    width,
    height,
}) {
    const { data, error } = await supabase
        .from("board_nodes")
        .insert({
            board_id: boardId,
            node_type,
            content: content || {},
            card_id: card_id || null,
            position_x: position_x ?? 0,
            position_y: position_y ?? 0,
            width: width ?? 200,
            height: height ?? 100,
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * 更新节点
 */
export async function updateNode(supabase, nodeId, updates) {
    const { data, error } = await supabase
        .from("board_nodes")
        .update(updates)
        .eq("id", nodeId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * 删除节点
 */
export async function deleteNode(supabase, nodeId) {
    const { error } = await supabase
        .from("board_nodes")
        .delete()
        .eq("id", nodeId);

    if (error) throw error;
    return true;
}

// ========= 边 (Edges) 操作 =========

/**
 * 获取画板的所有边
 */
export async function listEdges(supabase, boardId) {
    const { data, error } = await supabase
        .from("board_edges")
        .select("*")
        .eq("board_id", boardId)
        .order("created_at", { ascending: true });

    if (error) throw error;
    return data || [];
}

/**
 * 创建边
 */
export async function createEdge(supabase, boardId, {
    source_node_id,
    target_node_id,
    relation_type,
    ai_confidence,
    ai_generated,
}) {
    const { data, error } = await supabase
        .from("board_edges")
        .insert({
            board_id: boardId,
            source_node_id,
            target_node_id,
            relation_type: relation_type || "related",
            ai_confidence: ai_confidence ?? null,
            ai_generated: ai_generated ?? false,
            user_confirmed: false,
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * 更新边
 */
export async function updateEdge(supabase, edgeId, updates) {
    const { data, error } = await supabase
        .from("board_edges")
        .update(updates)
        .eq("id", edgeId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * 删除边
 */
export async function deleteEdge(supabase, edgeId) {
    const { error } = await supabase
        .from("board_edges")
        .delete()
        .eq("id", edgeId);

    if (error) throw error;
    return true;
}

/**
 * 获取完整画板数据（包含节点和边）
 */
export async function getFullBoard(supabase, boardId) {
    const board = await getBoardById(supabase, boardId);
    if (!board) return null;

    const nodes = await listNodes(supabase, boardId);
    const edges = await listEdges(supabase, boardId);

    return {
        ...board,
        nodes,
        edges,
    };
}
