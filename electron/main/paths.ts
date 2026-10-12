import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** dist-electron/main at runtime (the bundled main process lives here). */
const MAIN_DIR = path.dirname(fileURLToPath(import.meta.url));

export const RENDERER_INDEX_PATH = path.join(MAIN_DIR, '../../dist/index.html');
export const PRELOAD_PATH = path.join(MAIN_DIR, '../preload/preload.cjs');

/** Set by vite-plugin-electron while `npm run dev` is running. */
export const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

