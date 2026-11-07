import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERSION as REL, CACHE } from './helpers/version.mjs';

const css = readFileSync(new URL('../public/css/style.css', import.meta.url), 'utf8');
const coach = readFileSync(new URL('../public/js/views/coach.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const nav = readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8');

test('mobile bottom navigation defines five non-wrapping columns', () => {
  assert.match(css, /#tabs\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /#tabs \.nv\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /#tabs \.nv > span:last-child\s*\{[^}]*white-space:\s*nowrap/s);
});

test('Coach has a dedicated mobile tab grid and contained chat layout', () => {
  const extras = readFileSync(new URL('../public/css/extras.css', import.meta.url), 'utf8');
  assert.match(coach, /class="coach-page"/);
  assert.match(coach, /class="ctabs" role="tablist"/);
  assert.match(coach, /Math Tutor/);
  assert.match(extras, /\.ctabs\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(extras, /\.chat-form \.inp\s*\{[^}]*min-width:\s*0/s);
  // The tutor never hides replies in a small inner scroll box; the composer sticks above the tab bar on phones.
  assert.doesNotMatch(extras, /\.chat-stream\s*\{[^}]*max-height/s);
  assert.match(extras, /\.chat-form\s*\{[^}]*position:\s*sticky/s);
  assert.match(extras, /\.tutor-chips\s*\{[^}]*overflow-x:\s*auto/s);
});

test('mobile viewport can use the new stylesheet and service-worker cache', () => {
  assert.ok(html.includes(`css/style.css?v=${REL}`));
  assert.ok(sw.includes(CACHE));
});
