import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authFile = path.join(__dirname, '.auth/user.json');

setup('login', async ({ page }) => {
  await page.goto('/login');
  // Wait for client-side auth check + possible redirect
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // If already logged in (redirected away from /login), just save state
  if (!page.url().includes('/login')) {
    await page.context().storageState({ path: authFile });
    return;
  }

  // Check if email input exists (login form rendered)
  const emailInput = page.locator('input[type="email"], input[name="email"]');
  if (!(await emailInput.isVisible({ timeout: 5000 }))) {
    // Page might still be redirecting — save state as-is
    await page.context().storageState({ path: authFile });
    return;
  }

  // Fill login form
  await emailInput.fill(process.env.TEST_EMAIL || 'test@verity.dev');
  await page.locator('input[type="password"], input[name="password"]').fill(
    process.env.TEST_PASSWORD || 'VerityTest2026'
  );
  await page.getByRole('button', { name: /登录|login|sign in/i }).click();
  await page.waitForURL('/', { timeout: 15_000 });
  await page.context().storageState({ path: authFile });
});
