-- ============================================
-- Reading Clipper - 用户设置和邀请码系统
-- Migration: 002_user_settings_and_invites
-- ============================================

-- 启用加密扩展（用于API Key加密）
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 1. User Settings 表（用户配置）
-- ============================================
CREATE TABLE IF NOT EXISTS user_settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- 模型配置
    provider TEXT DEFAULT 'openai' NOT NULL, -- 'openai', 'anthropic', 'custom'
    model TEXT DEFAULT 'gpt-5.2' NOT NULL, -- 模型名称
    api_key_encrypted TEXT, -- 用户自己的API Key（加密存储）
    api_endpoint TEXT, -- 自定义API端点（仅当provider='custom'时使用）
    
    -- 时间戳
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 每个用户只有一条配置
    UNIQUE(user_id),
    
    -- 约束：provider必须是有效值
    CHECK (provider IN ('openai', 'anthropic', 'custom'))
);

-- User Settings 表索引
CREATE INDEX idx_user_settings_user_id ON user_settings(user_id);
CREATE INDEX idx_user_settings_provider ON user_settings(provider);

-- ============================================
-- 2. Invite Codes 表（邀请码）
-- ============================================
CREATE TABLE IF NOT EXISTS invite_codes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    code TEXT NOT NULL UNIQUE, -- 邀请码（唯一）
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- 创建者（管理员）
    used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- 使用者
    used_at TIMESTAMPTZ, -- 使用时间
    expires_at TIMESTAMPTZ, -- 过期时间（可选）
    max_uses INTEGER DEFAULT 1 NOT NULL, -- 最大使用次数
    current_uses INTEGER DEFAULT 0 NOT NULL, -- 当前使用次数
    is_active BOOLEAN DEFAULT TRUE NOT NULL, -- 是否激活
    notes TEXT, -- 备注（可选）
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 约束：使用次数不能超过最大次数
    CHECK (current_uses <= max_uses),
    CHECK (current_uses >= 0),
    CHECK (max_uses > 0)
);

-- Invite Codes 表索引
CREATE INDEX idx_invite_codes_code ON invite_codes(code);
CREATE INDEX idx_invite_codes_created_by ON invite_codes(created_by);
CREATE INDEX idx_invite_codes_used_by ON invite_codes(used_by);
CREATE INDEX idx_invite_codes_is_active ON invite_codes(is_active);
CREATE INDEX idx_invite_codes_expires_at ON invite_codes(expires_at);

-- ============================================
-- 3. RLS (Row Level Security) 策略
-- ============================================

-- 启用 RLS
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

-- User Settings RLS 策略
-- 用户只能查看和修改自己的设置
CREATE POLICY "Users can view their own settings"
    ON user_settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own settings"
    ON user_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
    ON user_settings FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own settings"
    ON user_settings FOR DELETE
    USING (auth.uid() = user_id);

-- Invite Codes RLS 策略
-- 公开读取：任何人都可以验证邀请码（但只能看到激活状态和是否可用）
CREATE POLICY "Anyone can view active invite codes for validation"
    ON invite_codes FOR SELECT
    USING (
        is_active = TRUE AND
        (expires_at IS NULL OR expires_at > NOW()) AND
        current_uses < max_uses
    );

-- 管理员可以查看所有邀请码
CREATE POLICY "Admins can view all invite codes"
    ON invite_codes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- 管理员可以创建邀请码
CREATE POLICY "Admins can create invite codes"
    ON invite_codes FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- 管理员可以更新邀请码
CREATE POLICY "Admins can update invite codes"
    ON invite_codes FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- 管理员可以删除邀请码
CREATE POLICY "Admins can delete invite codes"
    ON invite_codes FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.raw_user_meta_data->>'role' = 'admin'
        )
    );

-- ============================================
-- 4. 自动更新 updated_at 触发器
-- ============================================
CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. 辅助函数
-- ============================================

-- 验证邀请码是否可用
CREATE OR REPLACE FUNCTION validate_invite_code(p_code TEXT)
RETURNS TABLE (
    is_valid BOOLEAN,
    code_id UUID,
    message TEXT
) AS $$
DECLARE
    v_invite invite_codes%ROWTYPE;
BEGIN
    -- 查找邀请码
    SELECT * INTO v_invite
    FROM invite_codes
    WHERE code = p_code;
    
    -- 如果不存在
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, '邀请码不存在'::TEXT;
        RETURN;
    END IF;
    
    -- 检查是否激活
    IF NOT v_invite.is_active THEN
        RETURN QUERY SELECT FALSE, v_invite.id, '邀请码已禁用'::TEXT;
        RETURN;
    END IF;
    
    -- 检查是否过期
    IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < NOW() THEN
        RETURN QUERY SELECT FALSE, v_invite.id, '邀请码已过期'::TEXT;
        RETURN;
    END IF;
    
    -- 检查使用次数
    IF v_invite.current_uses >= v_invite.max_uses THEN
        RETURN QUERY SELECT FALSE, v_invite.id, '邀请码使用次数已用完'::TEXT;
        RETURN;
    END IF;
    
    -- 验证通过
    RETURN QUERY SELECT TRUE, v_invite.id, '邀请码有效'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 使用邀请码（增加使用次数并记录使用者）
CREATE OR REPLACE FUNCTION use_invite_code(
    p_code TEXT,
    p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_invite invite_codes%ROWTYPE;
BEGIN
    -- 查找邀请码
    SELECT * INTO v_invite
    FROM invite_codes
    WHERE code = p_code;
    
    -- 如果不存在
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- 验证是否可用（复用上面的逻辑）
    IF NOT v_invite.is_active THEN
        RETURN FALSE;
    END IF;
    
    IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < NOW() THEN
        RETURN FALSE;
    END IF;
    
    IF v_invite.current_uses >= v_invite.max_uses THEN
        RETURN FALSE;
    END IF;
    
    -- 更新邀请码
    UPDATE invite_codes
    SET 
        current_uses = current_uses + 1,
        used_by = p_user_id,
        used_at = NOW()
    WHERE id = v_invite.id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 获取或创建用户默认设置
CREATE OR REPLACE FUNCTION get_or_create_user_settings(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
    v_settings_id UUID;
BEGIN
    -- 先尝试查找
    SELECT id INTO v_settings_id
    FROM user_settings
    WHERE user_id = p_user_id;
    
    -- 如果不存在则创建默认设置
    IF v_settings_id IS NULL THEN
        INSERT INTO user_settings (user_id, provider, model)
        VALUES (p_user_id, 'openai', 'gpt-5.2')
        RETURNING id INTO v_settings_id;
    END IF;
    
    RETURN v_settings_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

