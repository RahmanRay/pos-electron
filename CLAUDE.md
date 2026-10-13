# CLAUDE.md — Restoran Kamera

Local RTSP camera occupancy monitor: Electron 44 + React 19 + TypeScript 6 (strict) + Vite 8 +
Tailwind CSS 4 + Zustand 5 + TensorFlow.js (WebGL). User docs: `README.md` (Azerbaijani).

- The UI language is **Azerbaijani only**: every string lives in `src/text.ts`. Dark theme only.
- Demo video/UI removed at the user's request. Never substitute demo/mock output for a real camera.
- Renderer network access and camera/mic permissions are denied. A fixed, sender-validated preload
  camera API routes RTSP decoding to FFmpeg in main. Never expose generic IPC, filesystem or spawn.
- Camera credentials use Electron safeStorage and a private settings file; never log credentials,
  RTSP credential URLs, FFmpeg arguments or raw FFmpeg diagnostics. No credentials in localStorage.
- Live history persists locally. Only decoded frames establish a live connection; an open port/401
  response and synthetic tests are not successful real-camera verification.
- Git: branch `main`, remote `origin` (own repository; the old POS history stays only in the local `pos-legacy` branch).

## Commands

```bash
npm run setup-model  # once: downloads the model into public/models/coco-ssd (gitignored, SHA-256 checked)
npm run dev          # Vite + Electron (browser: http://localhost:5173)
npm run verify       # typecheck (3 projects) + lint + unit tests + build — run before finishing
```

Use Node 22.12+ (on this machine: `~/.nvm/versions/node/v22.15.1/bin`; the default Node 20 breaks
Vitest/jsdom). VS Code terminals set `ELECTRON_RUN_AS_NODE=1`; unset it when launching Electron.

## Map of the code

```
electron/main/        lifecycle · windowManager · security · paths · liveCamera (FFmpeg, encrypted
                      settings, retry/watchdog) · liveCameraValidation · mjpegParser
electron/preload.ts   narrow cameraAPI, permanent frame ACK dispatcher
src/config/           app.config.ts — constants, camera thresholds and local model path
src/text.ts           all UI text (Azerbaijani)
src/utils/occupancy   pure tracker: zones, pass-by / occlusion / leave logic, restoration, timeline
src/utils/format      numbers (decimal comma), stopwatch, clock
src/services/cameraDetector  lazy TensorFlow.js COCO-SSD person detector (XHR fetch on file://)
src/store/cameraStore Zustand, observed clock and live history restoration
src/services/liveOccupancyStorage validated, bounded nonsecret live history
src/hooks/useLiveCamera bounded JPEG canvas drawing, inference, stale frame guards
src/components/camera LiveCameraPage · LiveCameraStage · OccupancyGauge · TableGrid · EventFeed
src/styles/           theme.css (colors as --c-* tokens) · index.css (Tailwind mapping)
scripts/setup-model.mjs model download (setup only)
```

## Rules

- Tracker times accumulate observed real seconds; disconnect/model failure/restart gaps freeze the
  timer. Restored status is unconfirmed until fresh detections. Source/zone changes reset tracking.
- All text from `TEXT` (`src/text.ts`); all colors are theme tokens (no raw Tailwind palette).
- `.tsx` files export components only (ESLint react-refresh); helpers go in `.ts`.
- Don't pass two competing classes (`hidden` + `inline-flex`): CSS order decides, not the class order.
- Layout must work from 360 px wide without horizontal scroll; from `lg` up it fits one screen.
- Security: keep `contextIsolation`, `sandbox`, `nodeIntegration: false`, request blocking and the CSP.
- New behaviour gets a unit test (`tests/utils/occupancy.test.ts` shows the pattern).
- Don't file this project's work to DevOS or any external tracker unless the user asks.
