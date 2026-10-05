import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  PANEL_BASE,
  PANEL_KEY_SETTINGS,
  panelBrowserKeys,
  panelBuildConfig,
  panelBuildPlugin,
  workerFilesPrelude,
} from '../../build/panel.js';
import { createBrowserViteConfig } from '../../build/vite.js';
import { panelRuntime } from '../app/globePanelRuntime.js';
import { EMBED_READY_MESSAGE, EMBED_VIEW_MESSAGE } from '../app/embed.js';

const KEY_WARNING = 'vantage-exposed-key-warning';

function buildWarnings(config) {
  const warnings = [];
  for (const plugin of config.plugins.filter(
    (entry) => entry.name === KEY_WARNING,
  ))
    plugin.buildStart.call({ warn: (message) => warnings.push(message) });
  return warnings;
}

test('the panel build is one script and one stylesheet under /panel/', () => {
  const config = panelBuildConfig({
    plugins: [],
    build: { chunkSizeWarningLimit: 1500 },
  });
  assert.equal(config.base, PANEL_BASE);
  assert.equal(config.build.outDir, 'dist/panel');
  assert.equal(config.build.cssCodeSplit, false);
  assert.equal(config.build.rollupOptions.output.inlineDynamicImports, true);
  assert.equal(config.build.chunkSizeWarningLimit, 1500);
});

test("the panel build is keyless by default, even when the app's keys are set", () => {
  const app = createBrowserViteConfig({
    googleApiKey: 'app-google-fixture',
    cesiumToken: 'app-ion-fixture',
  });
  const keys = panelBrowserKeys({
    GOOGLE_MAPS_API_KEY: 'app-google-fixture',
    CESIUM_ION_TOKEN: 'app-ion-fixture',
  });
  const config = panelBuildConfig(app, keys);
  assert.equal(config.define['import.meta.env.GOOGLE_MAPS_API_KEY'], undefined);
  assert.equal(config.define['import.meta.env.CESIUM_ION_TOKEN'], undefined);
  // The app's own key warning is replaced by the panel's, which stays quiet.
  assert.equal(
    config.plugins.filter((plugin) => plugin.name === KEY_WARNING).length,
    1,
  );
  assert.deepEqual(buildWarnings(config), []);
});

test('only the panel key settings put keys into the panel build, with a warning', () => {
  assert.deepEqual(PANEL_KEY_SETTINGS, {
    googleApiKey: 'VANTAGE_PANEL_GOOGLE_MAPS_API_KEY',
    cesiumToken: 'VANTAGE_PANEL_CESIUM_ION_TOKEN',
  });
  const keys = panelBrowserKeys({
    VANTAGE_PANEL_GOOGLE_MAPS_API_KEY: ' panel-google-fixture ',
    VANTAGE_PANEL_CESIUM_ION_TOKEN: 'panel-ion-fixture',
  });
  const config = panelBuildConfig(createBrowserViteConfig(), keys);
  assert.equal(
    config.define['import.meta.env.GOOGLE_MAPS_API_KEY'],
    '"panel-google-fixture"',
  );
  assert.equal(
    config.define['import.meta.env.CESIUM_ION_TOKEN'],
    '"panel-ion-fixture"',
  );
  const [warning] = buildWarnings(config);
  assert.match(warning, /^dist\/panel\/ will contain/);
  assert.match(
    warning,
    /VANTAGE_PANEL_GOOGLE_MAPS_API_KEY and VANTAGE_PANEL_CESIUM_ION_TOKEN/,
  );
  assert.match(warning, /MCP host/);
  assert.doesNotMatch(warning, /fixture/);
});

test('the panel runtime is self-contained source text that speaks embed mode', () => {
  const source = String(panelRuntime);
  assert.doesNotThrow(() => new Function(`return (${source});`));
  assert.ok(source.includes(`'${EMBED_VIEW_MESSAGE}'`));
  assert.ok(source.includes(`'${EMBED_READY_MESSAGE}'`));
  assert.match(source, /VANTAGE_EMBED_INLINE = true/);
  // Converted images are kept only for files of the panel build.
  assert.match(
    source,
    /if \(path\.startsWith\(config\.panelBase\)\) \{\n\s*fileUrls\.set/,
  );
});

test('the dev server serves the panel build and nothing outside it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'panel-build-'));
  try {
    await mkdir(join(root, 'out', 'assets'), { recursive: true });
    await writeFile(join(root, 'out', 'index.html'), '<p>panel</p>');
    await writeFile(join(root, 'out', 'assets', 'a.js'), 'x');
    await writeFile(join(root, 'secret.txt'), 'secret');
    let middleware;
    panelBuildPlugin({ outDir: 'out' }).configureServer({
      config: { root },
      middlewares: { use: (fn) => (middleware = fn) },
    });
    const get = (url) =>
      new Promise((resolve) => {
        const res = {
          statusCode: 200,
          headers: {},
          setHeader(name, value) {
            this.headers[name] = value;
          },
          end(body) {
            resolve({ status: this.statusCode, headers: this.headers, body });
          },
        };
        middleware({ url }, res, () => resolve({ passed: true }));
      });
    const page = await get('/panel/');
    assert.equal(String(page.body), '<p>panel</p>');
    assert.equal(page.headers['Content-Type'], 'text/html');
    const script = await get('/panel/assets/a.js');
    assert.equal(script.headers['Content-Type'], 'text/javascript');
    assert.equal((await get('/panel/missing.js')).status, 404);
    assert.equal((await get('/panel/%ZZ')).status, 400);
    assert.deepEqual(await get('/panel/..%2Fsecret.txt'), { passed: true });
    assert.deepEqual(await get('/other'), { passed: true });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Cesium's workers get embedded files from memory and other requests from the network", async () => {
  const sent = [];
  class FakeRequest extends EventTarget {
    open(method, url) {
      this.url = url;
    }
    setRequestHeader() {}
    send() {
      sent.push(this.url);
    }
  }
  const saved = {
    XMLHttpRequest: globalThis.XMLHttpRequest,
    ProgressEvent: globalThis.ProgressEvent,
  };
  globalThis.XMLHttpRequest = FakeRequest;
  globalThis.ProgressEvent ??= class extends Event {};
  try {
    new Function(workerFilesPrelude({ 'Assets/heights.json': '{"a":1}' }))();
    const embedded = new XMLHttpRequest();
    embedded.open(
      'GET',
      'https://panel.example/panel/cesium/Assets/heights.json?v=1',
    );
    embedded.setRequestHeader('Accept', 'application/json');
    embedded.responseType = 'text';
    const loaded = new Promise((resolve) =>
      embedded.addEventListener('load', resolve),
    );
    embedded.send();
    await loaded;
    assert.equal(embedded.status, 200);
    assert.equal(embedded.response, '{"a":1}');
    const other = new XMLHttpRequest();
    other.open('GET', 'https://tiles.example/1.png');
    other.send();
    assert.deepEqual(sent, ['https://tiles.example/1.png']);
  } finally {
    globalThis.XMLHttpRequest = saved.XMLHttpRequest;
    globalThis.ProgressEvent = saved.ProgressEvent;
  }
});
