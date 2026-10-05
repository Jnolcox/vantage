import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createBrowserViteConfig,
  exposedKeyBuildWarning,
} from '../../build/vite.js';
import {
  contentSecurityPolicy,
  parseEmbedFrameAncestors,
  securityHeaders,
} from '../../build/content-security-policy.js';
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
    config.plugins.slice(5, -3).map((plugin) => plugin.name),
    providers.localProviderPlugins().map((plugin) => plugin.name),
  );
  assert.equal(config.plugins.at(-4).name, 'vantage-key-setup');
  // The local MCP route follows every provider and precedes the API fallback.
  assert.equal(config.plugins.at(-3).name, 'local-mcp');
  // The panel build is served behind the guard's Host check.
  assert.equal(config.plugins.at(-2).name, 'vantage-panel-build');
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

test('embed framing is refused by default: every document stays unframable', () => {
  const config = createBrowserViteConfig();
  assert.equal(
    config.plugins.some((plugin) => plugin.name === 'vantage-embed-framing'),
    false,
  );
  for (const headers of [config.server.headers, config.preview.headers]) {
    assert.equal(headers['X-Frame-Options'], 'DENY');
    assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  }
});

test('only explicit http(s) origins may be allowed to frame embed mode', () => {
  const warnings = [];
  const warn = (message) => warnings.push(message);
  assert.deepEqual(
    parseEmbedFrameAncestors(
      'https://a.example, http://localhost:3000 https://a.example/ https://B.example:8443',
      { warn },
    ),
    ['https://a.example', 'http://localhost:3000', 'https://b.example:8443'],
  );
  assert.deepEqual(warnings, []);
  const refused = [
    '*',
    'https://*.example.com',
    "'self'",
    "'none'",
    'https:',
    'data:',
    'example.com',
    'ftp://a.example',
    'https://a.example/app',
    'https://a.example/?x=1',
    'https://user@a.example',
    'https://a.example;script-src',
    "https://a'b.example",
    'http://[::1]:3000',
  ];
  assert.deepEqual(parseEmbedFrameAncestors(refused.join(' '), { warn }), []);
  assert.equal(warnings.length, refused.length);
  assert.match(warnings[0], /VANTAGE_EMBED_FRAME_ANCESTORS: ignoring "\*"/);
  assert.deepEqual(parseEmbedFrameAncestors(undefined, { warn }), []);
  assert.deepEqual(parseEmbedFrameAncestors('  ', { warn }), []);
});

test('the standalone server reads only VANTAGE_EMBED_FRAME_ANCESTORS and refuses *', () => {
  const before = {
    current: process.env.VANTAGE_EMBED_FRAME_ANCESTORS,
    legacy: process.env.GEV_EMBED_FRAME_ANCESTORS,
  };
  const originalWarn = console.warn;
  console.warn = () => {};
  const framing = (config) =>
    config.plugins.some((plugin) => plugin.name === 'vantage-embed-framing');
  try {
    delete process.env.VANTAGE_EMBED_FRAME_ANCESTORS;
    process.env.GEV_EMBED_FRAME_ANCESTORS = 'https://a.example';
    assert.equal(framing(standaloneConfig({ mode: 'test' })), false);
    process.env.VANTAGE_EMBED_FRAME_ANCESTORS = '*';
    const anyPage = standaloneConfig({ mode: 'test' });
    assert.equal(framing(anyPage), false);
    assert.equal(anyPage.server.headers['X-Frame-Options'], 'DENY');
    process.env.VANTAGE_EMBED_FRAME_ANCESTORS = 'https://a.example';
    assert.equal(framing(standaloneConfig({ mode: 'test' })), true);
  } finally {
    console.warn = originalWarn;
    for (const [name, value] of [
      ['VANTAGE_EMBED_FRAME_ANCESTORS', before.current],
      ['GEV_EMBED_FRAME_ANCESTORS', before.legacy],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

/** Run a framing plugin's middleware for one request and return its headers. */
function framingHeaders(plugin, url, hook = 'configureServer') {
  let middleware;
  plugin[hook]({ middlewares: { use: (handler) => (middleware = handler) } });
  const headers = {};
  let continued = false;
  middleware(
    { url },
    { setHeader: (name, value) => (headers[name] = value) },
    () => (continued = true),
  );
  assert.equal(continued, true);
  return headers;
}

test('listed origins may frame embed-mode documents only, with the policy otherwise intact', () => {
  const config = createBrowserViteConfig({
    embedFrameAncestors: ['https://a.example', 'http://localhost:3000'],
  });
  // Nothing static is left for the server to write over the per-request
  // headers.
  assert.deepEqual(config.server.headers, {});
  assert.deepEqual(config.preview.headers, {});
  const plugin = config.plugins.find(
    (candidate) => candidate.name === 'vantage-embed-framing',
  );
  assert.ok(plugin);
  for (const hook of ['configureServer', 'configurePreviewServer']) {
    for (const url of ['/?embed=1', '/index.html?embed=1#v=2']) {
      const embedded = framingHeaders(plugin, url, hook);
      assert.equal(embedded['X-Frame-Options'], undefined);
      assert.equal(
        embedded['Content-Security-Policy'],
        contentSecurityPolicy().replace(
          "frame-ancestors 'none'",
          'frame-ancestors https://a.example http://localhost:3000',
        ),
      );
      assert.equal(embedded['X-Content-Type-Options'], 'nosniff');
    }
    for (const url of [
      '/',
      '/?embed=0',
      '/api/x?embed=1',
      '/src/main.js?embed=1',
      '/src/ui/templates/provider-settings.html?embed=1',
    ]) {
      assert.deepEqual(
        framingHeaders(plugin, url, hook),
        securityHeaders(),
        url,
      );
    }
  }
});

test('report-only mode still enforces the embed framing rule', () => {
  const plugin = createBrowserViteConfig({
    cspReportOnly: true,
    embedFrameAncestors: ['https://a.example'],
  }).plugins.find((candidate) => candidate.name === 'vantage-embed-framing');
  const embedded = framingHeaders(plugin, '/?embed=1');
  assert.equal(
    embedded['Content-Security-Policy'],
    'frame-ancestors https://a.example',
  );
  assert.match(
    embedded['Content-Security-Policy-Report-Only'],
    /frame-ancestors https:\/\/a\.example$/,
  );
  assert.equal(embedded['X-Frame-Options'], undefined);
  const normal = framingHeaders(plugin, '/');
  assert.equal(normal['Content-Security-Policy'], "frame-ancestors 'none'");
  assert.equal(normal['X-Frame-Options'], 'DENY');
});
