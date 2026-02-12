// ========= 卡片存储服务 =========
// 使用本地 JSON 文件持久化，重启服务后数据不丢失
// 存储位置：data/cards.json

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { upsertCardInVectorStore, removeCardFromVectorStore } from "./vectorStores.mjs";

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据文件路径：项目根目录下的 data/cards.json
const DATA_DIR = path.join(__dirname, "../../data");
const CARDS_FILE = path.join(DATA_DIR, "cards.json");

/**
 * Card 数据结构
 * @typedef {Object} Card
 * @property {string} id - 卡片唯一标识，例如 "card_1234567890_abc123"
 * @property {string|null} source_id - 关联的 Source ID（可为空，兼容旧卡片）
 * @property {string|null} title - 页面/文章标题（可选）
 * @property {string} summary - 摘要文本（Agent1 生成）
 * @property {string[]} key_points - 要点列表（Agent1 生成）
 * @property {string|null} source_name - 来源名称
 * @property {string|null} source_url - 来源 URL
 * @property {string} raw_snippet - 原始划线内容（纯文本，不包含 base64）
 * @property {string|null} topic_title - 采集时的主题名（可以为空）
 * @property {string} [note] - 用户批注文本（可选）
 * @property {string|null} [image_url] - 图片 URL（base64 dataURL 或外部 URL，可选）
 * @property {string} created_at - ISO 时间字符串
 * @property {boolean} deleted - 软删除标记
 */

// ========= 内存缓存 =========
let cards = [];

// ========= 持久化层 =========

/**
 * 确保 data 目录存在
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log("📁 创建数据目录:", DATA_DIR);
  }
}

/**
 * 从 JSON 文件加载卡片数据
 * 如果文件不存在或内容非法，则初始化为空数组
 */
function loadCards() {
  ensureDataDir();

  try {
    if (fs.existsSync(CARDS_FILE)) {
      const content = fs.readFileSync(CARDS_FILE, "utf-8");
      const data = JSON.parse(content);

      if (Array.isArray(data)) {
        // 兼容旧数据：确保每张卡片都有新字段
        cards = data.map(card => ({
          ...card,
          source_id: card.source_id ?? null,
          title: card.title ?? null,
          topic_title: card.topic_title ?? null,
          note: card.note ?? "",
          image_url: card.image_url ?? null,
          deleted: card.deleted ?? false
        }));
        console.log(`📂 从 ${CARDS_FILE} 加载了 ${cards.length} 张卡片`);
      } else {
        console.warn("⚠️ cards.json 内容不是数组，初始化为空数组");
        cards = [];
      }
    } else {
      console.log("📂 cards.json 不存在，初始化为空数组");
      cards = [];
    }
  } catch (error) {
    console.error("❌ 加载 cards.json 失败:", error.message);
    console.log("📂 初始化为空数组");
    cards = [];
  }
}

/**
 * 将卡片数据保存到 JSON 文件
 */
function saveCards() {
  ensureDataDir();

  try {
    const content = JSON.stringify(cards, null, 2);
    fs.writeFileSync(CARDS_FILE, content, "utf-8");
    // 不打印日志，避免频繁输出
  } catch (error) {
    console.error("❌ 保存 cards.json 失败:", error.message);
  }
}

// ========= 启动时加载数据 =========
loadCards();

// ========= 工具函数 =========

/**
 * 生成唯一 ID
 */
function generateId() {
  return `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ========= 导出的 API 函数 =========

/**
 * 添加新卡片
 * @param {Object} cardData - 卡片数据（不含 id 和 created_at）
 * @returns {Card} 创建后的完整卡片对象
 */
export function addCard(cardData) {
  const card = {
    id: generateId(),
    source_id: cardData.source_id ?? null,
    title: cardData.title ?? null,
    summary: cardData.summary || "",
    key_points: Array.isArray(cardData.key_points) ? cardData.key_points : [],
    source_name: cardData.source_name ?? null,
    source_url: cardData.source_url ?? null,
    raw_snippet: cardData.raw_snippet || "",
    topic_title: cardData.topic_title ?? null,
    note: cardData.note || "",
    image_url: cardData.image_url ?? null,
    created_at: new Date().toISOString(),
    deleted: false
  };

  cards.push(card);
  saveCards();  // 持久化

  // 同步到 Vector Store（异步，不阻塞主流程）
  upsertCardInVectorStore(card).catch(err => {
    console.error(`❌ 同步卡片到 Vector Store 失败 (${card.id}):`, err);
  });

  return card;
}

/**
 * 列出卡片（支持筛选）
 * @param {Object} filters - 筛选条件
 * @param {string} [filters.topic_title] - 按 topic_title 精确筛选
 * @param {string} [filters.source_id] - 按 source_id 精确筛选
 * @param {boolean} [filters.includeDeleted=false] - 是否包含已删除的卡片
 * @returns {Card[]} 卡片数组
 */
export function listCards(filters = {}) {
  let result = [...cards];

  // 默认不返回已删除的卡片
  const includeDeleted = filters.includeDeleted === true;
  if (!includeDeleted) {
    result = result.filter(card => !card.deleted);
  }

  // 按 topic_title 精确筛选（主要筛选方式）
  if (filters.topic_title !== undefined && filters.topic_title !== null && filters.topic_title !== "") {
    result = result.filter(card => card.topic_title === filters.topic_title);
  }

  // 按 source_id 精确筛选
  if (filters.source_id !== undefined && filters.source_id !== null && filters.source_id !== "") {
    result = result.filter(card => card.source_id === filters.source_id);
  }

  // 兼容旧的 doc_hint 筛选（向后兼容，已废弃）
  // 注意：如果同时提供了 topic_title 和 doc_hint，优先使用 topic_title
  if (filters.doc_hint !== undefined && (filters.topic_title === undefined || filters.topic_title === null || filters.topic_title === "")) {
    result = result.filter(card => card.doc_hint === filters.doc_hint);
  }

  // 兼容旧的 doc 字段筛选（向后兼容，已废弃）
  if (filters.doc !== undefined && (filters.topic_title === undefined || filters.topic_title === null || filters.topic_title === "")) {
    result = result.filter(card =>
      card.doc_hint === filters.doc ||
      (card.doc && card.doc === filters.doc)
    );
  }

  // 按创建时间倒序排列
  result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return result;
}

/**
 * 根据 ID 查找卡片
 * @param {string} id - 卡片 ID
 * @returns {Card|undefined} 卡片对象或 undefined
 */
export function findCardById(id) {
  return cards.find(card => card.id === id);
}

/**
 * 软删除卡片（设置 deleted = true）
 * @param {string} id - 卡片 ID
 * @returns {boolean} 是否成功删除
 */
export function softDeleteCard(id) {
  const card = findCardById(id);
  if (!card) {
    return false;
  }

  card.deleted = true;
  saveCards();  // 持久化

  // 从 Vector Store 中删除（异步，不阻塞主流程）
  removeCardFromVectorStore(card).catch(err => {
    console.error(`❌ 从 Vector Store 删除卡片失败 (${card.id}):`, err);
  });

  return true;
}

/**
 * 更新卡片的部分字段
 * @param {string} id - 卡片 ID
 * @param {Object} updates - 要更新的字段
 * @returns {Card|null} 更新后的卡片，找不到返回 null
 */
export function updateCard(id, updates) {
  const card = findCardById(id);
  if (!card) {
    return null;
  }

  // 保存旧卡片信息（用于 Vector Store 同步）
  const oldCard = { ...card };
  const oldTopicTitle = card.topic_title;

  // 只更新提供的字段
  if (updates.source_id !== undefined) card.source_id = updates.source_id;
  if (updates.title !== undefined) card.title = updates.title;
  if (updates.summary !== undefined) card.summary = updates.summary;
  if (updates.key_points !== undefined) card.key_points = updates.key_points;
  if (updates.source_name !== undefined) card.source_name = updates.source_name;
  if (updates.source_url !== undefined) card.source_url = updates.source_url;
  if (updates.raw_snippet !== undefined) card.raw_snippet = updates.raw_snippet;
  if (updates.topic_title !== undefined) card.topic_title = updates.topic_title;
  if (updates.note !== undefined) card.note = updates.note;
  if (updates.image_url !== undefined) card.image_url = updates.image_url;
  if (updates.deleted !== undefined) card.deleted = updates.deleted;

  // Update timestamp
  card.updated_at = new Date().toISOString();

  // 兼容旧字段
  if (updates.doc_hint !== undefined) card.doc_hint = updates.doc_hint;
  if (updates.section_hint !== undefined) card.section_hint = updates.section_hint;
  if (updates.tags !== undefined) card.tags = updates.tags;

  saveCards();  // 持久化

  // 同步到 Vector Store（异步，不阻塞主流程）
  // 如果 topic_title 改变，需要从旧 store 删除，再添加到新 store
  if (updates.topic_title !== undefined && oldTopicTitle !== card.topic_title) {
    if (oldTopicTitle) {
      removeCardFromVectorStore(oldCard).catch(err => {
        console.error(`❌ 从旧 Vector Store 删除卡片失败 (${card.id}):`, err);
      });
    }
    upsertCardInVectorStore(card).catch(err => {
      console.error(`❌ 同步卡片到新 Vector Store 失败 (${card.id}):`, err);
    });
  } else {
    // topic_title 未改变，检查是否有内容更新
    const contentChanged =
      updates.summary !== undefined ||
      updates.key_points !== undefined ||
      updates.raw_snippet !== undefined ||
      updates.note !== undefined ||
      updates.source_name !== undefined ||
      updates.source_url !== undefined;

    if (contentChanged) {
      upsertCardInVectorStore(card).catch(err => {
        console.error(`❌ 更新 Vector Store 中的卡片失败 (${card.id}):`, err);
      });
    }
  }

  return card;
}

/**
 * 获取所有卡片（用于调试，包含已删除的）
 */
export function getAllCards() {
  return [...cards];
}

/**
 * 重新加载数据（用于调试或热重载）
 */
export function reloadCards() {
  loadCards();
}
