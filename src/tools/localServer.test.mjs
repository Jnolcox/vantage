import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import { createLocalMcpServer } from '../../server/mcp/server.js';
import {
  DEFAULT_API_BASE,
  MCP_TOOLS_USER_AGENT,
  createApiFetch,
} from '../../server/mcp/services.js';
import {
  admitApiRequest,
  admitRequestHost,
} from '../../server/standalone/api-request-guard.js';
import { clientUserAgent } from '../sources/projectIdentity.js';
import { parseArgs, serveStdio } from '../../server/mcp/stdio.js';

const usgs = {
  type: 'FeatureCollection',
  features: [
    {
      id: 'us1',
      geometry: { type: 'Point', coordinates: [121.5, 24, 10] },
      properties: { mag: 5.1, place: 'near Hualien', time: 1767229200000 },
    },
  ],
};

test('relative API requests resolve against the configured base', async () => {
  const seen = [];
  const apiFetch = createApiFetch({
    apiBase: 'http://127.0.0.1:5000',
    fetchImpl: async (url) => seen.push(String(url)),
  });
  await apiFetch('/api/launches');
  await apiFetch('https://earthquake.usgs.gov/feed.geojson');
  assert.deepEqual(seen, [
    'http://127.0.0.1:5000/api/launches',
    'https://earthquake.usgs.gov/feed.geojson',
  ]);
  assert.throws(
    () => createApiFetch({ apiBase: 'file:///etc' }),
    /http\(s\) URL/,
  );
});

test('the default API base is the IPv4 loopback the app binds', () => {
  assert.equal(DEFAULT_API_BASE, 'http://127.0.0.1:4173');
});

test('direct third-party requests carry the project User-Agent', async () => {
  const seen = [];
  const apiFetch = createApiFetch({
    apiBase: 'http://127.0.0.1:5000',
    fetchImpl: async (url, init) => seen.push(new Headers(init?.headers)),
  });
  await apiFetch('https://earthquake.usgs.gov/feed.geojson', {
    headers: { Accept: 'application/json' },
  });
  assert.equal(seen[0].get('user-agent'), clientUserAgent('mcp-tools'));
  assert.equal(seen[0].get('accept'), 'application/json');
  assert.equal(MCP_TOOLS_USER_AGENT, clientUserAgent('mcp-tools'));
});

test("requests to the app's own origin keep their headers unchanged", async () => {
  const seen = [];
  const apiFetch = createApiFetch({
    apiBase: 'http://127.0.0.1:5000',
    fetchImpl: async (url, init) => seen.push(init),
  });
  const init = { headers: { Accept: 'application/json' } };
  await apiFetch('/api/launches', init);
  await apiFetch('http://127.0.0.1:5000/api/firms', init);
  assert.deepEqual(seen, [init, init]);
});

test('Request inputs keep their own URL and get the User-Agent only off-origin', async () => {
  const seen = [];
  const apiFetch = createApiFetch({
    apiBase: 'http://127.0.0.1:5000',
    fetchImpl: async (input, init) => seen.push({ input, init }),
  });
  const own = new Request('http://127.0.0.1:5000/api/firms');
  await apiFetch(own);
  await apiFetch(
    new Request('https://earthquake.usgs.gov/feed.geojson', {
      headers: { Accept: 'application/json' },
    }),
  );
  assert.equal(seen[0].input, own);
  assert.equal(seen[0].init, undefined);
  assert.equal(seen[1].input.url, 'https://earthquake.usgs.gov/feed.geojson');
  const headers = new Headers(seen[1].init.headers);
  assert.equal(headers.get('user-agent'), MCP_TOOLS_USER_AGENT);
  assert.equal(headers.get('accept'), 'application/json');
});

test("the app's /api guard admits the tools' requests as a local non-browser client", async (t) => {
  const verdicts = [];
  const app = createServer((req, res) => {
    const host = admitRequestHost({
      hostHeader: req.headers.host,
      allowedHosts: ['localhost', '127.0.0.1'],
    });
    const api = admitApiRequest({
      hostHeader: req.headers.host,
      origin: req.headers.origin,
      fetchSite: req.headers['sec-fetch-site'],
      url: req.url,
      headers: req.headers,
    });
    verdicts.push(host.ok && api.ok);
    res.writeHead(host.ok && api.ok ? 200 : 403).end();
  });
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const apiFetch = createApiFetch({
    apiBase: `http://127.0.0.1:${app.address().port}`,
  });
  const response = await apiFetch('/api/launches');
  assert.equal(response.status, 200);
  assert.deepEqual(verdicts, [true]);
});

test('the stdio server answers newline-delimited requests using only its data sources', async () => {
  const contacted = [];
  const server = createLocalMcpServer({
    apiBase: 'http://127.0.0.1:5000',
    fetchImpl: async (url) => {
      contacted.push(new URL(url).origin);
      return Response.json(usgs);
    },
  });
  const input = new PassThrough();
  const output = new PassThrough();
  let written = '';
  output.on('data', (chunk) => (written += chunk));
  const served = serveStdio(server, { input, output });
  input.write(
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}\n',
  );
  input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n\n');
  input.write('not json\n');
  input.write('{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n');
  input.end(
    '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_earthquakes","arguments":{}}}\n',
  );
  await served;
  const responses = written
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const byId = new Map(responses.map((response) => [response.id, response]));
  assert.equal(responses.length, 4);
  assert.equal(byId.get(1).result.serverInfo.name, 'vantage');
  assert.equal(byId.get(null).error.code, -32700);
  assert.deepEqual(
    byId.get(2).result.tools.map((tool) => tool.name),
    ['get_earthquakes', 'get_active_fires', 'get_recent_launches'],
  );
  assert.equal(
    byId.get(3).result.content[0].text,
    '1 earthquake of M2.5+ in the last 24 hours worldwide; strongest M5.1 near Hualien.',
  );
  // The earthquake feed is fetched directly; nothing else was contacted.
  assert.deepEqual(contacted, ['https://earthquake.usgs.gov']);
});

test('command-line arguments are strict', () => {
  assert.deepEqual(parseArgs([]), {});
  assert.deepEqual(parseArgs(['--api-base', 'http://localhost:5173']), {
    apiBase: 'http://localhost:5173',
  });
  assert.throws(() => parseArgs(['--port', '1']), /Unknown argument/);
});
