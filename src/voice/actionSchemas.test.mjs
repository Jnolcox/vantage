import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { VANTAGE_ACTION_SCHEMAS, createActionTools } from './actionSchemas.js';
import { VANTAGE_REALTIME_TOOLS } from '../../server/providers/openai/tools.js';

const OBSERVED_WEATHER_LAYERS = Object.freeze([
  'weather-radar',
  'weather-satellite',
  'weather-lightning',
]);
const CYCLONES_LAYER = 'weather-cyclones';
const SATELLITE_PASS_TOOL = 'next_satellite_pass';
const LOCAL_ADSB_LAYER = 'local-adsb';
const ANALYST_RECORD_LAYERS = Object.freeze([
  'satellites',
  'local-datacenters',
  'local-dams',
]);

// The analyst_query layer enum gained the satellite and infrastructure
// layers last; only that enum, not the visibility menus, carries them here.
function withoutAnalystRecordLayers(schemas) {
  const layers = schemas.find((tool) => tool.name === 'analyst_query')
    .parameters.properties.layers.items;
  layers.enum = layers.enum.filter(
    (key) => !ANALYST_RECORD_LAYERS.includes(key),
  );
  return schemas;
}

// Local ADS-B landed after the analyst record layers as one additive
// set_layer_visibility enum value.
function withoutLocalAdsb(schemas) {
  const layerId = schemas.find((tool) => tool.name === 'set_layer_visibility')
    .parameters.properties.layerId;
  layerId.enum = layerId.enum.filter((key) => key !== LOCAL_ADSB_LAYER);
  return schemas;
}

const stable = (value) =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, child]) => [key, stable(child)]),
        )
      : value;

test('the complete Realtime tool payload retains its pre-extraction contract and wording', () => {
  const digest = createHash('sha256')
    .update(JSON.stringify(stable(VANTAGE_REALTIME_TOOLS)))
    .digest('hex');
  // Re-derived for the additive `fire-perimeters`, `wind`, observed-weather
  // and `weather-cyclones` layer enum values, the `next_satellite_pass` tool,
  // the satellite/infrastructure analyst layers and the `local-adsb`
  // visibility layer.
  assert.equal(
    digest,
    '1bb02dca455cb2ec50d9255bf27a9ff24de0ade7e2f44906eed67ae91c9121a3',
  );
});

test('removing the fire-perimeters enum values restores every prior action argument byte for byte', () => {
  // Local ADS-B, next_satellite_pass and the analyst record layers landed
  // after every enum addition below; drop them first.
  const legacy = withoutAnalystRecordLayers(
    withoutLocalAdsb(structuredClone(VANTAGE_ACTION_SCHEMAS)).filter(
      (tool) => tool.name !== SATELLITE_PASS_TOOL,
    ),
  );
  for (const tool of legacy) {
    for (const property of Object.values(tool.parameters.properties)) {
      const values = property.enum ?? property.items?.enum;
      if (!values) continue;
      // Wind, observed weather and cyclones landed after Fire Perimeters; all
      // are additive enum values.
      const kept = values.filter(
        (key) =>
          key !== 'fire-perimeters' &&
          key !== 'wind' &&
          !OBSERVED_WEATHER_LAYERS.includes(key) &&
          key !== CYCLONES_LAYER,
      );
      if (property.enum) property.enum = kept;
      else property.items.enum = kept;
    }
  }
  assert.equal(
    createHash('sha256').update(JSON.stringify(legacy)).digest('hex'),
    '820fff21658f6907e1010b2b79c5431a77f4e34afd2277d62d8de46c368b6f8c',
  );
});

test('removing the wind enum values restores every prior action argument byte for byte', () => {
  // Local ADS-B, next_satellite_pass and the analyst record layers landed
  // after every enum addition below; drop them first.
  const legacy = withoutAnalystRecordLayers(
    withoutLocalAdsb(structuredClone(VANTAGE_ACTION_SCHEMAS)).filter(
      (tool) => tool.name !== SATELLITE_PASS_TOOL,
    ),
  );
  for (const tool of legacy) {
    for (const property of Object.values(tool.parameters.properties)) {
      const values = property.enum ?? property.items?.enum;
      if (!values) continue;
      // Observed weather and cyclones landed after Wind; all are additive
      // enum values.
      const kept = values.filter(
        (key) =>
          key !== 'wind' &&
          !OBSERVED_WEATHER_LAYERS.includes(key) &&
          key !== CYCLONES_LAYER,
      );
      if (property.enum) property.enum = kept;
      else property.items.enum = kept;
    }
  }
  assert.equal(
    createHash('sha256').update(JSON.stringify(legacy)).digest('hex'),
    '43f32f6a51a006bd0c09eed1ee9300e0f0bc1695cbee74bd2569eef29a599f44',
  );
});

test('removing the observed-weather enum values restores every prior action argument byte for byte', () => {
  // Local ADS-B, next_satellite_pass and the analyst record layers landed
  // after every enum addition below; drop them first.
  const legacy = withoutAnalystRecordLayers(
    withoutLocalAdsb(structuredClone(VANTAGE_ACTION_SCHEMAS)).filter(
      (tool) => tool.name !== SATELLITE_PASS_TOOL,
    ),
  );
  for (const tool of legacy) {
    for (const property of Object.values(tool.parameters.properties)) {
      const values = property.enum ?? property.items?.enum;
      if (!values) continue;
      // Cyclones landed after observed weather; both are additive enum values.
      const kept = values.filter(
        (key) =>
          !OBSERVED_WEATHER_LAYERS.includes(key) && key !== CYCLONES_LAYER,
      );
      if (property.enum) property.enum = kept;
      else property.items.enum = kept;
    }
  }
  assert.equal(
    createHash('sha256').update(JSON.stringify(legacy)).digest('hex'),
    '926f6ea461b4f00bdc74d0baa1c6a4b825fc446a25e40180f43f71b5593d11b6',
  );
});

test('removing the weather-cyclones enum value restores every prior action argument byte for byte', () => {
  // Local ADS-B, next_satellite_pass and the analyst record layers landed
  // after every enum addition below; drop them first.
  const legacy = withoutAnalystRecordLayers(
    withoutLocalAdsb(structuredClone(VANTAGE_ACTION_SCHEMAS)).filter(
      (tool) => tool.name !== SATELLITE_PASS_TOOL,
    ),
  );
  for (const tool of legacy) {
    for (const property of Object.values(tool.parameters.properties)) {
      const values = property.enum ?? property.items?.enum;
      if (!values) continue;
      const kept = values.filter((key) => key !== CYCLONES_LAYER);
      if (property.enum) property.enum = kept;
      else property.items.enum = kept;
    }
  }
  assert.equal(
    createHash('sha256').update(JSON.stringify(legacy)).digest('hex'),
    'e9c51a05c7db14714674bd4aad0987060b057d1e2eb326e7ec505ce151370e5c',
  );
});

test('removing the next_satellite_pass tool restores every prior action argument byte for byte', () => {
  // Local ADS-B and the analyst record layers landed after the tool; drop
  // them first.
  const legacy = withoutAnalystRecordLayers(
    withoutLocalAdsb(structuredClone(VANTAGE_ACTION_SCHEMAS)).filter(
      (tool) => tool.name !== SATELLITE_PASS_TOOL,
    ),
  );
  assert.equal(
    createHash('sha256').update(JSON.stringify(legacy)).digest('hex'),
    '14ea4fa18b10e9613ab7ad03244193ac32e56118ff46490d79262759ef1f21d0',
  );
});

test('removing the analyst record layers restores every prior action argument byte for byte', () => {
  // Local ADS-B landed after the analyst record layers; drop it first.
  const legacy = withoutAnalystRecordLayers(
    withoutLocalAdsb(structuredClone(VANTAGE_ACTION_SCHEMAS)),
  );
  assert.equal(
    createHash('sha256').update(JSON.stringify(legacy)).digest('hex'),
    'b70d195f0c142a8efb9f7436f8c4951e8ead1786a98774778daa5d83c6990e37',
  );
});

test('removing the local-adsb enum value restores every prior action argument byte for byte', () => {
  const legacy = withoutLocalAdsb(structuredClone(VANTAGE_ACTION_SCHEMAS));
  assert.equal(
    createHash('sha256').update(JSON.stringify(legacy)).digest('hex'),
    'd5667652308a2d12ef966fe4c3ae0c1cdb2665418a5788690093596720521146',
  );
});

test('descriptions customize wording without changing immutable shared arguments', () => {
  const descriptions = {
    fly_to_location: {
      description: 'Navigate',
      parameters: { properties: { query: { description: 'A place' } } },
    },
  };
  const tools = createActionTools(descriptions);
  const tool = tools.find((tool) => tool.name === 'fly_to_location');
  assert.equal(tool.description, 'Navigate');
  assert.equal(tool.parameters.properties.query.description, 'A place');
  assert.equal(tool.parameters.properties.query.type, 'string');
  tool.parameters.properties.query.type = 'number';
  assert.equal(
    createActionTools()[0].parameters.properties.query.type,
    'string',
  );
  assert.throws(() => {
    VANTAGE_ACTION_SCHEMAS[0].parameters.properties.query.type = 'number';
  }, TypeError);
  assert.equal(
    JSON.stringify(VANTAGE_ACTION_SCHEMAS).includes('"description"'),
    false,
  );
});

test('metadata cannot add tools, fields, types or enum values', () => {
  for (const descriptions of [
    { execute_shell: { description: 'not an action' } },
    {
      fly_to_location: {
        parameters: { properties: { description: 'new field' } },
      },
    },
    { fly_to_location: { $position: -1, description: 'invalid position' } },
    { fly_to_location: { name: 'other' } },
    {
      fly_to_location: {
        parameters: { properties: { arbitrary: { description: 'new field' } } },
      },
    },
    {
      fly_to_location: {
        parameters: { properties: { query: { type: 'number' } } },
      },
    },
    { fly_to_location: { parameters: { required: { 0: 'another' } } } },
    { fly_to_location: { description: { nested: 'invalid' } } },
  ])
    assert.throws(() => createActionTools(descriptions), TypeError);
});
