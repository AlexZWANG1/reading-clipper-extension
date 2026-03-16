// ========= AI客户端工厂服务 =========
// 支持多提供商（OpenAI, Anthropic, 自定义）的统一AI客户端
// 所有 AI 调用统一通过 aiRuntime 配置入口

import crypto from 'node:crypto';
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildEndpoint,
  getApiKey,
  buildHeaders,
  isProxyMode,
  getRuntimeMode,
} from "./aiRuntime.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODELS_CONFIG_PATH = path.join(__dirname, "../config/models.config.json");

const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_SECRET;

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
        model: "gpt-5.2",
        api_key_encrypted: null,
        api_endpoint: null,
      };
    }

    return data;
  } catch (error) {
    console.error("获取用户设置失败:", error);
    return {
      provider: "openai",
      model: "gpt-5.2",
      api_key_encrypted: null,
      api_endpoint: null,
    };
  }
}

function encryptApiKey(plainKey) {
  if (!plainKey || !ENCRYPTION_KEY) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(plainKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

function decryptApiKey(encryptedKey) {
  if (!encryptedKey) return null;
  if (!ENCRYPTION_KEY) {
    // No encryption key configured — try base64 fallback
    try { return Buffer.from(encryptedKey, 'base64').toString('utf-8'); } catch { return encryptedKey; }
  }
  try {
    const [ivHex, tagHex, data] = encryptedKey.split(':');
    if (!ivHex || !tagHex || !data) {
      // Fallback: try base64 for migration period
      return Buffer.from(encryptedKey, 'base64').toString('utf-8');
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
}

/**
 * 获取用户自定义 API Key（如果有）
 * @param {Object} userSettings - 用户设置
 * @returns {string|null} 解密后的用户 API Key
 */
function getUserApiKey(userSettings) {
  if (userSettings?.api_key_encrypted) {
    const decrypted = decryptApiKey(userSettings.api_key_encrypted);
    if (decrypted) return decrypted;
  }
  return null;
}

/**
 * 获取用户自定义端点（仅 custom provider）
 * @param {Object} userSettings - 用户设置
 * @returns {string|null} 用户自定义的 base URL
 */
function getUserCustomEndpoint(userSettings) {
  return userSettings?.api_endpoint || null;
}

/**
 * 创建AI客户端配置
 * @param {string} userId - 用户ID（可选）
 * @param {Object} supabaseClient - Supabase客户端（可选）
 * @returns {Promise<Object>} AI客户端配置
 */
export { encryptApiKey, decryptApiKey };

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

  // 支持从环境变量读取默认模型
  let model = userSettings?.model;
  if (!model && provider === "openai") {
    model = process.env.OPENAI_MODEL;
  }
  if (!model) {
    model = config.providers[provider]?.default_model || "gpt-5.2";
  }

  // 获取用户自定义 API Key（如果有）
  const userApiKey = getUserApiKey(userSettings);

  // 获取用户自定义端点（仅 custom provider）
  const customBaseUrl = provider === "custom" ? getUserCustomEndpoint(userSettings) : null;

  // 获取模型的 context_window
  const providerConfig = config.providers[provider];
  const modelConfig = providerConfig?.models?.find(m => m.id === model || m.id === '*');
  const contextWindow = modelConfig?.context_window || 128000;

  // 通过 aiRuntime 统一获取 API Key 和端点
  const apiKey = getApiKey(provider, userApiKey);
  const chatEndpoint = buildEndpoint(provider, "chat", customBaseUrl);
  const responsesEndpoint = buildEndpoint(provider, "responses", customBaseUrl);
  const filesEndpoint = buildEndpoint(provider, "files", customBaseUrl);

  if (!apiKey) {
    const mode = getRuntimeMode();
    if (mode === "proxy") {
      throw new Error(`代理模式：未配置 AI_PROXY_API_KEY`);
    } else {
      throw new Error(`直连模式：未配置 ${provider} API Key`);
    }
  }

  return {
    provider,
    model,
    apiKey,
    chatEndpoint,
    responsesEndpoint,
    filesEndpoint,
    contextWindow,
    userSettings,
    runtimeMode: getRuntimeMode(),
  };
}

async function fetchWithTimeout(url, options, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`AI API 请求超时 (${timeoutMs / 1000}s)`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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
    runtimeMode,
  } = config;

  if (!chatEndpoint) {
    throw new Error(`提供商 ${provider} 不支持 Chat API`);
  }

  const payload = {
    model: model === "*" ? options.customModelName || "gpt-5.2" : model,
    messages,
    ...options,
  };

  // 构建请求头（统一通过 aiRuntime）
  const headers = buildHeaders(provider, apiKey);

  // 代理模式：统一使用 OpenAI 格式
  if (runtimeMode === "proxy") {
    if (process.env.LOG_LEVEL === 'debug') console.log(`[callChatAPI] 代理模式: ${chatEndpoint}, model: ${payload.model}`);

    const response = await fetchWithTimeout(chatEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("[callChatAPI] 代理错误:", response.status, errorText);
      throw new Error(`代理 API 请求失败：${response.status} - ${errorText}`);
    }

    const result = await response.json();
    // Token usage logging
    if (result.usage) {
      const { prompt_tokens, completion_tokens } = result.usage;
      console.log(`[ai] ${payload.model} | ${prompt_tokens} in / ${completion_tokens} out | total: ${prompt_tokens + completion_tokens}`);
    }
    if (process.env.LOG_LEVEL === 'debug') console.log("[callChatAPI] 代理响应成功");
    return result;
  }

  // 直连模式：Anthropic 需要特殊处理
  if (provider === "anthropic") {
    // Extract system message (Anthropic requires it as a top-level field, not in messages)
    const systemMessage = payload.messages.find(m => m.role === 'system');
    const nonSystemMessages = payload.messages.filter(m => m.role !== 'system');

    // Translate messages: OpenAI format → Anthropic format
    const anthropicMessages = translateToAnthropicFormat(nonSystemMessages);

    // Build Anthropic-specific payload
    const anthropicPayload = {
      model: payload.model,
      max_tokens: options.max_tokens || 4096,
      ...(systemMessage ? { system: systemMessage.content } : {}),
      messages: anthropicMessages,
    };

    // Add tools if present (translate OpenAI tool format → Anthropic)
    if (options.tools?.length > 0) {
      anthropicPayload.tools = options.tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }

    const response = await fetchWithTimeout(chatEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(anthropicPayload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Anthropic API 请求失败：${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Translate response: Anthropic format → OpenAI format
    const textParts = (data.content || []).filter(b => b.type === 'text').map(b => b.text);
    const toolUseParts = (data.content || []).filter(b => b.type === 'tool_use');

    const message = {
      role: 'assistant',
      content: textParts.join('\n') || null,
    };

    if (toolUseParts.length > 0) {
      message.tool_calls = toolUseParts.map(tu => ({
        id: tu.id,
        type: 'function',
        function: {
          name: tu.name,
          arguments: JSON.stringify(tu.input),
        },
      }));
    }

    const result = {
      choices: [{ message }],
      usage: data.usage ? {
        prompt_tokens: data.usage.input_tokens,
        completion_tokens: data.usage.output_tokens,
      } : undefined,
    };

    // Token usage logging
    if (result.usage) {
      const { prompt_tokens, completion_tokens } = result.usage;
      console.log(`[ai] ${payload.model} | ${prompt_tokens} in / ${completion_tokens} out | total: ${prompt_tokens + completion_tokens}`);
    }

    return result;
  }

  // 直连模式：OpenAI / Custom
  if (process.env.LOG_LEVEL === 'debug') console.log("[callChatAPI] 直连模式:", chatEndpoint, "model:", payload.model);
  const response = await fetchWithTimeout(chatEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("[callChatAPI] 直连错误:", response.status, errorText);
    throw new Error(`API 请求失败：${response.status} - ${errorText}`);
  }

  const result = await response.json();
  // Token usage logging
  if (result.usage) {
    const { prompt_tokens, completion_tokens } = result.usage;
    console.log(`[ai] ${payload.model} | ${prompt_tokens} in / ${completion_tokens} out | total: ${prompt_tokens + completion_tokens}`);
  }
  if (process.env.LOG_LEVEL === 'debug') console.log("[callChatAPI] 直连响应成功");
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
    runtimeMode,
  } = config;

  if (!responsesEndpoint) {
    throw new Error(`提供商 ${provider} 不支持 Responses API`);
  }

  const payload = {
    model: model === "*" ? options.customModelName || "gpt-5.2" : model,
    prompt,
    input,
    ...options,
  };

  // 构建请求头（统一通过 aiRuntime）
  const headers = buildHeaders(provider, apiKey);

  console.log(`[callResponsesAPI] ${runtimeMode} 模式: ${responsesEndpoint}`);

  const response = await fetchWithTimeout(responsesEndpoint, {
    method: "POST",
    headers,
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
 * Translate OpenAI-format messages to Anthropic format.
 * - 'tool' role → 'user' with tool_result content block
 * - assistant with tool_calls → assistant with tool_use content blocks
 * Note: system messages must be extracted before calling this function.
 */
function translateToAnthropicFormat(messages) {
  return messages.map(m => {
    if (m.role === 'tool') {
      return {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: m.tool_call_id,
          content: m.content,
        }],
      };
    }
    if (m.tool_calls) {
      return {
        role: 'assistant',
        content: [
          ...(m.content ? [{ type: 'text', text: m.content }] : []),
          ...m.tool_calls.map(tc => ({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments || '{}'),
          })),
        ],
      };
    }
    return m;
  });
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


