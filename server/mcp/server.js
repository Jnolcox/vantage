/** The local MCP server: Core's tools over services backed by a running app. */

import { PACKAGE_VERSION } from '../../src/sources/version.js';
import {
  composeCatalog,
  coreTools,
  toolsForSurface,
} from '../../src/tools/index.js';
import { createMcpServer } from '../../src/tools/mcp/index.js';
import { DEFAULT_API_BASE, createLocalToolServices } from './services.js';

const INSTRUCTIONS =
  "Tools answer questions from Vantage's live public data. Location " +
  'tools take an area: a place name, a bbox, or lat/lon with radius_km. ' +
  'Results are capped; check truncated and total before concluding there is nothing more.';

/** Construct the local MCP server for Core's tools. */
export function createLocalMcpServer({
  apiBase = DEFAULT_API_BASE,
  fetchImpl,
} = {}) {
  return createMcpServer({
    catalog: composeCatalog({
      tools: toolsForSurface(coreTools, 'mcp'),
      services: createLocalToolServices({ apiBase, fetchImpl }),
    }),
    name: 'vantage',
    version: PACKAGE_VERSION,
    instructions: INSTRUCTIONS,
  });
}
