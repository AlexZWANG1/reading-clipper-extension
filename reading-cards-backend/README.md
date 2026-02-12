# 阅读知识卡片仓库后端

这是一个简单的知识卡片存储和浏览系统，配合 Chrome 扩展使用。

## 快速开始

### 1. 安装依赖

```bash
cd reading-cards-backend
npm install
```

### 2. 配置环境变量（可选）

复制 `.env.example` 为 `.env`，填入你的 OpenAI API Key（如果将来要启用 AI 功能）：

```bash
cp .env.example .env
# 然后编辑 .env 文件
```

### 3. 启动服务

```bash
npm run dev
```

服务会在 `http://localhost:3000` 启动。

### 4. 访问前端页面

打开浏览器访问：`http://localhost:3000`

## API 接口

### POST /api/cards/capture
捕获一个新的知识卡片

请求体示例：
```json
{
  "mode": "agent1a",
  "docName": "AI 监管研究",
  "sectionTitle": "2.1 欧盟 AI 法案",
  "snippet": "选中的文本内容...",
  "preSummary": "可选的一句话总结",
  "sourceName": "FT 报道",
  "sourceUrl": "https://example.com/article"
}
```

### GET /api/cards
获取卡片列表

查询参数：
- `mode` (可选): `agent1a` 或 `agent1b`
- `doc` (可选): 文档名称

示例：`GET /api/cards?mode=agent1a&doc=AI 监管研究`

### PATCH /api/cards/:id
更新卡片的部分字段

请求体示例：
```json
{
  "doc": "新文档名",
  "section": "新小节名"
}
```

### POST /api/cards/:id/suggest-structure
（预留）AI 生成结构建议（当前返回示例数据）

## 测试

使用 curl 测试捕获接口：

```bash
curl -X POST http://localhost:3000/api/cards/capture \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "agent1a",
    "docName": "测试文档",
    "sectionTitle": "1.1 测试小节",
    "snippet": "这是一段测试文本内容",
    "sourceName": "测试来源",
    "sourceUrl": "https://example.com"
  }'
```

## 项目结构

```
reading-cards-backend/
├── src/
│   ├── server.mjs          # 服务器入口
│   ├── routes/
│   │   └── cards.mjs        # 卡片相关路由
│   └── services/
│       ├── cards.mjs        # 卡片存储服务
│       └── agents.mjs       # Agent 处理逻辑
├── public/
│   ├── index.html          # 前端页面
│   ├── styles.css          # 样式文件
│   └── app.js              # 前端逻辑
├── package.json
└── README.md
```




