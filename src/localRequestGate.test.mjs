import assert from 'node:assert/strict';
import test from 'node:test';
import { PROXY_SIGNALS, hasProxySignals } from './localRequestGate.mjs';

test('PROXY_SIGNALS names every reverse-proxy and CDN forwarding header', () => {
  assert.deepEqual(
    [...PROXY_SIGNALS],
    [
      'forwarded',
      'via',
      'x-forwarded-for',
      'x-forwarded-host',
      'x-forwarded-port',
      'x-forwarded-proto',
      'x-real-ip',
      'cf-connecting-ip',
      'cf-ray',
    ],
  );
});

test('hasProxySignals is true when any forwarding header carries a value', () => {
  for (const name of PROXY_SIGNALS) {
    assert.equal(hasProxySignals({ [name]: '203.0.113.7' }), true, name);
  }
});

test('hasProxySignals ignores blank forwarding headers and unrelated headers', () => {
  assert.equal(hasProxySignals({}), false);
  assert.equal(hasProxySignals(undefined), false);
  assert.equal(hasProxySignals({ 'x-forwarded-for': '   ' }), false);
  assert.equal(
    hasProxySignals({
      host: 'localhost:5173',
      origin: 'http://localhost:5173',
    }),
    false,
  );
});
