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
for people and a structured object for programs. A tool may also return
`images`, each `{ mimeType, data }` with base64 data; the MCP adapter sends
them as image content. MCP results carry the summary and the data as JSON
text, plus the data as `structuredContent`, for clients that read only one of
them.

`composeCatalog({ tools, services, replace, interceptors })` builds a catalog:

- **Tools**: an application adds its own tools to `coreTools`. Reusing a name
  fails unless the name is listed in `replace`.
- **Services**: each tool names the services it reads in `requires`. Tools
  whose services are not supplied are left out.
- **Interceptors**: `(call, next) => next(call)` functions wrap every call,
  outermost first. They can observe, reject or change a call.

Expected failures throw `ToolError` with one of `invalid_arguments`,
`unavailable`, `unsupported`, `malformed` or `retry_later`. Failures the live
sources report (`LiveSourceError` in `src/sources/live/contract.js`) become
the matching tool error, so a rate limit reaches clients as `retry_later` with
a wait time. Other errors are reported to clients without details.

## Services

`vantage/tools/services` builds the default set with
`createToolServices({ fetchImpl, appUrl })`. Services are the portable source
factories the layers already use, such as `createUsgsEarthquakeSource`,
`createFirmsSource` and `createLaunchSource`, plus a `places` service with
`resolve(name, { signal })`. Sources request relative `/api/...` paths through
an injected `fetchImpl`, so the same tool code runs wherever an application
routes those paths. `createGeocodePlaceService` resolves place names through
`/api/geocode`; `createPlaceSearchService` searches `/api/google/*` and reports
when no search key is configured, which `search_places` and `places_nearby`
answer as `unavailable` rather than as an empty result; `createRouteService`
plans routes through `/api/route`. The `bikeshare` service is
`{ systems, getStations }`, the system registry and the GBFS source, which reads
station documents through `/api/gbfs`; `transit` is the transit layer's source
over `/api/transit`. `vessels` is the AISStream source over `/api/ais-live`; it
builds its snapshot URL against the `appUrl` passed to `createToolServices` (the
MCP server passes its `--api-base`). Without `AISSTREAM_API_KEY` on the server,
the route's own reason reaches clients as an `unavailable` error.
`get_bike_share` and `get_transit_vehicles` read at most the three systems or
feeds nearest the area whose coverage reaches it, and report any that did not
answer instead of failing the whole answer. `traffic` is the Street Traffic
layer's source: `get_traffic_flow` reads TomTom flow tiles through
`/api/tomtom/flow`, which spends the server's TomTom quota, so it reads at most
the 16 tiles the flow source allows per request, stepping down from zoom 12 to 9
for a larger area and refusing an area that still needs more. For a radius area
it measures only the road inside the circle, and when a tile fails to load it
says its figures are partial (`partial: true`); the flow source reports that per
request through `fetchFlowDetail`, which the layer does not use. It answers
`unavailable` when no TomTom key is configured. These are the app's own routes,
so the tools inherit their limits: the Google routes keep their per-IP throttle
(a `429` becomes `retry_later` with its wait), refuse proxied requests, and
never expose the key. The `weather`, `regional`, `terrain`, `summary` and
`features` services are the application request services from
`src/services/requests.js`, the same ones the HUD and cockpit use.
`situation_brief` and `military_awareness` run each section whose services are
supplied and mark the others unavailable. A new tool adds the services it reads
to `createToolServices`, so every surface composes the same set.

`weatherMaps` and `wind` are the Weather and Wind layers' sources over
`/api/weather` and `/api/wind`. `get_weather_map` asks for one 1024 by 512 image
of the latest frame, in a 2:1 window snapped to 0.25° that the image route
accepts, or the product's whole extent when no window can hold the area.
`get_wind` samples the model grid with the layer's own sampling.

`get_map_features` reads `/api/overpass`, which reaches only the Overpass
instances an operator lists in `VANTAGE_OVERPASS_UPSTREAMS`. With none, the
request services' one `/api/overpass/status` probe says so and the tool
answers `unavailable` ("No Overpass instance configured") instead of an empty
list; no query is sent.

`get_hud_caption` and `get_regional_brief` spend provider quota: the caption
posts to `/api/openai/hud-summary` (OpenAI, under the per-IP
`VANTAGE_RATELIMIT_OPENAI_PER_MIN` throttle, answering `unavailable` when no
OpenAI key is configured) and the brief reads `/api/regional-brief` (place,
weather and news lookups, 30 requests a minute per client). Each runs only when
a client calls it. The HUD's Live/Local context toggle does not apply to them:
it governs only the HUD's own periodic lookups in the page. The caption sends
the HUD's summary context (place and section labels, never coordinates), with
each section as a layer whose feed state comes from its own result (`stale` when
the result says so, `degraded` when some feeds or satellites behind it did not
answer, `unavailable` when it failed) and the overall state from
`feedProvenanceEnvelope`. As in the HUD, a caption that does not name a
non-nominal overall state is not shown as live: the tool answers with the app's
own line instead (the place, the state and up to two sections behind it,
`caption_source: "app"`), so the paid answer is not wasted on a refusal.

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

The server writes one line per request to stderr, which clients such as
Claude Desktop copy into their logs: the method, the tool a `tools/call`
names, and for a failed call its error code (`invalid_arguments`,
`retry_later`, ...). Arguments, results and error messages, which can repeat
an argument, are never logged, and a method or tool name that is not a plain
name is logged as `(unnamed ...)` rather than echoed.

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

| Tool                          | Reads                | Returns                                                                                     |
| ----------------------------- | -------------------- | ------------------------------------------------------------------------------------------- |
| `get_earthquakes`             | `earthquakes`        | USGS M2.5+ events in the last 24 hours, strongest first                                     |
| `get_active_fires`            | `fires`              | NASA FIRMS detections in an area, highest radiative power first                             |
| `get_recent_launches`         | `launches`           | Launch Library 2 launches in the last 30 days, newest first                                 |
| `aircraft_in_area`            | `aircraft`           | Aircraft in an area, nearest first; `military: true` reads the `military` feed              |
| `find_aircraft`               | `aircraft`           | Aircraft anywhere by callsign, ICAO address or registration                                 |
| `get_aircraft_track`          | `aircraft`           | Recent positions of one aircraft, thinned to 200 points                                     |
| `get_aircraft_info`           | `aircraft`           | Aircraft type and registration, and flight route, from adsbdb                               |
| `vessels_in_area`             | `vessels`            | Ships reported by AIS in an area, nearest first, optionally by type                         |
| `find_vessel`                 | `vessels`            | Ships anywhere by MMSI, IMO number or name                                                  |
| `get_vessel_track`            | `vessels`            | Recent positions of one ship, thinned to 200 points                                         |
| `next_satellite_pass`         | `satellites`         | Next pass over a place or point (default the ISS), with naked-eye visibility                |
| `satellites_overhead`         | `satellites`         | Satellites in a CelesTrak group above a place or point now, highest first                   |
| `find_cctv_cameras`           | `cctv`               | Public cameras in an area, nearest first, noting regions the catalog only partly serves     |
| `get_cctv_snapshot`           | `cctv`               | The current image from one camera, returned as image content                                |
| `find_radio_stations`         | `radio`              | Radio Browser stations by area and/or search terms, with stream URLs                        |
| `search_places`               | `placeSearch`        | Points of interest matching a query within an area (Google Places)                          |
| `places_nearby`               | `placeSearch`        | Notable places around a place or point (Google Places)                                      |
| `plan_route`                  | `routing`            | Walking, driving or cycling route over OpenStreetMap, with a simplified path                |
| `get_bike_share`              | `bikeshare`          | Live GBFS stations in an area, with bikes and docks available                               |
| `get_transit_vehicles`        | `transit`            | Live GTFS-Realtime vehicle positions in an area, optionally one route                       |
| `get_traffic_flow`            | `traffic`            | TomTom flow in a city-sized area: speed vs free flow, congested and closed road             |
| `get_weather`                 | `weather`            | Current conditions at a place or point                                                      |
| `get_weather_map`             | `weatherMaps`        | The latest NOAA radar, satellite or lightning map image over an area                        |
| `get_wind`                    | `wind`               | GFS or IFS model wind 10 m above ground at a location                                       |
| `get_regional_brief`          | `regional`           | What and where a location is, its weather and recent headlines                              |
| `get_cyclones`                | `cyclones`           | Active NHC/CPHC tropical cyclones, optionally in an area                                    |
| `get_fire_perimeters`         | `perimeters`         | Mapped WFIGS wildfire perimeters in an area, largest first                                  |
| `get_terrain_height`          | `terrain`            | Ground, geoid and ellipsoid heights at up to 20 points                                      |
| `find_military_installations` | `installations`      | OpenStreetMap military sites in an area of at most 10° per side                             |
| `get_map_features`            | `features`           | Administrative areas, named places or monuments at a location (needs Overpass)              |
| `situation_brief`             | `weather`            | Weather, earthquakes, fires, aircraft, ships and cyclones for an area, by section           |
| `military_awareness`          | `military`           | Military and other aircraft and military installations within 250 km of a point, by section |
| `get_hud_caption`             | `weather`, `summary` | The app's heads-up display caption for an area                                              |
