import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Generated module that carries the package version into runtime code. */
export const VERSION_MODULE = 'src/sources/version.js';

/**
 * Source text of the generated version module for one package version.
 *
 * Runtime code cannot import package.json without pulling it into every
 * browser and Node boundary that announces the version, so the version is
 * copied into a one-line module instead. package.json stays the single source
 * of truth: `npm version` regenerates this file through the `version` script.
 *
 * @param {string} version Semantic version from package.json.
 * @returns {string}
 */
export function renderVersionModule(version) {
  return [
    '// Generated from package.json by scripts/sync-version.mjs. Do not edit:',
    '// `npm version` regenerates it, and a unit test fails when it drifts.',
    '',
    '/** Semantic version of this application, as published in package.json. */',
    `export const PACKAGE_VERSION = '${version}';`,
    '',
  ].join('\n');
}

/** Rewrite the version module from the package.json under `root`. */
export function syncVersionModule(root) {
  const { version } = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  );
  writeFileSync(path.join(root, VERSION_MODULE), renderVersionModule(version));
  return version;
}

const invoked = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';
if (import.meta.url === invoked) {
  const version = syncVersionModule(
    fileURLToPath(new URL('../', import.meta.url)),
  );
  console.log(`${VERSION_MODULE} now exports ${version}.`);
}
