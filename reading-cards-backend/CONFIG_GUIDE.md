# 🔧 Supabase 配置指南

## 📍 你的项目路径
`C:\Users\10596\Dropbox\项目开发\reading-clipper-extension\reading-cards-backend`

## ✅ 已完成的步骤
1. ✅ 数据库表已创建（topics, cards, documents）
2. ✅ RLS 策略已启用

## 🔑 需要配置的信息

### 1. 打开 Supabase 控制台获取 Service Role Key

访问：https://supabase.com/dashboard/project/eqvlgoiiumstaqywtpon/settings/api

在 "Project API keys" 部分：
- 找到 **service_role** key（注意：不是 anon key）
- 点击 **Reveal** 按钮显示
- 复制完整的 key（以 `eyJhbG...` 开头）

### 2. 编辑 .env 文件

打开文件：`C:\Users\10596\Dropbox\项目开发\reading-clipper-extension\reading-cards-backend\.env`

**添加或更新以下配置：**

```env
# ========= Supabase 配置 =========
SUPABASE_URL=https://eqvlgoiiumstaqywtpon.supabase.co
SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY

# ⬇️ 把从控制台复制的 service_role key 粘贴到这里 ⬇️
SUPABASE_SERVICE_ROLE_KEY=你的-service-role-key-粘贴在这里
```

**重要提示：**
- `SUPABASE_SERVICE_ROLE_KEY` 必须填写，否则无法使用云端存储功能
- Service Role Key 有完整权限，不要分享给任何人

### 3. 验证配置

保存 `.env` 文件后，重新启动服务器：

```bash
# 按 Ctrl+C 停止当前服务器
npm run dev
```

**如果配置正确，你应该看到：**

```
=== Supabase 配置状态 ===
SUPABASE_URL: ✅ 已设置
SUPABASE_SERVICE_ROLE_KEY: ✅ 已设置
SUPABASE_ANON_KEY: ✅ 已设置
=========================
```

**如果看到 ❌，说明配置有问题，请检查：**
1. `.env` 文件是否在正确的位置
2. Service Role Key 是否完整复制（没有多余空格）
3. 是否保存了文件

### 4. 测试 API

配置成功后，测试注册接口：

```bash
curl -X POST http://localhost:3000/api/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"test@example.com\",\"password\":\"test123456\",\"name\":\"测试用户\"}"
```

或者在浏览器访问：http://localhost:3000/health

应该看到：
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

## 🎯 下一步

配置完成后：
1. ✅ 启动网页端：`cd ../web-app && npm run dev`
2. ✅ 访问 http://localhost:5173 注册账号
3. ✅ 测试浏览器扩展保存卡片功能

## ❓ 遇到问题？

- **找不到 .env 文件**：在项目根目录创建 `.env` 文件
- **Service Role Key 无效**：确保从 Supabase 控制台正确复制了 service_role key（不是 anon key）
- **配置不生效**：重启服务器，确保 `.env` 文件已保存







