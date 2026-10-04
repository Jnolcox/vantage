import path from 'node:path';
import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { clientUserAgent } from '../../src/sources/projectIdentity.js';
import {
  readResponseBytesCapped,
  coalesceProxyRequest,
} from './common/http.js';

/**
 * Same-origin vector tile proxy: /api/tiles/<upstream>/<path>.
 *
 * The browser never contacts a third-party vector tile host. Traffic roads and
 * Mapped Installations read OpenFreeMap tiles, and Mapped ALPR Cameras read
 * the community-hosted hourly OpenStreetMap camera extract, through this
 * route, so those hosts see this server's address and User-Agent, not the
 * viewer's. Only the paths below are forwarded, to their one allow-listed
 * host, with a byte cap and a time limit. TileJSON documents are rewritten so
 * every tile URL they name points back at this route; a tile URL on any other
 * host is dropped. Answers are kept in a bounded memory LRU and a bounded disk
 * LRU under .vantage-cache/tiles, and a cached answer is served stale when the
 * upstream fails.
 */

const ROUTE = '/api/tiles';

/** Hard ceilings per answer: TileJSON is small, a tile is at most a few MB. */
export const TILE_PROXY_MAX_TILEJSON_BYTES = 256 * 1024;
export const TILE_PROXY_MAX_TILE_BYTES = 4 * 1024 * 1024;
/** Under the browser's 12 s vector tile deadline, so the client sees our error. */
export const TILE_PROXY_TIMEOUT_MS = 10_000;
/** Upstream requests in flight at once, across every viewer and upstream. */
const MAX_CONCURRENT_UPSTREAM = 8;
const MEMORY_MAX_BYTES = 48 * 1024 * 1024;
const MEMORY_MAX_ENTRIES = 2048;
const DISK_MAX_BYTES = 256 * 1024 * 1024;
/**
 * Disk bytes charged per entry on top of its body: the metadata file and the
 * filesystem blocks the pair occupies. Without it an empty answer (a cached
 * 404 tile) would cost nothing against the budget and never be evicted.
 */
const DISK_ENTRY_OVERHEAD_BYTES = 4096;
/** How long a cached answer may stand in for a failing upstream. */
const STALE_IF_ERROR_MS = 7 * 86_400_000;
const HOUR_MS = 3_600_000;

const XYZ = '(\\d{1,2})/(\\d{1,6})/(\\d{1,6})';

/**
 * The only upstreams and paths this route forwards. `tileJson` paths answer
 * with a rewritten TileJSON; `tile` paths answer with tile bytes.
 * OpenFreeMap tile paths carry a dated planet version and never change, so
 * they are kept for 30 days; the "latest planet" TileJSON moves weekly. The
 * camera extract is rebuilt hourly.
 */
export const TILE_PROXY_UPSTREAMS = Object.freeze({
  openfreemap: Object.freeze({
    origin: 'https://tiles.openfreemap.org',
    userAgent: clientUserAgent('openfreemap-proxy'),
    tileJson: /^planet$/,
    tile: new RegExp(`^planet/[0-9A-Za-z_.-]{1,64}/${XYZ}\\.pbf$`),
    maxZoom: 14,
    tileJsonTtlMs: HOUR_MS,
    tileTtlMs: 30 * 24 * HOUR_MS,
  }),
  alpr: Object.freeze({
    origin: 'https://tiles.dontgetflocked.com',
    userAgent: clientUserAgent('alpr-tiles-proxy'),
    tileJson: /^cameras-(?:us|ca)-hourly\.json$/,
    tile: new RegExp(`^cameras-(?:us|ca)-hourly/${XYZ}\\.mvt$`),
    maxZoom: 14,
    tileJsonTtlMs: HOUR_MS,
    tileTtlMs: HOUR_MS,
  }),
});

/**
 * Resolve a request path below /api/tiles to its allow-listed upstream, or
 * null. Tile coordinates must lie inside their zoom's grid.
 * @param {string} requestPath e.g. `/openfreemap/planet`.
 * @returns {{name: string, kind: 'tileJson'|'tile', upstreamPath: string,
 *   url: string, config: object} | null}
 */
export function resolveTileProxyPath(requestPath) {
  const match = /^\/([a-z]+)\/([^?#]+)$/.exec(String(requestPath || ''));
  if (!match || !Object.hasOwn(TILE_PROXY_UPSTREAMS, match[1])) return null;
  const [, name, upstreamPath] = match;
  if (upstreamPath.includes('..') || upstreamPath.includes('//')) return null;
  const config = TILE_PROXY_UPSTREAMS[name];
  const resolved = (kind) => ({
    name,
    kind,
    upstreamPath,
    url: `${config.origin}/${upstreamPath}`,
    config,
  });
  if (config.tileJson.test(upstreamPath)) return resolved('tileJson');
  const tile = config.tile.exec(upstreamPath);
  if (!tile) return null;
  const [z, x, y] = tile.slice(1, 4).map(Number);
  if (z > config.maxZoom || x >= 2 ** z || y >= 2 ** z) return null;
  return resolved('tile');
}

/**
 * Point every tile URL in a TileJSON document at this route. A URL outside
 * the upstream's own origin, or one this route would not forward, is dropped,
 * so the browser is never handed a third-party address.
 * @param {object} document Parsed upstream TileJSON.
 * @param {string} name Upstream key in TILE_PROXY_UPSTREAMS.
 * @returns {object} The rewritten document.
 */
export function rewriteTileJson(document, name) {
  const { origin } = TILE_PROXY_UPSTREAMS[name];
  const tiles = (Array.isArray(document?.tiles) ? document.tiles : [])
    .filter(
      (url) =>
        typeof url === 'string' &&
        url.startsWith(`${origin}/`) &&
        resolveTileProxyPath(
          `/${name}/${url
            .slice(origin.length + 1)
            .replace('{z}', '0')
            .replace('{x}', '0')
            .replace('{y}', '0')}`,
        )?.kind === 'tile',
    )
    .map((url) => `${ROUTE}/${name}/${url.slice(origin.length + 1)}`);
  return { ...document, tiles };
}

/**
 * Least-recently-used map bounded by entry count and total bytes.
 * @param {{maxEntries: number, maxBytes: number}} limits
 */
function createMemoryLru({ maxEntries, maxBytes }) {
  const entries = new Map();
  let bytes = 0;
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      entries.delete(key);
      entries.set(key, entry);
      return entry;
    },
    set(key, entry) {
      if (entry.body.byteLength > maxBytes) return;
      const previous = entries.get(key);
      if (previous) bytes -= previous.body.byteLength;
      entries.delete(key);
      entries.set(key, entry);
      bytes += entry.body.byteLength;
      while (entries.size > maxEntries || bytes > maxBytes) {
        const [oldest, value] = entries.entries().next().value;
        entries.delete(oldest);
        bytes -= value.body.byteLength;
      }
    },
  };
}

/**
 * Disk LRU: one `<hash>.bin` body and `<hash>.json` metadata pair per answer.
 * The index is read once, lazily, on the first request; writes evict the
 * least recently stored entries until the directory is under its byte budget.
 * Disk failures only cost a cache miss.
 * @param {{directory: string, maxBytes: number}} options
 */
function createDiskLru({ directory, maxBytes }) {
  /** @type {Map<string, {size: number, at: number}>} hash -> stored size. */
  const index = new Map();
  let bytes = 0;
  let loading = null;
  const file = (hash, extension) =>
    path.join(directory, `${hash}.${extension}`);
  const forget = async (hash) => {
    const entry = index.get(hash);
    if (!entry) return;
    index.delete(hash);
    bytes -= entry.size;
    await Promise.all(
      ['bin', 'json'].map((extension) =>
        fsp.unlink(file(hash, extension)).catch(() => {}),
      ),
    );
  };
  const load = () =>
    (loading ||= (async () => {
      let names = [];
      try {
        names = await fsp.readdir(directory);
      } catch {
        return;
      }
      for (const name of names) {
        if (!name.endsWith('.json')) continue;
        const hash = name.slice(0, -'.json'.length);
        try {
          const meta = JSON.parse(
            await fsp.readFile(file(hash, 'json'), 'utf8'),
          );
          if (!Number.isFinite(meta?.at) || !Number.isFinite(meta?.size))
            continue;
          index.set(hash, { size: meta.size, at: meta.at });
          bytes += meta.size;
        } catch {
          /* unreadable entry: left for the next eviction pass to skip */
        }
      }
    })());
  return {
    async get(key) {
      await load();
      const hash = createHash('sha1').update(key).digest('hex');
      if (!index.has(hash)) return null;
      try {
        const [meta, body] = await Promise.all([
          fsp.readFile(file(hash, 'json'), 'utf8').then(JSON.parse),
          fsp.readFile(file(hash, 'bin')),
        ]);
        if (meta.key !== key) return null;
        return {
          at: meta.at,
          status: meta.status,
          contentType: meta.contentType,
          body: new Uint8Array(body),
        };
      } catch {
        await forget(hash);
        return null;
      }
    },
    async set(key, entry) {
      await load();
      const hash = createHash('sha1').update(key).digest('hex');
      const size = entry.body.byteLength + DISK_ENTRY_OVERHEAD_BYTES;
      if (size > maxBytes) return;
      try {
        await fsp.mkdir(directory, { recursive: true });
        await fsp.writeFile(file(hash, 'bin'), entry.body);
        await fsp.writeFile(
          file(hash, 'json'),
          JSON.stringify({
            key,
            at: entry.at,
            status: entry.status,
            contentType: entry.contentType,
            size,
          }),
        );
      } catch {
        return;
      }
      const previous = index.get(hash);
      if (previous) bytes -= previous.size;
      index.delete(hash);
      index.set(hash, { size, at: entry.at });
      bytes += size;
      if (bytes <= maxBytes) return;
      const oldestFirst = [...index.entries()].sort(
        (a, b) => a[1].at - b[1].at,
      );
      for (const [victim] of oldestFirst) {
        if (bytes <= maxBytes) break;
        if (victim !== hash) await forget(victim);
      }
    },
  };
}

/** Bound upstream concurrency; extra requests wait their turn. */
function createGate(limit) {
  let active = 0;
  const waiting = [];
  return async (work) => {
    if (active >= limit) await new Promise((resolve) => waiting.push(resolve));
    else active += 1;
    try {
      return await work();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  };
}

/**
 * Fetch one allow-listed upstream answer with its byte cap and deadline.
 * Redirects are refused, so an upstream cannot move the request elsewhere.
 * @returns {Promise<{status: number, contentType: string, body: Uint8Array}>}
 */
async function fetchUpstream(target, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException('Tile upstream timed out', 'TimeoutError'),
      ),
    TILE_PROXY_TIMEOUT_MS,
  );
  try {
    const response = await fetchImpl(target.url, {
      redirect: 'error',
      signal: controller.signal,
      headers: { 'User-Agent': target.config.userAgent },
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return {
        status: response.status,
        contentType: 'application/json',
        body: new Uint8Array(0),
      };
    }
    const maxBytes =
      target.kind === 'tileJson'
        ? TILE_PROXY_MAX_TILEJSON_BYTES
        : TILE_PROXY_MAX_TILE_BYTES;
    const bytes = await readResponseBytesCapped(
      response,
      maxBytes,
      controller.signal,
    );
    if (target.kind === 'tileJson') {
      const document = JSON.parse(new TextDecoder().decode(bytes));
      return {
        status: 200,
        contentType: 'application/json',
        body: new TextEncoder().encode(
          JSON.stringify(rewriteTileJson(document, target.name)),
        ),
      };
    }
    return {
      status: 200,
      contentType:
        response.headers.get('content-type') || 'application/x-protobuf',
      body: bytes,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Vite plugin for the tile proxy.
 * @param {{fetchImpl?: typeof fetch, cacheDirectory?: string,
 *   diskMaxBytes?: number, now?: () => number}} [options] Server-only seams
 *   for tests.
 */
export function tileProxy({
  fetchImpl = (...args) => globalThis.fetch(...args),
  cacheDirectory = path.join(process.cwd(), '.vantage-cache', 'tiles'),
  diskMaxBytes = DISK_MAX_BYTES,
  now = Date.now,
} = {}) {
  const memory = createMemoryLru({
    maxEntries: MEMORY_MAX_ENTRIES,
    maxBytes: MEMORY_MAX_BYTES,
  });
  const disk = createDiskLru({
    directory: cacheDirectory,
    maxBytes: diskMaxBytes,
  });
  const inFlight = new Map();
  const gate = createGate(MAX_CONCURRENT_UPSTREAM);

  const ttlFor = (target) =>
    target.kind === 'tileJson'
      ? target.config.tileJsonTtlMs
      : target.config.tileTtlMs;

  /** A cached answer (a tile, or a tile the upstream has no data for). */
  async function cached(key) {
    const hit = memory.get(key);
    if (hit) return hit;
    const stored = await disk.get(key);
    if (stored) memory.set(key, stored);
    return stored;
  }

  async function resolve(target) {
    const key = target.url;
    const entry = await cached(key);
    if (entry && now() - entry.at < ttlFor(target))
      return { entry, cache: 'HIT' };
    const { promise } = coalesceProxyRequest(inFlight, key, () =>
      gate(() => fetchUpstream(target, fetchImpl)),
    );
    let answer;
    try {
      answer = await promise;
    } catch (error) {
      if (entry && now() - entry.at < STALE_IF_ERROR_MS)
        return { entry, cache: 'STALE' };
      throw error;
    }
    // A tile the upstream has no data for (404, e.g. open ocean in the ALPR
    // extract) is cached like a tile, so empty areas are not asked again.
    const cacheable =
      answer.status === 200 ||
      (answer.status === 404 && target.kind === 'tile');
    if (!cacheable) {
      const failing = answer.status === 429 || answer.status >= 500;
      if (failing && entry && now() - entry.at < STALE_IF_ERROR_MS)
        return { entry, cache: 'STALE' };
      return { entry: answer, cache: 'MISS' };
    }
    const fresh = { ...answer, at: now() };
    memory.set(key, fresh);
    await disk.set(key, fresh);
    return { entry: fresh, cache: 'MISS' };
  }

  const installMiddleware = (server) => {
    server.middlewares.use(ROUTE, async (req, res) => {
      const sendError = (status, error) => {
        if (res.headersSent) return;
        res.writeHead(status, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({ error }));
      };
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendError(405, 'Method Not Allowed');
        return;
      }
      const target = resolveTileProxyPath(
        new URL(req.url || '', 'http://internal').pathname,
      );
      if (!target) {
        sendError(404, 'Unknown tile path');
        return;
      }
      try {
        const { entry, cache } = await resolve(target);
        if (entry.status !== 200) {
          sendError(
            entry.status === 404 ? 404 : 502,
            'Tile upstream unavailable',
          );
          return;
        }
        res.writeHead(200, {
          'Content-Type': entry.contentType,
          'Content-Length': String(entry.body.byteLength),
          'Cache-Control': `private, max-age=${Math.floor(ttlFor(target) / 1000)}`,
          'X-Vantage-Tile-Cache': cache,
        });
        res.end(req.method === 'HEAD' ? undefined : Buffer.from(entry.body));
      } catch (error) {
        const timedOut = error?.name === 'TimeoutError';
        console.warn(
          `[tile-proxy] ${target.name} ${timedOut ? 'timed out' : 'request failed'}`,
        );
        sendError(timedOut ? 504 : 502, 'Tile upstream unavailable');
      }
    });
  };

  return {
    name: 'tile-proxy',
    configureServer: installMiddleware,
    configurePreviewServer: installMiddleware,
  };
}
