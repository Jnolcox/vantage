/**
 * The page's Content-Security-Policy, built from one list of the third-party
 * origins the browser is allowed to reach and why.
 *
 * Everything not listed here goes through this server's own /api proxies
 * ('self'). Add an origin only together with the feature that needs it;
 * src/tooling/contentSecurityPolicy.test.mjs fails when browser code names a
 * host this list does not classify, so a new feature fails loudly in review
 * instead of silently in the browser.
 *
 * Each entry names the directives it joins. `implied` marks an origin the code
 * never spells out because an SDK reaches it on the code's behalf.
 */
export const CSP_ORIGINS = Object.freeze([
  // Google Maps Platform (browser key, referrer-restricted).
  {
    origin: 'https://maps.googleapis.com',
    directives: ['connect-src'],
    why: 'Geocoding search and reverse geocoding with the browser key',
  },
  {
    origin: 'https://tile.googleapis.com',
    directives: ['connect-src', 'img-src'],
    why: 'Google Photorealistic 3D Tiles requested by Cesium',
    implied: 'Cesium GoogleMaps.mapTilesApiEndpoint',
  },
  // Cesium ion (only with a configured CESIUM_ION_TOKEN).
  {
    origin: 'https://api.cesium.com',
    directives: ['connect-src', 'img-src'],
    why: 'ion asset endpoints for world terrain, imagery and Google 3D via ion',
    implied: 'Cesium Ion.defaultServer',
  },
  {
    origin: 'https://assets.ion.cesium.com',
    directives: ['connect-src', 'img-src'],
    why: 'ion-hosted terrain and tileset content and attribution images',
    implied: 'URLs returned by the ion asset endpoint',
  },
  {
    origin: 'https://assets.cesium.com',
    directives: ['connect-src', 'img-src'],
    why: 'ion-hosted assets on the legacy asset host',
    implied: 'URLs returned by the ion asset endpoint',
  },
  {
    origin: 'https://*.virtualearth.net',
    directives: ['connect-src', 'img-src'],
    why: 'Bing aerial imagery served through ion world imagery',
    implied: 'Cesium BingMapsImageryProvider metadata and tile subdomains',
  },
  {
    origin: 'https://atlas.microsoft.com',
    directives: ['connect-src', 'img-src'],
    why: 'Azure Maps aerial imagery when ion serves world imagery from Azure',
    implied: 'Cesium AzureMapsImageryProvider',
  },
  // Keyless basemaps, terrain and feeds.
  {
    origin: 'https://services.arcgisonline.com',
    directives: ['connect-src', 'img-src'],
    why: 'Esri World Imagery, the default keyless basemap',
  },
  {
    origin: 'https://tile.openstreetmap.org',
    directives: ['connect-src', 'img-src'],
    why: 'OpenStreetMap tiles, the basemap fallback',
  },
  {
    origin: 'https://terrain.reearth.land',
    directives: ['connect-src'],
    why: 'Keyless quantized-mesh terrain',
  },
  {
    origin: 'https://photon.komoot.io',
    directives: ['connect-src'],
    why: 'Keyless place search (query text and view bias)',
  },
  {
    origin: 'https://earthquake.usgs.gov',
    directives: ['connect-src'],
    why: 'USGS earthquake feed (no user data)',
  },
  // Recent Imagery: NASA, browser-direct and keyless, only after the operator
  // selects a box or presses SEARCH. NASA receives the box and the browser's
  // IP; a same-origin proxy would still have to forward the box.
  {
    origin: 'https://cmr.earthdata.nasa.gov',
    directives: ['connect-src'],
    why: 'NASA CMR granule search for the selected box (Recent Imagery)',
  },
  {
    origin: 'https://gibs.earthdata.nasa.gov',
    directives: ['connect-src', 'img-src'],
    why: 'NASA GIBS imagery tiles bounded to the selected box (Recent Imagery)',
  },
  {
    origin: 'https://wvs.earthdata.nasa.gov',
    directives: ['connect-src'],
    why: 'NASA Worldview snapshots: day thumbnails and PNG exports of the box',
  },
  // Voice.
  {
    origin: 'https://api.openai.com',
    directives: ['connect-src'],
    why: 'Realtime voice SDP exchange with the short-lived client secret',
  },
  // Bhote Koshi event pack evidence posters, fetched without cookies when the
  // event is opened.
  {
    origin: 'https://i.ytimg.com',
    directives: ['connect-src'],
    why: 'YouTube thumbnail images the event pack uses as evidence posters',
  },
  // Embedded witness media, loaded only after click-to-load consent.
  {
    origin: 'https://www.youtube-nocookie.com',
    directives: ['frame-src'],
    why: 'YouTube player frame (privacy-enhanced host)',
  },
  {
    origin: 'https://www.youtube.com',
    directives: ['script-src'],
    why: 'YouTube iframe API that stops trimmed clips on time',
  },
  {
    origin: 'https://www.facebook.com',
    directives: ['frame-src'],
    why: 'Facebook video plugin frame',
  },
  {
    origin: 'https://staticxx.facebook.com',
    directives: ['frame-src'],
    why: 'Facebook SDK cross-domain helper frame',
    implied: 'Facebook JavaScript SDK',
  },
  {
    origin: 'https://connect.facebook.net',
    directives: ['script-src'],
    why: 'Facebook JavaScript SDK that controls video playback',
  },
  {
    origin: 'https://platform.twitter.com',
    directives: ['script-src', 'frame-src'],
    why: 'X widgets script and the post frame it creates',
  },
  {
    origin: 'https://syndication.twitter.com',
    directives: ['frame-src'],
    why: 'X post content frame',
    implied: 'X widgets.js',
  },
]);

const SELF = "'self'";

/** Fixed directives; origins from CSP_ORIGINS are appended per directive. */
const BASE_DIRECTIVES = Object.freeze({
  'default-src': [SELF],
  // Cesium decodes Draco meshes and KTX2 textures with WebAssembly, and the
  // Knockout copy bundled in Cesium's widgets compiles its bindings with
  // new Function. The production Cesium.js starts each worker from a blob:
  // URL that importScripts its bundled worker code from another blob: URL;
  // only script already running on the page can mint one. Script origins
  // stay limited to the list below.
  'script-src': [SELF, 'blob:', "'wasm-unsafe-eval'", "'unsafe-eval'"],
  // Templates and Cesium set style attributes; no script runs from them.
  'style-src': [SELF, "'unsafe-inline'"],
  // Cesium textures arrive as blob: and data: URLs.
  'img-src': [SELF, 'data:', 'blob:'],
  'font-src': [SELF, 'data:'],
  // 'self' also covers the dev server's same-origin HMR websocket.
  'connect-src': [SELF, 'data:', 'blob:'],
  // Radio streams come from whichever HTTPS host a station publishes. Live
  // CCTV video plays from same-origin /api/cctv/media through hls.js, which
  // attaches a MediaSource blob: URL to the <video> element.
  'media-src': [SELF, 'blob:', 'https:'],
  // Cesium and the hls.js transmuxer start their workers from blob: URLs.
  'worker-src': [SELF, 'blob:'],
  'frame-src': [],
  'object-src': ["'none'"],
  'base-uri': [SELF],
  'form-action': [SELF],
  'frame-ancestors': ["'none'"],
});

/** Directives a <meta> policy cannot carry. */
const HEADER_ONLY_DIRECTIVES = new Set(['frame-ancestors']);

/** @returns {Record<string, string[]>} directive name -> sources */
export function contentSecurityPolicyDirectives() {
  const directives = Object.fromEntries(
    Object.entries(BASE_DIRECTIVES).map(([name, sources]) => [
      name,
      [...sources],
    ]),
  );
  for (const { origin, directives: names } of CSP_ORIGINS)
    for (const name of names) directives[name].push(origin);
  return directives;
}

/** Serialize the policy for a response header, or for a <meta> tag. */
export function contentSecurityPolicy({ meta = false } = {}) {
  return Object.entries(contentSecurityPolicyDirectives())
    .filter(([name]) => !(meta && HEADER_ONLY_DIRECTIVES.has(name)))
    .map(([name, sources]) =>
      sources.length ? `${name} ${sources.join(' ')}` : `${name} 'none'`,
    )
    .join('; ');
}

/** Google referrer-restricted keys and YouTube embeds need the origin. */
export const REFERRER_POLICY = 'strict-origin-when-cross-origin';

/** Response headers for the dev and preview servers. */
export function securityHeaders({ reportOnly = false } = {}) {
  return {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': REFERRER_POLICY,
    [reportOnly
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy']: contentSecurityPolicy(),
    ...(reportOnly
      ? { 'Content-Security-Policy': "frame-ancestors 'none'" }
      : {}),
  };
}

/**
 * Put the policy into built HTML as well, so a static host serving dist/
 * enforces it without extra configuration. frame-ancestors still needs a
 * header there; the dev and preview servers send one.
 */
export function contentSecurityPolicyHtmlPlugin({ reportOnly = false } = {}) {
  return {
    name: 'vantage-content-security-policy',
    apply: 'build',
    transformIndexHtml() {
      // Report-only cannot be expressed in a <meta> tag.
      if (reportOnly) return [];
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: contentSecurityPolicy({ meta: true }),
          },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}
