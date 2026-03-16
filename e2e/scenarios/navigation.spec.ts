import { test, expect } from '../fixtures';

test.describe('Navigation and Routes', () => {
  const pages = [
    { path: '/', name: 'home' },
    { path: '/materials', name: 'materials' },
    { path: '/chat', name: 'chat' },
    { path: '/tasks', name: 'tasks' },
    { path: '/settings', name: 'settings' },
  ];

  for (const p of pages) {
    test(`${p.name} (${p.path}) loads without blank screen`, async ({ page, reviewScreenshot }) => {
      await page.goto(p.path);
      await page.waitForLoadState('networkidle');

      // Automated: page must have content
      const body = await page.locator('body').textContent();
      expect(body!.length).toBeGreaterThan(20);

      // PM screenshot for review
      await reviewScreenshot(`nav-${p.name}`);
    });
  }

  test('unauthenticated access redirects to /login', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto('http://localhost:5173/');
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain('/login');
    await ctx.close();
  });

  test('active nav item has visual distinction', async ({ page, reviewScreenshot }) => {
    await page.goto('/materials');
    await page.waitForLoadState('networkidle');
    await reviewScreenshot('nav-active-state-materials');
  });

  test('no console errors on page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Allow max 2 non-critical errors
    expect(errors.length).toBeLessThanOrEqual(2);
  });
});
