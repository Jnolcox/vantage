/** Composite queries that combine other tools' answers for one area. */

import { isHudSummaryUnconfigured } from '../../hudSummaryResponse.js';
import { defineTool, ToolError } from '../catalog.js';
import { AREA_SCHEMA, areaCenter, resolveArea } from '../area.js';
import { aircraftInArea } from './aviation.js';
import { getCyclones, getWeather } from './environment.js';
import { getActiveFires, getEarthquakes } from './hazards.js';

const SECTION_LIMIT = 5;

/** Brief sections: the tool each one reuses and the services it needs. */
const SECTIONS = [
  {
    key: 'weather',
    label: 'Weather',
    tool: getWeather,
    args: (area, center) => ({
      location: { lat: center.lat, lon: center.lon },
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
    key: 'cyclones',
    label: 'Tropical cyclones',
    tool: getCyclones,
    args: (area) => ({ area: area.argument }),
  },
];

/**
 * Run every section whose services are supplied. A failing section is
 * reported as unavailable instead of failing the brief.
 */
async function buildBrief(args, { services, signal }) {
  const resolved = await resolveArea(args.area, { services, signal });
  // Sections receive the resolved box so a place name is looked up once.
  const area = {
    ...resolved,
    argument: resolved.center
      ? {
          lat: resolved.center.lat,
          lon: resolved.center.lon,
          radius_km: resolved.center.radiusKm,
        }
      : {
          bbox: [resolved.west, resolved.south, resolved.east, resolved.north],
        },
  };
  const center = areaCenter(resolved);
  const sections = SECTIONS.filter(({ tool }) =>
    tool.requires.every((key) => services[key] != null),
  );
  const results = await Promise.allSettled(
    sections.map(({ tool, args: build }) =>
      tool.run(build(area, center), { services, signal }),
    ),
  );
  signal?.throwIfAborted();
  const brief = {};
  const lines = [];
  sections.forEach(({ key }, index) => {
    const result = results[index];
    if (result.status === 'fulfilled') {
      brief[key] = { summary: result.value.summary, data: result.value.data };
      lines.push(result.value.summary);
    } else {
      const known = result.reason instanceof ToolError;
      brief[key] = {
        unavailable: true,
        reason: known ? result.reason.message : 'unavailable right now',
      };
    }
  });
  return { area: resolved, center, brief, lines };
}

export const situationBrief = defineTool({
  name: 'situation_brief',
  title: 'Situation brief',
  description:
    'One overview of an area: current weather, recent earthquakes, active ' +
    'fires, aircraft overhead and tropical cyclones, each summarized with ' +
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
    // no coordinates, with each section that answered as an enabled layer.
    const response = await context.services.summary.summarize(
      {
        placeLabels: [area.label],
        streetLabels: [],
        nearbyPlaceLabels: [],
        enabledLayerLabels: SECTIONS.filter(
          ({ key }) => brief[key] && !brief[key].unavailable,
        ).map(({ label }) => label),
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
    return {
      summary: caption,
      data: { area: area.label, caption },
    };
  },
});
