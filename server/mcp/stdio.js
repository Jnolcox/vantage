/**
 * Local MCP server over stdio for agents such as Claude Code and Codex.
 *
 *   npm run mcp -- [--api-base http://127.0.0.1:4173]
 *
 * Reads newline-delimited JSON-RPC from stdin and writes responses to stdout.
 * Tools read data from a running Vantage server (`npm run dev` or
 * `npm run preview`) at the API base. Diagnostics go to stderr.
 */

import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseErrorResponse } from '../../src/tools/mcp/index.js';
import { createLocalMcpServer } from './server.js';
import { DEFAULT_API_BASE } from './services.js';

/** Method and tool names as they are logged; anything else is not echoed. */
const LOGGABLE_NAME = /^[\w./-]{1,80}$/;
/** Resource URIs as they are logged, such as ui://vantage/globe. */
const LOGGABLE_URI = /^[a-z][\w+.-]{0,20}:\/\/[\w./-]{1,80}$/i;

/**
 * A one-line description of a request for the diagnostic log: its method,
 * and the tool or resource it names. Arguments and data are never logged,
 * and a name that does not look like one (free text, a line break) is
 * replaced, so a client cannot write arbitrary text or forge lines in the
 * log.
 */
export function describeRequest(message) {
  if (typeof message?.method !== 'string') return null;
  const method = LOGGABLE_NAME.test(message.method)
    ? message.method
    : '(unnamed method)';
  if (method === 'tools/call') {
    const tool = message.params?.name;
    if (typeof tool !== 'string') return method;
    return `${method} ${LOGGABLE_NAME.test(tool) ? tool : '(unnamed tool)'}`;
  }
  if (method === 'resources/read') {
    const uri = message.params?.uri;
    if (typeof uri !== 'string') return method;
    return `${method} ${LOGGABLE_URI.test(uri) ? uri : '(unnamed resource)'}`;
  }
  return method;
}

/**
 * Why a tool call failed, as its error code. The message is left out: it can
 * repeat an argument, such as a place name that matched nothing.
 */
export function describeFailure(response) {
  const result = response?.result;
  if (!result?.isError) return null;
  const code = result.structuredContent?.error;
  return typeof code === 'string' ? code : 'unknown';
}

/**
 * Serve newline-delimited JSON-RPC until `input` ends. A client's
 * `notifications/cancelled` aborts the named request, which then gets no
 * response, as the protocol asks.
 */
export async function serveStdio(server, { input, output, log = () => {} }) {
  const lines = createInterface({ input, crlfDelay: Infinity });
  const pending = new Set();
  const running = new Map();
  for await (const line of lines) {
    if (!line.trim()) continue;
    const work = respond(server, line, log, running).then((response) => {
      if (response) output.write(`${JSON.stringify(response)}\n`);
    });
    pending.add(work);
    work.finally(() => pending.delete(work));
  }
  await Promise.all(pending);
}

async function respond(server, line, log, running) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return parseErrorResponse();
  }
  if (message?.method === 'notifications/cancelled') {
    running.get(message.params?.requestId)?.abort();
    return null;
  }
  const described = describeRequest(message);
  if (described) log(described);
  const id = message?.id;
  // A reused id while the first is still running is not tracked, so a
  // cancellation can only ever name one request.
  const cancellable = id !== undefined && id !== null && !running.has(id);
  const controller = new AbortController();
  if (cancellable) running.set(id, controller);
  let response;
  try {
    response = await server.handle(message, { signal: controller.signal });
  } finally {
    if (cancellable) running.delete(id);
  }
  if (controller.signal.aborted) return null;
  // A failed tool call answers the client, not the log; say why here too.
  const failure = describeFailure(response);
  if (failure) log(`   ${described} failed: ${failure}`);
  return response;
}

/** Read `--api-base <url>` from command-line arguments. */
export function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--api-base' && argv[index + 1])
      options.apiBase = argv[(index += 1)];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const options = parseArgs(process.argv.slice(2));
    console.error(
      `Vantage MCP server reading ${options.apiBase || DEFAULT_API_BASE}`,
    );
    await serveStdio(createLocalMcpServer(options), {
      input: process.stdin,
      output: process.stdout,
      log: (line) => console.error(`<- ${line}`),
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
