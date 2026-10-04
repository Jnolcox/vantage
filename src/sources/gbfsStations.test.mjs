// GBFS STATIONS — the portable station-document parsers behind the bike-share
// layer, usable without constructing the layer.
//
// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractStationsArray,
  normalizeGbfsBool,
  parseStationInformation,
  parseStationStatus,
  toNonNegativeInteger,
} from './gbfsStations.js';

test('normalizeGbfsBool reads booleans, numbers and yes/no text', () => {
  assert.equal(normalizeGbfsBool(true), true);
  assert.equal(normalizeGbfsBool(0), false);
  assert.equal(normalizeGbfsBool('no'), false);
  assert.equal(normalizeGbfsBool('YES'), true);
});

test('normalizeGbfsBool falls back for missing or unrecognized values', () => {
  assert.equal(normalizeGbfsBool(undefined, false), false);
  assert.equal(normalizeGbfsBool('maybe', true), true);
});

test('toNonNegativeInteger rounds valid counts and rejects negatives', () => {
  assert.equal(toNonNegativeInteger('4.6'), 5);
  assert.equal(toNonNegativeInteger(-1), null);
});

test('extractStationsArray finds stations nested under a locale key', () => {
  const stations = [{ station_id: 'a' }];
  assert.deepEqual(
    extractStationsArray({ data: { en: { stations } } }),
    stations,
  );
});

test('parseStationInformation skips stations without valid coordinates', () => {
  const info = parseStationInformation({
    data: {
      stations: [
        { station_id: 'a', name: 'Main St', lat: 40.7, lon: -74, capacity: 12 },
        { station_id: 'b', name: 'Nowhere', lat: 'x', lon: -74 },
      ],
    },
  });
  assert.deepEqual([...info.keys()], ['a']);
  assert.equal(info.get('a').capacity, 12);
});

test('parseStationStatus reads availability by alternate id field', () => {
  const status = parseStationStatus({
    data: [
      { id: 7, num_bikes_available: 3, num_docks_available: 9, is_renting: 0 },
    ],
  });
  const station = status.get('7');
  assert.equal(station.bikesAvailable, 3);
  assert.equal(station.docksAvailable, 9);
  assert.equal(station.isRenting, false);
});
