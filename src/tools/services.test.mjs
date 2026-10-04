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
