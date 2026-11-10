// v14.49: Reset / Replace really erase the cloud copy (and are not merged back), and answer entry forgives typos.
import test, { mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PREF_KEYS } from '../public/js/state.js';

/* ---------- in-memory Netlify Blobs, as in sync.test.mjs ---------- */
const blobs = new Map(), revs = new Map();
const raw = (n) => blobs.get(n) || blobs.set(n, new Map()).get(n);
const rev = (n) => revs.get(n) || revs.set(n, new Map()).get(n);
beforeEach(() => { blobs.clear(); revs.clear(); });
const etagFor = (n, k) => { if (!raw(n).has(k)) return undefined; const r = rev(n); if (!r.has(k)) r.set(k, 0); return 'etag-' + r.get(k); };
const store = (n) => {
  const m = raw(n), r = rev(n), bump = (k) => r.set(k, (r.get(k) || 0) + 1);
  return {
    get: async (k) => (m.has(k) ? structuredClone(m.get(k)) : null),
    getWithMetadata: async (k) => (m.has(k) ? { data: structuredClone(m.get(k)), etag: etagFor(n, k) } : null),
    setJSON: async (k, v, o = {}) => {
      if (o.onlyIfNew && m.has(k)) return { modified: false };
      if (o.onlyIfMatch !== undefined && etagFor(n, k) !== o.onlyIfMatch) return { modified: false };
      m.set(k, structuredClone(v)); bump(k); return { modified: true, etag: etagFor(n, k) };
    },
    delete: async (k) => { m.delete(k); r.delete(k); },
    list: async ({ prefix = '' } = {}) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
  };
};
mock.module('@netlify/blobs', { namedExports: { getStore: ({ name }) => store(name) } });
process.env.SYNC_KEY = 'secret-a';
const { default: handler } = await import('../netlify/functions/sync.mjs');
const req = (method, body) => handler(new Request('http://x/api/sync', { method, headers: { 'x-sync-key': 'secret-a', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }));
const sess = (t) => ({ t, dur: 60, n: 10, ok: 9, pts: 100, tm: 2 });
const st = (ts, extra = {}) => ({ v: 1, sk: { add: { lv: 5, n: 3 } }, sessions: ts.map(sess), ...extra });
const cloud = async () => (await (await req('GET')).json()).data;

test('server: a save with a newer wipe may drop sessions, and the old state is kept as a safety copy', async () => {
  const now = Date.now();
  await req('PUT', st([1, 2, 3]));
  assert.equal((await req('PUT', st([], { wipe: now }))).status, 200, 'erase accepted');
  assert.deepEqual((await cloud()).sessions, []);
  const pre = raw('mental-math').get('backup-pre-erase');
  assert.deepEqual(pre.state.sessions.map((x) => x.t), [1, 2, 3], 'pre-erase copy holds what was destroyed');
  assert.deepEqual(raw('mental-math').get('backup').state.sessions.map((x) => x.t), [1, 2, 3], 'the latest safety copy is the pre-erase state, even if a daily copy was fresh');
});

test('server: a device that has not heard about the erase is refused, so old data cannot come back', async () => {
  const now = Date.now();
  await req('PUT', st([1, 2, 3]));
  await req('PUT', st([], { wipe: now }));
  const stale = await req('PUT', st([1, 2, 3, 4]));          // no wipe: an old device still holding the sessions
  assert.equal(stale.status, 409);
  assert.deepEqual((await cloud()).sessions, []);
  assert.equal((await req('PUT', st([5], { wipe: now }))).status, 200, 'same epoch: normal saves continue');
  assert.equal((await req('PUT', st([], { wipe: now }))).status, 409, 'same epoch still cannot drop sessions');
});

test('server: an older wipe never beats a newer one; a far-future wipe is rejected', async () => {
  const now = Date.now();
  await req('PUT', st([1], { wipe: now }));
  assert.equal((await req('PUT', st([], { wipe: now - 5000 }))).status, 409);
  assert.equal((await req('PUT', st([], { wipe: now + 10 * 864e5 }))).status, 400);
});

test('server: a second erase on an already-empty cloud does not overwrite the safety copy', async () => {
  const now = Date.now();
  await req('PUT', st([1, 2]));
  await req('PUT', st([], { wipe: now }));
  await req('PUT', st([], { wipe: now + 1000 }));
  assert.deepEqual(raw('mental-math').get('backup-pre-erase').state.sessions.map((x) => x.t), [1, 2]);
});

/* ---------- client merge ---------- */
const { fresh, mergeStates, migrate, asCurrent, S, replaceState, stampWipe } = await import('../public/js/state.js');
const full = (ts, extra = {}) => ({ ...fresh(), sessions: ts.map(sess), ...extra });

test('merge: the side with the newer wipe wins outright, in either argument order', () => {
  const erased = full([], { wipe: 500, u: 500 }), old = full([1, 2, 3], { u: 900 });
  assert.deepEqual(mergeStates(erased, old).sessions, []);
  assert.deepEqual(mergeStates(old, erased).sessions, []);
  assert.equal(mergeStates(old, erased).wipe, 500);
});

test('merge: equal wipes (or none) still union the sessions as before', () => {
  assert.deepEqual(mergeStates(full([1, 2]), full([2, 3])).sessions.map((x) => x.t), [1, 2, 3]);
  assert.deepEqual(mergeStates(full([1], { wipe: 9 }), full([2], { wipe: 9 })).sessions.map((x) => x.t), [1, 2]);
  assert.ok(!('wipe' in mergeStates(full([1]), full([2]))), 'no wipe key appears out of nowhere');
});

test('merge: settings still merge across an erase, newest change wins, device-bound ones stay local', () => {
  const erased = full([], { wipe: 500, theme: 'light', pt: { theme: 100 } });
  const old = full([1, 2], { theme: 'dark', acc: 'teal', pt: { theme: 200, acc: 50 }, rem: { on: 1 } });
  const m = mergeStates(old, erased);
  assert.deepEqual(m.sessions, []);
  assert.equal(m.theme, 'dark', 'the newer theme change survives');
  assert.equal(m.acc, 'teal');
  assert.deepEqual(m.rem, { on: 1 }, 'reminders are this device\'s');
});

test('a backup or safety copy merged into an erased state is a union, not discarded (asCurrent)', () => {
  replaceState(full([1], { wipe: 700 }));
  const back = full([1, 2, 3]);                    // an old backup file: no wipe marker
  assert.deepEqual(mergeStates(S, asCurrent(back)).sessions.map((x) => x.t), [1, 2, 3]);
  assert.equal(mergeStates(S, asCurrent(back)).wipe, 700);
});

test('wipe is a clean number after migrate, and stampWipe only moves forward', () => {
  assert.ok(!('wipe' in migrate({ wipe: 'junk' })));
  assert.ok(!('wipe' in migrate({ wipe: -4 })));
  assert.equal(migrate({ wipe: 12 }).wipe, 12);
  replaceState({}); stampWipe(Date.now() + 5000);
  assert.ok(S.wipe > Date.now() + 4999, 'never earlier than the marker it replaces');
});

test('end to end: erase on device A, device B syncs and does not push its old data back', () => {
  let server = full([1, 2, 3], { u: 100 });
  const devB = full([1, 2, 3], { u: 100 });
  const devA = full([], { wipe: 1000, u: 1000 });
  server = mergeStates(server, devA);                              // A's erase reaches the cloud
  const bAfter = mergeStates(devB, server);                        // B pulls
  assert.deepEqual(bAfter.sessions, []);
  assert.deepEqual(mergeStates(server, bAfter).sessions, [], 'and what B pushes next is empty too');
});

/* ---------- wiring ---------- */
const rd = (p) => readFileSync(new URL('../public/js/' + p, import.meta.url), 'utf8');
test('wiring: Reset and Replace with sync on need the typed word and say the cloud copy is erased', () => {
  const s = rd('views/settings.js');
  assert.match(s, /typedConfirmDlg\('Erase everywhere\?'[^]*'ERASE'/);
  assert.match(s, /typedConfirmDlg\('Replace everywhere\?'[^]*'REPLACE'/);
  assert.doesNotMatch(s, /will come back on next sync/);
  assert.match(s, /Reset this device only/);
  assert.match(rd('ui.js'), /export const typedConfirmDlg/);
});

/* ---------- typo forgiveness and Enter-to-submit ---------- */
const { adjacentDigits, nearMiss, Session } = await import('../public/js/session.js');
const clock = () => { let t = 0; return { now: () => t, adv: (ms) => (t += ms) }; };
const mk = (ans, { lives = 0 } = {}) => {
  const c = clock(), s = new Session(undefined, { now: c.now }); s.begin();
  s.cur = { q: 'x', a: ans, sk: 'add', d: 3, pt: '', tip: '' }; s.qs = c.now(); s.buf = ''; s.grace = 0; s.lives = lives;
  return s;
};

test('adjacency: neighbours on a phone pad or a numpad, diagonals too, never the same key or far keys', () => {
  for (const [a, b] of [[5, 6], [1, 5], [8, 0], [7, 8], [1, 4], [9, 6], [0, 2], [0, 7], [0, 3]]) assert.ok(adjacentDigits(a, b), a + '-' + b);
  for (const [a, b] of [[1, 3], [1, 9], [0, 5], [4, 4], [2, 8], [0, 6]]) assert.ok(!adjacentDigits(a, b), a + '-' + b);
});

test('nearMiss: only a same-length answer wrong in its last digit by a neighbouring key', () => {
  assert.ok(nearMiss('54', '55')); assert.ok(nearMiss('7', '8'));
  assert.ok(!nearMiss('54', '64'), 'first digit wrong');
  assert.ok(!nearMiss('54', '59'), 'not adjacent');
  assert.ok(!nearMiss('54', '545'), 'longer');
  assert.ok(!nearMiss('54', '54'), 'correct');
});

test('auto mode: a near-miss is a grace period, and a fix inside it is a clean first-try answer', () => {
  replaceState({});
  const s = mk(54, { lives: 3 });
  assert.equal(s.type('5'), 'more');
  assert.equal(s.type('5'), 'near');
  assert.equal(s.slips, 0); assert.equal(s.lives, 3, 'no life lost yet');
  assert.equal(s.type('4'), 'ok', 'typing the right digit replaces the wrong one');
  assert.ok(!s.cur.tries, 'not counted as a slip');
  assert.equal(s.slips, 0);
});

test('auto mode: Backspace inside the grace window also fixes it', () => {
  replaceState({});
  const s = mk(54, { lives: 3 });
  s.type('5'); assert.equal(s.type('5'), 'near');
  s.back(); assert.equal(s.buf, '5'); assert.equal(s.grace, 0);
  assert.equal(s.type('4'), 'ok'); assert.equal(s.slips, 0);
});

test('auto mode: when the window runs out the near-miss counts as the slip it was, with the life', () => {
  replaceState({});
  const s = mk(54, { lives: 3 });
  s.type('5'); s.type('5');
  assert.equal(s.commit(), 'bad');
  assert.equal(s.slips, 1); assert.equal(s.lives, 2); assert.equal(s.cur.tries, 1); assert.equal(s.cur.lastWrong, '55');
  assert.equal(s.commit(), 'more', 'nothing left to commit');
});

test('auto mode: the grace is once per question, and only for near keys', () => {
  replaceState({});
  const s = mk(54, { lives: 3 });
  s.type('5'); s.type('5'); s.back(); s.back(); s.type('5');
  assert.equal(s.type('5'), 'bad', 'second near-miss on the same question is a real slip');
  const t = mk(54, { lives: 3 });
  t.type('5'); assert.equal(t.type('9'), 'bad', 'a far key is a slip straight away');
  const u = mk(54); u.type('6'); assert.equal(u.type('4'), 'bad', 'wrong earlier digit is a slip');
});

test('the setting turns forgiveness off', () => {
  replaceState({ noGrace: true });
  const s = mk(54, { lives: 3 });
  s.type('5'); assert.equal(s.type('5'), 'bad'); assert.equal(s.lives, 2);
});

test('Enter-to-submit: nothing is judged while typing, the length is not revealed, Enter judges', () => {
  replaceState({ ent: true });
  const s = mk(54, { lives: 3 });
  assert.equal(s.type('5'), 'more'); assert.equal(s.type('5'), 'more'); assert.equal(s.type('5'), 'more');
  assert.equal(s.buf, '555'); assert.equal(s.slips, 0);
  s.back(); s.back(); s.type('4');
  assert.equal(s.submit(), 'ok', 'a corrected answer is fine');
  assert.equal(s.slips, 0);
});

test('Enter-to-submit: a wrong submit is a slip; submitting nothing does nothing; typing is capped', () => {
  replaceState({ ent: true });
  const s = mk(54, { lives: 3 });
  assert.equal(s.submit(), 'none');
  s.type('5'); s.type('9');
  assert.equal(s.submit(), 'bad'); assert.equal(s.slips, 1); assert.equal(s.lives, 2);
  const t = mk(54); for (let i = 0; i < 20; i++) t.type('1');
  assert.ok(t.buf.length <= 6, 'cannot type forever');
  assert.equal(t.submit(), 'bad');
});

test('Enter-to-submit has no near-miss grace (the player already confirmed)', () => {
  replaceState({ ent: true });
  const s = mk(54, { lives: 3 });
  s.type('5'); s.type('5');
  assert.equal(s.submit(), 'bad'); assert.equal(s.slips, 1);
});

test('wiring: keys, buttons, settings, synced prefs', () => {
  const p = rd('views/play.js');
  assert.match(p, /k == 'Enter' && S\.ent\) submit\(\)/);
  assert.match(p, /k == 'Skip'/);
  assert.match(p, /data-v="Skip"/, 'the on-screen Skip no longer sends Enter');
  assert.match(p, /aria-label="Submit answer"/);
  assert.match(rd('views/settings.js'), /'ent', get\('ent'\)/);
  assert.match(rd('views/settings.js'), /'noGrace', get\('noGrace'\)/);
  for (const k of ['ent', 'noGrace']) assert.ok(PREF_KEYS.includes(k), `${k} is a synced pref`);
});
