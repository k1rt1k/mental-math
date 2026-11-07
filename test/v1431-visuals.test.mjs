import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERSION as REL, CACHE } from './helpers/version.mjs';
const rd = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');

test('Home streak pill carries a milestone ring', () => {
  assert.match(rd('js/views/home.js'), /class="sring [^"]*" style="--p:/);
  assert.match(rd('css/extras.css'), /\.sring::before/);
});

test('extras.css is linked, precached and versioned with the service worker', () => {
  assert.ok(rd('index.html').includes(`css/extras.css?v=${REL}`));
  assert.match(rd('sw.js'), /'css\/extras\.css'/);
  assert.ok(rd('sw.js').includes(`'${CACHE}'`));
});

test('motion additions respect reduced motion', () => {
  const css = rd('css/extras.css');
  assert.match(css, /prefers-reduced-motion: reduce[^}]*\.okf[^}]*animation: none/s);
});

test('every original-skill answer is a whole number >= 0, so those questions need no minus or decimal key', async () => {
  const { gen, CORE } = await import('../public/js/engine.js');
  for (const k of CORE) for (let d = 0; d <= 12; d++) for (let i = 0; i < 60; i++) {
    const a = +gen(k, d).a;
    assert.ok(Number.isInteger(a) && a >= 0, k + ' ' + d + ' ' + a);
  }
});
