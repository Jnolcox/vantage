import { applicationHtmlPlugin } from './application-html.js';
import cesium from 'vite-plugin-cesium';

/** Build browser assets with explicit inputs; never load environment or providers. */
export function createBrowserViteConfig({
  plugins = [],
  publicDir,
  googleApiKey,
  cesiumToken,
  host = '127.0.0.1',
  port = 4173,
  allowedHosts = [],
} = {}) {
  return {
    plugins: [cesium(), applicationHtmlPlugin(), ...plugins],
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
        deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/ENVIRONMENT'],
      },
      // These headers protect the document containing Provider Settings.
      headers: {
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "frame-ancestors 'none'",
      },
    },
    preview: { cors: false },
    define: {
      'import.meta.env.GOOGLE_MAPS_API_KEY': JSON.stringify(googleApiKey),
      'import.meta.env.CESIUM_ION_TOKEN': JSON.stringify(cesiumToken),
    },
    build: { chunkSizeWarningLimit: 1500 },
  };
}
