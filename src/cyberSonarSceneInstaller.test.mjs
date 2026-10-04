import test from 'node:test';
import assert from 'node:assert/strict';
import { createCyberSonarSceneInstaller } from './cyberSonarSceneInstaller.js';

class FakeMutationObserver {
  static instances = [];
  constructor(callback) {
    this.callback = callback;
    this.connected = false;
    FakeMutationObserver.instances.push(this);
  }
  observe(target, options) {
    this.target = target;
    this.options = options;
    this.connected = true;
  }
  disconnect() {
    this.connected = false;
  }
}

function setTheme(root, theme) {
  if (theme) root.dataset.uiTheme = theme;
  else delete root.dataset.uiTheme;
  for (const observer of FakeMutationObserver.instances)
    if (observer.connected && observer.target === root) observer.callback();
}

function harness() {
  FakeMutationObserver.instances = [];
  const root = { dataset: {} };
  const viewer = {
    scene: {
      renders: 0,
      requestRender() {
        this.renders++;
      },
    },
  };
  const manager = {};
  const scenes = [];
  let loads = 0;
  const loadScene = async () => {
    loads++;
    return {
      createCyberSonarScene(sceneViewer, sceneManager) {
        const record = {
          viewer: sceneViewer,
          manager: sceneManager,
          disposed: 0,
        };
        scenes.push(record);
        return () => record.disposed++;
      },
    };
  };
  return {
    root,
    viewer,
    manager,
    scenes,
    loads: () => loads,
    install: (options = {}) =>
      createCyberSonarSceneInstaller(viewer, manager, {
        root,
        MutationObserverImpl: FakeMutationObserver,
        loadScene,
        ...options,
      }),
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('other HUD themes never load or install the sonar scene hook', async () => {
  const h = harness();
  h.install();
  setTheme(h.root, undefined);
  await settle();
  assert.equal(h.loads(), 0);
  assert.equal(h.scenes.length, 0);
});

test('the observer watches only the UI theme attribute', () => {
  const h = harness();
  h.install();
  const [observer] = FakeMutationObserver.instances;
  assert.equal(observer.target, h.root);
  assert.deepEqual(observer.options, {
    attributes: true,
    attributeFilter: ['data-ui-theme'],
  });
});

test('selecting Cyber installs the sonar scene for the viewer and data manager', async () => {
  const h = harness();
  h.install();
  setTheme(h.root, 'cyber');
  await settle();
  assert.equal(h.scenes.length, 1);
  assert.equal(h.scenes[0].viewer, h.viewer);
  assert.equal(h.scenes[0].manager, h.manager);
  assert.ok(h.viewer.scene.renders > 0, 'installing requests a fresh frame');
});

test('a page restored into Cyber installs the hook immediately', async () => {
  const h = harness();
  h.root.dataset.uiTheme = 'cyber';
  h.install();
  await settle();
  assert.equal(h.scenes.length, 1);
});

test('leaving Cyber disposes the hook and requests a restoring frame', async () => {
  const h = harness();
  h.install();
  setTheme(h.root, 'cyber');
  await settle();
  const renders = h.viewer.scene.renders;
  setTheme(h.root, undefined);
  assert.equal(h.scenes[0].disposed, 1);
  assert.ok(h.viewer.scene.renders > renders);
});

test('re-entering Cyber installs a fresh hook without reloading the module twice in flight', async () => {
  const h = harness();
  h.install();
  setTheme(h.root, 'cyber');
  setTheme(h.root, 'cyber');
  await settle();
  setTheme(h.root, undefined);
  setTheme(h.root, 'cyber');
  await settle();
  assert.equal(h.scenes.length, 2);
  assert.equal(h.scenes[0].disposed, 1);
  assert.equal(h.scenes[1].disposed, 0);
  assert.equal(h.loads(), 2);
});

test('leaving Cyber while the module loads never installs the hook', async () => {
  const h = harness();
  h.install();
  setTheme(h.root, 'cyber');
  setTheme(h.root, undefined);
  await settle();
  assert.equal(h.scenes.length, 0);
});

test('destroying the installer disposes the hook and stops observing', async () => {
  const h = harness();
  const destroy = h.install();
  setTheme(h.root, 'cyber');
  await settle();
  destroy();
  assert.equal(h.scenes[0].disposed, 1);
  assert.equal(FakeMutationObserver.instances[0].connected, false);
  destroy();
  assert.equal(h.scenes[0].disposed, 1);
});

test('a module load failure is reported and leaves the native rendering untouched', async () => {
  const h = harness();
  const errors = [];
  h.install({
    loadScene: async () => {
      throw new Error('chunk failed');
    },
    onError: (error) => errors.push(error.message),
  });
  setTheme(h.root, 'cyber');
  await settle();
  assert.deepEqual(errors, ['chunk failed']);
  assert.equal(h.scenes.length, 0);
});

test('without a DOM the installer is an inert no-op', () => {
  const destroy = createCyberSonarSceneInstaller({}, {}, { root: undefined });
  assert.equal(typeof destroy, 'function');
  destroy();
});
