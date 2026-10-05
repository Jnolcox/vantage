/** Composite queries that combine other tools' answers for one area. */

import { feedProvenanceEnvelope } from '../../data/layerSnapshot.js';
import {
  hudSummaryMatchesProvenance,
  isHudSummaryUnconfigured,
} from '../../hudSummaryResponse.js';
import { defineTool, ToolError } from '../catalog.js';
import {
  AREA_SCHEMA,
  POINT_SCHEMA,
  areaCenter,
  resolveArea,
  resolvePoint,
} from '../area.js';
import { aircraftInArea } from './aviation.js';
import {
  findMilitaryInstallations,
  getCyclones,
  getWeather,
} from './environment.js';
import { getActiveFires, getEarthquakes } from './hazards.js';
import { vesselsInArea } from './maritime.js';

const SECTION_LIMIT = 5;
const AWARENESS_LIMIT = 10;
const AWARENESS_RADIUS_KM = 250;
// Sections a fallback caption names, as the HUD's provenance tag does.
const MAX_FLAGGED_SECTIONS = 2;

/** Brief sections: the tool each one reuses and the services it needs. */
const SECTIONS = [
  {
    key: 'weather',
    label: 'Weather',
    tool: getWeather,
    args: (area, center) => ({
      location: area.argument.place
        ? { place: area.argument.place }
        : { lat: center.lat, lon: center.lon },
    }),
  },
  {
    key: 'earthquakes',
    label: 'Earthquakes',
    tool: getEarthquakes,
    args: (area) => ({ area: area.argument, limit: SECTION_LIMIT }),
  },
  {
    key: 'fires',
    label: 'Active fires',
    tool: getActiveFires,
    args: (area) => ({ area: area.argument, limit: SECTION_LIMIT }),
  },
  {
    key: 'aircraft',
    label: 'Aircraft',
    tool: aircraftInArea,
    args: (area) => ({ area: area.argument, limit: SECTION_LIMIT }),
  },
  {
    key: 'vessels',
    label: 'Ships',
    tool: vesselsInArea,
    args: (area) => ({ area: area.argument, limit: SECTION_LIMIT }),
  },
  {
    key: 'cyclones',
    label: 'Tropical cyclones',
    tool: getCyclones,
    args: (area) => ({ area: area.argument }),
  },
];

/** Military contacts around a point, as the app's military awareness panel. */
const AWARENESS_SECTIONS = [
  {
    key: 'military_aircraft',
    tool: aircraftInArea,
    args: (area) => ({
      area: area.argument,
      military: true,
      limit: AWARENESS_LIMIT,
    }),
  },
  {
    key: 'aircraft',
    tool: aircraftInArea,
    args: (area) => ({ area: area.argument, limit: AWARENESS_LIMIT }),
  },
  {
    key: 'installations',
    tool: findMilitaryInstallations,
    args: (area) => ({ area: area.argument, limit: AWARENESS_LIMIT }),
  },
];

/** A section's feed state for the caption, from what its result reported. */
function sectionFeedState(section) {
  if (section.unavailable) return 'unavailable';
  const data = section.data || {};
  if (data.freshness === 'stale' || data.stale === true) return 'stale';
  // Answered, but some of the feeds or satellites behind it did not.
  if (data.missing_sources?.length || data.unavailable_feeds?.length)
    return 'degraded';
  return 'nominal';
}

/** The feed a section's result names, when it names one. */
function sectionSource(section) {
  const source = section.data?.source;
  return typeof source === 'string' && source ? source : null;
}

/**
 * The resolved area, plus the argument sections receive. A named place is
 * passed by name, so sections resolve it to the same point and label as a
 * direct query does (place lookups are cached).
 */
function sectionArea(resolved, original) {
  return {
    ...resolved,
    argument: original?.place
      ? { place: original.place }
      : resolved.center
        ? {
            lat: resolved.center.lat,
            lon: resolved.center.lon,
            radius_km: resolved.center.radiusKm,
          }
        : {
            bbox: [
              resolved.west,
              resolved.south,
              resolved.east,
              resolved.north,
            ],
          },
  };
}

/**
 * Run every section whose services are supplied. A failing section is
 * reported as unavailable instead of failing the whole answer.
 */
async function runSections(all, area, { services, signal }) {
  const center = areaCenter(area);
  const sections = all.filter(({ tool }) =>
    tool.requires.every((key) => services[key] != null),
  );
  const results = await Promise.allSettled(
    sections.map(({ tool, args: build }) =>
      tool.run(build(area, center), { services, signal }),
    ),
  );
  signal?.throwIfAborted();
  const answers = {};
  const lines = [];
  sections.forEach(({ key }, index) => {
    const result = results[index];
    if (result.status === 'fulfilled') {
      answers[key] = { summary: result.value.summary, data: result.value.data };
      lines.push(result.value.summary);
    } else {
      const known = result.reason instanceof ToolError;
      answers[key] = {
        unavailable: true,
        reason: known ? result.reason.message : 'unavailable right now',
      };
    }
  });
  return { center, answers, lines };
}

async function buildBrief(args, { services, signal }) {
  // Sections receive a named place by name (lookups are cached) and other
  // areas as the resolved box or circle.
  const area = sectionArea(
    await resolveArea(args.area, { services, signal }),
    args.area,
  );
  const { center, answers, lines } = await runSections(SECTIONS, area, {
    services,
    signal,
  });
  return { area, center, brief: answers, lines };
}

export const situationBrief = defineTool({
  name: 'situation_brief',
  title: 'Situation brief',
  description:
    'One overview of an area: current weather, recent earthquakes, active ' +
    'fires, aircraft overhead, ships and tropical cyclones, each summarized with ' +
    'its top items. Sections that are unavailable are marked as such.',
  inputSchema: {
    type: 'object',
    properties: { area: AREA_SCHEMA },
    required: ['area'],
    additionalProperties: false,
  },
  requires: ['weather'],
  async run(args, context) {
    const { area, brief, lines } = await buildBrief(args, context);
    return {
      summary: `Situation in ${area.label}: ${lines.join(' ')}`,
      data: { area: area.label, sections: brief },
    };
  },
});

/**
 * The deterministic caption the HUD falls back to when the model's caption
 * hides a non-nominal feed: the place, the overall state and up to two
 * sections behind it, as `hudTelemetryProvenanceTag` names them.
 */
function provenanceCaption(label, overall, layers) {
  const flagged = layers
    .filter((layer) => layer.feedState !== 'nominal')
    .slice(0, MAX_FLAGGED_SECTIONS)
    .map((layer) => layer.name.toUpperCase());
  return [label, overall.toUpperCase(), flagged.join('/')]
    .filter(Boolean)
    .join(' ');
}

export const getHudCaption = defineTool({
  name: 'get_hud_caption',
  title: 'Heads-up display caption',
  description:
    'The short heads-up display caption Vantage would show for an area, ' +
    'written by the app from the same overview situation_brief gives.',
  inputSchema: {
    type: 'object',
    properties: { area: AREA_SCHEMA },
    required: ['area'],
    additionalProperties: false,
  },
  requires: ['weather', 'summary'],
  async run(args, context) {
    const { area, brief } = await buildBrief(args, context);
    // The HUD's own summary context (src/hudSummaryResponse.js): labels only,
    // no coordinates, with each section as an enabled layer carrying the
    // feed state its result reported, failures included.
    const layers = SECTIONS.filter(({ key }) => brief[key]).map(
      ({ key, label }) => ({
        id: key,
        name: label,
        enabled: true,
        feedState: sectionFeedState(brief[key]),
        source: sectionSource(brief[key]),
      }),
    );
    const feedProvenance = {
      overall: feedProvenanceEnvelope(layers).overall,
    };
    const response = await context.services.summary.summarize(
      {
        placeLabels: [area.label],
        streetLabels: [],
        nearbyPlaceLabels: [],
        enabledLayerLabels: layers.map((layer) => layer.name),
        enabledLayers: layers.map(({ id, name, feedState, source }) => ({
          id,
          name,
          feedState,
          source,
        })),
        feedProvenance,
      },
      { signal: context.signal },
    );
    if (isHudSummaryUnconfigured(response?.status, response?.data))
      throw new ToolError(
        'unavailable',
        'HUD captions need OPENAI_API_KEY configured on the server',
      );
    const caption = response?.data?.summary;
    if (!response?.ok || typeof caption !== 'string' || !caption)
      throw new ToolError('unavailable', 'The caption service did not answer');
    // As in the HUD, a caption that hides a non-nominal feed is not shown;
    // the app's own line naming the state replaces it, so the paid answer
    // is not thrown away and a client has no reason to ask again.
    const written = hudSummaryMatchesProvenance(caption, feedProvenance);
    const shown = written
      ? caption
      : provenanceCaption(area.label, feedProvenance.overall, layers);
    return {
      summary: shown,
      data: {
        area: area.label,
        caption: shown,
        caption_source: written ? 'model' : 'app',
        feed_state: feedProvenance.overall,
      },
    };
  },
});

export const militaryAwareness = defineTool({
  name: 'military_awareness',
  title: 'Military awareness',
  description:
    'Military contacts around a location, as the military awareness panel ' +
    'shows them: military aircraft, other aircraft and mapped military ' +
    `installations within ${AWARENESS_RADIUS_KM} km by default, each ` +
    'nearest first. Sections that are unavailable are marked as such.',
  inputSchema: {
    type: 'object',
    properties: {
      location: POINT_SCHEMA,
      radius_km: { type: 'number', minimum: 1, maximum: AWARENESS_RADIUS_KM },
    },
    required: ['location'],
    additionalProperties: false,
  },
  requires: ['military'],
  async run(args, { services, signal }) {
    const point = await resolvePoint(args.location, { services, signal });
    const radiusKm = args.radius_km ?? AWARENESS_RADIUS_KM;
    const area = sectionArea(
      await resolveArea(
        { lat: point.lat, lon: point.lon, radius_km: radiusKm },
        { services, signal },
      ),
    );
    const { answers, lines } = await runSections(AWARENESS_SECTIONS, area, {
      services,
      signal,
    });
    return {
      summary: `Military awareness within ${radiusKm} km of ${point.label}: ${lines.join(' ')}`,
      data: {
        location: point,
        radius_km: radiusKm,
        sections: answers,
      },
    };
  },
});
