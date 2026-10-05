import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGoogleTokenSource,
  GOOGLE_TOKEN_PATH,
  startupGoogleTokenSource,
} from './googleTokens.js';

function server(answers) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url) => {
      calls.push(url);
      const answer = answers.shift();
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

const offer = (accessToken, expiresAt) =>
  Response.json({ accessToken, expiresAt });

test('a token is reused until shortly before it expires', async () => {
  let now = 1_000_000;
  const { calls, fetchImpl } = server([
    offer('first', now + 900_000),
    offer('second', now + 1_800_000),
  ]);
  const tokens = createGoogleTokenSource({ fetchImpl, now: () => now });
  assert.equal(await tokens.token(), 'first');
  assert.equal(await tokens.token(), 'first');
  assert.deepEqual(calls, [GOOGLE_TOKEN_PATH]);
  now += 850_000;
  assert.equal(await tokens.token(), 'second');
  assert.equal(calls.length, 2);
});

test('requests refused for the same token renew it once', async () => {
  const now = 1_000_000;
  const { calls, fetchImpl } = server([
    offer('first', now + 900_000),
    offer('second', now + 900_000),
  ]);
  const tokens = createGoogleTokenSource({ fetchImpl, now: () => now });
  await tokens.token();
  const renewed = await Promise.all([
    tokens.token({ replacing: 'first' }),
    tokens.token({ replacing: 'first' }),
  ]);
  assert.deepEqual(renewed, ['second', 'second']);
  assert.equal(await tokens.token({ replacing: 'first' }), 'second');
  assert.equal(calls.length, 2);
});

test('a server that does not offer tokens yields none', async () => {
  for (const answer of [
    new Response('Not found', { status: 404 }),
    new Response('<!doctype html>', { status: 200 }),
    Response.json({ accessToken: '', expiresAt: Date.now() + 60_000 }),
    Response.json({ accessToken: 'stale', expiresAt: 1 }),
    new TypeError('offline'),
  ]) {
    const { fetchImpl } = server([answer]);
    assert.equal(await createGoogleTokenSource({ fetchImpl }).token(), null);
  }
});

test('a page whose server offers no tokens creates no token source', () => {
  let created = 0;
  const createSource = () => ++created;
  assert.equal(
    startupGoogleTokenSource({ serverOffersTokens: false, createSource }),
    null,
  );
  assert.equal(startupGoogleTokenSource({ createSource }), null);
  assert.equal(created, 0);
});

test('a browser key leaves the token source unused', () => {
  let created = 0;
  const source = startupGoogleTokenSource({
    googleApiKey: 'browser-key',
    serverOffersTokens: true,
    createSource: () => ++created,
  });
  assert.equal(source, null);
  assert.equal(created, 0);
});

test('without a key, a server that offers tokens gets a token source', () => {
  const source = { token: async () => 'short-lived' };
  assert.equal(
    startupGoogleTokenSource({
      googleApiKey: '  ',
      serverOffersTokens: true,
      createSource: () => source,
    }),
    source,
  );
});
