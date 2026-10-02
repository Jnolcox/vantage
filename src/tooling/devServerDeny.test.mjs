import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { createBrowserViteConfig } from '../../build/vite.js';
import { makeFixtureRoot } from './fixtureRoot.mjs';

function get(port, route) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      { host: '127.0.0.1', port, path: route, agent: false },
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
  });
}

test('the dev server never serves local caches or the voice transcript log', async (t) => {
  const root = await makeFixtureRoot('vantage-fs-deny-');
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'index.html'), '<!doctype html><p>ok</p>');
  await writeFile(path.join(root, 'public-note.txt'), 'served');
  const privateFiles = [
    '.vantage-logs/realtime-conversations.jsonl',
    '.vantage-cache/firms.json',
    '.gev-logs/realtime-conversations.jsonl',
    '.gev-cache/firms.json',
  ];
  for (const file of privateFiles) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), 'private-transcript');
  }
  const { server: serverOptions } = createBrowserViteConfig();
  const server = await createServer({
    root,
    configFile: false,
    envFile: false,
    publicDir: false,
    logLevel: 'silent',
    server: { ...serverOptions, port: 0, hmr: false, watch: null },
  });
  try {
    await server.listen();
    const port = server.httpServer.address().port;
    assert.equal((await get(port, '/public-note.txt')).body, 'served');
    for (const file of privateFiles) {
      const response = await get(port, `/${file}`);
      assert.notEqual(response.status, 200, file);
      assert.doesNotMatch(response.body, /private-transcript/, file);
    }
  } finally {
    await server.close();
  }
});
