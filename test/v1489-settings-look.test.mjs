// 14.89: Settings look cleanup. One Background row (no repeated Quick looks) and an even accent grid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
const set = read('js/views/settings.js'), css = read('css/extras.css');

test('Quick looks is gone from Settings, CSS and theme.js; Background and Accent remain', () => {
  assert.ok(!/Quick looks|data-act="look"|A\.look =|LOOKS/.test(set));
  assert.ok(!/\.looks \{|\.look \{|\.look\[/.test(css));
  assert.ok(!/LOOKS/.test(read('js/theme.js')));
  assert.match(set, /aria-label="Background style"/); assert.match(set, /aria-label="Accent colour"/);
});

test('the accent swatches (13 + the picker = 14) lay out as an even 7-column grid with room for the selected ring', async () => {
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
  const { ACC } = await import('../public/js/theme.js');
  assert.equal(Object.keys(ACC).length + 1, 14);
  assert.match(set, /class="chips accs" role="radiogroup" aria-label="Accent colour"/);
  assert.match(css, /\.chips\.accs \{ display: grid; grid-template-columns: repeat\(7, minmax\(0, 1fr\)\);[^}]*padding: 5px;/);
  assert.match(css, /\.sgrp \.accs \.swatch \{ width: 100%; max-width: 40px; height: auto; aspect-ratio: 1; \}/);
});
