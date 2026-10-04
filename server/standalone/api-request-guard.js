import { isIP } from 'node:net';

/**
 * One gate in front of every route, with a stricter layer on /api.
 *
 * Plugin middleware is added in configureServer, which Vite runs before its
 * own Host check and CORS middleware, so without this gate every plugin route
 * answered any Host header (DNS rebinding) and any cross-site page could make
 * the browser fire requests that spend provider quota. On every path the gate
 * refuses:
 *  - a Host header that is not localhost, an IP literal, or a listed name
 *    (the same list Vite's allowedHosts uses for the page itself).
 * On /api it also refuses:
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

/**
 * Whether a hostname is one this server answers. IP literals, localhost and
 * *.localhost always pass, because a DNS-rebinding page cannot present them;
 * any other name must be listed exactly. Vite would read a leading-dot entry
 * as a suffix wildcard, so suffix and wildcard entries never match here.
 */
export function isAllowedApiHost(hostname, allowedHosts = []) {
  if (!hostname) return false;
  if (allowedHosts === true) return true;
  if (isIP(hostname.replace(/^\[|\]$/g, ''))) return true;
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  return allowedHosts.some((entry) => {
    const name = String(entry).toLowerCase();
    return !isPatternHostEntry(name) && hostname === name;
  });
}

/** True for an allowed-hosts entry that names a pattern, not one host. */
export function isPatternHostEntry(entry) {
  const name = String(entry);
  return name.startsWith('.') || name.includes('*');
}

/**
 * Decide whether a request's Host header may reach any route.
 * @returns {{ok: true} | {ok: false, status: number, error: string}}
 */
export function admitRequestHost({ hostHeader, allowedHosts = [] } = {}) {
  return isAllowedApiHost(hostnameOf(hostHeader), allowedHosts)
    ? { ok: true }
    : refusal('Unrecognized Host refused');
}

/**
 * Decide whether an /api request, already past the Host check, may reach the
 * provider middleware.
 * @returns {{ok: true} | {ok: false, status: number, error: string}}
 */
export function admitApiRequest({ hostHeader, origin, fetchSite } = {}) {
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
    let own;
    try {
      own = new URL(
        `${parsed.protocol}//${String(hostHeader).trim().toLowerCase()}`,
      );
    } catch {
      return refusal('Cross-origin requests are refused');
    }
    if (parsed.host !== own.host)
      return refusal('Cross-origin requests are refused');
  }
  return { ok: true };
}

function refuse(res, verdict) {
  res.writeHead(verdict.status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify({ error: verdict.error }));
}

function hostCheckMiddleware(allowedHosts) {
  return (req, res, next) => {
    const verdict = admitRequestHost({
      hostHeader: req.headers.host,
      allowedHosts,
    });
    return verdict.ok ? next() : refuse(res, verdict);
  };
}

function apiCheckMiddleware() {
  return (req, res, next) => {
    const verdict = admitApiRequest({
      hostHeader: req.headers.host,
      origin: req.headers.origin,
      fetchSite: req.headers['sec-fetch-site'],
    });
    return verdict.ok ? next() : refuse(res, verdict);
  };
}

function installGuard(middlewares, allowedHosts) {
  middlewares.use(hostCheckMiddleware(allowedHosts));
  middlewares.use('/api', apiCheckMiddleware());
}

/**
 * Install the Host check on every path and the /api check behind it, ahead of
 * every other plugin's middleware (`enforce: 'pre'`), on dev and preview.
 */
export function apiRequestGuardPlugin() {
  return {
    name: 'vantage-api-request-guard',
    enforce: 'pre',
    configureServer(server) {
      installGuard(server.middlewares, server.config.server.allowedHosts);
    },
    configurePreviewServer(server) {
      installGuard(server.middlewares, server.config.preview.allowedHosts);
    },
  };
}
