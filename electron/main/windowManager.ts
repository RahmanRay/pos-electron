import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, Menu } from 'electron';
import { APP_CONFIG } from '@/config/app.config';
import { DEV_SERVER_URL, RENDERER_INDEX_PATH } from './paths';

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

function resolveWindowIcon(): string | undefined {
  // Packaged builds take the icon from the executable; use build/icon.png in development.
  if (app.isPackaged) return undefined;
  const iconPath = path.join(app.getAppPath(), 'build', 'icon.png');
  return fs.existsSync(iconPath) ? iconPath : undefined;
}

/**
 * Creates the secure main window. It stays hidden until the renderer is
 * ready, so nobody sees a blank or unstyled frame.
 */
export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: APP_CONFIG.window.width,
    height: APP_CONFIG.window.height,
    minWidth: APP_CONFIG.window.minWidth,
    minHeight: APP_CONFIG.window.minHeight,
    show: false,
    title: APP_CONFIG.name,
    backgroundColor: APP_CONFIG.window.backgroundDark,
    autoHideMenuBar: true,
    icon: resolveWindowIcon(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
      navigateOnDragDrop: false,
      devTools: !app.isPackaged,
    },
  });

  mainWindow = window;

  window.once('ready-to-show', () => {
    window.maximize();
    window.show();
  });

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  // Touch screens: prevent accidental pinch-zoom.
  void window.webContents.setVisualZoomLevelLimits(1, 1);

  // Developer tools (F12) only in unpackaged builds.
  window.webContents.on('before-input-event', (event, input) => {
    if (!app.isPackaged && input.type === 'keyDown' && input.key === 'F12') {
      window.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // A crashed renderer is reloaded (the demo keeps no state worth saving).
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error(`Renderer process gone: ${details.reason} (exit code ${details.exitCode})`);
    if (details.reason !== 'clean-exit' && !window.isDestroyed()) {
      void loadRenderer(window);
    }
  });

  return window;
}

export async function loadRenderer(window: BrowserWindow): Promise<void> {
  if (DEV_SERVER_URL) {
    await window.loadURL(DEV_SERVER_URL);
  } else {
    await window.loadFile(RENDERER_INDEX_PATH);
  }
}

export function focusMainWindow(): void {
  const window = getMainWindow();
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

/**
 * No application menu on Windows/Linux (prevents reload/devtools shortcuts in
 * production). macOS needs the standard app and Edit menus for Cmd+Q and
 * copy/paste inside text fields.
 */
export function setupApplicationMenu(): void {
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));
  } else {
    Menu.setApplicationMenu(null);
  }
}
