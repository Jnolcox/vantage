import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build, createServer, preview } from 'vite';
import {
  admitApiRequest,
  admitRequestHost,
  apiRequestGuardPlugin,
  isAllowedApiHost,
} from '../../server/standalone/api-request-guard.js';
import { makeFixtureRoot } from './fixtureRoot.mjs';

const LOCAL = ['localhost', '127.0.0.1'];
// The TLS proxy name a LAN voice setup lists in VANTAGE_ALLOWED_HOSTS.
const WITH_PROXY_NAME = [...LOCAL, 'vantage.local'];

test('local names, IP literals and listed names pass the Host check', () => {
  for (const hostname of [
    'localhost',
    'app.localhost',
    '127.0.0.1',
    '[::1]',
    '192.168.1.20',
  ])
    assert.equal(isAllowedApiHost(hostname, LOCAL), true, hostname);
  assert.equal(isAllowedApiHost('desk.lan', [...LOCAL, 'desk.lan']), true);
});

test('a .local name passes only when it is listed', () => {
  assert.equal(isAllowedApiHost('studio.local', LOCAL), false);
  assert.equal(isAllowedApiHost('vantage.local', WITH_PROXY_NAME), true);
});

test('suffix and wildcard entries never match a host', () => {
  for (const entry of ['.local', '*.lan', 'desk*'])
    for (const hostname of ['studio.local', 'local', 'a.lan', 'desk1'])
      assert.equal(
        isAllowedApiHost(hostname, [...LOCAL, entry]),
        false,
        `${entry} ${hostname}`,
      );
});

test('a foreign Host is refused so DNS-rebinding pages cannot reach any route', () => {
  assert.deepEqual(
    admitRequestHost({
      hostHeader: 'evil.example.com:4173',
      allowedHosts: LOCAL,
    }),
    { ok: false, status: 403, error: 'Unrecognized Host refused' },
  );
  for (const hostHeader of [
    'localhost.evil.example',
    '',
    undefined,
    'user@localhost',
  ])
    assert.equal(
      admitRequestHost({ hostHeader, allowedHosts: LOCAL }).ok,
      false,
      String(hostHeader),
    );
});

test('a local or listed Host passes the Host check', () => {
  for (const hostHeader of ['localhost:4173', '[::1]:4173', 'vantage.local'])
    assert.deepEqual(
      admitRequestHost({ hostHeader, allowedHosts: WITH_PROXY_NAME }),
      { ok: true },
      hostHeader,
    );
});

test('a same-origin browser request passes', () => {
  assert.deepEqual(
    admitApiRequest({
      hostHeader: 'localhost:4173',
      origin: 'http://localhost:4173',
      fetchSite: 'same-origin',
    }),
    { ok: true },
  );
});

test('a local tool without Origin or Sec-Fetch-Site passes', () => {
  assert.deepEqual(admitApiRequest({ hostHeader: '127.0.0.1:4173' }), {
    ok: true,
  });
});

test('an Origin other than this server is refused', () => {
  for (const origin of [
    'https://evil.example.com',
    'http://localhost:3000',
    'http://localhost:443',
    'ftp://localhost:4173',
    'null',
  ])
    assert.equal(
      admitApiRequest({ hostHeader: 'localhost:4173', origin }).ok,
      false,
      origin,
    );
});

test('a page served through an HTTPS proxy that keeps the Host passes', () => {
  // The microphone needs a secure context on any other device, so LAN voice
  // runs behind a TLS proxy while this server speaks plain HTTP. The proxy
  // name must be listed for the Host check; the Origin check then compares
  // host and port only.
  for (const hostHeader of ['vantage.local', 'vantage.local:443']) {
    assert.deepEqual(
      admitRequestHost({ hostHeader, allowedHosts: WITH_PROXY_NAME }),
      { ok: true },
      hostHeader,
    );
    assert.deepEqual(
      admitApiRequest({
        hostHeader,
        origin: 'https://vantage.local',
        fetchSite: 'same-origin',
      }),
      { ok: true },
      hostHeader,
    );
  }
});

test('cross-site and same-site fetches are refused even without an Origin', () => {
  for (const fetchSite of ['cross-site', 'same-site'])
    assert.deepEqual(
      admitApiRequest({ hostHeader: 'localhost:4173', fetchSite }),
      { ok: false, status: 403, error: 'Cross-site requests are refused' },
    );
  assert.equal(
    admitApiRequest({ hostHeader: 'localhost:4173', fetchSite: 'none' }).ok,
    true,
  );
});

function rawRequest(port, route, headers) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port, path: route, headers, agent: false },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => (body += chunk));
        response.on('end', () =>
          resolve({ status: response.statusCode, body }),
        );
      },
    );
    request.on('error', reject);
    request.end();
  });
}

async function startFixtureServers(t) {
  const root = await makeFixtureRoot('vantage-api-guard-');
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'index.html'), '<!doctype html><p>ok</p>');
  const base = {
    root,
    configFile: false,
    envFile: false,
    publicDir: false,
    logLevel: 'silent',
  };
  await build(base);
  // Routes a plugin mounts both inside and outside /api, as /mcp and /panel/
  // later do.
  const answer = (server) => {
    server.middlewares.use('/api/fixture', (_req, res) => res.end('reached'));
    server.middlewares.use('/plugin-fixture', (_req, res) =>
      res.end('reached'),
    );
  };
  const provider = {
    name: 'fixture-provider',
    configureServer: answer,
    configurePreviewServer: answer,
  };
  return { base, provider };
}

async function eachServer(base, provider, run) {
  for (const isPreview of [false, true]) {
    const config = {
      ...base,
      plugins: [provider, apiRequestGuardPlugin()],
      server: { host: '127.0.0.1', port: 0, hmr: false, allowedHosts: LOCAL },
      preview: { host: '127.0.0.1', port: 0, allowedHosts: LOCAL },
    };
    const server = isPreview
      ? await preview(config)
      : await createServer(config);
    if (!isPreview) await server.listen();
    try {
      await run(
        server.httpServer.address().port,
        isPreview ? 'preview' : 'dev',
      );
    } finally {
      await server.close();
    }
  }
}

test('real dev and preview servers run the gate before provider middleware', async (t) => {
  const { base, provider } = await startFixtureServers(t);
  await eachServer(base, provider, async (port, label) => {
    const own = `localhost:${port}`;
    const allowed = await rawRequest(port, '/api/fixture', {
      Host: own,
      Origin: `http://${own}`,
      'Sec-Fetch-Site': 'same-origin',
    });
    assert.deepEqual(allowed, { status: 200, body: 'reached' }, label);
    for (const headers of [
      { Host: 'evil.example.com' },
      { Host: own, Origin: 'https://evil.example.com' },
      { Host: own, 'Sec-Fetch-Site': 'cross-site' },
    ]) {
      const refused = await rawRequest(port, '/api/fixture', headers);
      assert.equal(refused.status, 403, `${label} ${JSON.stringify(headers)}`);
      assert.notEqual(refused.body, 'reached');
    }
  });
});

test('an unlisted Host cannot reach a route outside /api on dev and preview', async (t) => {
  const { base, provider } = await startFixtureServers(t);
  await eachServer(base, provider, async (port, label) => {
    for (const route of ['/plugin-fixture', '/']) {
      const own = await rawRequest(port, route, { Host: `localhost:${port}` });
      assert.equal(own.status, 200, `${label} ${route} own host`);
      for (const host of [`evil.example:${port}`, `mybox.local:${port}`]) {
        const refused = await rawRequest(port, route, { Host: host });
        assert.equal(refused.status, 403, `${label} ${route} ${host}`);
        assert.notEqual(refused.body, 'reached');
      }
    }
  });
});
