# Reading Clipper 快速启动指南

## 🚀 5 分钟快速体验

### 第一步：设置 Supabase

1. 访问 [supabase.com](https://supabase.com) 创建免费账号
2. 创建新项目，等待初始化完成
3. 进入 SQL Editor，复制并执行 `reading-cards-backend/supabase/migrations/001_initial_schema.sql` 的内容
4. 进入 Settings → API，记录以下信息：
   - Project URL
   - anon public key
   - service_role key

### 第二步：配置后端

```bash
cd reading-cards-backend

# 复制环境变量模板
cp env.example .env

# 编辑 .env 文件，填入：
# - OPENAI_API_KEY（你的 OpenAI API 密钥）
# - SUPABASE_URL（从 Supabase 获取）
# - SUPABASE_ANON_KEY（从 Supabase 获取）
# - SUPABASE_SERVICE_ROLE_KEY（从 Supabase 获取）

# 安装依赖并启动
npm install
npm run dev
```

### 第三步：配置网页端

```bash
cd web-app

# 安装依赖并启动
npm install
npm run dev
```

打开浏览器访问 http://localhost:5173

### 第四步：安装浏览器扩展

```bash
# 回到项目根目录
cd ..

# 构建扩展
npm run build
```

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `dist` 目录

## 📖 使用方法

### 注册账号

1. 打开网页端 http://localhost:5173
2. 点击「立即注册」
3. 填写邮箱、密码，完成注册

### 保存知识卡片

1. 在任意网页选中文字
2. 右键点击「保存为阅读卡片」
3. 卡片会自动保存并同步到云端

### 管理卡片

1. 在网页端登录
2. 访问「全部卡片」查看和管理卡片
3. 访问「Topics」创建和管理主题分类
4. 访问「文档」创建研究文档

## 🔧 常用命令

```bash
# 后端
cd reading-cards-backend
npm run dev          # 启动开发服务器

# 网页端
cd web-app
npm run dev          # 启动开发服务器
npm run build        # 构建生产版本

# 扩展
npm run build        # 构建浏览器扩展
```

## 📁 项目结构

```
reading-clipper-extension/
├── reading-cards-backend/    # 后端服务
│   ├── src/
│   │   ├── server.mjs       # 服务器入口
│   │   ├── routes/          # API 路由
│   │   │   ├── auth.mjs     # 认证路由
│   │   │   ├── v2/          # V2 API（云端存储）
│   │   │   └── ...          # V1 API（本地存储）
│   │   ├── services/        # 业务逻辑
│   │   │   └── supabase/    # Supabase 数据服务
│   │   ├── middleware/      # 中间件
│   │   └── config/          # 配置
│   └── supabase/
│       └── migrations/      # 数据库迁移脚本
│
├── web-app/                  # 网页端前端
│   ├── src/
│   │   ├── pages/           # 页面组件
│   │   ├── components/      # 通用组件
│   │   └── lib/             # 工具库（API、状态管理）
│   └── ...
│
├── src/                      # 浏览器扩展前端
├── public/                   # 扩展静态文件
│   ├── manifest.json        # 扩展配置
│   └── background.js        # 后台脚本
│
└── dist/                     # 构建输出
```

## 🌐 API 概览

| 端点 | 描述 | 认证 |
|------|------|------|
| `/api/auth/*` | 用户认证 | 否 |
| `/api/v2/cards/*` | 卡片管理（云端） | 是 |
| `/api/v2/topics/*` | 主题管理（云端） | 是 |
| `/api/v2/documents/*` | 文档管理（云端） | 是 |
| `/api/cards/*` | 卡片管理（本地） | 否 |
| `/api/topics/*` | 主题管理（本地） | 否 |

## 💡 提示

- **开发阶段**：可以同时使用 V1（本地）和 V2（云端）API
- **本地数据**：旧的 JSON 文件数据仍然可用，通过 V1 API 访问
- **新数据**：登录后创建的数据都会存储到 Supabase 云端
- **离线使用**：未登录时，扩展会自动使用本地存储

## 🔗 更多资源

- 详细部署指南：[DEPLOYMENT.md](./DEPLOYMENT.md)
- Supabase 文档：https://supabase.com/docs
- OpenAI API 文档：https://platform.openai.com/docs







