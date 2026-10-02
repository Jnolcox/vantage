import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  migrateLegacyBrowserStorage,
  migrateLegacyStorage,
  renamedStorageKey,
} from './storageMigration.js';
import { CCTV_CALIBRATION_STORAGE_KEY_V2 } from './layers/cctv/policy.js';
import { LAYER_STATE_STORAGE_KEY } from './data/layerState.js';
import {
  FIRST_RUN_SESSION_KEY,
  FIRST_RUN_STORAGE_KEY,
} from './firstRunExperience.js';
import { ERROR_STORAGE_KEY } from './voice/realtimeDiagnostics.js';
import {
  VOICE_LIMITS_STORAGE_KEY,
  VOICE_TIER_STORAGE_KEY,
} from './voice/realtimePreferences.js';

/** Minimal Web Storage stand-in backed by a Map. */
function memoryStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

test('a legacy key moves to its Vantage name and the old key is removed', () => {
  const storage = memoryStorage({
    'godsEyeView.sceneProject.v2': '{"version":6}',
    'gev:layer-state:v2': '{"layers":[]}',
  });

  migrateLegacyStorage(storage);

  assert.deepEqual(storage.dump(), {
    'vantage.sceneProject.v2': '{"version":6}',
    'vantage:layer-state:v2': '{"layers":[]}',
  });
});

test('panel keys built from a panel id at runtime are migrated by prefix', () => {
  const storage = memoryStorage({
    'godsEyeView.v6.panelCollapsed.cctv-panel': '0',
    'godsEyeView.v8.panelPos.pp-toggles': '{"top":10}',
  });

  migrateLegacyStorage(storage);

  assert.deepEqual(storage.dump(), {
    'vantage.v6.panelCollapsed.cctv-panel': '0',
    'vantage.v8.panelPos.pp-toggles': '{"top":10}',
  });
});

test('a value already stored under the new name is not overwritten', () => {
  const storage = memoryStorage({
    'godsEyeView.voiceCost.tier': 'mini',
    'vantage.voiceCost.tier': 'standard',
  });

  migrateLegacyStorage(storage);

  assert.deepEqual(storage.dump(), { 'vantage.voiceCost.tier': 'standard' });
});

test('running the migration twice changes nothing the second time', () => {
  const storage = memoryStorage({ 'gev-realtime-errors': '[]' });

  assert.equal(migrateLegacyStorage(storage), 1);
  const afterFirstRun = storage.dump();
  assert.equal(migrateLegacyStorage(storage), 0);

  assert.deepEqual(storage.dump(), afterFirstRun);
});

test('keys that belong to other apps on a shared origin are left alone', () => {
  const storage = memoryStorage({
    'gev:someone-else': '1',
    'gevent-cache': '2',
    theme: 'dark',
  });

  migrateLegacyStorage(storage);

  assert.deepEqual(storage.dump(), {
    'gev:someone-else': '1',
    'gevent-cache': '2',
    theme: 'dark',
  });
});

test('a storage that throws on access is survived without throwing', () => {
  const throwing = {
    get length() {
      throw new Error('SecurityError');
    },
  };

  assert.doesNotThrow(() => migrateLegacyStorage(throwing));
  assert.equal(migrateLegacyStorage(throwing), 0);
});

test('a failed copy keeps the legacy key for the next start', () => {
  const storage = memoryStorage({ 'gev:detection-allocation:v1': 'ELASTIC' });
  storage.setItem = () => {
    throw new Error('QuotaExceededError');
  };

  migrateLegacyStorage(storage);

  assert.deepEqual(storage.dump(), {
    'gev:detection-allocation:v1': 'ELASTIC',
  });
});

test('a scope whose storage accessor throws still migrates the other storage', () => {
  const sessionStorage = memoryStorage({
    'gev:first-run-mission-session:v1': 'dismissed',
  });
  const scope = {
    get localStorage() {
      throw new Error('SecurityError');
    },
    sessionStorage,
  };

  assert.doesNotThrow(() => migrateLegacyBrowserStorage(scope));
  assert.deepEqual(sessionStorage.dump(), {
    'vantage:first-run-mission-session:v1': 'dismissed',
  });
});

test('every legacy key maps to the key the code now reads', () => {
  const pairs = [
    ['godsEyeView.cctv.calibration.v2', CCTV_CALIBRATION_STORAGE_KEY_V2],
    ['gev:layer-state:v2', LAYER_STATE_STORAGE_KEY],
    ['gev:first-run-mission:v1', FIRST_RUN_STORAGE_KEY],
    ['gev:first-run-mission-session:v1', FIRST_RUN_SESSION_KEY],
    ['gev-realtime-errors', ERROR_STORAGE_KEY],
    ['godsEyeView.voiceCost.tier', VOICE_TIER_STORAGE_KEY],
    ['godsEyeView.voiceCost.limits', VOICE_LIMITS_STORAGE_KEY],
  ];

  for (const [legacyKey, currentKey] of pairs)
    assert.equal(renamedStorageKey(legacyKey), currentKey, legacyKey);
});

test('the application entry imports the storage migration before any other module', () => {
  const entry = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
  const firstImport = entry.match(/^import\s+[^;]*?['"]([^'"]+)['"];?$/m);

  assert.equal(firstImport?.[1], './standalone/legacyStorage.js');
});
