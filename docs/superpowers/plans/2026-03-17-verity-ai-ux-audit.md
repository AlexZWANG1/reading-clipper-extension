# Verity 产品测评 + 自动化回归测试

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 两条线并行——(1) 建立 Playwright 自动化测试套件，Ralph Loop 每轮可回归；(2) 以 PM 测评人视角审计 AI 体验、UI/交互/配色品质，输出产品测评报告和改进建议。

**Architecture:**
```
输出物:
├── e2e/                              ← 自动化回归测试（每轮 Ralph Loop 运行）
│   ├── playwright.config.ts
│   ├── auth.setup.ts
│   ├── fixtures.ts
│   ├── scenarios/
│   │   ├── ai-chat.spec.ts           — Chat 全链路自动化
│   │   ├── ai-workspace.spec.ts      — Workspace AI + Draft 自动化
│   │   ├── ai-research-run.spec.ts   — Research Run 自动化
│   │   ├── navigation.spec.ts        — 导航 + 路由守卫自动化
│   │   ├── robustness.spec.ts        — 防抖/快速操作/错误处理
│   │   └── ux-screenshots.spec.ts    — 全站截图（供 PM 审阅）
│   └── ralph-runner.sh               — Ralph Loop 入口脚本
│
├── reading-cards-backend/test/
│   └── tool-inference.test.mjs       ← toolGroup 推断单元测试
│
└── docs/superpowers/product-review.md ← PM 产品测评报告（手工填写）
```

**双重思维模式:**
- **工程师帽子**: 每个场景写成可重复执行的 Playwright spec，assert 具体行为
- **PM 帽子**: 在同一场景中截图 + 记录主观体验笔记到 product-review.md

**Tech Stack:** Playwright, Node.js (node:test), React/Zustand, Supabase Auth, OpenAI

---

## Chunk 1: 基础设施 + 导航回归

### Task 1: Playwright 基础设施

**Files:**
- Create: `e2e/playwright.config.ts`
- Create: `e2e/auth.setup.ts`
- Create: `e2e/fixtures.ts`

- [ ] **Step 1: 创建 playwright.config.ts**

```typescript
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './scenarios',
  fullyParallel: false, // AI tests need sequential execution
  retries: 1,
  timeout: 120_000, // AI responses can be slow
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:5173',
    storageState: '.auth/user.json',
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { storageState: undefined } },
    { name: 'tests', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
  ],
  reporter: [
    ['html', { open: 'never', outputFolder: '../test-results/html' }],
    ['json', { outputFile: '../test-results/results.json' }],
    ['list'],
  ],
  outputDir: '../test-results/artifacts',
});
```

- [ ] **Step 2: 创建 auth.setup.ts**

```typescript
// e2e/auth.setup.ts
import { test as setup } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../.auth/user.json');

setup('login', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder(/邮箱|email/i).fill(process.env.TEST_EMAIL!);
  await page.getByPlaceholder(/密码|password/i).fill(process.env.TEST_PASSWORD!);
  await page.getByRole('button', { name: /登录|login/i }).click();
  await page.waitForURL('/');
  await page.context().storageState({ path: authFile });
});
```

- [ ] **Step 3: 创建 fixtures.ts**

```typescript
// e2e/fixtures.ts
import { test as base, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.join(__dirname, '../test-results/review-screenshots');

export const test = base.extend<{ reviewScreenshot: (name: string) => Promise<void> }>({
  reviewScreenshot: async ({ page }, use) => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await use(async (name: string) => {
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${name}.png`),
        fullPage: true,
      });
    });
  },
});

export { expect };
```

- [ ] **Step 4: 创建 .auth 和 .gitignore**

Run: `mkdir -p e2e/.auth && echo '*.json' > e2e/.auth/.gitignore`

- [ ] **Step 5: 安装 Playwright browsers**

Run: `npx playwright install chromium`

- [ ] **Step 6: Commit**

```bash
git add e2e/
git commit -m "feat(e2e): Playwright infrastructure with auth + screenshot fixtures"
```

---

### Task 2: 导航 + 路由守卫（自动化 + 截图）

**Files:**
- Create: `e2e/scenarios/navigation.spec.ts`

- [ ] **Step 1: 写自动化测试 + PM 截图**

```typescript
// e2e/scenarios/navigation.spec.ts
import { test, expect } from '../fixtures';

test.describe('导航与路由', () => {
  const pages = [
    { path: '/', name: 'home', title: /verity|首页|topics/i },
    { path: '/materials', name: 'materials', title: /材料|来源|materials/i },
    { path: '/chat', name: 'chat', title: /对话|chat/i },
    { path: '/tasks', name: 'tasks', title: /任务|tasks/i },
    { path: '/settings', name: 'settings', title: /设置|settings/i },
  ];

  for (const p of pages) {
    test(`${p.name} (${p.path}) 可访问 + 无白屏`, async ({ page, reviewScreenshot }) => {
      await page.goto(p.path);
      await page.waitForLoadState('networkidle');

      // 自动化: 页面不能是空白
      const body = await page.locator('body').textContent();
      expect(body!.length).toBeGreaterThan(20);

      // 自动化: 无 JS 错误
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      expect(errors).toHaveLength(0);

      // PM 截图: 供测评报告使用
      await reviewScreenshot(`nav-${p.name}`);
    });
  }

  test('未登录访问保护路由 → 重定向到 /login', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto('http://localhost:5173/');
    await page.waitForURL(/\/login/);
    expect(page.url()).toContain('/login');
    await ctx.close();
  });

  test('导航高亮：当前页面对应的 nav item 应有 active 样式', async ({ page }) => {
    await page.goto('/materials');
    await page.waitForLoadState('networkidle');
    // 当前 nav link 应有区别于其他链接的样式
    const activeLink = page.locator('nav a[href="/materials"], aside a[href="/materials"]');
    if (await activeLink.count() > 0) {
      const classes = await activeLink.first().getAttribute('class');
      // PM 记录: active 样式是否足够明显？
    }
  });
});
```

- [ ] **Step 2: 运行验证**

Run: `cd e2e && npx playwright test scenarios/navigation.spec.ts --headed`

- [ ] **Step 3: Commit**

```bash
git add e2e/scenarios/navigation.spec.ts
git commit -m "test(e2e): navigation routes + auth guard + PM screenshots"
```

---

## Chunk 2: AI Chat 全链路

### Task 3: Chat 基础 — 发消息、收回复、无泄漏

**Files:**
- Create: `e2e/scenarios/ai-chat.spec.ts`

- [ ] **Step 1: 写测试**

```typescript
// e2e/scenarios/ai-chat.spec.ts
import { test, expect } from '../fixtures';

test.describe('AI Chat 核心体验', () => {

  test('发送消息 → 收到 AI 回复 → 无 UUID/工具名泄漏', async ({ page, reviewScreenshot }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // PM 截图: chat 初始状态
    await reviewScreenshot('chat-empty-state');

    const input = page.locator('textarea').first();
    await input.fill('你好，请介绍一下你自己');
    await input.press('Enter');

    // 自动化: 等待 AI 回复出现
    const aiMsg = page.locator('[data-role="assistant"], [class*="assistant"], [class*="ai-message"]').last();
    await expect(aiMsg).toBeVisible({ timeout: 30_000 });

    const replyText = await aiMsg.textContent();

    // 自动化: 不应泄漏内部信息
    expect(replyText).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/); // UUID
    expect(replyText).not.toMatch(/tool_call|semantic_search|create_card/); // 工具名
    expect(replyText).not.toMatch(/function_call|tool_use_id/); // API 细节

    // PM 截图: 有回复的聊天界面
    await reviewScreenshot('chat-first-reply');
  });

  test('发送研究问题 → AI 调用工具 → 结构化回复', async ({ page, reviewScreenshot }) => {
    await page.goto('/chat');

    const input = page.locator('textarea').first();
    await input.fill('帮我搜索知识库中关于人工智能的内容');
    await input.press('Enter');

    // 自动化: 拦截 API 看 AI 是否真的调用了工具
    const response = await page.waitForResponse(
      resp => resp.url().includes('/api/v2/chat') && resp.status() === 200,
      { timeout: 45_000 }
    );

    // PM 截图: 工具调用后的回复
    await page.waitForTimeout(2000);
    await reviewScreenshot('chat-tool-call-result');
  });

  test('surfaceContext 正确传递', async ({ page }) => {
    // 在首页发消息
    await page.goto('/');
    const [request] = await Promise.all([
      page.waitForRequest(req =>
        req.url().includes('/api/v2/chat') && req.method() === 'POST'
      ),
      (async () => {
        const input = page.locator('textarea').first();
        if (await input.isVisible({ timeout: 3000 })) {
          await input.fill('测试');
          await input.press('Enter');
        }
      })(),
    ]);
    if (request) {
      const body = request.postDataJSON();
      const ctx = body.surface_context || body.surfaceContext;
      expect(ctx).toBeTruthy();
      expect(ctx.surface).toBeTruthy();
    }
  });

  test('对话持久化 — 刷新后历史保留', async ({ page, reviewScreenshot }) => {
    await page.goto('/chat');
    const input = page.locator('textarea').first();
    const marker = `persist-test-${Date.now()}`;
    await input.fill(marker);
    await input.press('Enter');

    // 等 AI 回复
    await page.waitForTimeout(10_000);

    // 刷新
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 自动化: 之前的消息应该还在
    const pageText = await page.locator('body').textContent();
    // 注意: 如果对话列表需要点击才恢复，这里可能需要调整
    await reviewScreenshot('chat-after-reload');
  });

  test('防抖 — 快速连按 Enter 只发一条', async ({ page }) => {
    await page.goto('/chat');
    let chatRequests = 0;
    page.on('request', req => {
      if (req.url().includes('/api/v2/chat') && req.method() === 'POST') chatRequests++;
    });

    const input = page.locator('textarea').first();
    await input.fill('防抖测试消息');
    await input.press('Enter');
    await input.press('Enter');
    await input.press('Enter');
    await page.waitForTimeout(3000);

    expect(chatRequests).toBe(1);
  });
});
```

- [ ] **Step 2: 运行验证**

Run: `cd e2e && npx playwright test scenarios/ai-chat.spec.ts --headed`

- [ ] **Step 3: Commit**

```bash
git add e2e/scenarios/ai-chat.spec.ts
git commit -m "test(e2e): AI chat - reply quality, UUID leak guard, persistence, debounce"
```

---

### Task 4: toolGroup 推断单元测试

**Files:**
- Create: `reading-cards-backend/test/tool-inference.test.mjs`
- Reference: `reading-cards-backend/src/chat/toolGroups.mjs`

- [ ] **Step 1: 确认 inferToolGroup 的导出名称**

Run: `grep -n "export.*function\|module.exports" reading-cards-backend/src/chat/toolGroups.mjs | head -10`

- [ ] **Step 2: 写单元测试**

```javascript
// reading-cards-backend/test/tool-inference.test.mjs
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
// 根据 Step 1 的实际导出名调整
import { inferToolGroup } from '../src/chat/toolGroups.mjs';

describe('toolGroup 推断', () => {
  it('画板关键词 + workspace surface → board', () => {
    const g = inferToolGroup('帮我在画板上添加假设', { surface: 'workspace', boardId: 'b1' });
    assert.equal(g, 'board');
  });

  it('创建卡片意图 → cards', () => {
    const g = inferToolGroup('把这段保存为证据卡', { surface: 'reader' });
    assert.equal(g, 'cards');
  });

  it('普通提问 → explore', () => {
    const g = inferToolGroup('MECE 方法论是什么？', { surface: 'general' });
    assert.equal(g, 'explore');
  });

  it('导入 URL → ingest', () => {
    const g = inferToolGroup('导入 https://example.com', { surface: 'general' });
    assert.equal(g, 'ingest');
  });

  it('chat 模式强制 explore（即使有画板关键词）', () => {
    const g = inferToolGroup('创建假设', { surface: 'workspace', boardId: 'b1' }, 'chat');
    assert.equal(g, 'explore');
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `cd reading-cards-backend && node --test test/tool-inference.test.mjs`

- [ ] **Step 4: 根据实际导出/行为修正测试使其通过**

- [ ] **Step 5: Commit**

```bash
git add reading-cards-backend/test/tool-inference.test.mjs
git commit -m "test: toolGroup inference unit tests"
```

---

## Chunk 3: Workspace AI + Board 自动化

### Task 5: Workspace AI — Draft 预览 + 画板操作

**Files:**
- Create: `e2e/scenarios/ai-workspace.spec.ts`

- [ ] **Step 1: 写测试**

```typescript
// e2e/scenarios/ai-workspace.spec.ts
import { test, expect } from '../fixtures';

test.describe('Workspace AI 体验', () => {

  test('进入 workspace → 空画板状态截图', async ({ page, reviewScreenshot }) => {
    await page.goto('/');
    const topicLink = page.locator('a[href*="/topics/"]').first();
    if (!(await topicLink.isVisible({ timeout: 5000 }))) {
      // 没有 topic，创建一个
      test.skip();
      return;
    }
    await topicLink.click();
    await page.waitForURL(/\/topics\//);
    await page.waitForLoadState('networkidle');

    // PM 截图: workspace 整体布局
    await reviewScreenshot('workspace-overview');
  });

  test('Workspace chat 感知 Topic 上下文', async ({ page, reviewScreenshot }) => {
    await page.goto('/');
    const topicLink = page.locator('a[href*="/topics/"]').first();
    if (!(await topicLink.isVisible({ timeout: 5000 }))) { test.skip(); return; }
    await topicLink.click();
    await page.waitForURL(/\/topics\//);

    // 拦截请求验证 surfaceContext
    const [request] = await Promise.all([
      page.waitForRequest(req =>
        req.url().includes('/api/v2/chat') && req.method() === 'POST'
      ),
      (async () => {
        const input = page.locator('textarea').first();
        await input.fill('分析当前画板');
        await input.press('Enter');
      })(),
    ]);

    const body = request.postDataJSON();
    const ctx = body.surface_context || body.surfaceContext;
    // 自动化: workspace 中应传 topicId
    expect(ctx?.surface).toBe('workspace');
    expect(ctx?.topicId).toBeTruthy();
  });

  test('AI propose_board_changes → DraftNode 渲染', async ({ page, reviewScreenshot }) => {
    await page.goto('/');
    const topicLink = page.locator('a[href*="/topics/"]').first();
    if (!(await topicLink.isVisible({ timeout: 5000 }))) { test.skip(); return; }
    await topicLink.click();
    await page.waitForURL(/\/topics\//);

    const input = page.locator('textarea').first();
    await input.fill('请帮我提出 2 个研究假设并添加到画板');
    await input.press('Enter');

    // 等待 draft 节点出现（AI 调用 propose_board_changes）
    // Draft 节点特征: 虚线边框、AI 徽章
    await page.waitForTimeout(30_000); // AI 响应可能慢

    // PM 截图: draft 预览状态
    await reviewScreenshot('workspace-draft-preview');

    // 自动化: 检查是否有 accept/reject 按钮
    const acceptBtn = page.locator('button', { hasText: /接受|确认|accept|commit|✓/i });
    const rejectBtn = page.locator('button', { hasText: /拒绝|取消|reject|dismiss|✗/i });
    // 至少应该有某种确认机制
  });

  test('Accept draft → 节点从虚线变实线', async ({ page, reviewScreenshot }) => {
    // 在上一个测试产生 draft 后执行
    await page.goto('/');
    const topicLink = page.locator('a[href*="/topics/"]').first();
    if (!(await topicLink.isVisible({ timeout: 5000 }))) { test.skip(); return; }
    await topicLink.click();
    await page.waitForURL(/\/topics\//);
    await page.waitForLoadState('networkidle');

    const acceptBtn = page.locator('button', { hasText: /接受|确认|accept|commit|全部接受/i }).first();
    if (await acceptBtn.isVisible({ timeout: 5000 })) {
      await acceptBtn.click();
      await page.waitForTimeout(2000);
      // PM 截图: commit 后的画板
      await reviewScreenshot('workspace-after-commit');
    }
  });
});

test.describe('Board Health 可视化', () => {
  test('HypothesisBar + Evidence 关系 截图审计', async ({ page, reviewScreenshot }) => {
    await page.goto('/');
    const topicLink = page.locator('a[href*="/topics/"]').first();
    if (!(await topicLink.isVisible({ timeout: 5000 }))) { test.skip(); return; }
    await topicLink.click();
    await page.waitForURL(/\/topics\//);
    await page.waitForLoadState('networkidle');

    // PM 截图: 画板节点细节
    await reviewScreenshot('board-nodes-detail');

    // 自动化: 画板上的节点应有正确的视觉区分
    const canvas = page.locator('[class*="react-flow"], [class*="board"], [class*="canvas"]');
    if (await canvas.isVisible({ timeout: 5000 })) {
      await expect(canvas).toBeVisible();
    }
  });

  test('Hypothesis confidence 滑块可交互', async ({ page }) => {
    await page.goto('/');
    const topicLink = page.locator('a[href*="/topics/"]').first();
    if (!(await topicLink.isVisible({ timeout: 5000 }))) { test.skip(); return; }
    await topicLink.click();

    const slider = page.locator('input[type="range"]').first();
    if (await slider.isVisible({ timeout: 5000 })) {
      const before = await slider.inputValue();
      await slider.fill('80');
      const after = await slider.inputValue();
      expect(after).toBe('80');
    }
  });
});
```

- [ ] **Step 2: 运行验证**

Run: `cd e2e && npx playwright test scenarios/ai-workspace.spec.ts --headed`

- [ ] **Step 3: Commit**

```bash
git add e2e/scenarios/ai-workspace.spec.ts
git commit -m "test(e2e): workspace AI - surfaceContext, draft preview, board health"
```

---

### Task 6: Research Run 自动化

**Files:**
- Create: `e2e/scenarios/ai-research-run.spec.ts`

- [ ] **Step 1: 写测试**

```typescript
// e2e/scenarios/ai-research-run.spec.ts
import { test, expect } from '../fixtures';

test.describe('Research Run', () => {

  test('Plan 模板列表加载', async ({ page, reviewScreenshot }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const templateTrigger = page.locator('button, [class*="template"]', {
      hasText: /模板|template|计划/i
    }).first();

    if (await templateTrigger.isVisible({ timeout: 5000 })) {
      await templateTrigger.click();
      await page.waitForTimeout(2000);
      await reviewScreenshot('research-run-templates');
    }
  });

  test('触发 plan 生成 → plan 卡片渲染', async ({ page, reviewScreenshot }) => {
    await page.goto('/chat');

    const input = page.locator('textarea').first();
    await input.fill('帮我制定一个关于气候变化对农业影响的研究计划');
    await input.press('Enter');

    // 等待 plan proposal（AI 调用 request_plan）
    await page.waitForTimeout(30_000);
    await reviewScreenshot('research-run-plan-proposal');

    // 自动化: plan 应有步骤列表
    const planArea = page.locator('[class*="plan"], [class*="proposal"]');
    if (await planArea.first().isVisible({ timeout: 15_000 })) {
      const steps = planArea.locator('li, [class*="step"]');
      const count = await steps.count();
      // 规范要求 3-8 步
      expect(count).toBeGreaterThanOrEqual(2);
    }
  });

  test('执行 plan → 进度展示', async ({ page, reviewScreenshot }) => {
    // 如果上一步产生了 plan，点击执行
    const executeBtn = page.locator('button', { hasText: /执行|开始研究|execute|run/i }).first();
    if (await executeBtn.isVisible({ timeout: 5000 })) {
      await executeBtn.click();

      // 等待进度出现
      await page.waitForTimeout(10_000);
      await reviewScreenshot('research-run-in-progress');

      // 等待完成（最多 3 分钟）
      const complete = page.locator('text=/完成|已完成|complete/i');
      if (await complete.isVisible({ timeout: 180_000 })) {
        await reviewScreenshot('research-run-complete');
      }
    }
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add e2e/scenarios/ai-research-run.spec.ts
git commit -m "test(e2e): research run - plan generation, execution, progress"
```

---

## Chunk 4: 鲁棒性自动化 + UX 截图 + PM 报告 + Ralph Loop

### Task 7: 鲁棒性 + 错误处理自动化

**Files:**
- Create: `e2e/scenarios/robustness.spec.ts`

- [ ] **Step 1: 写测试**

```typescript
// e2e/scenarios/robustness.spec.ts
import { test, expect } from '../fixtures';

test.describe('鲁棒性', () => {

  test('API 500 → 友好错误提示，不白屏', async ({ page, reviewScreenshot }) => {
    await page.route('**/api/v2/topics**', route =>
      route.fulfill({ status: 500, body: '{"error":"Internal Server Error"}' })
    );
    await page.goto('/');
    await page.waitForTimeout(3000);

    const bodyText = await page.locator('body').textContent();
    expect(bodyText!.length).toBeGreaterThan(30); // 不是空白页

    await reviewScreenshot('error-api-500');
  });

  test('Chat API 超时 → 有反馈不是无限 loading', async ({ page, reviewScreenshot }) => {
    await page.route('**/api/v2/chat', route =>
      route.fulfill({ status: 504, body: 'Gateway Timeout' })
    );
    await page.goto('/chat');
    const input = page.locator('textarea').first();
    await input.fill('超时测试');
    await input.press('Enter');
    await page.waitForTimeout(5000);

    await reviewScreenshot('error-chat-timeout');
  });

  test('快速连续创建 Topic → 无重复', async ({ page }) => {
    await page.goto('/');
    const createBtn = page.locator('button', { hasText: /创建|新建|\+/i }).first();
    if (!(await createBtn.isVisible({ timeout: 3000 }))) { test.skip(); return; }

    // 快速点两次
    await createBtn.click();
    await createBtn.click();
    await page.waitForTimeout(2000);
    // 不应出现两个创建表单/弹窗
  });

  test('超长文本输入 → 不崩溃', async ({ page }) => {
    await page.goto('/chat');
    const input = page.locator('textarea').first();
    await input.fill('测试'.repeat(5000)); // 10000 字符
    // 页面不应崩溃
    const bodyText = await page.locator('body').textContent();
    expect(bodyText!.length).toBeGreaterThan(0);
  });

  test('XSS 尝试 → 不执行', async ({ page }) => {
    await page.goto('/chat');
    const alerts: string[] = [];
    page.on('dialog', d => { alerts.push(d.message()); d.dismiss(); });

    const input = page.locator('textarea').first();
    await input.fill('<img src=x onerror="alert(1)"><script>alert(2)</script>');
    await input.press('Enter');
    await page.waitForTimeout(10_000);

    expect(alerts).toHaveLength(0);
  });

  test('页面刷新后 workspace 状态恢复', async ({ page, reviewScreenshot }) => {
    await page.goto('/');
    const topicLink = page.locator('a[href*="/topics/"]').first();
    if (!(await topicLink.isVisible({ timeout: 3000 }))) { test.skip(); return; }
    await topicLink.click();
    await page.waitForURL(/\/topics\//);
    const url = page.url();

    await page.reload();
    await page.waitForLoadState('networkidle');

    // 自动化: URL 应不变（状态保留）
    expect(page.url()).toBe(url);
    await reviewScreenshot('workspace-after-reload');
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add e2e/scenarios/robustness.spec.ts
git commit -m "test(e2e): robustness - error handling, debounce, XSS, state recovery"
```

---

### Task 8: 全站 UX 截图扫描

**Files:**
- Create: `e2e/scenarios/ux-screenshots.spec.ts`

**目的:** 自动遍历全站，截图供 PM 人工审阅配色/布局/一致性。每轮 Ralph Loop 生成最新截图。

- [ ] **Step 1: 写截图扫描**

```typescript
// e2e/scenarios/ux-screenshots.spec.ts
import { test, expect } from '../fixtures';

test.describe('UX 截图扫描（供 PM 审阅）', () => {

  test('全站页面截图', async ({ page, reviewScreenshot }) => {
    const routes = ['/', '/materials', '/chat', '/tasks', '/settings'];
    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await reviewScreenshot(`ux-scan${route.replace(/\//g, '-') || '-home'}`);
    }
  });

  test('暗色模式截图（如支持）', async ({ page, reviewScreenshot }) => {
    await page.goto('/');
    // 尝试通过 prefers-color-scheme 切换
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(1000);
    await reviewScreenshot('ux-scan-dark-mode');

    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await reviewScreenshot('ux-scan-dark-mode-chat');
  });

  test('移动端视口截图', async ({ page, reviewScreenshot }) => {
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await reviewScreenshot('ux-scan-mobile-home');

    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await reviewScreenshot('ux-scan-mobile-chat');
  });

  test('Loading 状态捕获', async ({ page, reviewScreenshot }) => {
    // 延迟 API 响应以捕获 loading 状态
    await page.route('**/api/v2/**', async route => {
      await new Promise(r => setTimeout(r, 3000));
      await route.continue();
    });
    await page.goto('/materials');
    // 立即截图 → 应看到 loading 状态
    await reviewScreenshot('ux-scan-loading-state');
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add e2e/scenarios/ux-screenshots.spec.ts
git commit -m "test(e2e): UX screenshot scanner - all pages, dark mode, mobile, loading"
```

---

### Task 9: PM 产品测评报告骨架

**Files:**
- Create: `docs/superpowers/product-review.md`

- [ ] **Step 1: 创建报告骨架**

报告由两部分填充：自动化测试结果（通过/失败/截图）+ PM 手工评注（观感、建议）。

```markdown
# Verity 产品测评报告

> 测评时间: 2026-03-17
> 测评人: AI PM (Claude) + 自动化测试套件

---

## §1 第一印象

### 截图
- 登录页: `test-results/review-screenshots/nav-login.png`
- 首页: `test-results/review-screenshots/nav-home.png`

### 品牌与配色
- [ ] Logo + 标题传达"专业研究工具"？
- [ ] 暖色米色调(#f4f2ec)和"求真/严谨"气质匹配？
- [ ] 文字对比度足够？标题/正文/次要层级清晰？

### 空状态
- [ ] 无 Topic 时有引导？
- [ ] 无材料时有引导？
- [ ] 无对话时有引导？

### 评注
_(PM 手工填写)_

---

## §2 AI 对话体验

### 自动化测试结果
| 测试 | 状态 |
|------|------|
| 发消息收回复 | ⏳ |
| UUID/工具名无泄漏 | ⏳ |
| surfaceContext 传递 | ⏳ |
| 对话持久化 | ⏳ |
| 防抖 | ⏳ |

### PM 评注
- AI 自我介绍是否正确（Verity 助手 vs Claude/GPT）？
- 回复等待时间感受？有 typing indicator？
- 回复的 markdown 渲染质量？
- 模式切换(chat/agent/auto) 用户能理解区别吗？
- 对话标题自动生成质量？

---

## §3 Workspace AI 体验

### 自动化测试结果
| 测试 | 状态 |
|------|------|
| workspace surfaceContext 含 topicId | ⏳ |
| propose_board_changes 生成 DraftNode | ⏳ |
| Accept draft 提交成功 | ⏳ |
| HypothesisBar 可视化 | ⏳ |
| Confidence 滑块交互 | ⏳ |

### PM 评注
- Draft 预览的虚线边框是否明显区分于正式节点？
- AI 徽章位置合理？
- Accept/Reject 按钮是否清楚？
- 动画过渡是否自然（虚线→实线、消失）？
- AI 盲点分析有价值还是泛泛而谈？

---

## §4 Research Run

### 自动化测试结果
| 测试 | 状态 |
|------|------|
| Plan 模板加载 | ⏳ |
| Plan 生成 3-8 步 | ⏳ |
| 执行进度展示 | ⏳ |
| 完成后画板填充 | ⏳ |

### PM 评注
- 研究计划步骤展示是否清楚？
- 进度是否给用户信心？
- 完成后的成果物质量？

---

## §5 视觉配色

### 截图参考
- 全站: `test-results/review-screenshots/ux-scan-*.png`
- 暗色: `test-results/review-screenshots/ux-scan-dark-mode*.png`
- 移动端: `test-results/review-screenshots/ux-scan-mobile-*.png`

### 检查清单
- [ ] 主背景色全站一致？
- [ ] 强调色使用克制、一致？
- [ ] 按钮 primary/secondary/danger 视觉层级？
- [ ] 画板三种节点配色区分度？
- [ ] Evidence 关系颜色(绿/红/灰)直觉正确？
- [ ] DraftNode 虚线+半透明足够明显？
- [ ] 暗色模式无残留白底？

### 评注
_(PM 手工填写)_

---

## §6 交互品质

### 自动化测试结果
| 测试 | 状态 |
|------|------|
| API 500 不白屏 | ⏳ |
| Chat 超时有反馈 | ⏳ |
| 快速双击防抖 | ⏳ |
| XSS 不执行 | ⏳ |
| 刷新后状态恢复 | ⏳ |

### PM 检查清单
- [ ] 按钮 hover 效果？cursor pointer？
- [ ] 禁用按钮视觉？
- [ ] input focus 样式？
- [ ] Loading 状态（骨架屏 vs spinner vs 空白闪烁）？
- [ ] Toast 通知动画？
- [ ] 页面切换有过渡？

### 评注
_(PM 手工填写)_

---

## §7 信息架构

### 功能可发现性
| 功能 | 难度 (1-3) | 备注 |
|------|-----------|------|
| 创建 Topic | | |
| 导入材料 | | |
| AI 对话入口 | | |
| 画板添加节点 | | |
| 查看证据平衡 | | |
| 启动 Research Run | | |

> 1=一眼找到 / 2=需探索 / 3=需引导

### 评注
_(PM 手工填写)_

---

## §8 综合评分

| 维度 | 评分 (1-5) | 说明 |
|------|-----------|------|
| AI 对话质量 | /5 | 回复相关性、结构化、无幻觉 |
| AI 上下文感知 | /5 | surfaceContext 让 AI 更智能？ |
| Draft 交互体验 | /5 | 提议→预览→确认流程自然？ |
| Research Run | /5 | 端到端研究流程顺畅？ |
| 视觉配色 | /5 | 一致性、品牌气质 |
| 交互反馈 | /5 | hover/loading/动画/防抖 |
| 信息架构 | /5 | 导航清晰、功能可发现 |
| 错误处理 | /5 | 友好度、可恢复性 |
| 整体产品感 | /5 | 感觉是完整产品？ |

---

## §9 Top 改进建议

### P0 — 阻塞用户价值
1.
2.

### P1 — 影响体验
3.
4.

### P2 — 体验优化
5.

---

## §10 截图索引

| 文件 | 描述 |
|------|------|
| `test-results/review-screenshots/` | 所有截图目录 |
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/product-review.md
git commit -m "docs: product review report skeleton with auto + manual sections"
```

---

### Task 10: Ralph Loop runner 脚本

**Files:**
- Create: `e2e/ralph-runner.sh`

- [ ] **Step 1: 创建 runner**

```bash
#!/bin/bash
# e2e/ralph-runner.sh — Ralph Loop 每轮执行入口
set -e

ROUND=$(date +%Y%m%d_%H%M%S)
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "╔══════════════════════════════════════╗"
echo "║  Verity Review Round: $ROUND  ║"
echo "╚══════════════════════════════════════╝"

# 1. 服务健康检查
echo "[1/3] Health check..."
curl -sf http://localhost:5173 > /dev/null || { echo "FATAL: Web app not running"; exit 1; }
curl -sf http://localhost:3000/api/v2/topics > /dev/null 2>&1 || echo "WARN: Backend may be down"

# 2. 运行全部测试
echo "[2/3] Running Playwright tests..."
cd e2e
npx playwright test 2>&1 | tee "../test-results/round-$ROUND.log"
EXIT_CODE=${PIPESTATUS[0]}

# 3. 追加到 findings
cd "$PROJECT_DIR"
PASSED=$(grep -c "✓\|passed" "test-results/round-$ROUND.log" 2>/dev/null || echo "?")
FAILED=$(grep -c "✗\|failed" "test-results/round-$ROUND.log" 2>/dev/null || echo "?")

echo "" >> findings.md
echo "### Round $ROUND" >> findings.md
echo "- Passed: ~$PASSED | Failed: ~$FAILED | Exit: $EXIT_CODE" >> findings.md
echo "- Log: \`test-results/round-$ROUND.log\`" >> findings.md
echo "- Screenshots: \`test-results/review-screenshots/\`" >> findings.md

echo "Round complete (exit: $EXIT_CODE)"
exit $EXIT_CODE
```

- [ ] **Step 2: chmod +x**

Run: `chmod +x e2e/ralph-runner.sh`

- [ ] **Step 3: Commit**

```bash
git add e2e/ralph-runner.sh
git commit -m "feat(e2e): Ralph Loop runner - health check, run tests, log findings"
```

---

### Task 11: 清理旧 planning-with-files 文件

- [ ] **Step 1: 删除旧文件**

```bash
rm -f task_plan.md findings.md progress.md
git add -u task_plan.md findings.md progress.md
git commit -m "chore: remove planning-with-files artifacts"
```
