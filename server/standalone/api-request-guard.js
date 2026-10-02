import { isIP } from 'node:net';

/**
 * One gate in front of every /api route.
 *
 * Provider middleware is added in configureServer, which Vite runs before its
 * own Host check and CORS middleware, so without this gate /api answered any
 * Host header (DNS rebinding) and any cross-site page could make the browser
 * fire requests that spend provider quota. The gate refuses:
 *  - a Host header that is not localhost, an IP literal, or an allowed name
 *    (the same list Vite's allowedHosts uses for the page itself);
 *  - an Origin header whose host and port are not this server's own. The
 *    scheme is not compared: a TLS proxy in front of this plain-HTTP server
 *    (the microphone needs HTTPS on any other device) keeps the Host header
 *    while the page's Origin is https, and no other site can serve pages
 *    from this exact host and port;
 *  - a browser request labelled cross-site or same-site by Sec-Fetch-Site,
 *    which also covers <img> and no-cors loads that carry no Origin.
 * Same-origin browser requests and local non-browser tools (curl, QA scripts)
 * pass unchanged. Provider Settings keeps its stricter gate behind this one.
 */

const REFUSED_FETCH_SITES = new Set(['cross-site', 'same-site']);
const WEB_ORIGIN_PROTOCOLS = new Set(['http:', 'https:']);

function refusal(error) {
  return { ok: false, status: 403, error };
}

/** Hostname from a Host header, or null when it is not a plain authority. */
function hostnameOf(hostHeader) {
  const raw = String(hostHeader || '')
    .trim()
    .toLowerCase();
  if (!raw || /[\s/?#@\\]/.test(raw)) return null;
  try {
    return new URL(`http://${raw}`).hostname;
  } catch {
    return null;
  }
}

/** Vite's allowedHosts semantics: IP literals and localhost always pass. */
export function isAllowedApiHost(hostname, allowedHosts = []) {
  if (!hostname) return false;
  if (allowedHosts === true) return true;
  if (isIP(hostname.replace(/^\[|\]$/g, ''))) return true;
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  return allowedHosts.some((entry) => {
    const name = String(entry).toLowerCase();
    return name.startsWith('.')
      ? hostname === name.slice(1) || hostname.endsWith(name)
      : hostname === name;
  });
}

/**
 * Decide whether an /api request may reach the provider middleware.
 * @returns {{ok: true} | {ok: false, status: number, error: string}}
 */
export function admitApiRequest({
  hostHeader,
  origin,
  fetchSite,
  allowedHosts = [],
} = {}) {
  const hostname = hostnameOf(hostHeader);
  if (!isAllowedApiHost(hostname, allowedHosts))
    return refusal('Unrecognized Host refused');
  if (REFUSED_FETCH_SITES.has(String(fetchSite || '').toLowerCase()))
    return refusal('Cross-site requests are refused');
  if (origin !== undefined && origin !== '') {
    let parsed;
    try {
      parsed = new URL(String(origin));
    } catch {
      return refusal('Unrecognized Origin refused');
    }
    if (!WEB_ORIGIN_PROTOCOLS.has(parsed.protocol))
      return refusal('Unrecognized Origin refused');
    // Normalize the Host header under the Origin's scheme so default ports
    // compare equal (https://name and Host name:443).
    const own = new URL(
      `${parsed.protocol}//${String(hostHeader).trim().toLowerCase()}`,
    );
    if (parsed.host !== own.host)
      return refusal('Cross-origin requests are refused');
  }
  return { ok: true };
}

function guardMiddleware(allowedHosts) {
  return (req, res, next) => {
    const verdict = admitApiRequest({
      hostHeader: req.headers.host,
      origin: req.headers.origin,
      fetchSite: req.headers['sec-fetch-site'],
      allowedHosts,
    });
    if (verdict.ok) return next();
    res.writeHead(verdict.status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({ error: verdict.error }));
  };
}

/** Install the gate ahead of every provider; `enforce: 'pre'` keeps it first. */
export function apiRequestGuardPlugin() {
  return {
    name: 'vantage-api-request-guard',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(
        '/api',
        guardMiddleware(server.config.server.allowedHosts),
      );
    },
    configurePreviewServer(server) {
      server.middlewares.use(
        '/api',
        guardMiddleware(server.config.preview.allowedHosts),
      );
    },
  };
}
