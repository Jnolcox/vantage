import { applicationHtmlPlugin } from './application-html.js';
import {
  contentSecurityPolicyHtmlPlugin,
  embedFramingPlugin,
  securityHeaders,
} from './content-security-policy.js';
import cesium from 'vite-plugin-cesium';

const BROWSER_KEY_SETTINGS = Object.freeze({
  googleApiKey: 'GOOGLE_MAPS_API_KEY',
  cesiumToken: 'CESIUM_ION_TOKEN',
});

/**
 * Warn when a production build embeds browser keys: `output` then carries
 * them in clear text for anyone the files are served to. `names` are the
 * settings the keys came from, and `advice` says what to do about it. Names
 * only, never values.
 */
export function exposedKeyBuildWarning({
  googleApiKey,
  cesiumToken,
  output = 'dist/',
  names = BROWSER_KEY_SETTINGS,
  advice = 'Restrict each key to your site (HTTP referrer or URL restrictions) before hosting the build anywhere others can load it.',
} = {}) {
  const exposed = Object.entries({ googleApiKey, cesiumToken })
    .filter(([, value]) => String(value ?? '').trim() !== '')
    .map(([key]) => names[key]);
  return {
    name: 'vantage-exposed-key-warning',
    apply: 'build',
    buildStart() {
      if (!exposed.length) return;
      this.warn(`${output} will contain ${exposed.join(' and ')}. ${advice}`);
    },
  };
}

/** Build browser assets with explicit inputs; never load environment or providers. */
export function createBrowserViteConfig({
  plugins = [],
  publicDir,
  googleApiKey,
  cesiumToken,
  host = '127.0.0.1',
  port = 4173,
  allowedHosts = [],
  cspReportOnly = false,
  embedFrameAncestors = [],
  command,
} = {}) {
  // With origins allowed to frame embed mode, the headers depend on the
  // request and embedFramingPlugin sends them all; otherwise they are the
  // same for every response.
  const framesEmbeds = embedFrameAncestors.length > 0;
  const headers = framesEmbeds
    ? {}
    : securityHeaders({ reportOnly: cspReportOnly });
  return {
    plugins: [
      cesium(),
      applicationHtmlPlugin(),
      contentSecurityPolicyHtmlPlugin({ reportOnly: cspReportOnly }),
      exposedKeyBuildWarning({ googleApiKey, cesiumToken }),
      ...plugins,
      ...(framesEmbeds
        ? [
            embedFramingPlugin({
              frameAncestors: embedFrameAncestors,
              reportOnly: cspReportOnly,
            }),
          ]
        : []),
    ],
    ...(publicDir === undefined ? {} : { publicDir }),
    // A production build must not clean the dependency cache a running dev
    // server is still serving optimized module URLs from.
    ...(command === 'build' ? { cacheDir: 'node_modules/.vite-build' } : {}),
    optimizeDeps: {
      // First reached through the SDR worker or a dynamic import. Pre-bundle
      // them at startup so first use cannot invalidate already-transformed
      // URLs with Vite's "Outdated Optimize Dep" 504 response.
      include: [
        '@jtarrio/signals/demod/demodulator.js',
        '@jtarrio/signals/demod/modes.js',
        '@jtarrio/webrtlsdr/rtlsdr.js',
        'egm96-universal',
      ],
    },
    server: {
      host: host || '127.0.0.1',
      port: parseInt(port, 10) || 4173,
      // Always an explicit list of exact names, even when bound to every
      // interface: Vite accepts IP literals on its own, `true` would switch
      // off the Host check that stops DNS rebinding, and a suffix entry such
      // as `.local` would trust every name under it.
      allowedHosts: [...new Set(['localhost', '127.0.0.1', ...allowedHosts])],
      // No cross-origin reads: Vite's default would let any localhost page
      // read served modules, which carry the browser keys defined below.
      cors: false,
      fs: {
        // Local caches and the opt-in voice transcript log are private data;
        // the pre-rename .gev-* names are listed until legacy moves finish.
        deny: [
          '.env',
          '.env.*',
          '*.{crt,pem}',
          '**/.git/**',
          '**/ENVIRONMENT',
          '**/.vantage-logs/**',
          '**/.vantage-cache/**',
          '**/.gev-logs/**',
          '**/.gev-cache/**',
        ],
      },
      // The policy limits where the page can send data, and keeps the
      // document containing Provider Settings out of other sites' frames.
      headers,
    },
    preview: {
      cors: false,
      headers,
    },
    define: {
      'import.meta.env.GOOGLE_MAPS_API_KEY': JSON.stringify(googleApiKey),
      'import.meta.env.CESIUM_ION_TOKEN': JSON.stringify(cesiumToken),
    },
    build: { chunkSizeWarningLimit: 1500 },
  };
}
