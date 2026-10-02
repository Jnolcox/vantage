import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import {
  HUD_LIVE_CONTEXT_STORAGE_KEY,
  createHudLiveContextSetting,
} from './hudLiveContext.js';

// hud.js imports `mgrs`, a CommonJS package whose named exports Node's ESM
// loader cannot see; swap that one specifier for a stub (as
// hudAltitudeDatum.test.mjs does).
const MGRS_STUB_URL = 'vantage-test-stub:mgrs-live-context';
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'mgrs') return { url: MGRS_STUB_URL, shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === MGRS_STUB_URL)
      return {
        format: 'module',
        shortCircuit: true,
        source:
          'export function forward() { return ""; }\nexport default { forward };\n',
      };
    return next(url, context);
  },
});
const { IntelHUD } = await import('./hud.js');

function memoryStorage(values = {}) {
  const map = new Map(Object.entries(values));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

/** The slice of HUD state `_updateSummary` reads, with recording fakes. */
function summaryHarness(liveContext) {
  const calls = { context: 0, summarize: 0, text: [] };
  const hud = {
    liveContext,
    summaryPolicy: {},
    _latestMetrics: { altM: 100 },
    _summaryDirty: true,
    _summaryRevision: 0,
    _composeSummary: () => 'LOCAL LINE',
    _setSummaryText: (text) => calls.text.push(text),
    _summaryContext: async () => {
      calls.context += 1;
      return { placeLabels: ['Somewhere'] };
    },
    summaryService: {
      summarize: async () => {
        calls.summarize += 1;
        return { ok: true, status: 200, data: { summary: 'AI LINE' } };
      },
    },
  };
  return { hud, calls };
}

test('live context is the default and survives a reload', () => {
  const storage = memoryStorage();
  const setting = createHudLiveContextSetting(storage);
  assert.equal(setting.isLive(), true);
  setting.setMode('local');
  assert.equal(storage.map.get(HUD_LIVE_CONTEXT_STORAGE_KEY), 'local');
  assert.equal(createHudLiveContextSetting(storage).isLive(), false);
  setting.setMode('anything else');
  assert.equal(setting.mode, 'live');
});

test('unreadable storage keeps live context without throwing', () => {
  const blocked = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  const setting = createHudLiveContextSetting(blocked);
  assert.equal(setting.isLive(), true);
  assert.equal(setting.setMode('local'), 'local');
  assert.equal(setting.isLive(), false);
});

test('local mode makes no place lookup and no AI request', async () => {
  const { hud, calls } = summaryHarness(
    createHudLiveContextSetting(
      memoryStorage({ [HUD_LIVE_CONTEXT_STORAGE_KEY]: 'local' }),
    ),
  );
  await IntelHUD.prototype._updateSummary.call(hud, false, true);
  assert.equal(calls.context, 0, 'no Google reverse geocode or nearby places');
  assert.equal(calls.summarize, 0, 'no OpenAI summary');
  assert.deepEqual(calls.text, ['LOCAL LINE']);
});

test('live mode keeps the AI summary', async () => {
  const { hud, calls } = summaryHarness(
    createHudLiveContextSetting(memoryStorage()),
  );
  globalThis.window ??= globalThis;
  await IntelHUD.prototype._updateSummary.call(hud, false, true);
  assert.equal(calls.context, 1);
  assert.equal(calls.summarize, 1);
  assert.equal(calls.text.at(-1), 'AI LINE');
});
