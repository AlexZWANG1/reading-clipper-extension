// ========= Agent 服务 =========
// Agent1（卡片级）：调用 Reading Highlight Summarizer stored prompt（JSON 输出）
// Agent2（文档级）：Document Storyline Builder（JSON 输出）

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// 确保环境变量已加载（ES 模块 import 先于 server.mjs 的 dotenv.config() 执行）
const __agents_file = fileURLToPath(import.meta.url);
const __agents_dir = path.dirname(__agents_file);
dotenv.config({ path: path.join(__agents_dir, "../../.env") });

// ========= Prompt 配置加载 =========
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPTS_CONFIG_PATH = path.join(__dirname, "../config/prompts.config.json");

// 缓存配置
let promptsConfigCache = null;
let configLastModified = 0;

/**
 * 加载 prompt 配置（带缓存）
 */
function loadPromptsConfig() {
  try {
    const stats = fs.statSync(PROMPTS_CONFIG_PATH);
    const mtime = stats.mtimeMs;
    
    // 如果文件未修改，使用缓存
    if (promptsConfigCache && mtime === configLastModified) {
      return promptsConfigCache;
    }
    
    const content = fs.readFileSync(PROMPTS_CONFIG_PATH, "utf-8");
    promptsConfigCache = JSON.parse(content);
    configLastModified = mtime;
    
    console.log("✅ Prompts 配置已加载/刷新");
    return promptsConfigCache;
  } catch (error) {
    console.error("❌ 加载 prompts.config.json 失败:", error.message);
    return null;
  }
}

/**
 * 获取指定 prompt 的完整内容（注入模板变量）
 * @param {string} promptId - prompt ID
 * @returns {string|null} 完整的 prompt 内容
 */
function getPromptTemplate(promptId) {
  const config = loadPromptsConfig();
  if (!config || !config.prompts || !config.prompts[promptId]) {
    console.warn(`⚠️ Prompt "${promptId}" 未找到，使用硬编码兜底`);
    return null;
  }
  
  const prompt = config.prompts[promptId];
  
  // Stored prompt 不返回 template
  if (prompt.type === "stored") {
    return null;
  }
  
  let template = prompt.template || "";
  
  // 注入锁定变量
  const lockedVars = prompt.locked_vars || {};
  for (const [varName, value] of Object.entries(lockedVars)) {
    const placeholder = `{{${varName}}}`;
    template = template.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  
  return template;
}

// 初始化时加载配置
loadPromptsConfig();

// 注意：环境变量在 server.mjs 中统一加载，这里直接读取即可
// 请在 .env 文件中设置 OPENAI_API_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ========= 调试：启动时检查 OPENAI_API_KEY =========
console.log("=== OPENAI_API_KEY 调试（agents.mjs） ===");
console.log("是否存在:", !!OPENAI_API_KEY);
console.log(
  "前 15 个字符:",
  OPENAI_API_KEY ? OPENAI_API_KEY.substring(0, 15) + "..." : "未设置"
);
console.log("是否包含占位符 'your_openai':", OPENAI_API_KEY ? OPENAI_API_KEY.includes("your_openai") : "N/A");
console.log("来源:", process.env.OPENAI_API_KEY ? "环境变量" : "硬编码");
console.log("=========================================");
// ============================================
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

// Hypothesis Evaluator Prompt ID（V2，使用 file_search）
const HYPOTHESIS_EVAL_PROMPT_ID = process.env.HYPOTHESIS_EVAL_PROMPT_ID || "pmpt_69354e1907e88195adeca241fa6de2f30b9261dea389a76f";

// ========= 模型配置（根据 OpenAI 官方文档优化）=========
// 根据任务复杂度选择合适的模型：
// - gpt-5.2: 最新旗舰，复杂推理、多步骤任务、Vision
// - gpt-5-mini: 快速低成本推理（400K上下文，支持 file_search）
// - gpt-5-nano: 高吞吐量、简单指令跟随
const OPENAI_MODEL = "gpt-5-mini"; // 默认用于 Stored Prompt（Agent1 文本、Search Agent）
const OPENAI_MODEL_COMPLEX = "gpt-5.2"; // 用于复杂推理任务（Agent2、文档 Q/H、Story Unit Refiner）
const OPENAI_MODEL_SIMPLE = "gpt-5-nano"; // 用于简单任务（标题生成、单元标题）
const HIGHLIGHT_SUMMARIZER_PROMPT_ID = "pmpt_692adaa16b2081909364455f9306be420aa65b20d7fe063b";
const AGENT2_PROMPT_ID = "pmpt_692aef7907808197b03ae162b8fdd8d90ef09436c71562ae";

/**
 * 从 Responses API 的 output 数组中兜底提取文本
 */
function extractTextFromResponse(data) {
  const outputs = data.output || [];
  const parts = [];
  for (const item of outputs) {
    if (!item || !Array.isArray(item.content)) continue;
    for (const c of item.content) {
      if (c.type === "output_text" && typeof c.text === "string") {
        parts.push(c.text);
      }
    }
  }
  return parts.join("\n\n");
}

/**
 * 调用 OpenAI Responses API 上的 Reading Highlight Summarizer stored prompt
 * 
 * @param {Object} params
 * @param {string} params.snippet - 原始划线文本
 * @param {string} [params.preSummary] - 用户提供的一句话总结
 * @param {string} [params.sourceName] - 来源名称
 * @param {string} [params.sourceUrl] - 来源 URL
 * @returns {Promise<string>} JSON 字符串（Agent1 的输出）
 */
async function callHighlightSummarizer({ snippet, preSummary, sourceName, sourceUrl }) {
  // ========= 调试：每次调用时检查 key =========
  console.log("=== callHighlightSummarizer 调用检查 ===");
  console.log("OPENAI_API_KEY 是否存在:", !!OPENAI_API_KEY);
  if (OPENAI_API_KEY) {
    console.log("OPENAI_API_KEY 前10个字符:", OPENAI_API_KEY.substring(0, 10) + "...");
    console.log("OPENAI_API_KEY 是否看起来像占位符:",
      OPENAI_API_KEY.includes("your_openai") ||
      OPENAI_API_KEY.includes("your_ope") ||
      OPENAI_API_KEY === "your_openai_api_key_here"
    );
  }
  console.log("=======================================");
  // ============================================

  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set in environment variables");
  }

  const inputText = [
    `topic: -`,  // 目前没有 topic，先统一传 '-' 占位
    `pre_summary: ${preSummary || "(none)"}`,
    `source_name: ${sourceName || "(none)"}`,
    `source_url: ${sourceUrl || "(none)"}`,
    "",
    "snippet:",
    '"""',
    snippet,
    '"""'
  ].join("\n");

  const payload = {
    model: OPENAI_MODEL,
    prompt: { id: HIGHLIGHT_SUMMARIZER_PROMPT_ID },
    input: inputText
  };

  // 添加超时和重试逻辑
  let resp;
  const maxRetries = 2;
  const timeoutMs = 30000; // 30秒超时

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`⚠️ 第 ${attempt} 次重试 OpenAI API 调用...`);
        // 等待后重试（递增延迟：1秒、2秒）
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }

      // 创建 AbortController 用于超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      try {
        resp = await fetch(OPENAI_RESPONSES_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // 如果成功，跳出重试循环
        break;
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (fetchError) {
      const errorCode = fetchError.code || fetchError.name || 'UNKNOWN';
      const errorMessage = fetchError.message || String(fetchError);

      console.error(`❌ OpenAI API 网络请求失败（尝试 ${attempt + 1}/${maxRetries + 1}）:`);
      console.error(`   错误代码: ${errorCode}`);
      console.error(`   错误信息: ${errorMessage}`);

      // 如果是最后一次尝试，抛出详细错误
      if (attempt === maxRetries) {
        throw new Error(
          `OpenAI API 网络请求失败（已重试 ${maxRetries} 次）\n` +
          `错误代码: ${errorCode}\n` +
          `错误信息: ${errorMessage}\n` +
          `\n可能原因：\n` +
          `1. 网络连接不稳定或中断\n` +
          `2. 需要配置代理才能访问 OpenAI（在中国大陆）\n` +
          `3. 防火墙或安全软件拦截\n` +
          `4. OpenAI API 服务暂时不可用\n` +
          `\n建议：\n` +
          `- 检查网络连接是否正常\n` +
          `- 如果在中国大陆，可能需要配置代理\n` +
          `- 检查防火墙设置\n` +
          `- 稍后重试`
        );
      }
    }
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`OpenAI API 请求失败：${resp.status} - ${text}`);
  }

  const data = await resp.json();

  // Responses API 的推荐用法：先看 output_text，再兜底 output[]
  const textOutput = data.output_text || extractTextFromResponse(data);
  if (!textOutput) {
    throw new Error("OpenAI Responses API 返回空 output_text");
  }

  return textOutput;
}

/**
 * 解析 Snippet Note Markdown 为 Card 字段（兼容旧格式）
 * 
 * 输入格式：
 * #### Snippet Note
 * - topic: ...
 * - summary: ...
 * - key_points:
 *   - bullet 1
 *   - bullet 2
 * - source: SOURCE_NAME (SOURCE_URL)
 * - raw_snippet:
 *   > ...
 *   > ...
 * 
 * @param {string} markdownText - Markdown 格式的 Snippet Note
 * @returns {Object} 解析后的字段 { summary, key_points, source_name, source_url, raw_snippet }
 */
function parseSnippetNoteMarkdown(markdownText) {
  const lines = markdownText.split(/\r?\n/);

  let summary = "";
  const keyPoints = [];
  let sourceLine = "";
  const rawSnippetLines = [];

  let inKeyPoints = false;
  let inRawSnippet = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // 跳过标题行
    if (trimmed.startsWith("####") || trimmed.startsWith("#")) {
      continue;
    }

    if (trimmed.match(/^-\s*summary\s*:/i)) {
      summary = trimmed.replace(/^-\s*summary\s*:/i, "").trim();
      inKeyPoints = false;
      inRawSnippet = false;
      continue;
    }

    if (trimmed.match(/^-\s*key_points?\s*:/i)) {
      inKeyPoints = true;
      inRawSnippet = false;
      continue;
    }

    if (trimmed.match(/^-\s*source\s*:/i)) {
      sourceLine = trimmed.replace(/^-\s*source\s*:/i, "").trim();
      inKeyPoints = false;
      inRawSnippet = false;
      continue;
    }

    if (trimmed.match(/^-\s*raw_snippet\s*:/i)) {
      inKeyPoints = false;
      inRawSnippet = true;
      continue;
    }

    if (inKeyPoints && trimmed.startsWith("-")) {
      const point = trimmed.replace(/^-\s*/, "").trim();
      if (point && !point.match(/^key_points?/i)) {
        keyPoints.push(point);
      }
      continue;
    }

    if (inRawSnippet && trimmed.startsWith(">")) {
      rawSnippetLines.push(trimmed.replace(/^>\s?/, ""));
      continue;
    }

    if (inKeyPoints && trimmed === "") {
      continue;
    }
  }

  // 解析 source_line -> source_name / source_url
  let source_name = null;
  let source_url = null;
  if (sourceLine && sourceLine !== "-") {
    // 格式可能是：SOURCE_NAME (SOURCE_URL) 或 SOURCE_URL
    const match = sourceLine.match(/^(.*?)(?:\s*\((https?:\/\/[^)]+)\))?$/);
    if (match) {
      const namePart = match[1].trim();
      const urlPart = match[2]?.trim();
      if (namePart && namePart !== "-") source_name = namePart;
      if (urlPart) source_url = urlPart;
      // 如果 namePart 本身就是 URL，则作为 source_url
      if (!urlPart && /^https?:\/\//.test(namePart)) {
        source_url = namePart;
        source_name = null;
      }
    } else {
      source_name = sourceLine;
    }
  }

  const raw_snippet = rawSnippetLines.join("\n").trim();

  return {
    summary,
    key_points: keyPoints,
    source_name,
    source_url,
    raw_snippet
  };
}

/**
 * 使用 Chat API 处理包含图片的卡片生成请求
 * 替代 stored prompt，因为 stored prompt 可能不支持多模态或 input 格式受限
 */
async function callHighlightSummarizerWithImage({ snippetText, imageData, preSummary, sourceName, sourceUrl }) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  // 从配置加载 prompt，兜底使用硬编码
  let basePrompt = getPromptTemplate("vision_card_generator");
  if (!basePrompt) {
    basePrompt = `You are an intelligent reading assistant. Your task is to analyze the user's input (which includes text and/or an image) and extract structured knowledge.

Please extract the following fields and return them in JSON format:
- summary: A concise summary of the content (1-3 sentences).
- key_points: A list of key takeaways or bullet points.
- source_name: The name of the source (use the provided source_name if available, otherwise try to infer from context).
- source_url: The URL of the source (use the provided source_url if available).
- raw_snippet: The original text content. If the input is primarily an image, provide a brief text transcription or description of the image content here.`;
  }

  // 注入用户元数据
  const userMetadata = `User provided metadata:
- Pre-summary: ${preSummary || "(none)"}
- Source Name: ${sourceName || "(none)"}
- Source URL: ${sourceUrl || "(none)"}`;

  const systemPrompt = basePrompt.replace("{{USER_METADATA}}", userMetadata);

  const userContent = [];

  // 添加文本内容
  if (snippetText && snippetText.trim()) {
    userContent.push({ type: "text", text: snippetText });
  } else {
    // 如果只有图片，添加提示词引导模型
    userContent.push({ type: "text", text: "Please analyze this image and extract key information." });
  }

  // 添加图片内容
  if (imageData) {
    userContent.push({
      type: "image_url",
      image_url: {
        url: imageData, // 应该是 data:image/png;base64,... 格式
        detail: "high" // 显式指定高清晰度模式，对应用户对高质量模型的要求
      }
    });
  }

  const payload = {
    model: OPENAI_MODEL_COMPLEX, // Vision 卡片生成需要旗舰模型（gpt-5.2 支持 Vision）
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ],
    response_format: { type: "json_object" },
    temperature: 0.3
  };

  // 添加超时和重试逻辑 (复用之前的逻辑结构)
  const maxRetries = 2;
  const timeoutMs = 60000; // 图片处理可能稍慢，给 60 秒
  let resp;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`⚠️ 第 ${attempt} 次重试 Vision API 调用...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        resp = await fetch(OPENAI_CHAT_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        break;
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (error) {
      console.error(`❌ Vision API 请求失败（尝试 ${attempt + 1}）:`, error.message);
      if (attempt === maxRetries) throw error;
    }
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`OpenAI Chat API (Vision) request failed: ${resp.status} - ${text}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenAI returned empty content");
  }

  return content;
}

/**
 * Agent1：卡片级变量生成（summary / key_points / source_* / raw_snippet）
 * 
 * 调用 Reading Highlight Summarizer stored prompt
 * 兼容 JSON 和 Markdown 两种输出格式
 * 
 * @param {Object} params
 * @param {string} params.snippet - 原始划线文本
 * @param {string} [params.preSummary] - 用户提供的一句话总结
 * @param {string} [params.sourceName] - 来源名称
 * @param {string} [params.sourceUrl] - 来源 URL
 * @returns {Promise<Object>} 卡片数据（不含 id、created_at、mode）
 */
export async function runAgent1({
  snippet,
  imageData,
  preSummary,
  sourceName,
  sourceUrl
}) {
  const text = (snippet || "").trim();
  let raw;

  if (imageData) {
    // === 有图片，使用 Vision API ===
    console.log("=== 检测到图片，切换到 Vision 模式 ===");
    console.log("文本长度:", text.length);
    console.log("图片数据长度:", imageData.length);

    raw = await callHighlightSummarizerWithImage({
      snippetText: text,
      imageData,
      preSummary,
      sourceName,
      sourceUrl
    });
  } else {
    // === 纯文本，使用原有的 Stored Prompt ===
    raw = await callHighlightSummarizer({
      snippet: text,
      preSummary,
      sourceName,
      sourceUrl
    });
  }

  // ========= 调试日志 =========
  console.log("=== Agent1 OpenAI 返回的原始文本 ===");
  console.log(raw);
  console.log("====================================");
  // ============================================

  // 2) 尝试解析：先尝试 JSON，失败则尝试 Markdown
  let cardObj;

  // 2.1 尝试 JSON 解析
  try {
    cardObj = JSON.parse(raw);
    console.log("✅ 成功解析为 JSON 格式");
  } catch (jsonError) {
    // 2.2 JSON 解析失败，尝试 Markdown 解析
    console.log("⚠️ JSON 解析失败，尝试 Markdown 解析...");
    console.log("JSON 解析错误:", jsonError.message);

    try {
      cardObj = parseSnippetNoteMarkdown(raw);
      console.log("✅ 成功解析为 Markdown 格式");
    } catch (markdownError) {
      console.error("❌ Markdown 解析也失败，原始文本：", raw);
      throw new Error(`Agent1 解析失败（JSON 和 Markdown 都失败）: ${markdownError.message}`);
    }
  }

  // ========= 调试日志 =========
  console.log("=== Agent1 解析后的对象 ===");
  console.log(JSON.stringify(cardObj, null, 2));
  console.log("===========================");
  // ============================================

  // 3) 映射到 Card 字段
  return {
    summary: cardObj.summary || "",
    key_points: Array.isArray(cardObj.key_points) ? cardObj.key_points : [],
    source_name:
      cardObj.source_name !== undefined && cardObj.source_name !== null
        ? String(cardObj.source_name)
        : sourceName || null,
    source_url:
      cardObj.source_url !== undefined && cardObj.source_url !== null
        ? String(cardObj.source_url)
        : sourceUrl || null,
    raw_snippet: cardObj.raw_snippet || text,
    image_url: cardObj.image_url || (imageData || null)
  };
}

/**
 * Agent2：文档级结构生成（doc_questions / doc_hypotheses / story_units）
 * 
 * 基于一组 cards 生成 document-level 结构（JSON 输出）
 * 
 * @param {Object} params
 * @param {string} params.topicTitle - 主题标题
 * @param {Array} params.cards - 一组卡片（含 id、summary、key_points、source_name/source_url、raw_snippet）
 * @param {string} [params.docQuestions] - 可选的文档问题（文本形式）
 * @param {string} [params.docHypotheses] - 可选的文档假设（文本形式）
 * @returns {Promise<Object>} 文档结构数据 { doc_questions, doc_hypotheses, story_units }
 */
export async function runAgent2({ topicTitle, cards, docQuestions, docHypotheses }) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set in environment variables");
  }

  const inputLines = [
    `topic_title: ${topicTitle || "-"}`,
    "",
    "doc_questions:",
    (docQuestions && docQuestions.trim()) ? docQuestions : "none",
    "",
    "doc_hypotheses:",
    (docHypotheses && docHypotheses.trim()) ? docHypotheses : "none",
    "",
    "cards:",
    JSON.stringify(cards, null, 2)
  ];

  const payload = {
    model: OPENAI_MODEL_COMPLEX, // Agent2 是复杂推理任务，使用 gpt-5.1
    prompt: { id: AGENT2_PROMPT_ID },
    input: inputLines.join("\n")
  };

  const resp = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`OpenAI Agent2 请求失败：${resp.status} - ${text}`);
  }

  const data = await resp.json();
  const textOutput = data.output_text || extractTextFromResponse(data);
  if (!textOutput) {
    throw new Error("Agent2 返回空 output_text");
  }

  // ========= 调试日志 =========
  console.log("=== Agent2 OpenAI 返回的原始文本 ===");
  console.log(textOutput);
  console.log("====================================");
  // ============================================

  // 解析 JSON
  let docStruct;
  try {
    docStruct = JSON.parse(textOutput);
  } catch (e) {
    console.error("Agent2 JSON parse error, raw:", textOutput);
    throw new Error(`Agent2 JSON parse error: ${e.message}`);
  }

  // ========= 调试日志 =========
  console.log("=== Agent2 解析后的 JSON 对象 ===");
  console.log(JSON.stringify(docStruct, null, 2));
  console.log("=================================");
  // ============================================

  return {
    doc_questions: Array.isArray(docStruct.doc_questions) ? docStruct.doc_questions : [],
    doc_hypotheses: Array.isArray(docStruct.doc_hypotheses) ? docStruct.doc_hypotheses : [],
    story_units: Array.isArray(docStruct.story_units) ? docStruct.story_units : []
  };
}

/**
 * Search Agent：语义搜索卡片
 * 
 * 基于用户查询和卡片列表，返回相关卡片的 ID 列表（按相关性排序）
 * 使用 Chat API 和自定义 system prompt
 * 
 * @param {Object} params
 * @param {string} params.query - 用户的搜索查询
 * @param {Array} params.cards - 候选卡片数组
 * @returns {Promise<string[]>} 相关卡片的 ID 列表（按相关性排序）
 */
export async function runSearchAgent({ query, cards }) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set in environment variables");
  }

  // 限制卡片数量，避免请求过大（最多 100 张）
  const maxCards = 100;
  const limitedCards = cards.slice(0, maxCards);

  // 构造精简的卡片列表（只包含搜索需要的字段）
  const compactCards = limitedCards.map((c) => ({
    id: c.id,
    summary: c.summary || "",
    key_points: Array.isArray(c.key_points) ? c.key_points.slice(0, 5) : [], // 限制要点数量
    source_name: c.source_name || "",
    topic_title: c.topic_title || ""
  }));

  // 从配置加载 prompt，兜底使用硬编码
  let systemPrompt = getPromptTemplate("search_agent");
  if (!systemPrompt) {
    systemPrompt = `你是一个智能搜索助手。你的任务是根据用户的查询，从给定的卡片列表中找出最相关的卡片，并按相关性从高到低排序。

规则：
1. 分析用户查询的意图和关键词
2. 评估每张卡片与查询的相关性（考虑摘要、要点、主题等）
3. 返回一个 JSON 对象，格式为：{ "card_ids": ["id1", "id2", "id3", ...] }
4. card_ids 数组中的 ID 按相关性从高到低排序
5. 只返回最相关的卡片，如果相关卡片少于 10 张，可以全部返回；如果超过 10 张，只返回前 10 张最相关的

输出必须是有效的 JSON，不要包含任何其他文本。`;
  }

  // User message：包含查询和卡片数据
  const userMessage = `用户查询：${query}

卡片列表：
${JSON.stringify(compactCards, null, 2)}

请返回最相关的卡片 ID 列表（按相关性排序），格式：{ "card_ids": [...] }`;

  const payload = {
    model: OPENAI_MODEL, // Search Agent 使用 gpt-5-mini（成本优化的推理）
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ],
    temperature: 0.3, // 降低随机性，提高一致性
    response_format: { type: "json_object" } // 强制 JSON 输出
  };

  // ========= 调试日志 =========
  console.log("=== Search Agent 调用 ===");
  console.log("查询:", query);
  console.log("候选卡片数量:", cards.length, "（限制为", limitedCards.length, "张）");
  console.log("========================");
  // ============================================

  // 添加超时和重试逻辑
  let resp;
  const maxRetries = 2;
  const timeoutMs = 30000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`⚠️ 第 ${attempt} 次重试 Search Agent 调用...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        resp = await fetch(OPENAI_CHAT_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        break;
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (fetchError) {
      const errorCode = fetchError.code || fetchError.name || 'UNKNOWN';
      const errorMessage = fetchError.message || String(fetchError);

      console.error(`❌ Search Agent 网络请求失败（尝试 ${attempt + 1}/${maxRetries + 1}）:`);
      console.error(`   错误代码: ${errorCode}`);
      console.error(`   错误信息: ${errorMessage}`);

      if (attempt === maxRetries) {
        throw new Error(`Search Agent 网络请求失败（已重试 ${maxRetries} 次）: ${errorMessage}`);
      }
    }
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Search Agent 请求失败：${resp.status} - ${text}`);
  }

  const data = await resp.json();

  // Chat API 返回格式：{ choices: [{ message: { content: "..." } }] }
  const textOutput = data.choices?.[0]?.message?.content;

  if (!textOutput) {
    throw new Error("Search Agent 返回空内容");
  }

  // ========= 调试日志 =========
  console.log("=== Search Agent 返回的原始文本 ===");
  console.log(textOutput);
  console.log("==================================");
  // ============================================

  // 解析 JSON，期望格式：{ "card_ids": ["id1", "id2", ...] }
  let result;
  try {
    result = JSON.parse(textOutput);
  } catch (e) {
    console.error("Search Agent JSON parse error, raw:", textOutput);
    // 尝试提取 JSON（如果被包裹在 markdown 代码块中）
    const jsonMatch = textOutput.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch) {
      try {
        result = JSON.parse(jsonMatch[1]);
      } catch (e2) {
        throw new Error(`Search Agent JSON parse error: ${e.message}`);
      }
    } else {
      throw new Error(`Search Agent JSON parse error: ${e.message}`);
    }
  }

  // ========= 调试日志 =========
  console.log("=== Search Agent 解析后的结果 ===");
  console.log(JSON.stringify(result, null, 2));
  console.log("================================");
  // ============================================

  const cardIds = Array.isArray(result.card_ids) ? result.card_ids : [];

  if (cardIds.length === 0) {
    console.warn("⚠️ Search Agent 返回空结果，返回所有卡片");
    return limitedCards.map(c => c.id);
  }

  return cardIds;
}

/**
 * 根据卡片内容生成文档标题
 * 使用 ChatGPT 生成一个非常简短的标题（不超过 10 个字）
 * 
 * @param {Object[]} cards - 卡片数组
 * @returns {Promise<string>} 生成的标题
 */
export async function generateDocumentTitle(cards) {
  if (!cards || cards.length === 0) {
    return "临时文档";
  }

  // 提取卡片的关键内容（summary 或 raw_snippet）
  const contents = cards
    .slice(0, 5) // 最多取前 5 张卡片
    .map(c => {
      const summary = (c.summary || "").trim();
      const snippet = (c.raw_snippet || "").trim();
      return summary || snippet;
    })
    .filter(Boolean)
    .slice(0, 3); // 最多取前 3 个内容片段

  if (contents.length === 0) {
    return "临时文档";
  }

  const combinedContent = contents.join("\n\n");

  const prompt = `请根据以下卡片内容，生成一个非常简短的文档标题。

**严格要求：**
1. 标题必须不超过 10 个字（中文字符）
2. 不要包含标点符号（如：、。，！？等）
3. 只返回标题文本，不要包含任何其他说明、引号或解释
4. 标题应该简洁、准确、概括性强

卡片内容：
${combinedContent}

请只返回标题文本：`;

  try {
    const payload = {
      model: OPENAI_MODEL_SIMPLE, // 生成标题是简单任务，使用 gpt-5-nano（高吞吐量）
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
      // gpt-5-nano 只支持 model 和 messages 参数，不支持其他任何参数
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 秒超时

    let resp;
    try {
      resp = await fetch(OPENAI_CHAT_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === "AbortError") {
        throw new Error("生成标题超时");
      }
      throw fetchError;
    }

    if (!resp.ok) {
      const errorText = await resp.text().catch(() => "");
      throw new Error(`OpenAI API 错误: ${resp.status} ${errorText}`);
    }

    const data = await resp.json();
    const title = data.choices?.[0]?.message?.content?.trim();

    if (!title) {
      throw new Error("OpenAI 返回空标题");
    }

    // 清理标题：移除可能的引号、换行等
    let cleanTitle = title
      .replace(/^["']|["']$/g, "") // 移除首尾引号
      .replace(/[。，、！？：；]/g, "") // 移除标点符号
      .replace(/\n/g, " ") // 替换换行为空格
      .trim();

    // 限制标题长度：如果超过 10 个中文字符，截断
    // 中文字符通常占 1 个字符宽度，英文和数字占 0.5 个字符宽度
    // 简单处理：按字符数限制，10 个字符
    if (cleanTitle.length > 10) {
      // 尝试在合适的位置截断（避免截断词语）
      let truncated = cleanTitle.substring(0, 10);
      // 如果截断位置不是空格或标点，尝试向前找到空格或标点
      const lastChar = cleanTitle.charAt(9);
      if (lastChar && !/[\s，。、！？：；]/.test(lastChar)) {
        // 向前查找空格或标点
        const spaceIndex = truncated.lastIndexOf(' ');
        if (spaceIndex > 5) {
          truncated = truncated.substring(0, spaceIndex);
        }
      }
      cleanTitle = truncated.trim();
      console.warn(`⚠️ 标题过长，已截断为: "${cleanTitle}"`);
    }

    return cleanTitle || "临时文档";
  } catch (error) {
    console.error("生成文档标题失败：", error);
    // 兜底：综合前几张卡片的内容生成标题，不截断、不加省略号
    const fallbackCards = cards.slice(0, 5);
    if (fallbackCards.length === 0) return "临时文档";

    const combined = fallbackCards
      .map(c => (c.summary || c.raw_snippet || "").trim())
      .filter(Boolean)
      .join(" / ");

    if (!combined) return "临时文档";

    const clean = combined.replace(/\s+/g, " ").trim();
    return clean || "临时文档";
  }
}

/**
 * AI 建议问题
 * 基于文档主题和卡片摘要，生成 3-5 个候选问题
 * 
 * @param {Object} params
 * @param {string} params.topicTitle - 文档主题
 * @param {string[]} params.cardSummaries - 卡片摘要列表
 * @returns {Promise<string[]>} 建议问题列表
 */
export async function suggestQuestions({ topicTitle, cardSummaries }) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const summariesText = cardSummaries.slice(0, 10).join("\n- ");

  const prompt = `你是一个研究助手。基于以下研究主题和卡片摘要，生成 3-5 个有价值的研究问题。

研究主题：${topicTitle || "未命名主题"}

相关卡片摘要：
- ${summariesText}

要求：
1. 问题应该有深度，能够引导进一步思考
2. 问题应该与卡片内容相关
3. 每个问题独立成行
4. 只返回问题列表，不要其他说明

返回 JSON 格式：{ "questions": ["问题1", "问题2", "问题3"] }`;

  try {
    const payload = {
      model: OPENAI_MODEL, // 建议问题需要一定推理能力，使用 gpt-5-mini
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      response_format: { type: "json_object" }
    };

    const resp = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      throw new Error(`API 请求失败: ${resp.status}`);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    const result = JSON.parse(content);

    return Array.isArray(result.questions) ? result.questions : [];
  } catch (error) {
    console.error("AI 建议问题失败：", error);
    throw error;
  }
}

/**
 * AI 建议假设
 * 基于文档主题、已有问题和卡片摘要，生成 3-5 个候选假设
 * 
 * @param {Object} params
 * @param {string} params.topicTitle - 文档主题
 * @param {string[]} params.questions - 已有的问题列表
 * @param {string[]} params.cardSummaries - 卡片摘要列表
 * @returns {Promise<string[]>} 建议假设列表
 */
export async function suggestHypotheses({ topicTitle, questions, cardSummaries }) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const questionsText = questions.length > 0 ? questions.join("\n- ") : "暂无";
  const summariesText = cardSummaries.slice(0, 10).join("\n- ");

  // 构建上下文
  const context = `研究主题：${topicTitle || "未命名主题"}

研究问题：
- ${questionsText}

相关卡片摘要：
- ${summariesText}`;

  // 从配置加载 prompt，兜底使用硬编码
  let basePrompt = getPromptTemplate("hypothesis_suggest");
  let prompt;
  
  if (basePrompt) {
    prompt = basePrompt.replace("{{CONTEXT}}", context);
  } else {
    prompt = `你是一个研究助手。基于以下研究主题、问题和卡片摘要，生成 3-5 个有价值的研究假设。

${context}

要求：
1. 假设应该是可验证的论断
2. 假设应该与问题和卡片内容相关
3. 每个假设独立成行
4. 只返回假设列表，不要其他说明

返回 JSON 格式：{ "hypotheses": ["假设1", "假设2", "假设3"] }`;
  }

  try {
    const payload = {
      model: OPENAI_MODEL, // 建议问题需要一定推理能力，使用 gpt-5-mini
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      response_format: { type: "json_object" }
    };

    const resp = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      throw new Error(`API 请求失败: ${resp.status}`);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    const result = JSON.parse(content);

    return Array.isArray(result.hypotheses) ? result.hypotheses : [];
  } catch (error) {
    console.error("AI 建议假设失败：", error);
    throw error;
  }
}

/**
 * AI 建议故事单元标题
 * 基于核心论点和卡片摘要，生成 2-3 个候选标题
 * 
 * @param {Object} params
 * @param {string} params.corePoint - 单元核心论点
 * @param {string[]} params.cardSummaries - 单元内卡片摘要列表
 * @returns {Promise<string[]>} 建议标题列表
 */
export async function suggestUnitTitles({ corePoint, cardSummaries }) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const summariesText = cardSummaries.length > 0
    ? cardSummaries.slice(0, 5).join("\n- ")
    : "暂无卡片";

  const prompt = `你是一个写作助手。基于以下核心论点和卡片摘要，生成 2-3 个简洁的小节标题。

核心论点：${corePoint || "暂无"}

相关卡片摘要：
- ${summariesText}

要求：
1. 标题应该简洁明了（5-15 个字）
2. 标题应该概括核心论点和卡片内容
3. 每个标题独立成行
4. 只返回标题列表，不要其他说明

返回 JSON 格式：{ "titles": ["标题1", "标题2", "标题3"] }`;

  try {
    const payload = {
      model: OPENAI_MODEL_SIMPLE, // 建议单元标题是简单任务，使用 gpt-5-nano（高吞吐量）
      messages: [{ role: "user", content: prompt }],
      // gpt-5-nano 不支持 temperature 参数，只支持基本参数
      response_format: { type: "json_object" }
    };

    const resp = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      throw new Error(`API 请求失败: ${resp.status}`);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    const result = JSON.parse(content);

    return Array.isArray(result.titles) ? result.titles : [];
  } catch (error) {
    console.error("AI 建议标题失败：", error);
    throw error;
  }
}

// ========= 新增：文档级 Q/H Assistant =========
// stored prompt ID: pmpt_693403a72648819381047b969a1e493b020b8d07d3b58032

const DOC_QH_ASSISTANT_PROMPT_ID = "pmpt_693403a72648819381047b969a1e493b020b8d07d3b58032";

/**
 * 文档级问题 & 假设 AI 微调
 * 
 * @param {Object} params
 * @param {string} params.mode - "questions" | "hypotheses" | "both"
 * @param {string} params.topicTitle - 主题标题
 * @param {string} params.docQuestions - 当前文档问题（多行文本）
 * @param {string} params.docHypotheses - 当前文档假设（多行文本）
 * @param {Array} params.cards - 关联的卡片列表
 * @returns {Promise<Object>} { doc_questions, doc_hypotheses }
 */
export async function runDocQHAssistant({
  mode,
  topicTitle,
  docQuestions,
  docHypotheses,
  cards
}) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set in environment variables");
  }

  const inputLines = [
    `mode: ${mode || "both"}`,
    "",
    `topic_title: ${topicTitle || "-"}`,
    "",
    "current_doc_questions:",
    docQuestions && docQuestions.trim() ? docQuestions : "none",
    "",
    "current_doc_hypotheses:",
    docHypotheses && docHypotheses.trim() ? docHypotheses : "none",
    "",
    "cards:",
    JSON.stringify(cards, null, 2)
  ];

  const payload = {
    model: OPENAI_MODEL_COMPLEX, // 文档 Q/H Assistant 是复杂推理任务，使用 gpt-5.1
    prompt: { id: DOC_QH_ASSISTANT_PROMPT_ID },
    input: inputLines.join("\n")
  };

  console.log("=== runDocQHAssistant 调用 ===");
  console.log("Mode:", mode);
  console.log("Topic:", topicTitle);
  console.log("Cards count:", cards?.length || 0);
  console.log("=============================");

  const resp = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Q/H Assistant 请求失败：${resp.status} - ${text}`);
  }

  const data = await resp.json();
  const textOutput = data.output_text || extractTextFromResponse(data);
  if (!textOutput) {
    throw new Error("Q/H Assistant 返回空 output_text");
  }

  console.log("=== Q/H Assistant 返回的原始文本 ===");
  console.log(textOutput);
  console.log("====================================");

  let result;
  try {
    result = JSON.parse(textOutput);
  } catch (e) {
    console.error("Q/H Assistant JSON parse error, raw:", textOutput);
    throw new Error(`Q/H Assistant JSON parse error: ${e.message}`);
  }

  return {
    doc_questions: Array.isArray(result.doc_questions) ? result.doc_questions : [],
    doc_hypotheses: Array.isArray(result.doc_hypotheses) ? result.doc_hypotheses : []
  };
}

// ========= 新增：Story Unit Refiner =========
// stored prompt ID: pmpt_693403c16c48819689860992e10908c20e8f621eb6e784c2

const STORY_UNIT_REFINER_PROMPT_ID = "pmpt_693403c16c48819689860992e10908c20e8f621eb6e784c2";

/**
 * 单个 Story Unit 的 AI 改写
 * 
 * @param {Object} params
 * @param {string} params.topicTitle - 主题标题
 * @param {Array} params.docQuestions - 文档问题数组
 * @param {Array} params.docHypotheses - 文档假设数组
 * @param {Object} params.targetStoryUnit - 目标 story unit
 * @param {Array} params.cards - 该 unit 关联的卡片
 * @returns {Promise<Object>} { unit_id, title, core_point, notes_for_writer }
 */
export async function runStoryUnitRefiner({
  topicTitle,
  docQuestions,
  docHypotheses,
  targetStoryUnit,
  cards
}) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set in environment variables");
  }

  const inputLines = [
    `topic_title: ${topicTitle || "-"}`,
    "",
    "doc_questions:",
    JSON.stringify(docQuestions || [], null, 2),
    "",
    "doc_hypotheses:",
    JSON.stringify(docHypotheses || [], null, 2),
    "",
    "target_story_unit:",
    JSON.stringify(targetStoryUnit, null, 2),
    "",
    "cards:",
    JSON.stringify(cards, null, 2)
  ];

  const payload = {
    model: OPENAI_MODEL_COMPLEX, // Story Unit Refiner 是复杂推理任务，使用 gpt-5.1
    prompt: { id: STORY_UNIT_REFINER_PROMPT_ID },
    input: inputLines.join("\n")
  };

  console.log("=== runStoryUnitRefiner 调用 ===");
  console.log("Topic:", topicTitle);
  console.log("Target Unit:", targetStoryUnit?.unit_id);
  console.log("Cards count:", cards?.length || 0);
  console.log("================================");

  const resp = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Story Unit Refiner 请求失败：${resp.status} - ${text}`);
  }

  const data = await resp.json();
  const textOutput = data.output_text || extractTextFromResponse(data);
  if (!textOutput) {
    throw new Error("Story Unit Refiner 返回空 output_text");
  }

  console.log("=== Story Unit Refiner 返回的原始文本 ===");
  console.log(textOutput);
  console.log("=========================================");

  let result;
  try {
    result = JSON.parse(textOutput);
  } catch (e) {
    console.error("Story Unit Refiner JSON parse error, raw:", textOutput);
    throw new Error(`Story Unit Refiner JSON parse error: ${e.message}`);
  }

  return {
    unit_id: result.unit_id || targetStoryUnit.unit_id,
    title: result.title || targetStoryUnit.title,
    core_point: result.core_point || targetStoryUnit.core_point,
    notes_for_writer: Array.isArray(result.notes_for_writer) ? result.notes_for_writer : []
  };
}

/**
 * Hypothesis Evaluator V2（基于 file_search）
 * 
 * 使用 Vector Store + file_search 工具检索证据，评估假设
 * 
 * @param {Object} params
 * @param {string} params.topicTitle - 主题标题
 * @param {Question[]} params.docQuestions - 文档级问题
 * @param {Hypothesis[]} params.targetHypotheses - 要评估的假设列表
 * @param {string} params.vectorStoreId - Vector Store ID
 * @param {string[]} [params.allowedCardIds] - 可选，限制只使用这些卡片
 * @returns {Promise<Object>} { topic_title, global_summary, evaluations, used_card_ids }
 */
export async function runHypothesisEvaluatorV2({
  topicTitle,
  docQuestions,
  targetHypotheses,
  vectorStoreId,
  allowedCardIds = null
}) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  if (!HYPOTHESIS_EVAL_PROMPT_ID) {
    throw new Error("HYPOTHESIS_EVAL_PROMPT_ID is not set");
  }

  if (!vectorStoreId) {
    throw new Error("vectorStoreId is required");
  }

  const inputLines = [
    `topic_title: ${topicTitle || "-"}`,
    "",
    "doc_questions:",
    JSON.stringify(docQuestions || [], null, 2),
    "",
    "target_hypotheses:",
    JSON.stringify(targetHypotheses || [], null, 2),
    "",
    "notes:",
    "Use the file_search tool to retrieve relevant card files from this topic's vector store. " +
    "Each file contains exactly one card with a 'card_id: ...' line and other fields."
  ];

  // 如果有限制卡片范围，添加到 notes 中
  if (allowedCardIds && allowedCardIds.length > 0) {
    inputLines.push("");
    inputLines.push("IMPORTANT CONSTRAINT: You MUST ONLY use cards with the following card_ids:");
    inputLines.push(JSON.stringify(allowedCardIds));
    inputLines.push("If file_search returns other cards, ignore them completely. Only include evidence from the allowed cards.");
  }

  // 构建 payload，确保格式正确
  // gpt-5-mini 支持 file_search，无需降级到旧模型
  const payload = {
    model: OPENAI_MODEL, // gpt-5-mini 支持 file_search
    prompt: { id: HYPOTHESIS_EVAL_PROMPT_ID },
    input: inputLines.join("\n"),
    tools: [
      {
        type: "file_search",
        vector_store_ids: [vectorStoreId]
      }
    ]
  };

  // 验证 payload
  if (!payload.prompt || !payload.prompt.id) {
    throw new Error("HYPOTHESIS_EVAL_PROMPT_ID 未设置");
  }
  if (!payload.tools || !Array.isArray(payload.tools) || payload.tools.length === 0) {
    throw new Error("tools 配置无效");
  }
  if (!payload.tools[0].vector_store_ids || !Array.isArray(payload.tools[0].vector_store_ids) || payload.tools[0].vector_store_ids.length === 0) {
    throw new Error("vector_store_ids 未设置或为空");
  }

  console.log("=== Hypothesis Evaluator V2 调用 ===");
  console.log("Topic:", topicTitle);
  console.log("Vector Store ID:", vectorStoreId);
  console.log("Target Hypotheses:", targetHypotheses.length);
  console.log("Allowed Card IDs:", allowedCardIds ? `${allowedCardIds.length} 张限制` : "无限制");
  console.log("OPENAI_API_KEY 前15字符:", OPENAI_API_KEY ? OPENAI_API_KEY.substring(0, 15) + "..." : "未设置");
  console.log("Payload:", JSON.stringify(payload, null, 2));
  console.log("================================");

  let resp;
  try {
    resp = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch (fetchError) {
    console.error("❌ Fetch 请求失败（网络错误）");
    console.error("Error:", fetchError);
    console.error("Error Stack:", fetchError.stack);
    throw new Error(`网络请求失败: ${fetchError.message}`);
  }

  const responseText = await resp.text().catch(() => "");

  if (!resp.ok) {
    console.error("❌ Hypothesis Evaluator V2 API 调用失败");
    console.error("Status:", resp.status);
    console.error("Status Text:", resp.statusText);
    console.error("Response Headers:", Object.fromEntries(resp.headers.entries()));
    console.error("Response Body (前1000字符):", responseText.substring(0, 1000));

    // 尝试解析错误响应
    let errorDetail = responseText;
    let errorCode = null;
    try {
      const errorJson = JSON.parse(responseText);
      if (errorJson.error) {
        errorCode = errorJson.error.code || errorJson.error.type;
        errorDetail = errorJson.error.message || errorJson.error.code || JSON.stringify(errorJson.error);
      } else {
        errorDetail = JSON.stringify(errorJson);
      }
    } catch (e) {
      // 不是 JSON，使用原始文本
    }

    // 如果是模型不存在错误，提供更明确的提示
    if (resp.status === 400 && (errorDetail.includes("model") || errorDetail.includes("invalid"))) {
      throw new Error(`模型不可用或请求格式错误 (${resp.status}): ${errorDetail.substring(0, 300)}。请检查模型名称和 API 格式。`);
    }

    throw new Error(`Hypothesis Evaluator V2 API 调用失败：${resp.status} ${resp.statusText}${errorCode ? ` (${errorCode})` : ''} - ${errorDetail.substring(0, 500)}`);
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (jsonError) {
    console.error("❌ 响应不是有效 JSON");
    console.error("Response Text (前500字符):", responseText.substring(0, 500));
    throw new Error(`API 响应解析失败: ${jsonError.message}。响应内容: ${responseText.substring(0, 200)}`);
  }

  console.log("=== API 响应 ===");
  console.log("Response Status:", resp.status);
  console.log("Response Keys:", Object.keys(data));
  console.log("Has output_text:", !!data.output_text);
  console.log("Has output:", !!data.output);
  console.log("=================");

  // ========== 提取模型文本输出 ==========
  let textOutput = data.output_text;

  // 新版 Responses API：output 是一个数组，message.content 里有 output_text
  if (!textOutput && Array.isArray(data.output)) {
    const textParts = [];

    for (const item of data.output) {
      // 我们只关心 type === "message" 的条目
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const block of item.content) {
          if (block.type === "output_text" && typeof block.text === "string") {
            textParts.push(block.text);
          }
        }
      }
    }

    if (textParts.length > 0) {
      textOutput = textParts.join("\n\n");
    }
  }

  // 兜底：某些版本可能直接在 output 上挂字符串
  if (!textOutput && typeof data.output === "string") {
    textOutput = data.output;
  }

  if (!textOutput) {
    console.error("❌ 无法提取 output_text");
    console.error("Full Response:", JSON.stringify(data, null, 2));
    throw new Error(
      "Hypothesis Evaluator V2 返回空的 output_text。响应数据: " +
      JSON.stringify(data).substring(0, 500)
    );
  }

  // ========== 处理 ```json ... ``` 代码块，提取纯 JSON 文本 ==========
  let jsonText = textOutput.trim();

  // 如果包在 ``` 或 ```json 里，剥掉外面那层
  if (jsonText.startsWith("```")) {
    const match = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (match && match[1]) {
      jsonText = match[1].trim();
    }
  }

  // ========== 解析 JSON ==========
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (parseError) {
    console.error("❌ JSON 解析失败，原始输出：", jsonText);
    throw new Error(
      `Hypothesis Evaluator V2 返回的不是有效 JSON: ${parseError.message
      }。原始输出前200字符: ${jsonText.substring(0, 200)}`
    );
  }

  console.log("✅ Hypothesis Evaluator V2 返回结果");
  console.log("Evaluations:", parsed.evaluations?.length || 0);
  console.log("Used Card IDs:", parsed.used_card_ids?.length || 0);

  return parsed;
}

// ========= 整文件生成卡片功能 =========

/**
 * 获取整文件生成卡片的 System Prompt
 * 从配置加载或使用硬编码兜底
 */
function getFullDocumentSystemPrompt() {
  const configPrompt = getPromptTemplate("full_document_generator");
  if (configPrompt) {
    return configPrompt;
  }
  
  // 兜底使用硬编码
  return FULL_DOCUMENT_SYSTEM_PROMPT_FALLBACK;
}

/**
 * Reading Highlight Summarizer 的 System Prompt（兜底）
 * 用于整文件生成卡片
 */
const FULL_DOCUMENT_SYSTEM_PROMPT_FALLBACK = `You are a "Reading Highlight Summarizer".

Use case:
The user uploads a full document (PDF, Word, or long web article). You see the extracted text of the whole file, not just a small selection.

Your job is to:
- Scan through the document.
- Identify the most important spans (paragraphs / small groups of paragraphs / text around a figure).
- For each important span, generate ONE standardized note block (a "card") in Markdown.
- A single document will therefore usually produce MULTIPLE note blocks.

Each note block is called a Snippet Note and must follow the exact structure below.

Goal:
Given:
- the full text of a document (PDF/Word) or a long passage,
- an optional one-line pre-summary from a previous step,
- an optional topic or context,
- optional source name and URL,

you generate one or more clean, standardized note blocks in Markdown for later insertion into Notion / WPS / Canvas.

Output format:
Reply ONLY in this exact Markdown structure, repeated for each note:

#### Snippet Note

- topic: TOPIC_OR_DASH
- summary: ONE_OR_TWO_SENTENCES_SUMMARY
- key_points:
  - bullet point 1
  - bullet point 2
  - bullet point 3
- source: SOURCE_NAME (SOURCE_URL)
- raw_snippet:
  > original snippet here, optionally slightly cleaned (line breaks, etc.)

If you need to output multiple notes, simply repeat the whole block:

#### Snippet Note
...

#### Snippet Note
...

(no extra headings, no numbering, no JSON)

Document-level rules (very important):

1. You are usually given the entire document text, not just a short highlight.
2. First, quickly scan the document to understand:
   - the main topic and structure (titles, headings, sections),
   - the key arguments, data, and frameworks.
3. Then, select several important spans to turn into cards:
   - Each span should be a coherent "unit of evidence" or "idea" (e.g. one core argument, one mechanism, one table explanation, one case example).
   - Each span should be roughly "card length": about one figure or 1–3 short paragraphs (≈ 100–300 words or equivalent characters).
   - Do NOT simply chop the document every N characters. Choose spans by meaning.
4. For long documents:
   - Prioritize the most important 5–20 spans that are most useful for later analysis and story-building.
   - Avoid trivial or repeated content.
5. For very short documents:
   - You may only need 1–3 Snippet Notes.

Per-note rules (same as before, but applied to each chosen span):

1. topic:
   - If a topic is provided, copy it here (you may lightly shorten it if it is extremely long, without changing the meaning).
   - If no topic is provided, write: topic: -.

2. summary:
   - 1–2 sentences.
   - Short, factual, focusing on what this snippet actually says or strongly implies.
   - If a "pre_summary" is provided, you may refine it instead of rewriting from scratch.
   - Do NOT introduce new facts that are not reasonably supported by the snippet.
   - If you need to make a light inference, clearly label it with "【assumption】" inside the sentence.

3. key_points:
   - 2–5 bullets is enough.
   - Each bullet should be short and concrete.
   - Focus on the most important claims, data points, mechanisms, or implications in this snippet (this local span), not the whole document.
   - Do NOT introduce new facts that are not reasonably supported by this snippet.
   - If you need to make a light inference, clearly label it with "【assumption】" at the beginning of that bullet.

4. source:
   - If both source_name and source_url are provided, use the format:
     - source: SOURCE_NAME (SOURCE_URL)
   - If only one is provided, include what is available, for example:
     - source: SOURCE_NAME
     - source: (SOURCE_URL)
   - If neither is provided, write:
     - source: -
   - If you know additional location info inside the document (for example, page 10, section 2.3), you may append it into SOURCE_NAME, e.g.:
     - source: My Report (p.10, Sec.2.3)

5. raw_snippet:
   - Use a Markdown blockquote >) and put the original snippet (the span you selected) inside.
   - You may normalize whitespace and simple line breaks, but do not change the meaning.
   - Keep each raw_snippet within a reasonable "card" length (one coherent chunk, approximately 1–3 short paragraphs / one figure description / ≈100–300 words or equivalent).
   - Do not truncate in the middle of a sentence unless absolutely necessary; if you must truncate, mark it with "…".

Language:
- Use the same language as the snippet / document, unless the user explicitly asks otherwise.

Important:
- You may output MULTIPLE Snippet Notes for one document, but each must follow the exact structure above.
- Reply ONLY with one or more #### Snippet Note blocks in the specified Markdown structure.
- Do NOT output any extra explanations, headings, numbering, JSON, or text before or after the Snippet Notes.`;

/**
 * 解析多个 Snippet Note Markdown（用于整文件生成卡片）
 * 
 * @param {string} markdownText - 包含一个或多个 Snippet Note 的 Markdown 文本
 * @returns {Array<Object>} 解析后的卡片数组
 */
function parseMultipleSnippetNotes(markdownText) {
  const blocks = markdownText.split(/####\s+Snippet\s+Note/i);
  const cards = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block) continue;

    const lines = block.split(/\r?\n/);

    let topic = null;
    let summary = "";
    const keyPoints = [];
    let sourceLine = "";
    const rawSnippetLines = [];

    let inKeyPoints = false;
    let inRawSnippet = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.match(/^-\s*topic\s*:/i)) {
        const topicValue = trimmed.replace(/^-\s*topic\s*:/i, "").trim();
        if (topicValue && topicValue !== "-") {
          topic = topicValue;
        }
        inKeyPoints = false;
        inRawSnippet = false;
        continue;
      }

      if (trimmed.match(/^-\s*summary\s*:/i)) {
        summary = trimmed.replace(/^-\s*summary\s*:/i, "").trim();
        inKeyPoints = false;
        inRawSnippet = false;
        continue;
      }

      if (trimmed.match(/^-\s*key_points?\s*:/i)) {
        inKeyPoints = true;
        inRawSnippet = false;
        continue;
      }

      if (trimmed.match(/^-\s*source\s*:/i)) {
        sourceLine = trimmed.replace(/^-\s*source\s*:/i, "").trim();
        inKeyPoints = false;
        inRawSnippet = false;
        continue;
      }

      if (trimmed.match(/^-\s*raw_snippet\s*:/i)) {
        inKeyPoints = false;
        inRawSnippet = true;
        continue;
      }

      if (inKeyPoints && trimmed.startsWith("-")) {
        const point = trimmed.replace(/^-\s*/, "").trim();
        if (point && !point.match(/^key_points?/i)) {
          keyPoints.push(point);
        }
        continue;
      }

      if (inRawSnippet && trimmed.startsWith(">")) {
        rawSnippetLines.push(trimmed.replace(/^>\s?/, ""));
        continue;
      }
    }

    // 解析 source_line -> source_name / source_url
    let source_name = null;
    let source_url = null;
    if (sourceLine && sourceLine !== "-") {
      const match = sourceLine.match(/^(.*?)(?:\s*\((https?:\/\/[^)]+)\))?$/);
      if (match) {
        const namePart = match[1].trim();
        const urlPart = match[2]?.trim();
        if (namePart && namePart !== "-") source_name = namePart;
        if (urlPart) source_url = urlPart;
        if (!urlPart && /^https?:\/\//.test(namePart)) {
          source_url = namePart;
          source_name = null;
        }
      } else {
        source_name = sourceLine;
      }
    }

    const raw_snippet = rawSnippetLines.join("\n").trim();

    if (summary || raw_snippet) {
      cards.push({
        topic,
        summary,
        key_points: keyPoints,
        source_name,
        source_url,
        raw_snippet
      });
    }
  }

  return cards;
}

/**
 * 整文件生成卡片：基于文件 ID 生成多个卡片
 * 
 * 根据 OpenAI 官方文档，使用 Responses API 的 input 数组格式，
 * 包含 system message 和 user message（含 input_file）
 * 
 * @param {Object} params
 * @param {string} params.fileId - OpenAI 文件 ID（必填）
 * @param {string} [params.sourceName] - 来源名称
 * @param {string} [params.sourceUrl] - 来源 URL
 * @param {string} [params.topic] - 主题
 * @returns {Promise<Array<Object>>} 卡片数据数组
 */
export async function runFullDocumentCardGenerator({
  fileId,
  sourceName,
  sourceUrl,
  topic
}) {
  if (!fileId) {
    throw new Error("fileId 是必填参数");
  }

  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  console.log("=== 整文件生成卡片开始 ===");
  console.log("文件 ID:", fileId);
  console.log("来源:", sourceName || "(none)");
  console.log("主题:", topic || "(none)");
  console.log("==========================");

  // 构建用户消息文本
  const userMessageText = [
    "Please analyze the uploaded document and generate Snippet Notes.",
    "",
    "Parameters:",
    `source_name: ${sourceName || "(none)"}`,
    `source_url: ${sourceUrl || "(none)"}`,
    `topic: ${topic || "(none)"}`
  ].join("\n");

  // 根据 OpenAI 官方文档，使用 input 数组格式
  // system message + user message（含文件和文本）
  const systemPrompt = getFullDocumentSystemPrompt();
  
  const payload = {
    model: OPENAI_MODEL_COMPLEX, // 使用 gpt-5.1 处理复杂文档分析任务
    input: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: [
          {
            type: "input_file",
            file_id: fileId
          },
          {
            type: "input_text",
            text: userMessageText
          }
        ]
      }
    ]
  };

  console.log("=== 请求 payload（部分）===");
  console.log("model:", payload.model);
  console.log("input[0].role:", payload.input[0].role);
  console.log("input[1].role:", payload.input[1].role);
  console.log("input[1].content[0].type:", payload.input[1].content[0].type);
  console.log("input[1].content[0].file_id:", payload.input[1].content[0].file_id);
  console.log("============================");

  // 调用 Responses API
  let resp;
  const maxRetries = 2;
  const timeoutMs = 180000; // 3分钟超时（处理大文档需要更长时间）

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`⚠️ 第 ${attempt} 次重试...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      resp = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      break;
    } catch (fetchError) {
      console.error(`❌ 网络请求失败（尝试 ${attempt + 1}）:`, fetchError.message);
      if (attempt === maxRetries) {
        throw new Error(`网络请求失败（已重试 ${maxRetries} 次）: ${fetchError.message}`);
      }
    }
  }

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => "");
    console.error("❌ API 响应错误:", resp.status, errorText);
    throw new Error(`OpenAI API 错误: ${resp.status} - ${errorText}`);
  }

  const data = await resp.json();

  console.log("=== API 响应结构 ===");
  console.log("keys:", Object.keys(data));
  console.log("output_text 存在:", !!data.output_text);
  console.log("output 存在:", !!data.output);
  console.log("====================");

  const textOutput = data.output_text || extractTextFromResponse(data);

  if (!textOutput) {
    console.error("❌ API 返回数据:", JSON.stringify(data, null, 2));
    throw new Error("OpenAI 返回空内容");
  }

  console.log("=== API 返回的原始文本 ===");
  console.log(textOutput.substring(0, 1000) + (textOutput.length > 1000 ? "..." : ""));
  console.log("==========================");

  // 解析多个 Snippet Note
  const cards = parseMultipleSnippetNotes(textOutput);

  console.log(`✅ 成功解析 ${cards.length} 个卡片`);

  // 映射到 Card 字段格式
  return cards.map(cardData => ({
    summary: cardData.summary || "",
    key_points: Array.isArray(cardData.key_points) ? cardData.key_points : [],
    source_name: cardData.source_name || sourceName || null,
    source_url: cardData.source_url || sourceUrl || null,
    raw_snippet: cardData.raw_snippet || ""
  }));
}

/**
 * Source Matching Agent：智能信息源分类
 * 
 * 当规则匹配失败时，使用 AI 分析内容并归类到已知信息源
 * 
 * @param {Object} params
 * @param {string} params.sourceName - 来源名称
 * @param {string} params.sourceUrl - 来源 URL
 * @param {string} params.summary - 卡片摘要
 * @param {Array} params.knownSources - 已知信息源列表 (精简版: {id, name, url, description})
 * @returns {Promise<string|null>} 最匹配的 source_id，或 null
 */
export async function runSourceMatchingAgent({ sourceName, sourceUrl, summary, knownSources }) {
  // 检查 API Key
  if (!OPENAI_API_KEY) {
    console.warn("⚠️ OPENAI_API_KEY 未设置，跳过 AI Source Matching");
    return null;
  }

  // 1. 构造精简的已知信息源列表字符串
  const sourcesText = knownSources.map(s =>
    `- ID: ${s.source_id}\n  Name: ${s.name}\n  URL: ${s.url || 'N/A'}\n  Desc: ${s.description || 'N/A'}`
  ).join("\n");

  // 2. System Prompt
  const systemPrompt = `你是一个智能信息源分类助手。你的任务是将一篇新的文章/片段归类到已知的信息源列表中。

输入：
1. 文章来源信息 (URL, Source Name)
2. 文章内容摘要
3. 已知信息源列表

规则：
1. 分析文章的 URL 和来源名称，尝试与已知信息源的域名或名称匹配。
2. 如果 URL 无法匹配，根据内容风格和来源名称进行语义推断。
3. 必须返回一个 JSON 对象，格式为：{ "source_id": "..." }。
4. 如果完全无法匹配任何已知信息源，source_id 返回 null。
5. 只返回 JSON，不要包含其他文本。`;

  // 3. User Message
  const userMessage = `文章信息：
- Name: ${sourceName || "Unknown"}
- URL: ${sourceUrl || "Unknown"}
- Summary: ${summary || "No summary provided"}

已知信息源列表：
${sourcesText}

请返回最匹配的 source_id (JSON格式):`;

  const payload = {
    model: OPENAI_MODEL, // gpt-5-mini 支持 JSON mode
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ],
    temperature: 0.1, // 低随机性
    response_format: { type: "json_object" }
  };

  // 添加重试逻辑
  const maxRetries = 1;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(OPENAI_CHAT_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        console.warn(`Source Matching Agent 请求失败 (Attempt ${attempt}): ${resp.status}`);
        continue;
      }

      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) return null;

      let result;
      try {
        result = JSON.parse(content);
      } catch (e) {
        console.warn("Source Matching Agent 返回非 JSON 格式");
        return null;
      }

      return result.source_id || null;

    } catch (error) {
      console.error(`❌ Source Matching Agent 失败 (Attempt ${attempt}):`, error.message);
      if (attempt === maxRetries) return null;
    }
  }
  return null;
}


