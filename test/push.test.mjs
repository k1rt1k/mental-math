import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dueKind, message, localParts, cleanRec } from '../netlify/lib/pushlogic.mjs';

const at = (iso) => Date.parse(iso);
const rec = (o = {}) => ({ times: [{ h: 19, m: 0 }], days: [0, 1, 2, 3, 4, 5, 6], skip: true, sent: {}, tz: 'Asia/Kolkata', last: '', streak: 0, due: 0, saveStreak: true, on: true, ...o });
const kind = (r, t) => { const d = dueKind(r, t); return d ? d.kind : null; };

test('time zones: 19:00 in Kolkata is 13:30 UTC', () => {
  const L = localParts(at('2026-11-02T13:30:00Z'), 'Asia/Kolkata');
  assert.deepEqual([L.date, L.h, L.m], ['2026-11-02', 19, 0]);
  assert.equal(localParts(at('2026-11-02T20:00:00Z'), 'Asia/Kolkata').date, '2026-11-03');   // local date rolls over, not UTC's
  assert.equal(localParts(at('2026-11-02T13:30:00Z'), 'Not/AZone').h, 13);                   // bad zone falls back to UTC
});

test('daily reminder fires at the chosen time, once, and only until the catch-up window closes', () => {
  assert.equal(kind(rec(), at('2026-11-02T13:20:00Z')), null);       // 18:50 local: too early
  assert.equal(kind(rec(), at('2026-11-02T13:30:00Z')), 'daily');    // 19:00
  assert.equal(kind(rec({ sent: { '19:00': '2026-11-02' } }), at('2026-11-02T13:40:00Z')), null);   // already sent today
  assert.equal(kind(rec(), at('2026-11-02T16:15:00Z')), null);       // 21:45: window (2.5 h) closed, stay quiet
  assert.equal(kind(rec({ sent: { '19:00': '2026-11-01' } }), at('2026-11-02T13:40:00Z')), 'daily'); // yesterday's send does not block today
});

test('no reminder once you have practised today, or when switched off', () => {
  assert.equal(kind(rec({ last: '2026-11-02' }), at('2026-11-02T13:30:00Z')), null);
  assert.equal(kind(rec({ last: '2026-11-01' }), at('2026-11-02T13:30:00Z')), 'daily');
  assert.equal(kind(rec({ on: false }), at('2026-11-02T13:30:00Z')), null);
  assert.equal(kind(null), null);
});

test('streak rescue: only for streaks of 3+, at 20:30, after the daily reminder, once', () => {
  const t = at('2026-11-02T15:00:00Z');   // 20:30 local
  assert.equal(kind(rec({ streak: 5, sent: { '19:00': '2026-11-02' } }), t), 'streak');
  assert.equal(kind(rec({ streak: 2, sent: { '19:00': '2026-11-02' } }), t), null);
  assert.equal(kind(rec({ streak: 5, sent: { '19:00': '2026-11-02' }, sentS: '2026-11-02' }), t), null);
  assert.equal(kind(rec({ streak: 5, sent: { '19:00': '2026-11-02' }, saveStreak: false }), t), null);
  assert.equal(kind(rec({ streak: 5, sent: { '19:00': '2026-11-02' }, last: '2026-11-02' }), t), null);
});

test('streak rescue never lands within an hour of the daily reminder', () => {
  assert.equal(kind(rec({ times: [{ h: 20, m: 0 }], streak: 9, sent: { '20:00': '2026-11-02' } }), at('2026-11-02T15:00:00Z')), null);   // 20:30, daily was 30 min ago
  assert.equal(kind(rec({ times: [{ h: 20, m: 0 }], streak: 9, sent: { '20:00': '2026-11-02' } }), at('2026-11-02T15:40:00Z')), 'streak'); // 21:10
});

test('an early-evening reminder time does not collide with the streak nudge', () => {
  assert.equal(kind(rec({ times: [{ h: 20, m: 30 }], streak: 9 }), at('2026-11-02T15:00:00Z')), 'daily');
});

test('message wording: review when many are due, streak mention, valid urls', () => {
  assert.match(message('daily', { due: 12, streak: 0 }).title, /12 questions/);
  assert.equal(message('daily', { due: 12 }).url, '/?go=review');
  assert.match(message('daily', { due: 0, streak: 4 }).body, /4-day streak/);
  assert.match(message('streak', { streak: 6 }).title, /6-day/);
  for (let d = 0; d < 20; d++) { const m = message('daily', { due: 0, streak: 0 }, d * 864e5); assert.ok(m.title && m.body && m.url.startsWith('/?go=')); }
});

test('client payloads are sanitised', () => {
  const c = cleanRec({ times: [{ h: 99, m: -5 }, { h: 99, m: 0 }, { h: 8, m: 15 }, { h: 9, m: 0 }, { h: 10, m: 0 }] /* 3 kept, then de-duplicated */, days: [1, 1, 9, 'x'], tz: 'Fake/Zone', last: 'drop table', streak: 'x', saveStreak: false });
  assert.deepEqual([c.times.length, c.times[0].h, c.times[0].m, c.tz, c.last, c.streak, c.saveStreak], [2, 23, 0, 'UTC', '', 0, false]);
  assert.deepEqual(c.days, [1, 6]);                                          // de-duplicated, clamped, junk dropped
  assert.deepEqual(cleanRec({ h: 7, m: 30 }).times, [{ h: 7, m: 30 }]);       // old single-time payloads still work
});

test('several times a day: each slot fires once, independently', () => {
  const r = rec({ times: [{ h: 8, m: 0 }, { h: 19, m: 0 }], skip: false, sent: { '08:00': '2026-11-02' } });
  assert.deepEqual(dueKind(r, at('2026-11-02T13:30:00Z')), { kind: 'daily', slot: '19:00' });   // morning already sent, evening due
  assert.equal(kind({ ...r, sent: { '08:00': '2026-11-02', '19:00': '2026-11-02' } }, at('2026-11-02T13:30:00Z')), null);
  assert.deepEqual(dueKind(rec({ times: [{ h: 8, m: 0 }, { h: 19, m: 0 }] }), at('2026-11-02T02:30:00Z')), { kind: 'daily', slot: '08:00' });
});

test('weekday filter uses the local weekday, not UTC', () => {
  const t = at('2026-11-02T13:30:00Z');                                       // Monday 19:00 in Kolkata
  assert.equal(kind(rec({ days: [1] }), t), 'daily');
  assert.equal(kind(rec({ days: [0, 2, 3, 4, 5, 6] }), t), null);
  assert.equal(localParts(at('2026-11-02T20:00:00Z'), 'Asia/Kolkata').wd, 2);   // already Tuesday there
});

test('"skip if practised" can be turned off', () => {
  assert.equal(kind(rec({ last: '2026-11-02', skip: false }), at('2026-11-02T13:30:00Z')), 'daily');
});

test('release wiring: notify module precached, push handlers present, shortcuts resolve to real modes', () => {
  const sw = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  for (const e of ["'push'", "'notificationclick'"]) assert.ok(sw.includes(e), e);
  const main = fs.readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8');
  const m = JSON.parse(fs.readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  for (const s of m.shortcuts) { const g = new URL(s.url, 'https://x').searchParams.get('go'); if (g) assert.ok(main.includes(`'${g}'`), 'main.js does not launch ' + g); }
  for (const f of ['badge-96.png', 'favicon-32.png', 'icon-maskable-512.png']) assert.ok(fs.existsSync(new URL('../public/' + f, import.meta.url)), f);
});
