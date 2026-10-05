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
  assert.equal(new URL(requested[0]).pathname, '/api/ais-live');
});
