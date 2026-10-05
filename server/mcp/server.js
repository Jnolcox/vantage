/** The local MCP server: Core's tools over services backed by a running app. */

import { randomBytes } from 'node:crypto';
import { PACKAGE_VERSION } from '../../src/sources/version.js';
import {
  composeCatalog,
  coreTools,
  catalogForSurface,
} from '../../src/tools/index.js';
import { createMcpServer } from '../../src/tools/mcp/index.js';
import { DEFAULT_API_BASE, createLocalToolServices } from './services.js';

const INSTRUCTIONS =
  "Tools answer questions from Vantage's live public data. Location " +
  'tools take an area: a place name, a bbox, or lat/lon with radius_km. ' +
  'Results are capped; check truncated and total before concluding there is nothing more.';

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
  });
}
