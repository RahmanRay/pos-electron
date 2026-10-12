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

test('only the fixed camera bridge is exposed, without generic IPC or filesystem access', async () => {
  const exposed = await launched.window.evaluate(() => ({
    legacyBridge: 'electronAPI' in globalThis,
    cameraMethods: Object.keys(window.cameraAPI ?? {}).sort(),
  }));
  expect(exposed).toEqual({
    legacyBridge: false,
    cameraMethods: ['connect', 'disconnect', 'getSettings', 'getStatus', 'onFrame', 'onStatus', 'saveSettings'],
  });
});

test('browser device permissions are denied (RTSP decoding belongs to main)', async () => {
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

test('renderer network requests are blocked (RTSP networking belongs to main)', async () => {
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
