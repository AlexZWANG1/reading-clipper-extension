# Verity 转型 - 完整测试验证

## 测试环境准备

### 1. 启动服务
```bash
# Terminal 1: 启动后端
cd reading-cards-backend
npm start

# Terminal 2: 启动前端
cd web-app
npm run dev

# Terminal 3: 启动 Ingestion Sidecar（如需测试材料摄入）
cd ingestion-sidecar
python run.py
```

### 2. 数据库迁移
在 Supabase Dashboard 或使用 SQL 编辑器执行：
```sql
-- 执行 migrations/015_topics_research_fields.sql
```

---

## 测试清单

### ✅ Test 1: 品牌和导航
**步骤：**
1. 访问 http://localhost:5173
2. 登录系统

**验证点：**
- [ ] 浏览器标签页显示 "Verity - 证据驱动论证工作台"
- [ ] 左侧边栏 Logo 显示天平图标 + "Verity"
- [ ] 导航分为四组：
  - Reader: 来源库、信息源
  - Workbench: 工作台
  - Copilot: AI 对话
  - Settings: AI 设置、导出
- [ ] 首页 (/) 显示工作台（CardsPage）

---

### ✅ Test 2: Topics 新字段
**步骤：**
1. 使用 API 创建带新字段的 Topic
```bash
curl -X POST http://localhost:3000/api/v2/topics \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "中国新能源汽车出口前景",
    "description": "研究中国新能源汽车的出口趋势和挑战",
    "status": "investigating",
    "priority": "critical",
    "research_context": "为了评估中国汽车产业的国际竞争力"
  }'
```

2. 查询 Topics
```bash
curl http://localhost:3000/api/v2/topics?with_count=true \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**验证点：**
- [ ] Topic 创建成功
- [ ] 返回的 Topic 包含 status, priority, research_context 字段
- [ ] 可以按 status 过滤：`?status=investigating`

---

### ✅ Test 3: Workbench Tab 切换
**步骤：**
1. 在首页工作台，左侧 TopicsSidebar 点击 "+" 创建新 Topic
2. 输入 Topic 名称，点击创建
3. 在左侧点击选中刚创建的 Topic

**验证点：**
- [ ] 主区域顶部出现三个 Tab：证据卡 | 论证板 | 研究备忘
- [ ] 默认显示"证据卡" Tab（高亮）
- [ ] 点击"论证板" Tab，跳转到 `/topics/:topicId`（ThinkingBoardPage）
- [ ] 点击"研究备忘" Tab，显示文本编辑器
- [ ] 研究备忘区域显示 Topic 标题和描述
- [ ] 可以在文本框中输入内容

---

### ✅ Test 4: Reader 证据提取（核心流程）
**步骤：**
1. 导航到"来源库"（/materials）
2. 点击"添加来源"，输入一个 URL（例如新闻文章）
3. 等待内容抓取完成
4. 点击进入 Reader 阅读视图
5. 选中一段文本（例如关键数据或结论）
6. 点击浮出的"建卡"按钮

**验证点：**
- [ ] 弹出"创建证据卡"弹窗
- [ ] 显示选中的文本片段（黄色背景）
- [ ] 显示"归属研究议题"下拉选择器
- [ ] 下拉列表包含所有已创建的 Topics
- [ ] 选择一个 Topic（例如"中国新能源汽车出口前景"）
- [ ] 可选填写备注
- [ ] 点击"保存卡片"

**验证点（创建后）：**
- [ ] 卡片创建成功提示
- [ ] Reader 右侧边栏显示新创建的卡片
- [ ] 卡片显示归属的 Topic 名称
- [ ] 点击 Topic 名称可跳转到 Workbench

---

### ✅ Test 5: 端到端闭环验证
**完整流程：Source → Card → Topic → Workbench**

1. **创建研究议题**
   - 在 Workbench 左侧点击 "+" 创建 Topic "电动汽车电池技术"

2. **导入来源**
   - 在来源库导入 2-3 篇相关文章

3. **提取证据**
   - 在 Reader 中阅读第一篇文章
   - 高亮 3-5 段关键内容
   - 每次建卡时选择 Topic "电动汽车电池技术"
   - 添加简短备注

4. **在 Workbench 查看**
   - 回到首页 Workbench
   - 左侧选中 Topic "电动汽车电池技术"
   - 验证：
     - [ ] 证据卡 Tab 显示刚创建的 3-5 张卡片
     - [ ] 每张卡片显示摘要、关键点、来源链接
     - [ ] 点击卡片可展开查看详情

5. **使用论证板**
   - 点击"论证板" Tab
   - 验证：
     - [ ] 跳转到 ThinkingBoardPage
     - [ ] 可以创建 Question 节点
     - [ ] 可以创建 Hypothesis 节点
     - [ ] 可以从证据卡拖入 Evidence 节点

6. **撰写研究备忘**
   - 回到 Workbench，点击"研究备忘" Tab
   - 在文本框中输入研究思路
   - 点击"保存备忘"
   - 验证：
     - [ ] 保存成功提示
     - [ ] 刷新页面后内容保留（如已实现持久化）

---

### ✅ Test 6: TopicsSidebar 功能
**步骤：**
1. 在 Workbench 左侧 TopicsSidebar

**验证点：**
- [ ] 显示所有 Topics 列表
- [ ] 每个 Topic 显示彩色圆点和卡片数量
- [ ] 点击 "+" 可创建新 Topic
- [ ] 创建 Topic 时可输入名称，按 Enter 确认，按 Esc 取消
- [ ] 点击 Topic 可选中，主区域显示该 Topic 的内容
- [ ] 选中的 Topic 高亮显示

---

### ✅ Test 7: 导航和路由
**步骤：**
测试所有导航链接

**验证点：**
- [ ] 点击"来源库" → 跳转到 /materials
- [ ] 点击"信息源" → 跳转到 /sources
- [ ] 点击"工作台" → 跳转到 / (首页)
- [ ] 点击"AI 对话" → 跳转到 /chat
- [ ] 点击"AI 设置" → 跳转到 /ai-settings
- [ ] 点击"导出" → 跳转到 /download
- [ ] 所有路由正常工作，无 404 错误

---

## 性能和稳定性测试

### Test 8: 大量数据测试
**步骤：**
1. 创建 10+ Topics
2. 每个 Topic 导入 5+ 篇来源
3. 每篇来源提取 10+ 张证据卡

**验证点：**
- [ ] TopicsSidebar 滚动流畅
- [ ] 证据卡列表加载正常
- [ ] 搜索和过滤功能正常
- [ ] 无明显性能问题

### Test 9: 边界情况
**验证点：**
- [ ] 未选中 Topic 时，不显示 Tab 栏
- [ ] 未选中 Topic 时，显示"全部卡片"
- [ ] 空 Topic（无卡片）显示正确的空状态
- [ ] 删除 Topic 后，相关卡片处理正确
- [ ] 网络错误时显示友好提示

---

## 回归测试

### Test 10: 原有功能不受影响
**验证点：**
- [ ] 卡片 CRUD（创建、编辑、删除）正常
- [ ] 卡片搜索功能正常
- [ ] 卡片按 Topic 过滤正常
- [ ] ThinkingBoardPage 独立访问正常（/topics/:id）
- [ ] 假说建议和评估功能正常
- [ ] AI 对话功能正常
- [ ] 材料摄入和 embedding 正常

---

## 已知问题和限制

1. **研究备忘持久化**：当前 memo 内容未持久化到数据库，刷新后丢失
   - 需要连接到 documents API 实现保存

2. **TopicsSidebar 编辑/删除**：仅支持创建，不支持编辑和删除
   - 可在后续版本添加右键菜单或操作按钮

3. **论证板嵌入**：论证板通过跳转实现，未真正嵌入 Workbench
   - 完整嵌入需要提取 ArgumentBoard 组件（工作量较大）

4. **状态字段未在 UI 显示**：topics 的 status, priority 字段已存储，但 UI 未显示
   - 可在 TopicsSidebar 添加状态标签

---

## 测试通过标准

- [ ] 所有 Test 1-7 的验证点通过
- [ ] 端到端闭环流程顺畅
- [ ] 无阻塞性 bug
- [ ] 核心用户价值实现：Source → Card → Topic → Workbench

---

## 下一步优化建议

1. **P1 - 研究备忘持久化**
   - 连接 documents API
   - 实现自动保存

2. **P1 - Topic 状态显示**
   - 在 TopicsSidebar 显示 status 标签
   - 支持快速切换状态

3. **P2 - TopicsSidebar 增强**
   - 添加编辑功能
   - 添加删除功能（带确认）
   - 添加右键菜单

4. **P2 - ArgumentBoard 真正嵌入**
   - 提取 ArgumentBoard 组件
   - 在 Workbench 中直接渲染

5. **P3 - Copilot 上下文增强**
   - 传递 topic_id 到 chat API
   - 限定搜索范围到当前 Topic
