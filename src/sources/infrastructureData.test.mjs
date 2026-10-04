// INFRASTRUCTURE DATA — the portable data half of the datacenter and dam
// layers: bundled file URLs, GeoJSON Lines parsing and layer labels.
//
// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  INFRASTRUCTURE_DATA_URLS,
  layerTitle,
  parseGeojsonLines,
} from './infrastructureData.js';

test('each infrastructure data URL names a bundled file', () => {
  for (const url of Object.values(INFRASTRUCTURE_DATA_URLS)) {
    assert.ok(existsSync(fileURLToPath(url)), url);
  }
});

test('parseGeojsonLines reads one feature per non-empty line', () => {
  const features = parseGeojsonLines('{"id":1}\n\n  \n{"id":2}\n');
  assert.deepEqual(features, [{ id: 1 }, { id: 2 }]);
});

test('layerTitle names each local infrastructure layer', () => {
  assert.equal(layerTitle('local-datacenters'), 'Datacenter');
  assert.equal(layerTitle('local-dams'), 'Dam');
  assert.equal(layerTitle('other'), 'Feature');
});
