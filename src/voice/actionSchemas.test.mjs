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
  // Re-derived for the additive `fire-perimeters`, `wind` and observed-weather
  // layer enum values.
  assert.equal(
    digest,
    'c036d3d3bb9a5c86c640a23c966fe4c4b3ca3f073f06f0c43ab7f87c302c7812',
  );
});

test('removing the fire-perimeters enum values restores every prior action argument byte for byte', () => {
  const legacy = structuredClone(VANTAGE_ACTION_SCHEMAS);
  for (const tool of legacy) {
    for (const property of Object.values(tool.parameters.properties)) {
      const values = property.enum ?? property.items?.enum;
      if (!values) continue;
      // Wind and observed weather landed after Fire Perimeters; all are
      // additive enum values.
      const kept = values.filter(
        (key) =>
          key !== 'fire-perimeters' &&
          key !== 'wind' &&
          !OBSERVED_WEATHER_LAYERS.includes(key),
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
  const legacy = structuredClone(VANTAGE_ACTION_SCHEMAS);
  for (const tool of legacy) {
    for (const property of Object.values(tool.parameters.properties)) {
      const values = property.enum ?? property.items?.enum;
      if (!values) continue;
      // Observed weather landed after Wind; both are additive enum values.
      const kept = values.filter(
        (key) => key !== 'wind' && !OBSERVED_WEATHER_LAYERS.includes(key),
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
  const legacy = structuredClone(VANTAGE_ACTION_SCHEMAS);
  for (const tool of legacy) {
    for (const property of Object.values(tool.parameters.properties)) {
      const values = property.enum ?? property.items?.enum;
      if (!values) continue;
      const kept = values.filter(
        (key) => !OBSERVED_WEATHER_LAYERS.includes(key),
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
