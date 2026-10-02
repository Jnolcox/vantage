// PACKAGE VERSION — package.json is the only place a release sets the version.
//
// src/sources/version.js is generated from it so runtime code can announce the
// version without importing package.json. These cases fail when the generated
// module drifts, e.g. after package.json was edited by hand without running
// `npm version` or scripts/sync-version.mjs.
//
// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKAGE_VERSION } from './version.js';
import {
  VERSION_MODULE,
  renderVersionModule,
} from '../../scripts/sync-version.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function packageVersion() {
  return JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    .version;
}

test('package.json carries a semantic version', () => {
  assert.match(packageVersion(), SEMVER);
});

test('the generated version module exports the package.json version', () => {
  assert.equal(PACKAGE_VERSION, packageVersion());
});

test('the version module is exactly what sync-version generates', () => {
  assert.equal(
    readFileSync(path.join(ROOT, VERSION_MODULE), 'utf8'),
    renderVersionModule(packageVersion()),
  );
});

test('npm version regenerates the version module and stages it', () => {
  const { scripts } = JSON.parse(
    readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
  );
  assert.equal(
    scripts.version,
    `node scripts/sync-version.mjs && git add ${VERSION_MODULE}`,
  );
});
