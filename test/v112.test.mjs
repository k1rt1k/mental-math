// v11.2 refinement guarantees: adaptive grids, viewport fallbacks, color-mix fallbacks,
// brand/context in the icon rail, and the font licence notices.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pub = fileURLToPath(new URL('../public/', import.meta.url));
const css = readFileSync(join(pub, 'css/style.css'), 'utf8');
const main = readFileSync(join(pub, 'js/main.js'), 'utf8');
const sw = readFileSync(join(pub, 'sw.js'), 'utf8');
const util = readFileSync(join(pub, 'js/util.js'), 'utf8');
const html = readFileSync(join(pub, 'index.html'), 'utf8');

test('version and service-worker cache are 14.48 and bump together', () => {
  assert.match(util, /VERSION = '14.48'/);
  assert.match(sw, /const C = 'mm-v14-48'/);
});

test('mode and skill grids adapt instead of forcing five columns', () => {
  assert.match(css, /\.modes \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 170px\), 1fr\)\)/);
  assert.match(css, /\.skills \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 150px\), 1fr\)\)/);
  assert.ok(!/\.modes \{ display: grid; grid-template-columns: repeat\(5,/.test(css), 'no fixed five-column mode grid');
  assert.ok(!/\.skills \{ display: grid; grid-template-columns: repeat\(5,/.test(css), 'no fixed five-column skill grid');
});

test('five mode tiles lay out as three over two (6-column spans) instead of leaving an orphan', () => {
  assert.match(css, /\.home-main \{ container-type: inline-size; \}/);
  assert.match(css, /@container \(min-width: 540px\) \{\s*\.modes:not\(\.m3\) \{ grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.modes:not\(\.m3\) > \.mode:nth-child\(n\+4\) \{ grid-column: span 3/);
});

test('the insights column waits for a readable main column', () => {
  assert.match(css, /@media \(min-width: 1160px\) \{ \.home \{ grid-template-columns: minmax\(0, 1fr\) clamp\(300px, 26vw, 336px\)/);
});

test('every dvh height has a vh fallback first', () => {
  assert.match(css, /#shell \{[^}]*min-height: 100vh; min-height: 100dvh/);
  assert.match(css, /#rail \{[^}]*height: 100vh; height: 100dvh/);
  assert.match(css, /min-height: calc\(100vh[^;]+; min-height: calc\(100dvh/);
  assert.match(css, /max-height: min\(88vh, 760px\); max-height: min\(88dvh, 760px\)/);
});

test('color-mix has a late plain-colour fallback block for meaningful tints', () => {
  const i = css.indexOf('@supports not (color: color-mix(in srgb, red 50%, blue))');
  assert.ok(i > css.indexOf('.btn.primary'), 'fallback block comes after the main rules');
  for (const rule of ['--btn-top: var(--ac)', '.btn.primary { background: var(--ac)', '.hm b.l1', '.fc.fb', '.paused { background: var(--c)']) {
    assert.ok(css.slice(i).includes(rule), `fallback covers ${rule}`);
  }
  assert.ok(css.includes('@supports not ((backdrop-filter: blur(1px))'), 'opaque tab bar when blur is missing');
});

test('short landscape screens place the keypad beside the board', () => {
  assert.match(css, /@media \(max-height: 560px\) and \(orientation: landscape\) and \(max-width: 1099px\)/);
  assert.match(css, /grid-template-areas: "hud pad" "t1 pad" "t2 pad" "race pad" "board pad" "msg act" "hint hint"/);
});

test('the icon rail carries a wordmark plus streak and session context', () => {
  assert.match(main, /class="brand"/);
  assert.match(main, /class="wm">Mental Math</);
  assert.match(main, /class="railfoot"/);
  assert.match(main, /title="\$\{st \? st \+ '-day streak'/);
  assert.match(main, /sessions'} logged/);
});

test('bundled fonts ship with their SIL OFL notices', () => {
  const f = join(pub, 'fonts/OFL.txt');
  assert.ok(existsSync(f), 'fonts/OFL.txt exists');
  const t = readFileSync(f, 'utf8');
  for (const name of ['Inter', 'Fraunces', 'JetBrains Mono', 'SIL OPEN FONT LICENSE Version 1.1']) assert.ok(t.includes(name), `${name} notice`);
  assert.ok(sw.includes('fonts/OFL.txt'), 'licence is precached with the fonts');
});

test('the stylesheet is cache-busted from the page', () => {
  assert.match(html, /href="css\/style\.css\?v=14.48"/);
  assert.match(html, /fonts\/jbmono\.woff2/);
});
