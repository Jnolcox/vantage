import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createBrowserViteConfig,
  exposedKeyBuildWarning,
} from '../../build/vite.js';
import standaloneConfig, * as compatibility from '../../vite.config.js';
import * as providers from '../../server/providers/local.js';

test('explicit build inputs preserve browser-only defines, plugin order and loopback protections', () => {
  const plugin = { name: 'fixture-provider' };
  const config = createBrowserViteConfig({
    plugins: [plugin],
    googleApiKey: 'browser-fixture',
    cesiumToken: 'ion-fixture',
  });
  assert.equal(config.plugins[4], plugin);
  assert.equal(config.server.host, '127.0.0.1');
  assert.equal(config.server.port, 4173);
  assert.deepEqual(config.server.allowedHosts, ['localhost', '127.0.0.1']);
  assert.ok(config.server.fs.deny.includes('**/ENVIRONMENT'));
  assert.ok(config.server.fs.deny.includes('.env.*'));
  assert.equal(config.server.cors, false);
  assert.equal(config.preview.cors, false);
  assert.equal(config.server.headers['X-Frame-Options'], 'DENY');
  assert.match(
    config.server.headers['Content-Security-Policy'],
    /frame-ancestors 'none'/,
  );
  assert.deepEqual(config.define, {
    'import.meta.env.GOOGLE_MAPS_API_KEY': '"browser-fixture"',
    'import.meta.env.CESIUM_ION_TOKEN': '"ion-fixture"',
  });
  assert.deepEqual(
    createBrowserViteConfig({
      host: '0.0.0.0',
      port: '4800',
      allowedHosts: ['studio', 'vantage.local', 'localhost'],
    }).server.allowedHosts,
    ['localhost', '127.0.0.1', 'studio', 'vantage.local'],
  );
  assert.equal(
    createBrowserViteConfig({ host: '::', port: '4800' }).server.port,
    4800,
  );
});

test('build helper does not discover environment values or construct local providers', () => {
  const before = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = 'environment-fixture';
  try {
    const config = createBrowserViteConfig();
    assert.equal(
      config.define['import.meta.env.GOOGLE_MAPS_API_KEY'],
      undefined,
    );
    assert.equal(config.plugins.length, 4);
  } finally {
    if (before === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = before;
  }
});

test('root config retains existing named exports and standalone provider order', () => {
  for (const [name, value] of Object.entries(providers))
    assert.equal(compatibility[name], value, name);
  const config = standaloneConfig({ mode: 'test' });
  assert.equal(config.plugins[4].name, 'vantage-api-request-guard');
  assert.equal(config.plugins[4].enforce, 'pre');
  assert.deepEqual(
    config.plugins.slice(5, -1).map((plugin) => plugin.name),
    providers.localProviderPlugins().map((plugin) => plugin.name),
  );
  assert.equal(config.plugins.at(-2).name, 'vantage-key-setup');
  assert.equal(config.plugins.at(-1).name, 'api-not-found');
});

test('build export resolves in Node and has no browser fallback', async () => {
  const exported = await import('vantage/build/vite');
  assert.equal(exported.createBrowserViteConfig, createBrowserViteConfig);
  const pkg = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url)),
  );
  assert.deepEqual(pkg.exports['./build/vite'], { node: './build/vite.js' });
});

test('a build that embeds browser keys warns by name without printing values', () => {
  const warnings = [];
  exposedKeyBuildWarning({
    googleApiKey: 'browser-fixture',
    cesiumToken: 'ion-fixture',
  }).buildStart.call({ warn: (message) => warnings.push(message) });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /GOOGLE_MAPS_API_KEY and CESIUM_ION_TOKEN/);
  assert.doesNotMatch(warnings[0], /browser-fixture|ion-fixture/);
});

test('a keyless build stays quiet', () => {
  const warnings = [];
  const plugin = exposedKeyBuildWarning({ googleApiKey: ' ', cesiumToken: '' });
  plugin.buildStart.call({ warn: (message) => warnings.push(message) });
  assert.deepEqual(warnings, []);
  assert.equal(plugin.apply, 'build');
});
