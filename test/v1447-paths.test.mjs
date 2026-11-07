// v14.47: guided learning paths. Every skill has the same five-stage journey, progress is stored
// per skill/stage, and a stage only completes after the worked example and a passing assessment.
// The mastery stage also gates on delayed retention for that skill.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { S, replaceState, fresh, migrate, mergeStates, recordRecall, RECALL_GAP } from '../public/js/state.js';
import { Session } from '../public/js/session.js';
import { IDS } from '../public/js/engine.js';
import { TRICKS } from '../public/js/tricks.js';
import { seeded } from '../public/js/util.js';
import {
  PATHS, pathFor, stageCfg, stageState, pathProgress, recordPathDemo, recordPathRun,
  retentionFor, demoQuestion, goalText,
} from '../public/js/paths.js';

const STAGES = ['foundation', 'intermediate', 'shortcuts', 'independent', 'mastery'];
const BASE = 1_700_000_000_000;

test('all ten skills have the same five-stage journey, with teaching and a goal at every stage', () => {
  assert.deepEqual(Object.keys(PATHS).sort(), [...IDS].sort());
  for (const sk of IDS) {
    const p = PATHS[sk];
    assert.ok(p.title && p.blurb, sk + ': title and blurb');
    assert.equal(p.stages.length, 5, sk + ': five stages');
    assert.deepEqual(p.stages.map((s) => s.id), STAGES, sk + ': stage order');
    p.stages.forEach((st, i) => {
      assert.ok(st.teach.length > 40, sk + ' ' + st.id + ': real teaching text');
      assert.ok(st.goal.n > 0 && st.goal.acc > 0 && st.goal.acc <= 1 && st.goal.spd > 0, sk + ' ' + st.id + ': goal');
      assert.equal(st.drill.only, sk, sk + ' ' + st.id + ': drill only serves this skill');
      assert.equal(st.drill.dur, st.dur);
      assert.equal(st.assess, goalText(st.goal));
      if (i === 2 && st.tricks.length) assert.ok(st.tricks.every((t) => t.sk === sk), sk + ': shortcuts belong to the skill');
    });
    assert.equal(p.stages[4].id, 'mastery');
    assert.ok(p.stages[4].retention && p.stages[4].retention.min >= 5);
  }
});

test('stage drills rotate through real trick patterns only where a trick names one', () => {
  const mul = stageCfg('mul', 3);
  assert.equal(mul.only, 'mul');
  assert.deepEqual(mul.pats, ['×11 trick', '×25 trick', '×99/×101 trick', 'near-100 trick'], 'the ×11, ×25, ×99 and near-100 patterns rotate');
  assert.equal(stageCfg('mul', 1).pats, undefined, 'foundation is mixed, not a pattern drill');
  assert.equal(stageCfg('sq', 3).pats.length, 3);
  assert.equal(stageCfg('add', 3).pats, undefined, 'a trick with no generator pattern stays mixed');
  assert.equal(stageCfg('nope', 1), null);
  assert.equal(pathFor('nope'), null);
});

test('a stage needs the worked example and a passing run before it completes', () => {
  replaceState(fresh());
  const run = { n: 12, ok: 11, ft: 10, spd: 1.2 };
  recordPathDemo('mul', 1);
  let r = recordPathRun('mul', 1, run, BASE);
  assert.equal(r.pass, true);
  assert.equal(r.complete, true);
  assert.equal(r.pathDone, 1);
  assert.equal(stageState('mul', 1).demo, true);
  assert.equal(stageState('mul', 1).passed, true);

  replaceState(fresh());
  recordPathRun('mul', 1, run, BASE);
  assert.equal(stageState('mul', 1).passed, true);
  assert.equal(stageState('mul', 1).complete, false, 'seeing the method is required too');
  recordPathDemo('mul', 1, BASE + 1);
  assert.equal(stageState('mul', 1).complete, true);

  replaceState(fresh());
  recordPathDemo('mul', 1);
  assert.equal(recordPathRun('mul', 1, { n: 8, ok: 8, ft: 5, spd: 1.2 }, BASE).pass, false, 'accuracy below the goal fails');
  assert.equal(recordPathRun('mul', 1, { n: 8, ok: 8, ft: 8, spd: 1.9 }, BASE + 1).pass, false, 'too slow fails');
  assert.equal(recordPathRun('mul', 1, { n: 5, ok: 5, ft: 5, spd: 1.0 }, BASE + 2).pass, false, 'too few answers fails');
  assert.equal(stageState('mul', 1).complete, false);
});

test('a passing run is sticky: a later worse run keeps the pass and the better metrics', () => {
  replaceState(fresh());
  recordPathDemo('mul', 2);
  recordPathRun('mul', 2, { n: 12, ok: 12, ft: 11, spd: 1.1 }, BASE);
  const before = { ...S.paths.mul[2] };
  recordPathRun('mul', 2, { n: 12, ok: 12, ft: 3, spd: 0.8 }, BASE + 5);
  assert.equal(S.paths.mul[2].pass, before.pass);
  assert.equal(S.paths.mul[2].ft, before.ft, 'the failed run did not replace the better first-try record');
  assert.equal(stageState('mul', 2).complete, true);
  assert.equal(pathProgress('mul').done >= 1, true);
});

test('mastery waits for per-skill delayed retention with at least five paired questions', () => {
  replaceState(fresh());
  recordPathDemo('mul', 5);
  recordPathRun('mul', 5, { n: 16, ok: 16, ft: 15, spd: 1.1 }, BASE);
  assert.equal(stageState('mul', 5).passed, true);
  assert.equal(stageState('mul', 5).complete, false, 'passing the timed test is not mastery on its own');
  assert.equal(retentionFor('mul').met, false);

  // Four remembered, one forgotten: 80% is above the 60% bar, but only mul questions count.
  for (let i = 0; i < 5; i++) {
    const q = `${i + 2} × ${i + 3}`;
    recordRecall(q, i < 4, BASE, true, 'mul');
    recordRecall(q, i < 4, BASE + RECALL_GAP, true, 'mul');
  }
  const r = retentionFor('mul');
  assert.equal(r.cohort, 5);
  assert.equal(r.retentionRate, 0.8);
  assert.equal(r.met, true);
  assert.equal(stageState('mul', 5).complete, true);
  assert.equal(pathProgress('mul').complete, false, 'the other four stages still have to be done');

  // A global pair without a skill must not leak into the mul cohort.
  replaceState(fresh());
  recordRecall('9 × 9', true, BASE, true, '');
  recordRecall('9 × 9', true, BASE + RECALL_GAP, true, '');
  assert.equal(retentionFor('mul').cohort, 0);
});

test('migration sanitises path rows and merge keeps the best run plus monotonic demo/pass', () => {
  const m = migrate({
    paths: {
      mul: {
        1: { n: '10', ok: '9', ft: '8', spd: '1.25', demo: 1, pass: BASE, seen: 1, at: BASE },
        9: { n: 1 },                       // no sixth stage
        x: { n: 1 },                       // not a stage id
      },
      bad: { 1: { n: 1 } },                 // not a skill
      nope: 'x',
    },
  });
  assert.deepEqual(Object.keys(m.paths), ['mul']);
  assert.deepEqual(Object.keys(m.paths.mul), ['1']);
  assert.equal(m.paths.mul[1].n, 10);
  assert.equal(m.paths.mul[1].ft, 8);
  assert.equal(m.paths.mul[1].pass, BASE);

  const a = migrate({ paths: { mul: { 1: { n: 10, ok: 10, ft: 8, spd: 1.1, demo: 1, pass: BASE, at: BASE } } } });
  const b = migrate({ paths: { mul: { 1: { n: 12, ok: 12, ft: 12, spd: 1.0, demo: 0, pass: 0, at: BASE + 50 } } } });
  const merged = mergeStates(a, b);
  assert.equal(merged.paths.mul[1].demo, 1, 'demo is monotonic');
  assert.equal(merged.paths.mul[1].pass, BASE, 'pass is monotonic');
  assert.equal(merged.paths.mul[1].ft, 8, 'the passing run keeps its metrics');
  assert.equal(merged.paths.mul[1].at, BASE + 50);
});

test('a real session records its stage run, and "Play again" metadata survives separately', () => {
  replaceState(fresh());
  let t = BASE;
  const now = () => t;
  const s = new Session(undefined, { cfg: { only: 'mul', dur: 30 }, now, wall: now, rand: seeded(12), path: { sk: 'mul', stage: 1 } });
  assert.deepEqual(s.path, { sk: 'mul', stage: 1 });
  s.begin(); s.next();
  for (let i = 0; i < 12 && s.cur; i++) {
    t += 2500; s.tick();
    s.answer(true);
    if (!s.next()) break;
  }
  const out = s.finish();
  assert.ok(out && out.path, 'the run was saved and carries its path result');
  assert.equal(out.path.sk, 'mul');
  assert.equal(out.path.stage, 1);
  assert.ok(S.paths.mul[1].n >= 8);
  assert.ok(S.paths.mul[1].ft >= 8);
  assert.equal(out.path.complete, false, 'no worked example was seen, so the stage is not complete');
  assert.equal(typeof out.path.pass, 'boolean');
});

test('the Learn screen exposes the path, the worked example and a practice button for every stage', () => {
  const learn = readFileSync(new URL('../public/js/views/learn.js', import.meta.url), 'utf8');
  const results = readFileSync(new URL('../public/js/views/results.js', import.meta.url), 'utf8');
  for (const needle of ['data-act="pathPick"', 'data-act="pathDemo"', 'data-act="pathPractise"', 'class="stages"', 'stage-checks', 'goalText', 'const n = i + 1', 'data-v="${n}"']) {
    assert.ok(learn.includes(needle), 'learn.js is missing ' + needle);
  }
  assert.ok(results.includes('data-act="openPath"'), 'results should link back to the guided path');
  assert.ok(results.includes('out.path'), 'results should read the path result from finish()');
});
