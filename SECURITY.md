# Security

Vantage is a local-first client for **public** data. It is built for exploration, demos, and learning — not as a hardened production service. This document explains the security model so you can run it safely and report issues responsibly.

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue for anything exploitable.

- Use GitHub's [private vulnerability reporting](https://github.com/Jnolcox/vantage/security/advisories/new) (Security tab → "Report a vulnerability"), or
- Reach the maintainer, John Nolcox ([@Jnolcox](https://github.com/Jnolcox)), via the contact on the GitHub profile.

Include repro steps and impact. We'll acknowledge, investigate, and credit you (if you'd like) once a fix ships.

## How secrets are handled

The golden rule: **secret-bearing API keys stay on the server side.** The dev/preview server (middleware under `server/providers/`) brokers every request that needs a private credential, so the browser never receives one.

| Key | Where it lives | How the browser uses it |
|-----|----------------|--------------------------|
| `OPENAI_API_KEY` | Server only | Browser fetches a short-lived **ephemeral** Realtime session token from `/api/realtime/token`; the real key never ships |
| `AISSTREAM_API_KEY` | Server only | Server holds the AISStream websocket; browser polls the same-origin `/api/ais-live` cache |
| OpenSky OAuth (`OPENSKY_CLIENT_ID/SECRET`) | Server only | Server mints + refreshes the token behind `/api/opensky` |
| `GOOGLE_MAPS_SERVER_API_KEY` (optional, #33) | Server only | Server calls Places (`/api/google/nearby-places`, `/api/google/text-search`) and the Street View fallback with this key; falls back to `GOOGLE_MAPS_API_KEY` when unset |

### Two deliberately client-side keys — restrict them

These are designed to be used directly in the browser (like a Mapbox public token). They are injected into the client bundle via Vite's `define`, so they **will** be visible in browser devtools. Scope and restrict them rather than trying to hide them:

1. **Google Maps API key** — loads Photorealistic 3D Tiles directly and powers Vantage place search. **Restrict it** (HTTP referrer + API restriction to the required Google APIs) in the Google Cloud Console. An unrestricted key in a public deployment can be abused and billed to you.
2. **Cesium ion token** (`CESIUM_ION_TOKEN`, optional — for ion-hosted Google Photorealistic 3D Tiles, Bing world imagery, and world terrain) — used as `Cesium.Ion.defaultAccessToken` client-side. Use a public **`assets:read`** token with **URL restrictions** for any hosted deployment. The Community plan has eligibility and usage limits; a public token is not a secret, but it can still consume the account's quota.

> The explicit browser `define` block in `build/vite.js` controls exactly what reaches the client: only these two keys. Everything else stays server-side.

**Places and Street View never needed to be on that list** (#33): they're called from the server-side proxies in the table above, which use `GOOGLE_MAPS_SERVER_API_KEY` when it's set. Splitting it from the browser-exposed key lets each key's Google Cloud restriction actually match what it does — the browser key referrer-restricted to the APIs the client loads, the server key IP-restricted (never a referrer, since it never leaves your server) to Places + Street View Static — instead of one key that has to be either over-permissioned or broken for one of its two jobs. A single shared `GOOGLE_MAPS_API_KEY` still works if you don't split them; it just has to cover every API both sides use.

Never commit real keys. `.env` is gitignored; only `.env.example` (placeholder names) is tracked. On macOS `dev-fresh.sh` can read keys from the Keychain; plain Vite uses env vars or a local `.env`, and Pinokio uses its ignored app `ENVIRONMENT` file.

The official Pinokio launcher stores optional values in its ignored local
`pinokio/ENVIRONMENT` file and Vite explicitly denies that filename. Add,
replace, or remove those values through the in-app **POWER UP → Provider
Settings** panel; the server restricts the file before writing and restarts the
local app after a save. Do not submit credentials through Pinokio 8.0.40's
native Configure form: that release targets the wrong file for this nested
launcher layout and logs the submitted values. The ignored file is local
plaintext, not encrypted storage. The macOS Keychain remains the stronger local
option when launching through `./scripts/dev-fresh.sh`.

### Configuring separate Google keys locally

Terminal development uses one ignored repository-root `.env` for both
`GOOGLE_MAPS_API_KEY` (browser) and `GOOGLE_MAPS_SERVER_API_KEY` (server).
The tracked `.env.example` documents both without credentials. Vite injects
only the browser key; sharing an environment file does not expose the server
key. Provider Settings presents only the browser key as Google Maps; configure
the optional server key manually in the environment file. Pinokio uses
its ignored `pinokio/ENVIRONMENT` instead, with app values and blanks taking
precedence over inherited global values. An absent server key retains the
browser-key fallback for existing single-key setups.

## Server-side proxy hardening

The data proxies under `server/providers/` are written so the browser cannot turn the server into an open relay:

- **No arbitrary-URL fetching.** The CCTV frame proxy fetches only server-registered camera/frame URLs — clients cannot pass an upstream URL to fetch (SSRF mitigation). Other proxies target fixed upstream hosts.
- **Radio is not an audio relay.** `/api/radio/stations` contacts only allowlisted Radio Browser HTTPS hosts and paths, rejects redirects, rejects any hostname with a loopback/private/link-local/metadata/non-public A or AAAA result, and pins each TLS connection to a validated address. It returns normalized public HTTPS stream URLs; `/api/radio/click/:uuid` applies the same destination policy and accepts only station IDs from the current bounded catalog. The browser then connects directly to the broadcaster after an explicit playback action, so the broadcaster sees the listener's IP address. Vantage never proxies, caches, records, or redistributes audio.
- **Live HLS is bounded and origin-pinned.** Registered HTTP(S) HLS sources use a Node puller that rejects redirects and off-origin playlist references, bounds playlists and segment bodies while streaming, and aborts timed-out or released sessions. At most two sessions retain 12 segments/24 MiB each, plus bounded download buffers. Stores are memory-only and idle leases expire after 15 seconds. RTMP/ffmpeg execution is not enabled. Locally configured source URLs remain an operator trust boundary.
- **No verbatim client headers upstream.** The CCTV media route is the one route that relays a request header (`Range`, for video seeking). It is parsed and canonicalized before it is forwarded: one `bytes=` range only, with every accepted form — explicit span, open-ended and suffix — bounded to the same 64 MiB ceiling the relay applies to a declared response body. Multi-range, malformed, inverted and non-`bytes` values are dropped and the request proceeds without a `Range`, as RFC 7233 §3.1 prescribes. Bounding the request bounds what is asked for: a response that declares no length — live streamed media, or a chunked body from an upstream that ignores the `Range` — has no ceiling. An upstream request the browser has stopped waiting for is cancelled rather than left running, whether the viewer leaves before the headers arrive or during the body.
- **Transit fetches registered feeds only.** `/api/transit/vehicles/<id>` resolves the id against `src/data/transitFeeds.js`; the browser never supplies a URL, and a feed that is registered but disabled does not resolve at all. Redirects are followed manually and each hop is validated against the feed's own https origin before it is requested, so an off-origin or downgraded hop is refused rather than contacted. Bodies are capped at 8 MB, the protobuf is decoded server-side under entity-count and string-length ceilings, a differential feed is refused, and snapshots live 15 s in memory with no disk cache. A per-feed admission limiter and a failure cooldown ladder bound what this process can ask of any operator.
- **Local receiver feeds are operator-configured and local-only.** `/api/local-receivers/aircraft` reads only the `aircraft.json` URLs in the server's `VANTAGE_LOCAL_RECEIVER_FEEDS` (or upstream's `LOCAL_RECEIVER_FEEDS`); the browser never supplies an address. Each host must pass the shared tap address rule (`src/data/tapAddress.js`: loopback, RFC1918, `localhost`, `*.local`; no link-local, IPv6 or other names), the scheme must be http(s), the path must end in `aircraft.json`, and credentials, queries and fragments are refused. Invalid entries are logged at startup and never fetched. Reads use a 2 s timeout, refuse redirects, cap bodies at 2 MB and share one read per second; requests carry the Vantage User-Agent; responses name each feed by band only and never carry upstream error text.
- **Response-size caps and timeouts** on proxied responses.
- **Sanitized errors** — internal error details are not echoed back to clients.
- **Coalesced OAuth refresh** and cached successful responses only (OpenSky).
- **Opt-in, redacted debug logging.** The voice debug log (`.vantage-logs/`, gitignored) is written only when the server runs with `VANTAGE_REALTIME_DEBUG_LOG=1`, and strips API keys, bearer tokens, client secrets, and image data URLs before writing. When enabled it records full voice transcripts.

## Network exposure — the operator threat model

The dev server is a **key broker**: every server-side key above is spendable by anyone who can send HTTP requests to it. That shapes the defaults:

- **Local-only by default.** `./scripts/dev-fresh.sh`, `npm run dev` and Pinokio bind to `127.0.0.1`, so only your machine can reach the server.
- **Only expected `Host` names are answered, on every route.** `allowedHosts` is always an explicit list of exact names: `localhost` and `*.localhost`, IP addresses, plus this machine's hostname in LAN mode and the names in `VANTAGE_ALLOWED_HOSTS`. Suffix (`.lan`) and wildcard (`*.lan`) entries are ignored, and there is no built-in `.local` suffix, so a TLS-proxy name such as `vantage.local` must be listed. Plugin middleware runs before Vite's own Host check, so the guard (`server/standalone/api-request-guard.js`) applies the list to every path ahead of all other middleware on the dev and preview servers, which closes DNS rebinding for `/api` and every other route. **Limit:** a listed name is trusted like the app's own address, so list only names you control.
- **Other websites cannot drive the proxies.** The same guard refuses any `Origin` other than the server's own and any request the browser labels `Sec-Fetch-Site: cross-site` or `same-site` (which covers `<img>` and no-cors loads that carry no `Origin`). CORS is off, `/api/realtime/token` answers only `POST`, and the CCTV Street View fallback frames only registered cameras. Local tools without those headers (curl, the QA scripts) still work.
- **Local data is never served.** `.vantage-logs/` (voice transcripts when the debug log is on) and `.vantage-cache/` are in the dev server's `fs.deny`, alongside `.env*`, certificates, `.git` and `pinokio/ENVIRONMENT`.
- **LAN exposure is an explicit opt-in**: `VANTAGE_HOST=0.0.0.0 ./scripts/dev-fresh.sh` (`HOST` is still read as the old name). The launcher prints a prominent warning plus your LAN URL. Understand what opting in means: **every device on that network can drive the proxies and spend your OpenAI / Google / OpenSky / AISStream / TomTom / FIRMS quota** for as long as the server runs. Do this only on networks you trust.
- **App-level throttles:** `VANTAGE_RATELIMIT_OPENAI_PER_MIN` and `VANTAGE_RATELIMIT_GOOGLE_PER_MIN` cap the cost-bearing endpoints per client IP per minute (over-limit requests receive a sanitized `429`). They are off on a loopback bind and default to 30 and 60 in LAN mode unless you set them (`0` means unlimited). They are **per-IP, process-local, in-memory guards** — they reset on restart and are **not billing caps**.
- **Provider-side budgets are the real backstop.** For hard spend protection, configure limits where the money is: OpenAI platform usage limits, Google Cloud budget alerts + per-API quotas, and equivalent controls for any other keyed provider.
- **Pinokio LAN and Cloudflare sharing are refused.** The current supported
  Pinokio release re-reads sharing state when an app registers its Open URL and
  logs a successful tunnel-login passcode in its own notification and terminal
  stream. Before preflight, the launcher rewrites its app-scoped sharing controls
  to disabled values, clears any Pinokio-global passcode from the child, and
  pins the platform share trigger to a disabled sentinel. A stale or requested
  sharing value is therefore discarded rather than honored, and Vantage starts on
  loopback only. Use a separately reviewed authentication proxy for remote
  access and keep provider-side quotas as the spend backstop.

## Network & privacy — what the browser may contact

The README's [Network & privacy](README.md#network--privacy) section lists
every outbound destination, when it is contacted and what is sent. The
controls that keep it that way:

- **Content-Security-Policy.** `build/content-security-policy.js` lists each
  third-party origin the page may load from or connect to, with the
  directives it needs and why; everything else is `'self'` and goes through
  `/api`. The dev and preview servers send it as a header (with
  `frame-ancestors 'none'` and `X-Frame-Options: DENY`), and `vite build`
  writes it into `dist/index.html` as a meta tag. `script-src` allows
  `'unsafe-eval'` only because the Knockout copy inside Cesium's widgets
  compiles its bindings with `new Function`, and `blob:` only because the
  production Cesium build starts its workers from blob URLs; script origins
  stay pinned.
  `src/tooling/contentSecurityPolicy.test.mjs` fails when browser code names
  a host the policy does not classify. If something is blocked while you
  investigate, `VANTAGE_CSP=report-only` reports instead of blocking.
- **Referrer-Policy `strict-origin-when-cross-origin`** (header and meta).
  Google referrer-restricted keys and YouTube embeds need the origin, so it
  is never tightened to `no-referrer`; paths and share-link state are never
  sent.
- **Embedded media is click-to-load.** YouTube (`youtube-nocookie`), Facebook
  and X load nothing — no preconnect, warm-up frame or SDK — until the viewer
  presses LOAD or ALWAYS ALLOW for that provider. Opening the Bhote Koshi
  event fetches its YouTube thumbnail posters from `i.ytimg.com` without
  cookies.
- **Automatic AI context is visible and switchable.** DISPLAY ▸ HUD ▸
  Context (Live/Local) controls the HUD's periodic Google and OpenAI lookups;
  the mic's VIEW toggle controls voice screenshots.
- **Cesium fails closed.** `Ion.defaultAccessToken` is the configured token
  or empty, so no implicit call reaches Cesium ion with the SDK's demo token,
  and the Google 3D Tiles credit logo is served locally.
- **Recent Imagery asks NASA only on a box you choose.** Enabling the layer,
  or restoring a box from stored state or a share link, sends nothing; NASA
  CMR, Worldview Snapshots and GIBS are contacted browser-direct (keyless)
  only after SELECT BOX, USE VIEW, a pin box or SEARCH, and receive that box
  and your IP address. A same-origin proxy would still have to forward the
  box, so the page talks to the three NASA origins the CSP lists.
- **Vector tiles go through the local server.** `/api/tiles` forwards an
  allow-list of OpenFreeMap and hourly ALPR-extract paths to those two hosts
  only, with the Vantage User-Agent, a size and time limit, and a bounded
  memory and disk cache under `.vantage-cache/tiles`, and rewrites TileJSON
  so the page is never handed a third-party tile address. Neither host is in
  the CSP. Public Overpass instances are never contacted; `/api/overpass`
  reaches only instances an operator names in `VANTAGE_OVERPASS_UPSTREAMS`.
- **Opt-in third-party reporting only.** Radio plays reach Radio Browser's
  click counter only with `VANTAGE_RADIO_REPORT_CLICKS=1`.

## Scope & expectations

- The Vite server is a **development/preview** server. If you expose it beyond localhost, put it behind your own auth/proxy and review the bindings (see the threat model above).
- All data shown is from **public** sources. See [DATA_SOURCES.md](DATA_SOURCES.md). Respect each provider's terms and rate limits.
- The voice agent receives feed-sourced text (place names, callsigns) as scene context. It is instructed to act only via a fixed set of app-control tools and not to execute arbitrary instructions found in data, but treat model output as untrusted and keep the tool surface limited.

## Responsible use

This is an interface for signals that are **already public**. Use it accordingly: respect privacy, follow data providers' terms, and don't represent public-data inference as authoritative intelligence.
