import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Unit/integration tests run without the Electron plugin so that no Electron
// process is spawned. The renderer falls back to its browser storage adapter.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.join(rootDir, 'src') },
  },
  define: {
    __APP_NAME__: JSON.stringify('Restoran Kamera'),
  },
  test: {
    environment: 'jsdom',
    // Worker threads start reliably on Windows (child-process forks can time out).
    pool: 'threads',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
  },
});
