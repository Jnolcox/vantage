import { makeRateLimiter } from '../../../src/sources/rateLimit.js';
export { makeRateLimiter } from '../../../src/sources/rateLimit.js';

/** Requests/min/IP for the OpenAI cost endpoints when nothing is configured. */
export const DEFAULT_OPENAI_PER_MIN = 30;

/** Requests/min/IP for the Google Places cost endpoints when nothing is configured. */
export const DEFAULT_GOOGLE_PER_MIN = 60;

/**
 * Resolve the per-IP, per-minute cap for a cost-bearing proxy from its env var.
 *
 * The throttle is on for every bind. An unset or blank value takes
 * `defaultPerMin`; a positive number overrides it (a fraction below 1 counts
 * as 1, larger values floor); an explicit `0` disables the limiter. A value
 * that cannot be read as a number (a typo such as `3O`, a stray unit, a
 * negative) also takes the default, so a slip cannot quietly disarm the guard:
 * removing the throttle takes a deliberate `0`.
 *
 * @param {string|number|undefined|null} envValue - Raw env value (requests/min/IP).
 * @param {number} defaultPerMin - Cap when the value is absent or unreadable.
 * @returns {number} Requests/min/IP; `0` means unlimited.
 */
export function resolvePerMinuteCap(envValue, defaultPerMin) {
  const raw = typeof envValue === 'string' ? envValue.trim() : envValue;
  if (raw === undefined || raw === null || raw === '') return defaultPerMin;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return defaultPerMin;
  if (parsed > 0 && parsed < 1) return 1;
  return Math.floor(parsed);
}

/**
 * Per-IP rate limiter for the cost-bearing API proxies (OpenAI / Google).
 * Returns `null` only when the cap resolves to `0` (the explicit opt-out), in
 * which case the caller skips the check. Otherwise a fixed 60s window of N
 * requests/IP; callers build it lazily once and reuse it so its per-IP window
 * state persists across requests. The global backstop is a generous multiple
 * of the per-IP cap so a single host can't starve the rest.
 *
 * @param {string|number|undefined|null} envValue - Raw env value (requests/min/IP).
 * @param {number} defaultPerMin - Cap when the value is absent or unreadable.
 * @returns {((key:string)=>boolean)|null} An `allow(key)` fn, or null when unlimited.
 */
export function makeCostRateLimiter(envValue, defaultPerMin) {
  const max = resolvePerMinuteCap(envValue, defaultPerMin);
  if (max === 0) return null;
  return makeRateLimiter({ windowMs: 60_000, max, globalMax: max * 20 });
}

/**
 * Client key for rate limiting. Uses the real socket peer address only — we do
 * NOT trust X-Forwarded-For (client-controlled; a rotating value would mint fresh
 * quota and grow the limiter map). This is a localhost dev proxy, so the socket
 * address is the real client.
 */
export function clientKey(req) {
  return String(req.socket?.remoteAddress || 'local');
}
