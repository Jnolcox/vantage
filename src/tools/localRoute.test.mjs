import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import test from 'node:test';
import {
  isLocalMcpRequest,
  isMcpHttpEnabled,
  localMcpPlugin,
} from '../../server/mcp/plugin.js';

/** Serve one plugin's /mcp middleware on a loopback port. */
async function listen(t, plugin, hook = 'configureServer') {
  let middleware;
  plugin[hook]({
    middlewares: { use: (path, handler) => (middleware = handler) },
  });
  const http = createServer((req, res) => middleware(req, res));
  await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
  t.after(() => http.close());
  return http.address().port;
}

/** Send one request to 127.0.0.1:port/mcp with a local Host by default. */
function send(port, method, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path: '/mcp',
        method,
        headers: {
          'Content-Type': 'application/json',
          Host: `localhost:${port}`,
          ...headers,
        },
      },
      (response) => {
        let text = '';
        response.on('data', (chunk) => (text += chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            json: () => JSON.parse(text),
          }),
        );
      },
    );
    request.on('error', reject);
    request.end(
      body === undefined
        ? undefined
        : typeof body === 'string'
          ? body
          : JSON.stringify(body),
    );
  });
}

const pingServer = ({ apiBase }) => ({
  handle: async (message) =>
    message.id === undefined
      ? null
      : { jsonrpc: '2.0', id: message.id, result: { apiBase } },
});

test('VANTAGE_MCP_HTTP turns the route on only for 1 or true', () => {
  assert.equal(isMcpHttpEnabled({}), false);
  assert.equal(isMcpHttpEnabled({ VANTAGE_MCP_HTTP: '' }), false);
  assert.equal(isMcpHttpEnabled({ VANTAGE_MCP_HTTP: '0' }), false);
  assert.equal(isMcpHttpEnabled({ VANTAGE_MCP_HTTP: 'yes' }), false);
  assert.equal(isMcpHttpEnabled({ VANTAGE_MCP_HTTP: '1' }), true);
  assert.equal(isMcpHttpEnabled({ VANTAGE_MCP_HTTP: ' TRUE ' }), true);
});

test('the setting is new and has no pre-rename name', () => {
  assert.equal(isMcpHttpEnabled({ GEV_MCP_HTTP: '1' }), false);
});

test('by default /mcp answers a JSON 404 naming the setting and runs no tool', async (t) => {
  const created = [];
  const plugin = localMcpPlugin({
    createServer: (options) => {
      created.push(options);
      return pingServer(options);
    },
  });
  for (const hook of ['configureServer', 'configurePreviewServer']) {
    const port = await listen(t, plugin, hook);
    const response = await send(port, 'POST', {
      jsonrpc: '2.0',
      id: 1,
      method: 'ping',
    });
    assert.equal(response.status, 404, hook);
    assert.match(response.json().error, /VANTAGE_MCP_HTTP=1/);
  }
  assert.deepEqual(created, []);
});

test('only direct loopback connections to this server are local', () => {
  const local = {
    remoteAddress: '127.0.0.1',
    localPort: 4173,
    host: 'localhost:4173',
  };
  assert.equal(isLocalMcpRequest(local), true);
  assert.equal(
    isLocalMcpRequest({ ...local, remoteAddress: '::1', host: '[::1]:4173' }),
    true,
  );
  assert.equal(
    isLocalMcpRequest({ ...local, remoteAddress: '::ffff:127.0.0.1' }),
    true,
  );
  assert.equal(
    isLocalMcpRequest({ ...local, origin: 'http://localhost:4173' }),
    true,
  );
  assert.equal(
    isLocalMcpRequest({
      ...local,
      headers: { 'sec-fetch-site': 'same-origin' },
    }),
    true,
  );
  assert.equal(
    isLocalMcpRequest({ ...local, env: { PINOKIO_SHARE_LOCAL: 'false' } }),
    true,
  );
  for (const request of [
    // A LAN peer, whatever address the server binds.
    { ...local, remoteAddress: '192.168.1.20' },
    { ...local, remoteAddress: undefined },
    { ...local, host: 'attacker.example:4173' },
    { ...local, host: 'localhost.attacker.example' },
    { ...local, host: 'user@localhost:4173' },
    { ...local, host: '' },
    // Another local port, as the Host or as the page's origin.
    { ...local, host: 'localhost:9000' },
    { ...local, localPort: 80 },
    { ...local, localPort: undefined },
    { ...local, origin: 'http://127.0.0.1:5173' },
    { ...local, origin: 'http://localhost:5173' },
    { ...local, origin: 'https://attacker.example' },
    { ...local, origin: 'null' },
    { ...local, origin: 'file:///tmp/page.html' },
    { ...local, headers: { 'sec-fetch-site': 'cross-site' } },
    { ...local, headers: { 'sec-fetch-site': 'same-site' } },
    // Proxied or shared: not from this machine, whatever the socket says.
    { ...local, headers: { 'x-forwarded-for': '203.0.113.9' } },
    { ...local, headers: { forwarded: 'for=203.0.113.9' } },
    { ...local, headers: { 'cf-connecting-ip': '203.0.113.9' } },
    { ...local, env: { PINOKIO_SHARE_LOCAL: 'true' } },
    { ...local, env: { PINOKIO_SHARE_VAR: 'VANTAGE_SHARE_URL' } },
  ])
    assert.equal(isLocalMcpRequest(request), false, JSON.stringify(request));
});

test('VANTAGE_TRUST_PROXY never lets a proxied request reach /mcp', () => {
  assert.equal(
    isLocalMcpRequest({
      remoteAddress: '127.0.0.1',
      localPort: 4173,
      host: 'localhost:4173',
      headers: { 'x-forwarded-for': '203.0.113.9' },
      env: { VANTAGE_TRUST_PROXY: '1' },
    }),
    false,
  );
});

test('with the setting on, /mcp answers local MCP requests and refuses others', async (t) => {
  const created = [];
  const port = await listen(
    t,
    localMcpPlugin({
      enabled: true,
      createServer: (options) => {
        created.push(options.apiBase);
        return pingServer(options);
      },
    }),
  );
  const post = (body, headers) => send(port, 'POST', body, headers);

  const ok = await post({ jsonrpc: '2.0', id: 1, method: 'ping' });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json(), {
    jsonrpc: '2.0',
    id: 1,
    result: { apiBase: `http://localhost:${port}` },
  });
  assert.equal(
    (await post({ jsonrpc: '2.0', method: 'notifications/initialized' }))
      .status,
    202,
  );
  await post({ jsonrpc: '2.0', id: 2, method: 'ping' });
  assert.deepEqual(created, [`http://localhost:${port}`]);
  // Another spelling of the same Host reuses that server.
  const respelled = await post(
    { jsonrpc: '2.0', id: 4, method: 'ping' },
    { Host: `LocalHost:0${port}` },
  );
  assert.equal(respelled.status, 200);
  assert.equal(respelled.json().result.apiBase, `http://localhost:${port}`);
  assert.deepEqual(created, [`http://localhost:${port}`]);

  const foreign = await post(
    { jsonrpc: '2.0', id: 3, method: 'ping' },
    { Origin: 'https://attacker.example' },
  );
  assert.equal(foreign.status, 403);
  assert.deepEqual(foreign.json(), {
    error: 'The MCP server only accepts local requests',
  });
  assert.equal((await post({}, { Host: 'attacker.example' })).status, 403);
  assert.equal(
    (await post({}, { Host: `localhost.attacker.example:${port}` })).status,
    403,
  );
  // A Host naming another local port, a page on another port, and a request
  // a proxy forwarded are all refused, and no server is made for them.
  assert.equal((await post({}, { Host: `localhost:${port + 1}` })).status, 403);
  assert.equal(
    (await post({}, { Origin: `http://localhost:${port + 1}` })).status,
    403,
  );
  assert.equal(
    (await post({}, { 'X-Forwarded-For': '203.0.113.9' })).status,
    403,
  );
  assert.deepEqual(created, [`http://localhost:${port}`]);
  assert.equal((await send(port, 'GET')).status, 405);
});

test('a POST without a JSON Content-Type is refused before its body is read', async (t) => {
  let calls = 0;
  const port = await listen(
    t,
    localMcpPlugin({
      enabled: true,
      createServer: (options) => {
        calls += 1;
        return pingServer(options);
      },
    }),
  );
  for (const type of ['text/plain', 'application/x-www-form-urlencoded']) {
    const response = await send(
      port,
      'POST',
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { 'Content-Type': type },
    );
    assert.equal(response.status, 415, type);
  }
  assert.equal(calls, 0);
});

test('an oversized /mcp body is drained so its 413 is delivered', async (t) => {
  const port = await listen(
    t,
    localMcpPlugin({ enabled: true, createServer: pingServer }),
  );
  const response = await send(port, 'POST', 'x'.repeat(1024 * 1024 + 1));
  assert.equal(response.status, 413);
  assert.deepEqual(response.json(), { error: 'Request too large' });
});

test('a client that disconnects cancels its tool call', async (t) => {
  let seen;
  const started = Promise.withResolvers();
  const aborted = Promise.withResolvers();
  const port = await listen(
    t,
    localMcpPlugin({
      enabled: true,
      createServer: () => ({
        handle: (message, { signal }) => {
          seen = signal;
          signal.addEventListener('abort', () => aborted.resolve(), {
            once: true,
          });
          started.resolve();
          return new Promise(() => {});
        },
      }),
    }),
  );
  const request = httpRequest({
    host: '127.0.0.1',
    port,
    path: '/mcp',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Host: `localhost:${port}`,
    },
  });
  request.on('error', () => {});
  request.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call' }));
  await started.promise;
  assert.equal(seen.aborted, false);
  request.destroy();
  await aborted.promise;
  assert.equal(seen.aborted, true);
});
