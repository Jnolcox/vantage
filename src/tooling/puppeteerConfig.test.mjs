import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const CONFIG = require.resolve('../../.puppeteerrc.cjs');

function loadWith(value) {
  const before = process.env.VANTAGE_QA_BROWSER;
  if (value === undefined) delete process.env.VANTAGE_QA_BROWSER;
  else process.env.VANTAGE_QA_BROWSER = value;
  try {
    delete require.cache[CONFIG];
    return require(CONFIG);
  } finally {
    if (before === undefined) delete process.env.VANTAGE_QA_BROWSER;
    else process.env.VANTAGE_QA_BROWSER = before;
  }
}

test('a plain install does not download a browser', () => {
  assert.equal(loadWith(undefined).skipDownload, true);
  assert.equal(loadWith('0').skipDownload, true);
});

test('QA opts in to the browser download explicitly', () => {
  assert.equal(loadWith('1').skipDownload, false);
});
