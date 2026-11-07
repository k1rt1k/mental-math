import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../public/js/views/settings.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/css/extras.css', import.meta.url), 'utf8');

test('Settings is grouped into four named sections', () => {
  for (const id of ['look', 'practice', 'account', 'data']) assert.match(src, new RegExp(`\\['${id}', '`));
  assert.match(src, /grp\('look'/); assert.match(src, /grp\('practice'/); assert.match(src, /grp\('account'/); assert.match(src, /grp\('data'/);
});

test('search box filters rows, cards and groups, and survives repaints', () => {
  assert.match(src, /id="sq"[^>]*type="search"|type="search"[^>]*id="sq"/);
  assert.match(src, /function filterSettings/);
  assert.match(src, /value="\$\{esc\(sq\)\}"/);       // a repaint keeps the typed text
  assert.match(src, /e\.key == 'Escape' && sq/);       // Escape clears it
  assert.match(css, /\.sgrp \[hidden\][^{]*\{[^}]*display: none !important/);   // .set is display:flex, which would beat [hidden]
});

test('Appearance has a live preview that reads the same CSS variables the app uses', () => {
  assert.match(src, /class="card pv"/);
  for (const v of ['--qfont', '--ac']) assert.ok(css.includes(v), v);
  assert.match(css, /\[data-big="1"\] \.pv-a/);
  assert.match(css, /\[data-motion=reduce\] \.pv-a i \{ animation: none/);
});
