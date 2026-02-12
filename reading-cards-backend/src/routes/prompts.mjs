// ========= Prompt 管理路由 =========
// 用于查看和编辑 AI prompts 配置

import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const promptsRouter = Router();

// 检查是否为 Local Mode
const IS_LOCAL_MODE = process.env.LOCAL_MODE === 'true' || 
  (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * 兼容的认证中间件（支持 Local Mode）
 */
async function requireAuthCompat(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        ok: false,
        error: "unauthorized",
        message: "请先登录",
      });
    }

    const token = authHeader.substring(7);

    if (!token) {
      return res.status(401).json({
        ok: false,
        error: "unauthorized",
        message: "Token 不能为空",
      });
    }

    // Local Mode: 简单检查 mock token
    if (IS_LOCAL_MODE) {
      if (token === 'mock-access-token') {
        req.user = {
          id: 'local-user-id',
          email: 'local@example.com',
          name: 'Local User'
        };
        return next();
      } else {
        return res.status(401).json({
          ok: false,
          error: "invalid_token",
          message: "Token 无效（Local Mode）",
        });
      }
    }

    // Cloud Mode: 使用 Supabase 认证
    const { requireAuth } = await import("../middleware/auth.mjs");
    return requireAuth(req, res, next);
  } catch (error) {
    console.error("认证中间件错误:", error);
    return res.status(500).json({
      ok: false,
      error: "auth_error",
      message: "认证过程出错",
    });
  }
}

// 所有 prompts 路由都需要认证
promptsRouter.use(requireAuthCompat);

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置文件路径
const CONFIG_PATH = path.join(__dirname, "../config/prompts.config.json");

/**
 * 读取配置文件
 */
function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      console.error(`配置文件不存在: ${CONFIG_PATH}`);
      throw new Error(`配置文件不存在: ${CONFIG_PATH}`);
    }
    const content = fs.readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error("读取 prompts.config.json 失败:", error);
    console.error("配置文件路径:", CONFIG_PATH);
    throw new Error(`无法读取配置文件: ${error.message}`);
  }
}

/**
 * 写入配置文件
 */
function writeConfig(config) {
  try {
    // 更新 metadata
    config.metadata.last_updated = new Date().toISOString();
    
    const content = JSON.stringify(config, null, 2);
    fs.writeFileSync(CONFIG_PATH, content, "utf-8");
    return true;
  } catch (error) {
    console.error("写入 prompts.config.json 失败:", error);
    throw new Error("无法写入配置文件");
  }
}

/**
 * GET /api/prompts
 * 获取所有 prompt 配置
 */
promptsRouter.get("/", async (req, res) => {
  try {
    const config = readConfig();
    
    if (!config || !config.prompts) {
      return res.status(500).json({
        ok: false,
        error: "invalid_config",
        message: "配置文件格式错误：缺少 prompts 字段",
      });
    }
    
    // 转换为数组格式，方便前端使用
    const promptsList = Object.values(config.prompts).map(prompt => ({
      ...prompt,
      // 对于 stored prompts，不返回完整 template（因为没有）
      template: prompt.type === "stored" ? null : prompt.template,
    }));
    
    res.json({
      ok: true,
      prompts: promptsList,
      metadata: config.metadata,
    });
  } catch (error) {
    console.error("获取 prompts 失败:", error);
    console.error("错误堆栈:", error.stack);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
      detail: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

/**
 * GET /api/prompts/:id
 * 获取单个 prompt 详情
 */
promptsRouter.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const config = readConfig();
    
    const prompt = config.prompts[id];
    if (!prompt) {
      return res.status(404).json({
        ok: false,
        error: "prompt_not_found",
        message: `Prompt "${id}" 不存在`,
      });
    }
    
    res.json({
      ok: true,
      prompt,
    });
  } catch (error) {
    console.error("获取 prompt 详情失败:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

/**
 * PATCH /api/prompts/:id
 * 更新单个 prompt 的 template
 * 
 * 请求体：
 * {
 *   template: string  // 新的 template 内容
 * }
 */
promptsRouter.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { template } = req.body || {};
    
    if (template === undefined) {
      return res.status(400).json({
        ok: false,
        error: "template_required",
        message: "template 是必填字段",
      });
    }
    
    const config = readConfig();
    
    const prompt = config.prompts[id];
    if (!prompt) {
      return res.status(404).json({
        ok: false,
        error: "prompt_not_found",
        message: `Prompt "${id}" 不存在`,
      });
    }
    
    // 检查是否可编辑
    if (!prompt.editable) {
      return res.status(403).json({
        ok: false,
        error: "not_editable",
        message: `Prompt "${id}" 是 Stored Prompt，不可编辑`,
      });
    }
    
    // 验证模板变量完整性
    const requiredVars = Object.keys(prompt.locked_vars || {});
    for (const varName of requiredVars) {
      const varPattern = `{{${varName}}}`;
      if (!template.includes(varPattern)) {
        return res.status(400).json({
          ok: false,
          error: "missing_locked_var",
          message: `模板必须包含锁定变量 ${varPattern}`,
          missing_var: varName,
        });
      }
    }
    
    // 更新 template
    config.prompts[id].template = template;
    writeConfig(config);
    
    console.log(`✅ Prompt "${id}" 已更新`);
    
    res.json({
      ok: true,
      prompt: config.prompts[id],
    });
  } catch (error) {
    console.error("更新 prompt 失败:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "服务器内部错误",
    });
  }
});

/**
 * POST /api/prompts/:id/reset
 * 重置 prompt 到默认值（从备份恢复）
 * 
 * 注：当前简化实现，暂不支持重置功能
 * 后续可添加 prompts.config.default.json 作为默认值备份
 */
promptsRouter.post("/:id/reset", async (req, res) => {
  res.status(501).json({
    ok: false,
    error: "not_implemented",
    message: "重置功能暂未实现",
  });
});

export default promptsRouter;

