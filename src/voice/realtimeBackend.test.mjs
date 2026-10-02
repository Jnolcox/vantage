import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealtimeBackend } from './realtimeBackend.js';
import { VantageRealtimeController } from './realtimeController.js';
import {
  DEBUG_LOG_URL,
  PENDING_DEBUG_LOG_LIMIT,
  RealtimeDiagnostics,
} from './realtimeDiagnostics.js';

const tokenReply = () =>
  Response.json({
    value: 'ephemeral-test',
    session: { model: 'compatible-model' },
    expires_at: Math.floor(Date.now() / 1000) + 60,
  });

test('separate configured token and SDP transports preserve model metadata and credential scope', async () => {
  const calls = [];
  const backend = createRealtimeBackend({
    tokenEndpoint: '/api/voice/token',
    callsEndpoint: 'https://voice.example/calls',
    tokenTransport: async (input, init) => {
      calls.push(input);
      assert.equal(init.method, 'POST');
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers, undefined);
      return tokenReply();
    },
    connectionTransport: async (input, init) => {
      calls.push(input);
      assert.equal(init.redirect, 'error');
      assert.equal(init.body, 'offer');
      assert.equal(init.headers.Authorization, 'Bearer ephemeral-test');
      return new Response('answer');
    },
  });
  const credential = await backend.requestToken({ tier: 'mini' });
  assert.equal(credential.model, 'compatible-model');
  assert.equal(
    await backend.negotiate({ credential, offerSdp: 'offer' }),
    'answer',
  );
  assert.deepEqual(calls, [
    '/api/voice/token?tier=mini',
    'https://voice.example/calls',
  ]);
});

test('denied tokens never negotiate or retry; reconnect requests a fresh token', async () => {
  let requests = 0;
  const backend = createRealtimeBackend({
    tokenTransport: async () => {
      requests++;
      return requests === 1
        ? Response.json({ error: 'Unavailable' }, { status: 401 })
        : tokenReply();
    },
    connectionTransport: () => assert.fail('unexpected connection'),
  });
  await assert.rejects(backend.requestToken(), /Unavailable/);
  assert.equal(requests, 1);
  assert.equal((await backend.requestToken()).token, 'ephemeral-test');
  assert.equal(requests, 2);
});

test('expired and malformed client secrets are rejected before SDP exchange', async () => {
  for (const data of [
    { value: 'test', expires_at: 1 },
    { value: {} },
    { value: 'test', expires_at: 'later' },
  ]) {
    const backend = createRealtimeBackend({
      tokenTransport: async () => Response.json(data),
    });
    await assert.rejects(backend.requestToken(), /expired|client secret/);
  }
  const backend = createRealtimeBackend({
    connectionTransport: () => assert.fail('expired token transmitted'),
  });
  await assert.rejects(
    backend.negotiate({
      credential: { token: 'test', expiresAt: 1 },
      offerSdp: 'offer',
    }),
    /expired/,
  );
});

test('cancellation rejects late token and SDP bodies without promoting a stopped connection', async () => {
  for (const phase of ['token', 'sdp']) {
    const lifetime = new AbortController();
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const backend = createRealtimeBackend({
      signal: lifetime.signal,
      tokenTransport: async () => ({ ok: true, json: () => pending }),
      connectionTransport: async () => ({ ok: true, text: () => pending }),
    });
    const result =
      phase === 'token'
        ? backend.requestToken()
        : backend.negotiate({
            credential: { token: 'test' },
            offerSdp: 'offer',
            signal: lifetime.signal,
          });
    await Promise.resolve();
    lifetime.abort();
    release(phase === 'token' ? { value: 'late' } : 'late answer');
    await assert.rejects(result, { name: 'AbortError' });
  }
});

test('controller lifetime stops pending transport and releases resources through normal teardown', () => {
  const lifetime = new AbortController();
  let stopped = 0;
  const controller = new VantageRealtimeController({
    runner: async () => ({}),
    signal: lifetime.signal,
    debugSink: null,
    ui: {
      root: { dataset: {}, querySelectorAll: () => [], remove() {} },
      status: {},
      detail: {},
    },
  });
  controller.connectionAbort = new AbortController();
  const connection = controller.connectionAbort.signal;
  controller.stream = { getTracks: () => [{ stop: () => stopped++ }] };
  lifetime.abort();
  assert.equal(connection.aborted, true);
  assert.equal(stopped, 1);
  assert.equal(controller.stream, null);
  assert.equal(controller.isActive(), false);
});

test('the token mint reports whether the server records the debug log', async () => {
  for (const [header, expected] of [
    ['1', true],
    ['0', false],
    [null, false],
  ]) {
    const backend = createRealtimeBackend({
      tokenTransport: async () => {
        const reply = tokenReply();
        if (header) reply.headers.set('X-Vantage-Debug-Log', header);
        return reply;
      },
    });
    assert.equal((await backend.requestToken()).debugLogEnabled, expected);
  }
});

test('a failed token mint still reports the server debug-log setting', async () => {
  for (const [header, expected] of [
    ['1', true],
    ['0', false],
  ]) {
    const backend = createRealtimeBackend({
      tokenTransport: async () =>
        Response.json(
          { error: 'OPENAI_API_KEY is not configured' },
          { status: 503, headers: { 'X-Vantage-Debug-Log': header } },
        ),
    });
    await assert.rejects(backend.requestToken(), (error) => {
      assert.equal(error.debugLogEnabled, expected);
      return true;
    });
  }
});

const diagnosticsWith = (debugSink) =>
  new RealtimeDiagnostics({
    readStatus: () => 'idle',
    readChannel: () => null,
    readPeer: () => null,
    readCostTracker: () => ({ state: () => ({}) }),
    debugSink,
    operations: { setStatus() {} },
  });

test('debug records wait for the server setting and flush once it is enabled', () => {
  const sent = [];
  const diagnostics = diagnosticsWith((record) => sent.push(record.event));
  diagnostics.debugLog('controller.created');
  assert.deepEqual(sent, []);
  diagnostics.setDebugLogEnabled(true);
  diagnostics.debugLog('session.token.ready');
  assert.deepEqual(sent, ['controller.created', 'session.token.ready']);
  assert.equal(diagnostics.getDiagnostics().debugLog.endpoint, DEBUG_LOG_URL);
});

test('a disabled server debug log means no record is ever beaconed', () => {
  const sent = [];
  const diagnostics = diagnosticsWith((record) => sent.push(record.event));
  diagnostics.debugLog('controller.created');
  diagnostics.setDebugLogEnabled(false);
  diagnostics.debugLog('session.token.ready');
  assert.deepEqual(sent, []);
  assert.equal(diagnostics.getDiagnostics().debugLog, null);
});

test('records held before the server setting is known stay bounded', () => {
  const sent = [];
  const diagnostics = diagnosticsWith((record) => sent.push(record.event));
  for (let n = 0; n < PENDING_DEBUG_LOG_LIMIT + 10; n += 1)
    diagnostics.debugLog(`event.${n}`);
  diagnostics.setDebugLogEnabled(true);
  assert.equal(sent.length, PENDING_DEBUG_LOG_LIMIT);
});
