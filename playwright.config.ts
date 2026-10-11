import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests drive the real Electron application (built with
 * `vite build`). Each test launches the app with its own temporary profile folder.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
});
