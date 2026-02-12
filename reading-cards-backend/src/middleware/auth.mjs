// ========= 认证中间件 =========

import { verifyToken, createSupabaseClient } from "../config/supabase.mjs";

/**
 * 认证中间件
 * 从请求头中提取 JWT token，验证后将用户信息和 Supabase 客户端附加到请求对象
 * 
 * 请求头格式：Authorization: Bearer <token>
 */
export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        ok: false,
        error: "unauthorized",
        message: "请先登录",
      });
    }

    const token = authHeader.substring(7); // 去掉 "Bearer " 前缀

    if (!token) {
      return res.status(401).json({
        ok: false,
        error: "unauthorized",
        message: "Token 不能为空",
      });
    }

    // 验证 token 并获取用户信息
    const user = await verifyToken(token);

    if (!user) {
      return res.status(401).json({
        ok: false,
        error: "invalid_token",
        message: "Token 无效或已过期，请重新登录",
      });
    }

    // 将用户信息和带权限的 Supabase 客户端附加到请求对象
    req.user = user;
    req.supabase = createSupabaseClient(token);
    req.accessToken = token;

    next();
  } catch (error) {
    console.error("认证中间件错误:", error);
    return res.status(500).json({
      ok: false,
      error: "auth_error",
      message: "认证过程出错",
    });
  }
}

/**
 * 可选认证中间件
 * 如果提供了有效的 token，则附加用户信息；否则继续处理请求
 * 用于支持匿名访问但登录用户有额外功能的场景
 */
export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);

      if (token) {
        const user = await verifyToken(token);

        if (user) {
          req.user = user;
          req.supabase = createSupabaseClient(token);
          req.accessToken = token;
        }
      }
    }

    next();
  } catch (error) {
    // 可选认证失败不阻止请求继续
    console.warn("可选认证失败:", error.message);
    next();
  }
}







