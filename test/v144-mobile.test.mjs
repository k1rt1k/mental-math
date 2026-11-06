import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/css/style.css', import.meta.url), 'utf8');
const coach = readFileSync(new URL('../public/js/views/coach.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const nav = readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8');

test('mobile bottom navigation defines six non-wrapping columns', () => {
  assert.match(css, /#tabs\s*\{[^}]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /#tabs \.nv\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /#tabs \.nv > span:last-child\s*\{[^}]*white-space:\s*nowrap/s);
});

test('Coach has a dedicated mobile tab grid and contained chat layout', () => {
  assert.match(coach, /class="coach-page"/);
  assert.match(coach, /class="chips fscroll coach-tabs"/);
  assert.match(coach, /Math Tutor/);
  assert.match(css, /\.coach-page \.coach-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.chat-form \.inp\s*\{[^}]*min-width:\s*0/s);
  // v14.10: the tutor no longer hides replies in a small inner scroll box; the composer sticks above the tab bar.
  assert.match(css, /\.coach-page \.chat-stream\s*\{[^}]*max-height:\s*none/s);
  assert.match(css, /\.coach-page \.chat-form\s*\{[^}]*position:\s*sticky/s);
  assert.match(css, /\.coach-page \.tutor-chips\s*\{[^}]*overflow-x:\s*auto/s);
});

test('mobile viewport can use the new stylesheet and service-worker cache', () => {
  assert.match(html, /css\/style\.css\?v=14\.46/);
  assert.match(sw, /mm-v14-46/);
});
