/**
 * AI Camera Proctoring Configuration & Thresholds.
 * All timing, angle, and sensitivity thresholds are consolidated here.
 */

// Global feature flag: when false, the "With camera" option is hidden.
const rawEnvVal =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_CAMERA_PROCTORING_ENABLED) ||
  (typeof process !== 'undefined' && process.env && (process.env.VITE_CAMERA_PROCTORING_ENABLED || process.env.CAMERA_PROCTORING_ENABLED));

export const CAMERA_PROCTORING_ENABLED = rawEnvVal !== 'false' && rawEnvVal !== false;

export const PROCTORING_CONFIG = {
  // Maximum violations before exam is automatically submitted
  MAX_VIOLATIONS: 5,

  // Initial grace period (in ms) when the exam starts.
  // No violations are recorded during this window while the student settles in.
  GRACE_PERIOD_MS: 8000,

  // Sustained duration required before a violation is flagged (in ms).
  // Momentary blinks, head twitches, or glances (< threshold) are ignored.
  SUSTAINED_NO_FACE_MS: 3000,
  SUSTAINED_MULTIPLE_FACES_MS: 2000,
  SUSTAINED_LOOKING_AWAY_MS: 3500,
  SUSTAINED_COVERED_LENS_MS: 3000,

  // Cooldown period (in ms) after a violation is recorded.
  // Prevents multiple rapid-fire violations for the same continuous incident.
  COOLDOWN_MS: 5000,

  // Hysteresis margin to prevent oscillation at boundary values (0.0 - 1.0)
  HYSTERESIS_MARGIN: 0.1,

  // Head pose limits (in degrees, or normalized ratio if degrees unavailable)
  YAW_THRESHOLD_DEG: 28,        // Horizontal head rotation (left/right)
  PITCH_UP_THRESHOLD_DEG: 22,   // Vertical head rotation (up)
  PITCH_DOWN_THRESHOLD_DEG: 25, // Vertical head rotation (down)

  // Covered lens / occlusion detection (0-255 grayscale scale)
  MIN_FRAME_BRIGHTNESS: 15,     // Lens covered / dark frame threshold
  MAX_FRAME_BRIGHTNESS: 248,    // Overexposed / washed out frame
  MIN_FRAME_VARIANCE: 4.5,      // Plain uniform texture (e.g. paper or finger over lens)

  // Snapshot limits (Supabase storage quota fallback: stored directly in row/attempt)
  SNAPSHOT_MAX_SIZE_KB: 20,
  SNAPSHOT_WIDTH: 320,
  SNAPSHOT_HEIGHT: 240,
  SNAPSHOT_QUALITY: 0.45,

  // Detection polling interval (in ms)
  FRAME_INTERVAL_MS: 500,
};

export default PROCTORING_CONFIG;
