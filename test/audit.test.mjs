// Audit regressions: small honesty and labelling fixes found while reading the whole app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { S, migrate, replaceState, fresh, DEVICE_LOCAL, devicePrefs } from '../public/js/state.js';
import { shareLine, modeLabel } from '../public/js/stats.js';
import { qk, how } from '../public/js/engine.js';

test('a focus drill shares the skill it actually drilled, not the saved setup', () => {
  replaceState(fresh());
  S.cfg = { dur: 120, only: 'all' };
  const line = shareLine({ m: 'focus', dur: 60, ok: 9, n: 10, pts: 300, tm: 2, t: Date.now(), by: { mul: [10, 9, 18], add: [0, 0, 0] } });
  assert.match(line, /Multiplication 60s/);
  assert.doesNotMatch(line, /Train|Focus/);
});

test('a focus run without a single clear skill still falls back safely', () => {
  replaceState(fresh());
  S.cfg = { dur: 120, only: 'all' };
  const line = shareLine({ m: 'focus', dur: 60, ok: 9, n: 10, pts: 300, tm: 2, t: Date.now() });
  assert.match(line, /Focus 60s/);
});

test('migrate never replays an old pattern drill from the saved setup', () => {
  const out = migrate({ cfg: { dur: 60, only: 'mul', patt: '×11 trick', pats: ['×11 trick'] } });
  assert.equal(out.cfg.only, 'mul');
  assert.equal(out.cfg.patt, undefined);
  assert.equal(out.cfg.pats, undefined);
});

test('Reset keeps every device preference and drops progress', () => {
  const st = { theme: 'light', mute: true, pad: false, pace: 'relaxed', zen: true, rem: { on: true }, onb: 1, goal: 5, sessions: [{}], sk: {}, cfg: {} };
  const keep = devicePrefs(st);
  assert.equal(keep.theme, 'light');
  assert.equal(keep.mute, true);
  assert.equal(keep.pad, false, 'an explicit pad off must survive Reset');
  assert.equal(keep.pace, 'relaxed');
  assert.equal(keep.zen, true);
  assert.equal(keep.rem.on, true, 'reminders are device settings, not progress');
  for (const k of Object.keys(keep)) assert.ok(DEVICE_LOCAL.includes(k), k + ' is not device-local');
  for (const k of ['onb', 'goal', 'sessions', 'sk', 'cfg']) assert.equal(keep[k], undefined);
});

test('the Reset action uses the shared device-preference list', () => {
  const src = readFileSync(new URL('../public/js/views/settings.js', import.meta.url), 'utf8');
  assert.match(src, /devicePrefs\(\)/);
  assert.doesNotMatch(src, /keep = \{ theme: S\.theme/, 'a hand-picked subset drifts from DEVICE_LOCAL');
});

test('every saved session mode has a readable label, including Sprint and custom ranges', () => {
  assert.equal(modeLabel('sprint'), 'Sprint');
  assert.equal(modeLabel('zeta'), 'Custom ranges');
  assert.equal(modeLabel('focus'), 'Focus');
  assert.equal(modeLabel('daily'), 'Daily challenge');
  assert.equal(modeLabel(undefined), 'Train', 'legacy rows with no mode are training sessions');
  assert.equal(modeLabel('mystery'), 'Train');
  const src = readFileSync(new URL('../public/js/views/progress.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /esc\(x\.m \|\| 'train'\)/, 'the history table must not print raw mode ids');
  assert.match(src, /modeLabel\(x\.m\)/);
});

test('migrate always leaves Home a usable presets array', () => {
  assert.deepEqual(migrate({ presets: 'nope' }).presets, []);
  assert.deepEqual(migrate({ presets: {} }).presets, []);
  const out = migrate({ presets: [
    null, 5, { n: 'No config' }, { n: 'Bad config', cfg: [] },
    { n: '  Seven table  ', cfg: { only: 'nope', dur: 'abc', mix: ['mul', 'zzz', 'mul'], off: 'x', patt: '×11 trick' } },
  ] });
  assert.equal(out.presets.length, 1);
  assert.deepEqual(out.presets[0], { n: 'Seven table', cfg: { only: 'all', dur: 120, mix: ['mul'], off: 0 } });
  const many = migrate({ presets: Array.from({ length: 9 }, (_, i) => ({ n: 'p' + i, cfg: { dur: 60 } })) });
  assert.equal(many.presets.length, 6, 'the saved-setup panel has room for six');
});

test('migrate clamps the daily goal to the Settings stepper range', () => {
  assert.equal(migrate({ goal: '9' }).goal, 5);
  assert.equal(migrate({ goal: 0 }).goal, 1);
  assert.equal(migrate({ goal: 'not a number' }).goal, 2);
  assert.equal(migrate({ goal: 3 }).goal, 3);
});

test('numeric question text from an import never crashes keys, methods or search', () => {
  assert.equal(qk(42), '42');
  assert.equal(qk('5 + 3'), '3+5');
  assert.doesNotThrow(() => how({ q: 42, a: 42, sk: 'add' }));
  assert.doesNotThrow(() => migrate({ mastered: { k: { q: 42, a: 42, sk: 'add' } } }));
  const src = readFileSync(new URL('../public/js/views/notebook.js', import.meta.url), 'utf8');
  assert.match(src, /String\(w\.q\)\.toLowerCase\(\)/, 'search must coerce a numeric question to text');
});

test('migrate keeps saved session counts consistent and drops corrupt detail', () => {
  const out = migrate({ sessions: [{
    t: 1, m: 'train', dur: 120, n: 10, ok: 8, ft: 99, pts: 100, tm: 2,
    by: { add: [5, 4, 10], zzz: [1, 1, 1], mul: 'bad', dec: [3, 9, 2] },
    lv: { add: 7, zzz: 4, mul: 'x', dec: 20 },
  }] });
  const s = out.sessions[0];
  assert.equal(s.ft, 8, 'first-try can never exceed correct answers');
  assert.deepEqual(s.by, { add: [5, 4, 10], dec: [3, 3, 2] });
  assert.deepEqual(s.lv, { add: 7, dec: 12 });
  assert.equal(migrate({ sessions: [{ t: 1, dur: 120, n: 10, ok: 8 }] }).sessions[0].ft, 8, 'legacy rows fall back to ok');
});

test('the history table no longer computes an unused best-point value', () => {
  const src = readFileSync(new URL('../public/js/views/progress.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\bbp\b/);
});

test('Home keeps at least one skill in a custom mix', () => {
  const src = readFileSync(new URL('../public/js/views/home.js', import.meta.url), 'utf8');
  assert.match(src, /Keep at least one skill in the mix/);
  assert.doesNotMatch(src, /const skillsNow/);
});

test('a failed plan request clears the stale source and message', () => {
  const src = readFileSync(new URL('../public/js/views/coach.js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('A.runPlan'), src.indexOf('A.runRecommend'));
  assert.match(block, /trainingPlanSource = 'local'/);
  assert.match(block, /trainingPlanMessage = String\(err\.message \|\| err\)/);
});
