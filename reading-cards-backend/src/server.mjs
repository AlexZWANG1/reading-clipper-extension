// ========= 服务器入口 =========

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

// ========= 环境变量加载 =========
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, "../.env");

dotenv.config({ override: true });
const result = dotenv.config({ path: envPath, override: true });

console.log("=== 环境变量加载调试 ===");
console.log("尝试加载 .env 文件路径:", envPath);
console.log("文件是否存在:", fs.existsSync(envPath));
if (result.error) {
  console.error("❌ 加载 .env 文件失败:", result.error.message);
} else {
  console.log("✅ .env 文件加载成功");
  console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "✅ 已设置" : "❌ 未设置");
  console.log("SUPABASE_URL:", process.env.SUPABASE_URL ? "✅ 已设置" : "❌ 未设置");
  console.log("SUPABASE_SERVICE_ROLE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "✅ 已设置" : "❌ 未设置");
  console.log("SUPABASE_ANON_KEY:", process.env.SUPABASE_ANON_KEY ? "✅ 已设置" : "❌ 未设置");
}
// ========= 启动模式检查 =========
const FORCE_LOCAL_MODE = process.env.LOCAL_MODE === 'true';
const HAS_SUPABASE = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && !FORCE_LOCAL_MODE);
const IS_LOCAL_MODE = !HAS_SUPABASE;

console.log("");
console.log("🛠️  启动模式检查:");
console.log(`   Local Mode (V1 Fallback): ${IS_LOCAL_MODE ? "✅ 开启" : "❌ 关闭"}`);
console.log(`   Cloud Mode (Supabase V2): ${HAS_SUPABASE ? "✅ 开启" : "❌ 关闭"}`);
if (FORCE_LOCAL_MODE) console.log("   (强制 Local Mode 已启用)");
console.log("");

// ========= 导入路由 =========

// 旧版路由（本地 JSON 存储）
import cardsRouter from "./routes/cards.mjs";
import topicsRouter from "./routes/topics.mjs";
import documentsRouter from "./routes/documents.mjs";
import sourcesRouter from "./routes/sources.mjs";
import hypothesesRouter from "./routes/hypotheses.mjs";
import promptsRouter from "./routes/prompts.mjs";

// V2 路由（云端存储）
import authRouter from "./routes/auth.mjs";
import cardsRouterV2 from "./routes/v2/cards.mjs";
import topicsRouterV2 from "./routes/v2/topics.mjs";
import documentsRouterV2 from "./routes/v2/documents.mjs";
import settingsRouterV2 from "./routes/v2/settings.mjs";
import invitesRouterV2 from "./routes/v2/invites.mjs";
import sourcesRouterV2 from "./routes/v2/sources.mjs";
import promptsRouterV2 from "./routes/v2/prompts.mjs";
import hypothesesRouterV2 from "./routes/v2/hypotheses.mjs";
import boardsRouterV2 from "./routes/v2/boards.mjs";
import aiBoardsRouterV2 from "./routes/v2/ai_boards.mjs";

// Adapter (Mock) 路由 - 仅在 Local Mode 使用
import authMockRouter from "./routes/mock/auth_mock.mjs";
import adapterRouterV2 from "./routes/mock/adapter_v2.mjs";

// ========= Supabase 配置检查 =========
// 动态导入移至启动函数中
// if (HAS_SUPABASE) {
//   import { checkSupabaseConfig } from "./config/supabase.mjs";
// }

// ========= Express 应用配置 =========
const app = express();
const PORT = process.env.PORT || 3000;

// CORS 配置 (保持不变...)
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      "http://localhost:5173",      // Web App Dev
      "http://localhost:3000",      // Backend
      "chrome-extension://",        // Extension
      process.env.FRONTEND_URL,
    ].filter(Boolean);

    if (!origin) return callback(null, true);

    if (allowedOrigins.some(allowed => origin.startsWith(allowed) || allowed === origin)) {
      callback(null, true);
    } else {
      console.warn("CORS 拒绝来源:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ========= 静态文件路由调整 =========

// 1. /debug -> 旧版 UI
app.use("/debug", express.static(join(__dirname, "../public")));

// 2. / -> 提示信息 (避免根路径显示旧 UI)
app.get("/", (req, res) => {
  res.send(`
    <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
      <h1>Reading Clipper Backend</h1>
      <p>Service is running.</p>
      <p>Visit <a href="http://localhost:5173">Web App</a> to manage your cards.</p>
      <p style="color: #666; font-size: 12px; margin-top: 20px;">
        Old UI moved to <a href="/debug">/debug</a>
      </p>
    </div>
  `);
});

// ========= API 路由 =========

// V1 API (始终可用，Web App Adapter 和 Extension 都会用到)
app.use("/api/cards", cardsRouter);
app.use("/api/topics", topicsRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/sources", sourcesRouter);
app.use("/api/hypotheses", hypothesesRouter);
app.use("/api/prompts", promptsRouter);

if (IS_LOCAL_MODE) {
  // === Local Mode: 使用 Adapter ===
  console.log("⚠️  正在使用 Local Adapter 模拟 V2 API...");

  // 1. Mock Auth
  app.use("/api/auth", authMockRouter);

  // 2. V2 Adapter (转发到 V1 逻辑)
  // 注意：这里我们使用一个聚合的 adapterRouter 来处理所有 /api/v2 请求
  app.use("/api/v2", adapterRouterV2);

} else {
  // === Cloud Mode: 使用真实 Supabase ===
  app.use("/api/auth", authRouter);
  app.use("/api/v2/cards", cardsRouterV2);
  app.use("/api/v2/topics", topicsRouterV2);
  app.use("/api/v2/documents", documentsRouterV2);
  app.use("/api/v2/settings", settingsRouterV2);
  app.use("/api/v2/invites", invitesRouterV2);
  app.use("/api/v2/sources", sourcesRouterV2);
  app.use("/api/v2/prompts", promptsRouterV2);
  app.use("/api/v2/hypotheses", hypothesesRouterV2);
  app.use("/api/v2/boards", boardsRouterV2);
  app.use("/api/v2/ai", aiBoardsRouterV2);
}

// ========= 错误处理 =========
app.use((err, req, res, next) => {
  console.error("服务器错误:", err);
  res.status(500).json({
    ok: false,
    error: "server_error",
    message: process.env.NODE_ENV === "development" ? err.message : "服务器内部错误",
  });
});

// ========= 启动服务器 =========
(async () => {
  if (HAS_SUPABASE) {
    // 动态导入并执行检查
    const { checkSupabaseConfig } = await import("./config/supabase.mjs");
    await checkSupabaseConfig();
  }

  app.listen(PORT, () => {
    console.log("");
    console.log("🚀 =======================================");
    console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
    console.log(`   模式: ${IS_LOCAL_MODE ? "Local (V1 Adapter)" : "Cloud (Supabase)"}`);
    console.log("🚀 =======================================");
    console.log("📡 入口:");
    console.log(`   👉 Web App: http://localhost:5173 (Dev)`);
    console.log(`   🐞 Debug UI: http://localhost:${PORT}/debug`);
    console.log("");
  });
})();
