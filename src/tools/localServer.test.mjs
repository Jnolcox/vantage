import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import { createLocalMcpServer } from '../../server/mcp/server.js';
import {
  DEFAULT_API_BASE,
  MCP_TOOLS_USER_AGENT,
  createApiFetch,
  createLocalToolServices,
} from '../../server/mcp/services.js';
import {
  admitApiRequest,
  admitRequestHost,
} from '../../server/standalone/api-request-guard.js';
import { googlePlacesContextProxy } from '../../server/providers/places/google.js';
import { clientUserAgent } from '../sources/projectIdentity.js';
import {
  describeRequest,
  parseArgs,
  serveStdio,
} from '../../server/mcp/stdio.js';
import { composeCatalog, coreTools, toolsForSurface } from './index.js';

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

test('recent imagery reads NASA directly with the project User-Agent', async () => {
  const seen = [];
  const services = createLocalToolServices({
    apiBase: 'http://127.0.0.1:5000',
    fetchImpl: async (input, init) => {
      const url = new URL(String(input));
      seen.push({
        host: url.host,
        userAgent: new Headers(init?.headers).get('user-agent'),
      });
      return url.host === 'wvs.earthdata.nasa.gov'
        ? new Response(Uint8Array.from([0x89, 0x50]), {
            headers: { 'content-type': 'image/png' },
          })
        : Response.json({ hits: 0, items: [] });
    },
  });
  const box = { west: -97.9, south: 30.1, east: -97.5, north: 30.5 };
  const latest = await services.imagery.latest({ box });
  await services.imagery.getSnapshot({
    product: latest.candidate.product,
    day: latest.candidate.day,
    box,
    width: 64,
    height: 64,
  });
  assert.deepEqual([...new Set(seen.map(({ host }) => host))].sort(), [
    'cmr.earthdata.nasa.gov',
    'wvs.earthdata.nasa.gov',
  ]);
  for (const { userAgent } of seen)
    assert.equal(userAgent, MCP_TOOLS_USER_AGENT);
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
  // Every Core tool's services are composed locally.
  assert.deepEqual(
    byId.get(2).result.tools.map((tool) => tool.name),
    toolsForSurface(coreTools, 'mcp').map((tool) => tool.name),
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

test('the stdio log names methods and tools but never arguments', () => {
  assert.equal(describeRequest({ method: 'tools/list' }), 'tools/list');
  assert.equal(
    describeRequest({
      method: 'tools/call',
      params: { name: 'get_weather', arguments: { location: { place: 'x' } } },
    }),
    'tools/call get_weather',
  );
  assert.equal(describeRequest({ result: {} }), null);
});

test('the stdio log does not echo free text given as a method or tool name', () => {
  assert.equal(
    describeRequest({
      method: 'tools/call',
      params: { name: 'get_earthquakes\n<- forged line' },
    }),
    'tools/call (unnamed tool)',
  );
  assert.equal(
    describeRequest({ method: 'my home is at 1 Main St' }),
    '(unnamed method)',
  );
});

test('the stdio log names the resource a read asks for, and only a URI', () => {
  assert.equal(
    describeRequest({
      method: 'resources/read',
      params: { uri: 'ui://vantage/globe' },
    }),
    'resources/read ui://vantage/globe',
  );
  assert.equal(
    describeRequest({
      method: 'resources/read',
      params: { uri: 'ui://vantage/globe\n<- forged line' },
    }),
    'resources/read (unnamed resource)',
  );
  assert.equal(describeRequest({ method: 'resources/list' }), 'resources/list');
});

test('a failed tool call is logged with its error code, not its message', async () => {
  const server = {
    handle: async (message) => ({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        isError: true,
        content: [{ type: 'text', text: 'No place matched "Home"' }],
        structuredContent: { error: 'invalid_arguments' },
      },
    }),
  };
  const input = new PassThrough();
  const output = new PassThrough();
  output.resume();
  const logged = [];
  const served = serveStdio(server, {
    input,
    output,
    log: (line) => logged.push(line),
  });
  input.end(
    '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_earthquakes","arguments":{"area":{"place":"Home"}}}}\n',
  );
  await served;
  assert.deepEqual(logged, [
    'tools/call get_earthquakes',
    '   tools/call get_earthquakes failed: invalid_arguments',
  ]);
});

test('search_places over the local services and the real keyless Google route reports that no key is configured', async (t) => {
  const routes = new Map();
  googlePlacesContextProxy({ resolveApiKey: () => '' }).configureServer({
    middlewares: { use: (path, handler) => routes.set(path, handler) },
  });
  const app = createServer((req, res) => {
    const verdict = admitApiRequest({
      hostHeader: req.headers.host,
      origin: req.headers.origin,
      fetchSite: req.headers['sec-fetch-site'],
      url: req.url,
      headers: req.headers,
    });
    const route = [...routes.keys()].find((path) => req.url.startsWith(path));
    if (!verdict.ok || !route) return res.writeHead(403).end();
    req.url = req.url.slice(route.length);
    return routes.get(route)(req, res);
  });
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  // MCP does not list search_places; voice does, over the same services.
  const catalog = composeCatalog({
    tools: coreTools,
    services: createLocalToolServices({
      apiBase: `http://127.0.0.1:${app.address().port}`,
    }),
  });
  await assert.rejects(
    catalog.call('search_places', {
      query: 'tea',
      area: { bbox: [-0.2, 51.4, 0, 51.6] },
    }),
    (error) =>
      error.code === 'unavailable' &&
      /needs a Google Places key/.test(error.message),
  );
});

test('a request the client cancels over stdio is aborted and gets no answer', async () => {
  let seen;
  const server = {
    handle: (message, { signal } = {}) => {
      if (message.id === 1) {
        seen = signal;
        return new Promise((resolve) =>
          signal.addEventListener(
            'abort',
            () => resolve({ jsonrpc: '2.0', id: 1, result: {} }),
            { once: true },
          ),
        );
      }
      return Promise.resolve(
        message.id === undefined
          ? null
          : { jsonrpc: '2.0', id: message.id, result: {} },
      );
    },
  };
  const input = new PassThrough();
  const output = new PassThrough();
  let written = '';
  output.on('data', (chunk) => (written += chunk));
  const served = serveStdio(server, { input, output });
  input.write('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{}}\n');
  input.write('{"jsonrpc":"2.0","id":2,"method":"ping"}\n');
  input.end(
    '{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":1}}\n',
  );
  await served;
  assert.equal(seen.aborted, true);
  const ids = written
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line).id);
  assert.deepEqual(ids, [2]);
});
