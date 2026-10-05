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

/**
 * The CSP_ORIGINS that join any of `directives`, in list order. The MCP
 * Apps panel declares these to its host, so the globe in a conversation
 * reaches the same providers the page does and no others.
 */
export function cspOriginsFor(directives) {
  const wanted = new Set(directives);
  return CSP_ORIGINS.filter((entry) =>
    entry.directives.some((name) => wanted.has(name)),
  ).map((entry) => entry.origin);
}

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

/**
 * @param {{frameAncestors?: string[]}} [options] Origins that may frame the
 *   document instead of none; only embed-mode documents get any.
 * @returns {Record<string, string[]>} directive name -> sources
 */
export function contentSecurityPolicyDirectives({ frameAncestors = [] } = {}) {
  const directives = Object.fromEntries(
    Object.entries(BASE_DIRECTIVES).map(([name, sources]) => [
      name,
      [...sources],
    ]),
  );
  for (const { origin, directives: names } of CSP_ORIGINS)
    for (const name of names) directives[name].push(origin);
  if (frameAncestors.length)
    directives['frame-ancestors'] = [...frameAncestors];
  return directives;
}

/** Serialize the policy for a response header, or for a <meta> tag. */
export function contentSecurityPolicy({
  meta = false,
  frameAncestors = [],
} = {}) {
  return Object.entries(contentSecurityPolicyDirectives({ frameAncestors }))
    .filter(([name]) => !(meta && HEADER_ONLY_DIRECTIVES.has(name)))
    .map(([name, sources]) =>
      sources.length ? `${name} ${sources.join(' ')}` : `${name} 'none'`,
    )
    .join('; ');
}

/** Google referrer-restricted keys and YouTube embeds need the origin. */
export const REFERRER_POLICY = 'strict-origin-when-cross-origin';

/**
 * Response headers for the dev and preview servers. `frameAncestors` lets
 * those origins frame the document: X-Frame-Options is dropped, since it
 * cannot name them, and frame-ancestors lists them. Report-only mode still
 * enforces the framing rule.
 */
export function securityHeaders({
  reportOnly = false,
  frameAncestors = [],
} = {}) {
  const framing = frameAncestors.length
    ? `frame-ancestors ${frameAncestors.join(' ')}`
    : "frame-ancestors 'none'";
  return {
    ...(frameAncestors.length ? {} : { 'X-Frame-Options': 'DENY' }),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': REFERRER_POLICY,
    [reportOnly
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy']: contentSecurityPolicy({ frameAncestors }),
    ...(reportOnly ? { 'Content-Security-Policy': framing } : {}),
  };
}

/**
 * The origins `VANTAGE_EMBED_FRAME_ANCESTORS` lets frame embed-mode
 * documents. Only explicit http(s) origins are accepted, separated by spaces
 * or commas; anything else (`*`, wildcards, keywords such as 'self', other
 * schemes, paths) is logged and ignored, so a typo can only narrow framing.
 * @returns {string[]}
 */
export function parseEmbedFrameAncestors(value, { warn = console.warn } = {}) {
  const origins = [];
  for (const entry of String(value ?? '').split(/[\s,]+/)) {
    if (!entry) continue;
    const origin = explicitOrigin(entry);
    if (origin) {
      if (!origins.includes(origin)) origins.push(origin);
      continue;
    }
    warn(
      `[vantage] VANTAGE_EMBED_FRAME_ANCESTORS: ignoring ${JSON.stringify(entry)}; only explicit http(s) origins such as https://example.com may frame embed mode.`,
    );
  }
  return origins;
}

/**
 * A host a CSP source expression can name: DNS labels or an IPv4 address.
 * The URL parser lets through characters such as ';' and quotes, which would
 * change the policy they are written into.
 */
const CSP_HOST = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/;

/** An entry's origin when it is exactly an http(s) origin, else null. */
function explicitOrigin(entry) {
  let url;
  try {
    url = new URL(entry);
  } catch {
    return null;
  }
  const exact =
    (url.protocol === 'https:' || url.protocol === 'http:') &&
    CSP_HOST.test(url.hostname) &&
    !url.username &&
    !url.password &&
    url.pathname === '/' &&
    !url.search &&
    !url.hash &&
    /^https?:\/\/[^/?#]+\/?$/i.test(entry);
  return exact ? url.origin : null;
}

/**
 * The paths that serve the app's document. Other HTML the dev server can
 * serve, such as the Provider Settings template, is never framed.
 */
const APP_DOCUMENT_PATHS = new Set(['/', '/index.html']);

/** Whether a request is for the app's own document in embed mode. */
function isEmbedDocumentRequest(url) {
  let parsed;
  try {
    parsed = new URL(url || '/', 'http://localhost');
  } catch {
    return false;
  }
  return (
    parsed.searchParams.get('embed') === '1' &&
    APP_DOCUMENT_PATHS.has(parsed.pathname)
  );
}

/**
 * Serve the security headers per request when embed framing is configured:
 * embed-mode documents get the full policy with frame-ancestors naming the
 * configured origins and no X-Frame-Options; every other response, Provider
 * Settings included, keeps X-Frame-Options DENY and frame-ancestors 'none'.
 * The server's static headers are left empty in that case (see vite.js), so
 * nothing written later overrides these.
 */
export function embedFramingPlugin({ frameAncestors, reportOnly = false }) {
  const framed = securityHeaders({ reportOnly, frameAncestors });
  const unframed = securityHeaders({ reportOnly });
  const install = (server) => {
    server.middlewares.use((req, res, next) => {
      const headers = isEmbedDocumentRequest(req.url) ? framed : unframed;
      for (const [name, value] of Object.entries(headers))
        res.setHeader(name, value);
      next();
    });
  };
  return {
    name: 'vantage-embed-framing',
    enforce: 'pre',
    configureServer: install,
    configurePreviewServer: install,
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
