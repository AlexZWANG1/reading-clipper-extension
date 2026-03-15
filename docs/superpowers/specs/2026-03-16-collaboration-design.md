# Verity 协作功能设计（进行中）

> 状态：脑爆阶段，数据模型部分已确认，后续部分待设计
> 日期：2026-03-16

---

## 1. 核心设计决策（已确认）

### 1.1 协作模型
- **共享空间 + 各自的 AI**：Topic 是共享的（Board、卡片、材料都共享），每个人有独立的 AI 对话
- 每个人的 AI 帮自己提出 board draft，各自审批，最终落到同一个 Board
- 对话记录私有，研究产物（卡片、Board、材料）共享

### 1.2 权限模型：三级
- **Owner** — 全部权限（增删改、邀请人、管理权限、删除 Topic）
- **Editor** — 可增改卡片和 Board 节点，可 approve 自己的 draft
- **Viewer** — 只读，可以看但不能改

### 1.3 邀请方式：双通道
- **邀请链接** — Owner 生成链接，设置角色（Editor/Viewer）+ 过期时间
- **邮箱邀请** — Owner 输入对方邮箱，对方收到通知后接受加入

### 1.4 数据可见性
- **研究产物共享，对话私有** — 卡片/Board/材料是共享的，每个人和自己 AI 的聊天记录只有自己能看到

### 1.5 Draft 冲突处理：先到先得 + 通知
- 谁先 approve 谁的 draft 先落地
- 后续 approve 时如果相关节点已变更，提示用户让 AI 重新评估

### 1.6 活动感知：AI 摘要通知
- 底层有 activity log 记录所有原始变更事件
- 用户侧不展示原始事件流，而是由各自的 AI 在会话开始时生成变更摘要
- AI 摘要聚焦于**变更对研究进程的影响**，而非罗列事件
- 示例："上次之后，H1 的证据格局变了——队友新增了两条反对证据，支持/反对比从 4:1 变成 4:3，你可能要重新评估。Q3 还是空的，没人动过。"

### 1.7 实现方案：Topic 共享 + 个人视图层（方案三）
- Topic 级共享：在现有 Topic 上加共享层，不新增 Workspace 抽象
- 个人视图层：每个用户在共享 Board 上有私人标注（书签、笔记、待办、优先级）
- AI 感知两层：团队共享层 + 个人关注层，生成更精准的研究建议
- 个人 Topic 就是只有一条 owner 记录的 Topic，概念统一

---

## 2. 数据模型（已确认）

### 2.1 新增表

#### `topic_members` — 共享关系
```sql
CREATE TABLE topic_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  invited_by UUID REFERENCES auth.users(id),
  invite_method TEXT CHECK (invite_method IN ('link', 'email')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(topic_id, user_id)
);
```
- Owner 创建 Topic 时自动插入一条 owner 记录
- 个人 Topic = 只有一条 owner 记录的 Topic

#### `topic_invites` — 邀请
```sql
CREATE TABLE topic_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  invite_type TEXT NOT NULL CHECK (invite_type IN ('link', 'email')),
  email TEXT,  -- nullable, only for email invites
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### `topic_activity_log` — 活动记录
```sql
CREATE TABLE topic_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  -- 枚举: card_created, card_updated, card_deleted,
  --       node_added, node_removed, node_updated,
  --       edge_added, edge_removed,
  --       draft_approved, draft_rejected,
  --       material_added, document_updated, member_joined, ...
  entity_type TEXT,  -- 'card', 'board_node', 'board_edge', 'material', etc.
  entity_id UUID,
  summary_text TEXT,  -- 简短人类可读描述
  metadata JSONB DEFAULT '{}',  -- 额外结构化信息（如变更前后值）
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### `user_board_annotations` — 个人视图层
```sql
CREATE TABLE user_board_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES thinking_boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id UUID REFERENCES board_nodes(id) ON DELETE CASCADE,  -- nullable, can annotate board-level
  type TEXT NOT NULL CHECK (type IN ('bookmark', 'note', 'priority', 'todo')),
  content TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 2.2 现有表改动

- `cards`, `board_nodes`, `board_edges`, `board_drafts`, `documents`, `materials`：
  - 新增 `created_by UUID REFERENCES auth.users(id)` 字段
  - 新增 `updated_by UUID REFERENCES auth.users(id)` 字段
  - 原来 `user_id` 隐式等于操作者，共享后需要显式区分"谁创建/修改的"
- `board_drafts`：已有 draft 机制天然适配，通过 `created_by` 区分不同用户的 AI 提出的 draft
- `conversations` + `chat_messages`：不动，保持 per-user 私有

---

## 3. 待设计部分（下次继续）

以下部分还没有展开讨论：

### 3.1 RLS 策略改造
- 现有 RLS 从 `user_id = auth.uid()` 改为基于 `topic_members` 的权限检查
- Editor/Viewer 的细粒度权限控制
- 个人视图层的 RLS（只看自己的标注）

### 3.2 后端 API 改动
- 邀请 API（创建邀请链接、邮箱邀请、接受邀请）
- 成员管理 API（列出成员、修改角色、移除成员）
- Activity log 写入（在现有 service 层的写操作中追加日志）
- AI 摘要生成接口（基于 activity log + 用户上次访问时间）

### 3.3 Orchestrator / Prompt 改造
- AI 需要感知"这是共享 Topic"以及团队成员信息
- 会话开始时查询 activity log，生成变更摘要
- Draft 冲突检测逻辑（approve 时检查节点版本）
- 个人视图层数据注入 AI 上下文

### 3.4 前端改动
- Topic 详情页增加"成员"面板
- 邀请流程 UI
- Board 上显示 `created_by` 信息（谁加的节点）
- 个人标注 UI（书签、笔记、待办）
- AI 摘要展示（进入 Topic 时的变更播报）

### 3.5 迁移策略
- 现有用户的 Topic 需要自动生成 `topic_members` owner 记录
- 现有数据的 `created_by` / `updated_by` 回填

---

## 4. 设计原则回顾

- **AI Native**：协作感知通过 AI 摘要传递，不是传统通知流
- **先到先得**：draft 冲突不阻塞，落地后通知后来者
- **个人 + 共享双层**：共享层是团队共识，个人层是自己的思考空间
- **渐进式**：个人 Topic 和共享 Topic 是同一概念的不同状态，不引入新实体
- **对话私有**：每个人和 AI 的对话是私密的研究过程，只有产出（卡片、Board 变更）是共享的
