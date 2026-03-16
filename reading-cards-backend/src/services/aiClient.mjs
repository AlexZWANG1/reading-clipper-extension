// ========= AI瀹㈡埛绔伐鍘傛湇鍔?=========
// 鏀寔澶氭彁渚涘晢锛圤penAI, Anthropic, 鑷畾涔夛級鐨勭粺涓€AI瀹㈡埛绔?
// 鎵€鏈?AI 璋冪敤缁熶竴閫氳繃 aiRuntime 閰嶇疆鍏ュ彛

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

// 鍔犺浇妯″瀷閰嶇疆
let modelsConfigCache = null;
function loadModelsConfig() {
  if (modelsConfigCache) return modelsConfigCache;

  try {
    const content = fs.readFileSync(MODELS_CONFIG_PATH, "utf-8");
    modelsConfigCache = JSON.parse(content);
    return modelsConfigCache;
  } catch (error) {
    console.error("鉂?鍔犺浇 models.config.json 澶辫触:", error.message);
    return null;
  }
}

/**
 * 鑾峰彇鐢ㄦ埛璁剧疆锛堜粠鏁版嵁搴擄級
 * @param {string} userId - 鐢ㄦ埛ID
 * @param {Object} supabaseClient - Supabase瀹㈡埛绔?
 * @returns {Promise<Object|null>} 鐢ㄦ埛璁剧疆
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
      // 濡傛灉娌℃湁璁剧疆锛岃繑鍥為粯璁ゅ€?
      return {
        provider: "openai",
        model: "gpt-5.2",
        api_key_encrypted: null,
        api_endpoint: null,
      };
    }

    return data;
  } catch (error) {
    console.error("鑾峰彇鐢ㄦ埛璁剧疆澶辫触:", error);
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
    // No encryption key configured 鈥?try base64 fallback
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
 * 鑾峰彇鐢ㄦ埛鑷畾涔?API Key锛堝鏋滄湁锛?
 * @param {Object} userSettings - 鐢ㄦ埛璁剧疆
 * @returns {string|null} 瑙ｅ瘑鍚庣殑鐢ㄦ埛 API Key
 */
function getUserApiKey(userSettings) {
  if (userSettings?.api_key_encrypted) {
    const decrypted = decryptApiKey(userSettings.api_key_encrypted);
    if (decrypted) return decrypted;
  }
  return null;
}

/**
 * 鑾峰彇鐢ㄦ埛鑷畾涔夌鐐癸紙浠?custom provider锛?
 * @param {Object} userSettings - 鐢ㄦ埛璁剧疆
 * @returns {string|null} 鐢ㄦ埛鑷畾涔夌殑 base URL
 */
function getUserCustomEndpoint(userSettings) {
  return userSettings?.api_endpoint || null;
}

/**
 * 鍒涘缓AI瀹㈡埛绔厤缃?
 * @param {string} userId - 鐢ㄦ埛ID锛堝彲閫夛級
 * @param {Object} supabaseClient - Supabase瀹㈡埛绔紙鍙€夛級
 * @returns {Promise<Object>} AI瀹㈡埛绔厤缃?
 */
export { encryptApiKey, decryptApiKey };

export async function createAIClientConfig(userId = null, supabaseClient = null) {
  const config = loadModelsConfig();
  if (!config) {
    throw new Error("妯″瀷閰嶇疆鍔犺浇澶辫触");
  }

  // 鑾峰彇鐢ㄦ埛璁剧疆
  let userSettings = null;
  if (userId && supabaseClient) {
    userSettings = await getUserSettings(userId, supabaseClient);
  }

  // 濡傛灉娌℃湁鐢ㄦ埛璁剧疆锛屼娇鐢ㄩ粯璁ゅ€?
  const provider = userSettings?.provider || "openai";

  // 鏀寔浠庣幆澧冨彉閲忚鍙栭粯璁ゆā鍨?
  let model = userSettings?.model;
  if (!model && provider === "openai") {
    model = process.env.OPENAI_MODEL;
  }
  if (!model) {
    model = config.providers[provider]?.default_model || "gpt-5.2";
  }

  // 鑾峰彇鐢ㄦ埛鑷畾涔?API Key锛堝鏋滄湁锛?
  const userApiKey = getUserApiKey(userSettings);

  // 鑾峰彇鐢ㄦ埛鑷畾涔夌鐐癸紙浠?custom provider锛?
  const customBaseUrl = provider === "custom" ? getUserCustomEndpoint(userSettings) : null;

  // 鑾峰彇妯″瀷鐨?context_window
  const providerConfig = config.providers[provider];
  const modelConfig = providerConfig?.models?.find(m => m.id === model || m.id === '*');
  const contextWindow = modelConfig?.context_window || 128000;

  // 閫氳繃 aiRuntime 缁熶竴鑾峰彇 API Key 鍜岀鐐?
  const apiKey = getApiKey(provider, userApiKey);
  const chatEndpoint = buildEndpoint(provider, "chat", customBaseUrl);
  const responsesEndpoint = buildEndpoint(provider, "responses", customBaseUrl);
  const filesEndpoint = buildEndpoint(provider, "files", customBaseUrl);

  if (!apiKey) {
    const mode = getRuntimeMode();
    if (mode === "proxy") {
      throw new Error(`浠ｇ悊妯″紡锛氭湭閰嶇疆 AI_PROXY_API_KEY`);
    } else {
      throw new Error(`鐩磋繛妯″紡锛氭湭閰嶇疆 ${provider} API Key`);
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
      throw new Error(`AI API 璇锋眰瓒呮椂 (${timeoutMs / 1000}s)`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 璋冪敤Chat API锛堝吋瀹筄penAI鏍煎紡锛?
 * @param {Object} config - AI瀹㈡埛绔厤缃?
 * @param {Array} messages - 娑堟伅鏁扮粍
 * @param {Object} options - 棰濆閫夐」锛坱emperature, response_format绛夛級
 * @returns {Promise<Object>} API鍝嶅簲
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
    throw new Error(`鎻愪緵鍟?${provider} 涓嶆敮鎸?Chat API`);
  }

  const payload = {
    model: model === "*" ? options.customModelName || "gpt-5.2" : model,
    messages,
    ...options,
  };

  // 鏋勫缓璇锋眰澶达紙缁熶竴閫氳繃 aiRuntime锛?
  const headers = buildHeaders(provider, apiKey);

  // 浠ｇ悊妯″紡锛氱粺涓€浣跨敤 OpenAI 鏍煎紡锛堝甫閲嶈瘯锛?
  if (runtimeMode === "proxy") {
    // Proxy + tools 鈫?use tool-in-prompt strategy
    // EasyCIL Codex proxy forwards to Responses API endpoint which can't handle
    // Chat Completions tools format. Inject tools into system prompt instead.
    if (options.tools?.length > 0) {
      return callChatAPIProxyWithTools(config, messages, options);
    }

    if (process.env.LOG_LEVEL === 'debug') console.log(`[callChatAPI] 浠ｇ悊妯″紡: ${chatEndpoint}, model: ${payload.model}`);

    const MAX_RETRIES = 2;
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetchWithTimeout(chatEndpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");

          // Retry on 5xx with EOF/connection errors (proxy upstream failures)
          const isRetryable = response.status >= 500 && (
            errorText.includes('EOF') || errorText.includes('connection') ||
            errorText.includes('timeout') || errorText.includes('ECONNRESET')
          );

          if (isRetryable && attempt < MAX_RETRIES) {
            const delay = 1000 * (attempt + 1);
            console.warn(`[callChatAPI] 浠ｇ悊鏆傛椂澶辫触 (${response.status}), 绗?${attempt + 1} 娆￠噸璇?(${delay}ms鍚?...`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }

          console.error("[callChatAPI] 浠ｇ悊閿欒:", response.status, errorText);
          throw new Error(`浠ｇ悊 API 璇锋眰澶辫触锛?{response.status} - ${errorText}`);
        }

        const result = await response.json();
        if (result.usage) {
          const { prompt_tokens, completion_tokens } = result.usage;
          console.log(`[ai] ${payload.model} | ${prompt_tokens} in / ${completion_tokens} out | total: ${prompt_tokens + completion_tokens}`);
        }
        if (process.env.LOG_LEVEL === 'debug') console.log("[callChatAPI] 浠ｇ悊鍝嶅簲鎴愬姛");
        return result;
      } catch (err) {
        lastError = err;
        // Retry on fetch failures (network errors)
        const isNetworkError = err.message?.includes('fetch failed') || err.message?.includes('ECONNRESET');
        if (isNetworkError && attempt < MAX_RETRIES) {
          const delay = 1000 * (attempt + 1);
          console.warn(`[callChatAPI] 缃戠粶閿欒, 绗?${attempt + 1} 娆￠噸璇?(${delay}ms鍚?:`, err.message);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error('浠ｇ悊璇锋眰澶辫触');
  }

  // 鐩磋繛妯″紡锛欰nthropic 闇€瑕佺壒娈婂鐞?
  if (provider === "anthropic") {
    // Extract system message (Anthropic requires it as a top-level field, not in messages)
    const systemMessage = payload.messages.find(m => m.role === 'system');
    const nonSystemMessages = payload.messages.filter(m => m.role !== 'system');

    // Translate messages: OpenAI format 鈫?Anthropic format
    const anthropicMessages = translateToAnthropicFormat(nonSystemMessages);

    // Build Anthropic-specific payload
    const anthropicPayload = {
      model: payload.model,
      max_tokens: options.max_tokens || 4096,
      ...(systemMessage ? { system: systemMessage.content } : {}),
      messages: anthropicMessages,
    };

    // Add tools if present (translate OpenAI tool format 鈫?Anthropic)
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
      throw new Error(`Anthropic API 璇锋眰澶辫触锛?{response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Translate response: Anthropic format 鈫?OpenAI format
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

  // 鐩磋繛妯″紡锛歄penAI / Custom
  if (process.env.LOG_LEVEL === 'debug') console.log("[callChatAPI] 鐩磋繛妯″紡:", chatEndpoint, "model:", payload.model);
  const response = await fetchWithTimeout(chatEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("[callChatAPI] 鐩磋繛閿欒:", response.status, errorText);
    throw new Error(`API 璇锋眰澶辫触锛?{response.status} - ${errorText}`);
  }

  const result = await response.json();
  // Token usage logging
  if (result.usage) {
    const { prompt_tokens, completion_tokens } = result.usage;
    console.log(`[ai] ${payload.model} | ${prompt_tokens} in / ${completion_tokens} out | total: ${prompt_tokens + completion_tokens}`);
  }
  if (process.env.LOG_LEVEL === 'debug') console.log("[callChatAPI] 鐩磋繛鍝嶅簲鎴愬姛");
  return result;
}

/**
 * 璋冪敤Responses API锛堜粎OpenAI鏀寔锛?
 * @param {Object} config - AI瀹㈡埛绔厤缃?
 * @param {Object} prompt - Prompt閰嶇疆锛坽id: string}鎴杮content: string}锛?
 * @param {string} input - 杈撳叆鏂囨湰
 * @param {Object} options - 棰濆閫夐」
 * @returns {Promise<string>} 杈撳嚭鏂囨湰
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
    throw new Error(`鎻愪緵鍟?${provider} 涓嶆敮鎸?Responses API`);
  }

  const payload = {
    model: model === "*" ? options.customModelName || "gpt-5.2" : model,
    prompt,
    input,
    ...options,
  };

  // 鏋勫缓璇锋眰澶达紙缁熶竴閫氳繃 aiRuntime锛?
  const headers = buildHeaders(provider, apiKey);

  console.log(`[callResponsesAPI] ${runtimeMode} 妯″紡: ${responsesEndpoint}`);

  const response = await fetchWithTimeout(responsesEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Responses API 璇锋眰澶辫触锛?{response.status} - ${errorText}`);
  }

  const data = await response.json();

  // 鎻愬彇杈撳嚭鏂囨湰
  const textOutput = data.output_text || extractTextFromResponse(data);
  if (!textOutput) {
    throw new Error("API returned empty content");
  }

  return textOutput;
}

/**
 * 浠嶳esponses API鍝嶅簲涓彁鍙栨枃鏈紙鍏煎涓嶅悓鏍煎紡锛?
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

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲
// Proxy Tool-in-Prompt: inject tool defs into system prompt
// when the proxy can't handle native function calling
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲

/**
 * Build a human-readable tool description for the system prompt.
 */
function buildToolPrompt(tools) {
  if (!tools || tools.length === 0) return '';

  const toolLines = tools.map((t, i) => {
    const fn = t.function;
    const params = fn.parameters?.properties || {};
    const required = fn.parameters?.required || [];

    const paramDesc = Object.entries(params).map(([name, schema]) => {
      const req = required.includes(name) ? 'required' : 'optional';
      return `      ${name} (${schema.type}, ${req}): ${schema.description || ''}`;
    }).join('\n');

    return `  ${i + 1}. ${fn.name} 鈥?${fn.description}\n     鍙傛暟:\n${paramDesc}`;
  }).join('\n\n');

  return `

<TOOL_CALLING_FORMAT>
## 关键规则：你必须始终只输出纯 JSON（不能有 JSON 之外的文本）。

### Format 1 - call tools (when fresh data or mutations are required):
{"tool_calls":[{"id":"call_1","name":"tool_name","arguments":{"param":"value"}}]}

### Format 2 - direct response (when current context is already enough):
{"response":"your response text (markdown allowed)"}

### Core principles:
- If the question can be answered from current surface context or existing tool results, respond directly.
- If fresh data is required, call tools first, then answer strictly from tool results.
- Tool execution here is synchronous. Never claim "I started a tool and am waiting for results".
- You may call multiple independent tools in one round.

### 示例：
用户"有什么主题" -> {"tool_calls":[{"id":"call_1","name":"list_topics","arguments":{}}]}
用户"画板上有什么" -> {"tool_calls":[{"id":"call_1","name":"get_board","arguments":{"board_id":"xxx"}}]}
用户"添加一个假说" -> {"tool_calls":[{"id":"call_1","name":"propose_board_changes","arguments":{"board_id":"xxx","changes":[{"action":"create_node","node_type":"hypothesis","text":"...","parent_id":"..."}],"reasoning":"..."}}]}
用户"你好" -> {"response":"你好！我是 Verity 研究助手。"}

可用工具：
${toolLines}
</TOOL_CALLING_FORMAT>`;
}

/**
 * Convert messages for proxy tool mode:
 * - assistant messages with tool_calls 鈫?text showing what was called
 * - tool result messages 鈫?user messages showing results
 */
function convertMessagesForProxyToolMode(messages) {
  const converted = [];
  let i = 0;

  while (i < messages.length) {
    const m = messages[i];

    if (m.role === 'tool') {
      // Merge consecutive tool results into one user message
      const toolResults = [];
      while (i < messages.length && messages[i].role === 'tool') {
        const tr = messages[i];
        toolResults.push(`[宸ュ叿缁撴灉 ${tr.tool_call_id}]: ${tr.content}`);
        i++;
      }
      // Add nudge to prevent AI from fabricating data or skipping tool calls
      toolResults.push('[绯荤粺鎻愮ず锛氫互涓婃槸宸ュ叿杩斿洖鐨勭湡瀹炴暟鎹€傚闇€鏇村淇℃伅锛岃缁х画璋冪敤宸ュ叿銆傚闇€鎵ц鎿嶄綔锛堝娣诲姞鍋囪锛夛紝璇疯皟鐢ㄥ搴斿伐鍏枫€傜粷涓嶈缂栭€犳湭浠庡伐鍏疯幏鍙栫殑鏁版嵁銆俔');
      converted.push({ role: 'user', content: toolResults.join('\n\n') });
      continue;
    }

    if (m.role === 'assistant' && m.tool_calls?.length > 0) {
      const callsText = m.tool_calls.map(tc =>
        `[璋冪敤宸ュ叿: ${tc.function.name}(${tc.function.arguments})]`
      ).join('\n');
      converted.push({
        role: 'assistant',
        content: callsText + (m.content ? '\n' + m.content : ''),
      });
      i++;
      continue;
    }

    converted.push(m);
    i++;
  }

  return converted;
}

/**
 * Inject tool prompt into the system message.
 */
function injectToolPrompt(messages, toolPrompt) {
  const modified = [...messages];
  const systemIdx = modified.findIndex(m => m.role === 'system');

  if (systemIdx >= 0) {
    modified[systemIdx] = {
      ...modified[systemIdx],
      content: modified[systemIdx].content + toolPrompt,
    };
  } else {
    modified.unshift({ role: 'system', content: toolPrompt });
  }

  return modified;
}

/**
 * Extract tool calls from AI text response (tool-in-prompt mode).
 * Returns array of tool call objects in Chat Completions format.
 */
function extractToolCalls(content) {
  if (!content) return [];

  // Try JSON code block first
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    const parsed = tryParseToolCalls(codeBlockMatch[1].trim());
    if (parsed) return parsed;
  }

  // Try raw JSON (entire content is JSON-like)
  const trimmed = content.trim();
  if (trimmed.startsWith('{') && trimmed.includes('"tool_calls"')) {
    const parsed = tryParseToolCalls(trimmed);
    if (parsed) return parsed;
  }

  return [];
}

function tryParseToolCalls(jsonStr) {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed.tool_calls || !Array.isArray(parsed.tool_calls)) return null;

    return parsed.tool_calls.map((tc, i) => ({
      id: tc.id || `call_${Date.now()}_${i}`,
      type: 'function',
      function: {
        name: tc.name,
        arguments: typeof tc.arguments === 'string'
          ? tc.arguments
          : JSON.stringify(tc.arguments || {}),
      },
    }));
  } catch {
    return null;
  }
}

/**
 * Parse the AI's JSON response in proxy tool mode.
 * Expected formats:
 *   {"tool_calls":[...]} 鈫?tool calls
 *   {"response":"..."} 鈫?text reply
 */
const ACTION_CLAIM_REGEX = /提交|创建|添加|新增|生成|调用|执行|完成|已(经)?(创建|添加|新增|生成|执行|完成)|submitted|created|added|generated|executed|called|done/i;
const PENDING_CLAIM_REGEX = /(waiting\s+for|awaiting|in\s+progress|not\s+received|\u7A0D\u540E|\u7B49\u5F85|\u672A\u6536\u5230\u8FD4\u56DE|\u5904\u7406\u4E2D)/i;

function parseProxyToolResponse(raw) {
  const rawText = String(raw || '').trim();
  if (!rawText) return { type: 'raw', text: raw };

  const candidates = [];
  const fenced = [...rawText.matchAll(/```(?:json)?\s*\n?([\s\S]*?)\n?```/gi)];
  if (fenced.length > 0) {
    for (const match of fenced) {
      if (match[1]?.trim()) candidates.push(match[1].trim());
    }
  }
  candidates.push(rawText);

  let bestResponse = null;
  for (const candidate of candidates) {
    const direct = tryParseProxyPayload(candidate);
    if (direct?.type === 'tool_calls') return direct;
    if (direct?.type === 'response') {
      if (!bestResponse || direct.text?.length > bestResponse.text?.length) bestResponse = direct;
    }

    const objectChunks = extractTopLevelJsonObjects(candidate);
    for (const chunk of objectChunks) {
      const parsedChunk = tryParseProxyPayload(chunk);
      if (parsedChunk?.type === 'tool_calls') return parsedChunk;
      if (parsedChunk?.type === 'response') {
        if (!bestResponse || parsedChunk.text?.length > bestResponse.text?.length) bestResponse = parsedChunk;
      }
    }
  }

  if (bestResponse) return bestResponse;
  return { type: 'raw', text: raw };
}

function tryParseProxyPayload(jsonStr) {
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed?.tool_calls && Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
      const toolCalls = parsed.tool_calls.map((tc, i) => ({
        id: tc.id || `call_${Date.now()}_${i}`,
        type: 'function',
        function: {
          name: tc.name,
          arguments: typeof tc.arguments === 'string'
            ? tc.arguments
            : JSON.stringify(tc.arguments || {}),
        },
      }));
      return { type: 'tool_calls', toolCalls };
    }
    if (typeof parsed?.response === 'string') {
      return { type: 'response', text: parsed.response };
    }
    if (typeof parsed?.reply === 'string') {
      return { type: 'response', text: parsed.reply };
    }
    return null;
  } catch {
    return null;
  }
}

function extractTopLevelJsonObjects(text) {
  const chunks = [];
  let inString = false;
  let escaped = false;
  let depth = 0;
  let start = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === '}') {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const chunk = text.slice(start, i + 1).trim();
        if (chunk) chunks.push(chunk);
        start = -1;
      }
    }
  }

  return chunks;
}

/**
 * Proxy mode with tools: inject tool definitions into prompt, parse tool calls from response.
 * Returns Chat Completions-compatible response so orchestrator needs no changes.
 */
async function callChatAPIProxyWithTools(config, messages, options) {
  const { apiKey, chatEndpoint, model } = config;
  const headers = buildHeaders(config.provider, apiKey);

  // 1. Build tool prompt from tool definitions
  const toolPrompt = buildToolPrompt(options.tools);

  // 2. Convert tool-role messages from previous rounds
  const convertedMessages = convertMessagesForProxyToolMode(messages);

  // 3. Inject tool prompt into system message
  const messagesWithTools = injectToolPrompt(convertedMessages, toolPrompt);

  // 4. Build clean payload (strip tools/tool_choice 鈥?they're in the prompt now)
  //    Force JSON mode so the model always outputs structured JSON
  const { tools, tool_choice, response_format, ...cleanOptions } = options;
  const payload = {
    model: model === "*" ? cleanOptions.customModelName || "gpt-5.2" : model,
    messages: messagesWithTools,
    response_format: { type: "json_object" },
    ...cleanOptions,
  };

  console.log(`[callChatAPI:proxy-tools] ${chatEndpoint}, model: ${payload.model}, tools: ${options.tools.length}`);

  // 5. Send request with retry + hallucination detection
  const MAX_RETRIES = 2;
  let lastError = null;
  let retryPayload = payload;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(chatEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(retryPayload),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        const isRetryable = response.status >= 500 && (
          errorText.includes('EOF') || errorText.includes('connection') ||
          errorText.includes('timeout') || errorText.includes('ECONNRESET')
        );

        if (isRetryable && attempt < MAX_RETRIES) {
          const delay = 1000 * (attempt + 1);
          console.warn(`[proxy-tools] Retry ${attempt + 1} (${delay}ms)...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        console.error("[proxy-tools] Error:", response.status, errorText);
        throw new Error(`浠ｇ悊 API 璇锋眰澶辫触锛?{response.status} - ${errorText}`);
      }

      const result = await response.json();

      // 6. Parse JSON response 鈥?either tool_calls or text response
      const choice = result.choices?.[0];
      if (choice?.message?.content) {
        const raw = choice.message.content.trim();
        console.log(`[proxy-tools] AI raw (first 200): ${raw.slice(0, 200)}`);

        const parsed = parseProxyToolResponse(raw);
        if (parsed.type === 'tool_calls') {
          choice.message.tool_calls = parsed.toolCalls;
          choice.message.content = null;
          choice.finish_reason = 'tool_calls';
          console.log(`[proxy-tools] Tool calls: ${parsed.toolCalls.map(tc => tc.function.name).join(', ')}`);
        } else if (parsed.type === 'response') {
          // Guardrail: block fake action claims and fake async waiting claims.
          const actionClaimed = ACTION_CLAIM_REGEX.test(parsed.text);
          const pendingClaim = PENDING_CLAIM_REGEX.test(parsed.text);
          if ((actionClaimed || pendingClaim) && attempt < MAX_RETRIES) {
            const reason = actionClaimed ? 'hallucination' : 'pending-claim';
            console.warn(`[proxy-tools] ${reason} detected. Retrying (${attempt + 1})...`);
            retryPayload = {
              ...payload,
              messages: [
                ...payload.messages,
                { role: 'assistant', content: raw },
                {
                  role: 'user',
                  content: actionClaimed
                    ? '[SYSTEM CORRECTION: You claimed an action/tool execution without a real tool call. Return valid JSON tool_calls, or a direct response if no tool is needed.]'
                    : '[SYSTEM CORRECTION: Do not claim async waiting ("started tool, waiting for result"). Tool execution is synchronous here. Either call tools now with valid JSON, or provide the final response now.]'
                },
              ],
            };
            continue;
          }
          choice.message.content = parsed.text;
          console.log(`[proxy-tools] Text response (${parsed.text.length} chars)`);
        } else {
          // Fallback: couldn't parse JSON, use raw content as-is
          console.log(`[proxy-tools] Fallback: raw text (no JSON parsed)`);
        }
      }

      if (result.usage) {
        const { prompt_tokens, completion_tokens } = result.usage;
        console.log(`[ai:proxy-tools] ${payload.model} | ${prompt_tokens}in/${completion_tokens}out`);
      }

      return result;
    } catch (err) {
      lastError = err;
      const isNetworkError = err.message?.includes('fetch failed') || err.message?.includes('ECONNRESET');
      if (isNetworkError && attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('浠ｇ悊璇锋眰澶辫触');
}

/**
 * Translate OpenAI-format messages to Anthropic format.
 * - 'tool' role 鈫?'user' with tool_result content block
 * - assistant with tool_calls 鈫?assistant with tool_use content blocks
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
          ...m.tool_calls.map(tc => {
            let input = {};
            try { input = JSON.parse(tc.function.arguments || '{}'); } catch { input = {}; }
            return {
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input,
            };
          }),
        ],
      };
    }
    return m;
  });
}

/**
 * 娴嬭瘯API杩炴帴
 * @param {Object} config - AI瀹㈡埛绔厤缃?
 * @returns {Promise<boolean>} 鏄惁杩炴帴鎴愬姛
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
    console.error("API杩炴帴娴嬭瘯澶辫触:", error);
    return false;
  }
}

/**
 * 鑾峰彇鍙敤鐨勬ā鍨嬪垪琛?
 * @param {string} provider - 鎻愪緵鍟嗗悕绉?
 * @returns {Array} 妯″瀷鍒楄〃
 */
export function getAvailableModels(provider) {
  const config = loadModelsConfig();
  if (!config || !config.providers[provider]) {
    return [];
  }
  return config.providers[provider].models || [];
}

/**
 * 鑾峰彇鎵€鏈夋彁渚涘晢鍒楄〃
 * @returns {Array} 鎻愪緵鍟嗗垪琛?
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



