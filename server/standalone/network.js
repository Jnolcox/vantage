import { isIP } from 'node:net';
import os from 'node:os';
import { readVantageEnv } from '../providers/common/env.js';
import {
  DEFAULT_GOOGLE_PER_MIN,
  DEFAULT_OPENAI_PER_MIN,
  resolvePerMinuteCap,
} from '../providers/common/rate-limit.js';
import { isPatternHostEntry } from './api-request-guard.js';

/**
 * Network exposure policy for the standalone server.
 *
 * The server brokers paid API keys, so it binds to the IPv4 loopback address
 * unless the operator opts in to network exposure with VANTAGE_HOST (HOST is
 * still honoured as the pre-rename name). A non-loopback bind is "LAN mode":
 * the machine's own hostname joins the allowed Host list, and startup names
 * the per-IP throttles on the paid proxies, which are on for every bind.
 */

export const DEFAULT_BIND_HOST = '127.0.0.1';

const LOOPBACK_BIND_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

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
 * The startup warning for a network-exposed bind, naming the per-IP throttles
 * in effect, or null on a loopback bind. The throttles themselves are on for
 * every bind (server/providers/common/rate-limit.js); this only says so.
 */
export function lanExposureWarning(
  env = process.env,
  host = resolveBindHost(env),
) {
  if (isLoopbackBindHost(host)) return null;
  const caps = [
    ['RATELIMIT_OPENAI_PER_MIN', DEFAULT_OPENAI_PER_MIN],
    ['RATELIMIT_GOOGLE_PER_MIN', DEFAULT_GOOGLE_PER_MIN],
  ].map(([name, fallback]) => {
    const cap = resolvePerMinuteCap(readVantageEnv(name, env), fallback);
    return `VANTAGE_${name}=${cap === 0 ? '0 (unlimited)' : cap}`;
  });
  return `[vantage] Network-exposed bind (${host}): per-IP throttles ${caps.join(', ')} per client IP.`;
}
