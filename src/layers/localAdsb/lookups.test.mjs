import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCAL_ADSB_LOOKUPS_STORAGE_KEY,
  createLocalAdsbLookups,
} from './lookups.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test('local aircraft lookups are on until the viewer switches them off', () => {
  assert.equal(
    createLocalAdsbLookups({ storage: memoryStorage() }).isEnabled(),
    true,
  );
});

test('switching lookups off is remembered in this browser', () => {
  const storage = memoryStorage();
  createLocalAdsbLookups({ storage }).setEnabled(false);
  assert.equal(storage.values.get(LOCAL_ADSB_LOOKUPS_STORAGE_KEY), 'off');
  assert.equal(createLocalAdsbLookups({ storage }).isEnabled(), false);
});

test('switching lookups back on clears the stored choice', () => {
  const storage = memoryStorage({ [LOCAL_ADSB_LOOKUPS_STORAGE_KEY]: 'off' });
  createLocalAdsbLookups({ storage }).setEnabled(true);
  assert.equal(storage.values.has(LOCAL_ADSB_LOOKUPS_STORAGE_KEY), false);
});

test('unavailable storage keeps lookups on for the session', () => {
  const throwing = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  const lookups = createLocalAdsbLookups({ storage: throwing });
  assert.equal(lookups.isEnabled(), true);
  lookups.setEnabled(false);
  assert.equal(lookups.isEnabled(), false);
});

test('subscribers hear each change once', () => {
  const lookups = createLocalAdsbLookups({ storage: memoryStorage() });
  const heard = [];
  const unsubscribe = lookups.subscribe((enabled) => heard.push(enabled));
  lookups.setEnabled(false);
  lookups.setEnabled(false);
  unsubscribe();
  lookups.setEnabled(true);
  assert.deepEqual(heard, [false]);
});
