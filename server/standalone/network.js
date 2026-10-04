import { isIP } from 'node:net';
import os from 'node:os';
import { readVantageEnv } from '../providers/common/env.js';
import { isPatternHostEntry } from './api-request-guard.js';

/**
 * Network exposure policy for the standalone server.
 *
 * The server brokers paid API keys, so it binds to the IPv4 loopback address
 * unless the operator opts in to network exposure with VANTAGE_HOST (HOST is
 * still honoured as the pre-rename name). A non-loopback bind is "LAN mode":
 * the machine's own hostname joins the allowed Host list, and the per-IP
 * throttles on the paid proxies switch on with conservative defaults unless
 * the operator configured them.
 */

export const DEFAULT_BIND_HOST = '127.0.0.1';

const LOOPBACK_BIND_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Throttles (requests/min/IP) applied in LAN mode when left unset. */
export const LAN_RATE_LIMIT_DEFAULTS = Object.freeze({
  RATELIMIT_OPENAI_PER_MIN: '30',
  RATELIMIT_GOOGLE_PER_MIN: '60',
});

/** The address to bind: VANTAGE_HOST, then legacy HOST, then loopback. */
export function resolveBindHost(env = process.env) {
  for (const name of ['VANTAGE_HOST', 'HOST']) {
    const value = String(env[name] ?? '').trim();
    if (value) return value;
  }
  return DEFAULT_BIND_HOST;
}

/** True when the bind address is reachable only from this machine. */
export function isLoopbackBindHost(host) {
  return LOOPBACK_BIND_HOSTS.has(
    String(host ?? '')
      .trim()
      .toLowerCase(),
  );
}

/**
 * Host names, beyond the built-in local names, that requests may carry.
 * VANTAGE_ALLOWED_HOSTS is a comma-separated list of exact names; suffix
 * (`.lan`) and wildcard (`*.lan`) entries are ignored, so every trusted name
 * is spelled out. LAN mode adds this machine's hostname, and a bind address
 * given as a name is accepted as itself. IP literals are always accepted,
 * because a DNS-rebinding page cannot present one.
 */
export function extraAllowedHosts(
  env = process.env,
  host = resolveBindHost(env),
  hostname = os.hostname(),
) {
  const listed = String(readVantageEnv('ALLOWED_HOSTS', env) ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name && !isPatternHostEntry(name));
  const bindName = String(host ?? '')
    .trim()
    .toLowerCase();
  const machine = isLoopbackBindHost(host)
    ? []
    : [String(hostname || '').toLowerCase(), bindName].filter(
        (name) => name && !isIP(name.replace(/^\[|\]$/g, '')),
      );
  return [...new Set([...machine, ...listed])];
}

/**
 * In LAN mode, fill each unset throttle with its default. Returns the names it
 * set so the caller can announce them; an operator's own value (including an
 * explicit 0 for unlimited) is never replaced.
 */
export function applyLanRateLimitDefaults(
  env = process.env,
  host = resolveBindHost(env),
) {
  if (isLoopbackBindHost(host)) return [];
  const applied = [];
  for (const [name, value] of Object.entries(LAN_RATE_LIMIT_DEFAULTS)) {
    if (String(readVantageEnv(name, env) ?? '').trim() !== '') continue;
    env[`VANTAGE_${name}`] = value;
    applied.push(`VANTAGE_${name}=${value}`);
  }
  return applied;
}
