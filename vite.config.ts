import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import electron from 'vite-plugin-electron/simple';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

interface PackageJson {
  productName: string;
  version: string;
  description: string;
}

/**
 * package.json is the single source of truth for the application identity
 * (product name + version). The values are injected at build time into the
 * renderer, the Electron main process and index.html.
 */
const pkg = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf-8')) as PackageJson;

const appDefines = {
  __APP_NAME__: JSON.stringify(pkg.productName),
};

const alias = { '@': path.join(rootDir, 'src') };

/**
 * Production Content-Security-Policy. Everything is bundled locally, so no
 * remote origin is ever allowed. The dev server needs inline scripts for
 * React Fast Refresh, so the policy is injected into built HTML only (the
 * main process applies an equivalent header during development).
 */
const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function appHtml(): Plugin {
  return {
    name: 'restaurant-pos:html',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const withTitle = html.replaceAll('%APP_NAME%', pkg.productName);
        if (ctx.server) return withTitle;
        return withTitle.replace(
          '<meta charset="UTF-8" />',
          `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />`,
        );
      },
    },
  };
}

export default defineConfig(({ command }) => {
  const isServe = command === 'serve';

  return {
    base: './',
    resolve: { alias },
    define: appDefines,
    server: {
      port: 5173,
      strictPort: true,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 1500,
    },
    plugins: [
      react(),
      tailwindcss(),
      appHtml(),
      electron({
        main: {
          entry: 'electron/main/index.ts',
          // Keep the Chromium sandbox enabled in development (the plugin
          // defaults to --no-sandbox). Linux dev builds may lack a SUID
          // chrome-sandbox helper, so only relax it there.
          onstart: ({ startup }) => {
            void startup(process.platform === 'linux' ? ['.', '--no-sandbox'] : ['.']);
          },
          vite: {
            resolve: { alias },
            define: appDefines,
            build: {
              outDir: 'dist-electron/main',
              sourcemap: isServe,
              minify: !isServe,
            },
          },
        },
      }),
    ],
  };
});
