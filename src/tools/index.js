/**
 * Tools that answer questions from Vantage data, independent of the
 * surface that exposes them. See docs/TOOLS.md.
 */

import { getActiveFires, getEarthquakes } from './queries/hazards.js';
import { getRecentLaunches } from './queries/space.js';

export {
  defineTool,
  composeCatalog,
  ToolError,
  TOOL_ERROR_CODES,
} from './catalog.js';
export {
  AREA_SCHEMA,
  resolveArea,
  areaCenter,
  areaContains,
  distanceKm,
} from './area.js';
export { LIMIT_SCHEMA, DEFAULT_LIMIT, MAX_LIMIT, capRows } from './results.js';
export { createGeocodePlaceService, placeFromGeocodeResult } from './places.js';

/** Every query Core defines, in a stable order. */
export const coreTools = Object.freeze([
  getEarthquakes,
  getActiveFires,
  getRecentLaunches,
]);
