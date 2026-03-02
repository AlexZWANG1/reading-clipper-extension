// ========= AI客户端工厂服务 =========
// 支持多提供商（OpenAI, Anthropic, 自定义）的统一AI客户端

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODELS_CONFIG_PATH = path.join(__dirname, "../config/models.config.json");

// 加载模型配置
let modelsConfigCache = null;
function loadModelsConfig() {
  if (modelsConfigCache) return modelsConfigCache;

  try {
    const content = fs.readFileSync(MODELS_CONFIG_PATH, "utf-8");
    modelsConfigCache = JSON.parse(content);
    return modelsConfigCache;
  } catch (error) {
    console.error("❌ 加载 models.config.json 失败:", error.message);
    return null;
  }
}

/**
 * 获取用户设置（从数据库）
 * @param {string} userId - 用户ID
 * @param {Object} supabaseClient - Supabase客户端
 * @returns {Promise<Object|null>} 用户设置
 */
async function getUserSettings(userId, supabaseClient) {
  if (!supabaseClient || !userId) {
    return null;
  }

  try {
    const { data, error } = await supabaseClient
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      // 如果没有设置，返回默认值
      return {
        provider: "openai",
        model: "gpt-5-mini",
        api_key_encrypted: null,
        api_endpoint: null,
      };
    }

    return data;
  } catch (error) {
    console.error("获取用户设置失败:", error);
    return {
      provider: "openai",
      model: "gpt-5-mini",
      api_key_encrypted: null,
      api_endpoint: null,
    };
  }
}

/**
 * 解密API Key（简单实现，生产环境应使用更安全的加密）
 * @param {string} encryptedKey - 加密的API Key
 * @returns {string} 解密后的API Key
 */
function decryptApiKey(encryptedKey) {
  // TODO: 实现真正的解密逻辑
  // 目前假设是base64编码（临时方案）
  if (!encryptedKey) return null;
  try {
    return Buffer.from(encryptedKey, "base64").toString("utf-8");
  } catch {
    return encryptedKey; // 如果解密失败，返回原值（可能是未加密的）
  }
}

/**
 * 获取API Key（优先使用用户配置，否则使用环境变量）
 * @param {Object} userSettings - 用户设置
 * @param {string} provider - 提供商名称
 * @returns {string|null} API Key
 */
function getApiKey(userSettings, provider) {
  // 如果用户配置了自己的API Key
  if (userSettings?.api_key_encrypted) {
    const decrypted = decryptApiKey(userSettings.api_key_encrypted);
    if (decrypted) return decrypted;
  }

  // 否则使用环境变量
  if (provider === "openai") {
    return process.env.OPENAI_API_KEY || null;
  } else if (provider === "anthropic") {
    return process.env.ANTHROPIC_API_KEY || null;
  }

  return null;
}

/**
 * 获取API端点
 * @param {Object} userSettings - 用户设置
 * @param {string} provider - 提供商名称
 * @param {string} endpointType - 端点类型（chat, responses, files）
 * @returns {string|null} API端点URL
 */
function getApiEndpoint(userSettings, provider, endpointType) {
  const config = loadModelsConfig();
  if (!config || !config.providers[provider]) {
    return null;
  }

  const providerConfig = config.providers[provider];

  // 自定义提供商：使用用户配置的端点
  if (provider === "custom" && userSettings?.api_endpoint) {
    const baseUrl = userSettings.api_endpoint.replace(/\/$/, "");
    if (endpointType === "chat") {
      return `${baseUrl}/chat/completions`;
    } else if (endpointType === "responses") {
      return `${baseUrl}/responses`;
    } else if (endpointType === "files") {
      return `${baseUrl}/files`;
    }
    return baseUrl;
  }

  // 标准提供商：使用配置的端点
  if (endpointType === "chat") {
    return providerConfig.chat_endpoint || null;
  } else if (endpointType === "responses") {
    return providerConfig.responses_endpoint || null;
  } else if (endpointType === "files") {
    return providerConfig.files_endpoint || null;
  }

  return providerConfig.api_endpoint || null;
}

/**
 * 创建AI客户端配置
 * @param {string} userId - 用户ID（可选）
 * @param {Object} supabaseClient - Supabase客户端（可选）
 * @returns {Promise<Object>} AI客户端配置
 */
export async function createAIClientConfig(userId = null, supabaseClient = null) {
  const config = loadModelsConfig();
  if (!config) {
    throw new Error("模型配置加载失败");
  }

  // 获取用户设置
  let userSettings = null;
  if (userId && supabaseClient) {
    userSettings = await getUserSettings(userId, supabaseClient);
  }

  // 如果没有用户设置，使用默认值
  const provider = userSettings?.provider || "openai";
  const model = userSettings?.model || config.providers[provider]?.default_model || "gpt-5-mini";
  const apiKey = getApiKey(userSettings, provider);
  const apiEndpoint = getApiEndpoint(userSettings, provider, "chat");

  if (!apiKey) {
    throw new Error(`未配置 ${provider} API Key`);
  }

  return {
    provider,
    model,
    apiKey,
    apiEndpoint,
    chatEndpoint: getApiEndpoint(userSettings, provider, "chat"),
    responsesEndpoint: getApiEndpoint(userSettings, provider, "responses"),
    filesEndpoint: getApiEndpoint(userSettings, provider, "files"),
    userSettings,
  };
}

/**
 * 调用Chat API（兼容OpenAI格式）
 * @param {Object} config - AI客户端配置
 * @param {Array} messages - 消息数组
 * @param {Object} options - 额外选项（temperature, response_format等）
 * @returns {Promise<Object>} API响应
 */
export async function callChatAPI(config, messages, options = {}) {
  const {
    apiKey,
    chatEndpoint,
    provider,
    model,
  } = config;

  if (!chatEndpoint) {
    throw new Error(`提供商 ${provider} 不支持 Chat API`);
  }

  const payload = {
    model: model === "*" ? options.customModelName || "gpt-5-mini" : model,
    messages,
    ...options,
  };

  // Anthropic API格式略有不同
  if (provider === "anthropic") {
    // Anthropic使用messages API，格式不同
    const anthropicPayload = {
      model: payload.model,
      max_tokens: options.max_tokens || 4096,
      messages: payload.messages,
    };

    const response = await fetch(chatEndpoint, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(anthropicPayload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Anthropic API 请求失败：${response.status} - ${errorText}`);
    }

    const data = await response.json();
    // 转换为OpenAI格式
    return {
      choices: [
        {
          message: {
            content: data.content?.[0]?.text || "",
            role: "assistant",
          },
        },
      ],
    };
  }

  // OpenAI格式（包括自定义API）
  console.log("[callChatAPI] endpoint:", chatEndpoint, "model:", payload.model, "messages:", payload.messages?.length, "hasTools:", !!payload.tools);
  const response = await fetch(chatEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("[callChatAPI] ERROR:", response.status, errorText);
    throw new Error(`API 请求失败：${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log("[callChatAPI] OK, choice role:", result.choices?.[0]?.message?.role, "has tool_calls:", !!result.choices?.[0]?.message?.tool_calls);
  return result;
}

/**
 * 调用Responses API（仅OpenAI支持）
 * @param {Object} config - AI客户端配置
 * @param {Object} prompt - Prompt配置（{id: string}或{content: string}）
 * @param {string} input - 输入文本
 * @param {Object} options - 额外选项
 * @returns {Promise<string>} 输出文本
 */
export async function callResponsesAPI(config, prompt, input, options = {}) {
  const {
    apiKey,
    responsesEndpoint,
    provider,
    model,
  } = config;

  if (provider !== "openai" && provider !== "custom") {
    throw new Error(`提供商 ${provider} 不支持 Responses API`);
  }

  if (!responsesEndpoint) {
    throw new Error(`未配置 Responses API 端点`);
  }

  const payload = {
    model: model === "*" ? options.customModelName || "gpt-5-mini" : model,
    prompt,
    input,
    ...options,
  };

  const response = await fetch(responsesEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Responses API 请求失败：${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // 提取输出文本
  const textOutput = data.output_text || extractTextFromResponse(data);
  if (!textOutput) {
    throw new Error("API 返回空内容");
  }

  return textOutput;
}

/**
 * 从Responses API响应中提取文本（兼容不同格式）
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
 * 测试API连接
 * @param {Object} config - AI客户端配置
 * @returns {Promise<boolean>} 是否连接成功
 */
export async function testAPIConnection(config) {
  try {
    const testMessages = [
      { role: "user", content: "Hello" },
    ];

    await callChatAPI(config, testMessages, {
      max_tokens: 10,
      temperature: 0,
    });

    return true;
  } catch (error) {
    console.error("API连接测试失败:", error);
    return false;
  }
}

/**
 * 获取可用的模型列表
 * @param {string} provider - 提供商名称
 * @returns {Array} 模型列表
 */
export function getAvailableModels(provider) {
  const config = loadModelsConfig();
  if (!config || !config.providers[provider]) {
    return [];
  }
  return config.providers[provider].models || [];
}

/**
 * 获取所有提供商列表
 * @returns {Array} 提供商列表
 */
export function getAvailableProviders() {
  const config = loadModelsConfig();
  if (!config) {
    return [];
  }
  return Object.keys(config.providers).map(key => ({
    id: key,
    ...config.providers[key],
  }));
}


