# Reading Clipper 项目启动指南

## 🚀 一行启动命令（CMD）

**后端 + 前端同时启动：**
```cmd
cd /d D:\项目开发\reading-clipper-extension && start cmd /k "cd reading-cards-backend && node src/server.mjs" && start cmd /k "cd web-app && npm run dev"
```

---

## 📁 项目结构说明

```
reading-clipper-extension/
├── web-app/                    ← ✅ 当前使用的前端 (Vite + React)
│   ├── src/
│   │   ├── pages/              ← 页面组件
│   │   ├── components/         ← 共享组件
│   │   └── lib/                ← API, Store
│   └── package.json
│
├── reading-cards-backend/      ← ✅ 当前使用的后端 (Express + Supabase)
│   ├── src/
│   │   ├── server.mjs          ← 入口文件
│   │   ├── routes/v2/          ← V2 API 路由
│   │   └── services/           ← 业务逻辑
│   ├── supabase/migrations/    ← 数据库迁移
│   └── .env                    ← 环境变量
│
├── src/                        ← ⚠️ 旧版浏览器扩展 (不要修改)
│   ├── popup.js
│   └── api/
│
└── manifest.json               ← 浏览器扩展配置
```

---

## ⚠️ 重要区分

| 目录 | 用途 | 状态 |
|------|------|------|
| `web-app/` | **新版 Web 应用** | ✅ 活跃开发 |
| `reading-cards-backend/` | **后端 API 服务** | ✅ 活跃开发 |
| `src/` (根目录) | 旧版浏览器扩展 popup | ⚠️ 遗留代码 |

---

## 🌐 访问地址

| 服务 | 地址 |
|------|------|
| **Web App (前端)** | http://localhost:5173 |
| **Backend API** | http://localhost:3000 |
| **Debug UI** | http://localhost:3000/debug |

---

## 🛠️ 单独启动命令

**只启动后端：**
```cmd
cd /d D:\项目开发\reading-clipper-extension\reading-cards-backend && node src/server.mjs
```

**只启动前端：**
```cmd
cd /d D:\项目开发\reading-clipper-extension\web-app && npm run dev
```
