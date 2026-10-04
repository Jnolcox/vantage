import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CSP_ORIGINS,
  REFERRER_POLICY,
  contentSecurityPolicy,
  contentSecurityPolicyDirectives,
  contentSecurityPolicyHtmlPlugin,
  securityHeaders,
} from '../../build/content-security-policy.js';
import { createBrowserViteConfig } from '../../build/vite.js';

const root = fileURLToPath(new URL('../..', import.meta.url));

/*
 * Hosts that browser code names but the browser never contacts directly.
 * When this test fails on a new host, decide which it is: add it to
 * CSP_ORIGINS in build/content-security-policy.js if the page itself loads
 * from it, or to one of these lists if it is only a link or a server-side
 * upstream reached through /api.
 */
const REACHED_THROUGH_API_PROXY = [
  // Feeds and upstreams the browser hands to /api/* routes, or names in
  // modules shared with the server.
  'api.entur.io',
  'austin.publicbikesystem.net',
  'cdn.mbta.com',
  'celestrak.org',
  'chat.publicbikesystem.net',
  'firms.modaps.eosdis.nasa.gov',
  'gbfs.bcycle.com',
  'gbfs.biketownpdx.com',
  'gbfs.bluebikes.com',
  'gbfs.cogobikeshare.com',
  'gbfs.lyft.com',
  'gtfs.ovapi.nl',
  'gtfsrt.api.translink.com.au',
  'hon.publicbikesystem.net',
  'll.thespacedevs.com',
  'realtime.hsl.fi',
  'svc.metrotransit.org',
];
const LINKS_AND_ATTRIBUTION = [
  // Credits, "get a key" links and source pages opened in a new tab.
  '511on.ca',
  'adsb.lol',
  'aisstream.io',
  'creativecommons.org',
  'cwwp2.dot.ca.gov',
  'data.austintexas.gov',
  'data.calgary.ca',
  'data-nifc.opendata.arcgis.com',
  'data.texas.gov',
  'deldot.gov',
  'deflock.org',
  'developer.entur.org',
  'developer.tomtom.com',
  'developers.google.com',
  'developers.openai.com',
  'earthdata.nasa.gov',
  'github.com',
  // Fire Perimeters incident links; the catalog and incident-page checks go
  // through /api/fire-perimeters/inciweb.
  'inciweb.wildfire.gov',
  'ion.cesium.com',
  // Recent Imagery credit: the HLS product page.
  'lpdaac.usgs.gov',
  'its.txdot.gov',
  // Observed-weather credits: NOAA nowCOAST and its disclaimer and lightning
  // product notes. Imagery is fetched by the server through /api/weather.
  'nowcoast.noaa.gov',
  'ocean.weather.gov',
  'oceanservice.noaa.gov',
  'open-meteo.com',
  'opendatacommons.org',
  // Vector tile credits. OpenFreeMap tiles are fetched by the server through
  // /api/tiles/openfreemap.
  'openfreemap.org',
  'openmaptiles.org',
  'opensky-network.org',
  // Military area names credit (bundled Overture/OSM names pack).
  'overturemaps.org',
  'platform.openai.com',
  'policies.google.com',
  // Wind credits: NOAA Open Data on AWS and ECMWF Open Data. Forecast files
  // are fetched by the server through /api/wind.
  'registry.opendata.aws',
  'ristmikud.tallinn.ee',
  'routing.openstreetmap.de',
  'tarktee.transpordiamet.ee',
  'tfl.gov.uk',
  'thespacedevs.com',
  'translink.com.au',
  'vantor.com',
  'wiki.openstreetmap.org',
  'www.adsbdb.com',
  'www.capmetro.org',
  'www.digitraffic.fi',
  'www.drivebc.ca',
  'www.ecmwf.int',
  'www.esri.com',
  'www.gdeltproject.org',
  'www.hsl.fi',
  'www.livetraffic.com',
  'www.naturalearthdata.com',
  // Cyclone advisories: the credit and the official advisory links, opened in
  // a new tab without a referrer. Status and GIS go through /api/cyclones.
  'www.nhc.noaa.gov',
  'www.ontario.ca',
  'www.openstreetmap.org',
  'www.radio-browser.info',
  'www.submarinecablemap.com',
  'www.tomtom.com',
  'www.warendorf.de',
  'www2.gov.bc.ca',
];
const NOT_NETWORK_DESTINATIONS = [
  'localhost', // URL parsing bases and loopback checks
  'www.w3.org', // XML namespaces
];

/** Every host spelled in a URL literal in code that runs in the browser. */
function hostsNamedByBrowserCode() {
  const files = execFileSync('git', ['ls-files', 'src', 'index.html'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(
      (file) =>
        /\.(?:js|mjs|html|css)$/.test(file) &&
        !/\.test\.mjs$/.test(file) &&
        !/^src\/(?:testSupport|tooling|data\/local_data)\//.test(file),
    );
  const hosts = new Map();
  for (const file of files) {
    const text = readFileSync(new URL(file, `file://${root}/`), 'utf8');
    for (const [, host] of text.matchAll(
      /\b(?:https?|wss?):\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)*)/gi,
    )) {
      const name = host.toLowerCase();
      if (!hosts.has(name)) hosts.set(name, file);
    }
  }
  return hosts;
}

function originMatches(origin, host) {
  const pattern = new URL(origin.replace('*.', 'wildcard.')).hostname;
  return pattern.startsWith('wildcard.')
    ? host.endsWith(pattern.slice('wildcard'.length))
    : host === pattern;
}

test('every host browser code names is either allowed by the CSP or classified', () => {
  const classified = new Set([
    ...REACHED_THROUGH_API_PROXY,
    ...LINKS_AND_ATTRIBUTION,
    ...NOT_NETWORK_DESTINATIONS,
  ]);
  const unclassified = [];
  for (const [host, file] of hostsNamedByBrowserCode()) {
    const allowed = CSP_ORIGINS.some(({ origin }) =>
      originMatches(origin, host),
    );
    if (!allowed && !classified.has(host))
      unclassified.push(`${host} (${file})`);
  }
  assert.deepEqual(
    unclassified,
    [],
    'New host in browser code: add it to CSP_ORIGINS if the page loads from it, otherwise classify it in this test',
  );
});

test('every explicit CSP origin is still used by browser code', () => {
  const named = [...hostsNamedByBrowserCode().keys()];
  const unused = CSP_ORIGINS.filter(
    ({ origin, implied }) =>
      !implied && !named.some((host) => originMatches(origin, host)),
  ).map(({ origin }) => origin);
  assert.deepEqual(unused, [], 'Remove origins no feature uses');
});

test('classified hosts are not also allowed by the policy', () => {
  const overlap = [
    ...REACHED_THROUGH_API_PROXY,
    ...LINKS_AND_ATTRIBUTION,
    ...NOT_NETWORK_DESTINATIONS,
  ].filter((host) =>
    CSP_ORIGINS.some(({ origin }) => originMatches(origin, host)),
  );
  assert.deepEqual(overlap, []);
});

test('every CSP origin is HTTPS, explains itself and names known directives', () => {
  const known = new Set(Object.keys(contentSecurityPolicyDirectives()));
  for (const entry of CSP_ORIGINS) {
    assert.match(
      entry.origin,
      /^https:\/\/(?:\*\.)?[a-z0-9.-]+$/,
      entry.origin,
    );
    assert.ok(entry.why, entry.origin);
    assert.ok(entry.directives.length, entry.origin);
    for (const directive of entry.directives)
      assert.ok(known.has(directive), `${entry.origin}: ${directive}`);
  }
});

test('the policy defaults to self and closes plugins, base and framing', () => {
  const directives = contentSecurityPolicyDirectives();
  assert.deepEqual(directives['default-src'], ["'self'"]);
  assert.deepEqual(directives['object-src'], ["'none'"]);
  assert.deepEqual(directives['base-uri'], ["'self'"]);
  assert.deepEqual(directives['frame-ancestors'], ["'none'"]);
  assert.ok(!directives['connect-src'].includes('https:'));
  assert.ok(!directives['script-src'].includes('https:'));
  assert.ok(!directives['script-src'].includes("'unsafe-inline'"));
  assert.match(contentSecurityPolicy(), /frame-ancestors 'none'/);
});

test('the meta policy for built HTML omits header-only directives', () => {
  const meta = contentSecurityPolicy({ meta: true });
  assert.doesNotMatch(meta, /frame-ancestors/);
  assert.match(meta, /connect-src 'self'/);
  const [tag] = contentSecurityPolicyHtmlPlugin().transformIndexHtml();
  assert.equal(tag.attrs['http-equiv'], 'Content-Security-Policy');
  assert.equal(tag.attrs.content, meta);
  assert.deepEqual(
    contentSecurityPolicyHtmlPlugin({ reportOnly: true }).transformIndexHtml(),
    [],
  );
});

test('dev and preview servers send the policy, framing and referrer headers', () => {
  const config = createBrowserViteConfig();
  for (const headers of [config.server.headers, config.preview.headers]) {
    assert.equal(headers['Content-Security-Policy'], contentSecurityPolicy());
    assert.equal(headers['X-Frame-Options'], 'DENY');
    assert.equal(headers['Referrer-Policy'], REFERRER_POLICY);
  }
  assert.equal(
    config.plugins[2].name,
    'vantage-content-security-policy',
    'built HTML carries the policy',
  );
});

test('report-only mode reports instead of blocking but still refuses framing', () => {
  const headers = securityHeaders({ reportOnly: true });
  assert.equal(
    headers['Content-Security-Policy-Report-Only'],
    contentSecurityPolicy(),
  );
  assert.equal(headers['Content-Security-Policy'], "frame-ancestors 'none'");
});

test('the referrer policy keeps the origin for Google keys and YouTube', () => {
  assert.equal(REFERRER_POLICY, 'strict-origin-when-cross-origin');
  const html = readFileSync(new URL('index.html', `file://${root}/`), 'utf8');
  assert.match(
    html,
    /<meta name="referrer" content="strict-origin-when-cross-origin" \/>/,
  );
});

test('event pack evidence posters are fetchable under the policy', () => {
  const pack = JSON.parse(
    readFileSync(
      new URL('public/events/bhote-koshi-2026/event.json', `file://${root}/`),
      'utf8',
    ),
  );
  const posterOrigins = new Set(
    pack.evidenceSpine
      .map((entry) => entry.media?.posterUrl)
      .filter(Boolean)
      .map((url) => new URL(url).origin),
  );
  assert.ok(posterOrigins.size > 0, 'the pack names remote posters');
  const connectSources = contentSecurityPolicyDirectives()['connect-src'];
  for (const origin of posterOrigins)
    assert.ok(connectSources.includes(origin), origin);
});

test('built Cesium workers may load their blob: worker bundle', () => {
  const directives = contentSecurityPolicyDirectives();
  assert.ok(directives['worker-src'].includes('blob:'));
  assert.ok(directives['script-src'].includes('blob:'));
});
