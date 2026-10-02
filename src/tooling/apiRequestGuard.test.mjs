import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build, createServer, preview } from 'vite';
import {
  admitApiRequest,
  apiRequestGuardPlugin,
  isAllowedApiHost,
} from '../../server/standalone/api-request-guard.js';
import { makeFixtureRoot } from './fixtureRoot.mjs';

const LOCAL = ['localhost', '127.0.0.1', '.local'];

test('local names, IP literals and allowed names pass the Host check', () => {
  for (const hostname of [
    'localhost',
    'app.localhost',
    '127.0.0.1',
    '[::1]',
    '192.168.1.20',
    'studio.local',
    'local',
  ])
    assert.equal(isAllowedApiHost(hostname, LOCAL), true, hostname);
  assert.equal(isAllowedApiHost('desk.lan', [...LOCAL, 'desk.lan']), true);
});

test('a foreign Host is refused so DNS-rebinding pages cannot reach /api', () => {
  assert.deepEqual(
    admitApiRequest({
      hostHeader: 'evil.example.com:4173',
      allowedHosts: LOCAL,
    }),
    { ok: false, status: 403, error: 'Unrecognized Host refused' },
  );
  assert.equal(
    admitApiRequest({
      hostHeader: 'localhost.evil.example',
      allowedHosts: LOCAL,
    }).ok,
    false,
  );
  assert.equal(
    admitApiRequest({ hostHeader: '', allowedHosts: LOCAL }).ok,
    false,
  );
  assert.equal(
    admitApiRequest({ hostHeader: 'user@localhost', allowedHosts: LOCAL }).ok,
    false,
  );
});

test('a same-origin browser request passes', () => {
  assert.deepEqual(
    admitApiRequest({
      hostHeader: 'localhost:4173',
      origin: 'http://localhost:4173',
      fetchSite: 'same-origin',
      allowedHosts: LOCAL,
    }),
    { ok: true },
  );
});

test('a local tool without Origin or Sec-Fetch-Site passes', () => {
  assert.deepEqual(
    admitApiRequest({ hostHeader: '127.0.0.1:4173', allowedHosts: LOCAL }),
    { ok: true },
  );
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
      admitApiRequest({
        hostHeader: 'localhost:4173',
        origin,
        allowedHosts: LOCAL,
      }).ok,
      false,
      origin,
    );
});

test('a page served through an HTTPS proxy that keeps the Host passes', () => {
  // The microphone needs a secure context on any other device, so LAN voice
  // runs behind a TLS proxy while this server speaks plain HTTP.
  for (const hostHeader of ['vantage.local', 'vantage.local:443'])
    assert.deepEqual(
      admitApiRequest({
        hostHeader,
        origin: 'https://vantage.local',
        fetchSite: 'same-origin',
        allowedHosts: LOCAL,
      }),
      { ok: true },
      hostHeader,
    );
});

test('cross-site and same-site fetches are refused even without an Origin', () => {
  for (const fetchSite of ['cross-site', 'same-site'])
    assert.deepEqual(
      admitApiRequest({
        hostHeader: 'localhost:4173',
        fetchSite,
        allowedHosts: LOCAL,
      }),
      { ok: false, status: 403, error: 'Cross-site requests are refused' },
    );
  assert.equal(
    admitApiRequest({
      hostHeader: 'localhost:4173',
      fetchSite: 'none',
      allowedHosts: LOCAL,
    }).ok,
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

test('real dev and preview servers run the gate before provider middleware', async (t) => {
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
  const answer = (server) => {
    server.middlewares.use('/api/fixture', (_req, res) => res.end('reached'));
  };
  const provider = {
    name: 'fixture-provider',
    configureServer: answer,
    configurePreviewServer: answer,
  };
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
    const port = server.httpServer.address().port;
    const label = isPreview ? 'preview' : 'dev';
    try {
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
        assert.equal(
          refused.status,
          403,
          `${label} ${JSON.stringify(headers)}`,
        );
        assert.notEqual(refused.body, 'reached');
      }
    } finally {
      await server.close();
    }
  }
});
