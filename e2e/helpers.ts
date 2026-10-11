import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface LaunchedApp {
  app: ElectronApplication;
  window: Page;
}

export function createUserDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'restaurant-camera-e2e-'));
}

export function removeUserDataDir(directory: string): void {
  fs.rmSync(directory, { recursive: true, force: true });
}

/** Launches the built app with an isolated profile folder. */
export async function launchApp(userDataDir: string): Promise<LaunchedApp> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'VITE_DEV_SERVER_URL') env[key] = value;
  }
  env.POS_USER_DATA_DIR = userDataDir;

  const app = await electron.launch({ args: ['.'], cwd: projectRoot, env });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  return { app, window };
}
