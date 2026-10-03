// The live HLS branch of /api/cctv/media/<id>, driven through the mounted
// provider with an injected upstream: leases are required, the agency
// playlist is rewritten to same-origin segments, and a released lease can no
// longer read them.
//
// Run with: npm test   (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cctvProxy } from '../../server/providers/cctv.js';

const CAMERA = {
  id: 'hls-fixture',
  name: 'HLS fixture',
  lat: 39.16,
  lon: -75.52,
  feedType: 'hls',
  url: 'https://video.example/live/cam/playlist.m3u8',
};
const LEASE = '0b5c1f8e-3d1a-4c5e-9f00-1234567890ab';
const AGENCY_PLAYLIST =
  '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:7\n#EXTINF:2,\na.ts\n#EXTINF:2,\nb.ts\n';

function recordingResponse() {
  let finished;
  const done = new Promise((resolve) => {
    finished = resolve;
  });
  const res = {
    statusCode: 0,
    headers: {},
    body: null,
    writableEnded: false,
    writeHead(status, headers) {
      res.statusCode = status;
      res.headers = headers || {};
    },
    end(chunk) {
      res.body = chunk === undefined ? null : Buffer.from(chunk);
      res.writableEnded = true;
      finished();
    },
    on() {},
    once() {},
    off() {},
    removeListener() {},
    emit() {},
    destroy() {},
  };
  return { res, done };
}

function mount(t) {
  const before = {
    json: process.env.CCTV_SOURCES_JSON,
    file: process.env.CCTV_SOURCES_FILE,
    austin: process.env.CCTV_FORCE_AUSTIN,
  };
  process.env.CCTV_SOURCES_JSON = JSON.stringify([CAMERA]);
  process.env.CCTV_SOURCES_FILE = 'absent-source-file.json';
  process.env.CCTV_FORCE_AUSTIN = '0';
  const nativeFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    return new Response(
      String(url).endsWith('.m3u8') ? AGENCY_PLAYLIST : 'segment-bytes',
    );
  };
  let handler = null;
  let closeServer = () => {};
  cctvProxy().configureServer({
    httpServer: {
      on: (event, fn) => {
        if (event === 'close') closeServer = fn;
      },
    },
    middlewares: {
      use: (_route, fn) => {
        handler = fn;
      },
    },
  });
  t.after(async () => {
    await closeServer();
    globalThis.fetch = nativeFetch;
    for (const [name, value] of [
      ['CCTV_SOURCES_JSON', before.json],
      ['CCTV_SOURCES_FILE', before.file],
      ['CCTV_FORCE_AUSTIN', before.austin],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  const call = async (path, method = 'GET') => {
    const { res, done } = recordingResponse();
    await handler({ url: path, headers: {}, method, on() {} }, res);
    await done;
    return res;
  };
  return { call, requested };
}

test('a live HLS request without a client lease is refused', async (t) => {
  const app = mount(t);
  const res = await app.call(`/media/${CAMERA.id}`);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(app.requested, []);
});

test('the agency playlist is rewritten to same-origin leased segments', async (t) => {
  const app = mount(t);
  const res = await app.call(`/media/${CAMERA.id}?lease=${LEASE}`);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'application/vnd.apple.mpegurl');
  assert.equal(res.headers['X-CCTV-Source'], 'hls-pull');
  const playlist = res.body.toString('utf8');
  assert.match(
    playlist,
    new RegExp(
      `/api/cctv/media/${CAMERA.id}/seg_0\\.ts\\?session=[a-f0-9-]{36}&lease=${LEASE}`,
    ),
  );
  assert.doesNotMatch(playlist, /video\.example/);
});

test('a leased segment is served as MPEG-TS until its lease is released', async (t) => {
  const app = mount(t);
  const res = await app.call(`/media/${CAMERA.id}?lease=${LEASE}`);
  const session = res.headers['X-CCTV-Session'];
  const segment = `/media/${CAMERA.id}/seg_0.ts?session=${session}&lease=${LEASE}`;
  const served = await app.call(segment);
  assert.equal(served.statusCode, 200);
  assert.equal(served.headers['Content-Type'], 'video/mp2t');
  assert.equal(served.body.toString('utf8'), 'segment-bytes');
  const released = await app.call(
    `/media/${CAMERA.id}?lease=${LEASE}`,
    'DELETE',
  );
  assert.equal(released.statusCode, 204);
  assert.equal((await app.call(segment)).statusCode, 404);
});
