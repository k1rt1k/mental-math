import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const rd = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');

test('the play progress bar does not share a class with the Progress filter row (it used to inherit margin -8px and slide under the HUD)', () => {
  const play = rd('js/views/play.js'), css = rd('css/style.css') + rd('css/extras.css');
  assert.doesNotMatch(play, /class="bar tbar pbar"/);
  assert.match(play, /id="pbw"/);
  assert.match(css, /\.play\.nt \.tbar:not\(\.qprog\)/);
  assert.match(rd('js/views/progress.js'), /class="pbar"/);   // the only owner of .pbar
});

test('Flash: equal-width choices, the page takes the playing state during a run, and Check waits for an answer', () => {
  const f = rd('js/views/flash.js'), css = rd('css/extras.css');
  assert.match(f, /class="seg eq"/);
  assert.match(f, /classList\.toggle\('playing', on\)/);
  assert.match(f, /playing\(true\)/); assert.match(f, /playing\(false\)/);
  assert.match(f, /data-act="flAns" disabled/);
  assert.match(css, /\.seg\.eq \{[^}]*grid-auto-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(f, /style="/);
});
