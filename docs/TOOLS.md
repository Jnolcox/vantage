# Tools and the MCP server

Tools answer questions from Vantage data for language-model clients. They are
defined once and exposed through adapters; the Model Context Protocol (MCP) is
the first.

## Layers

| Owner                   | Responsibility                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `src/tools/`            | Tool definitions, catalog composition, argument validation, shared `area` and result helpers     |
| `src/tools/queries/`    | Queries, one file per domain, reading only portable source contracts                             |
| `src/tools/mcp/`        | MCP protocol (JSON-RPC) and a stateless HTTP transport; knows the catalog interface, not queries |
| `src/tools/services.js` | The default services: the layers' source factories and place services, given a resolving fetch   |
| `server/mcp/`           | Node composition: points the services at a running app's `/api` routes and serves stdio          |

Dependencies point downward only. `vantage/tools`, `vantage/tools/mcp` and
`vantage/tools/services` are portable exports: they reach no application,
rendering, Node, Cesium or browser-global code, which
`npm run check:boundaries` enforces. Nothing in the application imports them
(`scripts/check-import-directions.mjs` reports any `src/` module outside
`src/tools/` that does), so they add nothing to the page.

## Definitions and composition

`defineTool({ name, kind, title, description, inputSchema, requires, run })`
validates and freezes a tool. `kind` is `query` (answers from data, read-only)
or `action`. `inputSchema` uses a JSON Schema subset that `src/tools/schema.js`
checks completely; unsupported keywords are rejected at definition time.
`run(args, { services, signal })` resolves to `{ summary, data }`: one sentence
for people and a structured object for programs. MCP results carry the
summary and the data as JSON text, plus the data as `structuredContent`, for
clients that read only one of them.

`composeCatalog({ tools, services, replace, interceptors })` builds a catalog:

- **Tools**: an application adds its own tools to `coreTools`. Reusing a name
  fails unless the name is listed in `replace`.
- **Services**: each tool names the services it reads in `requires`. Tools
  whose services are not supplied are left out.
- **Interceptors**: `(call, next) => next(call)` functions wrap every call,
  outermost first. They can observe, reject or change a call.

Expected failures throw `ToolError` with one of `invalid_arguments`,
`unavailable`, `unsupported`, `malformed` or `retry_later`. Other errors are
reported to clients without details.

## Services

`vantage/tools/services` builds the default set with
`createToolServices({ fetchImpl })`. Services are the portable source
factories the layers already use, such as `createUsgsEarthquakeSource`,
`createFirmsSource` and `createLaunchSource`, plus a `places` service with
`resolve(name, { signal })`. Sources request relative `/api/...` paths through
an injected `fetchImpl`, so the same tool code runs wherever an application
routes those paths. `createGeocodePlaceService` resolves place names through
`/api/geocode`. A new tool adds the services it reads to `createToolServices`,
so every surface composes the same set.

## The `area` argument

Location-scoped tools take `area` as exactly one of a `place` name, a `bbox`
(`[west, south, east, north]`, crossing the antimeridian when west exceeds
east), or `lat`, `lon` and `radius_km`. Lists default to 25 rows, at most 200,
and report `total`, `returned` and `truncated`.

## MCP

`createMcpServer({ catalog, name, version, instructions, descriptions, decorate })`
implements `initialize`, `ping`, `tools/list` and `tools/call` for protocol
revisions 2025-11-25, 2025-06-18 and 2025-03-26. `descriptions` overrides a
tool's title or description for this surface; `decorate(definition, tool)`
merges extra fields into each listed definition. `createMcpHttpHandler(server)`
returns a `Request`-to-`Response` handler for stateless Streamable HTTP: one
JSON-RPC message per POST, answered with JSON. The host owns routing and any
access control in front of it; Vantage mounts no HTTP endpoint for it.

## Running locally

Start the app (`npm run dev` or `npm run preview`), then register the stdio
server with an MCP client, for example Claude Code:

```bash
claude mcp add vantage -- npm --prefix /path/to/vantage run --silent mcp
```

`npm run mcp -- --api-base http://127.0.0.1:5173` selects another server. The
default is `http://127.0.0.1:4173`, the IPv4 loopback address the app binds;
`localhost` may resolve to `::1` first and miss it.

## Network and security

The stdio server opens no listener: no port, no socket, nothing another
program or website can connect to. The MCP client that launches it is the only
party that can talk to it, through the process's stdin and stdout. It reaches
only the app's `/api` routes on the loopback address, as any local process
already can, and passes the same `Host`, `Origin` and `Sec-Fetch-Site` checks
as other local non-browser tools such as curl. It reads no keys: requests that
need one go through the app's routes, which keep their keys server-side, their
per-IP throttles and their "not configured" answers. It is therefore available
without an opt-in setting; it runs only when you register it with a client.

A few sources fetch a public feed directly instead of through `/api`
(`get_earthquakes` reads the USGS feed). Those requests leave from the stdio
process, on a tool call only, with the `vantage-mcp-tools` User-Agent from
`src/sources/projectIdentity.js`. The README's
[Network & privacy](../README.md#network--privacy) section lists them.

## Tools

| Tool                  | Reads         | Returns                                                         |
| --------------------- | ------------- | --------------------------------------------------------------- |
| `get_earthquakes`     | `earthquakes` | USGS M2.5+ events in the last 24 hours, strongest first         |
| `get_active_fires`    | `fires`       | NASA FIRMS detections in an area, highest radiative power first |
| `get_recent_launches` | `launches`    | Launch Library 2 launches in the last 30 days, newest first     |
