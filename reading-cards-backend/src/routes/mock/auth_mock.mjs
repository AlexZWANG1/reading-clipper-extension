
import express from 'express';

const router = express.Router();

// 模拟用户
const MOCK_USER = {
    id: 'local-user-id',
    email: 'local@example.com',
    user_metadata: {
        name: 'Local User'
    },
    created_at: new Date().toISOString()
};

// 模拟 Session
const MOCK_SESSION = {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365, // 1年过期
    user: MOCK_USER
};

/**
 * POST /api/auth/login
 */
router.post('/login', (req, res) => {
    console.log('🔒 [MockAuth] Login request');
    res.json({
        ok: true,
        user: MOCK_USER,
        session: MOCK_SESSION
    });
});

/**
 * POST /api/auth/register
 * Local mode: 跳过邀请码验证
 */
router.post('/register', (req, res) => {
    console.log('🔒 [MockAuth] Register request');
    // Local mode下忽略邀请码验证
    const { email, password, name, invite_code } = req.body || {};
    console.log('🔒 [MockAuth] Local mode - invite_code ignored:', invite_code);
    res.json({
        ok: true,
        message: "Local mode registration simulated",
        user: MOCK_USER,
        session: MOCK_SESSION
    });
});

/**
 * POST /api/auth/refresh
 */
router.post('/refresh', (req, res) => {
    // console.log('🔒 [MockAuth] Refresh token request');
    res.json({
        ok: true,
        session: MOCK_SESSION
    });
});

/**
 * GET /api/auth/me
 */
router.get('/me', (req, res) => {
    // console.log('🔒 [MockAuth] Get user request');
    res.json({
        ok: true,
        user: MOCK_USER
    });
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
    console.log('🔒 [MockAuth] Logout request');
    res.json({
        ok: true,
        message: "Logged out from local session"
    });
});

/**
 * GET /api/auth/config
 */
router.get('/config', (req, res) => {
    res.json({
        ok: true,
        config: {
            supabase_url: 'http://localhost:3000',
            supabase_anon_key: 'mock-anon-key'
        }
    });
});

export default router;
