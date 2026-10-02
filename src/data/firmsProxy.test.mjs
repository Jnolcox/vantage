import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { filterTrailing24h, parseFirmsCsv } from './firmsCsv.js';
import { clientUserAgent } from '../sources/projectIdentity.js';

const config = fs.readFileSync(new URL('../../server/providers/firms.js', import.meta.url), 'utf8');
const start = config.indexOf('  async function refreshUpstream(key) {');
assert.notEqual(start, -1, 'FIRMS refresh function exists');
const end = config.indexOf('\n  }', start);
assert.notEqual(end, -1, 'FIRMS refresh function closes');
const refreshSource = config.slice(start, end + 4);
const SOURCES = ['VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT', 'VIIRS_SNPP_NRT', 'MODIS_NRT'];
const NOW = Date.UTC(2026, 8, 11, 12);
const recent = { acqDate: '2026-09-11', acqTime: '1100' };

// Exercise the production refresh without opening a server or using a MAP_KEY.
// Inject only its upstream, clock and filter dependencies; keep its aggregation
// and source-status code intact, including failures while consuming records.
function createRefresh(fetchSource, filter = filterTrailing24h) {
  return new Function('SOURCES', 'fetchSource', 'filterTrailing24h', 'Date', 'console',
    `return (${refreshSource});`)(SOURCES, fetchSource, filter, { now: () => NOW }, { warn() {} });
}

test('FIRMS retains large sources in order and filters expired rows', async () => {
  const header = 'latitude,longitude,acq_date,acq_time,confidence,frp\n';
  const large = parseFirmsCsv(header + '1,2,2026-09-11,1100,n,4\n'.repeat(200_000));
  const expired = { ...recent, acqDate: '2026-09-09' };
  const last = { ...recent, marker: 'last' };
  const calls = [];
  let active = 0;
  const refresh = createRefresh(async (key, source) => {
    assert.equal(active++, 0, 'sources must be fetched sequentially');
    calls.push(source);
    await Promise.resolve();
    active--;
    return source === SOURCES[0] ? [...large, expired] : source === SOURCES[1] ? [last] : [];
  });
  const result = await refresh('fixture');
  assert.deepEqual(calls, SOURCES);
  assert.equal(result.fires.length, 200_001);
  assert.equal(result.fires[0], large[0]);
  assert.equal(result.fires[199_999], large.at(-1));
  assert.equal(result.fires.at(-1), last);
  assert.deepEqual(result.sources, SOURCES.map((source, index) => ({
    source, count: [200_000, 1, 0, 0][index], ok: true,
  })));
});

test('FIRMS keeps successful sources when another upstream fails', async () => {
  const result = await createRefresh(async (key, source) => {
    if (source === SOURCES[1]) throw new Error('upstream unavailable');
    return [recent];
  })('fixture');
  assert.equal(result.fires.length, 3);
  assert.deepEqual(result.sources, SOURCES.map((source, index) => ({
    source, count: index === 1 ? 0 : 1, ok: index !== 1,
  })));
});

test('FIRMS reports one failure if consuming a source throws before append', async () => {
  const failing = [];
  const result = await createRefresh(async (key, source) => source === SOURCES[0] ? failing : [recent],
    (records, now) => {
      if (records !== failing) return filterTrailing24h(records, now);
      // Fault injection for aggregation; ordinary parsed CSV returns an array.
      return { length: 1, [Symbol.iterator]() { throw new Error('aggregation failed'); } };
    })('fixture');
  assert.equal(result.fires.length, 3);
  assert.deepEqual(result.sources, SOURCES.map((source, index) => ({
    source, count: index === 0 ? 0 : 1, ok: index !== 0,
  })));
});

test('FIRMS distinguishes all-source failure from successful empty sources', async () => {
  await assert.rejects(createRefresh(async () => { throw new Error('upstream unavailable'); })('fixture'),
    /all FIRMS sources failed/);
  const result = await createRefresh(async () => [])('fixture');
  assert.deepEqual(result.fires, []);
  assert.deepEqual(result.sources, SOURCES.map(source => ({ source, count: 0, ok: true })));
});

test('FIRMS sends the Vantage firms-proxy User-Agent with each source request', async () => {
  const fetchStart = config.indexOf('  async function fetchSource(key, source) {');
  assert.notEqual(fetchStart, -1, 'FIRMS source fetch exists');
  const fetchEnd = config.indexOf('\n  }', fetchStart);
  const requests = [];
  const fetchSource = new Function('fetch', 'parseFirmsCsv', 'FIRMS_REQUEST_HEADERS',
    `return (${config.slice(fetchStart, fetchEnd + 4)});`)(
    async (url, init) => {
      requests.push({ url, init });
      return new Response('latitude,longitude,acq_date,acq_time,confidence,frp\n');
    },
    parseFirmsCsv,
    { 'User-Agent': clientUserAgent('firms-proxy') },
  );
  await fetchSource('fixture', 'MODIS_NRT');
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/MODIS_NRT\/world\/2$/);
  assert.equal(requests[0].init.headers['User-Agent'], clientUserAgent('firms-proxy'));
});

test('every FIRMS upstream request carries the shared request headers', () => {
  const fetchCalls = config.match(/await fetch\(url, \{[^}]*\}/g) ?? [];
  assert.equal(fetchCalls.length, 2, 'CSV source and mapkey status requests');
  for (const call of fetchCalls) assert.match(call, /headers: FIRMS_REQUEST_HEADERS/);
  assert.match(config, /'User-Agent': clientUserAgent\('firms-proxy'\)/);
});
