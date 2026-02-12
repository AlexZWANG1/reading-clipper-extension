// ========= Supabase 客户端配置 =========

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// 确保环境变量已加载（ES 模块 import 会在 server.mjs 的 dotenv.config() 之前执行）
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../../.env") });

// 从 .env 环境变量读取配置（请参考 .env.example 设置）
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.error("❌ SUPABASE_URL 环境变量未设置");
}

// Service Role 客户端 - 用于后端管理操作（绕过 RLS）
// 注意：仅在后端使用，绝对不要暴露给前端
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

// 创建带用户上下文的 Supabase 客户端
// 用于需要遵循 RLS 策略的操作
export function createSupabaseClient(accessToken) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 配置不完整");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// 验证 JWT Token 并获取用户信息
export async function verifyToken(token) {
  if (!supabaseAdmin) {
    throw new Error("Supabase Admin 客户端未初始化");
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

// 导出配置检查函数
export async function checkSupabaseConfig() {
  const config = {
    url: !!supabaseUrl,
    serviceKey: !!supabaseServiceKey,
    anonKey: !!supabaseAnonKey,
  };

  console.log("=== Supabase 配置状态 ===");
  console.log("SUPABASE_URL:", config.url ? "✅ 已设置" : "❌ 未设置");
  console.log("SUPABASE_SERVICE_ROLE_KEY:", config.serviceKey ? "✅ 已设置" : "❌ 未设置");
  console.log("SUPABASE_ANON_KEY:", config.anonKey ? "✅ 已设置" : "❌ 未设置");
  
  // 测试连接
  if (config.url && config.serviceKey) {
    try {
      const { data, error } = await supabaseAdmin
        .from('topics')
        .select('count', { count: 'exact', head: true });
      
      if (error) {
        console.log("⚠️ 数据库连接测试:", error.message);
      } else {
        console.log("✅ 数据库连接成功！");
      }
    } catch (err) {
      console.log("⚠️ 连接测试失败:", err.message);
    }
  }
  
  console.log("=========================");

  return config;
}

export { supabaseUrl, supabaseAnonKey };

