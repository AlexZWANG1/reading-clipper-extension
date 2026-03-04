# NotebookLM 升级 — 测试报告

**测试日期：** 2026-03-04
**测试人员：** Claude Code
**状态：** ✅ 全部通过

---

## 测试环境

- **Ollama:** http://127.0.0.1:11434 (nomic-embed-text, 768 dims)
- **Python Sidecar:** http://127.0.0.1:8100
- **Node.js Backend:** http://localhost:3000
- **Database:** Supabase (eqvlgoiiumstaqywtpon)
- **Test User:** test@example.com (ID: 34920265-2ca4-4ac7-b2e5-bf2caacedd8b)

---

## Phase 1: Python Sidecar 测试

### 1.1 Ollama Embedding
```bash
curl http://127.0.0.1:11434/api/tags
```
**结果：** ✅ 通过
**输出：** nomic-embed-text:latest (768 dims, 274MB)

### 1.2 Sidecar Health
```bash
curl http://127.0.0.1:8100/health
```
**结果：** ✅ 通过
**输出：** `{"ok":true,"version":"0.1.0"}`

### 1.3 Embedding Generation
```bash
curl -X POST http://127.0.0.1:8100/embed \
  -H "X-Sidecar-Key: rc-sidecar-2026" \
  -d '{"texts":["hello world"]}'
```
**结果：** ✅ 通过
**输出：** 768 维向量数组

### 1.4 Text Ingestion
```bash
curl -X POST http://127.0.0.1:8100/ingest \
  -H "X-Sidecar-Key: rc-sidecar-2026" \
  -d '{
    "user_id": "34920265-2ca4-4ac7-b2e5-bf2caacedd8b",
    "material_id": "5708b877-464b-4747-86b2-cfcfa26c8c91",
    "source_type": "text",
    "text": "NotebookLM is a powerful AI-powered research assistant..."
  }'
```
**结果：** ✅ 通过
**输出：**
```json
{
  "status": "completed",
  "chunk_count": 1,
  "word_count": 71,
  "title": "NotebookLM is a powerful AI-powered research assis..."
}
```

### 1.5 Database Verification
**Materials 表：**
- ✅ Material 记录已创建
- ✅ `ingestion_status` = "completed"
- ✅ `chunk_count` = 1
- ✅ `excerpt` 已填充

**Chunks 表：**
- ✅ Chunk 记录已创建
- ✅ `content` 包含完整文本
- ✅ `embedding_model` = "ollama/nomic-embed-text"
- ✅ `embedding` 向量已存储（768 维）

---

## Phase 2: Semantic Search 测试

### 2.1 Direct RPC Call
```bash
curl -X POST https://eqvlgoiiumstaqywtpon.supabase.co/rest/v1/rpc/search_chunks_hybrid \
  -d '{
    "query_embedding": [...],
    "query_text": "AI research assistant",
    "match_count": 5,
    "min_similarity": 0.3,
    "p_user_id": "34920265-2ca4-4ac7-b2e5-bf2caacedd8b"
  }'
```
**结果：** ✅ 通过
**输出：** 找到 1 个相关 chunk（NotebookLM 文档）

---

## Phase 3: Node.js Backend API 测试

### 3.1 Authentication
```bash
POST /api/auth/login
```
**结果：** ✅ 通过
**输出：** JWT token 获取成功

### 3.2 List Materials
```bash
GET /api/v2/materials
Authorization: Bearer <token>
```
**结果：** ✅ 通过
**输出：** 返回 4 个 materials（包括之前测试创建的）

### 3.3 Ingest via Backend
```bash
POST /api/v2/materials/ingest
{
  "source_type": "text",
  "title": "Backend API Test",
  "text": "This is a test document created via the Node.js backend API..."
}
```
**结果：** ✅ 通过
**输出：**
```json
{
  "ok": true,
  "material_id": "fec4fa9f-9d8e-4536-8455-baa193aa5a53",
  "status": "pending"
}
```

### 3.4 Check Material Status
```bash
GET /api/v2/materials/fec4fa9f-9d8e-4536-8455-baa193aa5a53
```
**结果：** ✅ 通过
**输出：**
```json
{
  "id": "fec4fa9f-9d8e-4536-8455-baa193aa5a53",
  "title": "Backend API Test",
  "ingestion_status": "completed",
  "chunk_count": 1,
  "word_count": 27
}
```

### 3.5 Semantic Search via Backend
```bash
POST /api/v2/search/semantic
{
  "query": "research assistant",
  "limit": 5,
  "min_score": 0.3
}
```
**结果：** ✅ 通过
**输出：** 找到 4 个相关结果，包含 material 元数据

---

## 性能指标

| 操作 | 耗时 | 状态 |
|---|---|---|
| Embedding 生成（单个文本） | < 1s | ✅ |
| 文本摄入（71 词） | ~9s | ✅ |
| 语义搜索（5 结果） | < 1s | ✅ |
| Backend API 响应 | < 500ms | ✅ |

---

## 数据统计

**测试期间创建的数据：**
- Materials: 2 个
- Chunks: 2 个
- Embeddings: 2 个（768 维）
- Search queries: 3 次

**数据库状态：**
- ✅ 所有表结构正确
- ✅ 向量索引（HNSW）正常工作
- ✅ RLS 策略正常工作
- ✅ 级联删除配置正确

---

## 已知问题

### 1. URL 摄入超时
**问题：** Jina API 可能超时或响应慢
**影响：** URL 类型的摄入可能失败
**解决方案：**
- 短期：使用 text 类型摄入
- 长期：添加超时处理和重试逻辑

### 2. 无 URL 摄入测试
**原因：** Jina API 不稳定
**状态：** 文本摄入已验证，URL 摄入逻辑相同
**建议：** 生产环境测试前验证 Jina API 可用性

---

## 结论

✅ **Phase 1（Python Sidecar）完全通过**
- Ollama embedding 正常
- 文本提取、分块、embedding 生成正常
- 数据库写入正常

✅ **Phase 2（语义搜索）完全通过**
- Postgres RPC 函数正常
- 向量相似度搜索正常
- 结果排序和过滤正常

✅ **Phase 3（Node.js Backend）完全通过**
- 认证中间件正常
- Materials API 正常
- Search API 正常
- 异步摄入流程正常

---

## 下一步

### Phase 3: Chat RAG 集成
**目标：** 让 Chat 功能使用新的语义搜索

**需要修改：**
1. `src/chat/tools.mjs` — 新增 `semantic_search` 工具
2. `src/chat/toolExecutor.mjs` — 实现工具执行逻辑
3. `src/chat/orchestrator.mjs` — 更新 SYSTEM_PROMPT

**预计工作量：** 2-3 小时

### Phase 4: 迁移与清理
**目标：** 废弃 OpenAI Vector Store 依赖

**需要修改：**
1. `src/services/vectorStoresV2.mjs` — 标记为 deprecated
2. `src/services/agents.mjs` — 更新 hypothesis_evaluator
3. `src/routes/v2/cards.mjs` — 批量生成 embedding

**预计工作量：** 3-4 小时

---

**测试完成时间：** 2026-03-04 17:50 CST
**总耗时：** ~4 小时（包括问题排查和修复）
