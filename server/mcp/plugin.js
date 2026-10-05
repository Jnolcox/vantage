/**
 * Serves the local MCP server at /mcp on the development and preview servers,
 * only when the operator sets VANTAGE_MCP_HTTP=1.
 *
 * The route is off by default because it carries no token or secret: any
 * program on this machine that can reach it can run tools that spend provider
 * quota. When it is on, this is local transport safety, not authentication:
 * requests must come from this machine, name a loopback host (blocking DNS
 * rebinding) and, when a browser sends an Origin, come from a loopback origin.
 * The root Host check (server/standalone/api-request-guard.js) runs first.
 */

import { createMcpHttpHandler } from '../../src/tools/mcp/index.js';
import { createLocalMcpServer } from './server.js';

/** The setting that turns the /mcp route on. It has no pre-rename name. */
export const MCP_HTTP_SETTING = 'VANTAGE_MCP_HTTP';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const MAX_BODY_BYTES = 1024 * 1024;

/** Whether VANTAGE_MCP_HTTP turns the /mcp route on (`1` or `true`). */
export function isMcpHttpEnabled(env = process.env) {
  return /^(1|true)$/i.test(String(env[MCP_HTTP_SETTING] ?? '').trim());
}

/** Whether a request may reach the local MCP server. */
export function isLocalMcpRequest({ remoteAddress, host, origin }) {
  if (!LOOPBACK_ADDRESSES.has(remoteAddress)) return false;
  let hostUrl;
  try {
    hostUrl = new URL(`http://${host}`);
  } catch {
    return false;
  }
  if (!LOOPBACK_HOSTS.has(hostUrl.hostname)) return false;
  if (origin == null) return true;
  try {
    const originUrl = new URL(origin);
    return (
      ['http:', 'https:'].includes(originUrl.protocol) &&
      LOOPBACK_HOSTS.has(originUrl.hostname)
    );
  } catch {
    return false;
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

/**
 * Answer /mcp with a JSON 404 that names the setting, so Vite's SPA fallback
 * does not answer an MCP client with the application's HTML.
 */
function disabledMcpMiddleware(_req, res) {
  sendJson(res, 404, {
    error: `The MCP server over HTTP is off; set ${MCP_HTTP_SETTING}=1 to serve it at /mcp`,
  });
}

function localMcpMiddleware(createServer) {
  const handlers = new Map();
  const handlerFor = (apiBase) => {
    if (!handlers.has(apiBase))
      handlers.set(apiBase, createMcpHttpHandler(createServer({ apiBase })));
    return handlers.get(apiBase);
  };
  return async (req, res) => {
    const host = req.headers.host || '';
    if (
      !isLocalMcpRequest({
        remoteAddress: req.socket?.remoteAddress,
        host,
        origin: req.headers.origin,
      })
    ) {
      sendJson(res, 403, {
        error: 'The MCP server only accepts local requests',
      });
      return;
    }
    // Key servers by the normalized host, so respelling an admitted Host
    // (case, a zero-padded port) cannot make a new server per request.
    const authority = new URL(`http://${host}`).host;
    // A client that disconnects before its answer cancels the tool call.
    const disconnect = new AbortController();
    const onClose = () => {
      if (!res.writableFinished) disconnect.abort();
    };
    res.on('close', onClose);
    try {
      const body = req.method === 'POST' ? await readBody(req) : undefined;
      const request = new Request(`http://${authority}/mcp`, {
        method: req.method,
        headers: Object.entries(req.headers).flatMap(([name, value]) =>
          value === undefined ? [] : [[name, String(value)]],
        ),
        body,
        signal: disconnect.signal,
      });
      const response = await handlerFor(`http://${authority}`)(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      if (disconnect.signal.aborted) return;
      if (res.headersSent) return res.destroy();
      const tooLarge = error?.status === 413;
      sendJson(res, tooLarge ? 413 : 400, {
        error: tooLarge ? 'Request too large' : 'Bad request',
      });
    } finally {
      res.off('close', onClose);
    }
  };
}

/**
 * Vite plugin that owns /mcp: the local MCP server when `enabled`, otherwise
 * a JSON 404 naming VANTAGE_MCP_HTTP. Install it after the providers and
 * before the API fallback.
 */
export function localMcpPlugin({
  enabled = false,
  createServer = createLocalMcpServer,
} = {}) {
  const install = (server) => {
    server.middlewares.use(
      '/mcp',
      enabled ? localMcpMiddleware(createServer) : disabledMcpMiddleware,
    );
  };
  return {
    name: 'local-mcp',
    configureServer: install,
    configurePreviewServer: install,
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      // Keep draining without storing, so the 413 response can still be sent.
      if (tooLarge || size <= MAX_BODY_BYTES) {
        if (!tooLarge) chunks.push(chunk);
        return;
      }
      tooLarge = true;
      chunks.length = 0;
      reject(Object.assign(new Error('Request too large'), { status: 413 }));
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
