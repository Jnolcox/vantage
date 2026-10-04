/**
 * Reverse-proxy detection shared by every local request gate.
 *
 * Provider Settings (keySetupCore.mjs) and the /api guard
 * (server/standalone/api-request-guard.js) both refuse requests that a reverse
 * proxy, tunnel or CDN forwarded, so the header names live here once. The
 * module has no imports so it can sit in any package boundary.
 */

/**
 * Reverse-proxy / CDN forwarding headers. Their presence means the request did
 * not originate on this machine, whatever its socket says.
 */
export const PROXY_SIGNALS = Object.freeze([
  'forwarded',
  'via',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-port',
  'x-forwarded-proto',
  'x-real-ip',
  'cf-connecting-ip',
  'cf-ray',
]);

/**
 * Whether a request carries reverse-proxy or CDN forwarding headers. `headers`
 * is keyed by lower-case header name.
 */
export function hasProxySignals(headers = {}) {
  return PROXY_SIGNALS.some(
    (name) => String(headers?.[name] || '').trim() !== '',
  );
}
