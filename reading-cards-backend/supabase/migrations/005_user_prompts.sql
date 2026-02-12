-- ============================================
-- Reading Clipper - Prompt 配置表迁移
-- 版本：005
-- ============================================

-- ============================================
-- 1. User Prompts 表（用户自定义 Prompt）
-- ============================================
CREATE TABLE IF NOT EXISTS user_prompts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Prompt 标识
    prompt_key TEXT NOT NULL,  -- 如 'card_summary', 'hypothesis_evaluate' 等
    
    -- Prompt 内容
    template TEXT NOT NULL,
    
    -- 元数据
    description TEXT,
    variables JSONB DEFAULT '[]'::jsonb,  -- 模板变量列表
    
    -- 时间戳
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 每个用户每个 key 只能有一个自定义 prompt
    UNIQUE(user_id, prompt_key)
);

-- User Prompts 表索引
CREATE INDEX IF NOT EXISTS idx_user_prompts_user_id ON user_prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_prompts_key ON user_prompts(prompt_key);

-- ============================================
-- 2. RLS (Row Level Security) 策略
-- ============================================

-- 启用 RLS
ALTER TABLE user_prompts ENABLE ROW LEVEL SECURITY;

-- User Prompts RLS 策略
CREATE POLICY "Users can view their own prompts"
    ON user_prompts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own prompts"
    ON user_prompts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own prompts"
    ON user_prompts FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own prompts"
    ON user_prompts FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- 3. 自动更新 updated_at 触发器
-- ============================================
CREATE TRIGGER update_user_prompts_updated_at
    BEFORE UPDATE ON user_prompts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
