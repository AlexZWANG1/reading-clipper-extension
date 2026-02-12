-- ============================================
-- Reading Clipper - 数据库初始化迁移
-- 使用 Supabase/PostgreSQL
-- ============================================

-- 启用必要的扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. Topics 表（用户的主题/话题）
-- ============================================
CREATE TABLE IF NOT EXISTS topics (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#6366f1', -- 主题颜色，用于 UI 展示
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 同一用户下 topic title 唯一
    UNIQUE(user_id, title)
);

-- Topics 表索引
CREATE INDEX idx_topics_user_id ON topics(user_id);
CREATE INDEX idx_topics_title ON topics(title);

-- ============================================
-- 2. Cards 表（知识卡片）
-- ============================================
CREATE TABLE IF NOT EXISTS cards (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,
    
    -- 卡片内容
    summary TEXT NOT NULL,
    key_points JSONB DEFAULT '[]'::jsonb, -- string[]
    raw_snippet TEXT, -- 原始划线内容
    note TEXT DEFAULT '', -- 用户批注
    
    -- 来源信息
    source_name TEXT,
    source_url TEXT,
    
    -- 图片（可选）
    image_url TEXT,
    
    -- 状态
    deleted BOOLEAN DEFAULT FALSE,
    
    -- 时间戳
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cards 表索引
CREATE INDEX idx_cards_user_id ON cards(user_id);
CREATE INDEX idx_cards_topic_id ON cards(topic_id);
CREATE INDEX idx_cards_deleted ON cards(deleted);
CREATE INDEX idx_cards_created_at ON cards(created_at DESC);

-- 全文搜索索引（用于搜索卡片内容）
CREATE INDEX idx_cards_search ON cards USING gin(
    to_tsvector('english', coalesce(summary, '') || ' ' || coalesce(raw_snippet, '') || ' ' || coalesce(note, ''))
);

-- ============================================
-- 3. Documents 表（文档/故事线）
-- ============================================
CREATE TABLE IF NOT EXISTS documents (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,
    
    -- 文档元信息
    title TEXT NOT NULL,
    
    -- 文档级问题和假设（JSONB 存储）
    doc_questions JSONB DEFAULT '[]'::jsonb, -- Question[]
    doc_hypotheses JSONB DEFAULT '[]'::jsonb, -- Hypothesis[]
    
    -- 故事单元（JSONB 存储）
    story_units JSONB DEFAULT '[]'::jsonb, -- StoryUnit[]
    
    -- 时间戳
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents 表索引
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_topic_id ON documents(topic_id);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);

-- ============================================
-- 4. RLS (Row Level Security) 策略
-- 确保用户只能访问自己的数据
-- ============================================

-- 启用 RLS
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Topics RLS 策略
CREATE POLICY "Users can view their own topics"
    ON topics FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own topics"
    ON topics FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own topics"
    ON topics FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own topics"
    ON topics FOR DELETE
    USING (auth.uid() = user_id);

-- Cards RLS 策略
CREATE POLICY "Users can view their own cards"
    ON cards FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own cards"
    ON cards FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cards"
    ON cards FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cards"
    ON cards FOR DELETE
    USING (auth.uid() = user_id);

-- Documents RLS 策略
CREATE POLICY "Users can view their own documents"
    ON documents FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own documents"
    ON documents FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents"
    ON documents FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents"
    ON documents FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- 5. 自动更新 updated_at 触发器
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_topics_updated_at
    BEFORE UPDATE ON topics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cards_updated_at
    BEFORE UPDATE ON cards
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 6. 辅助函数
-- ============================================

-- 获取或创建 topic（根据 title）
CREATE OR REPLACE FUNCTION get_or_create_topic(
    p_user_id UUID,
    p_title TEXT
)
RETURNS UUID AS $$
DECLARE
    v_topic_id UUID;
BEGIN
    -- 先尝试查找
    SELECT id INTO v_topic_id
    FROM topics
    WHERE user_id = p_user_id AND title = p_title;
    
    -- 如果不存在则创建
    IF v_topic_id IS NULL THEN
        INSERT INTO topics (user_id, title)
        VALUES (p_user_id, p_title)
        RETURNING id INTO v_topic_id;
    END IF;
    
    RETURN v_topic_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;







