# Reading Clipper

一键保存网页划线内容为知识卡片，支持云端同步。

## 🚀 快速启动

**后端 + 前端同时启动（CMD）：**
```cmd
cd /d D:\项目开发\reading-clipper-extension && start cmd /k "cd reading-cards-backend && node src/server.mjs" && start cmd /k "cd web-app && npm run dev"
```

| 服务 | 地址 |
|------|------|
| **Web App (前端)** | http://localhost:5173 |
| **Backend API** | http://localhost:3000 |

---

## 📁 项目结构

```
reading-clipper-extension/
├── public/                           ← Chrome 扩展静态文件
│   ├── manifest.json                 ← 扩展配置
│   ├── background.js                 ← Service Worker（右键菜单、卡片捕获）
│   └── icons/                        ← 扩展图标
│
├── src/                              ← 浏览器扩展 Popup UI（React）
│   ├── App.jsx                       ← 主组件（登录、设置）
│   ├── main.jsx                      ← 入口
│   ├── api/                          ← 认证 & API 调用
│   ├── components/                   ← UI 组件（LoginView 等）
│   └── hooks/                        ← React Hooks
│
├── index.html                        ← Vite 入口（构建扩展 Popup）
├── vite.config.js                    ← Vite 构建配置
├── package.json                      ← 扩展构建依赖
├── tailwind.config.js / postcss.config.js
├── dist/                             ← 构建输出（加载到 Chrome 的目录）
│
├── reading-cards-backend/            ← 后端 API 服务
│   ├── .env / .env.example           ← 环境变量
│   ├── package.json                  ← 后端依赖
│   ├── SETUP_SUPABASE.md             ← Supabase 配置指南
│   ├── src/
│   │   ├── server.mjs                ← 服务器入口
│   │   ├── routes/                   ← API 路由（auth, v2/cards, v2/topics, v2/documents...）
│   │   ├── services/                 ← 业务逻辑
│   │   ├── config/                   ← 配置
│   │   └── middleware/               ← 中间件（认证）
│   └── supabase/
│       └── migrations/               ← 数据库迁移脚本
│
└── web-app/                          ← Web 应用前端（Vite + React）
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── App.jsx                   ← 主应用（路由）
        ├── pages/                    ← 页面组件
        ├── components/               ← 共享组件
        └── lib/                      ← API 客户端、状态管理
```

---

## 🛠️ 单独启动命令

| 操作 | 命令 |
|------|------|
| 启动后端 | `cd reading-cards-backend && node src/server.mjs` |
| 启动前端 | `cd web-app && npm run dev` |
| 构建扩展 | `npm run build`（根目录，输出到 `dist/`） |

## 🔌 安装浏览器扩展

1. 根目录执行 `npm run build`
2. Chrome → `chrome://extensions/` → 开发者模式
3. 加载已解压的扩展程序 → 选择 `dist/` 目录

## 🌐 API 概览

| 端点 | 描述 | 认证 |
|------|------|------|
| `/api/auth/*` | 用户注册/登录/刷新 | 否 |
| `/api/v2/cards/*` | 卡片 CRUD（云端） | 是 |
| `/api/v2/topics/*` | 主题 CRUD（云端） | 是 |
| `/api/v2/documents/*` | 文档 CRUD（云端） | 是 |
| `/api/v2/sources/*` | 信息源 CRUD（云端） | 是 |
| `/api/v2/prompts/*` | Prompt 管理（云端） | 是 |
