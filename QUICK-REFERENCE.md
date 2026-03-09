# Verity 快速参考

## 启动系统

```bash
# 1. 启动后端
cd reading-cards-backend
npm start
# 运行在 http://localhost:3000

# 2. 启动前端
cd web-app
npm run dev
# 运行在 http://localhost:5173

# 3. (可选) 启动 Ingestion Sidecar
cd ingestion-sidecar
python run.py
# 运行在 http://localhost:8100
```

## 数据库迁移

在 Supabase Dashboard 执行：
```sql
-- 文件位置: reading-cards-backend/supabase/migrations/015_topics_research_fields.sql
```

## 快速测试

```bash
# Windows
test-verity.bat

# Linux/Mac
bash test-verity.sh
```

## 核心功能

### 1. 创建研究议题
- 位置：Workbench 左侧 TopicsSidebar
- 操作：点击 "+" → 输入名称 → Enter

### 2. 导入来源
- 位置：导航 → Reader → 来源库
- 操作：添加来源 → 输入 URL 或上传文件

### 3. 提取证据
- 位置：Reader 阅读视图
- 操作：选中文本 → 建卡 → 选择 Topic → 保存

### 4. 组织研究
- 位置：Workbench (首页)
- 操作：
  - 左侧选中 Topic
  - 证据卡 Tab：查看所有证据
  - 论证板 Tab：构建论证结构
  - 研究备忘 Tab：撰写研究记录

## 文档

- **完整总结**：VERITY-SUMMARY.md
- **测试清单**：VERITY-TESTING.md
- **转型计划**：.claude/memory/verity-transformation.md

## 技术栈

- **前端**：React 18 + Zustand + Tailwind CSS + ReactFlow
- **后端**：Node.js + Express + Supabase
- **数据库**：PostgreSQL + pgvector
- **AI**：OpenAI Responses API (gpt-5.2) + Ollama (nomic-embed-text)

## 核心 API

```javascript
// Topics
GET    /api/v2/topics?status=active&with_count=true
POST   /api/v2/topics
PATCH  /api/v2/topics/:id

// Cards
POST   /api/v2/cards/capture
GET    /api/v2/cards?topic_id=xxx

// Materials
POST   /api/v2/materials/ingest
GET    /api/v2/materials/:id

// Search
POST   /api/v2/search/semantic
```

## 常见问题

### Q: 如何执行数据库迁移？
A: 在 Supabase Dashboard → SQL Editor 中执行 `migrations/015_topics_research_fields.sql`

### Q: 研究备忘内容刷新后丢失？
A: 当前版本未持久化，需要连接 documents API（P1 优先级）

### Q: 如何编辑或删除 Topic？
A: 当前仅支持创建，编辑/删除功能在 P2 计划中

### Q: 论证板如何嵌入 Workbench？
A: 当前通过路由跳转，真正嵌入需要提取组件（P2 计划）

## 联系和反馈

- GitHub Issues: (项目仓库地址)
- 文档问题：查看 VERITY-TESTING.md
- 功能建议：查看 VERITY-SUMMARY.md 的"下一步计划"
