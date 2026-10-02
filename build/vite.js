import { applicationHtmlPlugin } from './application-html.js';
import {
  contentSecurityPolicyHtmlPlugin,
  securityHeaders,
} from './content-security-policy.js';
import cesium from 'vite-plugin-cesium';

/**
 * Warn when a production build embeds browser keys: dist/*.js then carries
 * them in clear text for anyone the files are served to. Names only, never
 * values.
 */
export function exposedKeyBuildWarning({ googleApiKey, cesiumToken } = {}) {
  const exposed = Object.entries({
    GOOGLE_MAPS_API_KEY: googleApiKey,
    CESIUM_ION_TOKEN: cesiumToken,
  })
    .filter(([, value]) => String(value ?? '').trim() !== '')
    .map(([name]) => name);
  return {
    name: 'vantage-exposed-key-warning',
    apply: 'build',
    buildStart() {
      if (!exposed.length) return;
      this.warn(
        `dist/ will contain ${exposed.join(' and ')}. Restrict each key to your site (HTTP referrer or URL restrictions) before hosting the build anywhere others can load it.`,
      );
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
} = {}) {
  return {
    plugins: [
      cesium(),
      applicationHtmlPlugin(),
      contentSecurityPolicyHtmlPlugin({ reportOnly: cspReportOnly }),
      exposedKeyBuildWarning({ googleApiKey, cesiumToken }),
      ...plugins,
    ],
    ...(publicDir === undefined ? {} : { publicDir }),
    server: {
      host: host || '127.0.0.1',
      port: parseInt(port, 10) || 4173,
      // Always an explicit list, even when bound to every interface: Vite
      // accepts IP literals on its own, and `true` would switch off the Host
      // check that stops DNS rebinding.
      allowedHosts: [
        ...new Set(['localhost', '127.0.0.1', '.local', ...allowedHosts]),
      ],
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
      headers: securityHeaders({ reportOnly: cspReportOnly }),
    },
    preview: {
      cors: false,
      headers: securityHeaders({ reportOnly: cspReportOnly }),
    },
    define: {
      'import.meta.env.GOOGLE_MAPS_API_KEY': JSON.stringify(googleApiKey),
      'import.meta.env.CESIUM_ION_TOKEN': JSON.stringify(cesiumToken),
    },
    build: { chunkSizeWarningLimit: 1500 },
  };
}
