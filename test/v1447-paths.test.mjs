// v14.47 (extended in v14.69): guided learning paths. Content is checked arithmetically so a worked example can never teach a wrong step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PATHS, KINDS, PATH_STAGES } from '../public/js/pathsData.js';
import { TRICKS } from '../public/js/tricks.js';
import { IDS, gen, qk } from '../public/js/engine.js';
import { fresh, S, replaceState, migrate, mergeStates, cleanPaths, PATH_STAGES as SP, PATH_RET } from '../public/js/state.js';
import { progress, retState, donePhase, recordCheck, judge, nextUp, stageQuestion, PathSession, RET, RETRY_GAP, checkMode } from '../public/js/paths.js';

const DAY = 864e5;
const seeded = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const ARI = '[\\d.()\\s+−×÷²/]';
const ORIG = ['add', 'sub', 'mul', 'div', 'sq', 'pw', 'pct', 'ops', 'mod', 'dec'];   // the original ten skills have whole-number answers
const toJs = (e) => e.replace(/(\d+)\/(\d+)/g, '($1/$2)').replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/').replace(/(\d+(?:\.\d+)?)²/g, '($1**2)');
const val = (e) => { try { const v = Function('"use strict";return (' + toJs(e) + ')')(); return Number.isFinite(v) ? v : null; } catch { return null; } };

/** Every "expr = expr" or "expr → expr" pair on a worked-example line must be arithmetically true. */
function badEqualities(line) {
  const bad = [];
  const parts = line.split(/=|→/);
  for (let i = 0; i + 1 < parts.length; i++) {
    const lm = new RegExp('(' + ARI + '*)$').exec(parts[i]), rm = new RegExp('^(' + ARI + '*)').exec(parts[i + 1]);
    const l = lm[1].trim(), r = rm[1].trim();
    const pre = parts[i].slice(0, parts[i].length - lm[1].length);
    if (!/\d/.test(l) || !/\d/.test(r) || /(mod|of|√|∛|³|[:$])\s*$/.test(pre) || /^\s*[\d.]+\s*$/.test(l) && /^\s*[\d.]+\s*$/.test(r) && false) continue;
    if (/[√∛³]/.test(l + r)) continue;
    const a = val(l), b = val(r);
    if (a == null || b == null) continue;
    if (Math.abs(a - b) > 1e-9) bad.push(`${l} = ${r}`);
  }
  return bad;
}
/** Evaluate a path question string. */
function evalQ(q) {
  let m;
  if ((m = /^(\d+)²$/.exec(q))) return m[1] ** 2;
  if ((m = /^(\d+)³$/.exec(q))) return m[1] ** 3;
  if ((m = /^√(\d+)$/.exec(q))) return Math.sqrt(+m[1]);
  if ((m = /^∛(\d+)$/.exec(q))) return Math.round(Math.cbrt(+m[1]));
  if ((m = /^(\d+) mod (\d+)$/.exec(q))) return m[1] % m[2];
  if ((m = /^([\d.]+)% of (\d+)$/.exec(q))) return (m[1] * m[2]) / 100;
  if ((m = /^(\d+)\/(\d+) of (\d+)$/.exec(q))) return (m[1] * m[3]) / m[2];
  if ((m = /^Simplify (.+)$/.exec(q))) return val(m[1]);
  if ((m = /^([\d.]+)% tip on \$(\d+)$/.exec(q))) return (m[1] * m[2]) / 100;
  if ((m = /^([\d.]+)% off \$(\d+)$/.exec(q))) return m[2] - (m[1] * m[2]) / 100;
  if ((m = /^([\d.]+) km in m$/.exec(q))) return Math.round(m[1] * 1000);
  if ((m = /^([\d.]+) kg in g$/.exec(q))) return Math.round(m[1] * 1000);
  if ((m = /^Minutes from (\d+):(\d+) to (\d+):(\d+)$/.exec(q))) return (m[3] * 60 + +m[4]) - (m[1] * 60 + +m[2]);
  return val(q);
}
const ansVal = (a) => (a.includes('/') ? a.split('/')[0] / a.split('/')[1] : +a);

test('five stages per skill, in the five kinds, for all thirteen skills', () => {
  assert.equal(PATH_STAGES, 5); assert.equal(SP, 5); assert.equal(KINDS.length, 5);
  assert.deepEqual(Object.keys(PATHS).sort(), [...IDS].sort());
  for (const k of IDS) {
    assert.equal(PATHS[k].stages.length, 5, k);
    PATHS[k].stages.forEach((s, i) => assert.equal(s.kind, i, `${k} stage ${i} kind`));
  }
});

test('every stage can teach, demonstrate, practise and assess', () => {
  for (const k of IDS) PATHS[k].stages.forEach((s, i) => {
    const w = `${k}/${i}`;
    assert.ok(s.t && s.g && s.key, w + ' titles');
    assert.ok(s.teach.length >= 1 && s.teach.every((x) => x.length > 20), w + ' teach');
    assert.ok(s.demo.length >= 2 && s.demo.length <= 3, w + ' demos');
    s.demo.forEach((d) => { assert.ok(d.st.length >= 3, w + ' steps ' + d.q); assert.ok(d.st[d.st.length - 1].replace(/−/g, '-').includes(d.a), `${w} ${d.q}: last step must contain ${d.a}`); });
    assert.ok(s.d >= 1 && s.d <= 12, w + ' difficulty');
  });
});

test('worked examples: the final answer is right and every equality in every step is true', () => {
  for (const k of IDS) PATHS[k].stages.forEach((s, i) => s.demo.forEach((d) => {
    const v = evalQ(d.q);
    assert.ok(v != null, `cannot evaluate ${d.q}`);
    assert.ok(Math.abs(v - ansVal(d.a)) < 1e-9, `${k}/${i}: ${d.q} = ${v}, not ${d.a}`);
    d.st.forEach((line) => assert.deepEqual(badEqualities(line), [], `${k}/${i} ${d.q}: "${line}"`));
  }));
});

test('every stage pattern really is produced by the generator, and the original ten skills ask whole-number answers', () => {
  const R = seeded(7);
  for (const k of IDS) PATHS[k].stages.forEach((s, i) => {
    if (!s.p) return;
    const whole = ORIG.includes(k);
    const seen = new Set();
    for (let n = 0; n < 40; n++) { const p = stageQuestion(k, s, n, R); seen.add(p.pt); assert.ok(!whole || Number.isInteger(+p.a), `${k}/${i} ${p.q}`); assert.ok(s.p.includes(p.pt), `${k}/${i} produced ${p.pt}, wanted ${s.p}`); }
    assert.deepEqual([...seen].sort(), [...s.p].sort(), `${k}/${i} covers all its patterns`);
  });
});

test('every trick is linked from a stage, and each is in a stage of its own skill', () => {
    const linked = new Map();
  for (const k of IDS) PATHS[k].stages.forEach((s) => (s.tr || []).forEach((id) => linked.set(id, k)));
  for (const t of TRICKS.filter((x) => !x.pack)) assert.equal(linked.get(t.id), t.sk, `trick ${t.id} is linked from its own skill's path`);
});

test('progress: stages unlock in order, retention checks wait for the mastery test and then for the clock', () => {
  replaceState(fresh());
  const k = 'mul', t0 = Date.now();
  let p = progress(k);
  assert.deepEqual(p.stages.map((s) => s.state), ['open', 'locked', 'locked', 'locked', 'locked']);
  assert.equal(p.started, false); assert.equal(p.pct, 0);
  donePhase(k, 0, 0); donePhase(k, 0, 1); donePhase(k, 0, 2);
  p = progress(k);
  assert.equal(p.stages[0].state, 'current'); assert.equal(p.stages[0].ph, 3); assert.equal(p.stages[1].open, false);
  recordCheck(k, 0, 'check', { pass: false, correct: 2, n: 5 });
  assert.equal(progress(k).stages[1].open, false, 'a failed check does not unlock the next stage');
  recordCheck(k, 0, 'check', { pass: true, correct: 4, n: 5 }, t0);
  p = progress(k);
  assert.equal(p.stages[0].state, 'done'); assert.equal(p.stages[1].open, true); assert.ok(p.stages[0].sc >= 0.8);
  assert.equal(retState(k, 0).state, 'locked');
  for (let i = 1; i < 5; i++) recordCheck(k, i, i == 4 ? 'test' : 'check', { pass: true, correct: 5, n: 5 }, t0);
  assert.equal(progress(k).assessed, true); assert.equal(progress(k).mastered, false);
  assert.equal(retState(k, 0, t0 + 1000).state, 'waiting');
  assert.equal(retState(k, 0, t0 + DAY).state, 'due');
  assert.equal(retState(k, 1, t0 + 30 * DAY).state, 'locked', 'the week check needs the day check first');
  recordCheck(k, 4, 'retain', { pass: false, ret: 0 }, t0 + DAY);
  assert.equal(retState(k, 0, t0 + DAY + 1000).state, 'waiting', 'a failed check waits a day before a retry');
  assert.equal(retState(k, 0, t0 + DAY + RETRY_GAP).state, 'retry');
  recordCheck(k, 4, 'retain', { pass: true, ret: 0 }, t0 + 2 * DAY);
  assert.equal(retState(k, 0).state, 'done');
  assert.equal(retState(k, 1, t0 + 2 * DAY + 6 * DAY).state, 'waiting');
  assert.equal(retState(k, 1, t0 + 2 * DAY + 7 * DAY).state, 'due');
  recordCheck(k, 4, 'retain', { pass: true, ret: 1 }, t0 + 9 * DAY);
  p = progress(k);
  assert.equal(p.mastered, true); assert.equal(p.pct, 1); assert.equal(p.done, p.total);
});

test('judging: accuracy gates a check; the mastery test also needs pace', () => {
  const row = (ok, r = 0.8, extra = {}) => ({ ok, first: true, hinted: false, r, ...extra });
  const rows = (n, wrong, r) => Array.from({ length: n }, (_, i) => row(i >= wrong, r));
  assert.equal(judge('check', rows(5, 1), PATHS.add.stages[0]).pass, true);
  assert.equal(judge('check', rows(5, 2), PATHS.add.stages[0]).pass, false);
  assert.equal(judge('check', [row(true), row(true), row(true), row(true, 1, { first: false }), row(true, 1, { first: false })], {}).pass, false, 'a slip fixed afterwards is not a first-try answer');
  assert.equal(judge('check', [row(true), row(true), row(true), row(true, 1, { hinted: true }), row(true, 1, { hinted: true })], {}).pass, false, 'a hinted answer does not count');
  assert.equal(judge('test', rows(12, 2, 1.0), {}).pass, true);
  const slow = judge('test', rows(12, 0, 1.6), {});
  assert.equal(slow.pass, false); assert.equal(slow.reason, 'pace');
  assert.equal(judge('test', rows(12, 3, 0.8), {}).reason, 'accuracy');
  assert.equal(judge('retain', rows(6, 1, 1.2), {}).pass, true);
  assert.equal(judge('practise', [], {}).pass, true, 'practice is never a gate');
  assert.equal(checkMode(4), 'test'); assert.equal(checkMode(2), 'check');
});

test('nextUp prefers a due retention check, then the path in progress, then the weakest skill', () => {
  replaceState(fresh());
  assert.equal(nextUp('dec').k, 'dec'); assert.equal(nextUp('dec').kind, 'start');
  donePhase('sq', 0, 0);
  assert.equal(nextUp('dec').k, 'sq'); assert.equal(nextUp('dec').kind, 'continue');
  const t0 = Date.now() - 3 * DAY;
  for (let i = 0; i < 5; i++) recordCheck('add', i, 'check', { pass: true, correct: 5, n: 5 }, t0);
  const n = nextUp('dec');
  assert.equal(n.k, 'add'); assert.equal(n.kind, 'retain'); assert.equal(n.ret, 0);
});

test('nextUp falls back to another path when the weakest/default path is already assessed', () => {
  replaceState(fresh());
  for (let i = 0; i < 5; i++) recordCheck('mul', i, i == 4 ? 'test' : 'check', { pass: true, correct: 5, n: 5 });
  assert.equal(progress('mul').assessed, true);
  const n = nextUp('mul');
  assert.ok(n, 'another path is still available');
  assert.notEqual(n.k, 'mul');
  assert.equal(n.kind, 'start');
  // Once every path is assessed there is nothing left to suggest.
  for (const k of IDS) if (k != 'mul') for (let i = 0; i < 5; i++) recordCheck(k, i, i == 4 ? 'test' : 'check', { pass: true, correct: 5, n: 5 });
  assert.equal(nextUp('mul'), null);
});

test('state: path progress is sanitised on load and merges to the furthest progress, order-independently', () => {
  const junk = migrate({ paths: { mul: { st: [{ ph: 99, pass: 'x', sc: 7 }, null, 5], ret: 'no' }, nope: { st: [] }, add: 'bad' } });
  assert.deepEqual(Object.keys(junk.paths), ['mul']);
  assert.equal(junk.paths.mul.st.length, 5); assert.equal(junk.paths.mul.ret.length, PATH_RET);
  assert.equal(junk.paths.mul.st[0].ph, 3); assert.equal(junk.paths.mul.st[0].pass, 0); assert.equal(junk.paths.mul.st[0].sc, 1);
  assert.deepEqual(cleanPaths(undefined), {});
  const mk = (st0, ret0) => { const s = fresh(); s.paths = { mul: cleanPaths({ mul: { st: [st0], ret: [ret0] } }).mul || undefined }; if (!s.paths.mul) s.paths = {}; return s; };
  const a = mk({ ph: 2, sc: 0.4 }, { t: 0, ok: 0 }), b = mk({ ph: 3, pass: 500, sc: 0.8 }, { t: 9, ok: 1 });
  a.u = 5; b.u = 1;
  const m1 = mergeStates(a, b), m2 = mergeStates(b, a);
  assert.deepEqual(m1.paths, m2.paths);
  assert.equal(m1.paths.mul.st[0].pass, 500); assert.equal(m1.paths.mul.ret[0].ok, 1);
  const c = fresh(); c.u = 9; assert.equal(mergeStates(c, b).paths.mul.st[0].pass, 500, 'a newer device with no path progress cannot erase it');
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(m1))).paths, m1.paths, 'idempotent');
});

test('PathSession: fixed length, stage questions only, ratings frozen, mistakes reach the notebook', () => {
  replaceState(fresh());
  const before = JSON.stringify(S.sk), R = seeded(3);
  const se = new PathSession('mul', 2, 'check', { rand: R });
  let n = 0;
  while (!se.finished) {
    assert.ok(se.next()); n++;
    assert.ok(PATHS.mul.stages[2].p.includes(se.cur.pt), se.cur.pt);
    if (n == 2) { let r = 'more'; for (const c of '9'.repeat(String(se.cur.a).length + 2)) if (r == 'more') r = se.judgeBuf(c); assert.equal(r, 'bad'); se.record(false); } else { let r = 'more'; for (const c of String(se.cur.a)) r = se.judgeBuf(c); assert.equal(r, 'ok'); se.record(true); }
  }
  assert.equal(n, 5); assert.equal(se.rows.length, 5);
  assert.equal(JSON.stringify(S.sk), before, 'ratings never move');
  assert.equal(S.sessions.length, 0, 'no session is recorded');
  assert.equal(Object.keys(S.weak).length, 1, 'the missed question is queued for review');
  const v = se.verdict();
  assert.equal(v.correct, 4); assert.equal(v.pass, true);
  assert.equal(new Set(se.rows.map((r) => qk(r.q))).size, 5, 'no repeats within a run');
});

test('retention constants line up with the data', () => {
  assert.equal(RET.length, PATH_RET);
});

test('PathSession takes the symbols of the new skills: minus, slash and point', () => {
  replaceState(fresh());
  for (const [k, ch] of [['neg', '-'], ['frac', '/'], ['life', '.']]) {
    const R = seeded(11); let hit = 0;
    for (let n = 0; n < 60 && !hit; n++) {
      const se = new PathSession(k, 2, 'check', { rand: R });
      se.next();
      if (!String(se.cur.a).includes(ch)) continue;
      let r = 'more'; for (const c of String(se.cur.a)) r = se.judgeBuf(c);
      assert.equal(r, 'ok', `${k}: ${se.cur.q} = ${se.cur.a}`); hit++;
    }
    assert.ok(hit, k + ' produced an answer with ' + ch);
  }
});
