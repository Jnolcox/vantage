/**
 * Local composition of tool services: Core's default services, pointed at a
 * running Vantage server's `/api` routes.
 */

import { clientUserAgent } from '../../src/sources/projectIdentity.js';
import { createToolServices } from '../../src/tools/services.js';

/** The app's default bind. IPv4 literal: `localhost` may resolve to ::1 first. */
export const DEFAULT_API_BASE = 'http://127.0.0.1:4173';

/** User-Agent for the requests the tools send to third parties directly. */
export const MCP_TOOLS_USER_AGENT = clientUserAgent('mcp-tools');

/**
 * Resolve the sources' relative `/api/...` requests against `apiBase`.
 * Absolute URLs on another origin (feeds a source reads directly, such as
 * USGS) are fetched as given, with the project's User-Agent. Sources pass a
 * string, a URL or a Request.
 */
export function createApiFetch({
  apiBase = DEFAULT_API_BASE,
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  const base = new URL(apiBase);
  if (!['http:', 'https:'].includes(base.protocol))
    throw new TypeError(`apiBase must be an http(s) URL: ${apiBase}`);
  return (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input), base);
    const target = request || url;
    if (url.origin === base.origin) return fetchImpl(target, init);
    const headers = new Headers(init?.headers ?? request?.headers);
    headers.set('User-Agent', MCP_TOOLS_USER_AGENT);
    return fetchImpl(target, { ...init, headers });
  };
}

/** Construct every service Core's tools read, backed by the local server. */
export function createLocalToolServices(options = {}) {
  return createToolServices({ fetchImpl: createApiFetch(options) });
}
