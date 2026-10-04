/**
 * The default services Core's tools read: the layers' portable source
 * factories and the place services. `fetchImpl` must resolve the sources'
 * relative `/api/...` paths; in a browser the page's own fetch does, and
 * elsewhere a caller supplies a resolving fetch.
 */

import { createUsgsEarthquakeSource } from '../layers/earthquakes/source.js';
import { createFirmsSource } from '../layers/firms/source.js';
import { createLaunchSource } from '../layers/launches/source.js';
import { createGeocodePlaceService } from './places.js';

/** Construct every service Core's tools read. */
export function createToolServices({ fetchImpl }) {
  if (typeof fetchImpl !== 'function')
    throw new TypeError('A fetch implementation is required');
  return {
    earthquakes: createUsgsEarthquakeSource({ fetchImpl }),
    fires: createFirmsSource({ fetchImpl }),
    launches: createLaunchSource({ fetchImpl }),
    places: createGeocodePlaceService({ fetchImpl }),
  };
}
