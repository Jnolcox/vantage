import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VOICE_VIEW_IMAGE_STORAGE_KEY,
  readStoredViewImageSharing,
  writeStoredViewImageSharing,
} from './realtimePreferences.js';
import { RealtimeViewport } from './realtimeViewport.js';
import { syncViewImageButton } from './realtimeSession.js';

function memoryStorage(values = {}) {
  const map = new Map(Object.entries(values));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

test('voice view screenshots stay on until the viewer turns them off', () => {
  assert.equal(readStoredViewImageSharing(memoryStorage()), true);
  const storage = memoryStorage();
  assert.equal(writeStoredViewImageSharing(false, storage), false);
  assert.equal(storage.map.get(VOICE_VIEW_IMAGE_STORAGE_KEY), 'off');
  assert.equal(readStoredViewImageSharing(storage), false);
  writeStoredViewImageSharing(true, storage);
  assert.equal(readStoredViewImageSharing(storage), true);
});

test('blocked storage keeps the default and never throws', () => {
  const blocked = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  assert.equal(readStoredViewImageSharing(blocked), true);
  assert.equal(writeStoredViewImageSharing(false, blocked), false);
});

test('a turn sends no viewport image when capture yields none', async () => {
  const sent = [];
  let captures = 0;
  const viewport = new RealtimeViewport({
    readChannel: () => ({ readyState: 'open' }),
    capture: () => {
      captures += 1;
      return null;
    },
    operations: { sendRealtimeEvent: (event) => sent.push(event) },
  });
  const result = {
    action: 'get_entity_context',
    scene: { basemap: { viewScale: 'local' } },
  };
  assert.equal(await viewport.sendVisualContextIfUseful(result), false);
  assert.equal(captures, 1, 'a local view asks for an image');
  assert.deepEqual(sent, []);
});

test('the VIEW toggle states what is sent to OpenAI', () => {
  const attributes = {};
  const button = { setAttribute: (name, value) => (attributes[name] = value) };
  syncViewImageButton(button, true);
  assert.equal(attributes['aria-pressed'], 'true');
  assert.equal(button.textContent, 'VIEW');
  assert.match(button.title, /screenshot of the current view, sent to OpenAI/);
  syncViewImageButton(button, false);
  assert.equal(attributes['aria-pressed'], 'false');
  assert.equal(button.textContent, 'NO VIEW');
  assert.match(button.title, /sends no screenshot/);
});
