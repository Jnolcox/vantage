import assert from 'node:assert/strict';
import test from 'node:test';

import { readVantageEnv } from '../server/providers/common/env.js';

test('the VANTAGE_ name is read', () => {
  const warnings = [];

  const value = readVantageEnv(
    'RATELIMIT_OPENAI_PER_MIN',
    { VANTAGE_RATELIMIT_OPENAI_PER_MIN: '30' },
    (message) => warnings.push(message),
  );

  assert.equal(value, '30');
  assert.deepEqual(warnings, []);
});

test('the pre-rename GEV_ name is a fallback that warns', () => {
  const warnings = [];

  const value = readVantageEnv(
    'TEST_FALLBACK_ONE',
    { GEV_TEST_FALLBACK_ONE: '12' },
    (message) => warnings.push(message),
  );

  assert.equal(value, '12');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /GEV_TEST_FALLBACK_ONE is deprecated/);
  assert.match(warnings[0], /VANTAGE_TEST_FALLBACK_ONE/);
});

test('the deprecation warning is printed once per variable', () => {
  const warnings = [];
  const env = { GEV_TEST_FALLBACK_TWICE: '1' };

  readVantageEnv('TEST_FALLBACK_TWICE', env, (message) =>
    warnings.push(message),
  );
  readVantageEnv('TEST_FALLBACK_TWICE', env, (message) =>
    warnings.push(message),
  );

  assert.equal(warnings.length, 1);
});

test('the VANTAGE_ name wins over the GEV_ name', () => {
  const value = readVantageEnv(
    'TEST_BOTH',
    { VANTAGE_TEST_BOTH: 'new', GEV_TEST_BOTH: 'old' },
    () => assert.fail('no warning when the new name is set'),
  );

  assert.equal(value, 'new');
});

test('a blank VANTAGE_ value falls back to a set GEV_ value', () => {
  const value = readVantageEnv(
    'TEST_BLANK',
    { VANTAGE_TEST_BLANK: '', GEV_TEST_BLANK: 'old' },
    () => {},
  );

  assert.equal(value, 'old');
});

test('with neither name set the VANTAGE_ value is returned unchanged', () => {
  assert.equal(
    readVantageEnv('TEST_NONE', {}, () => {}),
    undefined,
  );
  assert.equal(
    readVantageEnv('TEST_NONE', { VANTAGE_TEST_NONE: '' }, () => {}),
    '',
  );
});
