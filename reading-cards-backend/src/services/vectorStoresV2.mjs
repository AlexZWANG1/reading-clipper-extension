// ========= Vector Store V2 服务 =========
// 用户独立的 Vector Store 管理
// 每个 (user_id, topic_title) 对应一个独立的 Vector Store

import OpenAI from "openai";

// 初始化 OpenAI 客户端
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

let client = null;
if (OPENAI_API_KEY) {
    client = new OpenAI({ apiKey: OPENAI_API_KEY });
    console.log("✅ [VectorStoresV2] OpenAI 客户端初始化成功");
} else {
    console.warn("⚠️ [VectorStoresV2] OPENAI_API_KEY 未设置");
}

// 内存缓存（用户 Vector Store 映射）
// 结构: { "userId:topicTitle": { vector_store_id, file_map, updated_at } }
const userVectorStores = new Map();

/**
 * 获取 vectorStores API
 */
function getVectorStoresAPI() {
    if (!client) {
        throw new Error("OpenAI 客户端未初始化");
    }

    if (client.beta && client.beta.vectorStores) {
        return client.beta.vectorStores;
    } else if (client.vectorStores) {
        return client.vectorStores;
    } else {
        throw new Error("无法找到 vectorStores API");
    }
}

/**
 * 生成缓存 key
 */
function getCacheKey(userId, topicTitle) {
    return `${userId}:${topicTitle || "default"}`;
}

/**
 * 为用户的 Topic 获取或创建 Vector Store
 * @param {string} userId - 用户 ID
 * @param {string} topicTitle - 主题标题
 * @returns {Promise<Object>} { vector_store_id, file_map, created_at, updated_at }
 */
export async function ensureVectorStoreForUserTopic(userId, topicTitle) {
    if (!client) {
        throw new Error("OPENAI_API_KEY 未设置，无法使用 Vector Store 功能");
    }

    if (!userId) {
        throw new Error("userId 不能为空");
    }

    const cacheKey = getCacheKey(userId, topicTitle);

    // 检查缓存
    if (userVectorStores.has(cacheKey)) {
        return userVectorStores.get(cacheKey);
    }

    // 创建新的 Vector Store
    const storeName = `User: ${userId.substring(0, 8)} | Topic: ${topicTitle || "default"}`;
    console.log(`📦 [VectorStoresV2] 为用户创建 Vector Store: ${storeName}`);

    const vectorStoresAPI = getVectorStoresAPI();

    try {
        const vectorStore = await vectorStoresAPI.create({
            name: storeName,
            description: `Vector store for user ${userId}, topic: ${topicTitle || "default"}`,
        });

        const now = new Date().toISOString();
        const storeRecord = {
            user_id: userId,
            topic_title: topicTitle,
            vector_store_id: vectorStore.id,
            file_map: {},
            created_at: now,
            updated_at: now,
        };

        // 缓存
        userVectorStores.set(cacheKey, storeRecord);

        console.log(`✅ [VectorStoresV2] Vector Store 创建成功: ${vectorStore.id}`);
        return storeRecord;
    } catch (error) {
        console.error("❌ [VectorStoresV2] 创建 Vector Store 失败:", error);
        throw new Error(`创建 Vector Store 失败: ${error.message}`);
    }
}

/**
 * 构建卡片文件内容
 */
function buildCardFileContent(card) {
    const lines = [];

    lines.push(`card_id: ${card.id}`);
    lines.push(`user_id: ${card.user_id || ""}`);
    lines.push(`title: ${card.title || ""}`);
    lines.push(`fact_or_view: ${card.fact_or_view || "fact"}`);
    lines.push("");
    lines.push(`summary:`);
    lines.push(card.summary || "");
    lines.push("");
    lines.push(`key_points:`);
    if (card.key_points && Array.isArray(card.key_points) && card.key_points.length > 0) {
        card.key_points.forEach(kp => {
            lines.push(`- ${String(kp).trim()}`);
        });
    } else {
        lines.push("- （无）");
    }
    lines.push("");
    lines.push(`source_name: ${card.source_name || ""}`);
    lines.push(`source_url: ${card.source_url || ""}`);
    lines.push("");
    lines.push(`raw_snippet:`);
    lines.push(card.raw_snippet || "");
    lines.push("");
    if (card.note && card.note.trim()) {
        lines.push(`note:`);
        lines.push(card.note.trim());
        lines.push("");
    }
    lines.push(`created_at: ${card.created_at || ""}`);

    return lines.join("\n");
}

/**
 * 等待文件处理完成
 */
async function waitForFileProcessing(vectorStoreId, fileId, maxWaitMs = 60000) {
    const startTime = Date.now();
    const pollInterval = 2000;
    const vectorStoresAPI = getVectorStoresAPI();

    while (Date.now() - startTime < maxWaitMs) {
        try {
            const file = await vectorStoresAPI.files.retrieve(fileId, {
                vector_store_id: vectorStoreId,
            });

            if (file.status === "completed") {
                return file;
            } else if (file.status === "failed") {
                const errorMsg = file.last_error?.message || "未知错误";
                throw new Error(`文件处理失败: ${errorMsg}`);
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval));
        } catch (error) {
            if (error.message?.includes("not found") || error.message?.includes("404")) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
                continue;
            }
            throw error;
        }
    }

    throw new Error(`文件处理超时（超过${maxWaitMs}ms）`);
}

/**
 * 将卡片同步到用户的 Vector Store
 * @param {Object[]} cards - 卡片数组
 * @param {string} userId - 用户 ID
 * @param {string} topicTitle - 主题标题
 * @returns {Promise<number>} 成功同步的卡片数量
 */
export async function syncCardsToVectorStoreForUserTopic(cards, userId, topicTitle) {
    if (!client) {
        console.warn("⚠️ [VectorStoresV2] OPENAI_API_KEY 未设置，跳过同步");
        return 0;
    }

    if (!cards || cards.length === 0) {
        console.warn("⚠️ [VectorStoresV2] 卡片列表为空，跳过同步");
        return 0;
    }

    try {
        // 确保 Vector Store 存在
        const storeRecord = await ensureVectorStoreForUserTopic(userId, topicTitle);
        const vectorStoreId = storeRecord.vector_store_id;
        const vectorStoresAPI = getVectorStoresAPI();
        let successCount = 0;

        for (const card of cards) {
            try {
                // 检查是否已同步
                const existingFileId = storeRecord.file_map?.[card.id];

                // 如果有旧文件，先删除
                if (existingFileId) {
                    try {
                        await vectorStoresAPI.files.del(vectorStoreId, existingFileId);
                        console.log(`🗑️ [VectorStoresV2] 删除旧文件: ${existingFileId}`);
                    } catch (e) {
                        // 忽略删除错误
                    }
                }

                // 构建并上传文件
                const fileContent = buildCardFileContent(card);
                const fileBuffer = Buffer.from(fileContent, "utf-8");

                const { Readable } = await import("stream");
                const fileStream = Readable.from([fileBuffer]);
                fileStream.path = `${card.id}.txt`;

                const uploadedFile = await client.files.create({
                    file: fileStream,
                    purpose: "assistants",
                });

                // 添加到 Vector Store
                const vectorStoreFile = await vectorStoresAPI.files.create(vectorStoreId, {
                    file_id: uploadedFile.id,
                });

                // 等待处理完成
                await waitForFileProcessing(vectorStoreId, vectorStoreFile.id);

                // 更新缓存
                storeRecord.file_map[card.id] = vectorStoreFile.id;
                storeRecord.updated_at = new Date().toISOString();

                console.log(`✅ [VectorStoresV2] 卡片同步成功: ${card.id}`);
                successCount++;
            } catch (error) {
                console.error(`❌ [VectorStoresV2] 同步卡片失败 (${card.id}):`, error.message);
            }
        }

        console.log(`✅ [VectorStoresV2] 共同步 ${successCount}/${cards.length} 张卡片`);
        return successCount;
    } catch (error) {
        console.error("❌ [VectorStoresV2] 同步失败:", error);
        throw error;
    }
}
