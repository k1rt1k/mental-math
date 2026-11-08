// 14.77: ring glyph fit, empty chart states, run-bar starting fill, path result and mastery entrances.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(new URL('../public/' + f, import.meta.url), 'utf8');

test('three-character path glyphs (mod, 0.5) get the smaller ring size', () => {
  const p = read('js/views/paths.js'), c = read('css/extras.css');
  assert.match(p, /g\.replace\(\/\\s\/g, ''\)\.length >= 3 \? ' class="g3"'/);
  assert.equal((p.match(/\$\{gly\(k\)\}/g) || []).length, 3, 'all three rings use the helper');
  assert.doesNotMatch(p, /<b>\$\{GLYPH\[k\]/);
  assert.match(c, /\.pring b\.g3 \{ font-size: 12px/);
  assert.match(c, /\.pring\.lg b\.g3 \{ font-size: 15px/);
});

test('trend charts show a state, not an empty line, until there is something to draw', async () => {
  // charts.js wires pointer listeners at load time; give it just enough of a document to do that
  const noop = () => {};
  globalThis.document ||= { addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], documentElement: { dataset: {} } };
  globalThis.addEventListener ||= noop; globalThis.matchMedia ||= () => ({ matches: false, addEventListener: noop });
  globalThis.localStorage ||= { getItem: () => null, setItem: noop, removeItem: noop };
  const { spark, bars } = await import('../public/js/charts.js');
  assert.match(spark([], '#fff'), /Needs more sessions/);
  assert.match(spark([400], '#fff'), /1 of 3 so far/);
  assert.match(spark([400, 410], '#fff'), /2 of 3 so far/);
  assert.match(spark([400, 400, 400], '#fff'), /No change yet/);
  assert.match(spark([400, 400, 400], '#fff', { unit: '%' }), /Steady at 400% over 3 sessions/);
  const real = spark([400, 420, 410], '#fff');
  assert.doesNotMatch(real, /chwait/);
  assert.match(real, /class="sp ix"/);
  const days = ['2026-11-01', '2026-11-02', '2026-11-03'];
  assert.match(bars([0, 0, 0], '#fff', days), /No answers yet/);
  assert.doesNotMatch(bars([0, 4, 0], '#fff', days), /chwait/);
});

test('the run progress bar starts with a small fill, and aria-valuenow stays honest', () => {
  const p = read('js/views/play.js');
  assert.match(p, /<i id="pb" style="width:4%/);
  assert.match(p, /Math\.max\(4, w\) \+ '%'; pw\.setAttribute\('aria-valuenow', w\); \}/);   // the block must close before the trailing comment
});

test('Learn-path result, placement and mastery screens count up and play an entrance', () => {
  const m = read('js/motion.js'), p = read('js/views/paths.js'), c = read('css/extras.css');
  assert.match(m, /\.pscore b, \.pmstats b/);
  assert.match(p, /import \{[^}]*\benter\b[^}]*\} from '\.\.\/nav\.js'/);
  assert.equal((p.match(/^\s*enter\(\);/gm) || []).length, 3, 'result, placement result and mastery each call enter() before they render');
  assert.match(c, /#main\.enter \.pres\.pass:not\(\.pmast\) \.pscore b \{ animation: pscorepop/);
  assert.match(c, /#main\.enter \.pres\.fail \{ animation: missnudge/);
  assert.match(c, /#main\.enter \.pmast \.pmark::after \{ animation: pmring/);
});

test('every new animation is covered by the Reduce motion blanket rules', () => {
  const s = read('css/style.css');
  assert.match(s, /\[data-motion=reduce\] \*, \[data-motion=reduce\] \*::before, \[data-motion=reduce\] \*::after \{ animation: none !important/);
  assert.match(s, /@media \(prefers-reduced-motion: reduce\) \{ \*, \*::before, \*::after \{ animation: none !important/);
});

test('notebook delete already offers Undo, and the toast waits long enough to use it', () => {
  const n = read('js/views/notebook.js'), u = read('js/ui.js');
  assert.match(n, /A\.nbDrop = .*toast\('Removed from notebook', \{ label: 'Undo'/);
  assert.match(n, /A\.clearAll = .*label: 'Undo'/);
  assert.match(u, /label \? Math\.max\(ms, 7000\) : ms/);
});
