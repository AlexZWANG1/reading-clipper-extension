import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './scenarios',
  fullyParallel: false,
  retries: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:5173',
    storageState: '.auth/user.json',
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testDir: '.', testMatch: /auth\.setup\.ts/, use: { storageState: undefined } },
    { name: 'tests', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
  ],
  reporter: [
    ['html', { open: 'never', outputFolder: '../test-results/html' }],
    ['json', { outputFile: '../test-results/results.json' }],
    ['list'],
  ],
  outputDir: '../test-results/artifacts',
});
