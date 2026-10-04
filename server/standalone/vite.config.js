import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { createBrowserViteConfig } from '../../build/vite.js';
import { localProviderPlugins } from '../providers/local.js';
import { readVantageEnv } from '../providers/common/env.js';
import { apiNotFoundPlugin } from './api-not-found.js';
import { apiRequestGuardPlugin } from './api-request-guard.js';
import { moveLegacyDirectories } from './legacy-directories.js';
import {
  applyLanRateLimitDefaults,
  extraAllowedHosts,
  resolveBindHost,
} from './network.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** Load this checkout's configuration and attach its local provider middleware. */
export default defineConfig(({ command, mode }) => {
  moveLegacyDirectories(root);
  const loaded = loadEnv(mode, root, '');
  for (const [key, value] of Object.entries(loaded)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  const host = resolveBindHost(process.env);
  const throttles = applyLanRateLimitDefaults(process.env, host);
  if (throttles.length)
    console.warn(
      `[vantage] Network-exposed bind (${host}): defaulting ${throttles.join(', ')} per client IP.`,
    );
  return createBrowserViteConfig({
    plugins: [
      apiRequestGuardPlugin(),
      ...localProviderPlugins(),
      apiNotFoundPlugin(),
    ],
    googleApiKey: process.env.GOOGLE_MAPS_API_KEY,
    cesiumToken: process.env.CESIUM_ION_TOKEN,
    host,
    port: process.env.PORT,
    allowedHosts: extraAllowedHosts(process.env, host),
    // Escape hatch while diagnosing a blocked request: report, don't block.
    cspReportOnly:
      String(readVantageEnv('CSP') ?? '')
        .trim()
        .toLowerCase() === 'report-only',
    command,
  });
});
