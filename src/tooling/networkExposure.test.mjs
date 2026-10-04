import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BIND_HOST,
  applyLanRateLimitDefaults,
  extraAllowedHosts,
  isLoopbackBindHost,
  resolveBindHost,
} from '../../server/standalone/network.js';

test('the server binds to IPv4 loopback when no host is configured', () => {
  assert.equal(DEFAULT_BIND_HOST, '127.0.0.1');
  assert.equal(resolveBindHost({}), '127.0.0.1');
  assert.equal(resolveBindHost({ VANTAGE_HOST: '  ', HOST: '' }), '127.0.0.1');
});

test('VANTAGE_HOST wins over the legacy HOST name', () => {
  assert.equal(
    resolveBindHost({ VANTAGE_HOST: '0.0.0.0', HOST: 'localhost' }),
    '0.0.0.0',
  );
  assert.equal(resolveBindHost({ HOST: '0.0.0.0' }), '0.0.0.0');
});

test('only loopback names count as a local-only bind', () => {
  for (const host of ['localhost', '127.0.0.1', '::1', '[::1]', 'LOCALHOST'])
    assert.equal(isLoopbackBindHost(host), true, host);
  for (const host of ['0.0.0.0', '::', '192.168.1.20', 'studio.local'])
    assert.equal(isLoopbackBindHost(host), false, host);
});

test('a loopback bind allows only the configured extra host names', () => {
  assert.deepEqual(extraAllowedHosts({}, '127.0.0.1', 'studio'), []);
  assert.deepEqual(
    extraAllowedHosts(
      { VANTAGE_ALLOWED_HOSTS: ' Desk.lan , ,vantage.test' },
      '127.0.0.1',
      'studio',
    ),
    ['desk.lan', 'vantage.test'],
  );
});

test('a LAN bind also allows this machine hostname', () => {
  assert.deepEqual(
    extraAllowedHosts(
      { VANTAGE_ALLOWED_HOSTS: 'desk.lan' },
      '0.0.0.0',
      'Studio',
    ),
    ['studio', 'desk.lan'],
  );
});

test('suffix and wildcard VANTAGE_ALLOWED_HOSTS entries are ignored', () => {
  assert.deepEqual(
    extraAllowedHosts(
      { VANTAGE_ALLOWED_HOSTS: '.local,*.lan,desk*,vantage.local' },
      '127.0.0.1',
      'studio',
    ),
    ['vantage.local'],
  );
});

test('a bind address given as a name is accepted as itself', () => {
  assert.deepEqual(extraAllowedHosts({}, 'Studio.lan', 'studio'), [
    'studio',
    'studio.lan',
  ]);
  assert.deepEqual(extraAllowedHosts({}, '192.168.1.20', 'studio'), ['studio']);
  assert.deepEqual(extraAllowedHosts({}, '::', 'studio'), ['studio']);
});

test('a LAN bind turns on the paid-proxy throttles when they are unset', () => {
  const env = {};
  assert.deepEqual(applyLanRateLimitDefaults(env, '0.0.0.0'), [
    'VANTAGE_RATELIMIT_OPENAI_PER_MIN=30',
    'VANTAGE_RATELIMIT_GOOGLE_PER_MIN=60',
  ]);
  assert.equal(env.VANTAGE_RATELIMIT_OPENAI_PER_MIN, '30');
  assert.equal(env.VANTAGE_RATELIMIT_GOOGLE_PER_MIN, '60');
});

test('a LAN bind keeps throttles the operator configured, including 0', () => {
  const env = {
    VANTAGE_RATELIMIT_OPENAI_PER_MIN: '0',
    VANTAGE_RATELIMIT_GOOGLE_PER_MIN: '5',
  };
  assert.deepEqual(applyLanRateLimitDefaults(env, '0.0.0.0'), []);
  assert.equal(env.VANTAGE_RATELIMIT_OPENAI_PER_MIN, '0');
  assert.equal(env.VANTAGE_RATELIMIT_GOOGLE_PER_MIN, '5');
});

test('a loopback bind leaves the throttles unlimited', () => {
  const env = {};
  assert.deepEqual(applyLanRateLimitDefaults(env, '127.0.0.1'), []);
  assert.deepEqual(env, {});
});
