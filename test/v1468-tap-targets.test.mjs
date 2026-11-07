import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fresh, S, replaceState } from '../public/js/state.js';
import { dayInfo } from '../public/js/weekdata.js';
import { ymd, dayAgo } from '../public/js/util.js';
const src = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
const DAY = 864e5;

test('dayInfo gives one calendar day with its sessions and totals', () => {
  replaceState(fresh());
  S.sessions.push({ t: Date.now() - 3 * DAY, m: 'train', dur: 120, n: 10, ok: 9, ft: 9, pts: 90, lv: {} }, { t: Date.now() - 3 * DAY + 600, m: 'sprint', dur: 50, n: 20, ok: 20, ft: 20, pts: 0, lv: {} });
  const k = ymd(dayAgo(3)), x = dayInfo(k);
  assert.equal(x.sessions.length, 2); assert.equal(x.n, 30); assert.equal(x.acc, 97); assert.equal(x.i, 3); assert.equal(x.today, false);
  assert.equal(dayInfo(ymd()).today, true);
  assert.equal(dayInfo(ymd(dayAgo(1))).sessions.length, 0);
});

test('Home: goal ring, personal bests, skill balance and the trick title are tappable', () => {
  const h = src('js/views/home.js');
  assert.match(h, /data-act="goalSheet"/); assert.match(h, /A\.goalSheet = /);
  assert.match(h, /class="fr frgo"/); assert.match(h, /function recordGo/);
  assert.match(h, /data-act="openSkills"/); assert.match(h, /data-act="info" data-v="p\.zeta"/);
  assert.match(h, /data-act="openTrick"/); assert.match(h, /A\.openTrick = /);
});

test('Progress: stat cards, week card, skill names, heatmap days and milestones lead somewhere', () => {
  const p = src('js/views/progress.js'), w = src('js/views/weeksheet.js');
  assert.equal((p.match(/class="stat-hit"/g) || []).length, 6);
  assert.match(p, /class="card wvl wkopen"[^>]*data-act="weekSheet"/);
  assert.match(p, /data-act="msTip"/); assert.match(p, /A\.openSkills = /);
  assert.match(w, /A\.daySheet = /); assert.match(w, /A\.msTip = /);
  assert.match(w, /\.ixh b\[data-d\]/);
});

test('an svg with its own data-act is not treated as a chart', () => {
  assert.match(src('js/charts.js'), /!s\.dataset\.act/);
  assert.match(src('js/charts.js'), /t\.matches\('svg\.ix'\) && !t\.dataset\.act/);
});
