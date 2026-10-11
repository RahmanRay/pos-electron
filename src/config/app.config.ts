/* ==========================================================================
   GLOBAL APPLICATION CONFIGURATION
   --------------------------------------------------------------------------
   Central place for application-wide constants (renderer and Electron main).

   - Application name            → package.json ("productName")
   - Colors, fonts, radii        → src/styles/theme.css
   - Demo video source and zones → src/data/cameraDemo.ts
   - UI text (Azerbaijani)       → src/text.ts
   ========================================================================== */

export const APP_CONFIG = {
  /** From package.json → productName */
  name: __APP_NAME__,

  /** Intl locale for numbers. */
  locale: 'az-AZ',

  window: {
    width: 1366,
    height: 800,
    minWidth: 360,
    minHeight: 520,
    /** Background painted before the UI loads (matches theme.css bg). */
    backgroundDark: '#07090d',
  },

  /**
   * Camera occupancy demo. Times are in seconds of video ("media time"); the
   * demo clip is a time-lapse, so they are short.
   */
  camera: {
    /** Folder (next to index.html) filled by `node scripts/camera-demo.mjs`. */
    assetDir: 'demo/camera',
    /** Detection model (COCO-SSD, MobileNet v2) inside assetDir. */
    modelPath: 'model/model.json',
    /**
     * Playback speed of the demo clip. The source is a time-lapse, so it is
     * slowed down to look closer to a live camera. Timers count video seconds.
     */
    playbackRate: 0.5,
    /** How often a frame is analysed. */
    detectIntervalMs: 250,
    /** Lowest detector score accepted as a person. */
    minScore: 0.3,
    /** Most boxes per frame. */
    maxDetections: 30,
    /** Someone must be seen this long (most of the time) before the table counts as occupied. */
    seatAfterSec: 1.5,
    /** Share of the frames in that window that must contain a person. */
    seatMinPresence: 0.6,
    /** An arriving person gone for this long was only passing by. */
    passByGapSec: 0.6,
    /** An occupied table becomes empty after nobody was seen for this long (covers short occlusion). */
    leaveAfterSec: 2,
    /** The feed counts as stalled when the picture has not moved for this long (wall clock). */
    stallAfterMs: 2000,
    /** Most events kept in the on-screen log. */
    maxEvents: 40,
  },
} as const;
