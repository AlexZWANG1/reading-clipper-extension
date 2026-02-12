// ========= 插件 API 模块 =========
// 统一的 API 调用，支持云端 V2 API

import { getToken } from "./auth";

const API_BASE_URL = "http://localhost:3000";

/**
 * 带认证的 fetch 请求
 */
async function authFetch(url, options = {}) {
    const token = await getToken();

    const headers = {
        "Content-Type": "application/json",
        ...options.headers,
    };

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    return fetch(url, {
        ...options,
        headers,
    });
}

// ========= Topics API (V2 云端) =========

/**
 * 获取用户的 Topics 列表
 */
export async function fetchTopics() {
    try {
        const response = await authFetch(`${API_BASE_URL}/api/v2/topics`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data.ok && Array.isArray(data.topics)) {
            return data.topics.map((t) => t.title || t);
        }
        throw new Error("Invalid response format");
    } catch (error) {
        console.error("Failed to fetch topics:", error);
        throw error;
    }
}

/**
 * 创建新的 Topic
 */
export async function createTopic(title) {
    const response = await authFetch(`${API_BASE_URL}/api/v2/topics`, {
        method: "POST",
        body: JSON.stringify({ title }),
    });

    const data = await response.json();

    if (!data.ok) {
        throw new Error(data.message || "创建 Topic 失败");
    }

    return data.topic;
}

// ========= Cards API (V2 云端) =========

/**
 * 创建卡片
 */
export async function createCard(cardData) {
    const response = await authFetch(`${API_BASE_URL}/api/v2/cards`, {
        method: "POST",
        body: JSON.stringify(cardData),
    });

    const data = await response.json();

    if (!data.ok) {
        throw new Error(data.message || "创建卡片失败");
    }

    return data.card;
}

/**
 * 获取卡片列表
 */
export async function fetchCards(options = {}) {
    const params = new URLSearchParams();
    if (options.topic) params.append("topic", options.topic);
    if (options.page) params.append("page", options.page);
    if (options.limit) params.append("limit", options.limit);

    const url = `${API_BASE_URL}/api/v2/cards${params.toString() ? "?" + params.toString() : ""}`;
    const response = await authFetch(url);

    const data = await response.json();

    if (!data.ok) {
        throw new Error(data.message || "获取卡片失败");
    }

    return data.cards;
}
