// ========= 插件认证服务 =========
// 处理登录、登出、Token 管理

const API_BASE_URL = "http://localhost:3000";

// ========= Token 存储键 =========
// 注意：必须与 background.js 中的 STORAGE_KEYS 保持一致
const AUTH_KEYS = {
    SESSION: "userSession",  // 与 background.js 保持一致
    USER: "userData",        // 与 background.js 保持一致
};

// ========= 存储操作 =========
// 注意：使用 chrome.storage.sync 与 background.js 保持一致

/**
 * 保存认证信息到 chrome.storage.sync
 */
export async function saveAuthData(session, user) {
    return new Promise((resolve) => {
        chrome.storage.sync.set(
            {
                [AUTH_KEYS.SESSION]: session,
                [AUTH_KEYS.USER]: user,
            },
            resolve
        );
    });
}

/**
 * 获取存储的认证信息
 */
export async function getAuthData() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(
            [AUTH_KEYS.SESSION, AUTH_KEYS.USER],
            (result) => {
                const session = result[AUTH_KEYS.SESSION] || null;
                const user = result[AUTH_KEYS.USER] || null;
                resolve({
                    token: session?.access_token || null,
                    refreshToken: session?.refresh_token || null,
                    user: user,
                    expiresAt: session?.expires_at ? session.expires_at * 1000 : null,
                    session: session,
                });
            }
        );
    });
}

/**
 * 清除认证信息（登出）
 */
export async function clearAuthData() {
    return new Promise((resolve) => {
        chrome.storage.sync.remove(
            [AUTH_KEYS.SESSION, AUTH_KEYS.USER],
            resolve
        );
    });
}

// ========= 认证 API =========

/**
 * 登录
 */
export async function login(email, password) {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!data.ok) {
        throw new Error(data.message || "登录失败");
    }

    // 保存认证信息
    await saveAuthData(data.session, data.user);

    return data;
}

/**
 * 登出
 */
export async function logout() {
    const { token } = await getAuthData();

    if (token) {
        try {
            await fetch(`${API_BASE_URL}/api/auth/logout`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
            });
        } catch (e) {
            // 忽略登出 API 错误，继续清除本地数据
            console.warn("Logout API error:", e);
        }
    }

    await clearAuthData();
}

/**
 * 检查是否已登录（Token 是否有效）
 */
export async function isLoggedIn() {
    const { token, expiresAt } = await getAuthData();

    if (!token) return false;

    // 检查是否过期（提前 5 分钟视为过期）
    if (expiresAt && Date.now() > expiresAt - 5 * 60 * 1000) {
        // Token 即将过期，尝试刷新
        const refreshed = await refreshToken();
        return refreshed;
    }

    return true;
}

/**
 * 刷新 Token
 */
export async function refreshToken() {
    const { refreshToken: refresh } = await getAuthData();

    if (!refresh) return false;

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: refresh }),
        });

        const data = await response.json();

        if (data.ok && data.session) {
            await saveAuthData(data.session, data.user);
            return true;
        }
    } catch (e) {
        console.error("Token refresh failed:", e);
    }

    // 刷新失败，清除认证信息
    await clearAuthData();
    return false;
}

/**
 * 获取当前用户信息
 */
export async function getCurrentUser() {
    const { user } = await getAuthData();
    return user;
}

/**
 * 获取认证 Token（供其他 API 调用使用）
 */
export async function getToken() {
    // 先检查 Token 是否有效
    const loggedIn = await isLoggedIn();
    if (!loggedIn) return null;

    const { token } = await getAuthData();
    return token;
}
