import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalAdsbEnrichment } from './enrichment.js';

const RECORD = Object.freeze({ icao: 'ae5d8a', callsign: 'SWA1234' });

function recordingSource() {
  const queries = [];
  return {
    queries,
    getEnrichment: async (query) => {
      queries.push(query);
      return { found: false };
    },
  };
}

test('a selected local aircraft is looked up while lookups are on', async () => {
  const source = recordingSource();
  const enrichment = createLocalAdsbEnrichment({ source, onChange() {} });
  enrichment.request(RECORD, { selected: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  // The route lookup waits out the dispatch gap behind the type lookup.
  assert.deepEqual(source.queries, [{ kind: 'type', id: 'ae5d8a' }]);
  enrichment.destroy();
});

test('nothing is looked up while the viewer has local lookups off', async () => {
  const source = recordingSource();
  const enrichment = createLocalAdsbEnrichment({
    source,
    onChange() {},
    isEnabled: () => false,
  });
  enrichment.request(RECORD, { selected: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(source.queries, []);
  enrichment.destroy();
});

test('an aircraft skipped while lookups were off is looked up once they return', async () => {
  const source = recordingSource();
  let enabled = false;
  const enrichment = createLocalAdsbEnrichment({
    source,
    onChange() {},
    isEnabled: () => enabled,
  });
  enrichment.request(RECORD);
  enabled = true;
  enrichment.request(RECORD);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(source.queries, [{ kind: 'type', id: 'ae5d8a' }]);
  enrichment.destroy();
});

test('lookups switched off drop requests still waiting in the queue', async () => {
  const source = recordingSource();
  let enabled = true;
  const enrichment = createLocalAdsbEnrichment({
    source,
    onChange() {},
    isEnabled: () => enabled,
  });
  // The route lookup waits out the dispatch gap behind the type lookup.
  enrichment.request(RECORD, { selected: true });
  enabled = false;
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.deepEqual(source.queries, [{ kind: 'type', id: 'ae5d8a' }]);
  enrichment.destroy();
});

test('a queued request dropped while lookups were off is asked once they return', async () => {
  const source = recordingSource();
  let enabled = true;
  const enrichment = createLocalAdsbEnrichment({
    source,
    onChange() {},
    isEnabled: () => enabled,
  });
  enrichment.request(RECORD, { selected: true });
  enabled = false;
  await new Promise((resolve) => setTimeout(resolve, 250));
  enabled = true;
  enrichment.request(RECORD, { selected: true });
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.deepEqual(source.queries, [
    { kind: 'type', id: 'ae5d8a' },
    { kind: 'route', id: 'SWA1234' },
  ]);
  enrichment.destroy();
});
