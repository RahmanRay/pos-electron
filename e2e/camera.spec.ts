import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createUserDataDir, launchApp, removeUserDataDir, type LaunchedApp } from './helpers';

const assetsPresent = fs.existsSync(path.join(process.cwd(), 'dist', 'demo', 'camera', 'model', 'model.json'));

let userDataDir: string;
let launched: LaunchedApp;

test.beforeAll(async () => {
  userDataDir = createUserDataDir();
  launched = await launchApp(userDataDir);
});

test.afterAll(async () => {
  await launched?.app.close();
  removeUserDataDir(userDataDir);
});

test('the camera page is clearly marked as a demo with its source type', async () => {
  const page = launched.window;
  await expect(page.getByRole('banner').getByText('DEMO', { exact: true })).toBeVisible();
  await expect(page.getByText('Lokal video · time-lapse')).toBeVisible();
  await expect(page.getByTestId('camera-source')).toContainText('mixkit.co');
});

test('the packaged app plays the local clip and detects people in table zones', async () => {
  test.skip(!assetsPresent, 'run `npm run camera-demo` before `npm run build`');
  const page = launched.window;
  await expect(page.getByTestId('camera-feed')).toHaveText('Canlı (simulyasiya)', { timeout: 15_000 });
  // The clip is slowed down, never sped up.
  expect(await page.getByTestId('camera-video').evaluate((video: HTMLVideoElement) => video.playbackRate)).toBe(0.5);
  // The detector loads from local files (file:// in the packaged app) and starts producing frames.
  await expect(page.getByText(/^\d[\d ]* ms$/)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid=camera-zones] li[data-status=occupied]').first()).toBeVisible({ timeout: 30_000 });
});

test('a frozen feed is reported as stalled and recovers', async () => {
  test.skip(!assetsPresent, 'run `npm run camera-demo` before `npm run build`');
  const page = launched.window;
  await page.getByRole('button', { name: 'Axını dondur (test)' }).click();
  await expect(page.getByTestId('camera-feed')).toHaveText('Axın dayanıb', { timeout: 5_000 });
  await page.getByRole('button', { name: 'Testi bitir' }).click();
  await expect(page.getByTestId('camera-feed')).toHaveText('Canlı (simulyasiya)', { timeout: 5_000 });
});
