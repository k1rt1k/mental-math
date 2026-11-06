import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fresh, S, replaceState } from '../public/js/state.js';
import { restInfo, streak } from '../public/js/stats.js';
const DAY = 864e5;
const play = (...ago) => ago.forEach((a) => S.sessions.push({ t: Date.now() - a * DAY, m: 'train', dur: 60, n: 10, ok: 8, ft: 8, pts: 100, lv: {} }));
const seq = (from, n) => Array.from({ length: n }, (_, i) => from + i);

test('no streak, no rest info', () => { replaceState(fresh()); assert.equal(restInfo(), null); });
test('3 days in a row: earning, 4 to go', () => { replaceState(fresh()); play(0, 1, 2); assert.deepEqual(restInfo(), { state: 'earning', left: 4 }); });
test('7 in a row: rest day ready', () => { replaceState(fresh()); play(...seq(0, 7)); assert.equal(restInfo().state, 'ready'); });
test('7 in a row, then yesterday missed: rest day in use and the streak survives', () => {
  replaceState(fresh()); play(...seq(2, 8));
  assert.equal(restInfo().state, 'using'); assert.ok(streak() >= 8);
});
test('rest day used up: needs 7 more', () => { replaceState(fresh()); play(0, 1, ...seq(3, 8)); assert.equal(restInfo().state, 'earning'); });

test('Notebook cards have a Drill button wired to the skill and pattern', () => {
  const nb = readFileSync(new URL('../public/js/views/notebook.js', import.meta.url), 'utf8');
  assert.match(nb, /data-act="nbDrill"/); assert.match(nb, /A\.nbDrill = /);
});
test('colour-blind and larger-answer settings are wired end to end', () => {
  const r = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
  assert.match(r('js/theme.js'), /dataset\.cb/); assert.match(r('js/theme.js'), /dataset\.big/);
  assert.match(r('js/views/settings.js'), /'cb', get\('cb'\)/); assert.match(r('js/views/settings.js'), /'bigA', get\('bigA'\)/);
  assert.match(r('js/state.js'), /'cb', 'bigA'/); assert.match(r('css/extras.css'), /data-cb="1"/);
});

test('share card, pace readout and backup note are wired', () => {
  const r = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
  assert.match(r('js/share.js'), /export async function shareCard/);
  assert.match(r('js/views/results.js'), /data-act="shareImg"/); assert.match(r('js/views/results.js'), /A\.shareImg = /);
  assert.match(r('sw.js'), /'js\/share\.js'/);
  assert.match(r('js/views/play.js'), /id="pcv"/); assert.match(r('js/views/settings.js'), /'pace', get\('pace'\)/);
  assert.match(r('js/views/settings.js'), /Home reminds you after 12 days/);
});
