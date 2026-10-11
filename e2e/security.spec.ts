import { expect, test } from '@playwright/test';
import { createUserDataDir, launchApp, removeUserDataDir, type LaunchedApp } from './helpers';

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

test('main window uses a secure BrowserWindow configuration', async () => {
  const preferences = await launched.app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    // Runtime API that Electron's typings do not declare.
    const contents = window?.webContents as unknown as {
      getLastWebPreferences?: () => Record<string, unknown> | null;
    };
    const prefs = contents?.getLastWebPreferences?.();
    return {
      contextIsolation: prefs?.contextIsolation,
      nodeIntegration: prefs?.nodeIntegration,
      sandbox: prefs?.sandbox,
      webSecurity: prefs?.webSecurity,
    };
  });

  expect(preferences).toEqual({ contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true });
});

test('renderer cannot access Node.js or Electron internals', async () => {
  const exposure = await launched.window.evaluate(() => {
    const scope = globalThis as unknown as Record<string, unknown>;
    return {
      require: typeof scope.require,
      process: typeof scope.process,
      module: typeof scope.module,
      buffer: typeof scope.Buffer,
      ipcRenderer: 'ipcRenderer' in scope,
      electron: 'electron' in scope,
    };
  });

  expect(exposure).toEqual({
    require: 'undefined',
    process: 'undefined',
    module: 'undefined',
    buffer: 'undefined',
    ipcRenderer: false,
    electron: false,
  });
});

test('no privileged API is exposed to the page (no preload bridge)', async () => {
  const exposed = await launched.window.evaluate(() => 'electronAPI' in globalThis);
  expect(exposed).toBe(false);
});

test('camera and microphone permissions are denied (the demo only plays a local file)', async () => {
  const denied = await launched.window.evaluate(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      return false;
    } catch {
      return true;
    }
  });
  expect(denied).toBe(true);
});

test('remote network requests are blocked (offline-only application)', async () => {
  const blocked = await launched.window.evaluate(async () => {
    try {
      await fetch('https://example.com/');
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
});
