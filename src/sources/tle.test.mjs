// TLE TEXT — the portable parser behind the satellites layer and any reader
// that needs catalog entries without loading Cesium.
//
// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTleText, tleCatalogNumber } from './tle.js';

const ISS_LINE1 =
  '1 25544U 98067A   26274.50000000  .00016717  00000-0  10270-3 0  9005';
const ISS_LINE2 =
  '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537';

test('parseTleText reads three-line blocks into named entries', () => {
  const entries = parseTleText(`ISS (ZARYA)\n${ISS_LINE1}\n${ISS_LINE2}\n`);
  assert.deepEqual(entries, [
    { name: 'ISS (ZARYA)', line1: ISS_LINE1, line2: ISS_LINE2 },
  ]);
});

test('parseTleText skips blocks whose lines are not TLE lines 1 and 2', () => {
  assert.deepEqual(parseTleText('NOT A TLE\nfoo\nbar\n'), []);
});

test('parseTleText yields no entries for an error body', () => {
  assert.deepEqual(parseTleText('<html>503</html>'), []);
});

test('tleCatalogNumber reads the NORAD number from line 1', () => {
  assert.equal(tleCatalogNumber(ISS_LINE1), 25544);
});

test('tleCatalogNumber returns null when line 1 has no catalog number', () => {
  assert.equal(tleCatalogNumber('1 ABCDE'), null);
});
