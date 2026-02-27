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

// ========= 导入路由 =========

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
import chatRouterV2 from "./routes/v2/chat.mjs";

// ========= Express 应用配置 =========
const app = express();
const PORT = process.env.PORT || 3000;

// CORS 配置
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

// ========= 根路径 =========
app.get("/", (req, res) => {
  res.send(`
    <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
      <h1>Reading Clipper Backend</h1>
      <p>Service is running.</p>
      <p>Visit <a href="http://localhost:5173">Web App</a> to manage your cards.</p>
    </div>
  `);
});

// ========= API 路由 =========

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
app.use("/api/v2/chat", chatRouterV2);

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
  const { checkSupabaseConfig } = await import("./config/supabase.mjs");
  await checkSupabaseConfig();

  app.listen(PORT, () => {
    console.log("");
    console.log("🚀 =======================================");
    console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
    console.log("🚀 =======================================");
    console.log("📡 入口:");
    console.log(`   👉 Web App: http://localhost:5173 (Dev)`);
    console.log("");
  });
})();
