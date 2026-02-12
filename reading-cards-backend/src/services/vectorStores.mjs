// ========= Vector Store 管理服务 =========
// 管理 OpenAI Vector Store 与本地 topic_title 的映射关系
// 每个 topic_title 对应一个 Vector Store，用于存储该主题下的卡片

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import dotenv from "dotenv";

// 确保环境变量已加载（ES 模块 import 先于 server.mjs 的 dotenv.config() 执行）
const __vs_file = fileURLToPath(import.meta.url);
const __vs_dir = path.dirname(__vs_file);
dotenv.config({ path: path.join(__vs_dir, "../../.env") });

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据文件路径
const DATA_DIR = path.join(__dirname, "../../data");
const VECTOR_STORES_FILE = path.join(DATA_DIR, "vectorStores.json");

// 初始化 OpenAI 客户端
// 请在 .env 文件中设置 OPENAI_API_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// 调试日志
console.log("=== Vector Stores 模块初始化 ===");
console.log("OPENAI_API_KEY 是否存在:", !!OPENAI_API_KEY);
if (OPENAI_API_KEY) {
  console.log("OPENAI_API_KEY 前15字符:", OPENAI_API_KEY.substring(0, 15) + "...");
}

if (!OPENAI_API_KEY) {
  console.warn("⚠️ OPENAI_API_KEY 未设置，Vector Store 功能将不可用");
}

let client = null;
try {
  if (OPENAI_API_KEY) {
    client = new OpenAI({ apiKey: OPENAI_API_KEY });
    console.log("✅ OpenAI 客户端初始化成功");
    
    // 检查 client 的结构
    console.log("client 的键:", Object.keys(client).slice(0, 10).join(", "));
    console.log("client.beta 是否存在:", !!client.beta);
    
    if (client.beta) {
      console.log("client.beta 的键:", Object.keys(client.beta).slice(0, 10).join(", "));
      console.log("client.beta.vectorStores 是否存在:", !!client.beta.vectorStores);
    } else {
      console.warn("⚠️ client.beta 不存在，可能需要检查 OpenAI SDK 版本");
      // 尝试直接访问 vectorStores（某些版本可能不在 beta 下）
      console.log("client.vectorStores 是否存在:", !!client.vectorStores);
    }
  }
} catch (clientError) {
  console.error("❌ OpenAI 客户端初始化失败:", clientError);
  console.error("错误详情:", clientError.message);
  console.error("错误堆栈:", clientError.stack);
  client = null;
}
console.log("=================================");

// ========= 辅助函数：获取 vectorStores API =========
/**
 * 获取可用的 vectorStores API
 * 兼容不同版本的 OpenAI SDK
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
    throw new Error("无法找到 vectorStores API，请检查 OpenAI SDK 版本");
  }
}

// ========= 本地映射数据管理 =========

/**
 * 加载 Vector Store 映射数据
 */
function loadVectorStores() {
  ensureDataDir();
  
  try {
    if (fs.existsSync(VECTOR_STORES_FILE)) {
      const content = fs.readFileSync(VECTOR_STORES_FILE, "utf-8");
      const data = JSON.parse(content);
      
      if (data && Array.isArray(data.stores)) {
        return data.stores;
      } else {
        console.warn("⚠️ vectorStores.json 格式不正确，初始化为空数组");
        return [];
      }
    } else {
      console.log("📂 vectorStores.json 不存在，初始化为空数组");
      return [];
    }
  } catch (error) {
    console.error("❌ 加载 vectorStores.json 失败:", error.message);
    return [];
  }
}

/**
 * 保存 Vector Store 映射数据
 */
function saveVectorStores(stores) {
  ensureDataDir();
  
  try {
    const data = { stores };
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(VECTOR_STORES_FILE, content, "utf-8");
  } catch (error) {
    console.error("❌ 保存 vectorStores.json 失败:", error.message);
  }
}

/**
 * 确保 data 目录存在
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log("📁 创建数据目录:", DATA_DIR);
  }
}

// ========= Vector Store 操作 =========

/**
 * 按 topic_title 获取或创建 Vector Store
 * @param {string} topicTitle - 主题标题
 * @returns {Promise<Object>} { topic_title, vector_store_id, file_map, created_at, updated_at }
 */
export async function ensureVectorStoreForTopic(topicTitle) {
  // 检查客户端是否初始化
  if (!client) {
    console.error("❌ OpenAI 客户端未初始化");
    console.error("OPENAI_API_KEY 状态:", !!OPENAI_API_KEY);
    throw new Error("OPENAI_API_KEY 未设置，无法使用 Vector Store 功能");
  }

  // 获取 vectorStores API
  let vectorStoresAPI;
  try {
    vectorStoresAPI = getVectorStoresAPI();
  } catch (apiError) {
    console.error("❌ 无法获取 vectorStores API:", apiError.message);
    throw apiError;
  }

  if (!topicTitle || !topicTitle.trim()) {
    throw new Error("topic_title 不能为空");
  }

  const stores = loadVectorStores();
  const existing = stores.find(s => s.topic_title === topicTitle);

  if (existing) {
    return existing;
  }

  // 创建新的 Vector Store
  console.log(`📦 为 topic "${topicTitle}" 创建新的 Vector Store...`);
  console.log("使用 vectorStores API...");
  
  try {
    const vectorStore = await vectorStoresAPI.create({
      name: topicTitle,
      description: `Vector store for topic: ${topicTitle}`
    });

    const now = new Date().toISOString();
    const newStore = {
      topic_title: topicTitle,
      vector_store_id: vectorStore.id,
      file_map: {},
      created_at: now,
      updated_at: now
    };

    stores.push(newStore);
    saveVectorStores(stores);

    console.log(`✅ Vector Store 创建成功: ${vectorStore.id}`);
    return newStore;
  } catch (error) {
    console.error("❌ 创建 Vector Store 失败:", error);
    throw new Error(`创建 Vector Store 失败: ${error.message}`);
  }
}

/**
 * 为单张 Card 构建上传文本
 * @param {Object} card - Card 对象
 * @returns {string} 格式化的文本内容
 */
function buildCardFileContent(card) {
  const lines = [];
  
  lines.push(`card_id: ${card.id}`);
  lines.push(`topic_title: ${card.topic_title || ""}`);
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
 * 等待文件处理完成（轮询状态）
 * @param {string} vectorStoreId - Vector Store ID
 * @param {string} fileId - File ID
 * @param {number} maxWaitMs - 最大等待时间（毫秒）
 * @returns {Promise<Object>} 文件对象
 */
async function waitForFileProcessing(vectorStoreId, fileId, maxWaitMs = 60000) {
  const startTime = Date.now();
  const pollInterval = 2000; // 2秒轮询一次

  const vectorStoresAPI = getVectorStoresAPI();

  console.log("=== waitForFileProcessing 调用 ===");
  console.log("  vectorStoreId:", vectorStoreId);
  console.log("  fileId:", fileId);
  console.log("  typeof vectorStoreId:", typeof vectorStoreId);
  console.log("  typeof fileId:", typeof fileId);
  console.log("==================================");
  
  while (Date.now() - startTime < maxWaitMs) {
    try {
      // ✅ 修正后的调用方式：第一个参数是 fileId，第二个参数是包含 vector_store_id 的对象
      const file = await vectorStoresAPI.files.retrieve(fileId, {
        vector_store_id: vectorStoreId
      });
      
      console.log("=== waitForFileProcessing 轮询结果 ===");
      console.log("  file.id:", file?.id);
      console.log("  file.status:", file?.status);
      console.log("  file.last_error:", file?.last_error);
      console.log("==================================");

      if (file.status === "completed") {
        return file;
      } else if (file.status === "failed") {
        const errorMsg = file.last_error?.message || JSON.stringify(file.last_error) || "未知错误";
        throw new Error(`文件处理失败: ${errorMsg}`);
      }
      
      // 继续等待
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error("waitForFileProcessing 轮询异常:", error);
      if (error.message && (error.message.includes("not found") || error.message.includes("404"))) {
        // 文件可能还在处理中，继续等待
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        continue;
      }
      throw error;
    }
  }

  throw new Error(`文件处理超时（超过${maxWaitMs}ms）`);
}

/**
 * 把 Card 同步到对应 topic 的 Vector Store
 * @param {Object} card - Card 对象
 */
export async function upsertCardInVectorStore(card) {
  if (!client) {
    console.warn("⚠️ OPENAI_API_KEY 未设置，跳过 Vector Store 同步");
    return;
  }

  if (!card.topic_title || !card.topic_title.trim()) {
    // topic_title 为空时不入库
    return;
  }

  try {
    // 1. 确保 Vector Store 存在
    const storeRecord = await ensureVectorStoreForTopic(card.topic_title);
    const vectorStoreId = storeRecord.vector_store_id;

    // 2. 检查是否已有该卡片的文件
    const stores = loadVectorStores();
    const store = stores.find(s => s.topic_title === card.topic_title);
    const existingFileId = store?.file_map?.[card.id];

    // 3. 构建文件内容
    const fileContent = buildCardFileContent(card);
    const fileBuffer = Buffer.from(fileContent, "utf-8");

    // 4. 如果有旧文件，先删除
    if (existingFileId) {
      try {
        const vectorStoresAPI = getVectorStoresAPI();
        await vectorStoresAPI.files.del(vectorStoreId, existingFileId);
        console.log(`🗑️ 删除旧文件: ${existingFileId}`);
      } catch (error) {
        // 如果删除失败，继续上传新文件（可能旧文件已不存在）
        console.warn(`⚠️ 删除旧文件失败（可能已不存在）: ${error.message}`);
      }
    }

    // 5. 上传新文件
    console.log(`📤 上传卡片到 Vector Store: ${card.id}`);
    
    // 使用 OpenAI SDK 上传文件
    // OpenAI SDK 支持传入 ReadableStream 或 File-like 对象
    // 在 Node.js 中，我们可以创建一个 ReadableStream
    const { Readable } = await import("stream");
    const fileStream = Readable.from([fileBuffer]);
    fileStream.path = `${card.id}.txt`; // 设置文件名
    
    const uploadedFile = await client.files.create({
      file: fileStream,
      purpose: "assistants" // 使用 "assistants" 而不是 "file_search"
    });

    // 添加到 Vector Store
    const vectorStoresAPI = getVectorStoresAPI();
    const vectorStoreFile = await vectorStoresAPI.files.create(vectorStoreId, {
      file_id: uploadedFile.id
    });

    // 6. 等待文件处理完成
    await waitForFileProcessing(vectorStoreId, vectorStoreFile.id);

    // 7. 更新本地映射
    const updatedStores = loadVectorStores();
    const updatedStore = updatedStores.find(s => s.topic_title === card.topic_title);
    if (updatedStore) {
      updatedStore.file_map = updatedStore.file_map || {};
      updatedStore.file_map[card.id] = vectorStoreFile.id;
      updatedStore.updated_at = new Date().toISOString();
      saveVectorStores(updatedStores);
    }

    console.log(`✅ 卡片同步成功: ${card.id} -> ${vectorStoreFile.id}`);
  } catch (error) {
    console.error(`❌ 同步卡片到 Vector Store 失败 (${card.id}):`, error);
    // 不抛出错误，避免影响主流程
  }
}

/**
 * 从 Vector Store 中删除 Card 对应的文件
 * @param {Object} card - Card 对象
 */
export async function removeCardFromVectorStore(card) {
  if (!client) {
    console.warn("⚠️ OPENAI_API_KEY 未设置，跳过 Vector Store 删除");
    return;
  }

  if (!card.topic_title || !card.topic_title.trim()) {
    return;
  }

  try {
    const stores = loadVectorStores();
    const store = stores.find(s => s.topic_title === card.topic_title);
    
    if (!store || !store.file_map || !store.file_map[card.id]) {
      // 没有对应的文件，直接返回
      return;
    }

    const fileId = store.file_map[card.id];
    const vectorStoreId = store.vector_store_id;

    // 从 Vector Store 中删除文件
    const vectorStoresAPI = getVectorStoresAPI();
    await vectorStoresAPI.files.del(vectorStoreId, fileId);
    console.log(`🗑️ 从 Vector Store 删除文件: ${fileId}`);

    // 更新本地映射
    delete store.file_map[card.id];
    store.updated_at = new Date().toISOString();
    saveVectorStores(stores);
  } catch (error) {
    console.error(`❌ 从 Vector Store 删除卡片失败 (${card.id}):`, error);
    // 不抛出错误，避免影响主流程
  }
}

/**
 * 获取 Vector Store 信息
 * @param {string} topicTitle - 主题标题
 * @returns {Object|null} Vector Store 记录
 */
export function getVectorStoreForTopic(topicTitle) {
  const stores = loadVectorStores();
  return stores.find(s => s.topic_title === topicTitle) || null;
}

/**
 * 将指定的卡片同步到指定 topic 的 Vector Store
 * 用于解决文档的 topic_title 和卡片的 topic_title 不一致的问题
 * @param {Object[]} cards - 卡片数组
 * @param {string} targetTopicTitle - 目标 topic_title
 * @returns {Promise<number>} 成功同步的卡片数量
 */
export async function syncCardsToVectorStoreForTopic(cards, targetTopicTitle) {
  if (!client) {
    console.warn("⚠️ OPENAI_API_KEY 未设置，跳过 Vector Store 同步");
    return 0;
  }

  if (!targetTopicTitle || !targetTopicTitle.trim()) {
    console.warn("⚠️ targetTopicTitle 为空，跳过同步");
    return 0;
  }

  if (!cards || cards.length === 0) {
    console.warn("⚠️ 卡片列表为空，跳过同步");
    return 0;
  }

  try {
    // 1. 确保 Vector Store 存在
    const storeRecord = await ensureVectorStoreForTopic(targetTopicTitle);
    const vectorStoreId = storeRecord.vector_store_id;

    if (!vectorStoreId) {
      throw new Error("Vector Store ID 为空");
    }

    const stores = loadVectorStores();
    const store = stores.find(s => s.topic_title === targetTopicTitle);
    if (!store) {
      throw new Error(`找不到 topic "${targetTopicTitle}" 的 Vector Store 记录`);
    }

    const vectorStoresAPI = getVectorStoresAPI();
    let successCount = 0;

    // 2. 同步每张卡片
    for (const card of cards) {
      try {
        // 检查是否已有该卡片的文件
        const existingFileId = store?.file_map?.[card.id];

        // 如果有旧文件，先删除
        if (existingFileId) {
          try {
            await vectorStoresAPI.files.del(vectorStoreId, existingFileId);
            console.log(`🗑️ 删除旧文件: ${existingFileId} (card: ${card.id})`);
          } catch (error) {
            console.warn(`⚠️ 删除旧文件失败（可能已不存在）: ${error.message}`);
          }
        }

        // 构建文件内容
        const fileContent = buildCardFileContent(card);
        const fileBuffer = Buffer.from(fileContent, "utf-8");

        // 上传文件
        console.log(`📤 同步卡片到 Vector Store: ${card.id} -> topic: ${targetTopicTitle}`);
        
        const { Readable } = await import("stream");
        const fileStream = Readable.from([fileBuffer]);
        fileStream.path = `${card.id}.txt`;

        const uploadedFile = await client.files.create({
          file: fileStream,
          purpose: "assistants" // 使用 "assistants" 而不是 "file_search"
        });

        console.log("=== syncCardsToVectorStoreForTopic: 上传文件完成 ===");
        console.log("  targetTopicTitle:", targetTopicTitle);
        console.log("  vectorStoreId:", vectorStoreId);
        console.log("  card.id:", card.id);
        console.log("  uploadedFile.id:", uploadedFile?.id);
        console.log("===============================================");

        // 添加到 Vector Store
        const vectorStoreFile = await vectorStoresAPI.files.create(vectorStoreId, {
          file_id: uploadedFile.id
        });

        console.log("=== syncCardsToVectorStoreForTopic: Vector Store 文件创建完成 ===");
        console.log("  vectorStoreId:", vectorStoreId);
        console.log("  card.id:", card.id);
        console.log("  uploadedFile.id:", uploadedFile?.id);
        console.log("  vectorStoreFile.id:", vectorStoreFile?.id);
        console.log("  vectorStoreFile.file_id:", vectorStoreFile?.file_id);
        console.log("  vectorStoreFile.vector_store_id:", vectorStoreFile?.vector_store_id);
        console.log("  vectorStoreFile.status:", vectorStoreFile?.status);
        console.log("================================================");

        // 等待文件处理完成
        await waitForFileProcessing(vectorStoreId, vectorStoreFile.id);

        // 更新本地映射
        const updatedStores = loadVectorStores();
        const updatedStore = updatedStores.find(s => s.topic_title === targetTopicTitle);
        if (updatedStore) {
          updatedStore.file_map = updatedStore.file_map || {};
          updatedStore.file_map[card.id] = vectorStoreFile.id;
          updatedStore.updated_at = new Date().toISOString();
          saveVectorStores(updatedStores);
        }

        console.log(`✅ 卡片同步成功: ${card.id} -> ${vectorStoreFile.id}`);
        successCount++;
      } catch (error) {
        console.error(`❌ 同步卡片失败 (${card.id}):`, error.message);
        if (error.code) {
          console.error("  error.code:", error.code);
        }
        if (error.status) {
          console.error("  error.status:", error.status);
        }
        if (error.response) {
          console.error("  error.response:", error.response);
        }
        if (error.stack) {
          console.error("  error.stack:", error.stack);
        }
        console.error("  full error:", error);
        // 继续处理下一张卡片
      }
    }

    console.log(`✅ 共成功同步 ${successCount}/${cards.length} 张卡片到 topic "${targetTopicTitle}"`);
    return successCount;
  } catch (error) {
    console.error(`❌ 同步卡片到 Vector Store 失败:`, error);
    throw error;
  }
}

