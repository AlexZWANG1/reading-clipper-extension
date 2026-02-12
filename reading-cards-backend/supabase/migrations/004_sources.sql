-- ============================================
-- Reading Clipper - 信息源表迁移
-- 版本：004
-- ============================================

-- ============================================
-- 1. Sources 表（信息源管理）
-- ============================================
CREATE TABLE IF NOT EXISTS sources (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- 基本信息
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    importance_level INTEGER NOT NULL CHECK (importance_level IN (1, 2, 3)),
    
    -- 附加信息
    url TEXT,
    region TEXT,
    description TEXT,
    
    -- 状态
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    
    -- 时间戳
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sources 表索引
CREATE INDEX IF NOT EXISTS idx_sources_user_id ON sources(user_id);
CREATE INDEX IF NOT EXISTS idx_sources_category ON sources(category);
CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status);
CREATE INDEX IF NOT EXISTS idx_sources_importance ON sources(importance_level);

-- ============================================
-- 2. RLS (Row Level Security) 策略
-- ============================================

-- 启用 RLS
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;

-- Sources RLS 策略
CREATE POLICY "Users can view their own sources"
    ON sources FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own sources"
    ON sources FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sources"
    ON sources FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sources"
    ON sources FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- 3. 自动更新 updated_at 触发器
-- ============================================
CREATE TRIGGER update_sources_updated_at
    BEFORE UPDATE ON sources
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
