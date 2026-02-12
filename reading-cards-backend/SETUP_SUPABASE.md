# Supabase 配置指南

## ✅ 已完成的步骤

1. ✅ 数据库迁移已执行
2. ✅ 表已创建：`topics`, `cards`, `documents`
3. ✅ RLS 策略已启用

## 📋 你的 Supabase 项目信息

- **Project ID**: `eqvlgoiiumstaqywtpon`
- **Project URL**: `https://eqvlgoiiumstaqywtpon.supabase.co`
- **Anon Key**: `REDACTED_SUPABASE_ANON_KEY`

## 🔑 获取 Service Role Key（重要！）

**Service Role Key 是后端必需的，用于绕过 RLS 进行管理操作。**

### 步骤：

1. 访问 Supabase 控制台：https://supabase.com/dashboard/project/eqvlgoiiumstaqywtpon
2. 点击左侧菜单的 **Settings**（齿轮图标）
3. 点击 **API**
4. 在 **Project API keys** 部分，找到 **service_role** key
5. 点击 **Reveal** 或 **Copy** 按钮复制这个 key
   - ⚠️ **注意**：这个 key 有完整权限，不要暴露给前端！

## 📝 配置 .env 文件

打开 `reading-cards-backend/.env` 文件，确保包含以下配置：

```env
# ========= 服务器配置 =========
PORT=3000
NODE_ENV=development

# ========= OpenAI 配置 =========
# 如果你有 OpenAI API Key，填入这里
OPENAI_API_KEY=sk-your-openai-api-key-here

# ========= Supabase 配置 =========
SUPABASE_URL=https://eqvlgoiiumstaqywtpon.supabase.co
SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY

# ⬇️ 从 Supabase 控制台获取这个 key ⬇️
SUPABASE_SERVICE_ROLE_KEY=你的-service-role-key-在这里

# ========= 前端 URL（用于 CORS）=========
FRONTEND_URL=http://localhost:5173
```

## ✅ 验证配置

配置完成后，运行：

```bash
cd reading-cards-backend
npm install  # 如果还没安装依赖
npm run dev
```

启动后，你应该看到：

```
=== Supabase 配置状态 ===
SUPABASE_URL: ✅ 已设置
SUPABASE_SERVICE_ROLE_KEY: ✅ 已设置
SUPABASE_ANON_KEY: ✅ 已设置
=========================
🚀 服务器运行在 http://localhost:3000
```

## 🧪 测试连接

### 1. 健康检查
访问：http://localhost:3000/health

应该返回：
```json
{
  "ok": true,
  "version": "2.0.0",
  "features": {
    "cloud_storage": true,
    "auth": true
  }
}
```

### 2. 测试注册
使用 curl 或 Postman：

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123456",
    "name": "测试用户"
  }'
```

如果返回 `{"ok": true, ...}` 说明配置成功！

## 📚 下一步

1. ✅ 配置好 .env 文件
2. ✅ 启动后端服务器
3. ✅ 启动网页端（`cd web-app && npm run dev`）
4. ✅ 测试注册和登录功能

## ❓ 遇到问题？

- **"Supabase 配置不完整"**：检查 .env 文件中的三个 Supabase 变量是否都已填写
- **"Service Role Key 无效"**：确保从 Supabase 控制台正确复制了 service_role key
- **"数据库连接失败"**：检查网络连接，确认 Supabase 项目状态为 ACTIVE_HEALTHY







