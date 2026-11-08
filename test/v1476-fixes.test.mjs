// 14.76: sign slips, Coach empty state, in-app Reduce motion, debounced auto-pause, tiny-pool variety, word-problem type.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { errKind, gen } from '../public/js/engine.js';
import { ERRL } from '../public/js/stats.js';
import { describeGap } from '../public/js/aiLocal.js';

const read = (f) => fs.readFileSync(new URL('../public/' + f, import.meta.url), 'utf8');

test('a wrong sign is a sign slip, not a place slip', () => {
  assert.equal(errKind('-5', '5'), 'sign');
  assert.equal(errKind('5', '-5'), 'sign');
  assert.equal(errKind('-144', '144'), 'sign');
  assert.notEqual(errKind('0', '-0'), 'sign');
  assert.equal(errKind('85', '75'), 'place');           // unchanged
  assert.equal(errKind('12', '21'), 'swap');
  assert.ok(ERRL.sign && ERRL.sign[0] && ERRL.sign[1], 'sign has a label and advice');
});

test('the local explanation names a sign slip', () => {
  assert.match(describeGap('-5', '5'), /opposite sign/);
});

test('Coach: no invented ratings or name before the first session', () => {
  const c = read('js/views/coach.js');
  assert.match(c, /summary\.sessionsCount \? summary\.avgRating : '–'/);
  assert.match(c, /summary\.totalAnswers \? `\$\{summary\.accuracy\}%` : '–'/);
  assert.match(c, /No ratings yet/);
  assert.doesNotMatch(c, /Welcome, \$\{esc\(uName\)\}\./);
  assert.match(c, /\$\{skillBars\(\)\}/);
});

test('the in-app Reduce motion switch silences all animation, like the OS setting', () => {
  const css = read('css/style.css');
  assert.match(css, /\[data-motion=reduce\] \*, \[data-motion=reduce\] \*::before, \[data-motion=reduce\] \*::after \{ animation: none !important; transition: none !important;/);
});

test('auto-pause on blur waits, and a quick return cancels it', () => {
  const p = read('js/views/play.js');
  assert.match(p, /const BLUR_MS = 1500/);
  assert.match(p, /addEventListener\('focus', \(\) => clearTimeout\(blurId\)\)/);
  assert.doesNotMatch(p, /addEventListener\('blur', \(\) => \{ if \(!S\.noBlur\) pause\(\); \}\);/);
  assert.match(p, /visibilitychange/);   // tab switches still pause at once
});

test('word problems get their own type size', () => {
  assert.match(read('js/views/play.js'), /classList\.toggle\('wordy', p\.q\.length > 22\)/);
  assert.match(read('css/style.css'), /\.play \.q\.wordy \{/);
  let longest = 0; for (let i = 0; i < 3000; i++) longest = Math.max(longest, gen('life', 12).q.length);
  assert.ok(longest > 22, 'there are word problems the class applies to');
});

test('tiny pools stop re-asking the last few questions', () => {
  const s = read('js/session.js');
  assert.match(s, /bi >= hist\.length - 8/);
  assert.match(s, /MAXLV/);
});

test('regression guard: level-1 roots and powers (a pool of about 7) do not repeat inside 8 questions', async () => {
  const { S, replaceState, fresh } = await import('../public/js/state.js');
  const { Session } = await import('../public/js/session.js');
  const { seeded } = await import('../public/js/util.js');
  for (const seed of [1, 7, 42, 99]) {
    replaceState(fresh()); S.cfg = { dur: 0, only: 'pw' }; S.sk.pw.lv = 1;
    let t = 0; const s = new Session(undefined, { now: () => t, rand: seeded(seed) });
    s.begin(); s.next();
    const asked = [];
    for (let i = 0; i < 30 && !s.over; i++) {
      t += 2000; s.tick(); asked.push(s.cur.q);
      for (const d of String(s.cur.a)) { if (s.type(d) == 'ok') { s.answer(true); break; } }
      if (!s.next()) break;
    }
    assert.ok(asked.length >= 25, 'ran the session');
    asked.forEach((q, i) => { const prev = asked.slice(Math.max(0, i - 8), i); assert.ok(!prev.includes(q), `seed ${seed}: "${q}" repeated within 8 (at ${i})`); });
  }
});
