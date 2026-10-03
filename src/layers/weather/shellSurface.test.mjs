import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  createShellSurface,
  orderWeatherShells,
  shellLift,
  WEATHER_SHELL_HEIGHTS,
} from './shellSurface.js';
import {
  createShellCesium,
  createShellScene,
  renderShells,
} from './shellFixture.mjs';

// The detail window uniform; NONE is the empty window.
const NONE = { x: 0, y: 0, z: -1, w: -1 };
const windowOf = (primitive) => {
  const { x, y, z, w } = primitive.appearance.material.uniforms.window;
  return { x, y, z, w };
};

test('shell heights stack every product with lightning highest', () => {
  assert.deepEqual(WEATHER_SHELL_HEIGHTS, {
    wind: 5_000,
    clouds: 5_500,
    'clouds-regional': 5_800,
    radar: 6_200,
    lightning: 6_600,
  });
});

test('surface builds a flat raised rectangle drawn in primitive order without depth writes', () => {
  const cesium = createShellCesium();
  const scene = createShellScene();
  const rectangle = Cesium.Rectangle.fromDegrees(-130, 20, -60, 55);
  const surface = createShellSurface({
    viewer: { scene },
    cesium,
    rectangle,
    height: 6_200,
  });
  const template = cesium.templates.get('WeatherFrame');
  assert.ok(!(template instanceof cesium.Material), 'plain template');
  assert.deepEqual(template.fabric.uniforms, {
    image: Cesium.Material.DefaultImageId,
    detail: Cesium.Material.DefaultImageId,
    alpha: 1,
    window: { type: 'vec4', x: 0, y: 0, z: -1, w: -1 },
  });
  const { source } = template.fabric;
  assert.match(
    source,
    /material\.alpha = c\.a \* alpha \* step\(1\.5, float\(imageDimensions\.x\)\);/,
    'nothing draws before the full-extent image',
  );
  assert.match(
    source,
    /float useDetail = inside \* step\(1\.5, float\(detailDimensions\.x\)\);/,
    'the detail image is sampled only once it has arrived',
  );
  assert.match(
    source,
    /all\(greaterThanEqual\(st, window\.xy\)\) && all\(lessThanEqual\(st, window\.zw\)\)/,
  );
  assert.match(
    source,
    /mix\(coarse, texture\(detail, clamp\(dst, 0\.0, 1\.0\)\), useDetail\)/,
  );
  assert.match(source, /material\.diffuse = czm_gammaCorrect\(c\.rgb\);/);
  const [primitive] = scene.primitives.items;
  const appearance = primitive.appearance;
  assert.equal(appearance.material.options.translucent, false);
  assert.deepEqual(
    { ...appearance.options, material: undefined },
    {
      aboveGround: true,
      flat: true,
      translucent: false,
      material: undefined,
    },
  );
  assert.deepEqual(appearance.getRenderState(), {
    depthTest: { enabled: true },
    depthMask: false,
    blending: Cesium.BlendingState.ALPHA_BLEND,
  });
  const geometry = primitive.options.geometryInstances.geometry.options;
  assert.equal(geometry.rectangle, rectangle);
  assert.equal(geometry.height, 6_200);
  assert.equal(geometry.granularity, Cesium.Math.toRadians(0.5));
  assert.equal(
    geometry.vertexFormat,
    Cesium.EllipsoidSurfaceAppearance.VERTEX_FORMAT,
  );
  assert.equal(primitive.options.asynchronous, true);
  assert.equal(primitive.options.allowPicking, false);
  const lower = createShellSurface({
    viewer: { scene },
    cesium,
    rectangle,
    height: 5_000,
  });
  assert.equal(cesium.templates.size, 1, 'the template registers once');
  assert.deepEqual(
    scene.primitives.items.map(
      (item) => item.options.geometryInstances.geometry.options.height,
    ),
    [5_000, 6_200],
  );
  lower.destroy();
  surface.destroy();
});

test('a surface applies a new detail window only once its image has drawn; the same window swaps only the image', () => {
  const cesium = createShellCesium();
  const scene = createShellScene();
  const surface = createShellSurface({
    viewer: { scene },
    cesium,
    rectangle: Cesium.Rectangle.fromDegrees(-130, 20, -60, 55),
    height: 6_200,
  });
  const [primitive] = scene.primitives.items;
  const { uniforms } = primitive.appearance.material;
  const render = (count) => renderShells(cesium, scene, count);
  const image = () => ({ width: 4096, height: 2048 });
  surface.setImage(image());
  render();
  assert.deepEqual(surface.getDiagnostics().detail, {
    uploaded: false,
    window: null,
  });
  const a = { west: 0.25, south: 0.5, east: 0.5, north: 0.75 };
  const first = image();
  surface.setDetail(first, a);
  assert.equal(uniforms.detail, first);
  assert.deepEqual(windowOf(primitive), NONE, 'the full-extent image covers');
  assert.equal(scene.postRender.size, 1, 'renders until the detail has drawn');
  render(2);
  assert.deepEqual(windowOf(primitive), NONE);
  render(1);
  assert.deepEqual(windowOf(primitive), { x: 0.25, y: 0.5, z: 0.5, w: 0.75 });
  assert.ok(uniforms.window instanceof Cesium.Cartesian4);
  assert.deepEqual(surface.getDiagnostics().detail, {
    uploaded: true,
    window: a,
  });
  assert.equal(scene.postRender.size, 0);

  // A time change in the same window: Cesium keeps drawing the previous
  // texture until the new one is uploaded, so the window stays.
  const applied = uniforms.window;
  const second = image();
  surface.setDetail(second, { ...a });
  assert.equal(uniforms.detail, second);
  assert.equal(uniforms.window, applied, 'only the image is written');
  assert.equal(surface.getDiagnostics().detail.uploaded, false);
  render();
  assert.equal(surface.getDiagnostics().detail.uploaded, true);
  assert.equal(uniforms.window, applied);
  const renders = scene.renders;
  surface.setDetail(second, { ...a });
  assert.equal(scene.renders, renders, 'an unchanged detail costs nothing');
  assert.equal(scene.postRender.size, 0);

  // A different window empties at once and applies once its image has drawn.
  const b = { west: 0.5, south: 0.25, east: 0.75, north: 0.5 };
  surface.setDetail(image(), b);
  assert.deepEqual(windowOf(primitive), NONE);
  render(2);
  assert.deepEqual(windowOf(primitive), NONE);
  render(1);
  assert.deepEqual(windowOf(primitive), { x: 0.5, y: 0.25, z: 0.75, w: 0.5 });

  surface.setDetail(null);
  assert.equal(uniforms.detail, Cesium.Material.DefaultImageId);
  assert.deepEqual(windowOf(primitive), NONE);
  assert.deepEqual(surface.getDiagnostics().detail, {
    uploaded: false,
    window: null,
  });
  render();
  assert.deepEqual(
    { ...uniforms.detailDimensions },
    { type: 'ivec3', x: 1, y: 1 },
  );
  // Counted renders alone are not enough: the bound texture must be this image.
  surface.setDetail(image(), a);
  for (let i = 0; i < 4; i++) scene.postRender.emit();
  assert.deepEqual(windowOf(primitive), NONE, 'still the 1×1 default');
  render(1);
  assert.deepEqual(windowOf(primitive), { x: 0.25, y: 0.5, z: 0.5, w: 0.75 });
  surface.destroy();
  surface.setDetail(image(), b);
  assert.deepEqual(windowOf(primitive), { x: 0.25, y: 0.5, z: 0.5, w: 0.75 });
  assert.equal(scene.postRender.size, 0);
});

test('hidden frames do not count towards a pending detail window', () => {
  const cesium = createShellCesium();
  const scene = createShellScene();
  const surface = createShellSurface({
    viewer: { scene },
    cesium,
    rectangle: Cesium.Rectangle.fromDegrees(-130, 20, -60, 55),
    height: 6_200,
  });
  const [primitive] = scene.primitives.items;
  const render = (count) => renderShells(cesium, scene, count);
  const image = () => ({ width: 4096, height: 2048 });
  surface.setImage(image());
  const a = { west: 0.25, south: 0.5, east: 0.5, north: 0.75 };
  surface.setDetail(image(), a);
  render();
  assert.deepEqual(windowOf(primitive), { x: 0.25, y: 0.5, z: 0.5, w: 0.75 });
  // A different window with a same-sized image: the dimensions alone cannot
  // tell the textures apart, so only shown frames may count.
  const b = { west: 0.5, south: 0.25, east: 0.75, north: 0.5 };
  surface.setDetail(image(), b);
  assert.deepEqual(windowOf(primitive), NONE);
  for (let i = 0; i < 3; i++) {
    surface.setShow(false);
    scene.postRender.emit();
    surface.setShow(true);
  }
  assert.deepEqual(windowOf(primitive), NONE, 'hidden frames counted nothing');
  render(2);
  assert.deepEqual(windowOf(primitive), NONE);
  render(1);
  assert.deepEqual(windowOf(primitive), { x: 0.5, y: 0.25, z: 0.75, w: 0.5 });
});

test('shells rise with the camera over coarse 3D tiles, in steps, up to 60 km', () => {
  assert.equal(shellLift(undefined), 0);
  assert.equal(shellLift(1_200), 0, 'city views keep the shell heights');
  assert.equal(shellLift(3_000_000), 12_000);
  assert.equal(shellLift(8_000_000), 32_000);
  assert.equal(shellLift(18_500_000), 60_000);
  const camera = { positionCartographic: { height: 1_200 } };
  const scene = {
    primitives: new Cesium.PrimitiveCollection(),
    preRender: new Cesium.Event(),
    postRender: new Cesium.Event(),
    camera,
    requestRender() {},
  };
  const surface = createShellSurface({
    viewer: { scene },
    cesium: Cesium,
    rectangle: Cesium.Rectangle.fromDegrees(-130, 20, -60, 55),
    height: 5_800,
  });
  const primitive = scene.primitives.get(0);
  const identity = primitive.modelMatrix;
  scene.preRender.raiseEvent();
  assert.equal(primitive.modelMatrix, identity, 'no lift, no new matrix');
  camera.positionCartographic.height = 8_000_000;
  scene.preRender.raiseEvent();
  const radius = Cesium.Ellipsoid.WGS84.maximumRadius;
  assert.ok(
    Math.abs(primitive.modelMatrix[0] * radius - (radius + 32_000)) < 1e-3,
  );
  const lifted = primitive.modelMatrix;
  camera.positionCartographic.height = 8_010_000;
  scene.preRender.raiseEvent();
  assert.equal(primitive.modelMatrix, lifted, 'the same step keeps the matrix');
  surface.destroy();
  assert.equal(scene.preRender.numberOfListeners, 0);
});

test('real Cesium builds the two-texture material, the opaque-pass appearance and the rectangle primitive', () => {
  const scene = {
    primitives: new Cesium.PrimitiveCollection(),
    postRender: new Cesium.Event(),
    requestRender() {},
  };
  const surface = createShellSurface({
    viewer: { scene },
    cesium: Cesium,
    rectangle: Cesium.Rectangle.fromDegrees(-130, 20, -60, 55),
    height: 6_600,
  });
  const cached = Cesium.Material._materialCache.getMaterial('WeatherFrame');
  assert.ok(cached && !(cached instanceof Cesium.Material));
  const primitive = scene.primitives.get(0);
  const material = primitive.appearance.material;
  assert.ok(primitive instanceof Cesium.Primitive);
  assert.equal(material.type, 'WeatherFrame');
  assert.equal(material.isTranslucent(), false);
  assert.equal(primitive.appearance.isTranslucent(), false, 'opaque pass');
  assert.equal(primitive.appearance.getRenderState().depthMask, false);
  assert.equal(
    Cesium.Appearance.prototype.getRenderState.call(primitive.appearance)
      .depthMask,
    true,
    'the default opaque render state would write depth',
  );
  assert.deepEqual(
    [material.uniforms.imageDimensions.x, material.uniforms.detailDimensions.x],
    [1, 1],
    'Cesium tracks both bound texture sizes',
  );
  const shader = material.shaderSource;
  for (const declaration of [
    /uniform sampler2D image_\d+;/,
    /uniform sampler2D detail_\d+;/,
    /uniform float alpha_\d+;/,
    /uniform vec4 window_\d+;/,
    /uniform ivec3 imageDimensions_\d+;/,
    /uniform ivec3 detailDimensions_\d+;/,
  ])
    assert.match(shader, declaration);
  assert.match(shader, /texture\(image_\d+, st\)/);
  assert.match(shader, /texture\(detail_\d+, clamp\(dst, 0\.0, 1\.0\)\)/);
  assert.match(shader, /lessThanEqual\(st, window_\d+\.zw\)/);
  assert.match(shader, /step\(1\.5, float\(detailDimensions_\d+\.x\)\)/);
  assert.match(
    shader,
    /material\.alpha = c\.a \* alpha_\d+ \* step\(1\.5, float\(imageDimensions_\d+\.x\)\);/,
    'the uniform is renamed, the material field is not',
  );
  assert.match(shader, /float useDetail = inside \* step/, 'locals keep names');
  const detail = { width: 4096, height: 2048 };
  surface.setDetail(detail, { west: 0.1, south: 0.2, east: 0.3, north: 0.4 });
  assert.equal(material.uniforms.detail, detail);
  assert.deepEqual(
    [material.uniforms.window.z, material.uniforms.window.w],
    [-1, -1],
    'no window before the image has drawn',
  );
  surface.setDetail(null);
  assert.equal(material.uniforms.detail, Cesium.Material.DefaultImageId);
  surface.setAlpha(0.4);
  assert.equal(material.uniforms.alpha, 0.4);
  surface.destroy();
  assert.equal(scene.primitives.length, 0);
  assert.equal(primitive.isDestroyed(), true);
  assert.equal(material.isDestroyed(), true);
  assert.equal(scene.postRender.numberOfListeners, 0);
});

test('shells draw first, in height order, regardless of add order', () => {
  const scene = createShellScene();
  const other = { name: 'other' };
  scene.primitives.add(other);
  const add = (name, height) => {
    const primitive = { name };
    scene.primitives.add(primitive);
    orderWeatherShells(scene.primitives, primitive, height);
    return primitive;
  };
  add('lightning', 6_600);
  add('radar', 6_200);
  add('wind', 5_000);
  const later = { name: 'later' };
  scene.primitives.add(later);
  add('regional', 5_800);
  assert.deepEqual(
    scene.primitives.items.map(({ name }) => name),
    ['wind', 'regional', 'radar', 'lightning', 'other', 'later'],
  );
  const primitives = new Cesium.PrimitiveCollection({
    destroyPrimitives: false,
  });
  const real = (name) => ({ name, update() {}, isDestroyed: () => false });
  const tileset = primitives.add(real('tileset'));
  const lightning = primitives.add(real('lightning'));
  orderWeatherShells(primitives, lightning, 6_600);
  const radar = primitives.add(real('radar'));
  orderWeatherShells(primitives, radar, 6_200);
  assert.deepEqual(
    [0, 1, 2].map((i) => primitives.get(i).name),
    ['radar', 'lightning', 'tileset'],
    'real Cesium collection order',
  );
  assert.equal(tileset.name, 'tileset');
});
