// 13.0 bug-fix audit: each test reproduces a defect that existed in 12.0.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.TZ = 'Europe/London';                       // DST changes at +0/+1 h: the worst case for day arithmetic
const store = {};
globalThis.localStorage = new Proxy(store, { get: (t, k) => (k == 'removeItem' ? (x) => delete t[x] : t[k]), set: (t, k, v) => ((t[k] = String(v)), true) });
globalThis.addEventListener = () => {}; globalThis.document = { addEventListener() {}, hidden: false };

const { S, replaceState, fresh, mergeStates, forget, unforget } = await import('../public/js/state.js');
const { Session, applyRust } = await import('../public/js/session.js');
const { streak, longest } = await import('../public/js/stats.js');
const { ymd, dayAgo, seeded } = await import('../public/js/util.js');
const sy = await import('../public/js/sync.js');

const src = (f) => fs.readFileSync(new URL('../public/js/' + f, import.meta.url), 'utf8');
const sess = (t, x = {}) => ({ t, m: 'train', dur: 120, n: 20, ok: 18, pts: 300, tm: 2, ...x });
const withNow = (t, f) => { const r = Date.now; Date.now = () => t; try { return f(); } finally { Date.now = r; } };

test('idle auto-pause fires once per question, so Resume cannot be re-paused on the next tick', () => {
  replaceState(fresh()); S.cfg = { dur: 120, only: 'all' };
  let t = 0; const s = new Session(undefined, { now: () => t, rand: seeded(3) });
  s.begin(); s.next();
  t = 31000; s.tick();
  assert.equal(s.idle(), true, 'first time past 30 s');
  s.pause(); t += 9000; s.resume(); t += 100; s.tick();
  assert.ok(s.qAge() > 30, 'resuming keeps the question age (scoring unchanged)');
  assert.equal(s.idle(), false, 'must not re-pause the same question');
  s.cur.a = s.cur.a; for (const d of String(s.cur.a)) s.type(d); s.answer(true); s.next();
  t += 31000; assert.equal(s.idle(), true, 'the next question can idle again');
});

test('a Daily that crosses midnight is credited to the day it started', () => {
  replaceState(fresh());
  const start = new Date(2026, 5, 10, 23, 59, 40).getTime(); let wall = start, t = 0;
  withNow(start, () => {
    const s = new Session('daily', { now: () => t, rand: seeded(1) });
    s.begin(); s.next();
    for (let i = 0; i < 8; i++) { t += 3000; wall += 3000; s.tick(); for (const d of String(s.cur.a)) if (s.type(d) == 'ok') { s.answer(true); break; } s.next(); }
    Date.now = () => wall;                                // now it is after midnight
    s.finish();
  });
  assert.deepEqual(Object.keys(S.daily), ['2026-06-10']);
});

test('rust is not skipped because an earlier short visit marked the gap as handled', () => {
  replaceState(fresh());
  const t0 = new Date(2026, 5, 1, 12).getTime();
  S.sessions = [sess(t0)];
  assert.equal(withNow(t0 + 2 * 864e5, applyRust), '', 'only 2 idle days');
  const before = S.sk.add.lv;
  assert.match(withNow(t0 + 8 * 864e5, applyRust), /Welcome back/);
  assert.ok(S.sk.add.lv < before);
  assert.equal(withNow(t0 + 9 * 864e5, applyRust), '', 'but never twice for the same gap');
});

test('streak and longest use one rule: longest is never shorter than the streak you are on', () => {
  replaceState(fresh());
  const played = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14];   // one rest day after 7 played days
  S.sessions = played.map((i) => sess(dayAgo(i)));
  assert.equal(streak(), 14);
  assert.equal(longest(), 14);
  S.sessions = [3, 4, 5, 6].map((i) => sess(dayAgo(i)));            // an old run, current streak 0
  assert.equal(streak(), 0); assert.equal(longest(), 4);
});

test('streaks are not broken by a daylight-saving change', () => {
  replaceState(fresh());
  for (const days of [[[2026, 3, 26], [2026, 3, 27], [2026, 3, 28], [2026, 3, 29], [2026, 3, 30], [2026, 3, 31]], [[2026, 10, 22], [2026, 10, 23], [2026, 10, 24], [2026, 10, 25], [2026, 10, 26], [2026, 10, 27]]]) {
    S.sessions = days.map(([y, m, d]) => sess(new Date(y, m - 1, d, 12).getTime()));
    assert.equal(longest(), 6);
    assert.equal(withNow(new Date(days[5][0], days[5][1] - 1, days[5][2], 20).getTime(), streak), 6);
  }
});

test('dayAgo steps calendar days, so "last 7 days" never skips or repeats a date around a clock change', () => {
  for (const now of [new Date(2026, 2, 30, 0, 30), new Date(2026, 9, 26, 23, 30), new Date(2026, 9, 25, 23, 30)].map((d) => d.getTime())) {
    const got = [6, 5, 4, 3, 2, 1, 0].map((i) => ymd(dayAgo(i, now)));
    assert.equal(new Set(got).size, 7, got.join());
    got.slice(1).forEach((d, i) => assert.equal(Math.round((new Date(d) - new Date(got[i])) / 864e5), 1));
  }
});

test('merging Sprint bests keeps the faster time, not the one with more points', () => {
  const a = { ...fresh(), u: 2, best: { sprint: { t: 55, pts: 800, n: 20 }, mul120: { pts: 100 } } }, b = { ...fresh(), u: 1, best: { sprint: { t: 70.2, pts: 950, n: 20 }, mul120: { pts: 200 } } };
  const m = mergeStates(a, b), m2 = mergeStates(b, a);
  assert.equal(m.best.sprint.t, 55); assert.equal(m2.best.sprint.t, 55);
  assert.equal(m.best.mul120.pts, 200, 'other bests still go by points');
});

test('Undo of a notebook removal survives a merge with a device that already saw the removal', () => {
  replaceState(fresh());
  const now = Date.now(), w = { q: '7 × 8', a: 56, sk: 'mul', d: 3, pt: 'x', tip: '', box: 1, due: now, at: now - 6e4 };
  S.weak[w.q] = w; forget(w.q);
  const synced = JSON.parse(JSON.stringify(S));
  unforget(w.q, w);
  const merged = mergeStates(JSON.parse(JSON.stringify(S)), synced);
  assert.ok(merged.weak[w.q], 'still in the notebook');
  assert.ok(!merged.gone[w.q] || merged.gone[w.q] < merged.weak[w.q].at);
});

/* ---------- sync races (mock fetch) ---------- */
const sessions = (n) => Array.from({ length: n }, (_, i) => sess(1000 + i));
test('a conflict on the push that follows a pull is merged and retried, not reported as synced', async () => {
  let state = { ...fresh(), sessions: [sess(2000)], u: 20 }, calls = [], puts = 0;
  globalThis.fetch = async (url, init = {}) => {
    calls.push(init.method || 'GET');
    if ((init.method || 'GET') == 'GET') return { ok: true, status: 200, json: async () => ({ data: state }) };
    if (puts++ == 0) return { ok: false, status: 409, json: async () => ({}) };
    state = JSON.parse(init.body); return { ok: true, status: 200, json: async () => ({}) };
  };
  replaceState(fresh()); S.sessions = [sess(1000)]; S.u = 10;
  sy.setSyncKey('k1'); await sy.pull();
  assert.deepEqual(calls, ['GET', 'PUT', 'GET', 'PUT']);
  assert.deepEqual(state.sessions.map((x) => x.t).sort(), [1000, 2000], 'the server ends up with both devices\' sessions');
});

test('a persistent conflict stops after two retries instead of looping, and reports a problem', async () => {
  let calls = 0;
  globalThis.fetch = async (url, init = {}) => { calls++; return (init.method || 'GET') == 'GET' ? { ok: true, status: 200, json: async () => ({ data: { ...fresh(), sessions: [sess(5)] } }) } : { ok: false, status: 409, json: async () => ({}) }; };
  replaceState(fresh()); S.sessions = [sess(1)];
  sy.setSyncKey('k2'); await sy.pull();
  assert.ok(calls <= 8, 'bounded: ' + calls);
  assert.notEqual(sy.status.kind, 'ok');
});

test('switching the sync key while a pull is in flight never moves one account\'s data into another', async () => {
  const accounts = { A: { ...fresh(), sessions: [sess(111), sess(222)], u: 50 }, B: null };
  let release; const gate = new Promise((r) => (release = r));
  globalThis.fetch = async (url, init = {}) => {
    const key = init.headers['x-sync-key'], m = init.method || 'GET', snap = m == 'GET' ? accounts[key] : null;
    if (key == 'A') await gate;
    if (m == 'GET') return { ok: true, status: 200, json: async () => ({ data: snap }) };
    accounts[key] = JSON.parse(init.body); return { ok: true, status: 200, json: async () => ({}) };
  };
  replaceState(fresh()); S.sessions = [sess(1)]; S.u = 5;
  sy.setSyncKey('A'); const inflight = sy.pull();
  await new Promise((r) => setTimeout(r, 5));
  sy.setSyncKey('B'); const next = sy.pull();
  release(); await Promise.all([inflight, next]);
  assert.deepEqual(accounts.B.sessions.map((x) => x.t), [1]);
  assert.deepEqual(S.sessions.map((x) => x.t), [1]);
});

test('wiring: page lifecycle, idle pause and countdown are guarded in the play view', () => {
  const p = src('views/play.js');
  assert.match(p, /ev\.type == 'beforeunload'\) \{ sess\.checkpoint\(\); return; \}/, 'beforeunload only checkpoints');
  assert.match(p, /sess\.idle\(\)/);
  assert.match(p, /if \(document\.hidden\) pause\(\)/);
});

test('wiring: wide-but-short windows with the touch keypad get a height tier so Skip stays on screen', () => {
  const css = fs.readFileSync(new URL('../public/css/style.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(min-width: 901px\) and \(max-height: 860px\) \{ \.padon \.pad/);
  assert.match(css, /@media \(min-width: 901px\) and \(max-height: 700px\) \{ \.padon \.pad button/);
});
