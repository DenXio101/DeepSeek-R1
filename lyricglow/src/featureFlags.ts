/**
 * Build-time feature flags. Each is read once from the Vite environment; there is no
 * runtime override. With every flag off the app behaves exactly as before the flag existed.
 */

/** Key change through the SoundTouch worklet. Off unless the build sets VITE_FEATURE_KEY=1. */
export const KEY_ENABLED = import.meta.env.VITE_FEATURE_KEY === "1";
