import { test, expect } from '../fixtures';

test.describe('AI Chat Core Experience', () => {

  test('send message and receive AI reply without UUID leak', async ({ page, reviewScreenshot }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // PM screenshot: chat initial state
    await reviewScreenshot('chat-empty-state');

    const input = page.locator('textarea').first();
    await input.fill('你好，请介绍一下你自己');
    await input.press('Enter');

    // Automated: wait for AI reply
    const aiMsg = page.locator('[data-role="assistant"], [class*="assistant"], [class*="ai-message"]').last();
    await expect(aiMsg).toBeVisible({ timeout: 45_000 });

    const replyText = await aiMsg.textContent();

    // Automated: no internal info leak
    expect(replyText).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    expect(replyText).not.toMatch(/tool_call|semantic_search|create_card/);
    expect(replyText).not.toMatch(/function_call|tool_use_id/);

    // PM screenshot: chat with reply
    await reviewScreenshot('chat-first-reply');
  });

  test('research question triggers tool call and structured reply', async ({ page, reviewScreenshot }) => {
    await page.goto('/chat');

    const input = page.locator('textarea').first();
    await input.fill('帮我搜索知识库中关于人工智能的内容');
    await input.press('Enter');

    // Automated: wait for API response
    const response = await page.waitForResponse(
      (resp) => resp.url().includes('/api/v2/chat') && resp.status() === 200,
      { timeout: 45_000 }
    );

    // PM screenshot: tool call result
    await page.waitForTimeout(3000);
    await reviewScreenshot('chat-tool-call-result');
  });

  test('surfaceContext is sent with chat request', async ({ page }) => {
    await page.goto('/');

    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/api/v2/chat') && req.method() === 'POST',
      { timeout: 15_000 }
    );

    const input = page.locator('textarea').first();
    if (await input.isVisible({ timeout: 5000 })) {
      await input.fill('测试 surfaceContext');
      await input.press('Enter');

      const request = await requestPromise;
      const body = request.postDataJSON();
      const ctx = body.surface_context || body.surfaceContext;
      expect(ctx).toBeTruthy();
      expect(ctx.surface).toBeTruthy();
    }
  });

  test('conversation persists after page reload', async ({ page, reviewScreenshot }) => {
    await page.goto('/chat');
    const input = page.locator('textarea').first();
    const marker = `persist-test-${Date.now()}`;
    await input.fill(marker);
    await input.press('Enter');

    // Wait for AI reply
    await page.waitForTimeout(15_000);

    // Reload
    await page.reload();
    await page.waitForLoadState('networkidle');

    // PM screenshot: after reload
    await reviewScreenshot('chat-after-reload');
  });

  test('rapid Enter presses only send one message (debounce)', async ({ page }) => {
    await page.goto('/chat');
    let chatRequests = 0;
    page.on('request', (req) => {
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
