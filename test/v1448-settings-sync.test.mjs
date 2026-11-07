// v14.48: settings follow the learner. Theme, accent, font, keypad, sound, goal and saved setups sync with a
// per-setting change time; reminders, open panels and banner snoozes stay on the device.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fresh, mergeStates, migrate, devicePrefs, prefsSig, PREF_KEYS, SYNCED_PREFS, DEVICE_LOCAL } from '../public/js/state.js';

const rd = (p) => readFileSync(new URL('../public/js/' + p, import.meta.url), 'utf8');
// Two separate module instances stand in for two browsers; `server` stands in for the cloud copy.
const A = await import('../public/js/state.js?device=A'), B = await import('../public/js/state.js?device=B');
let server = null;
const push = (d) => { server = structuredClone(d.S); };
const pull = (d) => { if (server) d.replaceState(d.mergeStates(d.S, server)); };
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

test('every setting is either synced or device-bound, never both, and reminders stay on the device', () => {
  assert.ok(!SYNCED_PREFS.some((k) => DEVICE_LOCAL.includes(k)));
  for (const k of ['theme', 'acc', 'font', 'ts', 'hc', 'cb', 'bigA', 'rm', 'zen', 'mute', 'noCd', 'noHap', 'noBlur', 'pace', 'pad', 'padFlip', 'goal', 'cfg', 'presets']) assert.ok(SYNCED_PREFS.includes(k), k);
  for (const k of ['rem', 'skOpen', 'bkSnooze', 'padHint']) assert.ok(DEVICE_LOCAL.includes(k), k);
});

test('migrate keeps only real change times for known settings', () => {
  const o = migrate({ pt: { theme: 5, acc: 'x', bogus: 9, goal: -3, cfg: 7 } });
  assert.deepEqual(o.pt, { theme: 5, cfg: 7 });
  assert.deepEqual(migrate({}).pt, {});
  assert.deepEqual(migrate({ pt: 'junk' }).pt, {});
});

test('the later change to each setting wins independently', () => {
  const a = { ...fresh(), theme: 'dark', acc: 'teal', pt: { theme: 100, acc: 10 } };
  const b = { ...fresh(), theme: 'light', acc: 'rose', pt: { theme: 50, acc: 200 } };
  for (const m of [mergeStates(a, b), mergeStates(b, a)]) { assert.equal(m.theme, 'dark'); assert.equal(m.acc, 'rose'); assert.deepEqual(m.pt, { theme: 100, acc: 200 }); }
});

test('setting back to Auto (unset) is a change too, and removes the other device\'s value', () => {
  const a = { ...fresh(), pt: { theme: 300 } }, b = { ...fresh(), theme: 'black', pt: { theme: 100 } };
  assert.equal('theme' in mergeStates(b, a), false);
  assert.equal('theme' in mergeStates(a, b), false);
});

test('without change times (data from before) nothing changes by surprise, but a fresh browser adopts', () => {
  const phone = { ...fresh(), theme: 'light', font: 'sans' }, laptop = { ...fresh(), theme: 'dark' };
  assert.equal(mergeStates(laptop, phone).theme, 'dark');          // both set: this device keeps its own
  assert.equal(mergeStates(laptop, phone).font, 'sans');            // laptop never set a font: takes the phone's
  const fresher = fresh();
  assert.equal(mergeStates(fresher, phone).theme, 'light');         // a new browser picks up the account's settings
});

test('goal, the session setup and saved setups follow the newest change, not the newest save', () => {
  const cfg1 = { dur: 60, only: 'mul' }, cfg2 = { dur: 300, only: 'all' };
  const a = { ...fresh(), u: 900, goal: 2, cfg: cfg1, pt: { goal: 10, cfg: 10 } };           // saved a session more recently...
  const b = { ...fresh(), u: 500, goal: 4, cfg: cfg2, presets: [{ n: 'Warm up', cfg: cfg1 }], pt: { goal: 400, cfg: 400, presets: 400 } };   // ...but changed settings later
  const m = mergeStates(a, b);
  assert.equal(m.goal, 4); assert.equal(m.cfg.dur, 300); assert.equal(m.presets[0].n, 'Warm up');
});

test('reminders, panels and snoozes are not touched by the other device', () => {
  const a = { ...fresh(), rem: { on: true }, bkSnooze: 5 }, b = { ...fresh(), rem: { on: false }, bkSnooze: 9, skOpen: { x: 1 } };
  const m = mergeStates(a, b);
  assert.deepEqual(m.rem, { on: true }); assert.equal(m.bkSnooze, 5); assert.equal('skOpen' in m, false);
});

test('Reset keeps appearance and device settings with their change times, and drops goal and setups', () => {
  const keep = devicePrefs({ theme: 'light', acc: 'teal', rem: { on: true }, goal: 5, cfg: { dur: 60 }, presets: [1], pt: { theme: 7, acc: 8, goal: 9 } });
  assert.equal(keep.theme, 'light'); assert.equal(keep.rem.on, true);
  assert.deepEqual(keep.pt, { theme: 7, acc: 8 });
  for (const k of ['goal', 'cfg', 'presets']) assert.equal(keep[k], undefined);
});

test('end to end: a setting changed in one browser reaches another, and unrelated settings do not collide', async () => {
  A.replaceState({}); B.replaceState({}); server = null;
  A.S.theme = 'dark'; A.S.acc = 'violet'; A.save(); push(A);       // laptop
  pull(B);                                                        // phone opens, picks up the account's settings
  assert.equal(B.S.theme, 'dark'); assert.equal(B.S.acc, 'violet');
  await tick();
  B.S.padFlip = true; B.save(); await tick();                      // phone: keypad layout
  A.S.theme = 'light'; A.save(); push(A);                          // laptop (later): theme
  pull(B); push(B); pull(A);
  assert.equal(B.S.theme, 'light'); assert.equal(B.S.padFlip, true);
  assert.equal(A.S.padFlip, true); assert.equal(A.S.theme, 'light'); assert.equal(A.S.acc, 'violet');
  assert.equal(prefsSig(A.S), prefsSig(B.S));
});

test('only a real change is stamped: saving a session, pulling and merging leave other settings\' times alone', async () => {
  A.replaceState({}); A.S.theme = 'dark'; A.save(); const t0 = A.S.pt.theme;
  assert.ok(t0 > 0); assert.equal(A.S.pt.acc, undefined);
  await tick();
  A.S.sessions.push({ t: 1, dur: 60, n: 1, ok: 1, ft: 1, pts: 1, tm: 1, m: 'train' }); A.save();
  assert.equal(A.S.pt.theme, t0);
  A.replaceState(A.mergeStates(A.S, fresh())); A.save();
  assert.equal(A.S.pt.theme, t0, 'a merge or reload must not re-stamp a setting');
});

test('sync.js repaints and pushes when only a setting differs', () => {
  const src = rd('sync.js');
  assert.match(src, /prefsSig\(\) != prefsBefore\) onChange\(\)/);
  assert.match(src, /prefsSig\(\) != prefsSig\(migrate\(r\)\)/);
});
