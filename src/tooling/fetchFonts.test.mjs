import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ICON_NAMES_MARKER,
  localizeFontFaces,
  stylesheetHeader,
  withStandardLigatures,
} from '../../scripts/fetch-fonts.mjs';

const LATIN_FACE = `/* latin */
@font-face {
  font-family: 'Inter';
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/inter/v20/latin.woff2) format('woff2');
}
`;

test('a kept subset is rewritten to a local file named for its family', () => {
  const { css, downloads } = localizeFontFaces(LATIN_FACE);

  assert.match(
    css,
    /src: url\(\/fonts\/inter-latin\.woff2\) format\('woff2'\)/,
  );
  assert.deepEqual(
    [...downloads],
    [
      [
        'https://fonts.gstatic.com/s/inter/v20/latin.woff2',
        'inter-latin.woff2',
      ],
    ],
  );
});

test('subsets outside latin and latin-ext are dropped', () => {
  const cyrillic = LATIN_FACE.replace('latin', 'cyrillic').replace(
    'latin.woff2',
    'cyrillic.woff2',
  );

  const { css, downloads } = localizeFontFaces(cyrillic);

  assert.equal(css, '');
  assert.equal(downloads.size, 0);
});

test('weights that share one variable font file download it once', () => {
  const twoWeights =
    LATIN_FACE + LATIN_FACE.replace('font-weight: 400', 'font-weight: 600');

  const { css, downloads } = localizeFontFaces(twoWeights);

  assert.equal(downloads.size, 1);
  assert.equal(css.match(/\/fonts\/inter-latin\.woff2/g).length, 2);
});

test('weights served as separate files get distinct local names', () => {
  const twoFiles =
    LATIN_FACE +
    LATIN_FACE.replace('font-weight: 400', 'font-weight: 700').replace(
      'latin.woff2',
      'latin-bold.woff2',
    );

  const { downloads } = localizeFontFaces(twoFiles);

  assert.deepEqual(
    [...downloads.values()],
    ['inter-latin.woff2', 'inter-latin-700.woff2'],
  );
});

test('a face without a subset comment keeps its family name alone', () => {
  const icons = `@font-face {
  font-family: 'Material Symbols Outlined';
  font-weight: 400;
  src: url(https://fonts.gstatic.com/l/font?kit=abc) format('woff2');
}

.material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  -webkit-font-feature-settings: 'liga';
}
`;

  const { css } = localizeFontFaces(icons);

  assert.match(css, /url\(\/fonts\/material-symbols-outlined\.woff2\)/);
  assert.match(css, /\.material-symbols-outlined \{/);
});

test('a face that is not woff2 is rejected rather than shipped', () => {
  const truetype = LATIN_FACE.replace("format('woff2')", "format('truetype')");

  assert.throws(() => localizeFontFaces(truetype), /Expected a woff2/);
});

test('the stylesheet header records the glyphs the icon font carries', () => {
  assert.ok(
    stylesheetHeader(['adjust', 'radar']).includes(
      `${ICON_NAMES_MARKER} adjust,radar`,
    ),
  );
});

test('the prefixed ligature switch gains its standard counterpart', () => {
  const css = `.material-symbols-outlined {
  -webkit-font-feature-settings: 'liga';
}
`;

  assert.equal(
    withStandardLigatures(css),
    `.material-symbols-outlined {
  -webkit-font-feature-settings: 'liga';
  font-feature-settings: 'liga';
}
`,
  );
});
