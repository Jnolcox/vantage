// DelDOT live video cameras: the keyless tmc.deldot.gov catalog becomes HLS
// sources pinned to video.deldot.gov, and the pack can be switched off.
//
// Run with: npm test   (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadDelDOTSourcesFromOpenData } from '../../server/providers/cctv/sources.js';
import {
  CCTV_USER_AGENT,
  DELDOT_CCTV_URL,
} from '../../server/providers/cctv/constants.js';
import { createCctvCatalog } from '../../server/providers/cctv/catalog.js';

/** One DelDOT catalog row, shaped like the live videocamera.json payload. */
const row = (overrides = {}) => ({
  id: 'CCTV-K-001',
  title: 'DE 1 SB @ Main Toll Plaza',
  status: 'Active',
  county: 'Kent',
  lat: 39.1582,
  lon: -75.5244,
  urls: { m3u8s: 'https://video.deldot.gov/live/K001.stream/playlist.m3u8' },
  ...overrides,
});

/** Serve `rows` as the DelDOT catalog and record each request. */
const serveCatalog = (t, rows) => {
  const requests = [];
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    requests.push({ url: String(url), init });
    return Response.json({ videoCameras: rows });
  });
  return requests;
};

test('an active DelDOT camera becomes an HLS source on the official video host', async (t) => {
  serveCatalog(t, [row()]);
  const [source] = await loadDelDOTSourcesFromOpenData();
  assert.equal(source.id, 'deldot-cctv-k-001');
  assert.equal(source.name, 'DE 1 SB @ Main Toll Plaza');
  assert.equal(source.provider, 'DelDOT');
  assert.equal(source.city, 'Kent County');
  assert.equal(source.cityId, 'deldot-kent');
  assert.equal(source.feedType, 'hls');
  assert.equal(
    source.url,
    'https://video.deldot.gov/live/K001.stream/playlist.m3u8',
  );
  assert.equal(source.snapshotUrl, '');
});

test('a travel direction in the title gives a high-confidence heading', async (t) => {
  serveCatalog(t, [row(), row({ id: 'N2', title: 'W NORTH ST' })]);
  const [southbound, street] = await loadDelDOTSourcesFromOpenData();
  assert.equal(southbound.headingDeg, 180);
  assert.equal(southbound.headingConfidence, 'high');
  assert.equal(street.headingConfidence, 'low');
});

test('inactive, out-of-state and malformed rows are dropped', async (t) => {
  serveCatalog(t, [
    row({ id: 'inactive', status: 'Inactive' }),
    row({ id: 'outside', lat: 40.7, lon: -74.0 }),
    row({ id: 'nocoords', lat: null }),
    row({ id: 'bad id!' }),
    row({ id: '' }),
  ]);
  assert.deepEqual(await loadDelDOTSourcesFromOpenData(), []);
});

test('stream links off the official host, path or scheme are refused', async (t) => {
  serveCatalog(
    t,
    [
      'https://evil.example/live/K001.stream/playlist.m3u8',
      'http://video.deldot.gov/live/K001.stream/playlist.m3u8',
      'https://user:pass@video.deldot.gov/live/K001.stream/playlist.m3u8',
      'https://video.deldot.gov/vod/K001.stream/playlist.m3u8',
      'rtmp://video.deldot.gov/live/K001.stream',
      '',
    ].map((m3u8s, index) => row({ id: `S${index}`, urls: { m3u8s } })),
  );
  assert.deepEqual(await loadDelDOTSourcesFromOpenData(), []);
});

test('the catalog request sends the Vantage CCTV User-Agent and refuses redirects', async (t) => {
  const requests = serveCatalog(t, [row()]);
  await loadDelDOTSourcesFromOpenData();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, DELDOT_CCTV_URL);
  assert.equal(requests[0].init.headers['User-Agent'], CCTV_USER_AGENT);
  assert.equal(requests[0].init.redirect, 'error');
});

test('an upstream failure yields no cameras instead of throwing', async (t) => {
  t.mock.method(console, 'warn', () => {});
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('', { status: 503 }),
  );
  assert.deepEqual(await loadDelDOTSourcesFromOpenData(), []);
});

/** Run one catalog refresh with every live pack answered by the DelDOT mock. */
const refreshCatalog = async (t) => {
  const requests = serveCatalog(t, [row()]);
  const sources = await createCctvCatalog({ sourceRoot: '/nonexistent' })();
  return { requested: requests.map(({ url }) => url), sources };
};

/** Run `fn` with the CCTV source env cleared, restoring it afterwards. */
const withCctvEnv = async (patch, fn) => {
  const saved = { ...process.env };
  try {
    delete process.env.CCTV_SOURCES_FILE;
    delete process.env.CCTV_SOURCES_JSON;
    delete process.env.VANTAGE_CCTV_DELDOT_ENABLED;
    Object.assign(process.env, patch);
    await fn();
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) delete process.env[key];
    }
    Object.assign(process.env, saved);
  }
};

test('the DelDOT pack loads by default', async (t) => {
  await withCctvEnv({}, async () => {
    const { requested, sources } = await refreshCatalog(t);
    assert.ok(requested.includes(DELDOT_CCTV_URL));
    assert.ok(sources.some((source) => source.id === 'deldot-cctv-k-001'));
  });
});

test('VANTAGE_CCTV_DELDOT_ENABLED=0 keeps the pack from reaching its upstream', async (t) => {
  await withCctvEnv({ VANTAGE_CCTV_DELDOT_ENABLED: '0' }, async () => {
    const { requested, sources } = await refreshCatalog(t);
    assert.equal(requested.includes(DELDOT_CCTV_URL), false);
    assert.equal(
      sources.some((source) => source.provider === 'DelDOT'),
      false,
    );
  });
});
