import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const rd = (f) => readFileSync(new URL('../public/' + f, import.meta.url), 'utf8');
const css = rd('css/extras.css'), home = rd('js/views/home.js'), coach = rd('js/views/coach.js');

test('Home streak pill keeps its full words for screen readers and shortens visibly on phones', () => {
  assert.match(home, /class=\\"sl\\">-day streak<\/span><span class=\\"ss\\" aria-hidden=\\"true\\">d<\/span>|class="sl">-day streak<\/span><span class="ss" aria-hidden="true">d<\/span>/);
  assert.match(css, /\.home-hd \.meta \{ flex-wrap: nowrap;/);
  assert.match(css, /\.home-hd \.streak \.sl \{ position: absolute;/);   // visually hidden, still read aloud
  assert.match(css, /\.streak \.ss \{ display: none; \}/);                // the short form is phone-only
});

test('Coach shows skill ratings as bars and slips as bars, and no longer prints them as a comma list', () => {
  assert.match(coach, /const skillBars = /); assert.match(coach, /const slipList = /);
  assert.match(coach, /\$\{skillBars\(\)\}/); assert.match(coach, /\$\{slipList\(\)\}/);
  assert.doesNotMatch(coach, /esc\(summary\.skillsList\)/);
  assert.match(css, /\.cskills \{ grid-template-columns: max-content/);   // one set of columns, so bars line up
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.trk > i \{ animation: none/);
});
