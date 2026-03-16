// ========= 用户设置相关路由 =========

import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { requireAuth } from "../../middleware/auth.mjs";
import {
  testAPIConnection,
  getAvailableModels,
  getAvailableProviders,
  encryptApiKey,
  decryptApiKey,
} from "../../services/aiClient.mjs";

// 加载模型配置的辅助函数
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODELS_CONFIG_PATH = path.join(__dirname, "../../config/models.config.json");

function loadModelsConfig() {
  try {
    const content = fs.readFileSync(MODELS_CONFIG_PATH, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error("加载模型配置失败:", error);
    return null;
  }
}

const router = express.Router();

/**
 * GET /api/v2/settings
 * 获取当前用户的设置
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const supabase = req.supabase;

    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 表示未找到记录，这是正常的（首次使用）
      console.error("获取用户设置失败:", error);
      return res.status(500).json({
        ok: false,
        error: "get_settings_failed",
        message: "获取设置失败",
      });
    }

    // 如果没有设置，返回默认值
    const settings = data || {
      provider: "openai",
      model: "gpt-5.2",
      api_key_encrypted: null,
      api_endpoint: null,
    };

    // 不返回加密的API Key
    res.json({
      ok: true,
      settings: {
        provider: settings.provider,
        model: settings.model,
        api_endpoint: settings.api_endpoint,
        has_custom_api_key: !!settings.api_key_encrypted,
      },
    });
  } catch (error) {
    console.error("获取用户设置错误:", error);
    res.status(500).json({
      ok: false,
      error: "server_error",
      message: "服务器错误，请稍后重试",
    });
  }
});

/**
 * PATCH /api/v2/settings
 * 更新当前用户的设置
 * 
 * 请求体：
 * {
 *   provider?: string,
 *   model?: string,
 *   api_key?: string,  // 可选，用户自己的API Key
 *   api_endpoint?: string  // 可选，自定义API端点（仅当provider='custom'时）
 * }
 */
router.patch("/", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { provider, model, api_key, api_endpoint } = req.body || {};
    const supabase = req.supabase;

    // 验证provider
    const validProviders = ["openai", "anthropic", "custom"];
    if (provider && !validProviders.includes(provider)) {
      return res.status(400).json({
        ok: false,
        error: "invalid_provider",
        message: `provider必须是以下之一: ${validProviders.join(", ")}`,
      });
    }

    // 验证model（如果提供了provider，验证model是否在该provider的模型列表中）
    if (provider && model) {
      const availableModels = getAvailableModels(provider);
      if (availableModels.length > 0) {
        const modelIds = availableModels.map(m => m.id);
        if (!modelIds.includes(model) && model !== "*") {
          return res.status(400).json({
            ok: false,
            error: "invalid_model",
            message: `model "${model}" 不在provider "${provider}" 的可用模型列表中`,
          });
        }
      }
    }

    // 如果provider是custom，api_endpoint是必需的
    if (provider === "custom" && !api_endpoint) {
      return res.status(400).json({
        ok: false,
        error: "api_endpoint_required",
        message: "自定义API需要提供api_endpoint",
      });
    }

    // 加密API Key（如果提供）— 使用 AES-256-GCM
    let api_key_encrypted = null;
    if (api_key) {
      api_key_encrypted = encryptApiKey(api_key);
      if (!api_key_encrypted) {
        // encryptApiKey returns null when ENCRYPTION_KEY is not set — fall back to base64
        console.warn('[settings] API_KEY_ENCRYPTION_SECRET not set, falling back to base64');
        api_key_encrypted = Buffer.from(api_key).toString("base64");
      }
    }

    // 构建更新对象
    const updates = {};
    if (provider !== undefined) updates.provider = provider;
    if (model !== undefined) updates.model = model;
    if (api_key !== undefined) updates.api_key_encrypted = api_key_encrypted;
    if (api_endpoint !== undefined) updates.api_endpoint = api_endpoint;
    updates.updated_at = new Date().toISOString();

    // 使用upsert（如果不存在则创建）
    const { data, error } = await supabase
      .from("user_settings")
      .upsert({
        user_id: user.id,
        ...updates,
      }, {
        onConflict: "user_id",
      })
      .select()
      .single();

    if (error) {
      console.error("更新用户设置失败:", error);
      return res.status(500).json({
        ok: false,
        error: "update_settings_failed",
        message: "更新设置失败",
      });
    }

    res.json({
      ok: true,
      settings: {
        provider: data.provider,
        model: data.model,
        api_endpoint: data.api_endpoint,
        has_custom_api_key: !!data.api_key_encrypted,
      },
    });
  } catch (error) {
    console.error("更新用户设置错误:", error);
    res.status(500).json({
      ok: false,
      error: "server_error",
      message: "服务器错误，请稍后重试",
    });
  }
});

/**
 * POST /api/v2/settings/test-api
 * 测试API连接
 * 
 * 请求体：
 * {
 *   provider?: string,  // 可选，覆盖当前设置
 *   model?: string,     // 可选，覆盖当前设置
 *   api_key?: string,   // 可选，测试用的API Key
 *   api_endpoint?: string  // 可选，测试用的API端点
 * }
 */
router.post("/test-api", requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { provider, model, api_key, api_endpoint } = req.body || {};
    const supabase = req.supabase;

    // 获取用户当前设置
    const { data: currentSettings } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();

    // 使用请求中的值覆盖当前设置（如果提供）
    const testConfig = {
      provider: provider || currentSettings?.provider || "openai",
      model: model || currentSettings?.model || "gpt-5.2",
      api_key_encrypted: api_key ? (encryptApiKey(api_key) || Buffer.from(api_key).toString("base64")) : currentSettings?.api_key_encrypted,
      api_endpoint: api_endpoint || currentSettings?.api_endpoint || null,
    };

    // 创建临时配置对象用于测试
    // 解密API Key
    let decryptedApiKey = null;
    if (api_key) {
      decryptedApiKey = api_key;
    } else if (testConfig.api_key_encrypted) {
      decryptedApiKey = decryptApiKey(testConfig.api_key_encrypted);
    }

    // 如果没有提供API Key，尝试从环境变量获取
    if (!decryptedApiKey) {
      if (testConfig.provider === "openai") {
        decryptedApiKey = process.env.OPENAI_API_KEY || null;
      } else if (testConfig.provider === "anthropic") {
        decryptedApiKey = process.env.ANTHROPIC_API_KEY || null;
      }
    }

    if (!decryptedApiKey) {
      return res.status(400).json({
        ok: false,
        error: "api_key_required",
        message: "需要提供API Key",
      });
    }

    // 获取API端点
    const modelsConfig = loadModelsConfig();
    let chatEndpoint = null;
    if (modelsConfig && modelsConfig.providers && modelsConfig.providers[testConfig.provider]) {
      const providerConfig = modelsConfig.providers[testConfig.provider];
      if (testConfig.provider === "custom" && testConfig.api_endpoint) {
        const baseUrl = testConfig.api_endpoint.replace(/\/$/, "");
        chatEndpoint = `${baseUrl}/chat/completions`;
      } else {
        chatEndpoint = providerConfig.chat_endpoint || null;
      }
    }

    if (!chatEndpoint) {
      return res.status(400).json({
        ok: false,
        error: "api_endpoint_required",
        message: "无法确定API端点，请检查配置",
      });
    }

    const tempConfig = {
      provider: testConfig.provider,
      model: testConfig.model,
      apiKey: decryptedApiKey,
      chatEndpoint: chatEndpoint,
      userSettings: testConfig,
    };

    // 测试连接
    const isConnected = await testAPIConnection(tempConfig);

    if (isConnected) {
      res.json({
        ok: true,
        message: "API连接测试成功",
      });
    } else {
      res.status(400).json({
        ok: false,
        error: "api_test_failed",
        message: "API连接测试失败，请检查配置",
      });
    }
  } catch (error) {
    console.error("测试API连接错误:", error);
    res.status(500).json({
      ok: false,
      error: "server_error",
      message: error.message || "服务器错误，请稍后重试",
    });
  }
});

/**
 * GET /api/v2/settings/providers
 * 获取可用的提供商列表
 */
router.get("/providers", (req, res) => {
  try {
    const providers = getAvailableProviders();
    res.json({
      ok: true,
      providers,
    });
  } catch (error) {
    console.error("获取提供商列表错误:", error);
    res.status(500).json({
      ok: false,
      error: "server_error",
      message: "服务器错误，请稍后重试",
    });
  }
});

/**
 * GET /api/v2/settings/models/:provider
 * 获取指定提供商的可用模型列表
 */
router.get("/models/:provider", (req, res) => {
  try {
    const { provider } = req.params;
    const models = getAvailableModels(provider);
    
    if (models.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "provider_not_found",
        message: `提供商 "${provider}" 不存在`,
      });
    }

    res.json({
      ok: true,
      models,
    });
  } catch (error) {
    console.error("获取模型列表错误:", error);
    res.status(500).json({
      ok: false,
      error: "server_error",
      message: "服务器错误，请稍后重试",
    });
  }
});

export default router;

