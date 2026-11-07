import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const rd = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');

test('Home streak pill carries a milestone ring', () => {
  assert.match(rd('js/views/home.js'), /class="sring [^"]*" style="--p:/);
  assert.match(rd('css/extras.css'), /\.sring::before/);
});

test('extras.css is linked, precached and versioned with the service worker', () => {
  assert.match(rd('index.html'), /css\/extras\.css\?v=14\.50/);
  assert.match(rd('sw.js'), /'css\/extras\.css'/);
  assert.match(rd('sw.js'), /mm-v14-50/);
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
