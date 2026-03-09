# Verity 转型完成总结

## 项目概述

成功将 **Reading Clipper** 转型为 **Verity（求真）** —— 证据驱动论证工作台。

**核心理念**：人工主导、AI 运行的研究工作台，让研究过程可追溯、可验证、可协作。

---

## 已完成功能

### ✅ Step 0: 品牌重塑
- **产品名称**：Verity（求真）
- **Logo**：天平图标（Scale）
- **Slogan**：证据驱动论证工作台
- **导航结构**：四组导航
  - Reader（阅读器）：来源库、信息源
  - Workbench（工作台）：首页，核心工作区
  - Copilot（协作助手）：AI 对话
  - Settings：AI 设置、导出

### ✅ Step 1: 数据库演化
**Migration 015: topics_research_fields.sql**
- 新增字段：
  - `status`：研究状态（active/investigating/resolved/archived）
  - `research_context`：研究背景说明
  - `priority`：优先级（critical/normal/low）
- 索引优化：status, priority
- 向后兼容：所有字段有默认值，不影响现有数据

**Backend 增强：**
- `topics.mjs` (service)：支持新字段的 CRUD
- `topics.mjs` (route)：支持按 status 过滤

### ✅ Step 2: Workbench 三栏布局
**核心改造：CardsPage → Workbench**

**布局结构：**
```
┌──────────────┬─────────────────────────────────┐
│  左栏 280px   │  主区域 flex-1                   │
│              │                                 │
│  Topics      │  Tab: 证据卡 | 论证板 | 研究备忘  │
│  Sidebar     │                                 │
│              │  证据卡 Tab：                     │
│  + 新建      │    - 卡片列表                    │
│  状态标签     │    - 搜索过滤                    │
│  卡片数量     │    - 假说建议                    │
│              │                                 │
│              │  论证板 Tab：                     │
│              │    - 跳转到 ThinkingBoardPage    │
│              │                                 │
│              │  研究备忘 Tab：                   │
│              │    - 文本编辑器                   │
│              │    - 保存按钮                    │
└──────────────┴─────────────────────────────────┘
```

**功能特性：**
- Tab 仅在选中 Topic 时显示
- 未选中 Topic 时显示"全部卡片"
- 论证板通过路由跳转复用现有 ThinkingBoardPage
- 研究备忘提供简单文本编辑（MVP 版本）

### ✅ Step 3: Reader 证据提取增强
**MaterialReaderPage 改造：**
- 建卡弹窗添加"归属研究议题"下拉选择器
- 用户可选择将证据卡关联到特定 Topic
- 默认使用来源的 topic_id（如有）
- 支持添加备注

**核心价值：**
形成完整闭环：**Source → Card → Topic → Workbench**

---

## 核心用户流程

### 流程 1：创建研究议题
1. 在 Workbench 左侧 TopicsSidebar 点击 "+"
2. 输入议题名称（例如"中国新能源汽车出口前景"）
3. 按 Enter 确认创建

### 流程 2：导入来源
1. 导航到"来源库"（/materials）
2. 点击"添加来源"
3. 输入 URL 或上传 PDF
4. 等待内容抓取和 embedding 完成

### 流程 3：阅读并提取证据
1. 在来源库点击进入 Reader
2. 阅读文章，选中关键段落
3. 点击浮出的"建卡"按钮
4. 在弹窗中选择归属的研究议题
5. 可选添加备注
6. 点击"保存卡片"

### 流程 4：在 Workbench 组织研究
1. 回到首页 Workbench
2. 左侧选中研究议题
3. **证据卡 Tab**：查看所有证据卡
4. **论证板 Tab**：构建 Q/H/E 论证结构
5. **研究备忘 Tab**：撰写研究思路和结论

---

## 技术架构

### 前端 (React + Zustand)
- **核心页面**：
  - CardsPage（Workbench）：三 Tab 布局
  - MaterialReaderPage：证据提取
  - ThinkingBoardPage：论证板（ReactFlow）
  - TopicsPage：议题管理（保留）

- **核心组件**：
  - TopicsSidebar：议题列表 + 创建
  - SelectionPopover：文本选择工具条
  - Layout：四组导航

### 后端 (Node.js + Express)
- **核心路由**：
  - `/api/v2/topics`：议题 CRUD + 状态过滤
  - `/api/v2/cards/capture`：证据卡创建
  - `/api/v2/materials`：来源管理
  - `/api/v2/search/semantic`：语义搜索

### 数据库 (Supabase + pgvector)
- **核心表**：
  - `topics`：研究议题（新增 status/priority/research_context）
  - `cards`：证据卡（关联 topic_id）
  - `materials`：来源（URL/PDF/text）
  - `chunks`：文档块 + 768 维 embedding
  - `thinking_boards`：论证板
  - `board_nodes`：Q/H/E 节点
  - `documents`：研究备忘

---

## 文件变更清单

### 新建文件（6 个）
1. `reading-cards-backend/supabase/migrations/015_topics_research_fields.sql`
2. `VERITY-TESTING.md`
3. `VERITY-SUMMARY.md`
4. `VERITY-COMPLETE.md`
5. `QUICK-REFERENCE.md`
6. `test-verity.bat` / `test-verity.sh`

### 修改文件（10 个）
1. `web-app/index.html` - 标题
2. `web-app/src/components/Layout.jsx` - Logo + 四组导航
3. `web-app/src/App.jsx` - 路由调整
4. `reading-cards-backend/src/server.mjs` - 品牌文本
5. `reading-cards-backend/src/services/supabase/topics.mjs` - 新字段支持
6. `reading-cards-backend/src/routes/v2/topics.mjs` - 状态过滤
7. `web-app/src/pages/CardsPage.jsx` - Tab 切换 + 研究备忘持久化 ✅
8. `web-app/src/pages/MaterialReaderPage.jsx` - Topic 选择器
9. `web-app/src/components/TopicsSidebar.jsx` - 状态显示 + 编辑/删除 ✅
10. `.claude/memory/verity-transformation.md` - 项目记忆更新

---

## 测试验证

### 快速测试
```bash
# Windows
test-verity.bat

# Linux/Mac
bash test-verity.sh
```

### 完整测试清单
详见 `VERITY-TESTING.md`，包含：
- 10 个功能测试用例
- 端到端闭环验证
- 性能和稳定性测试
- 回归测试

---

## 已知限制

### ~~1. 研究备忘未持久化~~ ✅ 已完成
- ~~**现状**：memo 内容仅在前端状态，刷新后丢失~~
- **已实现**：连接 documents API，实现自动加载和保存
- **完成日期**：2026-03-07

### ~~2. Topic 状态未在 UI 显示~~ ✅ 已完成
- ~~**现状**：status/priority 字段已存储，但 UI 未展示~~
- **已实现**：在 TopicsSidebar 显示状态标签和优先级标签
- **完成日期**：2026-03-07

### ~~3. TopicsSidebar 仅支持创建~~ ✅ 已完成
- ~~**现状**：不支持编辑和删除~~
- **已实现**：添加操作菜单（编辑/删除），支持内联编辑
- **完成日期**：2026-03-07

### 4. 论证板未真正嵌入
- **现状**：通过路由跳转，非嵌入式
- **解决方案**：提取 ArgumentBoard 组件（工作量大）
- **优先级**：P3（可选）

---

## 下一步计划

### Phase 1.1 - 完善核心功能（1-2 周）
1. **研究备忘持久化**
   - 连接 documents API
   - 实现自动保存和加载
   - 支持富文本编辑

2. **Topic 状态可视化**
   - 在 TopicsSidebar 显示状态标签
   - 支持快速切换状态
   - 按状态过滤和排序

3. **TopicsSidebar 增强**
   - 添加编辑功能（双击或右键）
   - 添加删除功能（带确认）
   - 支持拖拽排序

### Phase 1.2 - 用户体验优化（1 周）
1. **空状态优化**
   - 首次使用引导
   - 空 Topic 的引导提示
   - 空来源库的引导

2. **快捷操作**
   - 键盘快捷键（Ctrl+N 新建 Topic）
   - 批量操作（批量删除卡片）
   - 快速搜索（全局搜索）

### Phase 2 - 协作功能（2-3 周）
1. **Workspace 机制**
2. **共享议题和证据**
3. **评论和提及**
4. **活动流和通知**

### Phase 3 - AI Agent 化（3-4 周）
1. **来源侦察员**：自动发现相关来源
2. **证据提炼员**：自动提取关键证据
3. **核验员**：验证证据可靠性
4. **反方审查员**：寻找反证和漏洞

---

## 成功指标

### 产品层面
- ✅ 品牌转型完成（Verity）
- ✅ 核心用户流程打通（Source → Card → Topic → Workbench）
- ✅ 四个一级入口清晰（Reader | Workbench | Copilot | Settings）

### 技术层面
- ✅ 数据库演化完成（topics 表增强）
- ✅ 前后端 API 对齐
- ✅ 零破坏性改动（向后兼容）

### 用户价值
- ✅ 证据提取流程优化（可选择归属议题）
- ✅ 研究工作台初步成型（三 Tab 布局）
- ✅ Topic 作为核心容器（承载 Cards/Board/Memo）

---

## 致谢

本次转型遵循"最大复用、最小改动"原则，在不破坏现有功能的前提下，成功实现了产品定位升级和核心体验优化。

**核心理念**：
- Topic 是核心容器（不替换为 Question）
- Question 是 Topic 内部概念（ThinkBoard 中的节点）
- Source → Card → Topic 最小闭环
- ThinkBoard + Memo 双视图（并列）

**开发原则**：
- 控制开发量，避免过度重构
- 最大程度复用现有代码和表结构
- 每一步都保持系统可用
- 渐进式增强，而非推倒重来

---

## 联系方式

如有问题或建议，请查看：
- 测试清单：`VERITY-TESTING.md`
- 快速测试：`test-verity.bat`
- 项目记忆：`.claude/memory/verity-transformation.md`

**Verity（求真）—— 让研究过程可追溯、可验证、可协作。**
