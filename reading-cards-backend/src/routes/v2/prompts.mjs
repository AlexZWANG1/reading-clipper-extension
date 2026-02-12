// ========= Prompt V2 API (云端版本) =========
// 用户可以自定义 Prompt，覆盖默认配置

import { Router } from "express";
import { requireAuth } from "../../middleware/auth.mjs";
import { supabaseAdmin } from "../../config/supabase.mjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const promptsRouterV2 = Router();

// 所有路由都需要认证
promptsRouterV2.use(requireAuth);

// 获取默认配置文件路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_CONFIG_PATH = path.join(__dirname, "../../config/prompts.config.json");

/**
 * 读取默认配置
 */
function getDefaultPrompts() {
    try {
        if (!fs.existsSync(DEFAULT_CONFIG_PATH)) {
            return { prompts: {}, metadata: {} };
        }
        const content = fs.readFileSync(DEFAULT_CONFIG_PATH, "utf-8");
        return JSON.parse(content);
    } catch (error) {
        console.error("读取默认 prompts 配置失败:", error);
        return { prompts: {}, metadata: {} };
    }
}

/**
 * GET /api/v2/prompts
 * 获取所有 prompts（默认 + 用户自定义合并）
 */
promptsRouterV2.get("/", async (req, res) => {
    try {
        const userId = req.user.id;

        // 获取默认配置
        const defaultConfig = getDefaultPrompts();
        const defaultPrompts = defaultConfig.prompts || {};

        // 获取用户自定义配置
        const supabase = supabaseAdmin;
        const { data: userPrompts, error } = await supabase
            .from("user_prompts")
            .select("*")
            .eq("user_id", userId);

        if (error) {
            console.error("获取用户 prompts 失败:", error);
        }

        // 合并配置：用户自定义覆盖默认
        const userPromptsMap = {};
        if (userPrompts) {
            for (const up of userPrompts) {
                userPromptsMap[up.prompt_key] = {
                    id: up.prompt_key,
                    template: up.template,
                    description: up.description,
                    variables: up.variables,
                    customized: true,
                    customized_at: up.updated_at,
                };
            }
        }

        // 合并结果
        const mergedPrompts = {};
        for (const [key, prompt] of Object.entries(defaultPrompts)) {
            mergedPrompts[key] = {
                ...prompt,
                customized: !!userPromptsMap[key],
                ...(userPromptsMap[key] || {}),
            };
        }

        // 转换为数组
        const promptsList = Object.values(mergedPrompts).map(prompt => ({
            ...prompt,
            // 对于 stored prompts，不返回完整 template
            template: prompt.type === "stored" ? null : prompt.template,
        }));

        res.json({
            ok: true,
            prompts: promptsList,
            metadata: defaultConfig.metadata,
        });
    } catch (error) {
        console.error("获取 prompts 失败:", error);
        res.status(500).json({
            ok: false,
            error: error.message || "服务器内部错误",
        });
    }
});

/**
 * GET /api/v2/prompts/:id
 * 获取单个 prompt 详情
 */
promptsRouterV2.get("/:id", async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        // 获取默认配置
        const defaultConfig = getDefaultPrompts();
        const defaultPrompt = defaultConfig.prompts?.[id];

        if (!defaultPrompt) {
            return res.status(404).json({
                ok: false,
                error: "prompt_not_found",
                message: `Prompt "${id}" 不存在`,
            });
        }

        // 检查用户是否有自定义
        const supabase = supabaseAdmin;
        const { data: userPrompt } = await supabase
            .from("user_prompts")
            .select("*")
            .eq("user_id", userId)
            .eq("prompt_key", id)
            .single();

        // 合并结果
        const result = {
            ...defaultPrompt,
            customized: !!userPrompt,
        };

        if (userPrompt) {
            result.template = userPrompt.template;
            result.customized_at = userPrompt.updated_at;
        }

        res.json({ ok: true, prompt: result });
    } catch (error) {
        console.error("获取 prompt 详情失败:", error);
        res.status(500).json({
            ok: false,
            error: error.message || "服务器内部错误",
        });
    }
});

/**
 * PATCH /api/v2/prompts/:id
 * 更新（自定义）单个 prompt
 */
promptsRouterV2.patch("/:id", async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const { template } = req.body || {};

        if (template === undefined) {
            return res.status(400).json({
                ok: false,
                error: "template_required",
                message: "template 是必填字段",
            });
        }

        // 检查默认配置中是否存在该 prompt
        const defaultConfig = getDefaultPrompts();
        const defaultPrompt = defaultConfig.prompts?.[id];

        if (!defaultPrompt) {
            return res.status(404).json({
                ok: false,
                error: "prompt_not_found",
                message: `Prompt "${id}" 不存在`,
            });
        }

        // 检查是否可编辑
        if (!defaultPrompt.editable) {
            return res.status(403).json({
                ok: false,
                error: "not_editable",
                message: `Prompt "${id}" 是 Stored Prompt，不可编辑`,
            });
        }

        // 验证模板变量完整性
        const requiredVars = Object.keys(defaultPrompt.locked_vars || {});
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

        // 保存或更新用户自定义
        const supabase = supabaseAdmin;
        const { data: prompt, error } = await supabase
            .from("user_prompts")
            .upsert({
                user_id: userId,
                prompt_key: id,
                template,
                description: defaultPrompt.description,
            }, {
                onConflict: "user_id,prompt_key",
            })
            .select()
            .single();

        if (error) {
            console.error("保存用户 prompt 失败:", error);
            throw new Error(error.message);
        }

        console.log(`✅ 用户 ${userId} 自定义了 Prompt "${id}"`);

        res.json({
            ok: true,
            prompt: {
                ...defaultPrompt,
                template,
                customized: true,
                customized_at: prompt.updated_at,
            },
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
 * DELETE /api/v2/prompts/:id
 * 重置 prompt（删除用户自定义，恢复默认）
 */
promptsRouterV2.delete("/:id", async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        // 检查默认配置中是否存在该 prompt
        const defaultConfig = getDefaultPrompts();
        const defaultPrompt = defaultConfig.prompts?.[id];

        if (!defaultPrompt) {
            return res.status(404).json({
                ok: false,
                error: "prompt_not_found",
                message: `Prompt "${id}" 不存在`,
            });
        }

        // 删除用户自定义
        const supabase = supabaseAdmin;
        const { error } = await supabase
            .from("user_prompts")
            .delete()
            .eq("user_id", userId)
            .eq("prompt_key", id);

        if (error) {
            console.error("删除用户 prompt 失败:", error);
            throw new Error(error.message);
        }

        console.log(`✅ 用户 ${userId} 重置了 Prompt "${id}"`);

        res.json({
            ok: true,
            prompt: defaultPrompt,
            message: "已恢复为默认设置",
        });
    } catch (error) {
        console.error("重置 prompt 失败:", error);
        res.status(500).json({
            ok: false,
            error: error.message || "服务器内部错误",
        });
    }
});

export default promptsRouterV2;
