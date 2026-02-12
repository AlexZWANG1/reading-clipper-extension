-- ============================================
-- 初始邀请码和管理员设置
-- 在执行完 002_user_settings_and_invites.sql 后运行
-- ============================================

-- 1. 创建初始邀请码
INSERT INTO invite_codes (code, max_uses, notes, is_active)
VALUES 
    ('BETA-2026-001', 10, '首批测试用户邀请码', TRUE),
    ('BETA-2026-002', 5, '备用邀请码', TRUE),
    ('VIP-INVITE-001', 1, 'VIP单次邀请码', TRUE);

-- 2. 设置管理员用户（根据需要修改邮箱）
-- 注意：请将 'your-admin-email@example.com' 替换为实际的管理员邮箱
-- UPDATE auth.users 
-- SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
-- WHERE email = 'your-admin-email@example.com';

-- 3. 查看已创建的邀请码
SELECT code, max_uses, current_uses, is_active, notes, created_at 
FROM invite_codes;
