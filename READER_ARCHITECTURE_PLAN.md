# Reading Clipper 阅读器架构重构计划 (Rev. 2)

## 背景与核心理念

### 架构调整
**新的设计理念：**
- **MaterialsPage 就是阅读器** - 点击 material 直接在当前页展开全文阅读视图。
- **Material 是一切的源头** - 所有卡片尽可能关联到具体来源 (Material)。
- **阅读器是提炼和记录的地方** - 划线、批注、创建卡片。
- **Cards 页面才是思维加工的开始** - 卡片的组织、关联、编排。

### 用户动线
1. **浏览器插件 - 整页保存**：一键保存整个网页，后端统一抓取切块。
2. **浏览器插件 - 划线创建卡片**：直接在网页划线保存卡片（关联已有 Material 或自动创建 fallback Material）。
3. **网页端阅读器**：在 MaterialsPage 展开全文，直接阅读、划线、高亮、建卡。
4. **带着问题阅读 (Focus Lens)**：设置问题/假设，后端向量检索定位相关 Chunk，在前端自动高亮。

---

## 核心技术决策修改 (Alignment)

根据最新评估，我们对技术方案做了**收敛**与**复用**的调整：

### A. 内容提取 (统一使用后端 Ingestion 管道)
**不使用前端/插件端的 Readability + Playwright**。保持技术栈单一性，沿用现在的 Python Sidecar 管道。
- 提取层由后端的引擎 (如 `jina` 或 `docling`) 负责。
- 前端和插件只负责发送 URL，或直接渲染后端清洗并存入 DB 的 `content_html` / `content_text`。
- 防护机制：如果后端存储的是 HTML，前端使用 **DOMPurify** 渲染防止 XSS。

### B. 高亮锚定 (Chunk 优先的混合策略)
锚定是对**渲染后的内容**进行。由于后端的 chunk_id 极其稳定，我们采用优先级回退策略：
1. **优先级 1 (最稳定)**：`chunk_id` + `chunk_relative_offsets` (与后端切片严格对应)。
2. **优先级 2 (跨版本回退)**：`TextQuoteSelector` (`dom-anchor-text-quote`，基于 exact+prefix+suffix 模糊匹配)。
3. **优先级 3 (临时)**：DOM Range (仅限于当前浏览 Session 的即时反馈)。

### C. 卡片关联 (Nullable Material ID)
`cards.material_id` 保持 **nullable** 设置。
- **阅读器/插件产出的专属卡片**：强关联 Material。
- **自由创建的随记卡片**：自动创建一个占位的空白 Material (`source_type="text"`)，作为载体。
- **AI 对话产出的卡片**：关联到一个 `source_type="chat"` 的 Material。

### D. Focus Lens (复用现有的语义检索基建)
不在前端搞本地 embedding，也不做粗糙的关键词分词。
- **后端已有能力**：我们已经有了 `/api/v2/search/semantic` 和 chunks 的嵌入向量。
- **如何实现**：给这个 API 增加一个 `material_id` 过滤参数。前端设置好 Focus Lens 后查询此 API，利用返回的 `chunk_id` 直达匹配段落并改变渲染样式（被动高亮）。

---

## 实施计划

### Phase 1: MaterialsPage 改造为阅读器（3-4 天）

**目标：** MaterialsPage 从纯列表页变成 List + Reader 复合视图。

**UI 布局：**
```text
┌─────────────────────────────────────────────────────┐
│  TopicsSidebar  │  主视区 (Material List / Reader)      │
│  (可折叠)       │                                   │
│                 │  [列表模式]                        │
│  - Topic 1      │  ┌─────────────────────┐         │
│    - Material A │  │ Material Item       │         │
│    - Material B │  │ (标题、摘要、元信息) │         │
│                 │  └─────────────────────┘         │
│                 │                                   │
│                 │  [阅读模式] (点击进入)             │
│                 │  ┌─────────────────────┬───────┐ │
│                 │  │ Reader Content      │ Cards │ │
│                 │  │ (渲染正文)          │ 侧栏  │ │
│                 │  │ - 支持划线        │ (当前)│ │
│                 │  │ - 渲染的高亮等      │       │ │
│                 │  └─────────────────────┴───────┘ │
└─────────────────────────────────────────────────────┘
```

**任务点：**
1. **状态管理**：选中 Material 后由列表展示切换至全视区 Reader 展示。
2. **安全渲染**：使用 DOMPurify 过滤内容和 dangerouslySetInnerHTML 进行注入。
3. **文本选择**：监听 selection，弹出迷你操作栏（高亮 / 建卡）。
4. **混合锚点实现**：对选中内容提取 Chunk 定位器和 TextQuote 定位器。
5. **已有关联卡片展示**：右侧抽屉拉出当前属于此 Material 的所有卡片记录，点击滚动交互。

### Phase 2: 后端数据结构同步（1-2 天）

**目标：** 适配 Phase 1 UI 所需的 Locator 存储和 Highlights 支持。

1. **Locator 升级**：统一存放至 `cards.locator` (JSONB) 或新的 `highlights` 表。
   ```json
   {
     "chunk_id": "UUID",
     "start_offset": 12,
     "end_offset": 45,
     "quote_selector": { "exact": "...", "prefix": "...", "suffix": "..." }
   }
   ```
2. **Highlights 表创建**：如果卡片和文本高亮分离，则需要创建独立的 `highlights` 业务表。
3. **占位 Material 服务**：建卡时若没传 material_id，通过特定规则自动填充。

### Phase 3: Browser Plugin 改造 (1-2 天)

**目标：** "收集箱"与"剪报"体验增强。
1. **保存整页**：将 URL 直接发给 `/api/v2/materials/ingest`，依托现有的 Jina/Docling 爬虫管线作业。
2. **任意网页划线建卡**：右键选中文本时，先按 URL 判断是否收录：
   - 有 -> 发送卡片绑定该 material_id。
   - 无 -> 顺手触发一次无需深度爬虫的 Material 初始化操作。

### Phase 4: Focus Lens 落地上线 (1-2 天)

**目标：** 基于现有设施达成 "带着问题阅读" 体验。
1. **后端 Search API 添加过滤**：给 `/api/v2/search/semantic` 和底层的 RPC 增加对 `material_id` 的限制。
2. **UI 植入**：阅读器顶栏增加 Focus Lens 输入框 -> 提交 -> 获取高匹配块结果 -> 标记相关的 DOM Blocks。

### Phase 5: AI Chat 作为知识源 (1-2 天)

1. 在自建的聊天界面，点击【保存对话】，生成 Markdown 并写入 Backend 为 `source_type="chat"`。
2. 随后该对话可以像文档一样被查看，并且在其之上建立卡片和高亮。