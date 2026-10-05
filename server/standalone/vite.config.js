import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { createBrowserViteConfig } from '../../build/vite.js';
import { isMcpHttpEnabled, localMcpPlugin } from '../mcp/plugin.js';
import { localProviderPlugins } from '../providers/local.js';
import { readVantageEnv } from '../providers/common/env.js';
import { apiNotFoundPlugin } from './api-not-found.js';
import { apiRequestGuardPlugin } from './api-request-guard.js';
import { moveLegacyDirectories } from './legacy-directories.js';
import {
  extraAllowedHosts,
  lanExposureWarning,
  resolveBindHost,
} from './network.js';
import { standaloneVoiceTools } from './voiceTools.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** Load this checkout's configuration and attach its local provider middleware. */
export default defineConfig(({ command, mode }) => {
  moveLegacyDirectories(root);
  const loaded = loadEnv(mode, root, '');
  for (const [key, value] of Object.entries(loaded)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  const host = resolveBindHost(process.env);
  const exposure = lanExposureWarning(process.env, host);
  if (exposure) console.warn(exposure);
  return createBrowserViteConfig({
    plugins: [
      apiRequestGuardPlugin(),
      ...localProviderPlugins({ realtime: { tools: standaloneVoiceTools() } }),
      // Off unless VANTAGE_MCP_HTTP=1; when off, /mcp answers a JSON 404.
      localMcpPlugin({ enabled: isMcpHttpEnabled(process.env) }),
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
