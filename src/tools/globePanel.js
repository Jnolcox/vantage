/**
 * The Vantage panel: an MCP Apps view (`io.modelcontextprotocol/ui`) that
 * shows Vantage inside a conversation. The panel is a small page that runs
 * the app's panel build inside itself in embed mode, loading it through the
 * MCP server, and sends it each view the show_in_vantage tool returns; see
 * docs/TOOLS.md.
 */

import { PANEL_REQUEST_TOOL } from './queries/panelRequest.js';

export const GLOBE_PANEL_URI = 'ui://vantage/globe';
/** Where the app's server serves its panel build (see build/panel.js). */
export const PANEL_BASE = '/panel/';
/** The script the panel runs ahead of Cesium's workers, in the build. */
export const PANEL_WORKER_PRELUDE_PATH = 'cesium/worker-prelude.js';

export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';
const MCP_APPS_PROTOCOL_VERSION = '2026-01-26';
const PANEL_HEIGHT_PX = 520;
const LOAD_TIMEOUT_MS = 90_000;
/**
 * The app's address inside the panel, for code that needs an https address
 * (the page's own may use a host's scheme). The panel loads its paths
 * through the MCP server; the name never resolves.
 */
const PANEL_APP_BASE_URL = 'https://app.vantage.invalid/';

/**
 * The panel page: its status line, the Open in Vantage button, and the
 * panel's script, `runtime`, which loads the app through the MCP server and
 * shows each view a tool returns.
 */
function panelHtml(runtime, panelKey) {
  const config = {
    appBaseUrl: PANEL_APP_BASE_URL,
    loadTimeoutMs: LOAD_TIMEOUT_MS,
    panelBase: PANEL_BASE,
    panelHeight: PANEL_HEIGHT_PX,
    panelKey,
    protocolVersion: MCP_APPS_PROTOCOL_VERSION,
    toolName: PANEL_REQUEST_TOOL,
    workerPreludePath: PANEL_WORKER_PRELUDE_PATH,
  };
  const script = `(${runtime})(${JSON.stringify(config)});`.replace(
    /<\/script/gi,
    '<\\/script',
  );
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Vantage</title>
<style>
  html, body { margin: 0; height: 100%; min-height: ${PANEL_HEIGHT_PX}px; background: #05070a;
    color: #b8c4cc; font: 13px/1.4 system-ui, sans-serif; overflow: hidden; }
  #status { position: absolute; inset: 0; z-index: 10000; display: flex; align-items: center;
    justify-content: center; padding: 0 24px; text-align: center; }
  #actions { position: absolute; right: 10px; top: 10px; z-index: 10001; display: flex; gap: 6px; }
  #actions button { padding: 6px 10px; border: 1px solid #3a4a55; border-radius: 6px;
    background: rgba(5, 7, 10, 0.75); color: #dfe8ee; font: inherit; cursor: pointer; }
  #actions button[hidden] { display: none; }
</style>
</head>
<body>
<div id="status">Waiting for a view…</div>
<div id="actions">
<button id="expand" type="button" hidden>Expand</button>
<button id="open" type="button" hidden>Open in Vantage</button>
</div>
<script>${script}</script>
</body>
</html>
`;
}

function originList(origins, name) {
  if (
    !Array.isArray(origins) ||
    origins.some((origin) => typeof origin !== 'string')
  )
    throw new TypeError(`The globe panel's ${name} must list origins`);
  return [...origins];
}

/**
 * The panel as an MCP resource. `runtime` is the panel's script, a function
 * of its configuration that runs in the panel page; the application supplies
 * it (src/app/globePanelRuntime.js), as it is browser code. `panelKey` is
 * the key the panel's requests must carry (see
 * src/tools/queries/panelRequest.js), which this page holds.
 *
 * `connectDomains` and `resourceDomains` are the origins the host's security
 * policy lets the panel reach directly and load images from: the map
 * imagery, tile and terrain providers the app's browser code reads. The
 * server supplies them from its own policy; everything from the app's own
 * server arrives through the MCP server instead, so no app address is
 * declared. Without them the panel reaches no provider.
 */
export function createGlobePanelResource({
  runtime,
  panelKey,
  connectDomains = [],
  resourceDomains = [],
}) {
  if (typeof runtime !== 'function')
    throw new TypeError('The globe panel needs its runtime script');
  if (typeof panelKey !== 'string' || panelKey.length === 0)
    throw new TypeError('The globe panel needs its request key');
  return Object.freeze({
    uri: GLOBE_PANEL_URI,
    name: 'globe',
    title: 'Vantage globe',
    description: 'Live Vantage, showing the view a tool returns.',
    mimeType: MCP_APP_MIME_TYPE,
    text: panelHtml(runtime, panelKey),
    _meta: {
      ui: {
        csp: {
          resourceDomains: originList(resourceDomains, 'resourceDomains'),
          connectDomains: originList(connectDomains, 'connectDomains'),
        },
        prefersBorder: true,
      },
    },
  });
}
