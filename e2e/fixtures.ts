import { test as base, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
