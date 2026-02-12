// ========= 信息源存储服务 =========
// 使用本地 JSON 文件持久化
// 存储位置：data/sources.json

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据文件路径
const DATA_DIR = path.join(__dirname, "../../data");
const SOURCES_FILE = path.join(DATA_DIR, "sources.json");

/**
 * Source 信息源数据结构
 * @typedef {Object} Source
 * @property {string} source_id - 唯一标识，例如 "src_1234567890_abc123"
 * @property {string} name - 展示名
 * @property {string} category - 分类（如 "AI技术社区"、"个人分析师"）
 * @property {1|2|3} importance_level - 重要度（1=最重要）
 * @property {string|null} url - 入口页 URL
 * @property {'overseas'|'domestic'|'unknown'|null} region - 国别
 * @property {string|null} description - 一句话定位
 * @property {'active'|'paused'|'archived'} status - 状态
 * @property {string} created_at - ISO 时间字符串
 * @property {string} updated_at - ISO 时间字符串
 */

// ========= 内存缓存 =========
let sources = [];

// ========= 持久化层 =========

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log("📁 创建数据目录:", DATA_DIR);
    }
}

function loadSources() {
    ensureDataDir();

    try {
        if (fs.existsSync(SOURCES_FILE)) {
            const content = fs.readFileSync(SOURCES_FILE, "utf-8");
            const data = JSON.parse(content);

            if (Array.isArray(data)) {
                sources = data;
                console.log(`📂 从 ${SOURCES_FILE} 加载了 ${sources.length} 个信息源`);
            } else {
                console.warn("⚠️ sources.json 内容不是数组，初始化为空数组");
                sources = [];
            }
        } else {
            console.log("📂 sources.json 不存在，初始化为空数组");
            sources = [];
        }
    } catch (error) {
        console.error("❌ 加载 sources.json 失败:", error.message);
        sources = [];
    }
}

function saveSources() {
    ensureDataDir();

    try {
        const content = JSON.stringify(sources, null, 2);
        fs.writeFileSync(SOURCES_FILE, content, "utf-8");
    } catch (error) {
        console.error("❌ 保存 sources.json 失败:", error.message);
    }
}

// ========= 启动时加载数据 =========
loadSources();

// ========= 工具函数 =========

function generateSourceId() {
    return `src_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ========= 导出的 API 函数 =========

/**
 * 添加新信息源
 * @param {Object} data - 信息源数据
 * @returns {Source} 创建后的完整信息源对象
 */
export function addSource(data) {
    const now = new Date().toISOString();

    const source = {
        source_id: generateSourceId(),
        name: data.name || "",
        category: data.category || "",
        importance_level: data.importance_level ?? 2,
        url: data.url ?? null,
        region: data.region ?? null,
        description: data.description ?? null,
        status: data.status || "active",
        created_at: now,
        updated_at: now
    };

    sources.push(source);
    saveSources();

    return source;
}

/**
 * 列出信息源（支持筛选）
 * @param {Object} filters - 筛选条件
 * @returns {Source[]} 信息源数组
 */
export function listSources(filters = {}) {
    let result = [...sources];

    // 按 category 筛选
    if (filters.category) {
        result = result.filter(s => s.category === filters.category);
    }

    // 按 status 筛选
    if (filters.status) {
        result = result.filter(s => s.status === filters.status);
    }

    // 按 importance_level 筛选
    if (filters.importance_level !== undefined) {
        result = result.filter(s => s.importance_level === filters.importance_level);
    }

    // 按重要度排序（1=最重要在前），然后按创建时间倒序
    result.sort((a, b) => {
        if (a.importance_level !== b.importance_level) {
            return a.importance_level - b.importance_level;
        }
        return new Date(b.created_at) - new Date(a.created_at);
    });

    return result;
}

/**
 * 根据 ID 查找信息源
 * @param {string} sourceId - 信息源 ID
 * @returns {Source|undefined}
 */
export function findSourceById(sourceId) {
    return sources.find(s => s.source_id === sourceId);
}

/**
 * 更新信息源
 * @param {string} sourceId - 信息源 ID
 * @param {Object} updates - 要更新的字段
 * @returns {Source|null} 更新后的信息源，找不到返回 null
 */
export function updateSource(sourceId, updates) {
    const source = findSourceById(sourceId);
    if (!source) {
        return null;
    }

    if (updates.name !== undefined) source.name = updates.name;
    if (updates.category !== undefined) source.category = updates.category;
    if (updates.importance_level !== undefined) source.importance_level = updates.importance_level;
    if (updates.url !== undefined) source.url = updates.url;
    if (updates.region !== undefined) source.region = updates.region;
    if (updates.description !== undefined) source.description = updates.description;
    if (updates.status !== undefined) source.status = updates.status;

    source.updated_at = new Date().toISOString();

    saveSources();

    return source;
}

/**
 * 删除信息源
 * @param {string} sourceId - 信息源 ID
 * @returns {boolean} 是否成功删除
 */
export function deleteSource(sourceId) {
    const index = sources.findIndex(s => s.source_id === sourceId);
    if (index === -1) {
        return false;
    }

    sources.splice(index, 1);
    saveSources();

    return true;
}

/**
 * 获取所有信息源（用于调试）
 */
export function getAllSources() {
    return [...sources];
}

/**
 * 重新加载数据
 */
export function reloadSources() {
    loadSources();
}
