// OUTBOUND IDENTITY — what every third-party upstream is told about the caller.
//
// Usage policies (OSM/Overpass, Nominatim, CelesTrak, OVapi) ask clients to
// name the application and give a contact point. These cases pin that every
// server-side User-Agent comes from one identity module, names this fork, and
// never points at another project.
//
// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROJECT_URL,
  PROJECT_USER_AGENT,
  PROJECT_VERSION,
  clientUserAgent,
} from './projectIdentity.js';
import { OVERPASS_USER_AGENT } from '../../server/providers/overpass/constants.js';
import { RADIO_USER_AGENT } from '../../server/providers/radio/constants.js';
import { CCTV_USER_AGENT } from '../../server/providers/cctv/constants.js';
import { transitUpstreamHeaders } from '../data/transitProxy.js';

const FORK_URL = 'https://github.com/Jnolcox/gods-eye-view';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

test('the project points every upstream at the fork', () => {
  assert.equal(PROJECT_URL, FORK_URL);
});

test('the announced version is the package version', () => {
  const { version } = JSON.parse(
    readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
  );
  assert.equal(PROJECT_VERSION, version);
});

test('the application User-Agent names the application, its version and the fork', () => {
  assert.equal(
    PROJECT_USER_AGENT,
    `gods-eye-view/${PROJECT_VERSION} (+${FORK_URL})`,
  );
});

test('a client User-Agent names the proxy client and the fork', () => {
  assert.equal(
    clientUserAgent('cctv-proxy'),
    `gods-eye-view-cctv-proxy/1.0 (+${FORK_URL})`,
  );
});

test('every exported outbound User-Agent carries the fork URL and no upstream owner', () => {
  const agents = {
    overpass: OVERPASS_USER_AGENT,
    radio: RADIO_USER_AGENT,
    cctv: CCTV_USER_AGENT,
    transit: transitUpstreamHeaders(null)['User-Agent'],
  };
  for (const [client, agent] of Object.entries(agents)) {
    assert.ok(agent.includes(FORK_URL), `${client}: ${agent}`);
    assert.doesNotMatch(agent, /bilawalsidhu/i, client);
    assert.doesNotMatch(agent, /Mozilla|Chrome|Safari/, client);
  }
});

/** Runtime server modules plus the browser-safe transit proxy. */
function outboundSourceFiles() {
  const files = [path.join(ROOT, 'src/data/transitProxy.js')];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (/\.m?js$/.test(entry.name) && !entry.name.includes('.test.'))
        files.push(absolute);
    }
  };
  visit(path.join(ROOT, 'server'));
  return files;
}

test('no server-side request hard-codes its User-Agent instead of using the identity module', () => {
  const literal = /['"]User-Agent['"]\s*:\s*['"`]/;
  const offenders = outboundSourceFiles()
    .filter((file) => literal.test(readFileSync(file, 'utf8')))
    .map((file) => path.relative(ROOT, file));
  assert.deepEqual(offenders, []);
});

test('no server-side module identifies itself as the upstream project', () => {
  const offenders = outboundSourceFiles()
    .filter((file) => /bilawalsidhu/i.test(readFileSync(file, 'utf8')))
    .map((file) => path.relative(ROOT, file));
  assert.deepEqual(offenders, []);
});
