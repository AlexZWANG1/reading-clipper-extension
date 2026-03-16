import { test as setup } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authFile = path.join(__dirname, '.auth/user.json');

setup('login', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.TEST_EMAIL || 'test@example.com');
  await page.getByLabel('Password').fill(process.env.TEST_PASSWORD || 'test123456');
  await page.getByRole('button', { name: /登录|login|sign in/i }).click();
  await page.waitForURL('/', { timeout: 15_000 });
  await page.context().storageState({ path: authFile });
});
