# Verity 小团队协作功能设计

> 日期: 2026-03-15
> 状态: Draft

## 1. 概述

在现有 Topic 上增加小团队协作能力。核心模型：**共享 Topic + 各自 AI + 个人视图层**。

- 多人共享同一个 Topic 下的 cards、board、materials
- 每人有自己的 AI 对话（私有），各自的 AI 独立提出 board draft
- 每人有个人视图层（书签、笔记、标注），不影响共享数据
- 先到先得的 draft 冲突处理 + AI 变更摘要通知

不做实时协同编辑（非 Figma/Google Docs 模型）。

## 2. 权限模型

### 2.1 三级角色

| 角色 | 读 | 创建/编辑 | 删除卡片/材料 | 操作 Board | 邀请成员 | 删除 Topic |
|------|----|-----------|--------------|-----------:|----------|-----------|
| Owner | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Editor | ✅ | ✅ | 仅自己创建的 | ✅ | ❌ | ❌ |
| Viewer | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

说明：
- "操作 Board" 包括 approve/reject draft、直接增删节点和边
- Editor 可以删除自己创建的卡片和材料（`created_by = auth.uid()`），Owner 可以删除任何

### 2.2 规则

- 每个 Topic 有且仅有一个 Owner（创建者），初版不支持所有权转让
- Owner 可升降其他成员角色
- 移除成员不删除其已贡献的数据（cards、nodes 保留 `created_by` 归属）
- Viewer 的 AI 只能使用 read_only 工具组

## 3. 数据模型

### 3.1 新增表

#### `topic_members`

```sql
create table topic_members (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references topics(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  invited_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_active_at timestamptz,
  unique(topic_id, user_id)
);
```

- Topic 创建时自动插入一条 `role='owner'` 记录
- 个人 Topic = 只有一条 owner 记录的 Topic，无需区分"个人/团队"类型
- `unique(topic_id, user_id)` 同时作为查询索引，`is_topic_member` 函数在此索引上执行

#### `topic_invites`

```sql
create table topic_invites (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references topics(id) on delete cascade not null,
  invited_by uuid references auth.users(id) not null,
  invite_type text not null check (invite_type in ('link', 'email')),
  email text,
  role text not null check (role in ('editor', 'viewer')),
  token text unique not null,  -- crypto.randomBytes(32).toString('hex')
  max_uses int,                -- null = 无限制, 用于链接邀请
  use_count int default 0,
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz default now()
);
```

- Link 邀请：`invite_type='link'`, `email` 为空，`max_uses` 可设置上限
- Email 邀请：`invite_type='email'`, 指定 email，`max_uses=1`
- Token 使用 `crypto.randomBytes(32).toString('hex')`（64字符 hex，256-bit 熵）

#### `topic_activity_log`

```sql
create table topic_activity_log (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references topics(id) on delete cascade not null,
  user_id uuid references auth.users(id) not null,
  action text not null,
  entity_type text,
  entity_id uuid,
  summary_text text not null,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- 查询优化：按 topic + 时间范围查最近活动
create index idx_activity_log_topic_time on topic_activity_log(topic_id, created_at desc);
```

Action 枚举值：
- `card_created`, `card_updated`, `card_deleted`
- `node_added`, `node_updated`, `node_removed`
- `edge_added`, `edge_removed`
- `draft_proposed`, `draft_approved`, `draft_rejected`
- `material_added`, `material_removed`
- `member_joined`, `member_left`, `member_role_changed`

#### `user_board_annotations`

```sql
create table user_board_annotations (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references thinking_boards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  node_id uuid references board_nodes(id) on delete cascade,
  type text not null check (type in ('bookmark', 'note', 'priority', 'todo')),
  content text,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

- 纯个人数据，其他成员不可见
- `node_id` 可空：空时为 board 级别的笔记

#### `user_profiles`

```sql
create table user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

- 首次登录时自动创建（从 auth.users 的 metadata 提取初始值）
- 用于成员列表、归属标识、draft 提出者展示
- 任何已登录用户可读（用于显示队友信息），仅本人可改

### 3.2 现有表改动

#### 所有 Topic 子资源表追加归属字段

对 `cards`, `board_nodes`, `board_edges`, `board_drafts`, `documents`, `materials` 追加：

```sql
alter table <table> add column created_by uuid references auth.users(id);
alter table <table> add column updated_by uuid references auth.users(id);
```

- 迁移时用现有 `user_id` 值填充 `created_by`

#### `user_id` 字段处置

明确决定：**保留 `user_id` 但不再用于访问控制。**

- `topics.user_id` → 保留，语义为"创建者"，等价于 `topic_members` 中 role='owner' 的 user_id，作为冗余快捷字段
- 子资源表（cards, board_nodes 等）的 `user_id` → 保留但停止在应用层查询中使用，全部改用 `topic_id` + RLS
- 所有后端 service 中的 `.eq("user_id", userId)` 过滤 → 改为 `.eq("topic_id", topicId)`，依赖 RLS 做访问控制
- 新写入的数据 `user_id` 继续填充（向后兼容），但 `created_by` 才是权威归属字段

#### `materials` 表追加 `topic_id`

```sql
alter table materials add column topic_id uuid references topics(id);
```

- 迁移时从现有关联关系（`cards.material_id` → `cards.topic_id`）回填，无关联的材料根据 `user_id` 对应的 Topic 处理
- 新创建的材料必须指定 `topic_id`

#### `board_drafts` 追加版本检测

```sql
alter table board_drafts add column based_on_board_version int;
```

- draft 创建时记录当前 board 的版本号
- approve 时比较版本号，不一致则提示冲突

#### `thinking_boards` 追加版本号

```sql
alter table thinking_boards add column version int default 1;
```

- 每次 board 变更（approve draft、直接操作）version +1
- 使用乐观锁递增：`UPDATE thinking_boards SET version = version + 1 WHERE id = $1 AND version = $expected RETURNING version`，若无返回行则冲突

#### `conversations` / `chat_messages` — 不动

保持 `user_id = auth.uid()` 的私有语义。每个人在共享 Topic 下的 AI 对话独立且私有。

### 3.3 RLS 策略改造

核心变化：Topic 子资源的访问从 `user_id = auth.uid()` 改为通过 `topic_members` 检查。

#### 辅助函数

```sql
-- 检查用户是否为 Topic 成员（直接用 topic_id）
-- SECURITY DEFINER: 必须的，因为 topic_members 本身有 RLS，
-- 普通用户调用 SECURITY INVOKER 函数时会被 topic_members 的 RLS 拦截形成循环。
create function is_topic_member(p_topic_id uuid, p_min_role text default 'viewer')
returns boolean as $$
  select exists (
    select 1 from topic_members
    where topic_id = p_topic_id
      and user_id = auth.uid()
      and case p_min_role
        when 'viewer' then true
        when 'editor' then role in ('editor', 'owner')
        when 'owner' then role = 'owner'
      end
  );
$$ language sql security definer stable;

-- 通过 board_id 检查（用于 board_nodes, board_edges 等无 topic_id 的表）
create function is_board_member(p_board_id uuid, p_min_role text default 'viewer')
returns boolean as $$
  select is_topic_member(
    (select topic_id from thinking_boards where id = p_board_id),
    p_min_role
  );
$$ language sql security definer stable;
```

#### Topic 表本身

```sql
-- topics 表：成员可读，创建者可改/删
create policy "topics_select" on topics for select
  using (is_topic_member(id));

create policy "topics_insert" on topics for insert
  with check (user_id = auth.uid());

create policy "topics_update" on topics for update
  using (is_topic_member(id, 'owner'));

create policy "topics_delete" on topics for delete
  using (is_topic_member(id, 'owner'));
```

#### 有 `topic_id` 的表（cards, materials, documents, thinking_boards）

```sql
-- 示例：cards 表
create policy "cards_select" on cards for select
  using (is_topic_member(topic_id));

create policy "cards_insert" on cards for insert
  with check (is_topic_member(topic_id, 'editor'));

create policy "cards_update" on cards for update
  using (is_topic_member(topic_id, 'editor'));

-- Editor 只能删自己创建的，Owner 可删任何
create policy "cards_delete" on cards for delete
  using (
    is_topic_member(topic_id, 'owner')
    or (is_topic_member(topic_id, 'editor') and created_by = auth.uid())
  );
```

#### 通过 `board_id` 关联的表（board_nodes, board_edges, board_drafts）

```sql
-- 示例：board_nodes 表
create policy "board_nodes_select" on board_nodes for select
  using (is_board_member(board_id));

create policy "board_nodes_insert" on board_nodes for insert
  with check (is_board_member(board_id, 'editor'));

create policy "board_nodes_update" on board_nodes for update
  using (is_board_member(board_id, 'editor'));

create policy "board_nodes_delete" on board_nodes for delete
  using (is_board_member(board_id, 'owner')
    or (is_board_member(board_id, 'editor') and created_by = auth.uid()));
```

#### `board_drafts` — 共享 Topic 下对团队成员可见

```sql
-- 所有成员可读 draft（用于显示"张三的 AI 建议..."）
create policy "board_drafts_select" on board_drafts for select
  using (is_board_member(board_id));

-- Editor+ 可创建 draft
create policy "board_drafts_insert" on board_drafts for insert
  with check (is_board_member(board_id, 'editor'));

-- 只有 draft 创建者可以 approve/reject 自己的 draft
create policy "board_drafts_update" on board_drafts for update
  using (is_board_member(board_id, 'editor') and created_by = auth.uid());

-- 创建者或 Owner 可删除 draft
create policy "board_drafts_delete" on board_drafts for delete
  using (is_board_member(board_id, 'owner')
    or (is_board_member(board_id, 'editor') and created_by = auth.uid()));
```

#### 其他 Topic 子资源（health_cache, research_state）

```sql
-- health_cache: 通过 board_id 关联
create policy "health_cache_select" on health_cache for select
  using (is_board_member(board_id));
-- 写入由后端 admin client 执行，无需用户级写入策略

-- research_state: 通过 topic_id 关联
create policy "research_state_select" on research_state for select
  using (is_topic_member(topic_id));
```

#### 私有表保持不变

`user_board_annotations` 和 `conversations`/`chat_messages` 保持 `user_id = auth.uid()`。

`user_board_annotations` 额外加一条保护：

```sql
-- 必须是 board 的 topic 成员才能创建标注（防止猜 board_id）
create policy "annotations_insert" on user_board_annotations for insert
  with check (user_id = auth.uid() and is_board_member(board_id));
```

#### `topic_members` 本身

```sql
create policy "topic_members_select" on topic_members for select
  using (is_topic_member(topic_id));  -- 同 topic 成员可互相看到

create policy "topic_members_insert" on topic_members for insert
  with check (is_topic_member(topic_id, 'owner'));

create policy "topic_members_update" on topic_members for update
  using (is_topic_member(topic_id, 'owner'));

create policy "topic_members_delete" on topic_members for delete
  using (is_topic_member(topic_id, 'owner'));
```

#### `topic_invites`

```sql
create policy "topic_invites_select_owner" on topic_invites for select
  using (is_topic_member(topic_id, 'owner'));

-- 接受邀请时需要读取 invite 详情（通过 token，在 API 层用 admin client 处理）

create policy "topic_invites_insert" on topic_invites for insert
  with check (is_topic_member(topic_id, 'owner'));

create policy "topic_invites_delete" on topic_invites for delete
  using (is_topic_member(topic_id, 'owner'));
```

接受邀请的操作（验证 token、检查 email 匹配、检查过期、检查 max_uses）在后端 API 层使用 admin client 执行，不走 RLS：

```javascript
// 邀请接受逻辑（使用 supabaseAdmin）
async function acceptInvite(token, userId, userEmail) {
  const invite = await supabaseAdmin.from('topic_invites')
    .select('*').eq('token', token).single();

  // 验证
  if (!invite) throw new Error('Invalid invite');
  if (invite.expires_at < new Date()) throw new Error('Invite expired');
  if (invite.invite_type === 'email' && invite.email !== userEmail) {
    throw new Error('This invite is for a different email address');
  }
  if (invite.max_uses && invite.use_count >= invite.max_uses) {
    throw new Error('Invite has reached maximum uses');
  }

  // 加入
  await supabaseAdmin.from('topic_members').insert({
    topic_id: invite.topic_id,
    user_id: userId,
    role: invite.role,
    invited_by: invite.invited_by
  });

  // 更新使用计数
  await supabaseAdmin.from('topic_invites')
    .update({ use_count: invite.use_count + 1, accepted_by: userId, accepted_at: new Date() })
    .eq('id', invite.id);
}
```

## 4. 邀请系统

### 4.1 链接邀请

1. Owner 调用 `POST /api/v2/topics/:id/invites` → `{ type: 'link', role: 'editor', expires_in: '7d', max_uses: 10 }`
2. 后端生成 token（`crypto.randomBytes(32).toString('hex')`），返回邀请链接 `{app_url}/invite/{token}`
3. 受邀者打开链接 → 已登录则直接加入 → 未登录则跳转登录/注册后加入
4. 同一链接可多人使用（直到过期或达到 max_uses）

### 4.2 邮箱邀请

1. Owner 调用 `POST /api/v2/topics/:id/invites` → `{ type: 'email', email: 'x@y.com', role: 'editor' }`
2. 后端创建记录（`max_uses=1`）。如果该 email 对应已有用户 → 在应用内显示邀请通知。未注册用户 → 暂不发邮件（MVP 不做邮件通知，等用户注册后在 dashboard 看到 pending invite）
3. 用户接受邀请 → `POST /api/v2/invites/:token/accept`
4. 后端验证 `invite.email === req.user.email`，不匹配则拒绝

### 4.3 API 端点

```
POST   /api/v2/topics/:id/invites       — 创建邀请 (owner only)
GET    /api/v2/topics/:id/invites       — 列出邀请 (owner only)
DELETE /api/v2/topics/:id/invites/:id   — 撤销邀请 (owner only)
GET    /api/v2/invites/:token           — 查看邀请详情 (公开，用于邀请页面，仅返回 topic 名称和角色)
POST   /api/v2/invites/:token/accept    — 接受邀请 (需登录，email 邀请验证 email 匹配)

GET    /api/v2/topics/:id/members       — 列出成员 (成员可见)
PATCH  /api/v2/topics/:id/members/:id   — 修改角色 (owner only)
DELETE /api/v2/topics/:id/members/:id   — 移除成员 (owner only)

GET    /api/v2/me/invites               — 我的待接受邀请列表
```

## 5. Draft 冲突处理（先到先得 + 通知）

### 5.1 流程

1. 用户 A 的 AI 提出 board draft，记录 `based_on_board_version = N`
2. 用户 B 的 AI 也提出 draft，记录 `based_on_board_version = N`
3. 用户 A 先 approve → 乐观锁递增 board version（`WHERE version = N`），成功则 version 变为 N+1
4. 用户 B 尝试 approve → 乐观锁递增（`WHERE version = N`）→ 无返回行 → 冲突检测到
5. 系统提示："Board 在此 draft 之后已有变更，建议让 AI 重新评估"
6. 用户 B 可以选择：
   - 让 AI 重新评估（基于最新 board 状态重新生成 draft）
   - 强制 approve（跳过版本检查，直接递增 `version = version + 1`）
   - 放弃此 draft

### 5.2 冲突粒度

粗粒度：基于 board version 整体判断。简单可靠，MVP 足够。

未来可细化为节点级冲突检测（只有涉及相同节点的 draft 才算冲突），但初版不做。

## 6. Activity Log + AI 变更摘要

### 6.1 Activity Log 写入

在后端 service 层，所有对共享 Topic 子资源的写操作同步写入 `topic_activity_log`。

实现方式：在 `cards.mjs`, `boards.mjs` 等 service 文件的写入函数中追加 log 调用。

```javascript
// 示例
async function createCard(supabase, cardData, userId) {
  const card = await /* 现有创建逻辑 */;
  await logActivity(supabase, {
    topic_id: cardData.topic_id,
    user_id: userId,
    action: 'card_created',
    entity_type: 'card',
    entity_id: card.id,
    summary_text: `创建了卡片「${card.title}」`
  });
  return card;
}
```

### 6.2 AI 变更摘要

当用户在共享 Topic 下开始新对话时：

1. `promptBuilder.mjs` 检测 Topic 是否为共享（`topic_members` 记录数 > 1）
2. 如果是共享 Topic，查询 `topic_activity_log` 中自用户 `last_active_at` 以来的活动
3. 将活动列表传给 AI，附加 prompt 指令：

```
## 团队动态
自你上次活跃以来，共享 Topic 发生了以下变更：
{activity_list}

请在回复开始时简要总结这些变更对研究进展的影响，特别关注：
- 证据格局的变化（某假设的支持/反对比是否改变）
- 新增的研究分支或子问题
- 可能需要用户关注的冲突或盲点
```

4. 更新用户的 `last_active_at`

### 6.3 Token 预算

Activity 摘要占用 context budget 的一部分。策略：
- 最近 50 条活动或最近 7 天（取较少者）
- 如果超出预算，AI 只拿到最近的活动 + 一句"更多历史活动请查看 Activity 面板"

### 6.4 数据保留

MVP 阶段不做自动清理。未来可加：
- 超过 90 天的活动日志自动归档或删除
- 或使用 Postgres 表分区按月切分

## 7. 个人视图层

### 7.1 功能

在共享 Board 上，每个用户可以：

| 类型 | 用途 | 示例 |
|------|------|------|
| `bookmark` | 标记关注的节点 | 收藏 H3 节点，AI 优先关注 |
| `note` | 私人笔记 | "这个假设的数据来源有问题，下次要查" |
| `priority` | 标记优先级 | 标记 Q2 为高优先 |
| `todo` | 待办 | "需要找更多反对证据" |

### 7.2 AI 感知

用户的 AI 在构建 prompt 时，从 `user_board_annotations` 读取该用户的标注，注入上下文：

```
## 你的个人标注
- 你收藏了节点 H3「锂电池成本将在2027年降至$60/kWh」
- 你在 Q2 上标注了待办：「需要找更多反对证据」
- 你在 H1 上的笔记：「数据来源有问题，下次要查」

请结合这些标注优先处理用户关注的研究方向。
```

### 7.3 前端渲染

- Board 节点上叠加半透明图标（书签、笔记、优先级、待办标记）
- 只有自己能看到自己的标注
- 侧边栏可以列出所有个人标注，快速跳转

## 8. 前端改动

### 8.1 Topic 设置面板

在 Topic 内新增"成员"设置页：
- 成员列表（头像、角色、最后活跃时间）
- 邀请按钮（生成链接 / 输入邮箱）
- 角色管理（Owner 可操作）

### 8.2 共享 Topic 视觉标识

- Topic 列表中，共享 Topic 显示成员头像堆叠
- Topic 内部顶栏显示在线成员（基于 `last_active_at`，5分钟内算在线）

### 8.3 Board 上的归属标识

- 节点和卡片显示 `created_by` 的头像小标
- Draft 对所有成员可见，显示提出者："张三的 AI 建议..."
- 只有 draft 创建者可以 approve/reject 自己的 draft
- Approve 时如果检测到版本冲突，弹出提示让用户选择（重新评估/强制/放弃）

### 8.4 个人标注 UI

- Board 节点右键菜单：添加书签/笔记/标优先级/添加待办
- Board 侧边栏新增"我的标注"Tab
- 标注以半透明图层覆盖在节点上

### 8.5 邀请接受页

- `/invite/:token` 路由 → 显示 Topic 名称、邀请者、角色 → 确认加入
- Dashboard 顶部显示 pending invites 提示条

## 9. 后端改动概要

### 9.1 新增路由

- `routes/topicMembers.mjs` — 成员 CRUD
- `routes/topicInvites.mjs` — 邀请 CRUD + accept

### 9.2 Service 层改动

**重要：全量重构 `.eq("user_id", userId)` 过滤**

所有 service 文件中对共享资源的查询从 `.eq("user_id", userId)` 改为 `.eq("topic_id", topicId)`。受影响文件：
- `services/supabase/cards.mjs` — 所有查询和写入函数
- `services/supabase/boards.mjs` — 所有查询和写入函数
- `services/supabase/documents.mjs` — 查询函数
- `services/supabase/sources.mjs` — 查询函数
- `chat/toolExecutor.mjs` — `verifyRawSnippet` 等需要过滤材料的函数

写操作追加：
- `created_by` / `updated_by` 字段填充
- activity log 写入
- board version 递增（boards 相关操作）

新增 service：
- `services/supabase/topicMembers.mjs`
- `services/supabase/activityLog.mjs`
- `services/supabase/annotations.mjs`
- `services/supabase/userProfiles.mjs`

### 9.3 AI 层改动

- `promptBuilder.mjs` — 共享 Topic 时注入团队动态摘要 + 个人标注
- `toolGroups.mjs` — Viewer 角色限制为 `explore` 工具组
- `toolExecutor.mjs` — 写操作前检查用户在 Topic 中的角色权限

### 9.4 中间件

- 新增 `topicAuth` 中间件：使用 admin client 查询 `topic_members`，验证用户对 Topic 的访问权限和角色，挂载到 `req.topicRole`
- 实际数据操作仍使用 user-scoped Supabase client（`req.supabase`），RLS 作为第二道防线
- 中间件先于 RLS 执行，可以提供更好的错误信息（"你不是此 Topic 的成员" vs 通用的 RLS 拒绝）

## 10. 不做的事（MVP 边界）

- ❌ 实时协同（WebSocket 推送、光标同步）
- ❌ 邮件通知（邀请通知仅应用内）
- ❌ 节点级细粒度冲突检测（用 board version 粗粒度）
- ❌ 跨 Topic 知识网络（社区功能，未来再说）
- ❌ 成员在线状态实时推送（用 last_active_at 近似）
- ❌ Workspace 层级抽象
- ❌ 所有权转让（初版只有创建者是 Owner）
- ❌ 过期邀请自动清理（MVP 可手动撤销）
- ❌ Activity log 自动归档（见 §6.4 未来计划）

## 11. 迁移策略

迁移必须在**单个事务**中按以下顺序执行：

```
1. 创建 user_profiles 表
2. 从 auth.users 回填 user_profiles
3. 创建 topic_members 表
4. 从 topics.user_id 回填 topic_members（每个 Topic 创建一条 owner 记录）
5. 创建 topic_invites, topic_activity_log, user_board_annotations 表
6. 为现有表添加 created_by / updated_by 列
7. 回填 created_by：
   - cards, materials, documents: 直接用 user_id
   - board_nodes, board_edges, board_drafts: JOIN thinking_boards 获取 user_id
8. 为 materials 添加 topic_id 列并回填
9. 为 thinking_boards 添加 version 列
10. 为 board_drafts 添加 based_on_board_version 列
11. 创建 is_topic_member, is_board_member 函数
12. DROP 所有旧 RLS 策略
13. CREATE 所有新 RLS 策略
```

关键保证：
- 步骤 4 必须在步骤 12-13 之前完成（否则用户丢失数据访问权）
- 单事务保证原子性：要么全部成功，要么全部回滚
- 现有用户无感知：单人 Topic 只有一条 owner 记录 = 等价于原来的 `user_id = auth.uid()`

## 12. 需同步更新的文档

实现后需更新：
- `docs/PRODUCT-SPEC.md` §3.4 — 移除"不支持协作"的说明，改为"支持小团队协作"
- `docs/PRODUCT-SPEC.md` §14 — 从 Non-Goals 移除"Multi-user collaboration"
- `docs/ARCHITECTURE.md` §7.2 — 从"user-scoped RLS"改为"topic_members-based RLS"
- `docs/ARCHITECTURE.md` §10.2 — AI 数据访问约束更新为"AI 不能修改用户未参与的 Topic 数据"
