/**
 * One-time rename of browser storage written under the product's former name
 * (God's Eye View) into the Vantage namespace.
 *
 * Naming decision, made once for every internal identifier: each former prefix
 * maps to the full word `vantage`, never an abbreviation, so nobody has to
 * decode one.
 *   godsEyeView.<rest>   -> vantage.<rest>      (storage keys)
 *   gev:<rest>           -> vantage:<rest>      (storage keys, DOM events)
 *   gev-<rest>           -> vantage-<rest>      (storage keys, CSS, ids)
 *   window.__godsEyeView -> window.__vantage    (debug/QA globals; __gevX -> __vantageX)
 *   GEV_<NAME>           -> VANTAGE_<NAME>      (environment variables; the old
 *                                               names stay readable as deprecated
 *                                               fallbacks, server/providers/common/env.js)
 *   X-GEV-<Name>         -> X-Vantage-<Name>    (HTTP response headers)
 *
 * Every storage key the app has ever written under the old names, enumerated
 * from the code (no IndexedDB database or Cache Storage bucket was ever used,
 * so storage is the only browser-side state to carry over):
 *   localStorage
 *     godsEyeView.cockpitWeatherEffects.enabled
 *     godsEyeView.cctv.calibration.v1          (retired; nothing reads it)
 *     godsEyeView.cctv.calibration.v2
 *     godsEyeView.sceneProject.v2
 *     godsEyeView.sceneProject.checkpoint.v1
 *     godsEyeView.v6.panelCollapsed.<panel-id> (built per panel)
 *     godsEyeView.v6.panelPos.<panel-id>       (legacy layout, still detected)
 *     godsEyeView.v8.panelPos.<panel-id>       (built per panel)
 *     godsEyeView.v8.layoutResetNotified
 *     godsEyeView.voiceCost.tier
 *     godsEyeView.voiceCost.limits
 *     gev:layer-state:v2
 *     gev:first-run-mission:v1
 *     gev:detection-allocation:v1
 *     gev-realtime-errors
 *   sessionStorage
 *     gev:first-run-mission-session:v1
 *
 * The `godsEyeView.` family is matched by prefix because several of its keys
 * are built from a panel id at runtime, and the prefix belongs to this app
 * alone. The short `gev` keys are matched exactly: a dev origin such as
 * localhost:5173 is shared with other projects, whose keys must stay put.
 */

const LEGACY_KEY_PREFIX = 'godsEyeView.';
const KEY_PREFIX = 'vantage.';

const LEGACY_SHORT_KEYS = new Set([
  'gev:layer-state:v2',
  'gev:first-run-mission:v1',
  'gev:first-run-mission-session:v1',
  'gev:detection-allocation:v1',
  'gev-realtime-errors',
]);
const LEGACY_SHORT_PREFIX = 'gev';
const SHORT_PREFIX = 'vantage';

/**
 * The Vantage name for a key written under the former product name, or null
 * when the key is not one of ours.
 *
 * @param {string} key
 * @returns {string|null}
 */
export function renamedStorageKey(key) {
  if (typeof key !== 'string') return null;
  if (key.startsWith(LEGACY_KEY_PREFIX))
    return KEY_PREFIX + key.slice(LEGACY_KEY_PREFIX.length);
  if (LEGACY_SHORT_KEYS.has(key))
    return SHORT_PREFIX + key.slice(LEGACY_SHORT_PREFIX.length);
  return null;
}

/**
 * Move every legacy key in one Storage to its new name. A value already
 * stored under the new name wins and the legacy copy is dropped. A key whose
 * copy fails (quota, locked storage) is left in place for the next start.
 * Idempotent, and never throws.
 *
 * @param {Storage|null|undefined} storage
 * @returns {number} How many legacy keys were removed.
 */
export function migrateLegacyStorage(storage) {
  let migrated = 0;
  try {
    if (!storage) return migrated;
    const keys = [];
    for (let index = 0; index < storage.length; index += 1)
      keys.push(storage.key(index));
    for (const legacyKey of keys) {
      const key = renamedStorageKey(legacyKey);
      if (!key) continue;
      try {
        if (storage.getItem(key) === null)
          storage.setItem(key, storage.getItem(legacyKey));
        storage.removeItem(legacyKey);
        migrated += 1;
      } catch {
        // Leave the legacy key for the next start.
      }
    }
  } catch {
    // Storage unavailable or enumeration refused: nothing to migrate.
  }
  return migrated;
}

/**
 * Migrate both web storages of a window-like scope. Reading
 * `scope.localStorage` itself throws in some locked-down browsers, so each
 * accessor is guarded separately.
 *
 * @param {object} [scope]
 */
export function migrateLegacyBrowserStorage(scope = globalThis) {
  for (const name of ['localStorage', 'sessionStorage']) {
    let storage = null;
    try {
      storage = scope?.[name] ?? null;
    } catch {
      continue;
    }
    migrateLegacyStorage(storage);
  }
}
