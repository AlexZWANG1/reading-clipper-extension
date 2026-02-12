-- ============================================
-- Reading Clipper - 思维画板表迁移
-- 版本：006
-- AI-Assisted Issue Tree / Thinking Canvas
-- ============================================

-- ============================================
-- 1. Thinking Boards 表（思维画板）
-- ============================================
CREATE TABLE IF NOT EXISTS thinking_boards (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- 基本信息
    title TEXT NOT NULL,
    description TEXT,
    
    -- 时间戳
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Thinking Boards 表索引
CREATE INDEX IF NOT EXISTS idx_thinking_boards_user_id ON thinking_boards(user_id);
CREATE INDEX IF NOT EXISTS idx_thinking_boards_created_at ON thinking_boards(created_at DESC);

-- ============================================
-- 2. Board Nodes 表（画板节点）
-- ============================================
CREATE TABLE IF NOT EXISTS board_nodes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    board_id UUID NOT NULL REFERENCES thinking_boards(id) ON DELETE CASCADE,
    
    -- 节点类型: 'question', 'hypothesis', 'card_ref'
    node_type TEXT NOT NULL CHECK (node_type IN ('question', 'hypothesis', 'card_ref')),
    
    -- 内容（Question/Hypothesis 的文字内容）
    content JSONB DEFAULT '{}'::jsonb,
    
    -- Card 引用（如果 node_type = 'card_ref'）
    card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
    
    -- 位置信息
    position_x FLOAT DEFAULT 0,
    position_y FLOAT DEFAULT 0,
    width FLOAT DEFAULT 200,
    height FLOAT DEFAULT 100,
    
    -- 时间戳
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Board Nodes 表索引
CREATE INDEX IF NOT EXISTS idx_board_nodes_board_id ON board_nodes(board_id);
CREATE INDEX IF NOT EXISTS idx_board_nodes_card_id ON board_nodes(card_id);
CREATE INDEX IF NOT EXISTS idx_board_nodes_type ON board_nodes(node_type);

-- ============================================
-- 3. Board Edges 表（关联关系）
-- ============================================
CREATE TABLE IF NOT EXISTS board_edges (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    board_id UUID NOT NULL REFERENCES thinking_boards(id) ON DELETE CASCADE,
    
    -- 连接的节点
    source_node_id UUID NOT NULL REFERENCES board_nodes(id) ON DELETE CASCADE,
    target_node_id UUID NOT NULL REFERENCES board_nodes(id) ON DELETE CASCADE,
    
    -- 关系类型: 'answers' (Hypo answers Question), 'supports', 'refutes'
    relation_type TEXT NOT NULL CHECK (relation_type IN ('answers', 'supports', 'refutes', 'related')),
    
    -- AI 相关字段
    ai_confidence FLOAT,  -- AI 判断的置信度 (0-1)
    ai_generated BOOLEAN DEFAULT FALSE,  -- 是否由 AI 自动生成
    
    -- 用户是否确认了 AI 的建议
    user_confirmed BOOLEAN DEFAULT FALSE,
    
    -- 时间戳
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 防止重复边
    UNIQUE(board_id, source_node_id, target_node_id)
);

-- Board Edges 表索引
CREATE INDEX IF NOT EXISTS idx_board_edges_board_id ON board_edges(board_id);
CREATE INDEX IF NOT EXISTS idx_board_edges_source ON board_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_board_edges_target ON board_edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_board_edges_relation ON board_edges(relation_type);

-- ============================================
-- 4. RLS (Row Level Security) 策略
-- ============================================

-- 启用 RLS
ALTER TABLE thinking_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_edges ENABLE ROW LEVEL SECURITY;

-- Thinking Boards RLS 策略
CREATE POLICY "Users can view their own thinking boards"
    ON thinking_boards FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own thinking boards"
    ON thinking_boards FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own thinking boards"
    ON thinking_boards FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own thinking boards"
    ON thinking_boards FOR DELETE
    USING (auth.uid() = user_id);

-- Board Nodes RLS 策略（通过 board 的 user_id 验证）
CREATE POLICY "Users can view nodes on their boards"
    ON board_nodes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM thinking_boards 
            WHERE thinking_boards.id = board_nodes.board_id 
            AND thinking_boards.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create nodes on their boards"
    ON board_nodes FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM thinking_boards 
            WHERE thinking_boards.id = board_nodes.board_id 
            AND thinking_boards.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update nodes on their boards"
    ON board_nodes FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM thinking_boards 
            WHERE thinking_boards.id = board_nodes.board_id 
            AND thinking_boards.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete nodes on their boards"
    ON board_nodes FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM thinking_boards 
            WHERE thinking_boards.id = board_nodes.board_id 
            AND thinking_boards.user_id = auth.uid()
        )
    );

-- Board Edges RLS 策略（通过 board 的 user_id 验证）
CREATE POLICY "Users can view edges on their boards"
    ON board_edges FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM thinking_boards 
            WHERE thinking_boards.id = board_edges.board_id 
            AND thinking_boards.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create edges on their boards"
    ON board_edges FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM thinking_boards 
            WHERE thinking_boards.id = board_edges.board_id 
            AND thinking_boards.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update edges on their boards"
    ON board_edges FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM thinking_boards 
            WHERE thinking_boards.id = board_edges.board_id 
            AND thinking_boards.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete edges on their boards"
    ON board_edges FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM thinking_boards 
            WHERE thinking_boards.id = board_edges.board_id 
            AND thinking_boards.user_id = auth.uid()
        )
    );

-- ============================================
-- 5. 自动更新 updated_at 触发器
-- ============================================
CREATE TRIGGER update_thinking_boards_updated_at
    BEFORE UPDATE ON thinking_boards
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_board_nodes_updated_at
    BEFORE UPDATE ON board_nodes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_board_edges_updated_at
    BEFORE UPDATE ON board_edges
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
