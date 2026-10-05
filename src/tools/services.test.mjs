import assert from 'node:assert/strict';
import test from 'node:test';
import { composeCatalog, coreTools } from './index.js';
import { createToolServices } from './services.js';

test('the default services need a fetch implementation', () => {
  assert.throws(() => createToolServices({}), /fetch implementation/);
});

test('the default services supply every service Core tools read', () => {
  const services = createToolServices({ fetchImpl: async () => {} });
  const catalog = composeCatalog({ tools: coreTools, services });
  assert.deepEqual(
    catalog.list().map((tool) => tool.name),
    coreTools.map((tool) => tool.name),
  );
});

test('the vessel source requests its snapshot from the app it serves', async () => {
  const requested = [];
  const services = createToolServices({
    appUrl: 'http://127.0.0.1:4173',
    fetchImpl: async (url) => {
      requested.push(String(url));
      return new Response(JSON.stringify({ rows: [] }), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  await services.vessels.getSnapshot();
  assert.equal(new URL(requested[0]).origin, 'http://127.0.0.1:4173');
  assert.equal(new URL(requested[0]).pathname, '/api/vessels');
});

test('an imagery snapshot larger than the cap is refused', async () => {
  const services = createToolServices({
    fetchImpl: async () =>
      new Response(new Uint8Array(1), {
        headers: {
          'content-type': 'image/png',
          'content-length': String(9 * 1024 * 1024),
        },
      }),
  });
  await assert.rejects(
    services.imagery.getSnapshot({
      product: 'S30',
      day: '2026-09-28',
      box: { west: -97.9, south: 30.1, east: -97.5, north: 30.5 },
      width: 64,
      height: 64,
    }),
    { code: 'RESPONSE_TOO_LARGE' },
  );
});

test('links to an area open the app the services were built for', async () => {
  const services = createToolServices({
    appUrl: 'http://127.0.0.1:4173',
    fetchImpl: async () => {},
  });
  const catalog = composeCatalog({ tools: coreTools, services });
  const result = await catalog.call('show_in_vantage', {
    area: { lat: 30.27, lon: -97.74, radius_km: 5 },
  });
  assert.equal(new URL(result.data.url).origin, 'http://127.0.0.1:4173');
});
