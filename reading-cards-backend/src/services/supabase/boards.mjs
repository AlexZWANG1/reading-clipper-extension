// ========= 思维画板 Supabase 服务 (V2 — Thinking Engine) =========

// ========= Board CRUD =========

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
 */
export async function getOrCreateBoardByTopic(supabase, userId, topicId, topicTitle) {
    const { data: existing, error: findError } = await supabase
        .from("thinking_boards")
        .select("*")
        .eq("topic_id", topicId)
        .single();

    if (existing && !findError) {
        return existing;
    }

    // Use INSERT instead of UPSERT to avoid constraint issues if unique index is missing
    const { data, error } = await supabase
        .from("thinking_boards")
        .insert({
            user_id: userId,
            topic_id: topicId,
            title: topicTitle || "未命名画板",
        })
        .select()
        .single();

    // If constraint exists and duplicate error, return existing
    if (error && error.code === '23505') {
        const { data: existingRetry } = await supabase
            .from("thinking_boards")
            .select("*")
            .eq("topic_id", topicId)
            .single();
        if (existingRetry) return existingRetry;
    }

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

// ========= 节点 (Nodes) 操作 — V2 =========

// 允许通过 API 设置的节点字段白名单
const NODE_FIELDS = [
    'node_type', 'content', 'card_id',
    'position_x', 'position_y', 'width', 'height',
    'parent_id',
    // Question
    'priority', 'status', 'decomposition_type',
    // Hypothesis
    'claim', 'hypo_state', 'confidence',
    // Evidence
    'evidence_type', 'strength',
];

/**
 * 从请求 body 中提取合法的节点字段
 */
function pickNodeFields(body) {
    const result = {};
    for (const key of NODE_FIELDS) {
        if (body[key] !== undefined) {
            result[key] = body[key];
        }
    }
    return result;
}

/**
 * 获取画板的所有节点 (含 Card join)
 */
export async function listNodes(supabase, boardId) {
    const { data, error } = await supabase
        .from("board_nodes")
        .select(`
      *,
      card:cards(id, summary, key_points, source_name, source_url, raw_snippet, image_url, material_id, locator, title, fact_or_view)
    `)
        .eq("board_id", boardId)
        .order("created_at", { ascending: true });

    if (error) throw error;
    return data || [];
}

/**
 * 创建节点 — V2
 * 支持所有新字段: parent_id, priority, status, claim, confidence, evidence_type, strength 等
 */
export async function createNode(supabase, boardId, body) {
    const fields = pickNodeFields(body);

    const insertData = {
        board_id: boardId,
        node_type: fields.node_type || 'question',
        content: fields.content || {},
        card_id: fields.card_id || null,
        position_x: fields.position_x ?? 0,
        position_y: fields.position_y ?? 0,
        width: fields.width ?? 200,
        height: fields.height ?? 100,
        parent_id: fields.parent_id || null,
        // Question
        priority: fields.priority || 'normal',
        status: fields.status || 'open',
        decomposition_type: fields.decomposition_type || null,
        // Hypothesis
        claim: fields.claim || null,
        hypo_state: fields.hypo_state || 'pending',
        confidence: fields.confidence ?? 0.0,
        // Evidence
        evidence_type: fields.evidence_type || null,
        strength: fields.strength ?? 3,
    };

    const { data, error } = await supabase
        .from("board_nodes")
        .insert(insertData)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * 更新节点 — V2 (增量 PATCH)
 * 只更新传入的字段
 */
export async function updateNode(supabase, nodeId, body) {
    const updates = pickNodeFields(body);
    if (Object.keys(updates).length === 0) {
        throw new Error('No valid fields to update');
    }

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
 * 删除节点 (DB 级联删除子节点 via parent_id ON DELETE CASCADE)
 */
export async function deleteNode(supabase, nodeId) {
    const { error } = await supabase
        .from("board_nodes")
        .delete()
        .eq("id", nodeId);

    if (error) throw error;
    return true;
}

// ========= 边 (Edges) 操作 — V2 =========

// 允许的 edge 字段
const EDGE_FIELDS = [
    'source_node_id', 'target_node_id', 'relation_type',
    'ai_confidence', 'ai_generated', 'user_confirmed', 'ai_explanation',
];

function pickEdgeFields(body) {
    const result = {};
    for (const key of EDGE_FIELDS) {
        if (body[key] !== undefined) {
            result[key] = body[key];
        }
    }
    return result;
}

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
 * 创建边 — V2
 * 支持 ai_explanation, relation_type = supports/refutes/neutral/conflicts/related
 */
export async function createEdge(supabase, boardId, body) {
    const fields = pickEdgeFields(body);

    const { data, error } = await supabase
        .from("board_edges")
        .insert({
            board_id: boardId,
            source_node_id: fields.source_node_id,
            target_node_id: fields.target_node_id,
            relation_type: fields.relation_type || "supports",
            ai_confidence: fields.ai_confidence ?? null,
            ai_generated: fields.ai_generated ?? false,
            user_confirmed: fields.user_confirmed ?? false,
            ai_explanation: fields.ai_explanation || null,
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * 更新边 — V2 (增量 PATCH)
 */
export async function updateEdge(supabase, edgeId, body) {
    const updates = pickEdgeFields(body);
    if (Object.keys(updates).length === 0) {
        throw new Error('No valid fields to update');
    }

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
export async function getFullBoard(supabase, boardId, userId) {
    let query = supabase
        .from("thinking_boards")
        .select("*")
        .eq("id", boardId);
    if (userId) query = query.eq("user_id", userId);
    const { data: board, error } = await query.single();
    if (error && error.code !== "PGRST116") throw error;
    if (!board) return null;

    const nodes = await listNodes(supabase, boardId);
    const edges = await listEdges(supabase, boardId);

    return {
        ...board,
        nodes,
        edges,
    };
}
