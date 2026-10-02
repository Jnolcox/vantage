/**
 * HUD live place context.
 *
 * While the HUD is visible, every 15 s and after each camera move, "live"
 * context sends the view's location to Google (reverse geocoding and nearby
 * places) and the place labels to OpenAI for the summary line, when those
 * keys are configured. "Local" keeps the summary on-device. The choice is
 * remembered under `vantage.hud.liveContext`; live stays the default so the
 * HUD behaves as it always has until the viewer opts out.
 */

export const HUD_LIVE_CONTEXT_STORAGE_KEY = 'vantage.hud.liveContext';
export const HUD_CONTEXT_LIVE = 'live';
export const HUD_CONTEXT_LOCAL = 'local';

function browserStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** @param {Storage|null} [storage] */
export function createHudLiveContextSetting(storage = browserStorage()) {
  let mode = HUD_CONTEXT_LIVE;
  try {
    if (storage?.getItem(HUD_LIVE_CONTEXT_STORAGE_KEY) === HUD_CONTEXT_LOCAL)
      mode = HUD_CONTEXT_LOCAL;
  } catch {
    // Unreadable storage keeps the default.
  }
  return {
    get mode() {
      return mode;
    },
    isLive: () => mode === HUD_CONTEXT_LIVE,
    setMode(next) {
      mode = next === HUD_CONTEXT_LOCAL ? HUD_CONTEXT_LOCAL : HUD_CONTEXT_LIVE;
      try {
        storage?.setItem(HUD_LIVE_CONTEXT_STORAGE_KEY, mode);
      } catch {
        // The choice still holds for this page.
      }
      return mode;
    },
  };
}
