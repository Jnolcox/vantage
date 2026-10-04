/**
 * Stateless Streamable HTTP transport for an MCP server: one JSON-RPC message
 * per POST, answered with a JSON body. Uses standard Request and Response so
 * any web-standard runtime can mount it. The host owns routing and any access
 * control in front of it.
 */

import { readResponseTextCapped } from '../../sources/httpBody.js';
import { MCP_PROTOCOL_VERSIONS, parseErrorResponse } from './protocol.js';

const MAX_BODY_BYTES = 1024 * 1024;

/** Return `(request) => Promise<Response>` for an MCP server. */
export function createMcpHttpHandler(server) {
  return async function handleMcpRequest(request) {
    if (request.method !== 'POST')
      return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    const version = request.headers.get('mcp-protocol-version');
    if (version && !MCP_PROTOCOL_VERSIONS.includes(version))
      return json(400, {
        error: `Unsupported MCP protocol version: ${version}`,
      });
    const type = request.headers.get('content-type') || '';
    if (!/^application\/json\b/i.test(type))
      return json(415, { error: 'Content-Type must be application/json' });
    // Stops reading as soon as the body passes the limit, so a body without
    // a Content-Length cannot be buffered without bound.
    let text;
    try {
      text = await readResponseTextCapped(request, MAX_BODY_BYTES);
    } catch (error) {
      if (error?.code === 'RESPONSE_TOO_LARGE')
        return json(413, { error: 'Request too large' });
      throw error;
    }
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      return json(400, parseErrorResponse());
    }
    const response = await server.handle(message, { signal: request.signal });
    return response ? json(200, response) : new Response(null, { status: 202 });
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
