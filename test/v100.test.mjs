import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { S, replaceState, fresh, mergeStates } from '../public/js/state.js';
import { todayCount, countsToGoal, plan, recommend } from '../public/js/stats.js';

const src = (f) => fs.readFileSync(new URL('../public/' + f, import.meta.url), 'utf8');
const at = (h, d = 0) => { const x = new Date(); x.setDate(x.getDate() - d); x.setHours(h, 5, 0, 0); return x.getTime(); };
const sess = (t, extra = {}) => ({ t, m: 'train', dur: 120, n: 20, ok: 18, pts: 600, tm: 3, ...extra });

test('countsToGoal: Sprint and Survival count toward the daily goal, short or empty runs do not', () => {
  assert.ok(countsToGoal(sess(0)), '2-minute Train');
  assert.ok(!countsToGoal(sess(0, { dur: 60 })), 'a 60 s Train is too short');
  assert.ok(!countsToGoal(sess(0, { ok: 0 })), 'nothing right');
  assert.ok(countsToGoal(sess(0, { m: 'sprint', dur: 48, n: 22, ok: 20 })), 'a completed Sprint');
  assert.ok(!countsToGoal(sess(0, { m: 'sprint', dur: 30, n: 12, ok: 12 })), 'an unfinished Sprint');
  assert.ok(countsToGoal(sess(0, { m: 'survival', dur: 95, ok: 30 })), 'a Survival run of 90 s+');
  assert.ok(!countsToGoal(sess(0, { m: 'survival', dur: 40, ok: 10 })), 'a short Survival run');
  assert.ok(!countsToGoal(sess(0, { m: 'daily', dur: 60 })), 'the Daily has its own tick-off');
});

test('todayCount, the plan and the recommendation agree once a Sprint is in the mix', () => {
  replaceState(fresh());
  S.sessions = [sess(at(9)), sess(at(10), { m: 'sprint', dur: 51, n: 21, ok: 20 }), sess(at(8, 1))];
  assert.equal(todayCount(), 2);
  assert.equal(plan().find((p) => p.id == 'train').detail, '2/2');
  assert.notEqual(recommend().kind, 'train', 'goal of 2 is met, so no more "one more session" nag');
});

test('skills section state is device-local: a synced state never overrides this device', () => {
  replaceState(fresh());
  const a = { ...fresh(), u: 1, skOpen: false }, b = { ...fresh(), u: 2, skOpen: true };
  assert.equal(mergeStates(a, b).skOpen, false);
  const c = { ...fresh(), u: 1 };      // this device never chose
  assert.equal(mergeStates(c, b).skOpen, undefined);
});

test('wiring: collapsible skills, first-run card, progress bar and handlers exist', () => {
  const home = src('js/views/home.js'), play = src('js/views/play.js'), css = src('css/style.css');
  assert.match(home, /A\.skToggle\s*=/);
  assert.match(home, /skillsFold\(\)/);
  assert.match(home, /howItWorks/);
  assert.ok(!/practised\$\{nextMs \? ' · '/.test(home), 'the stray separator after "days practised" is gone');
  assert.match(play, /id="pbw"/);
  assert.match(css, /\.skfold/);
  assert.match(css, /\.modes > \.mode:last-child:nth-child\(odd\)/);
});
