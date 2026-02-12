# Reading Clipper 部署指南

本文档介绍如何将 Reading Clipper 部署为可对外使用的产品。

## 架构概述

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户设备                                   │
├─────────────────────┬───────────────────────────────────────────┤
│  浏览器扩展          │           网页端                           │
│  (Chrome Extension) │        (React SPA)                        │
└─────────┬───────────┴───────────────┬───────────────────────────┘
          │                           │
          │  HTTP/HTTPS               │
          ▼                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     后端 API                                     │
│               (Node.js / Express)                               │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  /api/auth   │  │ /api/v2/...  │  │  /api/...    │          │
│  │  认证服务     │  │  云端存储API  │  │  本地存储API  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Supabase                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  PostgreSQL  │  │    Auth      │  │   Storage    │          │
│  │   数据库      │  │   认证服务    │  │   文件存储    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## 1. 准备工作

### 1.1 创建 Supabase 项目

1. 访问 [Supabase](https://supabase.com) 并注册/登录
2. 点击 "New Project" 创建新项目
3. 记录以下信息（Settings -> API）：
   - Project URL (`SUPABASE_URL`)
   - anon public key (`SUPABASE_ANON_KEY`)
   - service_role key (`SUPABASE_SERVICE_ROLE_KEY`)

### 1.2 初始化数据库

在 Supabase 的 SQL Editor 中执行 `reading-cards-backend/supabase/migrations/001_initial_schema.sql` 文件的内容。

这会创建：
- `topics` 表（用户的主题）
- `cards` 表（知识卡片）
- `documents` 表（文档/故事线）
- RLS 策略（确保用户只能访问自己的数据）
- 必要的索引和触发器

### 1.3 配置环境变量

复制环境变量示例文件并填入实际值：

```bash
# 后端
cd reading-cards-backend
cp env.example .env
# 编辑 .env 文件，填入 Supabase 和 OpenAI 的配置

# 网页端
cd ../web-app
cp env.example .env
# 编辑 .env 文件（开发环境可以保持默认）
```

## 2. 本地开发

### 2.1 启动后端

```bash
cd reading-cards-backend
npm install
npm run dev
```

后端将在 http://localhost:3000 启动。

### 2.2 启动网页端

```bash
cd web-app
npm install
npm run dev
```

网页端将在 http://localhost:5173 启动。

### 2.3 加载浏览器扩展

1. 在项目根目录运行 `npm run build` 构建扩展
2. 打开 Chrome，访问 `chrome://extensions/`
3. 启用「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `dist` 目录

## 3. 生产部署

### 3.1 部署后端

推荐使用以下平台部署 Node.js 后端：

#### Railway / Render / Fly.io

```bash
# 以 Railway 为例
npm install -g railway
railway login
railway init
railway up
```

设置环境变量：
- `PORT`
- `NODE_ENV=production`
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_URL`（你的网页端域名）

#### Docker 部署

```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### 3.2 部署网页端

推荐使用静态网站托管平台：

#### Vercel

```bash
cd web-app
npm install -g vercel
vercel
```

#### Netlify

```bash
cd web-app
npm run build
# 上传 dist 目录到 Netlify
```

#### 自托管 (Nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/reading-clipper/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3.3 发布浏览器扩展

1. 更新 `public/manifest.json` 中的 `host_permissions`，添加你的生产后端域名
2. 更新 `public/background.js` 中的 `BACKEND_URL` 为生产地址
3. 运行 `npm run build` 构建扩展
4. 打包 `dist` 目录为 ZIP 文件
5. 提交到 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)

## 4. API 端点说明

### 认证 API (`/api/auth`)

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/register` | 用户注册 |
| POST | `/login` | 用户登录 |
| POST | `/refresh` | 刷新访问令牌 |
| POST | `/logout` | 退出登录 |
| GET | `/me` | 获取当前用户信息 |
| PATCH | `/me` | 更新用户信息 |
| GET | `/config` | 获取 Supabase 配置 |

### V2 API（需要认证）

#### 卡片 (`/api/v2/cards`)

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/` | 获取卡片列表 |
| POST | `/capture` | 捕获新卡片 |
| POST | `/search` | 搜索卡片 |
| GET | `/:id` | 获取单个卡片 |
| PATCH | `/:id` | 更新卡片 |
| DELETE | `/:id` | 删除卡片 |

#### Topics (`/api/v2/topics`)

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/` | 获取 Topic 列表 |
| POST | `/` | 创建 Topic |
| GET | `/:id` | 获取单个 Topic |
| PATCH | `/:id` | 更新 Topic |
| DELETE | `/:id` | 删除 Topic |

#### 文档 (`/api/v2/documents`)

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/` | 获取文档列表 |
| POST | `/` | 创建空文档 |
| POST | `/from-cards` | 从卡片生成文档 |
| GET | `/:id` | 获取文档详情 |
| PATCH | `/:id` | 更新文档 |
| DELETE | `/:id` | 删除文档 |

### V1 API（本地存储，无需认证）

保留用于开发和向后兼容，路径与 V2 相同但去掉 `/v2` 前缀。

## 5. 数据库表结构

### topics 表

| 字段 | 类型 | 描述 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID | 用户 ID（外键） |
| title | TEXT | 主题名称 |
| description | TEXT | 描述 |
| color | TEXT | 颜色代码 |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |

### cards 表

| 字段 | 类型 | 描述 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID | 用户 ID（外键） |
| topic_id | UUID | 主题 ID（外键，可空） |
| summary | TEXT | AI 生成的摘要 |
| key_points | JSONB | 要点列表 |
| raw_snippet | TEXT | 原始划线内容 |
| note | TEXT | 用户批注 |
| source_name | TEXT | 来源名称 |
| source_url | TEXT | 来源 URL |
| image_url | TEXT | 图片 URL |
| deleted | BOOLEAN | 软删除标记 |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |

### documents 表

| 字段 | 类型 | 描述 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID | 用户 ID（外键） |
| topic_id | UUID | 主题 ID（外键，可空） |
| title | TEXT | 文档标题 |
| doc_questions | JSONB | 文档级问题 |
| doc_hypotheses | JSONB | 文档级假设 |
| story_units | JSONB | 故事单元 |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |

## 6. 安全注意事项

1. **永远不要**在前端代码中暴露 `SUPABASE_SERVICE_ROLE_KEY`
2. 生产环境务必启用 HTTPS
3. 定期轮换 API 密钥
4. 监控 Supabase 使用量，设置适当的配额
5. 启用 Supabase 的 RLS（Row Level Security）确保数据隔离

## 7. 故障排查

### 常见问题

**Q: 登录后扩展仍显示未登录**
A: 检查浏览器扩展的存储权限，确保 `chrome.storage.sync` 可用

**Q: 卡片保存失败**
A: 
1. 检查后端是否运行
2. 检查 CORS 配置
3. 查看浏览器控制台错误信息

**Q: AI 摘要生成失败**
A: 检查 `OPENAI_API_KEY` 是否有效，API 配额是否充足

**Q: 数据库连接失败**
A: 确认 Supabase URL 和密钥配置正确，检查网络连接

## 8. 更新日志

### v1.0.0
- 初始版本
- 支持用户注册/登录
- 支持卡片、Topic、文档的 CRUD
- 支持云端同步
- 支持浏览器扩展划线保存







