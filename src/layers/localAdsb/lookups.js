/**
 * Whether Local ADS-B may look up aircraft heard by the user's own receiver.
 *
 * Lookups go to adsbdb through the same `/api/adsbdb` proxy as the public
 * Flights layer. Unlike public Flights, the set of ICAO addresses a local
 * receiver hears is bounded by its antenna's range, so the lookups hint at
 * where the receiver is. The preference is on by default (types drive class
 * icons and 3D models, and a selected aircraft's route needs its callsign),
 * kept per browser, and switching it off keeps every local aircraft on the
 * device.
 */

export const LOCAL_ADSB_LOOKUPS_STORAGE_KEY = 'vantage:local-adsb:lookups:v1';
const STORED_OFF = 'off';

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/**
 * @param {object} [options]
 * @param {Storage|null} [options.storage] Browser storage or a test double.
 * @returns {{isEnabled: () => boolean, setEnabled: (enabled: boolean) => void,
 *   subscribe: (listener: (enabled: boolean) => void) => () => void}}
 */
export function createLocalAdsbLookups({ storage = defaultStorage() } = {}) {
  let enabled = true;
  try {
    enabled = storage?.getItem?.(LOCAL_ADSB_LOOKUPS_STORAGE_KEY) !== STORED_OFF;
  } catch {
    enabled = true;
  }
  const listeners = new Set();
  return {
    isEnabled: () => enabled,
    setEnabled(next) {
      const value = Boolean(next);
      if (value === enabled) return;
      enabled = value;
      try {
        if (value) storage?.removeItem?.(LOCAL_ADSB_LOOKUPS_STORAGE_KEY);
        else storage?.setItem?.(LOCAL_ADSB_LOOKUPS_STORAGE_KEY, STORED_OFF);
      } catch {
        /* the choice still holds for this session */
      }
      for (const listener of listeners) listener(enabled);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
