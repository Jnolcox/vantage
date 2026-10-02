// CHANGELOG — every released version has a Keep a Changelog entry.
//
// package.json is the only version source (see docs/RELEASING.md). These
// cases fail when a version is bumped without cutting its CHANGELOG.md
// section and link reference, so a tag can never point at an undocumented
// release.
//
// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const REPOSITORY = 'https://github.com/Jnolcox/vantage';
const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
const { version } = JSON.parse(
  readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
);
const escaped = version.replaceAll('.', '\\.');

test('the changelog keeps an Unreleased section above the releases', () => {
  const unreleased = changelog.indexOf('\n## [Unreleased]\n');
  const current = changelog.indexOf(`\n## [${version}] - `);
  assert.ok(unreleased >= 0, 'missing ## [Unreleased]');
  assert.ok(current > unreleased, 'Unreleased must come before the release');
});

test('the changelog has a dated section for the package.json version', () => {
  const heading = changelog.match(
    new RegExp(`^## \\[${escaped}\\] - (\\d{4}-\\d{2}-\\d{2})$`, 'm'),
  );
  assert.ok(heading, `missing "## [${version}] - YYYY-MM-DD" in CHANGELOG.md`);
  const date = new Date(`${heading[1]}T00:00:00Z`);
  assert.equal(date.toISOString().slice(0, 10), heading[1]);
});

test('the current version section is not empty', () => {
  const start = changelog.indexOf(`\n## [${version}] - `);
  const end = changelog.indexOf('\n## ', start + 1);
  const section = changelog.slice(start, end < 0 ? undefined : end);
  assert.match(
    section,
    /^### (Added|Changed|Deprecated|Removed|Fixed|Security)$/m,
  );
});

test('the current version links to its comparison on the repository', () => {
  assert.match(
    changelog,
    new RegExp(
      `^\\[${escaped}\\]: ${REPOSITORY}/compare/\\S+\\.\\.\\.v${escaped}$`,
      'm',
    ),
  );
});

test('Unreleased compares the current version tag with HEAD', () => {
  assert.ok(
    changelog.includes(
      `\n[Unreleased]: ${REPOSITORY}/compare/v${version}...HEAD\n`,
    ),
  );
});
