# NotebookLM 系统 — 快速参考

## 🚀 快速启动

```bash
# 方式 1: 使用启动脚本
chmod +x start-system.sh
./start-system.sh

# 方式 2: 手动启动
# Terminal 1: Ollama
ollama serve

# Terminal 2: Python Sidecar
cd ingestion-sidecar
python run.py

# Terminal 3: Node.js Backend
cd reading-cards-backend
npm start
```

## 📡 服务端点

| 服务 | 地址 | 用途 |
|---|---|---|
| Ollama | http://127.0.0.1:11434 | Embedding 生成 |
| Sidecar | http://127.0.0.1:8100 | 内容摄入管道 |
| Backend | http://localhost:3000 | REST API |

## 🔑 API 端点

### Sidecar (Python)

```bash
# Health check
GET http://127.0.0.1:8100/health

# Generate embeddings
POST http://127.0.0.1:8100/embed
Headers: X-Sidecar-Key: rc-sidecar-2026
Body: {"texts": ["your text"]}

# Ingest content
POST http://127.0.0.1:8100/ingest
Headers: X-Sidecar-Key: rc-sidecar-2026
Body: {
  "user_id": "UUID",
  "material_id": "UUID",
  "source_type": "text|url|file",
  "text": "...",
  "url": "...",
  "file_path": "..."
}
```

### Backend (Node.js)

```bash
# Login
POST http://localhost:3000/api/auth/login
Body: {"email": "...", "password": "..."}
Response: {"session": {"access_token": "..."}}

# Ingest content
POST http://localhost:3000/api/v2/materials/ingest
Headers: Authorization: Bearer <token>
Body: {
  "source_type": "text",
  "title": "My Document",
  "text": "..."
}

# List materials
GET http://localhost:3000/api/v2/materials
Headers: Authorization: Bearer <token>
Query: ?limit=50&offset=0&status=completed

# Get material
GET http://localhost:3000/api/v2/materials/:id
Headers: Authorization: Bearer <token>

# Semantic search
POST http://localhost:3000/api/v2/search/semantic
Headers: Authorization: Bearer <token>
Body: {
  "query": "your search query",
  "limit": 10,
  "min_score": 0.3
}

# Delete material
DELETE http://localhost:3000/api/v2/materials/:id
Headers: Authorization: Bearer <token>
```

## 🧪 测试用户

```
Email: test@example.com
Password: testpassword123
User ID: 34920265-2ca4-4ac7-b2e5-bf2caacedd8b
```

## 🔧 配置文件

### ingestion-sidecar/.env
```bash
SUPABASE_URL=https://eqvlgoiiumstaqywtpon.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
EMBEDDINGS_BASE_URL=http://127.0.0.1:11434/v1
EMBEDDINGS_MODEL=nomic-embed-text
EMBEDDINGS_DIMENSIONS=768
SIDECAR_API_KEY=rc-sidecar-2026
HOST=127.0.0.1
PORT=8100
```

### reading-cards-backend/.env
```bash
SUPABASE_URL=https://eqvlgoiiumstaqywtpon.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
SIDECAR_URL=http://127.0.0.1:8100
SIDECAR_API_KEY=rc-sidecar-2026
PORT=3000
```

## 📊 数据库表

### materials
```sql
id UUID PRIMARY KEY
user_id UUID NOT NULL
title TEXT NOT NULL
source_type TEXT (url|file|text)
url TEXT
file_path TEXT
excerpt TEXT
full_text TEXT
content_hash TEXT
chunk_count INTEGER
ingestion_status TEXT (pending|processing|completed|failed)
embedding_model TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

### chunks
```sql
id UUID PRIMARY KEY
user_id UUID NOT NULL
material_id UUID NOT NULL
content TEXT NOT NULL
chunk_index INTEGER NOT NULL
embedding vector(768)
embedding_model TEXT DEFAULT 'nomic-embed-text'
locator JSONB
quote TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

## 🔍 常用查询

```sql
-- 查看所有 materials
SELECT id, title, source_type, ingestion_status, chunk_count
FROM materials
WHERE user_id = 'USER_UUID'
ORDER BY created_at DESC;

-- 查看 material 的 chunks
SELECT id, chunk_index, content, embedding_model
FROM chunks
WHERE material_id = 'MATERIAL_UUID'
ORDER BY chunk_index;

-- 语义搜索
SELECT * FROM search_chunks_hybrid(
  query_embedding := ARRAY[...],
  query_text := 'search query',
  match_count := 10,
  min_similarity := 0.3,
  p_user_id := 'USER_UUID'
);
```

## 🐛 故障排查

### Sidecar 无法启动
```bash
# 检查 Python 版本
python --version  # 需要 3.10+

# 检查依赖
pip install -r requirements.txt

# 检查日志
tail -f ingestion-sidecar/sidecar.log
```

### Ollama 连接失败
```bash
# 检查 Ollama 是否运行
curl http://127.0.0.1:11434/api/tags

# 启动 Ollama
ollama serve

# 拉取模型
ollama pull nomic-embed-text
```

### Backend 认证失败
```bash
# 检查 JWT token
echo $TOKEN | cut -d'.' -f2 | base64 -d

# 重新登录
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpassword123"}'
```

### 数据库连接失败
```bash
# 检查 Supabase 配置
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY

# 测试连接
curl -s "$SUPABASE_URL/rest/v1/" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
```

## 📚 相关文档

- `COMPLETION_SUMMARY.md` — 完成总结
- `IMPLEMENTATION_REPORT.md` — 实施报告
- `TEST_REPORT.md` — 测试报告
- `ingestion-sidecar/TESTING.md` — 测试指南

## 🔗 有用链接

- Supabase Dashboard: https://supabase.com/dashboard/project/eqvlgoiiumstaqywtpon
- Ollama Docs: https://ollama.ai/docs
- pgvector Docs: https://github.com/pgvector/pgvector
