/** The local MCP server: Core's tools over services backed by a running app. */

import { randomBytes } from 'node:crypto';
import { cspOriginsFor } from '../../build/content-security-policy.js';
import { PACKAGE_VERSION } from '../../src/sources/version.js';
import {
  composeCatalog,
  coreTools,
  catalogForSurface,
} from '../../src/tools/index.js';
import {
  createGlobePanelResource,
  panelRuntime,
} from '../../src/tools/panel.js';
import { createMcpServer } from '../../src/tools/mcp/index.js';
import { DEFAULT_API_BASE, createLocalToolServices } from './services.js';

const INSTRUCTIONS =
  "Tools answer questions from Vantage's live public data. Location " +
  'tools take an area: a place name, a bbox, or lat/lon with radius_km. ' +
  'Results are capped; check truncated and total before concluding there is nothing more. ' +
  'Answers that can be shown in Vantage include data.view; to show one, call ' +
  'show_in_vantage with that view, adding layers, style, a camera or marks as ' +
  'needed. It shows live Vantage where the client displays apps and returns ' +
  'a link everywhere.';

/**
 * Origins in the page's policy the panel can never use. Voice connects to
 * OpenAI only with a token from /api/realtime, which panel_request refuses.
 */
const PANEL_UNUSED_ORIGINS = new Set(['https://api.openai.com']);

/**
 * What the panel may reach directly, from the page's own policy: providers
 * the browser connects to, and the images it loads from them. Script,
 * frame and style origins stay out; the panel needs none of them.
 */
const PANEL_CONNECT_DOMAINS = Object.freeze(
  cspOriginsFor(['connect-src']).filter(
    (origin) => !PANEL_UNUSED_ORIGINS.has(origin),
  ),
);
const PANEL_RESOURCE_DOMAINS = Object.freeze(cspOriginsFor(['img-src']));

/** Random bytes in each server's panel key. */
const PANEL_KEY_BYTES = 32;

/** Construct the local MCP server for Core's tools. */
export function createLocalMcpServer({
  apiBase = DEFAULT_API_BASE,
  fetchImpl,
} = {}) {
  // Each server makes a new key for its panel. The panel's page carries it
  // and panel_request requires it; any client may read the page, so it keeps
  // the tool from clients that only list it, and is not access control.
  const panelKey = randomBytes(PANEL_KEY_BYTES).toString('base64url');
  return createMcpServer({
    catalog: catalogForSurface(
      composeCatalog({
        tools: coreTools,
        services: createLocalToolServices({ apiBase, fetchImpl, panelKey }),
      }),
      'mcp',
    ),
    name: 'vantage',
    version: PACKAGE_VERSION,
    instructions: INSTRUCTIONS,
    resources: [
      createGlobePanelResource({
        runtime: panelRuntime,
        panelKey,
        connectDomains: PANEL_CONNECT_DOMAINS,
        resourceDomains: PANEL_RESOURCE_DOMAINS,
      }),
    ],
  });
}
