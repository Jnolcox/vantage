import test from 'node:test';
import assert from 'node:assert/strict';
import { createIngestion, createVesselFeed } from './ingestion.js';
import { VIEW_AREA_REFETCH_MIN_INTERVAL_MS } from './viewArea.js';
function setup(source) {
  const feed = createVesselFeed();
  feed.enabled = true;
  feed.sessionId = 1;
  const applied = [];
  const labels = [];
  let count = 0;
  const ingestion = createIngestion({
    feed,
    readSource: () => source,
    readViewer: () => ({}),
    getRowLimit: () => 500,
    readCount: () => count,
    now: () => 9999,
    setSourceLabel: (value) => labels.push(value),
    applyRows: (_, rows) => {
      applied.push(rows);
      count = rows.length;
    },
    classifySnapshot: (payload) => ({
      acceptedRows: payload.rows,
      acceptedRowCount: payload.rows.length,
      rawRowCount: payload.rows.length,
      transportStatus: payload.status,
      lastMessageAt: payload.lastMessageAt,
      error: payload.rows.length ? null : 'No accepted positions',
    }),
    isDefinitiveTransportFailure: () => false,
    isGraceEligibleTransport: () => false,
    markUnavailable: (error) => {
      feed.error = error;
    },
    settleFirstConnect: (phase) => {
      feed.firstConnectPhase = phase;
    },
  });
  return { feed, applied, labels, ...ingestion };
}

test('an old vessel request cannot publish or clear the loading state of a newer enable session', async () => {
  let release;
  const probe = setup({
    getSnapshot: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const request = probe.methods.update();
  const old = probe.feed.abort;
  probe.feed.sessionId++;
  probe.feed.abort = new AbortController();
  probe.feed.loading = true;
  release({ records: [], source: 'Old session' });
  await request;
  assert.equal(probe.applied.length, 0);
  assert.equal(probe.labels.length, 0);
  assert.equal(probe.feed.loading, true);
  assert.notEqual(probe.feed.abort, old);
});

test('vessel ingestion converts source units once and retains warm records on a zero-row snapshot', async () => {
  let snapshot = {
    records: [
      {
        id: '111',
        reference: '111',
        latitude: 51.93,
        longitude: 4.05,
        speedMps: 5.14444,
        courseDeg: 90,
        headingDeg: 100,
        observedAtMs: 1700000000000,
      },
    ],
    source: 'Fixture',
    observedAtMs: null,
    freshness: 'unknown',
    complete: false,
    transportStatus: 'live',
  };
  const probe = setup({
    async getSnapshot(query) {
      assert.equal(query.maxRows, 500);
      return snapshot;
    },
  });
  await probe.methods.update();
  const record = probe.applied[0][0];
  assert.equal(record.speed, 5.14444 / 0.514444);
  assert.equal(record.last_position_epoch, 1700000000);
  assert.equal(record.last_position_UTC, new Date(1700000000000).toISOString());
  assert.equal(probe.feed.lastUpdate, null);
  assert.equal(probe.feed.stale, true);
  assert.equal(probe.feed.count, 1);
  snapshot = { ...snapshot, records: [] };
  await probe.methods.update();
  assert.equal(probe.applied.length, 1);
  assert.equal(probe.feed.count, 1);
  assert.equal(probe.feed.stale, true);
  assert.equal(probe.feed.error, 'No accepted positions');
  assert.equal(probe.feed.loading, false);
  assert.equal(probe.feed.abort, null);
});

function areaProbe() {
  const probe = {
    asked: [],
    area: { lat: 37.8, lon: -122.4, radiusKm: 40 },
    clock: 0,
  };
  const feed = createVesselFeed();
  feed.enabled = true;
  feed.sessionId = 1;
  const ingestion = createIngestion({
    feed,
    readSource: () => ({
      getSnapshot: async (query) => {
        probe.asked.push(query);
        return { records: [], source: 'Feed' };
      },
    }),
    readViewer: () => ({}),
    readArea: () => probe.area,
    getRowLimit: () => 500,
    readCount: () => 0,
    now: () => probe.clock,
    setSourceLabel: () => {},
    applyRows: () => {},
    classifySnapshot: () => ({
      acceptedRows: [],
      acceptedRowCount: 0,
      rawRowCount: 0,
    }),
    isDefinitiveTransportFailure: () => false,
    isGraceEligibleTransport: () => false,
    markUnavailable: () => {},
    settleFirstConnect: () => {},
  });
  return Object.assign(probe, ingestion);
}

test('vessels are asked for by the area in view, and again only when the view moves away', async () => {
  const probe = areaProbe();
  const firstArea = probe.area;
  await probe.methods.update();
  assert.deepEqual(probe.asked, [{ maxRows: 500, area: firstArea }]);
  probe.clock += VIEW_AREA_REFETCH_MIN_INTERVAL_MS;
  await probe.refreshIfMoved();
  assert.equal(probe.asked.length, 1);
  probe.area = { ...firstArea, lat: 38.2 };
  await probe.refreshIfMoved();
  assert.deepEqual(probe.asked.at(-1), { maxRows: 500, area: probe.area });
  probe.clock += VIEW_AREA_REFETCH_MIN_INTERVAL_MS;
  probe.area = null;
  await probe.refreshIfMoved();
  assert.deepEqual(probe.asked.at(-1), { maxRows: 500 });
});

test('a camera move between polls waits for the next poll, which asks for the new area', async () => {
  const probe = areaProbe();
  await probe.methods.update();
  probe.clock += VIEW_AREA_REFETCH_MIN_INTERVAL_MS / 2;
  probe.area = { ...probe.area, lat: 38.2 };
  await probe.refreshIfMoved();
  assert.equal(probe.asked.length, 1);
  probe.clock += VIEW_AREA_REFETCH_MIN_INTERVAL_MS / 2;
  await probe.methods.update();
  assert.equal(probe.asked.length, 2);
  assert.deepEqual(probe.asked.at(-1), { maxRows: 500, area: probe.area });
});

test('rapid camera moves add at most one request per interval', async () => {
  const probe = areaProbe();
  await probe.methods.update();
  const moveStepMs = 250;
  const intervals = 4;
  const moves = (intervals * VIEW_AREA_REFETCH_MIN_INTERVAL_MS) / moveStepMs;
  for (let move = 1; move <= moves; move++) {
    probe.clock += moveStepMs;
    probe.area = { ...probe.area, lon: probe.area.lon + 0.1 };
    await probe.refreshIfMoved();
  }
  assert.equal(probe.asked.length - 1, intervals);
});
