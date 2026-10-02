/**
 * One raised, textured rectangle that weather layers draw over a
 * photorealistic 3D Tiles map, where globe imagery cannot drape. Shells are
 * kept first in the primitive collection in ascending height so higher
 * products draw over lower ones, and they rise with the camera over coarse
 * distant tiles.
 */

/** Metres above the ellipsoid. Lower shells draw first, so lightning draws last. */
export const WEATHER_SHELL_HEIGHTS = Object.freeze({
  wind: 5_000,
  clouds: 5_500,
  'clouds-regional': 5_800,
  radar: 6_200,
  lightning: 6_600,
});
const MATERIAL_TYPE = 'WeatherFrame';
// Renders after an image swap: one queues the upload, one uploads and draws, one spare.
const UPLOAD_FRAMES = 3;
// An empty detail window: the full-extent image shows everywhere.
const NO_WINDOW = Object.freeze({ west: 0, south: 0, east: -1, north: -1 });
const shellHeights = new WeakMap();
// From far away Google's coarse 3D tiles rise tens of kilometres above the
// ground and hide the shells, so the shells rise with the camera: 4 m per
// kilometre of camera height, at most 60 km, in 500 m steps.
const LIFT_PER_METRE = 0.004;
const MAX_LIFT = 60_000;
const LIFT_STEP = 500;
// Cesium binds a 1×1 white texture to an image uniform until its first upload:
// draw nothing until the full-extent image has arrived, and sample the detail
// image only once it has arrived. The window is west, south, east, north in the
// full-extent image's texture coordinates.
const MATERIAL_SOURCE = `czm_material czm_getMaterial(czm_materialInput materialInput)
{
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec2 st = materialInput.st;
  vec4 coarse = texture(image, st);
  vec2 dst = (st - window.xy) / max(window.zw - window.xy, vec2(1e-6));
  float inside = float(all(greaterThanEqual(st, window.xy)) && all(lessThanEqual(st, window.zw)));
  float useDetail = inside * step(1.5, float(detailDimensions.x));
  vec4 c = mix(coarse, texture(detail, clamp(dst, 0.0, 1.0)), useDetail);
  material.diffuse = czm_gammaCorrect(c.rgb);
  material.alpha = c.a * alpha * step(1.5, float(imageDimensions.x));
  return material;
}
`;

function registerMaterial(cesium) {
  const cache = cesium.Material._materialCache;
  if (cache.getMaterial(MATERIAL_TYPE)) return;
  // A plain template: building the first material from a fabric would make that
  // instance Cesium's shared template and keep its last image alive.
  cache.addMaterial(MATERIAL_TYPE, {
    fabric: {
      type: MATERIAL_TYPE,
      uniforms: {
        image: cesium.Material.DefaultImageId,
        detail: cesium.Material.DefaultImageId,
        alpha: 1,
        window: { type: 'vec4', x: 0, y: 0, z: -1, w: -1 },
      },
      // Diffuse and alpha share these samples, so one source, not components.
      source: MATERIAL_SOURCE,
    },
    translucent: false,
  });
}

const sameEdges = (a, b) =>
  a.west === b.west &&
  a.south === b.south &&
  a.east === b.east &&
  a.north === b.north;

/** Metres every shell rises for a camera this high above the ellipsoid. */
export function shellLift(cameraHeight) {
  if (!(cameraHeight > 0)) return 0;
  const lift = Math.min(MAX_LIFT, cameraHeight * LIFT_PER_METRE);
  return Math.round(lift / LIFT_STEP) * LIFT_STEP;
}

/** Keep weather shells first in the primitive collection, in ascending height:
 * higher shells draw over lower ones and other opaque content draws over both. */
export function orderWeatherShells(primitives, primitive, height) {
  shellHeights.set(primitive, height);
  if (typeof primitives.lowerToBottom !== 'function') return;
  const shells = [];
  for (let i = 0; i < primitives.length; i++) {
    const item = primitives.get(i);
    if (shellHeights.has(item)) shells.push(item);
  }
  const ordered = [...shells].sort(
    (a, b) => shellHeights.get(a) - shellHeights.get(b),
  );
  if (ordered.every((item, i) => primitives.get(i) === item)) return;
  for (const item of ordered.reverse()) primitives.lowerToBottom(item);
}

/** One raised rectangle drawing one full-extent image and, inside a window of
 * it, an optional detail image. The owner calls destroy(). */
export function createShellSurface({
  viewer,
  cesium,
  rectangle,
  height,
  onSettled = () => {},
}) {
  registerMaterial(cesium);
  const scene = viewer.scene;
  const primitives = scene.primitives;
  const material = new cesium.Material({
    fabric: { type: MATERIAL_TYPE },
    translucent: false,
  });
  // Flat shading keeps the product colours independent of the viewing angle.
  const appearance = new cesium.EllipsoidSurfaceAppearance({
    aboveGround: true,
    flat: true,
    translucent: false,
    material,
  });
  // Cesium orders its translucent pass itself (weighted OIT or distance), which
  // cannot honour stacked heights. Draw in the opaque pass in scene.primitives
  // order, alpha-blended and without depth writes, so higher shells draw over
  // lower ones and nothing is hidden or picked through a shell.
  appearance.getRenderState = () => ({
    depthTest: { enabled: true },
    depthMask: false,
    blending: cesium.BlendingState.ALPHA_BLEND,
  });
  const primitive = new cesium.Primitive({
    geometryInstances: new cesium.GeometryInstance({
      geometry: new cesium.RectangleGeometry({
        rectangle,
        height,
        granularity: cesium.Math.toRadians(0.5),
        vertexFormat: cesium.EllipsoidSurfaceAppearance.VERTEX_FORMAT,
      }),
    }),
    appearance,
    asynchronous: true,
    allowPicking: false,
  });
  primitives.add(primitive);
  orderWeatherShells(primitives, primitive, height);
  // A uniform scale about the Earth's centre lifts every shell alike and keeps
  // their order.
  let lift = 0;
  const offLift = scene.preRender?.addEventListener(() => {
    const next = shellLift(scene.camera?.positionCartographic?.height);
    if (next === lift) return;
    lift = next;
    primitive.modelMatrix = cesium.Matrix4.fromUniformScale(
      1 + lift / cesium.Ellipsoid.WGS84.maximumRadius,
    );
  });
  let image = null;
  let frames = 0;
  // The detail image, its own upload count and a window waiting for it to draw.
  let detail = null;
  let detailFrames = 0;
  let pendingWindow = null;
  let offRender = null;
  let destroyed = false;

  const fits = (size, value) =>
    !size || (size.x === value.width && size.y === value.height);
  const uploaded = () =>
    image !== null && fits(material.uniforms.imageDimensions, image);
  const detailDrawn = () =>
    detail !== null &&
    detailFrames === 0 &&
    fits(material.uniforms.detailDimensions, detail);
  const drawn = () =>
    primitive.ready &&
    uploaded() &&
    frames === 0 &&
    (detail === null || (detailDrawn() && pendingWindow === null));
  function appliedWindow() {
    const { x, y, z, w } = material.uniforms.window;
    return z < x ? null : { west: x, south: y, east: z, north: w };
  }
  function setWindow(rect) {
    const next = rect ?? NO_WINDOW;
    const { x, y, z, w } = material.uniforms.window;
    if (
      x === next.west &&
      y === next.south &&
      z === next.east &&
      w === next.north
    )
      return;
    material.uniforms.window = new cesium.Cartesian4(
      next.west,
      next.south,
      next.east,
      next.north,
    );
    scene.requestRender();
  }
  // The render governor may idle the scene; request frames only until the
  // asynchronous geometry is ready and the latest images have been drawn.
  function tick() {
    // Cesium updates a material only while its primitive is shown, so hidden
    // frames upload nothing and count for nothing.
    if (primitive.ready && primitive.show) {
      if (frames > 0) frames--;
      if (detailFrames > 0) detailFrames--;
      // A texture is never shown at another window's place.
      if (pendingWindow && detailDrawn()) {
        setWindow(pendingWindow);
        pendingWindow = null;
      }
    }
    if (primitive.show && !drawn()) {
      scene.requestRender();
      return;
    }
    offRender?.();
    offRender = null;
    if (drawn()) onSettled();
  }
  function wake() {
    if (destroyed || !primitive.show || image === null || drawn()) return;
    offRender ??= scene.postRender.addEventListener(tick);
    scene.requestRender();
  }

  return {
    setImage(next) {
      if (destroyed || next === image) return;
      image = next;
      material.uniforms.image = next;
      frames = UPLOAD_FRAMES;
      wake();
    },
    setAlpha(value) {
      if (destroyed || material.uniforms.alpha === value) return;
      material.uniforms.alpha = value;
      scene.requestRender();
    },
    /** Draw `next` inside `rect` (west, south, east, north in the full-extent
     * image's texture coordinates, 0–1); null clears it. In the same window only
     * the image changes, and Cesium keeps drawing the previous texture until
     * this one is uploaded. A different window applies once its image has
     * drawn; until then the full-extent image covers it. */
    setDetail(next, rect) {
      if (destroyed) return;
      if (!next) {
        if (detail === null) return;
        detail = null;
        detailFrames = 0;
        pendingWindow = null;
        material.uniforms.detail = cesium.Material.DefaultImageId;
        setWindow(null);
        scene.requestRender();
        return;
      }
      if (next !== detail) {
        detail = next;
        material.uniforms.detail = next;
        detailFrames = UPLOAD_FRAMES;
      }
      const applied = appliedWindow();
      if (applied && sameEdges(applied, rect)) {
        pendingWindow = null;
      } else {
        setWindow(null);
        pendingWindow = rect;
      }
      wake();
    },
    /** Returns whether visibility changed. */
    setShow(value) {
      const show = Boolean(value);
      if (destroyed || primitive.show === show) return false;
      primitive.show = show;
      wake();
      scene.requestRender();
      return true;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      offRender?.();
      offRender = null;
      offLift?.();
      if (!primitives.isDestroyed?.() && primitives.contains(primitive))
        primitives.remove(primitive);
      if (!primitive.isDestroyed()) primitive.destroy();
      // Primitive.destroy leaves the material and its texture alive.
      if (!material.isDestroyed()) material.destroy();
      image = null;
      detail = null;
      pendingWindow = null;
      scene.requestRender();
    },
    getDiagnostics() {
      return {
        height,
        ready: Boolean(primitive.ready),
        uploaded: uploaded(),
        show: primitive.show,
        alpha: material.uniforms.alpha,
        rendering: offRender !== null,
        // `uploaded` once the detail image has drawn; the window applies after.
        detail: { uploaded: detailDrawn(), window: appliedWindow() },
      };
    },
  };
}
