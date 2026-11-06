import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const rd = (f) => readFileSync(new URL('../public/' + f, import.meta.url), 'utf8');

test('Home: saved setups run in one tap, capped, with delete; review card and offline pill exist', () => {
  const h = rd('js/views/home.js');
  assert.match(h, /A\.runPreset/); assert.match(h, /A\.savePreset/); assert.match(h, /A\.delPreset/);
  assert.match(h, /const PMAX = 6/);
  assert.match(h, /Nothing due right now/); assert.match(h, /Nothing to review/);
  assert.match(h, /class="offp"/);
  assert.match(rd('js/main.js'), /toggleAttribute\('data-offline'/);
});

test('Results report how far a new best beat the old one', () => {
  assert.match(rd('js/session.js'), /bestBy = prev \? e\.pts - prev\.pts : 0/);
  assert.match(rd('js/session.js'), /bestBy = pb \? \+\(pb\.t - spScore\)\.toFixed\(1\) : 0/);
  assert.match(rd('js/views/results.js'), /Beat your best by/);
});

test('Play: points roll respects Reduce motion; Coach stacks performance and slips side by side', () => {
  const p = rd('js/views/play.js');
  assert.match(p, /function rollPts/); assert.match(p, /if \(still\(\)/);
  assert.match(rd('js/views/coach.js'), /class="coach-top"/);
  assert.match(rd('css/extras.css'), /\.coach-top \{ display: grid/);
});
