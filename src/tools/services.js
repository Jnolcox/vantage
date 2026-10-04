/**
 * The default services Core's tools read: the layers' portable source
 * factories, the application request services, and the place, place-search
 * and routing services. `fetchImpl` must resolve the sources' relative
 * `/api/...` paths; in a browser the page's own fetch does, and elsewhere a
 * caller supplies a resolving fetch.
 */

import { createCctvSource } from '../layers/cctv/source.js';
import { createCycloneSource } from '../layers/cyclones/source.js';
import { createUsgsEarthquakeSource } from '../layers/earthquakes/source.js';
import { createFirmsSource } from '../layers/firms/source.js';
import { createInstallationSource } from '../layers/installations/source.js';
import { createLaunchSource } from '../layers/launches/source.js';
import { createWfigsPerimeterSource } from '../layers/perimeters/source.js';
import { createRadioSource } from '../layers/radio/source.js';
import { createSatelliteSource } from '../layers/satellites/source.js';
import {
  createAdsbLolSource,
  createOpenSkySource,
} from '../sources/live/standalone.js';
import { createApplicationRequestServices } from '../services/requests.js';
import {
  createGeocodePlaceService,
  createPlaceSearchService,
  createRouteService,
} from './places.js';

/** Construct every service Core's tools read. */
export function createToolServices({ fetchImpl }) {
  if (typeof fetchImpl !== 'function')
    throw new TypeError('A fetch implementation is required');
  const requests = createApplicationRequestServices({ fetchImpl });
  return {
    earthquakes: createUsgsEarthquakeSource({ fetchImpl }),
    fires: createFirmsSource({ fetchImpl }),
    launches: createLaunchSource({ fetchImpl }),
    aircraft: createOpenSkySource({ fetchImpl }),
    military: createAdsbLolSource({ fetchImpl }),
    satellites: createSatelliteSource({ fetchImpl }),
    cctv: createCctvSource({ fetchImpl }),
    radio: createRadioSource({ fetchImpl }),
    placeSearch: createPlaceSearchService({ fetchImpl }),
    routing: createRouteService({ fetchImpl }),
    weather: requests.weather,
    regional: requests.regional,
    terrain: requests.terrain,
    summary: requests.summary,
    features: requests.features,
    cyclones: createCycloneSource({ fetchImpl }),
    perimeters: createWfigsPerimeterSource({ fetchImpl }),
    installations: createInstallationSource({
      fetchImpl,
      tileFetchImpl: fetchImpl,
    }),
    places: createGeocodePlaceService({ fetchImpl }),
  };
}
