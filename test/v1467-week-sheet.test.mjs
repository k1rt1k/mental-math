import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fresh, S, replaceState } from '../public/js/state.js';
import { weekDays } from '../public/js/weekdata.js';
import { ymd, dayAgo } from '../public/js/util.js';
const DAY = 864e5;
const play = (ago, o = {}) => S.sessions.push({ t: Date.now() - ago * DAY, m: 'train', dur: 120, n: 10, ok: 8, ft: 8, pts: 100, lv: {}, ...o });
const src = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');

test('seven calendar days, oldest first, today last', () => {
  replaceState(fresh()); play(0);
  const d = weekDays();
  assert.equal(d.length, 7);
  assert.equal(d[6].k, ymd()); assert.equal(d[6].today, true);
  assert.equal(d[0].k, ymd(dayAgo(6)));
  assert.equal(d.filter((x) => x.today).length, 1);
});

test('each day carries its own sessions and totals', () => {
  replaceState(fresh()); play(0, { n: 10, ok: 5 }); play(0, { n: 10, ok: 10, pts: 50 }); play(2);
  const d = weekDays();
  assert.equal(d[6].sessions.length, 2); assert.equal(d[6].n, 20); assert.equal(d[6].acc, 75); assert.equal(d[6].pts, 150);
  assert.equal(d[4].sessions.length, 1);
  assert.equal(d[5].sessions.length, 0); assert.equal(d[5].on, false);
});

test('a session with nothing right does not mark the day as practised', () => {
  replaceState(fresh()); play(1, { ok: 0 });
  assert.equal(weekDays()[5].on, false);
});

test('the Home week card opens the sheet from the strip, the numbers and the footer', () => {
  const h = src('js/views/home.js');
  assert.match(h, /import '\.\/weeksheet\.js'/);
  assert.match(h, /class="mini wkopen"[^>]*data-act="weekSheet"/);
  assert.match(h, /class="wkn mu wkopen"[^>]*data-act="weekSheet"/);
  assert.match(h, /role="button" tabindex="0" data-act="weekSheet" data-v="\$\{6 - i\}"/);
  assert.match(src('js/views/weeksheet.js'), /A\.weekSheet = /);
});
