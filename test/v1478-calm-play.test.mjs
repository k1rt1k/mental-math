// Settings to hide the session timer and the per-question line while playing (both on by default).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const r = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');

test('both switches exist, are stored inverted so the defaults stay on, and sync', () => {
  assert.match(r('js/views/settings.js'), /'noTimer', get\('noTimer'\)/);
  assert.match(r('js/views/settings.js'), /'noQLine', get\('noQLine'\)/);
  assert.match(r('js/views/settings.js'), /const INV = new Set\([^)]*'noTimer'[^)]*'noQLine'/);
  assert.match(r('js/state.js'), /'noTimer', 'noQLine'\]/);
  assert.match(r('js/infotext.js'), /'s\.noTimer'/); assert.match(r('js/infotext.js'), /'s\.noQLine'/);
});

test('the play screen reads them and hides, not removes, the elements', () => {
  const p = r('js/views/play.js');
  assert.match(p, /S\.noTimer \? ' nt'/); assert.match(p, /S\.noQLine \? ' nq'/);
  assert.match(p, /S\.noTimer \? 'Mental Math'/);   // the tab title would otherwise leak the clock
  const c = r('css/extras.css');
  assert.match(c, /\.play\.nt:not\(\.sv\) #t/);       // Survival hearts stay visible
  assert.match(c, /\.play\.nq \.qt/);
});
