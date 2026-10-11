# CLAUDE.md — Restoran Kamera

Offline camera occupancy **demo**: Electron 44 + React 19 + TypeScript 6 (strict) + Vite 8 +
Tailwind CSS 4 + Zustand 5 + TensorFlow.js (WebGL). User docs: `README.md` (Azerbaijani).

- The UI language is **Azerbaijani only**: every string lives in `src/text.ts`. Dark theme only.
- A local stock video is played as a simulated live camera; the UI must always say **DEMO** and
  show the source type. Never present demo output as a real camera.
- No network at runtime, no stored data, no IPC/preload. Camera/mic permissions are denied.
- Git: branch `main`, remote `origin` (own repository; the old POS history stays only in the local `pos-legacy` branch).

## Commands

```bash
npm run camera-demo  # once: downloads the clip + model into public/demo/camera (gitignored, SHA-256 checked)
npm run dev          # Vite + Electron (browser: http://localhost:5173)
npm run verify       # typecheck (3 projects) + lint + unit tests + build — run before finishing
npm run test:e2e     # builds, then Playwright drives the real Electron app (camera + security)
```

Use Node 22.12+ (on this machine: `~/.nvm/versions/node/v22.15.1/bin`; the default Node 20 breaks
Vitest/jsdom). VS Code terminals set `ELECTRON_RUN_AS_NODE=1`; unset it for dev/e2e.

## Map of the code

```
electron/main/        index (lifecycle) · windowManager · security (CSP in dev, request blocking,
                      permission denial, navigation/popup blocking) · paths
src/config/           app.config.ts — all constants, incl. camera thresholds and playbackRate
src/text.ts           all UI text (Azerbaijani)
src/data/cameraDemo   demo source info + table zones (traced on the 1280×720 clip)
src/utils/occupancy   pure tracker: zones, pass-by / occlusion / leave logic, loop restart, timeline
src/utils/format      numbers (decimal comma), stopwatch, clock
src/services/cameraDetector  lazy TensorFlow.js COCO-SSD person detector (XHR fetch on file://)
src/store/cameraStore Zustand, memory only
src/hooks/useCameraDemo  video loop at playbackRate, detection loop, stall watchdog, test controls
src/components/camera CameraPage · CameraStage (video + SVG zones + HUD) · Timeline (time, controls,
                      history) · OccupancyGauge · TableGrid · EventFeed · SourceCard · visuals.ts
src/styles/           theme.css (colors as --c-* tokens) · index.css (Tailwind mapping)
scripts/camera-demo.mjs  asset download (dev only)
```

## Rules

- Times in the tracker are **media time** (video seconds). The wall clock is only for the stall watchdog.
- All text from `TEXT` (`src/text.ts`); all colors are theme tokens (no raw Tailwind palette).
- `.tsx` files export components only (ESLint react-refresh); helpers go in `.ts`.
- Don't pass two competing classes (`hidden` + `inline-flex`): CSS order decides, not the class order.
- Layout must work from 360 px wide without horizontal scroll; from `lg` up it fits one screen.
- Security: keep `contextIsolation`, `sandbox`, `nodeIntegration: false`, request blocking and the CSP.
- New behaviour gets a unit test (`tests/utils/occupancy.test.ts` shows the pattern).
- Don't file this project's work to DevOS or any external tracker unless the user asks.
