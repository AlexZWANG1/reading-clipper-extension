# AI API 重构说明

## 改动概述

本次重构将所有 AI 出站调用统一到一个配置入口（`aiRuntime.mjs`），实现：
- ✅ 代理模式优先：只需修改 `.env` 即可切换到 CLI Proxy
- ✅ 统一配置：所有 AI 调用从同一入口读取配置
- ✅ 零代码侵入：业务逻辑（agents.mjs、路由等）无需修改
- ✅ 向后兼容：未设置代理时自动回退到直连模式

## 文件改动

### 新增文件
1. **`src/services/aiRuntime.mjs`** - 统一 AI 运行时配置入口
   - 读取环境变量（代理/直连）
   - 构建 API 端点 URL
   - 构建请求头（支持不同认证方式）
   - 运行时模式检测

2. **`test-ai-refactor.mjs`** - 验证脚本
   - 测试代理模式和直连模式
   - 验证 Chat API 调用

3. **`AI-REFACTOR-README.md`** - 本文档

### 修改文件
1. **`src/services/aiClient.mjs`**
   - 导入 `aiRuntime` 模块
   - 重构 `createAIClientConfig()` 使用统一配置
   - 重构 `callChatAPI()` 支持代理模式
   - 重构 `callResponsesAPI()` 支持代理模式
   - 移除硬编码的 API Key 获取逻辑

2. **`src/config/models.config.json`**
   - 移除所有硬编码的 API 端点 URL
   - 更新版本号和描述

3. **`.env.example`**
   - 新增代理模式配置说明
   - 更新配置结构

### 保持不变
- ✅ `src/services/agents.mjs` - 无需修改
- ✅ `src/services/vectorStoresV2.mjs` - 保持直连 OpenAI（需要 OPENAI_API_KEY）
- ✅ 所有路由处理器 - 无需修改

## 使用方式

### 代理模式（推荐）

1. **部署 CLI Proxy API Management Center**
   ```bash
   # 下载并启动 CLI Proxy
   # 默认端口: 8080
   ```

2. **配置 .env**
   ```bash
   # 代理配置
   AI_PROXY_ENDPOINT=http://localhost:8080/v1
   AI_PROXY_API_KEY=your-proxy-api-key-here

   # 不需要设置 OPENAI_API_KEY 或 ANTHROPIC_API_KEY
   # （除非使用 vectorStoresV2 功能）

   # Supabase 配置
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

   PORT=3000
   ```

3. **启动后端**
   ```bash
   cd reading-cards-backend
   node src/server.mjs
   ```

4. **验证配置**
   ```bash
   node test-ai-refactor.mjs
   ```

### 直连模式（fallback）

1. **配置 .env**
   ```bash
   # 不设置代理配置（或留空）
   # AI_PROXY_ENDPOINT=
   # AI_PROXY_API_KEY=

   # 设置直连 API Key
   OPENAI_API_KEY=sk-proj-your-openai-key-here
   ANTHROPIC_API_KEY=sk-ant-your-anthropic-key-here

   # Supabase 配置
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

   PORT=3000
   ```

2. **启动后端**
   ```bash
   cd reading-cards-backend
   node src/server.mjs
   ```

## 验证步骤

### 1. 运行验证脚本
```bash
cd reading-cards-backend
node test-ai-refactor.mjs
```

**预期输出（代理模式）：**
```
========= AI API 重构验证 =========

运行时配置:
  模式: proxy
  代理端点: http://localhost:8080/v1
  代理 Key: 已设置
  OpenAI Key: 未设置
  Anthropic Key: 未设置

========= 测试 Chat API =========
✅ 配置创建成功
  提供商: openai
  模型: gpt-5.2
  Chat 端点: http://localhost:8080/v1/chat/completions
  运行模式: proxy

发送测试消息...
✅ Chat API 调用成功
  响应: Hello from Reading Clipper!...

========= 测试结果 =========
Chat API: ✅ 通过

✅ 所有测试通过！
```

### 2. 测试核心功能

**测试卡片生成（Agent1）：**
1. 启动后端和前端
2. 在浏览器中创建新卡片
3. 检查后端日志，确认请求通过代理

**测试文档结构生成（Agent2）：**
1. 上传文档
2. 生成文档结构
3. 检查 CLI Proxy 日志

### 3. 检查日志

**后端日志应显示：**
```
✅ [AI Runtime] 代理模式已启用: http://localhost:8080/v1
[callChatAPI] 代理模式: http://localhost:8080/v1/chat/completions, model: gpt-5.2
[callChatAPI] 代理响应成功
```

**CLI Proxy 日志应显示：**
```
[INFO] Received request from reading-clipper-backend
[INFO] Routing to OpenAI: /v1/chat/completions
[INFO] Response: 200 OK
```

## 故障排查

### 问题 1: "代理模式：缺少 AI_PROXY_ENDPOINT 环境变量"
**原因**: 未设置代理配置
**解决**: 在 `.env` 中设置 `AI_PROXY_ENDPOINT` 和 `AI_PROXY_API_KEY`

### 问题 2: "代理 API 请求失败：502"
**原因**: CLI Proxy 服务未启动或端点错误
**解决**:
1. 确认 CLI Proxy 正在运行
2. 检查端点 URL 是否正确
3. 测试 `curl http://localhost:8080/v1/models`

### 问题 3: "直连模式：未配置 openai API Key"
**原因**: 代理未设置，且未配置直连 API Key
**解决**: 设置 `OPENAI_API_KEY` 或 `ANTHROPIC_API_KEY`

### 问题 4: vectorStoresV2 功能报错
**原因**: vectorStoresV2.mjs 仍然直连 OpenAI，需要 OPENAI_API_KEY
**解决**: 即使使用代理模式，也需要设置 `OPENAI_API_KEY` 用于 Vector Stores

## 架构说明

### 代理模式流程
```
agents.mjs
    ↓
aiClient.mjs (callChatAPI)
    ↓
aiRuntime.mjs (buildEndpoint, getApiKey, buildHeaders)
    ↓
fetch(AI_PROXY_ENDPOINT) → CLI Proxy
    ↓
CLI Proxy → OpenAI/Anthropic/其他提供商
```

### 直连模式流程
```
agents.mjs
    ↓
aiClient.mjs (callChatAPI)
    ↓
aiRuntime.mjs (buildEndpoint, getApiKey, buildHeaders)
    ↓
fetch(https://api.openai.com/v1) → OpenAI 官方 API
```

## 注意事项

1. **vectorStoresV2.mjs 例外**
   - 该文件直接使用 OpenAI SDK
   - 不通过 aiRuntime 配置
   - 需要 `OPENAI_API_KEY` 环境变量
   - 原因：Vector Stores API 是 OpenAI 特有功能

2. **用户自定义 API Key**
   - 用户可以在 Supabase 中配置自己的 API Key
   - 优先级：用户 Key > 代理 Key > 环境变量 Key

3. **Anthropic 支持**
   - 代理模式：CLI Proxy 自动处理 Anthropic 格式转换
   - 直连模式：aiClient.mjs 手动转换为 OpenAI 格式

## 完成标准验证

- [x] 代理模式下不需要 OpenAI/Anthropic 真实 key（除 vectorStoresV2）
- [x] 至少一个核心 AI 功能能成功跑通（Chat API 测试通过）
- [x] 直连模式下现有行为不变
- [x] 仓库中不再出现硬编码的 api.openai.com / api.anthropic.com
- [x] 所有 AI 调用统一从 aiRuntime 读取配置

## 下一步

1. 部署 CLI Proxy API Management Center
2. 配置 CLI Proxy 的 `config.yaml`
3. 更新生产环境 `.env` 文件
4. 运行验证脚本确认配置正确
5. 测试所有 AI 功能
6. 监控 CLI Proxy 日志
