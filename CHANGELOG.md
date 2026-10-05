# Changelog

All notable changes to Vantage are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
[`docs/RELEASING.md`](docs/RELEASING.md) defines what counts as a major, minor
or patch change and how a release is cut. For the authoritative description of
current runtime behavior, see [`docs/CURRENT-STATE.md`](docs/CURRENT-STATE.md).

## [Unreleased]

### Added

- MODIS NRT (Terra + Aqua, ~1 km) detections join the three VIIRS NRT sources
  in the Active Fires layer. They share the existing `FIRMS_MAP_KEY`, the
  30-minute proxy cache and the trailing-24-hour clamp; MODIS confidence is
  kept as its raw 0-100 value (ported from upstream, Bilawal Sidhu, Gustavo
  Beneduzi, James Cooke).
- Fire Perimeters layer in the Events group, off by default: current NIFC
  WFIGS interagency wildfire perimeters as ground-clamped polygons with a
  containment-colored fire line and a containment legend on the row,
  refreshed every 5 minutes. Clicking a perimeter shows an incident card
  (acreage, containment, cause, behavior, personnel, county, cost, complex)
  and, when InciWeb has a page for the incident whose state and dates match,
  a link that opens it in a new tab without a referrer. The layer is
  reachable from voice (`set_layer_visibility`, `analyst_query`), share links
  (token `2`) and the analyst query engine. WFIGS and InciWeb are reached
  only through the same-origin `/api/fire-perimeters` proxy, which sends the
  Vantage User-Agent, caps and times out every read, pages past the
  2,000-feature limit in a stable `OBJECTID` order, caches (perimeters
  5 minutes, InciWeb catalog 1 hour, incident pages 30 minutes, stale on
  error) and limits each client to 60 requests a minute (ported from
  upstream, Bilawal Sidhu, Gustavo Beneduzi, James Cooke).
- Same-origin `/api/wind` forecast proxy for the Wind layer: NOAA GFS and
  ECMWF IFS 10 m wind, optionally with 2 m temperature or mean sea-level
  pressure from the same run, decoded server-side by ecCodes (WebAssembly,
  loaded on the first wind request only) and served as a manifest plus a
  1° Float32 grid. It byte-range fetches only the needed GRIB2 messages with
  the Vantage User-Agent, caps every body, caches one entry per model and
  field for an hour with the previous grid kept for rollovers, retries a
  failed upstream at most once a minute and serves the last good grid as
  stale (ported from upstream, Bilawal Sidhu, Gustavo Beneduzi).
- Same-origin `/api/weather` proxy for observed weather from NOAA nowCOAST:
  MRMS radar reflectivity, GOES regional and NESDIS global infrared, and
  15-minute lightning density. It reads WMS capabilities (2 minutes, 10 for
  lightning, last good copy served stale for an hour) and serves exact
  advertised frames as geographic tiles, whole-extent images or 0.25°-rounded
  detail windows, with the Vantage User-Agent, no redirects, checked and
  capped PNG bodies, a 12-second deadline, 8 concurrent upstream requests and
  one shared 16 MiB image cache. Tiles and windows follow the view, so NOAA
  sees the approximate area in view from the server's address (ported from
  upstream, Bilawal Sidhu).
- Same-origin `/api/cyclones` proxy for NOAA NHC/CPHC tropical cyclone
  advisories: the NHC current-storms status plus the forecast points, track
  and cone from the NOAA tropical weather summary GIS, attached only when
  their advisory number matches the status. Fixed upstream queries with the
  Vantage User-Agent, no redirects, capped bodies and geometry, a 12-second
  deadline, one shared refresh cached for 5 minutes, a one-minute retry
  cooldown and the last good snapshot served as stale for up to 12 hours
  (ported from upstream, Bilawal Sidhu).
- A WEATHER panel in the right rail, between CCTV and Global Context, that
  holds one card per enabled weather layer (summary, legend, settings,
  actions and readings). It stays hidden while no weather layer is on, opens
  on its first appearance unless a stored or shared collapse choice says
  otherwise, and keeps its scroll position through refreshes (ported from
  upstream, Bilawal Sidhu).
- Wind layer in a new Weather group of the Layers panel, off by default:
  NOAA GFS or ECMWF IFS 10 m forecast wind as flow curves animated on the GPU
  (a bounded canvas particle fallback where GPU geometry is unavailable),
  optionally over a speed, 2 m temperature or mean sea-level pressure field
  draped on the globe or raised over 3D Tiles. Its card in the WEATHER panel
  picks the model, field, units and motion, shows the forecast valid and issue
  times, and reads the forecast at the map centre. Curves are capped at 7,200
  (1,200 on narrow screens) and the fallback at 3,000 particles (1,000 on
  narrow screens); nothing loads or animates until the layer is enabled, and
  pause, reduced motion and hidden tabs stop the animation loop. Model, field,
  units and pause are kept in share links (token `k`), and the GFS and ECMWF
  credits, including ECMWF's licence notice, are in Data attribution (ported
  from upstream, Bilawal Sidhu, Gustavo Beneduzi, Daniel Slay, Rehaan
  Delmotra).
- Rain radar, Satellite clouds and Lightning density layers in the Weather
  group, off by default, showing NOAA nowCOAST observations: MRMS radar
  reflectivity for the contiguous US, GOES regional (North America, about
  5-minute updates) or NESDIS global longwave infrared with a "Clouds only"
  brightness filter, and 15-minute lightning density for the Americas and the
  Pacific. Their cards in the WEATHER panel share one history timeline
  (Earlier, Later, Play, Latest over up to 13 advertised frames per product,
  each shown at its nearest frame at or before the chosen time), report the
  exact observation time and its age, give a legend in dBZ or
  strikes/km²/min ×10³, and offer opacity, region and image settings and a
  "View coverage" flight. Imagery drapes the globe or, on Google 3D Tiles,
  draws as a raised shell per product that rises with the camera over coarse
  distant tiles, with a sharper image in a window around the view. Nothing
  loads until a layer is enabled; disabling releases its imagery and caches.
  Shells hold at most 128 MiB of decoded images per product (32 MiB, with
  2048-pixel images, on viewports narrower than 700 px) and the global mosaic
  cache six frames (two on narrow viewports). Product, opacity and image mode
  are kept in share links (tokens `v`, `o` and `l`); history is not. NOAA
  credits join Data attribution (ported from upstream, Bilawal Sidhu).
- Cyclone advisories layer in the Weather group, off by default: NOAA
  NHC/CPHC storm positions, forecast tracks, lead-hour points and uncertainty
  cones for the Atlantic and eastern/central North Pacific from
  `/api/cyclones`, refreshed every 5 minutes. Geometry is drawn only when it
  matches the current advisory; markers, tracks and cones are hidden beyond
  the horizon, and storm cards and lead-hour labels share the world overlay.
  Clicking a storm selects it, and its WEATHER card shows the advisory,
  position time, wind, pressure and geometry status, a Storms list that flies
  to each storm, and an "Official advisory" link that opens the NHC text in a
  new tab without a referrer. A click on an AIS vessel card over cyclone
  geometry still selects the vessel. The layer is kept in share links (token
  `y`) and the NHC/CPHC credit joins Data attribution (ported from upstream,
  Bilawal Sidhu).
- Voice can show, hide and open the Wind layer (`set_layer_visibility`,
  `show_data_layers_menu`), including "winds", "wind layer" and "wind
  forecast".
- Voice can show, hide and open Rain radar, Satellite clouds and Lightning
  density (`set_layer_visibility`, `show_data_layers_menu`), including
  "radar", "rain radar", "precipitation", "clouds", "cloud cover",
  "lightning" and "lightning strikes"; the layer description tells the model
  that cloud imagery is `weather-satellite`, not the `satellites` orbit layer.
- Voice can show, hide and open Cyclone advisories (`set_layer_visibility`,
  `show_data_layers_menu`), including "cyclones", "hurricanes", "hurricane
  tracks" and "tropical storms"; the layer description says the advisories
  cover only the Atlantic and the eastern/central North Pacific.
- Satellite pass prediction for any loaded catalog satellite: a new
  `next_satellite_pass` voice tool takes an exact NORAD ID or name (an
  ambiguous name returns candidates instead of guessing), searches the next
  24 hours from the camera or given coordinates and can require an estimated
  visible pass. Rise and set are bisected to about 0.2 s, the peak is fitted
  with a parabola, and a pass counts as visible when the satellite is outside
  a cylindrical Earth shadow while the observer's Sun is at or below -6°.
  `next_iss_pass` keeps its next-geometric-pass answer and now adds
  visibility, set and peak times. Estimates ignore weather and brightness;
  everything runs locally on the already loaded catalog (ported from
  upstream, Rehaan Delmotra, Bilawal Sidhu).
- Voice answers say how fresh their data is: `analyst_query` and
  `get_current_view_state` now carry a `feedProvenance` envelope built from
  the same feed-state the Data Layers chips show (nominal, loading,
  degraded, partial, stale, fallback, unavailable or off), and the voice
  instructions forbid presenting a stale, degraded or unavailable count as
  live. Analyst follow-ups keep the provenance of the rows they re-read;
  existing result fields are unchanged (ported from upstream, Matt Van Horn,
  Bilawal Sidhu).
- `analyst_query` can answer questions about loaded satellites, datacenters
  and dams ("how many satellites are overhead", "nearest dam", "which
  datacenters does this operator run"). Records are built on demand only
  when a query runs; answers state that they cover a bounded slice of the
  loaded records (2,000 per layer) and that satellite distance is ground
  distance (ported from upstream, Matt Van Horn, Bilawal Sidhu).

- Registered CCTV sources with `"feedType": "hls"` and an HTTP(S) `.m3u8`
  URL are served live through `/api/cctv/media/<id>`: a bounded in-memory
  puller rewrites the agency playlist to same-origin `seg_N.ts` segments.
  At most two sessions run at once, each keeping 12 segments / 24 MiB; every
  download is capped (256 KiB playlists, 4 MiB segments, 10 s deadline),
  redirects and off-origin, encrypted or non-MPEG-TS playlists are refused,
  and nothing is written to disk. Each viewer holds its own lease, released
  by `DELETE` or after 15 s without access; the last release stops upstream
  work. Requests carry the Vantage CCTV User-Agent (ported from upstream,
  Daniel Slay, Bilawal Sidhu).
- Live HLS CCTV cameras play as moving video on the monitor plane and in
  the CCTV panel from one shared decoder. hls.js (1.7.3) is downloaded only
  when a live camera becomes active, never at page load; the panel repaints
  the shared video at most 640 px wide and 15 fps and stops while collapsed
  or hidden. Switching camera or turning CCTV off destroys the decoder and
  releases the server lease; a feed that fails falls back to the labelled
  still frame (ported from upstream, Daniel Slay, Bilawal Sidhu).
- CCTV Mesh adds Delaware: DelDOT live video cameras, keyless, 300 by
  default (nearest Wilmington, Dover and Georgetown). The
  `tmc.deldot.gov` catalog is read with the other CCTV catalogs and only
  official `https://video.deldot.gov/live/…/playlist.m3u8` links are
  registered; video is pulled through the same-origin HLS route only while
  a DelDOT camera is open. `VANTAGE_CCTV_DELDOT_ENABLED=0` disables the
  pack and `VANTAGE_CCTV_DELDOT_MAX_SOURCES` changes the cap (ported from
  upstream, Daniel Slay, Bilawal Sidhu).
- Recent Imagery layer in the Cameras group, off by default: select a box
  (drag, the current view, or around a pin; up to 1,000 km a side) and a
  RECENT IMAGERY panel in the right rail lists the last 30 days of NASA HLS
  Sentinel-2 / Landsat 8/9 (30 m) imagery over it, plus the VIIRS daily
  overview (250 m) when switched on, with thumbnails and scene cloud. IMAGE
  shows one day, VS BASEMAP swipes it against the map and A / B swipes two
  days; SWAP trades the sides, either image exports as a PNG, and box, pins,
  mode and split travel in share links (token `1`). While imagery is shown on
  Google 3D the map switches to Esri and comes back when it is cleared.
  Nothing is requested when the layer is enabled: NASA CMR, Worldview
  Snapshots and GIBS (one `gibs.earthdata.nasa.gov` origin) are contacted
  browser-direct only after the operator chooses a box, and a box kept from
  an earlier session or a share link waits for **SEARCH**. NASA receives the
  box and the browser's IP address; the three origins are in the CSP and the
  network inventory, and the NASA acknowledgement is in Data attribution
  (ported from upstream, Bilawal Sidhu, manjunath22466).
- Same-origin `/api/tiles` vector tile proxy. The server forwards only
  allow-listed OpenFreeMap (`/api/tiles/openfreemap/...`) and hourly
  OpenStreetMap ALPR extract (`/api/tiles/alpr/...`) paths to their one host,
  with the Vantage `openfreemap-proxy` / `alpr-tiles-proxy` User-Agent,
  a 256 KB TileJSON and 4 MB tile cap, a 10 s deadline, at most eight upstream
  requests at once, a bounded in-memory (48 MB) and on-disk (256 MB,
  `.vantage-cache/tiles`) LRU cache that also remembers tiles the upstream has
  no data for, and stale answers when the upstream fails. TileJSON is
  rewritten so every tile URL points back at the proxy, so the browser never
  contacts a third-party tile host.
- Area annotations outline countries, states and provinces (Natural Earth,
  including the UK constituent countries) and US counties (US Census Bureau)
  from bundled public-domain boundary packs, with no lookup service. County
  names are disambiguated across countries by aliases, qualifiers and the
  camera's position; multi-part outlines (Hawaii's islands, Berlin inside
  Brandenburg) draw every part with its holes. The packs load only on the
  first annotation that needs them. Annotation captions are drawn by the
  screen-space callouts instead of Cesium labels (ported from upstream,
  Bilawal Sidhu).
- Local RTL-SDR card in the Radio panel: connect a USB RTL-SDR in desktop
  Chrome or Edge through WebUSB and listen to broadcast FM (tune, seek,
  volume) or receive 1090 MHz ADS-B. Gain is AUTO or a manual R820T step,
  remembered per mode (`vantage:sdr:gain:v1`; ADS-B defaults to 28.0 dB), and
  an explicitly chosen device is remembered per mode
  (`vantage:sdr:device:v1`); CHANGE DEVICE reopens the WebUSB picker. Local
  FM and internet radio never play together. Nothing opens until CONNECT, and
  the RTL-SDR driver (`@jtarrio/webrtlsdr`, with `@jtarrio/signals`, both
  Apache-2.0, see `THIRD_PARTY_NOTICES.md`) is downloaded only then (ported
  from upstream, Bilawal Sidhu, building on work by Sameh Khamis and Mazeyar
  Moeini Feizabadi).
- Local ADS-B layer (`local-adsb`, off by default, never in share links):
  aircraft heard by your own receivers draw in magenta beside public Flights,
  with class silhouettes, 3D models under the DISPLAY rail's 3D setting, a
  selected-aircraft trail, real-time motion and a position sanity filter. The
  click card names the bands and inputs that heard each aircraft. Voice
  `set_layer_visibility` accepts `local-adsb` ("my receiver", "my antenna")
  (ported from upstream, Bilawal Sidhu).
- Local decoder feeds for Local ADS-B: list the `aircraft.json` of
  dump1090-fa, readsb, tar1090 or skyaware978 (1090 MHz and 978 MHz UAT) in
  `VANTAGE_LOCAL_RECEIVER_FEEDS` (`band=url`, comma-separated; upstream's
  `LOCAL_RECEIVER_FEEDS` is read as a fallback).
  `GET /api/local-receivers/aircraft` reads them with the Vantage User-Agent,
  a 2 s timeout, no redirects, a 2 MB cap and a 1 s shared cache, and reports each
  feed `live`, `stale`, `unreachable` or `invalid`. Only loopback, RFC1918,
  `localhost` and `*.local` hosts are accepted, through one shared tap address
  rule (`src/data/tapAddress.js`); names are resolved, checked and pinned on
  every read. Unset, the route fetches nothing. See `docs/LOCAL-RECEIVERS.md`
  (ported from upstream, Bilawal Sidhu and Tom-Neverwinter).
- **LOOK UP TYPE & ROUTE · ADSBDB** on the Local RTL-SDR card (on by
  default, kept per browser in `vantage:local-adsb:lookups:v1`). Local
  aircraft are looked up on adsbdb only while it is on; because a receiver
  hears only aircraft in its range, those lookups hint at its location, and
  clearing it keeps every local aircraft on the device.
- Cyber HUD layout (Display > HUD > Layout, or "switch to cyber layout" by
  voice), opt-in: coordinated red/slate map and cockpit panel styling with a
  one-panel-at-a-time right rail. Its contact sonar sweeps native points,
  billboards and labels on the GPU, with Display controls for rings, range,
  power, opacity and sector, and a `set_cyber_sonar` voice action that reports
  configured settings separately from the active effect. Unsupported shaders
  keep native contact rendering; leaving Cyber restores the standard shell and
  contacts. The sonar scene hook loads and runs only while Cyber is selected,
  so other layouts pay nothing for it (ported from upstream, manjunath22466
  and Sameh Khamis; sonar style inspired by kk376).
- Tools for language-model clients and a local MCP server. `npm run mcp`
  serves earthquake, active-fire, launch, aircraft (in an area, by identifier,
  tracks, type and route), ship (in an area, by MMSI, IMO or name, tracks;
  `unavailable` without `AISSTREAM_API_KEY`) and satellite (next pass over a
  place or point, those overhead now), public camera (find cameras, saying when
  the capped catalog serves only part of a region; a camera's current image),
  radio station, place search, routing, bike-share station (public GBFS systems)
  and transit vehicle (GTFS-Realtime feeds, with each feed's attribution and
  license; stale feeds are marked and expired positions dropped, by the transit
  layer's rules), road traffic flow (TomTom, at most 16 flow tiles per call)
  queries, plus weather, regional
  brief, tropical cyclone, fire perimeter, terrain height, military
  installation and map feature queries, a combined situation brief, military
  awareness around a point and the HUD caption, over stdio to clients such as
  Claude Code, reading from a running app at `http://127.0.0.1:4173`
  (`--api-base` selects another). Tools are defined once in `vantage/tools`,
  read the services `vantage/tools/services` builds from the layers' source
  factories, and are exposed through the protocol adapter in
  `vantage/tools/mcp`. The server opens no port; the app does not import the
  tools. `get_map_features` answers `unavailable` when no
  `VANTAGE_OVERPASS_UPSTREAMS` instance is configured, and the HUD caption
  sends the HUD's own label-only summary context, with each section's feed
  state taken from its result; as in the HUD, a caption that hides a
  non-nominal state is replaced by the app's own line naming it (ported from
  upstream, Sameh Khamis).

### Changed

- Performance: each bundled data pack ships once. The region, marine,
  admin-boundary, county, military-name and neighborhood packs were emitted
  twice by the production build, as the JSON the browser fetches and as an
  unused JavaScript copy; `dist/` drops from 55.2 MB to 42.4 MB and the main
  chunk is unchanged. Under Node the loader reads the JSON file directly
  (reporting that Node 24.14 or newer is needed on a runtime too old to do
  so), and a test keeps app code from importing a pack as a module (ported
  from upstream, Sameh Khamis).
- The Host check now covers every route, not only `/api`: plugin middleware
  runs before Vite's own check, so a non-`/api` route answered any Host,
  including a DNS-rebinding name. The guard applies the same allowed names to
  every path on the dev and preview servers. The built-in `.local` suffix is
  gone, and suffix (`.lan`) and wildcard (`*.lan`) entries in
  `VANTAGE_ALLOWED_HOSTS` are ignored, so every trusted name is listed
  exactly. LAN mode still adds this machine's hostname; a TLS-proxy name such
  as `vantage.local` must now be listed in `VANTAGE_ALLOWED_HOSTS` (adapted
  from upstream, Sameh Khamis, Puspo Aditya).
- The per-IP throttles on the cost-bearing proxies are on for every bind,
  not only in LAN mode: the OpenAI endpoints (`/api/realtime/token`,
  `/api/openai/hud-summary`) allow 30 requests a minute per client IP and the
  Google Places endpoints (`/api/google/nearby-places`,
  `/api/google/text-search`) 60. `VANTAGE_RATELIMIT_OPENAI_PER_MIN` and
  `VANTAGE_RATELIMIT_GOOGLE_PER_MIN` still override them and exactly `0`
  disables them; an unreadable value falls back to the default instead of to
  unlimited, and a positive fraction counts as 1. The Pinokio build's Google
  cap drops from 120 to the same 60. The provider export
  `makeOptInRateLimiter(value)` is now `makeCostRateLimiter(value, default)`
  (adapted from upstream, daikaginza, Sameh Khamis).
- `cesium` is pinned to exactly 1.138.0 (was `^1.124.0`). The Cyber sonar GPU
  path rewrites Cesium's native contact shaders and is validated against that
  release only; a test fails when the installed or declared version differs,
  so an engine upgrade is a deliberate change that revalidates the adapter.
- A selected AIS vessel's detail card sits a little further from the
  contact and may move beside it, not only above or below, to clear solid
  panels; ambient vessel cards keep their vertical-only placement (ported
  from upstream, Bilawal Sidhu).
- The HUD says when its data is not live. The telemetry line appends the
  worst non-nominal feed state and up to two layer names (for example
  `| STALE LIVE FLIGHTS`). With HUD Context set to **Live**, the AI summary
  request also carries each enabled layer's feed state and source name, the
  five words must include a non-nominal state, and a summary that omits it
  is replaced by the local line; layer refreshes now refresh the summary.
  Counts and ages are not sent, so a routine refresh does not trigger a new
  OpenAI request. In **Local** mode nothing new leaves the browser (ported
  from upstream, Matt Van Horn, Bilawal Sidhu).
- Google Photorealistic 3D Tiles (direct and through ion) keep drawing their
  own texture while draped imagery loads, and the map controller reports the
  shown tileset so a layer can drape onto it when the globe is hidden; this is
  the groundwork for weather imagery on 3D Tiles (ported from upstream,
  Bilawal Sidhu).
- Layer rows that push their own refresh (a settling catalog, a status
  change) now repaint at most once per animation frame instead of once per
  notification, and a pending repaint is cancelled when the panel is torn
  down (ported from upstream, Bilawal Sidhu).
- Layer-row color legends are rebuilt only when an entry changes, and rows
  can carry a plain-text info line and a readout-only mode (toggle and
  metadata, controls shown elsewhere) for the right-rail panels to come
  (ported from upstream, Bilawal Sidhu).
- Share-link layer tokens are durable allocations instead of ad hoc picks.
  Existing one-character mappings, including the ones upstream published for
  layers not yet ported, are pinned permanently in
  `src/data/layerStateTokenReservations.json`; new layers take the next free
  single-character digit, then two-character base-36 tokens.
  `npm run layer-token:next -- <layer-id>` reports the next token and
  `npm run layer-token:check -- --base-ref origin/main` guards published
  assignments and allocation order in pull-request CI. Existing v2 links keep
  their exact meaning (ported from upstream, manjunath22466).
- Clean view and recording mode hide the right rail and every panel it
  hosts, rather than a fixed list of panel ids, so panels added to the rail
  later are covered too (ported from upstream, Bilawal Sidhu).
- The Nepal scene's before/after swipe and its switch to Esri imagery now
  come from shared modules: `src/ui/imagerySplit.js` owns the divider (drag,
  keyboard, ARIA, the scene split) and `src/maps/imageryComparison.js` leases
  the map, switching to Esri and handing the previous map back only if
  nobody changed it meanwhile. One owner holds the lease at a time. The
  scene looks and behaves as before (ported from upstream, Bilawal Sidhu,
  manjunath22466).
- `MapSourceController.subscribe()` reports every settled map switch, silent
  switches, fallbacks and recoveries included, and `getSwitchOrigin()` says
  whether the current map was chosen from outside (`manual`) or by the
  controller's own fallback (`automatic`), so a layer draped on the active
  map can follow it (ported from upstream, Bilawal Sidhu, manjunath22466).
- OpenStreetMap-derived displays share one attribution. Data attribution
  lists a single "Map and place data © OpenStreetMap contributors (ODbL)"
  entry instead of one per layer, and a short linked "© OpenStreetMap" credit
  stays on the map while any OSM-derived data is shown (datacenters, dams,
  Directions and voice routes, the Warendorf webcam and the Nepal locator),
  until the last of them leaves. The credit row keeps its full width above
  the command dock (ported from upstream, Bilawal Sidhu).
- Street Traffic roads come from OpenStreetMap vector tiles (OpenFreeMap,
  through the same-origin `/api/tiles` proxy) instead of Overpass queries, and
  the layer row chooses the road source: TomTom, OSM or Hybrid (also
  `?trafficRoads=`, saved with the layer state). With a TomTom key the default
  is Hybrid: TomTom roads with live flow, plus OpenStreetMap roads TomTom does
  not cover, simulated. Without a key every choice draws OpenStreetMap roads.
  OSM mode matches TomTom flow onto OpenStreetMap roads, by travel direction,
  for congestion colors, speeds and closures. Roads start loading on enable,
  paint incrementally, keep their dots across camera moves and arriving tiles,
  follow the reticle footprint at oblique angles with detailed near tiles and
  coarse distant roads, sit on the rendered surface behind buildings, and
  admit only public motor roads (no paths, parking, private access, service
  ways or tunnels). Road failures name OpenFreeMap with their HTTP status or
  timeout, separately from TomTom (ported from upstream, Bilawal Sidhu).
- Mapped Installations draws military areas from OpenStreetMap vector tiles
  (OpenFreeMap, through `/api/tiles`) and names them from a bundled worldwide
  Overture/OpenStreetMap name index (36,466 names, loaded only when the layer
  needs it); wide views show bounded, decluttered named points that hand over
  to the matching polygons up close. Titles go through the shared world-overlay
  host and the datacenter/dam card arbitration; selecting an installation
  replaces its title with one card and drapes a translucent fill over its
  footprint. Polygons appear while names load, cancelled views cannot publish
  late names, and footprints keep visible fragments without joining separate
  parcels across zooms. Contacts lists mapped installations within a true
  100 km surface radius of the tracked subject, including in Cockpit (ported
  from upstream, Bilawal Sidhu).
- Mapped ALPR Cameras reads an hourly OpenStreetMap extract for the US and
  Canada (community-hosted vector tiles, through the same-origin `/api/tiles`
  proxy) instead of an Overpass query per view. Whole-city views load z9–z12
  tiles, nearby badges sit on the rendered surface, map-source changes
  reposition markers without replacing them, and the row tells unsupported
  coverage apart from an empty result and asks for a closer view before
  exceeding its tile budget. Views outside the extract still query Overpass
  through the server. The source line credits "© OpenStreetMap contributors"
  and the inline credit no longer reflows the credit row (ported from
  upstream, Bilawal Sidhu).
- Public OpenStreetMap Overpass instances are no longer used. Overpass is
  queried only at instances the operator names in the new
  `VANTAGE_OVERPASS_UPSTREAMS` (comma-separated; the upstream project's
  `OVERPASS_UPSTREAMS` is also read), with the Vantage User-Agent, per-instance
  cooldowns that honour `Retry-After`, and credentials in the URL sent as
  Basic auth. Without one, `/api/overpass` and `/api/military-installations`
  answer at once that detailed queries are not configured and send nothing;
  `/api/overpass/status` lets the page check once. Footprint and neighborhood
  outlines that only Overpass could supply keep their pins and say "Detailed
  outline unavailable"; countries, states, counties and physical regions still
  outline from bundled data. The cockpit regional brief names the region from
  bundled Natural Earth polygons instead of a Nominatim reverse lookup;
  Nominatim remains only as the last-resort place search. Configured Overpass
  area queries keep relation member geometry (ported from upstream, Bilawal
  Sidhu).

### Fixed

- A stalled OpenSky global snapshot no longer holds `/api/opensky` for over
  a minute. Each attempt gets 10 seconds, a timed-out or failed attempt is
  retried once, and a second failure is answered from the stale cache or the
  regional fallback; the OAuth token request gets the same limit (ported from
  upstream, Sameh Khamis).
- The routes that spend provider quota or write the voice debug log
  (`/api/realtime/token`, `/api/realtime/debug-log`, `/api/openai/*`,
  `/api/google/text-search`, `/api/google/nearby-places`) refuse requests
  that carry reverse-proxy or CDN forwarding headers. A TLS proxy you run for
  LAN voice can be let through with the new `VANTAGE_TRUST_PROXY=1`, which
  never opens Provider Settings. The `/api` guard already refused foreign and
  opaque Origins and cross-site `Sec-Fetch-Site` on every route (adapted from
  upstream, James Sumpter, Sameh Khamis).
- The dev and preview servers send `X-Content-Type-Options: nosniff` with
  their other security headers, and the opt-in voice debug log
  (`VANTAGE_REALTIME_DEBUG_LOG=1`) writes the server's own `loggedAt` after
  the posted record, so a record can no longer replace it (adapted from
  upstream, Sameh Khamis, from findings by Sunil).
- Cockpit enters on the matching map style and its vision carousel is one
  fixed, duplicate-free sequence: Normal, CRT, NVG, FLIR, Anime, Noir and Snow.
  Normal is a real unfiltered option, and both Exit Cockpit and Reset restore
  the captured map style. Cyber's compact right-rail and Cockpit utility
  buttons center their glyphs and share one inset and edge alignment (ported
  from upstream, Manjunath).
- Cyber HUD: voice help/error popups and the Location/Visual Presets pins are
  no longer clipped by their decorative frames, and the lower-left telemetry
  card leaves room for the attribution's full logo row. New panels can opt into
  a shared surface (`src/ui/styles/panel-surfaces.css`,
  `docs/panel-surfaces.md`) for theme tokens, rail input and a fixed header over
  a bounded scroll body, without changing disclosure or visibility policies; no
  existing panel uses it yet.
  An explicit switch from Cyber to another HUD layout restores the visual preset
  used before Cyber; scene and share-link state still win. On desktop the
  Cyber side rails sit higher so the left stack clears the lower coordinate
  card; Cockpit keeps its own visor layout (ported from upstream, Manjunath).
- The Cyber HUD's voice-control styling (scan scope, mic orbit, speaker
  states and their reduced-motion fallback) applies again: its selectors still
  named the pre-rename `#gev-voice-*` / `.gev-*` ids, so none matched the
  `vantage-*` elements the voice control renders.
- The right panel rail (Display, CCTV, Context) settles within two layout
  passes instead of flipping in and out of focus mode as panel heights
  change. Each pass measures natural heights under a synchronous
  `data-rail-measuring` override rather than stripping and rewriting
  allocations, focus mode uses a wider hysteresis band, an automatic
  collapse schedules at most one follow-up pass, hidden panels are ignored,
  and only the tactical HUD auto-collapses panels (ported from upstream,
  Bilawal Sidhu).
- Scrolling the CCTV or Context panel no longer snaps back to the top when
  the right rail re-lays itself out (for example when a layer row refreshes
  every second): every panel body the measuring pass lifts now has its
  scroll offset restored (ported from upstream, Bilawal Sidhu).
- The NASA FIRMS proxy now sends the Vantage `firms-proxy` User-Agent with
  its CSV source and MAP_KEY status requests, as the other server-side
  proxies do; they previously went out with the runtime's default agent.
- CCTV media streams whose upstream falls silent after answering are released.
  The 15-second media deadline covered only the wait for response headers, so a
  camera that replied and then stopped sending held both the proxy connection
  and its upstream socket open; a chunked or length-less body had no bound. A
  30-second idle deadline now bounds the gap between upstream chunks. It is
  rescheduled while the response is still waiting to drain, so a viewer on a
  slow link is not mistaken for a dead camera; live feeds are unaffected
  (ported from upstream, Ethan Stoner).
- Aircraft track backfill (`/api/opensky-track`, `/api/adsblol/trace`) answers
  502 when the upstream body exceeds the 5 MB cap, instead of a 200 whose error
  body the client read as an empty track. The failure is cached like other
  upstream errors, so retries inside the 60-second window do not spend OpenSky
  credits (ported from upstream, Raushankumar0720).
- Saving a key from Provider Settings works on Macs where Nix or Homebrew
  coreutils sit ahead of `/bin` on `PATH`. The credential hardener now spawns
  Apple's `/bin/chmod -N` by absolute path; GNU `chmod` has no `-N`, so every
  save was refused with "could not restrict the credential file" (ported from
  upstream, Arthur Bogaart).
- The client terrain-height cache is bounded at 20 000 entries with
  least-recently-used eviction, so a long session no longer retains every
  coordinate it ever resolved. Consumer reads promote their entry and a batch
  still reports every point it resolved (ported from upstream, Pedro Lobato).
- CCTV cameras whose bearing is a guess now say so. Packs mark bearings derived
  from a hash of the camera id as `headingConfidence: 'low'`, but nothing read
  the flag, so roughly 70% of a default catalog rendered like surveyed facings.
  The HUD now reads `HDG n° (ESTIMATED)` and the coverage wireframe draws
  dashed; manual calibrations and curated poses are never marked estimated
  (ported from upstream, bassem chagra).
- Street Traffic says which upstream declined a road load. The layer row now
  reads `Overpass rate-limited`, `Overpass timed out`, or
  `Overpass refused the road query (HTTP 406)` instead of a general
  "Road data temporarily unavailable", so a reader is not sent to check a
  TomTom key when the public OpenStreetMap mirrors are the side that failed.
  The proxy's own 502 (every mirror unreachable) and 503 (local limiter busy)
  read `Overpass mirrors unreachable` and `Overpass temporarily unavailable`.
  Failures the layer cannot classify keep the general line (ported from
  upstream, daikaginza).
- Vantage renders on iPad and iPhone instead of stopping with "An error
  occurred while rendering." Cesium's per-vertex model atmosphere binds shader
  `out` parameters directly to varyings, which Apple's Metal/ANGLE backend
  cannot link, so the program failed and the render loop was torn down. The
  stage is now kept out of the pipeline on affected devices by clearing
  `scene.fog.renderable`, which leaves `fog.enabled` (and the fog density that
  drives 3D Tiles refinement) untouched. Detection is a WebGL2 link probe of
  the same pattern, whose throwaway context is released immediately, with
  iOS/iPadOS detection as a backstop. Affected devices lose distance fog on 3D
  tiles and globe basemaps (ported from upstream, Sean Armstrong).
- Expanding a panel at narrow widths (720px and below) no longer adds
  spurious scrollbars to the panel stacks. Each panel's decorative glow,
  absolutely positioned with a negative inset, became 18–20px of scrollable
  overflow on both axes inside the scrolling stacks; the narrow-screen rules
  now pin the glow to its panel box, so the stacks still scroll for genuinely
  tall content and the Context radio popover is not clipped (ported from
  upstream, Bilawal Sidhu).
- Transit and Directions rows repaint as soon as their data lands again:
  `refreshLayerStats()` now lives on the layer lifecycle, not only on the
  compatibility facade. `scripts/qa-radio.mjs` uses it instead of a private
  panel method (ported from upstream, Bilawal Sidhu).
- Malformed enabled-layer lists in a share link (empty, repeated or duplicate
  members, or a repeated `l` field) now reject the whole layer payload instead
  of restoring a partial list (ported from upstream, manjunath22466).
- Region scopes in voice analyst queries ("in the Gulf of Mexico", "over the
  Alps") work in the dev server again: the bundled Natural Earth and
  neighborhood packs are fetched as same-origin JSON in the browser
  (`src/data/bundledJson.js`) instead of a JSON-attributed `import()` the
  browser rejected. When a region is not in the bundled packs, the geocode and
  admin-boundary fallback answers `region-timeout` after 3 s instead of holding
  the reply; the lookup keeps running and fills the cache (ported from
  upstream, Bilawal Sidhu).
- Keyless terrain tiles retry HTTP 429 and transient gateway failures (502,
  503, 504) with a bounded, shared backoff that honours `Retry-After`, instead
  of leaving holes in the Re:Earth terrain after a burst of tile requests. One
  console line is logged per cooldown window, not per tile (ported from
  upstream, Bilawal Sidhu).
- Search arrivals (location bar and voice) end above the rendered surface. A
  precise place without a detailed outline used to be framed from a sea-level
  target, leaving Camp Mabry about 1 m above the mesh and a Denver coordinate
  underground. Search now waits briefly for the ground-floor elevation before
  framing, and after landing the camera is lifted to 120 m clearance once the
  surface streams in; a new flight, a gesture or teardown cancels the check
  (ported from upstream, Bilawal Sidhu and Milan Khanal).

## [1.0.0] - 2026-10-02

First release of Vantage, a fork of
[God's Eye View](https://github.com/bilawalsidhu/gods-eye-view). The product
rename and the browser-storage migration make it a new public baseline, so its
version numbering starts again at 1.0.0; upstream's own history is kept under
[Pre-fork history](https://github.com/Jnolcox/vantage/blob/main/CHANGELOG.md#pre-fork-history-gods-eye-view).

### Added

- Existing installs carry over to the new name. Browser storage saved under
  `godsEyeView.*` / `gev:*` / `gev-*` keys is moved once at startup to
  `vantage.*` / `vantage:*` / `vantage-*` (`src/storageMigration.js`), keeping
  scenes, panel layout, layer state, voice cost limits and first-run choices.
  `.gev-cache/` and `.gev-logs/` are renamed to `.vantage-cache/` and
  `.vantage-logs/` when the dev server starts, and scene bundles exported as
  `gev-scene-bundle` (`.gevbundle.json`) still import.
- Click-to-load gates for YouTube, Facebook and X embeds in scene cards. No
  provider resource (preconnect, hidden frame or SDK) is requested until the
  viewer chooses LOAD (this page) or ALWAYS ALLOW (remembered per provider);
  afterwards playback and warm-up work as before.
- Voice discloses what it sends: the mic help tray says audio, map context and
  a view screenshot go to OpenAI, and a VIEW toggle beside the model tier stops
  screenshots (`vantage.voice.shareViewImage`, on by default).
- DISPLAY > HUD has a Context choice: Live (the default, unchanged) or Local,
  which keeps the on-device summary and makes no Google or OpenAI lookups
  (`vantage.hud.liveContext`).
- `vite build` warns, naming the keys but never their values, when the bundle
  embeds `GOOGLE_MAPS_API_KEY` or `CESIUM_ION_TOKEN`.
- A README Network & privacy inventory of every outbound destination
  (automatic or user-triggered, browser or server, what each request carries
  and how to switch it off), with the controls behind it in `SECURITY.md`.
- Semantic versioning with `package.json` as the only version source:
  `npm version` regenerates `src/sources/version.js`, which the outbound
  User-Agent reads, and `docs/RELEASING.md` sets the major/minor/patch rules
  for storage, settings, `/api` and export changes and the steps for cutting,
  tagging and publishing a release.
- `npm run fonts:fetch` regenerates the self-hosted font subsets and their
  license texts from `src/ui/materialSymbolsGlyphs.json`.

### Changed

- Renamed the product from God's Eye View to Vantage: page title, Pinokio
  launcher, voice instructions and tool descriptions, logs, docs and the
  `vantage` package name. Debug globals are now `window.__vantage*`, DOM events
  `vantage:*` and response headers `X-Vantage-*`.
- Operator settings are read as `VANTAGE_*`. The pre-rename `GEV_*` names are
  still honored, with a one-time deprecation warning, when the new name is
  unset, including the lines of an existing `pinokio/ENVIRONMENT`.
- The project lives at <https://github.com/Jnolcox/vantage>; package metadata,
  CODEOWNERS, issue templates and docs point at the fork and its maintainer.
- Every explicitly set server-side User-Agent (and the Nominatim Referer) comes
  from `src/sources/projectIdentity.js` and reads
  `vantage/<version> (+https://github.com/Jnolcox/vantage)`, with the version
  taken from `package.json`. The Live Traffic NSW image host still receives a
  browser User-Agent, because it serves frames only to browsers.
- The Inter, JetBrains Mono and Material Symbols fonts are served from
  `public/fonts/`, so loading the page no longer contacts Google Fonts.
- The Realtime voice debug log, which records transcripts, is opt-in with
  `VANTAGE_REALTIME_DEBUG_LOG=1`; otherwise `/api/realtime/debug-log` answers
  204 and the client stops posting.
- Radio plays are reported to Radio Browser's public click counter only with
  `VANTAGE_RADIO_REPORT_CLICKS=1`. Playback never depended on it.
- `npm install` no longer downloads Chrome for Testing for Puppeteer; set
  `VANTAGE_QA_BROWSER=1` to install it for the `qa:*` scripts.

### Removed

- The title bar wordmark, tagline and logo (with its pointer-gaze animation and
  radio broadcast waves) from the scene chrome and loading screen; `#title-bar`
  now only hosts the optional FPS readout.
- The upstream capture GIFs and promo images from the README. The GIFs are
  copyright Bilawal Sidhu and not covered by the MIT License; each embed is
  replaced by a placeholder describing the shot.
- The upstream maintainers' community-PR skill.

### Security

- The server binds to `127.0.0.1` unless `VANTAGE_HOST` (or the legacy `HOST`)
  names another address. A LAN bind keeps Vite's Host check on with an explicit
  list (this machine's hostname plus `VANTAGE_ALLOWED_HOSTS`) and defaults the
  OpenAI and Google per-IP throttles to 30 and 60 requests per minute.
- Every `/api` route refuses foreign Host headers, foreign Origins and requests
  the browser labels cross-site or same-site, closing DNS rebinding and
  cross-site quota spending. CORS is off.
- `/api/realtime/token` mints the OpenAI client secret over POST only and
  answers 405 to anything else.
- The dev server no longer serves `.vantage-logs/` (voice transcripts) or
  `.vantage-cache/`, nor their pre-rename `.gev-*` names.
- `/api/cctv/frame/<id>` frames Street View fallbacks at the registered
  camera only; unknown ids get the synthetic frame instead of an open, billable
  Street View proxy.
- Cesium's built-in ion token is replaced at startup by the configured
  `CESIUM_ION_TOKEN` or nothing (fail closed), and the Google 3D Tiles credit
  logo is bundled, so no implicit request reaches Cesium ion.
- A Content-Security-Policy (`build/content-security-policy.js`) lists every
  third-party origin the browser may reach: a header from the dev and preview
  servers, a meta tag in built HTML, `VANTAGE_CSP=report-only` for diagnosis.
  Referrer-Policy is pinned to `strict-origin-when-cross-origin`.

## Pre-fork history (God's Eye View)

The entries below were written upstream in
[bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view)
before the fork and are kept verbatim as project history. Their headings are
nested one level down, and their version numbers and "Unreleased" labels are
upstream's own; they are not Vantage releases.

- Enable responsive trackpad pinch zoom on the globe. Browser pixel-mode
  `Ctrl+wheel` pinch gestures now reach Cesium with bounded amplification,
  while ordinary wheel, line-mode and touch-pinch inputs retain their existing
  behavior; the listener is removed with the application scene.

- Report AIS speed and course that carry the standard "not available" code as
  unknown instead of 102.3 knots and 360 degrees. Genuine readings, including a
  stopped vessel's zero and the highest encodable values, are unchanged.

- Render native `<select>` option lists in the dark UI palette. The closed
  controls were already skinned, but the browser-painted popups fell back to the
  platform light palette, leaving near-white option text on a white surface in
  the HUD layout, Scenes, CCTV camera, Radio filter and Draw colour menus.

- Credit adsbdb, which supplies the aircraft type, model name and registration
  on enriched flights and the airline and origin/destination pair behind the
  tracked contact's route strip. `DATA_SOURCES.md` now records adsbdb's
  published credits and route-data restriction, along with the request bounds
  and gitignored 24-hour local cache. A matching `DATA_CREDITS` entry surfaces
  the credit in the in-app Data attribution popover, and a test protects it
  against accidental removal.

- Size the TomTom daily tile budget to the provider's real free allowance.
  `TOMTOM_DAILY_TILE_BUDGET` defaulted to 40,000/day against an allowance
  granted monthly (200,000 tile requests/month), exhausting a month in five
  days and leaving the traffic layer dead for the rest of the period. The
  default is now 6,000/day (186,000 over a 31-day month). Corrects the stale
  "~50k/day" free-tier figure in the proxy, `.env.example` and
  `DATA_SOURCES.md`. Still an application-side ceiling, not a billing cap.

- Distinguish PARTIAL vessel snapshots from STALE data in the layer panel, with
  accepted-record counts and unchanged retention, freshness and outage safeguards.

- Keep Nepal provider media inside the Pinokio compatibility boundary: use
  source-linked fallback cards instead of automatic embeds or hidden preloads
  that launch an external browser. Ordinary browsers retain embedded playback.
  Source-only timed shots use their authored card dwell and continue normally.
  Media autoplay now requires a live Play Scene or Play Shot action; passive
  loading, saved state and seeking do not grant playback authority.

- Add Director import previews, validated scene/shot detail drafts and selected-scene
  JSON or asset-bundle sharing. Preserve attribution; verify bounded bundle bytes
  before admission and release staged work on cancellation or teardown.

- Director scene documents now support bounded data-pack manifests, per-shot
  selection and registered GeoJSON/PNG/media loaders with explicit placement,
  visible attribution and cancellation/disposal on Stop or replacement.

- Director version 4 adds named camera anchors and explicit pose-to-pose moves
  with shared playback/seek interpolation, easing and holds. Navigation and
  manual input cancel authored motion; older scene files retain existing flights.


- Director validates bounded version-3 scene files before replacing a project,
  preserves unreadable browser saves, migrates legacy bloom once and preserves
  zero-pitch/low-altitude camera and scope/detection edits. Project normalization has a separate owner.


- Separate Director timing, seek calculations, playback clocks and registered
  scene-pack presentation rules. Preserve authored content and controls; Stop
  releases pending hold timers and stale ticks cannot affect replacement playback.


- Keep parked transit vehicles aligned to their world course during camera orbits, fall back to reported bearing, and keep vehicles with no course consistently screen-up.

- Separate Realtime connection, response/tool, Radio, input/audio, cost, viewport
  and diagnostic ownership while preserving voice controls and protocol behavior.
  Revoke stale connection offers/capture callbacks and release failed or stopped audio
  meters. Discard late action continuations after Stop or restart; add recorded
  push-to-talk acceptance alongside click-start voice.

- Separate application-shell responsibilities and state ownership while preserving
  the layer, scene and voice API. Revoke pending globe-reset callbacks on disposal
  and detach old Directions services when replacing a data manager.
- Transit: keep the normal vehicle silhouettes under NVG, thermal and noir (opaque white, CRT sizing, a 2 px dark halo) instead of solid bodies; drape the selected vehicle's trail onto Google 3D tiles and terrain so retained history is actually visible, with the head clipped to the sprite and markers recovering as soon as the camera arrives; place Transit in the Movement panel between Street Traffic and Bike Share.

- Extract a portable Director shot runner and connect existing scene playback to
  it. Preserve authored content, project files, camera/layer behavior and source
  attribution; document the planned timeline, scene-file and data-pack boundaries.

- Separate map-feature acquisition from annotation/search selection. Move road and mapped-installation decoding into source adapters while preserving geometry policy, cancellation, retry outcomes and compatibility exports.

- Cancel hidden Nepal provider preloads on Stop, event disable and replacement, and respect drawing-tool pointer ownership for fallback evidence cards. Preserve @manjunath22466’s Nepal scene contribution and source attribution.

- Cancel the Nepal Upper Valley locator's pending approach and orbit on scene Stop, replacement, seek, and teardown; late camera callbacks cannot take over a newer shot.

- Keep completed flood history visible when later Nepal media-only shots arrive and reveal their source cards.
- Reconcile an already-playing Nepal video when the YouTube API attaches, so missed playback notifications cannot truncate the seven-second clip or replay an already-ended clip.

- Clamp the Nepal flood trail and surge marker to the active terrain or photoreal surface so refined 3D tiles cannot bury the path.

- Preserve Nepal shot camera and map ownership through the public layer lifecycle; passive restoration does not start standalone playback.

- Separate transit snapshot/history acquisition from the layer and expose its bounded request service independently of Vite. Preserve feed selection, playback, cache policy and compatibility exports.

- Widen opaque sensor halos to 3 display pixels with a 30 px fleet core while retaining at least 60% opaque core coverage, adding contrast margin through thermal blur and bloom on bright roofs.

- Exclude Noir's intentionally vignetted outer field from transit core measurements and add separate Boston live oblique selection/readability coverage.

- Judge NVG transit readability by phosphor peak and halo contrast, use opaque black sensor halos, reject overlapping pixel samples, and report each selected-trail acceptance condition. Simplify transit source credits and ground-placement wording.

- Reserve numeric playback scratch before sampling, including resolved transit surface heights, and reuse the same output and segment objects on every frame.

- Keep moving and stationary transit above CCTV/Bikeshare consistently, and share camera sensitivity across the actual Traffic, Bikeshare and Transit lifecycles.

- Reject isolated transit history outliers without changing the active playback bracket; rejected live reports retain the last accepted route, mode and detection text.

- Isolate optional scene-card presentation callbacks from the shared overlay projection path, preserving ordinary-layer allocation budgets and recovering from failed animation callbacks.

- Rename scene shots inline with a double-click; Enter or focus loss saves, and Escape cancels.
- Stop scene playback and delayed media when its event layer is explicitly closed; reject stale seek and replay completions. Ship only the Nepal incident default, without a separate reconstruction recipe.

- Keep Nepal flood and locator components available through Scenes without separate entries in Data Layers.

- Start the shared Nepal flood route at the Debris-Dammed Lake river reach, removing the earlier upstream section from overview paths.

- Remove the redundant WITNESS panel shortcut; retain per-shot source media and Open Original links.

- Follow the Mailung Bazzar, Dandaguan video's source clock through 0:07 and advance after its brief fade-out, including older saved scenes. Bound delayed or blocked playback and cancel late provider callbacks on Stop or replacement.

- Keep the completed flood trail visible during the Debris-Dammed Lake to Second landslide camera handoff, without revealing the next reach early.

- Preserve loaded base imagery when successive scene shots use the same provider, avoiding a bare-globe flash at shot handoffs.

- Add the Nepal Flood Incident scene with geographic labels, synchronized event controls, linked witness sources, and Vantor comparison imagery over Esri. Nepal uses Google 3D when available and falls back to Esri with keyless terrain without rewriting saved shots. Bundled event imagery and derived data retain their separate non-commercial terms.

- Add an optional Nominatim geocoding adapter with configurable search/reverse endpoints, cancellation, bounded responses and retryable upstream errors. Extract portable response-reading and Overpass lexical helpers while retaining existing server exports.

- Expose reference feed factories independently of standalone catalog construction; preserve source choices and asset attribution.

- Add source-only layer exports and enforce source, browser, standalone and voice import directions. Move plain record/feed helpers and settings filesystem hardening to their owners while preserving compatibility and behavior.

- Separate voice session lifetime and common controls from the default Realtime protocol adapter.
- Add live public transit: vehicles from seven open GTFS-Realtime feeds played back a lag behind real time at their reported speed, a selected-vehicle trail with bounded MBTA history caching, mode-coloured detection brackets in every preset, and sprites that stay readable in night-vision and thermal views.
- Separate canonical voice action arguments from descriptive wording, preserving the existing Realtime tool inventory.

- Expose portable radio, camera-type and regional source helpers; keep HTTP transport separate from record normalization.

- The Realtime debug-log endpoint is bounded on every axis it was not: an always-on per-client rate limit, asynchronous appends through a serialized queue instead of a synchronous write on the request path, and rotation of the log file at 32 MB keeping one prior generation. The 8 MB cap applied to a single request body and never to the file those requests accumulated into, so any local page could grow it for as long as the dev server ran. A malformed record and a failed write are now told apart, 400 from 500, and neither answer carries the error text.

- Three proxy paths no longer relay upstream or JS error text to the client. The HUD summary passed OpenAI's own `error.message` through whenever upstream was not ok, carrying request ids and quota wording; the Realtime token route passed through non-success response bodies and echoed JS errors, which can expose upstream details; and a failed CCTV media fetch stored the raw errno as the camera's health message, which reaches the screen through `GET /api/cctv/health` rather than through the sanitized response beside it. Logs now name the failure and the upstream status without the text.

- Separate vessel records and feed acquisition from rendering while preserving selection, partial-feed retention, sea-surface placement and request cancellation.

- Separate military-flight records and acquisition from rendering while preserving ground-model ownership, source units and follow behavior.

- Separate civil-flight acquisition and record reconciliation from Cesium resource updates, preserving source timing, ground placement and tracking behavior.

- Separate navigation, share restoration, visual settings and panel state into focused UI owners with explicit dependencies and terminal cleanup.

- Separate layer lifecycle transactions from panel construction and render/detection reactions; retain existing transition and refresh behavior.

- Let CLI tools, development launchers and the setup doctor use an explicit project directory while retaining their existing default paths.

- Split application scene, controls, catalog, tools and HTML into reusable components; configure application request services and sources without changing global fetch. Preserve standalone markup and voice behavior. Explicit annotation navigation may resolve a distant named target.

### Voice component boundaries

- Separate voice controls, Realtime connection requests and the action runner.
- Allow compatible endpoints and server-selected models through construction options.
- Cancel pending token/SDP requests on Stop or teardown and reject expired secrets.

### Configurable geospatial services

- Compose geocoding, place context and routes through independent providers.
- Allow compatible endpoint configuration without changing voice tools or annotation behavior.
- Isolate configured source caches and reject results after cancellation.

### ALPR camera locations

- Port Manjunath's (@manjunath22466) cyan camera badges, coral selection brackets,
  gradient direction wedges and animated tactical labels into the reusable ALPR
  layer. Keep bounded source loading, stable entities, selection and SHOW NEAREST.
- Align the ALPR layer-row header with other layers, keeping the toggle beside
  the name instead of wrapping it onto its own line.

- Label the loaded camera count as nearby, show a purple-dot legend, and add
  SHOW NEAREST to frame and select a loaded camera when none are on screen,
  using the available 3D-tile or globe terrain height.

- Keep nearby camera markers and selection stable during rotation, use bounded
  ground-centered coverage instead of the horizon rectangle, and reuse in-flight queries.

- Add optional, source-labeled OpenStreetMap ALPR camera locations, bounded city queries,
  cached-response and coverage notices, selection cards, share links, and voice toggles.
- Separate the request adapter, camera model, presentation, and instance lifecycle.
  Source cancellation also guards late response bodies and rejects invalid query bounds.

### Release disabled infrastructure rendering

- Remove built Data Center, Dam and Submarine Cable entities when their layers
  are disabled, avoiding retained visualizer work and entity memory.
- Keep parsed datasets cached for re-enable; rebuild entities without refetching.

### Camera layer components

- Separate camera source requests, placement, frames, projection, cards and calibration.
- Own visibility listeners and pending initialization within each layer lifetime.
- Preserve existing camera catalogs, URL families, geometry and playback behavior.

### Traffic and bikeshare components

- Separate traffic loading, animation, styling and lifecycle into factory-owned components.
- Give each flow source its own bounded decode cache and cancellation checks.
- Separate bikeshare registry, station requests, rendering, selection and proximity handling.

### Installation and context components

- Separate mapped-site requests, records, placement, selection and viewport lifecycle.
- Separate proximity queries, subject tracking, navigation/history, panel and direction rendering.
- Retain source and ground-floor ownership in standalone composition; reject malformed
  installation snapshots and ignore failures from cancelled requests.

### Satellite and mission layer components

- Separate catalog loading, orbit calculations, display, tracking and interaction
  into instance-owned satellite components.
- Separate mission ingestion, paths, placement, cards, roster, replay and camera
  operations, retaining existing layer controls and satellite coordination.
- Cancel late mission source work and reject malformed launch snapshots.

### Fire layer components

- Split fire source loading, state, rendering, cards, selection and viewport work
  into reusable components with application-owned scene services.
- Cancel late refreshes, retain good data after malformed responses, and preserve
  selection identity without repeating a user-selection notification on refresh.

### Earthquake components

- Separate earthquake snapshot loading, record validation, and display ownership.
- Cancel pending earthquake refreshes on disable or destruction, retaining the
  last good snapshot after malformed or failed refreshes.

### September 8, 2026

Earthquake refreshes validate the complete feed and construct replacement entities before clearing the previous snapshot. Malformed rows and duplicate rendered IDs retain the last good entities, overlays, count and timestamp and report a malformed response; unknown magnitude is excluded from M2.5+ rendering.

Non-object or array-valued properties reject the response instead of being treated as an unknown magnitude.

Launch payloads with missing records now say PAYLOAD DATA UNAVAILABLE. Missing names use Unnamed payload; absent or invalid mass stays unknown instead of appearing as 0 KG.

This changelog records public product changes. For the authoritative description
of current runtime behavior, see [`docs/CURRENT-STATE.md`](docs/CURRENT-STATE.md).

### \[Unreleased\]

- Add bounded Director feature actions with accessible controls, explicit camera/layer admission and cancellation; restore pack geometry on same-shot seek. Preserve existing scenes and content attribution.


- Give application request services, terrain/floor caches and annotation lookup state explicit owners and cancellation; share them across controls, layers and voice.

- Construct application layers from explicit sources, with standalone provider selection and catalog-owned aircraft classification; controls and voice queries use those instances.

- Let application data and controls receive the same explicit layer catalog; keep standalone defaults and registration-before-restoration ordering.

- Expose existing FIRMS CSV parsing and UTC time-window helpers through a portable package export, with shared contract fixtures.

- Separate map source factories from switching and resource ownership; retain current source IDs, attribution and fallbacks.

- Separate radio directory loading, station selection, globe presentation and playback into composed components with an explicit metadata source.

- Separate submarine cable sources and rendering components, and export bundled geography lookup modules.

#### Added

- DISPLAY ▸ Draw: draw on the world by hand. Pick Area, Line or Pin, click the
  vertices, double-click or press Enter to finish, label and colour it; Backspace
  undoes a vertex, Esc cancels the shape and a second Esc leaves draw mode, and
  Clear wipes the board. Drawn shapes go through the same annotation engine as
  spoken ones, so they render with the whiteboard look, persist, de-dup and clear
  together. While you are drawing, the draw tool owns the pointer and no layer
  selects what you click through (#235 — thanks @cora-fresh-labs).

#### Fixed

- Keep traffic-road bounds crossing the antimeridian monotonic and inside the
  longitude range accepted by the Overpass request path, preserving the small
  wrapped span instead of producing an inverted or rejected box (#392 — thanks
  @Ashfaqbs).
- Make `npm run doctor` report keyless anonymous OpenSky access for explicit
  `OPENSKY_AUTH_MODE=anon` and OAuth mode without a client pair, retain the
  existing OAuth-pair capability wording, and identify selected Basic or auto
  modes without guessing their eventual credential choice. OpenSky proxy
  authentication is unchanged.
- Bikeshare stations load again. The extracted station source addressed the
  proxy as `/api/gbfs?url=`, but the proxy reads its upstream target from the
  path, so every request answered 400 and the layer reported a fetch error for
  every city (#441 — thanks @MiguelGFerreira).
- Overpass requests now carry a User-Agent that names the application, its
  version and the project address, which is what the OpenStreetMap API usage
  policy asks for; the previous string identified neither. A mirror may refuse
  a client it cannot identify, and a refused mirror is one the fan-out has to
  skip, so this affects every Overpass-backed layer: Mapped Installations,
  traffic roads and annotation geometry. Mirror rotation, cooldown and cache
  admission are unchanged (#420 — thanks @GladiatorrX9).
- Place search has a last resort. With no Google Maps key, and when Photon does
  not answer, a named-place search now falls back to OpenStreetMap's Nominatim
  through `/api/geocode`, so search and voice fly-to still work on a keyless
  globe. The route keeps to the service's usage policy: an identifying
  User-Agent and Referer, at most one request per second, answers cached, one
  upstream call shared between identical searches in flight, a bounded queue so
  a burst is refused rather than held, and a queued search dropped once its
  caller has given up (#350 — thanks @sendmebits).

- Regional upstream reads now hold their deadline through the response body. The
  abort timer was cleared as soon as the headers arrived, so an upstream that
  answered and then stalled mid-body had no deadline at all. Redirect policy is
  now stated per call rather than inherited, and the fixed Nominatim endpoints
  refuse to be redirected.

- The location search box answers two kinds of query without a network request
  or an API key. A decimal-degree coordinate — `43.1731, -79.0384`, or either
  order when N/S/E/W say which is which — flies straight there; a bundled city
  or landmark name typed exactly (`paris`, `sf`, `Golden Gate Bridge`) flies to
  the bundled place. Anything else, including anything malformed, goes to the
  existing geocoders unchanged. Degrees/minutes/seconds and grid references are
  not parsed and fall through the same way (#388 — thanks @KuraPiee).
- A data-layer control a provider key is holding back now names that key. With
  no FIRMS key the fire layer's control read KEY REQUIRED without saying which
  key or where to put it; it now reads "Needs FIRMS_MAP_KEY — add it in Provider
  Settings", on the control and in its accessible name. A layer that needs no
  key, or already holds one, carries no such text, and an unrecognised key name
  produces none rather than a guess (#296 — thanks @Matthew-Selvam).

- Draped annotation geometry — area fills and outlines, routes and arrows —
  classifies onto terrain as well as 3D tiles. On a keyless boot, where Cesium's
  own globe carries the imagery, marks previously rendered their labels and no
  geometry at all. This affected spoken annotations as much as hand-drawn ones.

- A finished drawn area closes its ring, so its outline no longer misses the
  edge back to the first vertex.

- Areas measured and anchored across the antimeridian use unwrapped longitudes:
  a shape straddling 180° reported an area thousands of times too large and
  placed its label on the opposite side of the world.

- Traffic now retries a failed destination after city navigation without a layer
  toggle. Camera departure cancels pending work, arrival checks the final view,
  and superseded requests cannot keep a newer view loading.

#### Added

- Two map-orientation controls sit beside Share in the top-center globe
  actions. Tilt Map swings between a straight-down map and a 35-degree oblique
  around the point under the centre of the view, keeping that point and the
  distance to it. North Up rotates around the same point until north is at the
  top, keeping the pitch, and its needle shows the current bearing. Both decline
  without moving the camera when nothing is under the centre of the view, and
  both follow Reset Globe out of Clean UI, recording, Scene playback and Cockpit
  (#442 — thanks @yashveeeeeeer).
- The location search box answers two kinds of query without a network request
  or an API key. A decimal-degree coordinate — `43.1731, -79.0384`, or either
  order when N/S/E/W say which is which — flies straight there; a bundled city
  or landmark name typed exactly (`paris`, `sf`, `Golden Gate Bridge`) flies to
  the bundled place. Anything else, including anything malformed, goes to the
  existing geocoders unchanged. Degrees/minutes/seconds and grid references are
  not parsed and fall through the same way (#388 — thanks @KuraPiee).

- Add Open Calgary traffic cameras as a keyless CCTV source pack (thanks
  @rileygramlich): the public City of Calgary catalog, frames pinned to the
  city's own host and upgraded to HTTPS, with the Open Government Licence –
  City of Calgary attribution. The dataset publishes no camera facing — its
  quadrant field and the quadrant suffix on each camera name are Calgary's
  address grid — so headings use the shared id-hash fallback at low confidence
  and are corrected with the calibration gizmo. `CCTV_CALGARY_MAX_SOURCES` sets
  the cap and `CCTV_CALGARY_ENABLED=0` turns the pack off.
- **Transit layer** — keyless buses, trams, subways, trains and ferries in
  Boston, Austin, Minneapolis–St Paul, Helsinki, the Netherlands, Norway and
  South East Queensland. Vehicles use delayed timestamp playback and explicit
  waiting states. Selection shows available recent history, mode-coloured cards
  and clear report ages; MBTA history can survive a browser reload while the
  proxy remains running. Heights are aligned to work with Google 3D tiles.
  Subways are projected to street level and their cards explain that choice.
  Visible animation, detection membership, history storage and proxy requests
  are bounded. Share links carry Transit as token `j`.

- Add Ontario 511 as a keyless CCTV source pack, including Kitchener-area
  highway cameras, with server-registered still URLs and attribution.
- CCTV Mesh adds Finland: Fintraffic road weather cameras, keyless, nationwide, 300 by default. Each camera view of a station is placed separately; ambient stills refresh on the source's 10-minute cadence (the active camera keeps the usual 10-second refresh).
- Add DriveBC highway cameras for British Columbia to the CCTV layer: the 250
  nearest Vancouver and Victoria by default, with Open Government Licence –
  British Columbia attribution. `CCTV_DRIVEBC_MAX_SOURCES` sets the cap and
  `CCTV_DRIVEBC_ENABLED=0` turns the pack off.
- Add TxDOT highway cameras for Texas as a keyless CCTV pack: the Austin and
  San Antonio districts by default (`CCTV_TXDOT_DISTRICTS` selects any of the
  25), only cameras reporting Device Online, snapshots decoded from TxDOT's
  JSON-wrapped JPEG for the official origin only.
- Add Estonia CCTV source packs: Tallinn intersection stills (`ristmikud.tallinn.ee`,
  curated catalog) and nationwide Transpordiamet / Tarktee road-weather cameras
  (DATEX2 locations + rotating JPEG URLs), with Tallinn city POIs and attribution.
- Add a Warendorf (Germany) source pack: the Stadt Warendorf Marktplatz webcam, with a
  curated pose.
- Add Live Traffic NSW (Transport for NSW, CC BY 4.0) as a keyless CCTV pack: 217
  Sydney and regional cameras with compass headings and view descriptions.
- CCTV monitor planes no longer clip into the terrain. The plane is lifted
  rigidly by the largest clearance deficit over a 3×3 grid of support points
  against the ground under each (the ground at the mount where nothing finer is
  known), and the client honours pack ranges instead of inflating them to 220 m.
  `src/data/local_data/cctv_ground_heights/` ships precomputed ground heights under
  every camera's mount and plane footprint (3,445 of 3,446 cameras), aligned to work
  with Google Photorealistic 3D Tiles; cameras with shipped heights are placed
  with zero runtime sampling, and the rest resolve the ground under their plane
  from the Re:Earth DEM on activation. The footprint lift is capped at 60 m
  above the mount-based lift so a tower under a far edge cannot launch the plane.

- Press backtick (`) to toggle a rendered-frame-rate readout beneath the logo.
  Typing fields retain the key; monitoring stops when hidden.

- Extract vessel feed, store, rendering, selection, trail and card components with explicit source and scene services.
- Bound contact retention for incomplete vessel observations, preserve source freshness and refresh history references in place.
- Cancel pending vessel history during selection and layer teardown.

- Split military flights into instance-owned state, ingestion, motion, rendering, tracking and query components. Share the existing aircraft calculations and give military classification an explicit source and cleanup lifecycle. Preserve known military identities even when the source has no position for them.

- Split civil flights into instance-owned state, ingestion, motion, rendering, tracking and query components. Cancel enrichment on teardown and resolve model assets through the application.

- Separate aircraft/vessel transport and normalization from layer rendering, preserving observation timestamps, altitude datums and optional history.
- Retain absent aircraft during partially admitted snapshots and bound source error messages.

- Drive share updates, Location feedback and Scene controls through immutable state snapshots and disposable subscriptions.
- Keep stale lookup/load completions from publishing accepted results and retain shot rows during playback progress updates.
- Export the existing Scene director with explicit playback and editing outcomes.

- Separate UI assembly from standalone engine wiring, with dedicated panel layout, position, notice and recording owners.
- Stop pending UI presentation and drag work during disposal; preserve accessible status text when stopping its decoration.
- Organize component styles behind the same ordered stylesheet entry and include 3D model controls in the current-state snapshot.

- Separate Scene controls and text presentation from project/playback operations; revoke replaced row listeners and suppress stale completion feedback.
- Preserve shot-label identity on selection so double-click rename can complete.

- Split Cockpit camera/controller, instruments, briefing, signals and layout into focused modules with explicit application operations.
- Give Display portal moves cancellable focus/scroll restoration and stop Cockpit work before asynchronous UI teardown.

- Separate Context controls, mode transitions and layer restoration; release tab listeners and suppress late panel/search feedback after disposal.

- Separate camera-panel controls, frame loading, calibration editing and status display; cancel stale image and calibration work on camera changes or disposal.

- Restore UI observer, resize-listener and CCTV subscription cleanup after Location extraction.

- Extract Radio controls and tuner presentation with explicit actions and complete listener/subscription cleanup.

- Extract Location controls and cancellable search presentation; preserve navigation handoff and prevent delayed POI expansion after closing the row.

- Separate Layers panel presentation and clear-control bindings from layer lifecycle operations; revoke listeners and subscriptions on replacement or teardown.

- Extract Map Source controls with listener cleanup and protection against obsolete selection feedback.

- Separate visual effects, presets and animation from Display controls, with explicit stage ownership and teardown.

- Extract Display control bindings with synchronous listener cleanup; preserve existing visual actions and native input behavior.

- Extract application shortcuts and shader-parameter controls into reusable UI
  components, preserving inputs and cleaning up listeners on rebuild/disposal.

- Extract adaptive panel rail placement and measurement into reusable UI modules,
  preserving obstacle clearance, responsive allocation, disclosure and scroll behavior.

- Extract shared surface keyboard handling for the welcome launcher and Provider
  Settings, preserving Tab/Escape behavior and releasing the listener on teardown.

#### Added

#### Security

- The CCTV media route no longer forwards a client `Range` header to the upstream
  camera host as it arrived. A single `bytes=` range is canonicalized and
  forwarded, with every accepted form — explicit span, open-ended and suffix —
  bounded to 64 MiB, the ceiling the relay already applies to a response that
  declares its length. A response that declares no length has no ceiling — live
  streamed media, and anything an upstream sends chunked while ignoring the
  `Range` — which is unchanged. Multi-range, malformed, inverted, non-`bytes` and
  unsafe-integer values are dropped and the request proceeds without a `Range`,
  as RFC 7233 §3.1 prescribes; a multi-range value previously invited a
  `multipart/byteranges` answer, whose parts nothing here reads. A value carrying
  CR or LF made the outbound request throw, and the route recorded the thrown
  message — which contains the caller's own string — as that camera's entry in
  the health report. A request the browser has stopped waiting for is now
  released: whether the viewer leaves while the camera is still answering or
  part-way through the picture, the upstream request is cancelled rather than
  left running, and neither case marks the camera degraded. Ordinary seeking is
  unaffected. Contributed by Maher-Reven (#253).
- CI pins `actions/checkout` and `actions/setup-node` to the commits their
  `v4.4.0` tags name, so a repointed tag cannot change what runs in CI. The
  version stays in a trailing comment, and moving to a later release is a
  deliberate edit. Contributed by SurefireStudios (#309).

- Validate configured Google Places coordinates and text queries before rate
  limiting or upstream requests; preserve the keyless capability response.
- Bound CCTV media response headers to 15 seconds and cancel error bodies.
  Cap buffered snapshot downloads at 16 MiB while streaming.

- Cancel the active location lookup when its controls are disposed.

#### Fixed

- `DATA_SOURCES.md` states what the project does with camera frame content: a
  successful upstream response is relayed as the provider served it, nothing in
  the camera pipeline enhances it or recognises what is in it, resampling for
  display is the only change made to the picture, and no frame is written to disk.
  It also names what a viewer sees when an upstream has no frame — including a
  last good picture kept after a failed refresh — and the one feature that sends
  imagery anywhere: the voice assistant's viewport screenshot. Contributed by
  Lob26 (#357).
- Pinokio's Update shows what it is about to install before it installs it: the
  tracking branch, the remote it fetched from, the incoming commits and their
  diffstat. The remote is printed as host and path — a password or token in the
  URL's user field is replaced and any query string dropped, though a secret
  spelled as an ordinary path segment cannot be told from a repository name. It
  fetches once and applies exactly the revision it named, so a commit that lands
  mid-update cannot be installed unannounced. A git read it cannot complete is
  reported as such instead of as "already up to date", and if the revision to
  apply cannot be resolved at all the update stops without installing anything
  and exits unsuccessfully. Contributed by Lob26 (#356).
- On Windows, the credential-file hardening step verifies the file's permissions
  through the system PowerShell. A side-by-side PowerShell 7 install prepends its
  own module directories, which the 5.1 verifier cannot load, so the check failed
  and the credential was refused. The verify script now sets its module path from
  the running interpreter's own home, and the environment it is launched with
  carries that one value and no differently cased alias of it. The tests that
  cover it drive a stubbed process launcher, so what they check is the command
  and environment the code builds; the Windows onboarding CI job now also runs
  this file, where its one Windows-only case exercises the real hardener against
  real native tools. Contributed by michaelhan1208 (#161).
- The panel-recovery instructions in `docs/KNOWN-ISSUES.md`, `docs/CURRENT-STATE.md`
  and `scripts/dev-fresh.sh` describe what the interface does. The rails lay panels
  out themselves and write no stored position, so a CCTV panel that looks missing
  is collapsed or its layer is off; the collapsed-state key is what opens it, and
  the value to store is `'0'`, since removing the key returns the panel to its
  default, which is collapsed. A view opened from a share link is laid out from
  the link and ignores the stored value, so the console workaround is for ordinary
  loads only. A check keeps the documented keys and outcomes in step with the
  code. Contributed by vegettto (#408).

- Extract panel disclosure and hover/focus controls into a reusable module;
  cancel their listeners and pending work during replacement and teardown.

- Reuse cached military aircraft during adsb.lol rate limits and server errors,
  honor bounded retry delays, and preserve cached observation times and stale
  indicators. Show installation zoom guidance without a false LOAD FAILED.

- GBFS rejects upstream redirects, caps streamed responses at 5 MiB, and keeps
  its deadline active through body reads. Rejected downloads are cancelled.

- Split Overpass/installation search, regional briefing/weather, local voice
  handlers and standalone key setup into focused modules. Preserve routes,
  source behavior, tool schemas and credential restrictions.

- Restore data-provider routes under local build preview and return JSON 404s
  for unmatched API requests. Credential editing remains development-only.

- Extract CCTV catalog/media and Radio Browser directory providers into focused
  Node modules, preserving their routes and policies and isolating CCTV catalogs
  by provider instance and application root.

- Simplify POWER UP to one Google Maps entry. Keep the optional server key
  available through environment configuration without a second setup row or
  missing-key reminder.

- Separate terrain, traffic, FIRMS and GBFS middleware into focused provider
  modules, preserving local configuration, routes and cache/error behavior.

- Split satellite and launch-feed server providers into focused modules with
  portable request URL builders, preserving routes and cache/error behavior.

- Keep landmark names when geocoding returns only address components, preventing
  the United States Capitol annotation from moving to a Washington hotel.
  Unrelated outlines leave the valid geocoded marker in place.

- Split aircraft and vessel server providers into focused modules for source
  fetching, AIS records/tracks and shared request helpers; preserve existing
  routes, local setup, fallback behavior and rendering.

#### Added

- **Directions layer** — keyless A→B directions without a geocoder or a
  microphone (thanks @spcpza). The row's chips arm a globe click for A and B
  (DRIVE / WALK / BIKE, SWAP, FLY, CLEAR); the route comes from the existing
  `/api/route` proxy (OSRM on the FOSSGIS servers), is draped on terrain and
  3D tiles with the same flowing dashes as voice routes, and drops one dot per
  maneuver. Below the chips is a compact keyboard-reachable ordered list of the
  turns — distance and instruction per step; click one to open that maneuver's
  card. FLY rides the shared route-flight cinematic through the same camera
  authority voice destinations use, highlights the step it is on as it goes,
  and lands when the route under it is replaced or cleared. A route that cannot
  be found says so, and one longer than the 200-maneuver cap says it is cut
  off; no straight line is ever drawn as a route. Share links carry the layer
  as token `n`.
- `/api/route` now returns turn-by-turn steps when asked (`steps=1`), phrased
  in plain English from OSRM's maneuver data (`src/data/routeSteps.js`). Steps
  are opt-in per request, so callers that do not read them (voice route
  annotations, `fly_route`) get exactly the response they got before; identical
  requests in flight at the same time share one upstream call; outbound calls
  are spaced to the one-per-second rate the routing service's usage policy
  states, with a bounded queue behind that gate and an honest 429 past it; the
  upstream host is pinned against redirects, and a rate limit from the routing
  service is reported as one rather than as a missing route.
- The Data attribution popover now credits OSRM / FOSSGIS routing (used by
  voice routes since launch, previously uncredited), with the OpenStreetMap
  credit and the "fix the map" link the service's usage policy asks for.

#### Changed

- The interface asks Google Fonts for only the icon glyphs it draws, instead of
  the whole variable icon font, and no longer requests a second icon family that
  nothing renders. A check fails when a source names a glyph the request is
  missing, because an absent glyph does not draw a placeholder — the element
  renders the glyph's name as text. The check reads the panel templates as well
  as the scripts, and reads glyph names written as literals, so a glyph chosen
  through a variable has to be added to the request by hand. Contributed by
  mml-studio (#239).
- Separate explicit browser build settings from standalone environment loading
  and local provider middleware. Preserve provider behavior and root named exports.
- Rename standalone browser startup to `src/standalone/` and add a Node-only
  `gods-eye-view/build/vite` export with checked package ownership.

#### Development

- The CCTV launcher and preview-server tests resolve their temporary fixture
  root through `fs.realpath`, so they pass on macOS, where the system temp
  directory is reached through a symlink and the paths the tests compare would
  otherwise differ. The launcher, preview-server and tool-project tests share one
  helper that resolves the root, and a case that builds a symlinked temp root
  explicitly keeps it covered on Linux, whose own temp root is not symlinked.
  Contributed by VassagoDevteam (#301).
- Remove the annotation GeoJSON conversion module and its tests. Nothing in the
  application read or wrote it, so it carried no behavior. Annotations are
  unchanged. Contributed by raiyan22 (#293).
- Check the destination preset table as data: every entry carries the keys the
  camera reads, its numbers are finite, its coordinates are on Earth, its camera
  angle is one a camera can hold, `viewBounds` latitudes are not swapped, every
  landmark lies inside its own destination's `viewBounds` (wrapped, so a view
  across the antimeridian is valid), and every `LOCATIONS` row matches the
  destination it names. This is a structural guard on the hand-written table for
  whoever adds the next destination; it passes on the current entries and makes
  no claim about how well any destination is framed. Contributed by daikaginza
  (#168).
- Drop `CCTV_AUTO_CALIBRATE` and `CCTV_DRAPE_MESH` from `.env.example`. Nothing
  reads either name; the features they once switched no longer exist, so setting
  them did nothing. Contributed by dajiaohuang (#283).

- Extract application lifecycle and viewer exports. Split standalone startup into
  scene setup, controls, layer registration, tools and loading UI. Startup failure
  and terminal shutdown release acquired resources and cancel delayed work.

- Adopt Prettier tooling contributed by RohanDaCoder (#227), with an explicit
  file scope, pinned formatter and Linux/Windows CI checks. Format the reusable
  infrastructure modules and their consumer tests. Package boundary checks keep
  those exports separate from app startup and local Node services.

#### Fixed

- Reduce terrain-height timeouts when Re:Earth slows down. Batches are
  sized against measured response latency on both browser and server to reduce
  request timeouts, and a partial upstream failure now
  keeps the heights that did resolve rather than discarding them. A position
  the upstream answers with no height is reported as an absent reading instead
  of a failed refresh, so the log distinguishes a slow or broken upstream from
  one that simply has no value for a coordinate.

- Separate optional Google server credentials for Places and Street View from
  the browser key, contributed by Tom-Neverwinter (#110). Provider Settings,
  Pinokio's app-specific credential handling and setup diagnostics recognize
  both keys. The Street View tool prefers the server key across environment
  and `.env` sources. Existing single-key and keyless setups remain supported.

- Complete the first-run, view-target prewarm, cockpit-plates and floor-hold
  browser harness renderer portability fixes contributed by Tom-Neverwinter.
  macOS retains Metal; other platforms default to SwiftShader. Cockpit renderer
  assertions and evidence labels follow the actual selected mode. Floor-hold
  explicitly selects its measured 2D billboard mode and keeps its mesh and terrain assertions; software runs are not real-GPU evidence.
  First-run QA now checks the existing attribution Escape-close/focus-return
  behavior while preserving the launcher-underneath regression checks.

- Datacenter and dam factories are available through scoped package exports with
  explicit context, overlay and render callbacks. The standalone app uses the
  same implementation and bundled datasets.

- Local GeoJSON layers share concurrent loads, cancel pending fetches on destruction,
  discard late results, and remove their entity-context records on teardown.

- Unchanged local infrastructure overlays no longer sustain idle rendering.
  Ground samples wait for visible terrain to settle and cannot place a marker
  below its loaded surface; roofs and valid below-sea-level heights are retained.
  Already sampled markers also follow higher terrain as close-up tiles refine.

- Datacenter and dam marker stems use bounded, zoom-dependent active sets with
  stable selection during camera motion. Close-up stems scale to the actual
  camera distance; source totals and submarine cables remain unchanged.

- Keyboard focus rings now survive active/selected button styles across the
  interface. Visual Styles, Location cities and points of interest, search,
  Context/mission actions, Cockpit utilities, and sliders retain a distinct
  focus indicator.
- A short Space press activates a focused control only on key release. Holding
  Space for 500 ms blurs that control before push-to-talk starts, and release is
  then consumed so it cannot also activate the old control. The same hold works
  from the map or page background; text-entry controls remain protected.
- The Location disclosure is reachable with Tab and shows keyboard focus;
  its city, point-of-interest, and search controls do too. Escape from inside
  the tray returns focus to its disclosure and discards any unfinished search;
  Escape on the disclosure itself closes the tray and clears that focus.
- Data Layers ON/OFF buttons show a keyboard focus ring independently of
  their enabled and feed-status colors.
- Display buttons, layout selectors, mode buttons, and sliders show a visible
  keyboard focus ring, including the controls used in Cockpit Display. Enabled
  CCTV camera dropdowns also show keyboard focus.
- Context tabs keep a distinct keyboard ring when selected. Their existing
  Left/Right arrow navigation continues to switch Contacts and Space Missions,
  and both choices remain reachable through ordinary Tab navigation.
- Tabbing through the Space Missions roster now drives the same temporary globe
  rotation and mission-marker highlight as pointer hover, without selecting the
  mission. Keyboard and pointer previews no longer cancel each other.
- Radio power controls, Search Nearby Sites, and Clear Selected Layers retain
  keyboard focus while their async work is busy. They expose that busy state to
  assistive technology and ignore repeated activation until the work settles.
- Live Contacts results retain keyboard focus by contact identity when counts,
  distance order, or pages refresh. If a focused contact departs or rotates off
  the visible page, focus moves to the named explanatory note at the end of the
  list and survives later refreshes there, so the next Tab proceeds beyond the
  list instead of restarting at Contacts or silently selecting another contact.
- Cockpit Live Signals retains keyboard focus during live updates and contact
  reordering, allowing Tab to continue to Display and Radio. If the focused
  contact leaves the list, focus moves to the current briefing tab.
- Cockpit-only Display and Radio launchers show complete inset focus rings.
- Escape collapses the nearest expanded panel containing keyboard focus and
  returns focus to that panel's disclosure when closing from its contents.
  Escape on the disclosure itself closes without leaving the collapsed control
  focused. Cockpit Contact and Live Signals panels follow the same nesting rule.
- Cesium's bottom-left Data attribution control and lightbox Close control are
  in the Tab order and support Enter and Space. Close, Escape, and backdrop
  dismissal restore focus and synchronize the disclosure state.

- CCTV testing uses the normal launcher for keyless startup, credential loading,
  localhost binding, and explicit LAN-exposure warnings while retaining its
  smaller source-pack limits.
- CelesTrak, Launch Library, terrain-height, and aircraft-enrichment failures
  return generic error messages. Related diagnostics omit raw exception details
  and upstream error bodies; response statuses and cache fallback remain intact.
  Includes the security fixes contributed by Tom-Neverwinter in PR #171.

#### Fixed

- Map Source keyboard opening retries focus until the selected tile is visible.
  Leaving the disclosure, pointer interaction, or closing the tray cancels the
  pending handoff so delayed work cannot pull focus back.

- Scope, Bloom, Sharpen, location search and generated style sliders expose
  explicit accessible names. The first-run checkbox retains its native label.
- FIRMS records a source as successful only after appending its rows, avoiding
  contradictory success/failure status if aggregation throws.
- Radio country filtering and voice country requests now resolve common English
  names and exonyms that `Intl.DisplayNames`' primary label omits, so requests
  like "play radio in Turkey" no longer fail closed (Turkey → Türkiye, plus
  Myanmar/Burma, UAE, Holland, Swaziland, East Timor, Cabo Verde, Vatican).
  Ambiguous names such as a bare "Congo" or "Korea" still fail closed.
- Mapped-site outages show their scheduled retry countdown and distinguish
  known Overpass rate limits, timeouts, and query failures. Search feedback no
  longer claims a refresh succeeded while the layer is unavailable or loading.
- Mapped installations retain valid ways and relations that provide bounds but
  no center. Invalid, inverted, and excessively wide bounds are rejected.
- Clicking a selected installation again or clicking elsewhere clears its
  selection; later refreshes no longer reclaim it after a click-away.
- Visual presets explain their effects on hover. Unavailable map sources name
  missing credentials and Provider Settings, while configured-but-failed
  Google 3D routes explain the failure without asking for another key.

- The Overpass proxy now rotates to the next mirror on any non-2xx upstream
  response, not only on 5xx. `overpass-api.de` and its `lz4` alias answer 406 to
  the proxy's User-Agent while two of the configured mirrors answer 200 to the
  identical request, so the fan-out stopped at the first refusal with healthy
  mirrors untried. The refusal was also cached to memory and disk and served as
  data — boundary-class queries hold a month-long TTL — which affected every
  Overpass-backed feature: road geometry, annotation outlines and place lookup.
- Existing cached refusals are now ignored immediately, including during
  stale-data fallback. Concurrent identical requests share the same last-good
  fallback when all mirrors refuse, without duplicating upstream requests.
- A keyless place lookup no longer remembers a network failure as "no such
  place". A blip while Photon was answering used to be memoized for the rest of
  the session, so the query kept returning not-found from memory on a network
  that had since recovered. A miss is now cached only when every source
  consulted actually returned a verdict.

#### Added

- Keyless place search. The LOCATION search box and the `fly_to_location` voice
  tool now resolve place names through Photon (komoot, over OpenStreetMap) when
  no Google Maps key is configured — previously the lookup threw. Google stays
  the primary path and is unchanged when it answers; the fallback also covers a
  key whose Geocoding API is not enabled, which Google reports as HTTP 200 with
  `REQUEST_DENIED`, so an empty result is the detector rather than an error.
- The same keyless fallback now covers the remaining two place lookups: map
  annotations ("annotate the botanical garden") and the Radio layer's
  "near \<place>" selection. Radio previously threw without a key, which
  surfaced as a failed voice turn rather than as a station it could not place;
  annotations silently failed to anchor. Annotation footprints match OSM on the
  resolved feature's canonical name, so locality words in the request cannot
  pull the outline onto a neighbouring building.

- Refresh vulnerable transitive dependencies and update browser/image tooling
  to Puppeteer 25.10.0 and Sharp 0.35.4. Cesium remains on 1.138.0.
  Browser QA awaits the new asynchronous executable-path lookup.

### \[0.1.1\] — 2026-09-01 — Installation and live-data fixes

#### Changed

- Tightened the README opening around keyless setup, source freshness, modeled
  experiences, and the accessibility of the provider stack.

#### Fixed

- Pinokio now recognizes its nested successful-install marker, so a completed
  one-click install exposes Start instead of returning to Install.
- The keyless `dev-fresh.sh` startup summary now names Esri World Imagery with
  keyless terrain and identifies OpenStreetMap as the fallback.
- All three VIIRS sources now reach the Active Fires layer. Merging a source's
  detections used argument spread, which exceeds the engine's argument limit on
  the two largest sources and dropped them entirely — leaving roughly a third of
  global detections while reporting each dropped source twice, once as
  successful with its real count and once as failed.
- `./scripts/dev-fresh.sh` no longer crashes on stock macOS bash 3.2 when no
  provider keys are exported: expanding the empty external-keys provenance
  array under `set -u` was fatal there. Launches with exported keys are
  unchanged.

#### Security

- GBFS proxy body-size cap now measures the response in bytes
  (`Buffer.byteLength`) instead of JavaScript string length, so the
  `GBFS_MAX_BODY_BYTES` limit holds for multi-byte payloads and cannot be
  overrun by non-ASCII upstream responses.

### \[0.1.0\] — 2026-08-31 — One-click install, keyless boot, Provider Settings

#### Added

- **One-click install** via Pinokio. Keyless boot lands on a live Esri World
  Imagery satellite globe with keyless terrain; OSM takes over automatically if
  Esri is unreachable, and the globe continues without terrain if its source is
  unavailable.
- **Provider Settings** (the POWER UP panel): add, replace, or remove API keys
  inside the app. Credential files are made owner-only before any secret is
  written — verified on macOS and Windows — and keys configured outside the
  panel are shown read-only, never rewritten.
- **Keyless capability responses**: the optional HUD summary and place-search
  endpoints return a deliberate "not configured" success instead of errors, and
  never consume rate-limit quota.
- `.gitattributes` normalizes line endings, so Windows clones pass the full
  test suite out of the box (#81 — thanks @ethanstoner).

#### Changed

- README rewritten keyless-first around the provider ladder: zero keys → free
  Cesium ion (eligible personal, non-commercial use) → billing-enabled Google
  Maps.
- Browser-built data modules no longer import `node:fs`; a repo-wide boundary
  scan test keeps it that way (#83 — thanks @ethanstoner).
- Aircraft-identity voice answers explicitly cover operator, type, and route,
  and say so plainly when enrichment is unavailable instead of guessing.

#### Security

- Provider Settings answers only local, unproxied requests and disables itself
  entirely whenever the server is shared. Public datacenter and dam datasets
  omit contact-oriented fields (see the dataset READMEs).

### Pre-release development history

The dated entries and internal milestone numbers below predate the first
tagged GitHub Release. They are retained as project history and do not
represent previously published GitHub Releases.

### \[Unreleased\] — 2026-08-24

#### Added

- Added honest aircraft identity narration: callsign, operator, registration,
  type, and route come only from selected-contact context, and missing operator,
  route, or type enrichment is named explicitly.
- Added local, publication-compatible copies of the two README PNGs, with source
  records and third-party-license boundaries in `docs/media/README.md`.
- Added regression coverage for aircraft identity narration and optional-key
  loading feedback.

#### Changed

- First-run presentation now opens with Detection `DENSE` at 75%, `ELASTIC`
  allocation, Fade 7%, Outside 1%, scope feather 11%, and aircraft 3D models in
  `PROXIMITY`. Stored state and share links still override these baselines.
- The 17 selected README GIFs remain unchanged and are documented separately
  from the two owner-published PNGs.
- Bundled datacenter and dam snapshots now omit contact-oriented fields and
  note values containing email or phone identifiers. Feature geometry, names,
  operator/capacity/river metadata, counts, and ODbL terms are unchanged.
- Public documentation and the L9 release matrix no longer reference non-public
  planning material or repository history.

#### Fixed

- A missing optional FIRMS key no longer turns the complete Environmental
  mission into `LOAD FAILED`. The FIRMS row still reports `KEY REQUIRED`, while
  earthquakes continue to load. Real lifecycle and fetch failures retain
  failure priority.
- The mapped-installations layer retries after an unavailable request when it is
  enabled or the camera settles.
- Aircraft trails attach to the rendered aircraft transform and remain near the
  rear center across headings. Parked aircraft do not draw a moving head
  segment.
- Grounded aircraft keep validated floor evidence through temporary terrain
  outages and wait for measured photoreal-surface evidence before a 3D model
  takes over from its billboard.
- Cockpit altitude uses aviation MSL data rather than Cesium render height.

#### Security

- Production transitive dependencies resolve to patched DOMPurify and
  protobufjs releases without changing the Cesium version or application APIs.
- Production dependency audit reports no known advisories; remaining audit
  findings are confined to development and QA tooling.

### \[Unreleased\] — 2026-08-23

#### Added

- Added a first-run mission launcher for Contacts, Space Missions,
  Environmental, and manual exploration.
- Added terrain-validity gating and bounded last-known placement for grounded
  aircraft models.

#### Changed

- Environmental consistently presents both earthquakes and NASA FIRMS fires,
  with honest optional-key degradation.
- The tracked aircraft trail acceptance bar is visual: roughly rear-center,
  stable across headings, with minor hull overlap allowed and no conspicuous
  top, bottom, or lateral projection.

### \[Unreleased\] — 2026-08-18 to 2026-08-22

#### Added

- Added the four-source Map Source tray, share-link v2 state, cockpit/context
  voice parity, MSL altitude readouts, and close-range tracked aircraft models.
- Added the L9 release-candidate matrix, AIS feed watchdog, voice cost controls,
  satellite classes, and the shared world-overlay host.
- Added deterministic first-run, map-source, floor, overlay, tracking, and
  aircraft-model regression harnesses.

#### Changed

- Consolidated world labels, cards, tracked readouts, CCTV thumbnails, cable
  labels, mission labels, and detection presentation under shared allocation and
  lifecycle rules.
- Reduced idle rendering through the render governor and explicit scope mask.
- Improved cockpit layout, context restoration, keyless feed honesty, and
  aircraft 2D/3D handoffs.

#### Fixed

- Fixed degenerate depth picks, map-source restore states, route-camera motion,
  bright-ground label readability, grounded display flooring, and cross-layer
  tracking cleanup.
- Fixed stale overlay callbacks, parked-idle render leaks, cable-label sweep
  starvation, and several share-link state conflicts.

### \[Unreleased\] — 2026-08-02 to 2026-08-16

#### Added

- Added Global Context modes, Cockpit briefing surfaces, Radio context,
  satellite mission replay, and real per-class aircraft models with adjacent
  provenance records.
- Added a shared screen-space overlay system with bounded allocation for labels,
  cards, callouts, detection brackets, and selected-object presentation.

#### Changed

- Unified right-side product controls and responsive cockpit/map layouts.
- Migrated public-safe neighborhood geometry to DataSF and tightened safe local
  development defaults.
- Improved proxy resilience, annotation outline bounds, CCTV enable pacing,
  contact de-emphasis, and deterministic visual stacking.

### \[Unreleased\] — July 2026

#### Added

- Added live NASA FIRMS fires, optional live TomTom traffic, Caltrans and TfL
  CCTV packs, CCTV viewsheds and direct-manipulation calibration, citywide CCTV
  cards, Natural Earth regions, analyst queries, and voice routing QA.
- Added the end-to-end vertical-datum system for aircraft, vessels, CCTV,
  annotations, trails, and terrain-aware rendering.
- Added aircraft class silhouettes, path-derived display heading, ADSBDB
  enrichment, cached CelesTrak TLE lookup, and next-ISS-pass prediction.

#### Fixed

- Fixed elevated-airport aircraft placement, vessel sea-surface placement,
  close-zoom FIRMS anchors, antimeridian region framing, annotation resolution,
  cross-layer tracking ownership, and CCTV projection lifecycle issues.

### \[Unreleased\] — June 2026

#### Added

- Added OpenAI Realtime voice control, scene-aware entity context, viewport image
  grounding, the AI HUD summary, live AIS vessels, infrastructure layers, map
  source switching, free-text navigation, and server-side data proxies.
- Added hybrid map annotations, 3D aircraft, panoptic detection, tracking
  harnesses, and public data attribution.
- Added MIT source licensing, security guidance, contribution guidance, data
  source notices, and third-party asset boundaries.

#### Changed

- Removed the experimental AI video-edit style and retained seven deterministic
  visual styles.
- Moved Realtime text-history trimming to the server-side retention policy while
  keeping only the latest viewport image in conversation context.

### \[0.7.0\] — 2026-02-18

- Added the Bikeshare Pulse layer and panoptic label improvements.
- Improved tracked-item boxes, post-render alignment, and CCTV projection
  quality.
- Removed the experimental shift-drag CCTV calibration interaction.

### \[0.6.0\] — 2026-02-10

- Added the initial multi-layer 3D globe experience, visual styles, live
  aircraft, satellites, earthquakes, CCTV, traffic, FIRMS, infrastructure, and
  performance controls.
- Added entity inspection, tracking, scenes, keyboard controls, and shareable
  views.

### \[0.1.0\] — 2026-02-09

- Initial project version.

[Unreleased]: https://github.com/Jnolcox/vantage/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Jnolcox/vantage/compare/0dbde1e36c0177b7664b47702d77ba50f11ddadc...v1.0.0
