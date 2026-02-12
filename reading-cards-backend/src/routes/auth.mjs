// ========= 认证相关路由 =========

import express from "express";
import { supabaseAdmin, supabaseUrl, supabaseAnonKey } from "../config/supabase.mjs";
import { requireAuth } from "../middleware/auth.mjs";

const router = express.Router();

/**
 * POST /api/auth/register
 * 用户注册
 * 
 * 请求体：
 * {
 *   email: string,
 *   password: string,
 *   name?: string
 * }
 */
router.post("/register", async (req, res) => {
  try {
    const { email, password, name, invite_code } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        ok: false,
        error: "email_password_required",
        message: "邮箱和密码不能为空",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        ok: false,
        error: "password_too_short",
        message: "密码至少需要 6 个字符",
      });
    }

    // 验证邀请码（必填）
    if (!invite_code) {
      return res.status(400).json({
        ok: false,
        error: "invite_code_required",
        message: "邀请码不能为空",
      });
    }

    // 验证邀请码是否有效
    const { data: validationResult, error: validationError } = await supabaseAdmin.rpc(
      "validate_invite_code",
      { p_code: invite_code }
    );

    if (validationError || !validationResult || validationResult.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "invite_code_invalid",
        message: "邀请码无效或不存在",
      });
    }

    const validation = validationResult[0];
    if (!validation.is_valid) {
      return res.status(400).json({
        ok: false,
        error: "invite_code_invalid",
        message: validation.message || "邀请码无效",
      });
    }

    // 创建用户
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // 自动确认邮箱（生产环境可以设为 false 并发送确认邮件）
      user_metadata: {
        name: name || email.split("@")[0],
      },
    });

    if (error) {
      console.error("注册失败:", error);

      if (error.message.includes("already registered")) {
        return res.status(400).json({
          ok: false,
          error: "email_exists",
          message: "该邮箱已被注册",
        });
      }

      return res.status(400).json({
        ok: false,
        error: "register_error",
        message: error.message,
      });
    }

    // 使用邀请码（增加使用次数并记录使用者）
    const { error: useInviteError } = await supabaseAdmin.rpc("use_invite_code", {
      p_code: invite_code,
      p_user_id: data.user.id,
    });

    if (useInviteError) {
      console.error("使用邀请码失败:", useInviteError);
      // 注意：这里用户已经创建成功，但邀请码使用失败
      // 可以考虑回滚用户创建，或者记录日志后继续
    }

    res.json({
      ok: true,
      message: "注册成功，请登录",
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name,
      },
    });
  } catch (error) {
    console.error("注册处理错误:", error);
    res.status(500).json({
      ok: false,
      error: "server_error",
      message: "服务器错误，请稍后重试",
    });
  }
});

/**
 * POST /api/auth/login
 * 用户登录
 * 
 * 请求体：
 * {
 *   email: string,
 *   password: string
 * }
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        ok: false,
        error: "email_password_required",
        message: "邮箱和密码不能为空",
      });
    }

    // 使用 Supabase Auth 登录
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("登录失败:", error);

      return res.status(401).json({
        ok: false,
        error: "login_failed",
        message: "邮箱或密码错误",
      });
    }

    res.json({
      ok: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    });
  } catch (error) {
    console.error("登录处理错误:", error);
    res.status(500).json({
      ok: false,
      error: "server_error",
      message: "服务器错误，请稍后重试",
    });
  }
});

/**
 * POST /api/auth/refresh
 * 刷新访问令牌
 * 
 * 请求体：
 * {
 *   refresh_token: string
 * }
 */
router.post("/refresh", async (req, res) => {
  try {
    const { refresh_token } = req.body || {};

    if (!refresh_token) {
      return res.status(400).json({
        ok: false,
        error: "refresh_token_required",
        message: "刷新令牌不能为空",
      });
    }

    const { data, error } = await supabaseAdmin.auth.refreshSession({
      refresh_token,
    });

    if (error) {
      console.error("刷新令牌失败:", error);

      return res.status(401).json({
        ok: false,
        error: "refresh_failed",
        message: "刷新令牌无效或已过期，请重新登录",
      });
    }

    res.json({
      ok: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    });
  } catch (error) {
    console.error("刷新令牌处理错误:", error);
    res.status(500).json({
      ok: false,
      error: "server_error",
      message: "服务器错误，请稍后重试",
    });
  }
});

/**
 * POST /api/auth/logout
 * 用户登出
 */
router.post("/logout", requireAuth, async (req, res) => {
  try {
    // Supabase 的 signOut 只会使当前 session 失效
    // 实际上前端只需要清除本地存储的 token 即可
    res.json({
      ok: true,
      message: "登出成功",
    });
  } catch (error) {
    console.error("登出处理错误:", error);
    res.status(500).json({
      ok: false,
      error: "server_error",
      message: "服务器错误，请稍后重试",
    });
  }
});

/**
 * GET /api/auth/me
 * 获取当前用户信息
 */
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = req.user;

    res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    console.error("获取用户信息错误:", error);
    res.status(500).json({
      ok: false,
      error: "server_error",
      message: "服务器错误，请稍后重试",
    });
  }
});

/**
 * PATCH /api/auth/me
 * 更新当前用户信息
 * 
 * 请求体：
 * {
 *   name?: string,
 *   password?: string  // 更新密码
 * }
 */
router.patch("/me", requireAuth, async (req, res) => {
  try {
    const { name, password } = req.body || {};
    const userId = req.user.id;

    const updates = {};

    if (name !== undefined) {
      updates.user_metadata = { name };
    }

    if (password !== undefined) {
      if (password.length < 6) {
        return res.status(400).json({
          ok: false,
          error: "password_too_short",
          message: "密码至少需要 6 个字符",
        });
      }
      updates.password = password;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        ok: false,
        error: "no_updates",
        message: "没有提供要更新的字段",
      });
    }

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      updates
    );

    if (error) {
      console.error("更新用户信息失败:", error);
      return res.status(400).json({
        ok: false,
        error: "update_failed",
        message: error.message,
      });
    }

    res.json({
      ok: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name,
      },
    });
  } catch (error) {
    console.error("更新用户信息处理错误:", error);
    res.status(500).json({
      ok: false,
      error: "server_error",
      message: "服务器错误，请稍后重试",
    });
  }
});

/**
 * GET /api/auth/config
 * 获取前端需要的 Supabase 配置（公开接口）
 */
router.get("/config", (req, res) => {
  res.json({
    ok: true,
    config: {
      supabase_url: supabaseUrl,
      supabase_anon_key: supabaseAnonKey,
    },
  });
});

export default router;






