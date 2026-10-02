import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { moveLegacyDirectories } from '../server/standalone/legacy-directories.js';

function checkout() {
  return mkdtempSync(path.join(tmpdir(), 'vantage-legacy-dirs-'));
}

test('a pre-rename cache directory is moved to .vantage-cache with its contents', () => {
  const root = checkout();
  try {
    mkdirSync(path.join(root, '.gev-cache', 'tomtom'), { recursive: true });
    writeFileSync(
      path.join(root, '.gev-cache', 'tomtom', 'budget.json'),
      '{"used":10}',
    );

    const moved = moveLegacyDirectories(root, () => {});

    assert.deepEqual(moved, ['.vantage-cache']);
    assert.equal(existsSync(path.join(root, '.gev-cache')), false);
    assert.equal(
      readFileSync(
        path.join(root, '.vantage-cache', 'tomtom', 'budget.json'),
        'utf8',
      ),
      '{"used":10}',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an existing .vantage directory is never overwritten', () => {
  const root = checkout();
  try {
    mkdirSync(path.join(root, '.gev-logs'));
    mkdirSync(path.join(root, '.vantage-logs'));
    writeFileSync(path.join(root, '.vantage-logs', 'current.jsonl'), 'new');

    const moved = moveLegacyDirectories(root, () => {});

    assert.deepEqual(moved, []);
    assert.equal(
      readFileSync(path.join(root, '.vantage-logs', 'current.jsonl'), 'utf8'),
      'new',
    );
    assert.equal(existsSync(path.join(root, '.gev-logs')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a checkout without legacy directories is left untouched', () => {
  const root = checkout();
  try {
    assert.deepEqual(
      moveLegacyDirectories(root, () => {}),
      [],
    );
    assert.equal(existsSync(path.join(root, '.vantage-cache')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a root that cannot be read does not throw', () => {
  assert.doesNotThrow(() =>
    moveLegacyDirectories(
      path.join(tmpdir(), 'vantage-missing-root', '\0bad'),
      () => {},
    ),
  );
});
