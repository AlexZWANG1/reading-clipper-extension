// ========= 文档（故事线）存储服务 =========
// 使用本地 JSON 文件持久化，重启服务后数据不丢失
// 存储位置：data/documents.json

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据文件路径：项目根目录下的 data/documents.json
const DATA_DIR = path.join(__dirname, "../../data");
const DOCUMENTS_FILE = path.join(DATA_DIR, "documents.json");

/**
 * Question（文档级问题）
 * @typedef {Object} Question
 * @property {string} id - 问题 ID，例如 "Q1"
 * @property {string} text - 问题内容
 */

/**
 * Hypothesis（文档级假设）
 * @typedef {Object} Hypothesis
 * @property {string} id - 假设 ID，例如 "H1"
 * @property {string} question_id - 主要回答的 Question ID
 * @property {string} text - 假设内容
 */

/**
 * StoryUnit（故事单元 = 文档小节）
 * @typedef {Object} StoryUnit
 * @property {string} unit_id - 单元 ID，例如 "U1"
 * @property {string} title - 小节标题
 * @property {string} core_point - 1–2 句重心论点
 * @property {string[]} card_ids - 本节用到的卡片 ID
 * @property {string} [question_id] - 主要对应哪个 Question
 * @property {string|null} [hypothesis_id] - 主要支持/测试哪个 Hypothesis
 */

/**
 * Document 数据结构
 * @typedef {Object} Document
 * @property {string} doc_id - 文档唯一标识，例如 "doc_1234567890_abc123"
 * @property {string} topic_title - 文档标题 = 研究主题
 * @property {Question[]} doc_questions - 文档级问题
 * @property {Hypothesis[]} doc_hypotheses - 文档级假设
 * @property {StoryUnit[]} story_units - 故事单元（= 小节）
 * @property {string} created_at - ISO 时间字符串
 * @property {string} updated_at - ISO 时间字符串
 */

// ========= 内存缓存 =========
let documents = [];

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
 * 从 JSON 文件加载文档数据
 */
function loadDocuments() {
  ensureDataDir();
  
  try {
    if (fs.existsSync(DOCUMENTS_FILE)) {
      const content = fs.readFileSync(DOCUMENTS_FILE, "utf-8");
      const data = JSON.parse(content);
      
      if (Array.isArray(data)) {
        documents = data;
        console.log(`📂 从 ${DOCUMENTS_FILE} 加载了 ${documents.length} 个文档`);
      } else {
        console.warn("⚠️ documents.json 内容不是数组，初始化为空数组");
        documents = [];
      }
    } else {
      console.log("📂 documents.json 不存在，初始化为空数组");
      documents = [];
    }
  } catch (error) {
    console.error("❌ 加载 documents.json 失败:", error.message);
    console.log("📂 初始化为空数组");
    documents = [];
  }
}

/**
 * 将文档数据保存到 JSON 文件
 */
function saveDocuments() {
  ensureDataDir();
  
  try {
    const content = JSON.stringify(documents, null, 2);
    fs.writeFileSync(DOCUMENTS_FILE, content, "utf-8");
  } catch (error) {
    console.error("❌ 保存 documents.json 失败:", error.message);
  }
}

// ========= 启动时加载数据 =========
loadDocuments();

// ========= 工具函数 =========

/**
 * 生成唯一文档 ID
 */
function generateDocId() {
  return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ========= 导出的 API 函数 =========

/**
 * 添加新文档
 * @param {Object} docData - 文档数据
 * @param {string} docData.topic_title - 文档标题
 * @param {Question[]} [docData.doc_questions] - 文档级问题
 * @param {Hypothesis[]} [docData.doc_hypotheses] - 文档级假设
 * @param {StoryUnit[]} [docData.story_units] - 故事单元
 * @returns {Document} 创建后的完整文档对象
 */
export function addDocument(docData) {
  const now = new Date().toISOString();
  
  const doc = {
    doc_id: generateDocId(),
    topic_title: docData.topic_title || "",
    doc_questions: Array.isArray(docData.doc_questions) ? docData.doc_questions : [],
    doc_hypotheses: Array.isArray(docData.doc_hypotheses) ? docData.doc_hypotheses : [],
    story_units: Array.isArray(docData.story_units) ? docData.story_units : [],
    created_at: now,
    updated_at: now
  };

  documents.push(doc);
  saveDocuments();  // 持久化
  
  return doc;
}

/**
 * 列出文档（支持按 topic_title 筛选）
 * @param {Object} filters - 筛选条件
 * @param {string} [filters.topic_title] - 按 topic_title 精确筛选
 * @returns {Document[]} 文档数组
 */
export function listDocuments(filters = {}) {
  let result = [...documents];

  // 按 topic_title 精确筛选
  if (filters.topic_title !== undefined && filters.topic_title !== null && filters.topic_title !== "") {
    result = result.filter(doc => doc.topic_title === filters.topic_title);
  }

  // 按创建时间倒序排列
  result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return result;
}

/**
 * 根据 doc_id 查找文档
 * @param {string} docId - 文档 ID
 * @returns {Document|undefined} 文档对象或 undefined
 */
export function getDocument(docId) {
  return documents.find(doc => doc.doc_id === docId);
}

/**
 * 更新文档
 * @param {string} docId - 文档 ID
 * @param {Object} updates - 要更新的字段
 * @returns {Document|null} 更新后的文档，找不到返回 null
 */
export function updateDocument(docId, updates) {
  const doc = getDocument(docId);
  if (!doc) {
    return null;
  }

  // 更新字段
  if (updates.topic_title !== undefined) doc.topic_title = updates.topic_title;
  if (updates.doc_questions !== undefined) doc.doc_questions = updates.doc_questions;
  if (updates.doc_hypotheses !== undefined) doc.doc_hypotheses = updates.doc_hypotheses;
  if (updates.story_units !== undefined) doc.story_units = updates.story_units;
  
  // 更新时间戳
  doc.updated_at = new Date().toISOString();

  saveDocuments();  // 持久化
  
  return doc;
}

/**
 * 删除文档
 * @param {string} docId - 文档 ID
 * @returns {boolean} 是否成功删除
 */
export function deleteDocument(docId) {
  const index = documents.findIndex(doc => doc.doc_id === docId);
  if (index === -1) {
    return false;
  }
  
  documents.splice(index, 1);
  saveDocuments();  // 持久化
  
  return true;
}

/**
 * 获取所有文档（用于调试）
 */
export function getAllDocuments() {
  return [...documents];
}

/**
 * 重新加载数据（用于调试或热重载）
 */
export function reloadDocuments() {
  loadDocuments();
}


