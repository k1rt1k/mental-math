import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { S, replaceState, fresh, migrate } from '../public/js/state.js';
import { Session, SPRINT, sprintScore } from '../public/js/session.js';
import { MS, ctx, records, shareLine, coach } from '../public/js/stats.js';
import { seeded } from '../public/js/util.js';

const src = (f) => fs.readFileSync(new URL('../public/' + f, import.meta.url), 'utf8');
const clock = () => { let t = 0; return { now: () => t, adv: (ms) => (t += ms) }; };

/** Run a Sprint: `slips` wrong full-length entries and `skips` skips among the first questions, everything else right at 2 s each. */
function sprint({ slips = 0, skips = 0, stop = SPRINT } = {}) {
  const c = clock(), s = new Session('sprint', { now: c.now, rand: seeded(11) });
  s.begin(); s.next();
  for (let i = 0; i < stop; i++) {
    c.adv(2000); s.tick();
    if (i < slips) { const w = String(s.cur.a).split('').map((d) => (/\d/.test(d) ? (+d + 1) % 10 : d)).join(''); for (const d of w) s.type(d); s.back(); }
    if (i >= slips && i < slips + skips) s.answer(false);
    else for (const d of String(s.cur.a)) if (s.type(d) == 'ok') { s.answer(true); break; }
    if (s.n >= s.target) break;
    s.next();
  }
  return s;
}

test('sprint: 20 questions, penalties add seconds, ratings stay put', () => {
  replaceState(fresh());
  const lv0 = JSON.stringify(Object.values(S.sk).map((x) => x.lv));
  const s = sprint({ slips: 2, skips: 1 });
  assert.equal(s.kind, 'sprint'); assert.equal(s.target, SPRINT); assert.equal(s.n, SPRINT);
  assert.equal(s.slips, 2); assert.equal(s.skips, 1);
  const out = s.finish();
  assert.ok(out && out.full);
  assert.equal(out.sprint, sprintScore(s.el, 2, 1));
  assert.equal(out.sprint, +(s.el + 6 + 5).toFixed(1));
  assert.equal(JSON.stringify(Object.values(S.sk).map((x) => x.lv)), lv0, 'a sprint never moves ratings');
  assert.equal(S.best.sprint.t, out.sprint); assert.equal(S.sessions[0].sc, out.sprint);
  assert.match(out.tag, /First Sprint/);
});

test('sprint: only a faster time replaces the best; an early exit is never a best', () => {
  replaceState(fresh());
  const a = sprint().finish();
  const slow = sprint({ slips: 3 }).finish();
  assert.equal(S.best.sprint.t, a.sprint); assert.equal(slow.newBest, false); assert.match(slow.tag, /best time is/);
  S.best.sprint.t = 999;
  const fast = sprint().finish();
  assert.equal(fast.newBest, true); assert.match(fast.tag, /New best time/); assert.ok(S.best.sprint.t < 999);
  const early = sprint({ stop: 8 }); assert.ok(early.n < SPRINT);
  const e = early.finish(); assert.equal(e.full, false); assert.match(e.tag, /Ended early/);
  assert.ok(S.best.sprint.t < 999 && S.best.sprint.t == fast.sprint, 'best unchanged by an early exit');
});

test('sprint: milestones, records, share line and coach text know about it', () => {
  replaceState(fresh());
  assert.equal(ctx().spt, 9999);
  S.best.sprint = { t: 38.5, pts: 500, n: 20 };
  const ok = MS.filter((m) => m[2](ctx())).map((m) => m[0]);
  for (const id of ['sp1', 'sp60', 'sp40']) assert.ok(ok.includes(id), id);
  assert.ok(records().some(([l, v]) => /Sprint/.test(l) && v == '38.5 s'));
  assert.match(shareLine({ m: 'sprint', dur: 40, ok: 20, n: 20, pts: 500, tm: 2, t: Date.now() }), /Sprint 20/);
  assert.match(coach({ kind: 'sprint', ok: 18, n: 20, slips: 2, skips: 0, by: {} }), /Those cost you 6 s/);
});

test('sprint never touches the saved config or other modes', () => {
  replaceState(fresh()); S.cfg = { dur: 300, only: 'mul' };
  const s = new Session('sprint', { now: clock().now, rand: seeded(1) });
  assert.equal(s.only, 'all'); assert.equal(s.un, true); assert.equal(s.dur, 0); assert.equal(s.mk, 'sprint');
  assert.deepEqual(S.cfg, { dur: 300, only: 'mul' });
  const t = new Session(undefined, { now: clock().now, rand: seeded(1) });
  assert.equal(t.kind, 'focus'); assert.equal(t.target, 0);
});

test('v9 settings survive migration and stay device-local', () => {
  assert.equal(migrate({ rm: true, theme: 'black' }).theme, 'black');
  assert.match(src('js/state.js'), /'padFlip', 'rm'/);
});

test('wiring: Sprint everywhere it should be; Black theme; reduce motion; onboarding goal; reset undo; version', () => {
  assert.match(src('js/views/home.js'), /data-act="sprint"/); assert.match(src('js/views/home.js'), /A\.sprint/);
  assert.match(src('js/main.js'), /start\('sprint'\)/); assert.match(src('js/main.js'), /g == 'sprint'/);
  assert.match(src('js/views/settings.js'), /\['black', 'Black'\]/); assert.match(src('js/views/settings.js'), /'rm'/);
  assert.match(src('css/style.css'), /data-theme=black/); assert.match(src('css/style.css'), /data-motion=reduce/);
  assert.match(src('js/main.js'), /How much will you practise/);
  assert.match(src('js/views/settings.js'), /label: 'Undo'/);
  assert.match(src('js/util.js'), /VERSION = '\d+\.\d+'/);   // the exact number is enforced against sw.js in integrity.test.mjs
});
