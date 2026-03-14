// ========= AI Runtime 统一配置入口 =========
// 所有 AI 出站调用的唯一配置来源
// 支持代理模式（CLI Proxy）和直连模式

/**
 * AI Runtime 配置
 *
 * 代理模式优先级最高：
 * - 如果设置了 AI_PROXY_ENDPOINT，所有请求强制走代理
 * - 代理模式下只需要 AI_PROXY_API_KEY，不需要 OpenAI/Anthropic 的真实 key
 *
 * 直连模式（fallback）：
 * - 未设置代理时，使用 OPENAI_API_KEY / ANTHROPIC_API_KEY 直连官方 API
 */

// ========= 环境变量读取 =========

/**
 * 代理配置（最高优先级）
 */
const getProxyEndpoint = () => process.env.AI_PROXY_ENDPOINT || null;
const getProxyApiKey = () => process.env.AI_PROXY_API_KEY || null;

/**
 * 直连配置（fallback）
 */
const getOpenAiKey = () => process.env.OPENAI_API_KEY || null;
const getAnthropicKey = () => process.env.ANTHROPIC_API_KEY || null;

// ========= 运行时模式检测 =========

/**
 * 判断是否启用代理模式
 * @returns {boolean}
 */
export function isProxyMode() {
  return !!(getProxyEndpoint() && getProxyApiKey());
}

/**
 * 获取当前运行模式
 * @returns {string} "proxy" | "direct"
 */
export function getRuntimeMode() {
  return isProxyMode() ? "proxy" : "direct";
}

// ========= 统一端点构建 =========

/**
 * 构建 API 端点 URL
 * @param {string} provider - 提供商 (openai/anthropic/custom)
 * @param {string} endpointType - 端点类型 (chat/responses/files)
 * @param {string|null} customBaseUrl - 自定义 base URL（仅 custom provider）
 * @returns {string} 完整的 API 端点 URL
 */
export function buildEndpoint(provider, endpointType, customBaseUrl = null) {
  // 代理模式：所有请求统一走代理
  if (isProxyMode()) {
    const baseUrl = getProxyEndpoint().replace(/\/$/, "");

    // CLI Proxy 使用 OpenAI 兼容格式
    switch (endpointType) {
      case "chat":
        return `${baseUrl}/chat/completions`;
      case "responses":
        return `${baseUrl}/responses`;
      case "files":
        return `${baseUrl}/files`;
      default:
        return baseUrl;
    }
  }

  // 直连模式：根据 provider 构建官方 API 端点
  if (provider === "custom" && customBaseUrl) {
    const baseUrl = customBaseUrl.replace(/\/$/, "");
    switch (endpointType) {
      case "chat":
        return `${baseUrl}/chat/completions`;
      case "responses":
        return `${baseUrl}/responses`;
      case "files":
        return `${baseUrl}/files`;
      default:
        return baseUrl;
    }
  }

  // OpenAI 端点（优先读 OPENAI_BASE_URL 环境变量）
  if (provider === "openai") {
    const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    switch (endpointType) {
      case "chat":
        return `${baseUrl}/chat/completions`;
      case "responses":
        return `${baseUrl}/responses`;
      case "files":
        return `${baseUrl}/files`;
      default:
        return baseUrl;
    }
  }

  // Anthropic 官方端点
  if (provider === "anthropic") {
    const baseUrl = "https://api.anthropic.com/v1";
    switch (endpointType) {
      case "chat":
        return `${baseUrl}/messages`;
      case "responses":
        return null; // Anthropic 不支持 Responses API
      case "files":
        return null; // Anthropic 不支持 Files API
      default:
        return baseUrl;
    }
  }

  throw new Error(`未知的提供商: ${provider}`);
}

/**
 * 获取 API Key
 * @param {string} provider - 提供商 (openai/anthropic/custom)
 * @param {string|null} userApiKey - 用户自定义 API Key（优先级最高）
 * @returns {string|null} API Key
 */
export function getApiKey(provider, userApiKey = null) {
  // 1. 用户自定义 Key（最高优先级）
  if (userApiKey) {
    return userApiKey;
  }

  // 2. 代理模式：使用代理 Key
  if (isProxyMode()) {
    return getProxyApiKey();
  }

  // 3. 直连模式：使用对应提供商的 Key
  if (provider === "openai" || provider === "custom") {
    return getOpenAiKey();
  }

  if (provider === "anthropic") {
    return getAnthropicKey();
  }

  return null;
}

/**
 * 构建请求头
 * @param {string} provider - 提供商
 * @param {string} apiKey - API Key
 * @returns {Object} HTTP 请求头
 */
export function buildHeaders(provider, apiKey) {
  const headers = {
    "Content-Type": "application/json",
  };

  // 代理模式：统一使用 Bearer 认证
  if (isProxyMode()) {
    headers["Authorization"] = `Bearer ${apiKey}`;
    // 可选：告诉代理我们想使用哪个提供商（如果代理支持）
    headers["X-Provider"] = provider;
    return headers;
  }

  // 直连模式：根据提供商使用不同的认证方式
  if (provider === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    // OpenAI / Custom
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  return headers;
}

// ========= 配置验证 =========

/**
 * 验证运行时配置
 * @throws {Error} 如果配置不完整
 */
export function validateRuntimeConfig() {
  const mode = getRuntimeMode();

  if (mode === "proxy") {
    if (!getProxyEndpoint()) {
      console.warn("⚠️ 代理模式：缺少 AI_PROXY_ENDPOINT 环境变量");
    }
    if (!getProxyApiKey()) {
      console.warn("⚠️ 代理模式：缺少 AI_PROXY_API_KEY 环境变量");
    }
    console.log(`✅ [AI Runtime] 代理模式已启用: ${getProxyEndpoint()}`);
  } else {
    if (!getOpenAiKey()) {
      console.warn("⚠️ [AI Runtime] 直连模式：未设置 OPENAI_API_KEY");
    }
    if (!getAnthropicKey()) {
      console.warn("⚠️ [AI Runtime] 直连模式：未设置 ANTHROPIC_API_KEY");
    }
    console.log("✅ [AI Runtime] 直连模式已启用");
  }
}

// ========= 导出配置摘要 =========

/**
 * 获取运行时配置摘要（用于调试）
 * @returns {Object}
 */
export function getRuntimeSummary() {
  return {
    mode: getRuntimeMode(),
    proxyEndpoint: getProxyEndpoint() || "未设置",
    hasProxyKey: !!getProxyApiKey(),
    hasOpenAIKey: !!getOpenAiKey(),
    hasAnthropicKey: !!getAnthropicKey(),
  };
}

// ========= Chat Completion 调用 =========

/**
 * @deprecated Use callChatAPI from aiClient.mjs instead. Will be removed in next major version.
 *
 * Call chat completion API (OpenAI-compatible)
 * @param {Array} messages - Chat messages array
 * @param {Object} options - { model, temperature, max_tokens, json_mode }
 * @returns {Object} Parsed JSON response (if json_mode) or { text: content }
 */
export async function callChatCompletion(messages, options = {}) {
  const {
    model = process.env.OPENAI_MODEL || 'gpt-5.4',
    temperature = 0.3,
    max_tokens = 4000,
    json_mode = false,
  } = options;

  const endpoint = buildEndpoint('openai', 'chat');
  const apiKey = getApiKey('openai');
  const headers = buildHeaders('openai', apiKey);

  const body = { model, messages, temperature, max_tokens };
  if (json_mode) {
    body.response_format = { type: 'json_object' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('AI call timed out (120s)');
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`AI call failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  let content = data.choices?.[0]?.message?.content || '';

  if (json_mode) {
    // Strip markdown fences if present
    content = content.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
    return JSON.parse(content);
  }

  return { text: content };
}

// 启动时验证配置
validateRuntimeConfig();
