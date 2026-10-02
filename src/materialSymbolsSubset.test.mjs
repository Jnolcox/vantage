import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = path.resolve(SRC_ROOT, '..');
const INDEX_HTML = path.join(REPO_ROOT, 'index.html');
const GLYPHS_FILE = path.join(SRC_ROOT, 'ui/materialSymbolsGlyphs.json');
const FONTS_DIR = path.join(REPO_ROOT, 'public/fonts');
const FONTS_STYLESHEET = path.join(FONTS_DIR, 'fonts.css');

/** The glyph written as element text: `<span class="material-symbols-outlined">radar</span>`. */
const SPAN_TEXT =
  /class="[^"]*material-symbols-outlined[^"]*"[^>]*>\s*([a-z0-9_]+)\s*</g;
/** A whole `textContent =` statement, across lines, so a multi-line ternary is read once. */
const TEXT_ASSIGNMENT = /(?:textContent|innerText)\s*=\s*([^;]{0,400})/gs;
const STRING_LITERAL = /['"`]([a-z0-9_]{2,})['"`]/g;

/**
 * Files that SHIP markup. Tests assert on markup, they do not render it.
 *
 * The panel markup lives in `src/ui/templates/*.html`, so HTML under `src` is
 * read as well: a glyph named only in a template is still a glyph the font has
 * to carry.
 */
function sourceFiles(directory = SRC_ROOT) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(absolute));
    else if (
      entry.isFile() &&
      /\.(js|mjs|html)$/.test(entry.name) &&
      !entry.name.endsWith('.test.mjs')
    ) {
      files.push(absolute);
    }
  }
  return [...files.sort(), INDEX_HTML];
}

/**
 * Glyph names the sources ask the icon font for.
 *
 * Errs WIDE on purpose. A name the font does not carry costs nothing — Google
 * ignores an unknown `icon_names` entry when the subset is fetched — while a glyph
 * the subset is missing breaks the interface SILENTLY: the ligature never
 * forms, so the element renders the literal word `right_panel_open` instead of
 * falling back to a visible box.
 *
 * A literal to the LEFT of a `?` is the condition being tested, not the text
 * being shown, so it is dropped: `status === 'loading' ? …` must not enrol
 * `loading`. Optional chaining is neutralised first — `payload?.newsStatus`
 * is not a ternary, and splitting on its `?` would keep the condition.
 * @returns {Map<string, string>} glyph -> the first file that names it.
 */
function referencedGlyphs() {
  const found = new Map();
  for (const file of sourceFiles()) {
    const source = readFileSync(file, 'utf8');
    const relative = path.relative(REPO_ROOT, file).split(path.sep).join('/');
    const add = (glyph) => {
      if (!found.has(glyph)) found.set(glyph, relative);
    };
    for (const match of source.matchAll(SPAN_TEXT)) add(match[1]);
    for (const match of source.matchAll(TEXT_ASSIGNMENT)) {
      const statement = match[1].replaceAll('?.', '.');
      const assigned = statement.includes('?')
        ? statement.slice(statement.indexOf('?') + 1)
        : statement;
      for (const literal of assigned.matchAll(STRING_LITERAL)) add(literal[1]);
    }
  }
  return found;
}

/** The glyph list the self-hosted icon font is subset to. */
function subsettedGlyphs() {
  return JSON.parse(readFileSync(GLYPHS_FILE, 'utf8'));
}

test('every glyph the sources render is in the icon font subset', () => {
  const subset = new Set(subsettedGlyphs());
  const missing = [...referencedGlyphs()]
    .filter(([glyph]) => !subset.has(glyph))
    .map(([glyph, file]) => `${glyph} (${file})`);

  assert.deepEqual(
    missing,
    [],
    'Glyphs named by the sources but absent from src/ui/materialSymbolsGlyphs.json. ' +
      'Add them there and run `npm run fonts:fetch` — an unlisted glyph renders ' +
      'as its own name on screen: ' +
      missing.join(', '),
  );
});

test('the glyph list is sorted and unique, as the subsetting API requires', () => {
  const glyphs = subsettedGlyphs();
  assert.deepEqual(glyphs, [...new Set(glyphs)].sort());
});

test('the committed icon font was generated from the current glyph list', () => {
  const stylesheet = readFileSync(FONTS_STYLESHEET, 'utf8');
  const recorded = /material-symbols icon_names: ([a-z0-9_,]+)/.exec(
    stylesheet,
  );
  assert.ok(recorded, 'public/fonts/fonts.css must record its icon_names');
  assert.deepEqual(
    recorded[1].split(','),
    subsettedGlyphs(),
    'public/fonts/ is stale; run `npm run fonts:fetch` and commit the result',
  );
});

test('every font the stylesheet names is committed under public/fonts', () => {
  const stylesheet = readFileSync(FONTS_STYLESHEET, 'utf8');
  const sources = [...stylesheet.matchAll(/url\(([^)]+)\)/g)].map(
    (match) => match[1],
  );
  assert.ok(sources.length > 0, 'public/fonts/fonts.css declares no fonts');
  for (const source of sources) {
    assert.match(source, /^\/fonts\/[a-z0-9-]+\.woff2$/);
    assert.ok(
      existsSync(path.join(FONTS_DIR, path.basename(source))),
      `${source} is missing`,
    );
  }
});

test('icon ligatures stay hidden until the icon font loads and use the standard feature switch', () => {
  const stylesheet = readFileSync(FONTS_STYLESHEET, 'utf8');
  const iconFace =
    /@font-face\s*\{[^}]*'Material Symbols Outlined'[^}]*\}/.exec(stylesheet);
  assert.ok(iconFace, 'public/fonts/fonts.css declares no icon font');
  assert.match(iconFace[0], /font-display: block;/);
  const iconClass = /\.material-symbols-outlined\s*\{[^}]*\}/.exec(stylesheet);
  assert.ok(iconClass, 'public/fonts/fonts.css declares no icon class');
  assert.match(iconClass[0], /^\s*font-feature-settings: 'liga';$/m);
});

test('index.html loads the self-hosted fonts', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');
  assert.match(html, /<link rel="stylesheet" href="\/fonts\/fonts\.css" \/>/);
});

test('page loads never contact Google Fonts', () => {
  const pages = [
    readFileSync(INDEX_HTML, 'utf8'),
    readFileSync(FONTS_STYLESHEET, 'utf8'),
  ];
  for (const page of pages) {
    assert.doesNotMatch(page, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  }
});

test('the unused Material Icons Round family is not loaded', () => {
  // A second icon font, 173 kB, for a family no source ever uses — and
  // src/cockpitMarkup.test.mjs already asserts the markup must not use it.
  for (const file of [INDEX_HTML, FONTS_STYLESHEET]) {
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /Material[+ ]Icons[+ ]Round/,
      `${path.basename(file)} loads an icon font nothing renders`,
    );
  }
});
