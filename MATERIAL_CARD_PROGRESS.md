# Material-Card 架构升级 - 实施进度

## Phase 1: Material Library 页面 ✅ 已完成

### 已创建文件
1. `web-app/src/pages/MaterialsPage.jsx` - Material 库主页面
   - 复用 CardsPage 布局模式
   - 左侧 TopicsSidebar 导航
   - Material 列表展示（标题、摘要、元信息、状态）
   - 搜索和筛选功能
   - 删除操作

### 已修改文件
1. `web-app/src/lib/api.js` - 添加 materialsApi
   - `list(params)` - 获取 materials 列表
   - `get(id)` - 获取单个 material
   - `ingest(data)` - 触发摄入
   - `delete(id)` - 删除 material

2. `web-app/src/App.jsx` - 添加路由
   - `/materials` - Material 库页面

3. `web-app/src/components/Layout.jsx` - 添加导航
   - 新增"材料库"菜单项（FileText 图标）

### 功能特性
- ✅ 按 topic 筛选 materials
- ✅ 搜索 materials（标题、摘要）
- ✅ 显示摄入状态（pending/processing/completed/failed）
- ✅ 显示元信息（字数、片段数、创建时间）
- ✅ 点击跳转到 Reader（待实现）
- ✅ 删除 material

---

## 下一步：Phase 2 - Material Reader 视图

### 待创建文件
1. `web-app/src/pages/MaterialReaderPage.jsx` - 阅读器主页面
2. `web-app/src/components/Reader/ReaderContent.jsx` - 原文渲染
3. `web-app/src/components/Reader/HighlightPopover.jsx` - 划线弹窗
4. `web-app/src/components/Reader/CardsSidebar.jsx` - 卡片侧边栏

### 核心功能
- 渲染 material 原文
- 支持文本选择和划线
- 创建卡片（调用 AI）
- 高亮显示已有卡片
- 卡片定位跳转

---

## 测试 Phase 1

### 前置条件
1. 后端服务运行：`cd reading-cards-backend && npm start`
2. Python sidecar 运行：`cd ingestion-sidecar && python run.py`
3. 前端开发服务器：`cd web-app && npm run dev`

### 测试步骤
1. 登录应用
2. 点击左侧"材料库"菜单
3. 查看 materials 列表（如果为空，需要先摄入数据）
4. 测试搜索功能
5. 测试删除功能

### 摄入测试数据
```bash
# 使用 backend API 摄入测试材料
curl -X POST http://localhost:3000/api/v2/materials/ingest \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source_type": "text",
    "title": "测试材料",
    "text": "这是一段测试文本内容..."
  }'
```

---

## 当前状态
- ✅ Phase 1 代码完成
- ⏸️ Phase 2 待开始
- ⏸️ Phase 3-5 待开始

**预计完成时间：** Phase 1 (1 天) → Phase 2 (2-3 天) → Phase 3-5 (3 天)
