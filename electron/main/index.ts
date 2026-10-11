import path from 'node:path';
import { app, BrowserWindow, dialog } from 'electron';
import { APP_CONFIG } from '@/config/app.config';
import { hardenSession, hardenWebContentsCreation } from './security';
import { createMainWindow, focusMainWindow, loadRenderer, setupApplicationMenu } from './windowManager';

/* ==========================================================================
   Application lifecycle: Electron starts → session hardened (no network,
   no permissions) → secure BrowserWindow → React camera page. The renderer
   needs no privileged API, so there is no preload bridge and no IPC.
   ========================================================================== */

/**
 * Chromium profile location (logs, localStorage). Development builds use a
 * separate folder; POS_USER_DATA_DIR overrides both (automated tests).
 */
function configureUserDataPath(): void {
  const override = process.env.POS_USER_DATA_DIR;
  if (override) {
    app.setPath('userData', path.resolve(override));
  } else if (!app.isPackaged) {
    app.setPath('userData', path.join(app.getPath('appData'), `${APP_CONFIG.name} Dev`));
  }
}

async function startApplication(): Promise<void> {
  hardenSession();
  setupApplicationMenu();
  const window = createMainWindow();
  await loadRenderer(window);
  console.info(`${APP_CONFIG.name} ${app.getVersion()} started`);
}

function reportFatalStartupError(error: unknown): void {
  console.error('Application failed to start', error);
  dialog.showErrorBox(
    `${APP_CONFIG.name}`,
    `The application could not start.\nTətbiq başladıla bilmədi.\n\n${error instanceof Error ? error.message : String(error)}`,
  );
  app.exit(1);
}

configureUserDataPath();
// Every renderer runs in the Chromium sandbox.
app.enableSandbox();

// One window is enough: a second launch focuses the running app.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', focusMainWindow);

  hardenWebContentsCreation();

  app
    .whenReady()
    .then(startApplication)
    .catch(reportFatalStartupError);

  app.on('activate', () => {
    // macOS: re-create the window when the dock icon is clicked.
    if (BrowserWindow.getAllWindows().length === 0) {
      const window = createMainWindow();
      loadRenderer(window).catch((error: unknown) => console.error('Failed to reload window', error));
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  process.on('uncaughtException', (error) => console.error('Uncaught exception in main process', error));
  process.on('unhandledRejection', (reason) => console.error('Unhandled rejection in main process', reason));
}
