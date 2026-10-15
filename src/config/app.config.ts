/* ==========================================================================
   GLOBAL APPLICATION CONFIGURATION
   --------------------------------------------------------------------------
   Central place for application-wide constants (renderer and Electron main).

   - Application name            → package.json ("productName")
   - Colors, fonts, radii        → src/styles/theme.css
   - Camera source and zones     → encrypted main-process settings
   - UI text (Azerbaijani)       → src/text.ts
   ========================================================================== */

export const APP_CONFIG = {
  /** From package.json → productName */
  name: __APP_NAME__,

  window: {
    width: 1366,
    height: 800,
    minWidth: 360,
    minHeight: 520,
    /** Background painted before the UI loads (matches theme.css bg). */
    backgroundDark: '#07090d',
  },

  /**
   * Live camera detection and occupancy settings. Times use wall-clock seconds.
   */
  camera: {
    /** Folder (next to index.html) filled by `npm run setup-model`. */
    assetDir: 'models/coco-ssd',
    /** Detection model (COCO-SSD, MobileNet v2) inside assetDir. */
    modelPath: 'model.json',
    /** Preview cadence is independent of the slower occupancy detector. */
    previewFps: 25,
    /** Preserve detail for table crops before each model input is resized. */
    snapshotMaxWidth: 1280,
    /** Maximum width of each full-frame / table-crop model input. */
    detectMaxWidth: 640,
    /** How often a frame is analysed (preview continues between passes). */
    detectIntervalMs: 333,
    /** Lowest detector score accepted as a person. */
    minScore: 0.3,
    /** Most boxes per frame. */
    maxDetections: 30,
    /** Someone must be seen this long (most of the time) before the table counts as occupied. */
    seatAfterSec: 1.5,
    /** Share of the frames in that window that must contain a person. */
    seatMinPresence: 0.6,
    /** An arriving person gone for this long was only passing by. */
    passByGapSec: 2,
    /** An occupied table becomes empty after nobody was seen for this long (covers short occlusion). */
    leaveAfterSec: 6,
    /** A slow or delayed single inference must not empty an occupied table. */
    leaveMinMisses: 3,
    /** Most events kept in the on-screen log. */
    maxEvents: 40,
  },
} as const;
