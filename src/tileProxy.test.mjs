// TILE PROXY — the only way vector tiles reach the browser.
//
// The browser asks /api/tiles/<upstream>/<path>; the server forwards only
// allow-listed paths to their one host, identifies itself, bounds size and
// time, caches in memory and on disk, and rewrites TileJSON so the page never
// learns a third-party tile address. These cases use no live providers.
//
// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  TILE_PROXY_MAX_TILE_BYTES,
  resolveTileProxyPath,
  rewriteTileJson,
  tileProxy,
} from '../server/providers/tiles.js';
import { clientUserAgent } from './sources/projectIdentity.js';

const OFM_TILE = '/openfreemap/planet/20260927_080001_pt/12/935/1686.pbf';
const OFM_TILE_URL =
  'https://tiles.openfreemap.org/planet/20260927_080001_pt/12/935/1686.pbf';

async function cacheDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vantage-tiles-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function mount(plugin) {
  let handler;
  plugin.configureServer({
    middlewares: {
      use(route, fn) {
        assert.equal(route, '/api/tiles');
        handler = fn;
      },
    },
  });
  return (url, method = 'GET') =>
    new Promise((resolve, reject) => {
      const res = {
        headersSent: false,
        writeHead(status, headers) {
          Object.assign(this, { status, headers, headersSent: true });
        },
        end(body) {
          resolve({ status: this.status, headers: this.headers, body });
        },
      };
      Promise.resolve(handler({ url, method }, res)).catch(reject);
    });
}

test('only allow-listed paths on their own host are forwarded', () => {
  assert.equal(
    resolveTileProxyPath('/openfreemap/planet').url,
    'https://tiles.openfreemap.org/planet',
  );
  assert.equal(resolveTileProxyPath(OFM_TILE).url, OFM_TILE_URL);
  assert.equal(
    resolveTileProxyPath('/alpr/cameras-ca-hourly/11/467/843.mvt').url,
    'https://tiles.dontgetflocked.com/cameras-ca-hourly/11/467/843.mvt',
  );
  assert.equal(
    resolveTileProxyPath('/alpr/cameras-us-hourly.json').kind,
    'tileJson',
  );
  for (const refused of [
    '/unknown/planet',
    '/openfreemap/other',
    '/openfreemap/planet/../../etc/passwd',
    '/openfreemap/planet/v//1/0/0.pbf',
    '/openfreemap/planet/v/15/0/0.pbf',
    '/openfreemap/planet/v/2/4/0.pbf',
    '/alpr/cameras-mx-hourly.json',
    '/alpr/cameras-us-hourly/11/467/843.pbf',
    '/openfreemap/https://evil.example/planet',
  ])
    assert.equal(resolveTileProxyPath(refused), null, refused);
});

test('TileJSON tile URLs point back at the proxy and foreign hosts are dropped', () => {
  const rewritten = rewriteTileJson(
    {
      tilejson: '3.0.0',
      tiles: [
        'https://tiles.openfreemap.org/planet/20260927_080001_pt/{z}/{x}/{y}.pbf',
        'https://evil.example/planet/v/{z}/{x}/{y}.pbf',
        'https://tiles.openfreemap.org/elsewhere/{z}/{x}/{y}.pbf',
      ],
      bounds: [-180, -85, 180, 85],
    },
    'openfreemap',
  );
  assert.deepEqual(rewritten.tiles, [
    '/api/tiles/openfreemap/planet/20260927_080001_pt/{z}/{x}/{y}.pbf',
  ]);
  assert.deepEqual(rewritten.bounds, [-180, -85, 180, 85]);
});

test('a tile is fetched once with the Vantage identity, then served from memory and disk', async (t) => {
  const directory = await cacheDirectory(t);
  const seen = [];
  const fetchImpl = async (url, options) => {
    seen.push({ url, options });
    return new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'content-type': 'application/x-protobuf' },
    });
  };
  const request = mount(tileProxy({ fetchImpl, cacheDirectory: directory }));
  const first = await request(`${OFM_TILE}?cachebust=1`);
  assert.equal(first.status, 200);
  assert.deepEqual([...first.body], [1, 2, 3]);
  assert.equal(first.headers['X-Vantage-Tile-Cache'], 'MISS');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, OFM_TILE_URL);
  assert.equal(
    seen[0].options.headers['User-Agent'],
    clientUserAgent('openfreemap-proxy'),
  );
  assert.equal(seen[0].options.redirect, 'error');

  const second = await request(OFM_TILE);
  assert.equal(second.headers['X-Vantage-Tile-Cache'], 'HIT');
  assert.equal(seen.length, 1, 'memory hit');

  const restarted = mount(
    tileProxy({
      fetchImpl: () => assert.fail('disk cache must answer'),
      cacheDirectory: directory,
    }),
  );
  const fromDisk = await restarted(OFM_TILE);
  assert.equal(fromDisk.status, 200);
  assert.deepEqual([...fromDisk.body], [1, 2, 3]);
});

test('TileJSON is rewritten before it reaches the browser', async (t) => {
  const request = mount(
    tileProxy({
      cacheDirectory: await cacheDirectory(t),
      fetchImpl: async (url, options) => {
        assert.equal(
          url,
          'https://tiles.dontgetflocked.com/cameras-us-hourly.json',
        );
        assert.equal(
          options.headers['User-Agent'],
          clientUserAgent('alpr-tiles-proxy'),
        );
        return Response.json({
          tiles: [
            'https://tiles.dontgetflocked.com/cameras-us-hourly/{z}/{x}/{y}.mvt',
          ],
          bounds: [-160, 17, -64, 62],
        });
      },
    }),
  );
  const response = await request('/alpr/cameras-us-hourly.json');
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(Buffer.from(response.body).toString()), {
    tiles: ['/api/tiles/alpr/cameras-us-hourly/{z}/{x}/{y}.mvt'],
    bounds: [-160, 17, -64, 62],
  });
});

test('concurrent requests for one tile share a single upstream fetch', async (t) => {
  let fetches = 0;
  const release = Promise.withResolvers();
  const request = mount(
    tileProxy({
      cacheDirectory: await cacheDirectory(t),
      fetchImpl: async () => {
        fetches++;
        await release.promise;
        return new Response(new Uint8Array([7]));
      },
    }),
  );
  const pending = [request(OFM_TILE), request(OFM_TILE)];
  await new Promise((resolve) => setImmediate(resolve));
  release.resolve();
  for (const response of await Promise.all(pending))
    assert.equal(response.status, 200);
  assert.equal(fetches, 1);
});

test('an oversized tile is refused and not cached', async (t) => {
  let fetches = 0;
  const request = mount(
    tileProxy({
      cacheDirectory: await cacheDirectory(t),
      fetchImpl: async () => {
        fetches++;
        return new Response(new Uint8Array(TILE_PROXY_MAX_TILE_BYTES + 1));
      },
    }),
  );
  t.mock.method(console, 'warn', () => {});
  assert.equal((await request(OFM_TILE)).status, 502);
  assert.equal((await request(OFM_TILE)).status, 502);
  assert.equal(fetches, 2, 'a refused body is never served from cache');
});

test('an upstream timeout answers 504 and a failing upstream falls back to a stale copy', async (t) => {
  t.mock.method(console, 'warn', () => {});
  let clock = 0;
  let mode = 'ok';
  const request = mount(
    tileProxy({
      cacheDirectory: await cacheDirectory(t),
      now: () => clock,
      fetchImpl: async () => {
        if (mode === 'timeout')
          throw new DOMException('Tile upstream timed out', 'TimeoutError');
        if (mode === 'down') return new Response('busy', { status: 503 });
        return new Response(new Uint8Array([9]));
      },
    }),
  );
  mode = 'timeout';
  assert.equal(
    (await request('/alpr/cameras-ca-hourly/11/467/843.mvt')).status,
    504,
  );
  mode = 'ok';
  // An hourly ALPR tile two hours old is past its freshness window but inside
  // the stale-if-error window.
  assert.equal(
    (await request('/alpr/cameras-us-hourly/11/467/843.mvt')).status,
    200,
  );
  clock += 2 * 3_600_000;
  mode = 'down';
  const stale = await request('/alpr/cameras-us-hourly/11/467/843.mvt');
  assert.equal(stale.status, 200);
  assert.equal(stale.headers['X-Vantage-Tile-Cache'], 'STALE');
  assert.deepEqual([...stale.body], [9]);
});

test('only GET and HEAD on known paths are answered', async (t) => {
  const request = mount(
    tileProxy({
      cacheDirectory: await cacheDirectory(t),
      fetchImpl: () => assert.fail('refused requests must not fetch'),
    }),
  );
  assert.equal((await request(OFM_TILE, 'POST')).status, 405);
  assert.equal((await request('/openfreemap/planet/../secret')).status, 404);
  assert.equal((await request('/nowhere/planet')).status, 404);
});

test('a tile the upstream has no data for is remembered as missing', async (t) => {
  let fetches = 0;
  const request = mount(
    tileProxy({
      cacheDirectory: await cacheDirectory(t),
      fetchImpl: async () => {
        fetches++;
        return new Response('not found', { status: 404 });
      },
    }),
  );
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await request('/alpr/cameras-us-hourly/11/0/0.mvt')).status,
      404,
    );
  assert.equal(fetches, 1);
});

test('a throttled upstream falls back to a stale copy', async (t) => {
  let clock = 0;
  let throttled = false;
  const request = mount(
    tileProxy({
      cacheDirectory: await cacheDirectory(t),
      now: () => clock,
      fetchImpl: async () =>
        throttled
          ? new Response('slow down', { status: 429 })
          : new Response(new Uint8Array([7])),
    }),
  );
  const tile = '/alpr/cameras-us-hourly/11/467/843.mvt';
  assert.equal((await request(tile)).status, 200);
  clock += 2 * 3_600_000;
  throttled = true;
  const stale = await request(tile);
  assert.equal(stale.status, 200);
  assert.equal(stale.headers['X-Vantage-Tile-Cache'], 'STALE');
});

test('remembered missing tiles count against the disk budget', async (t) => {
  const directory = await cacheDirectory(t);
  const request = mount(
    tileProxy({
      cacheDirectory: directory,
      // Room for two entries' metadata, never more.
      diskMaxBytes: 2 * 4096,
      fetchImpl: async () => new Response('not found', { status: 404 }),
    }),
  );
  for (let x = 0; x < 6; x++)
    assert.equal(
      (await request(`/alpr/cameras-us-hourly/11/${x}/0.mvt`)).status,
      404,
    );
  const entries = (await readdir(directory)).filter((name) =>
    name.endsWith('.json'),
  );
  assert.ok(entries.length <= 2, `${entries.length} entries kept on disk`);
});
