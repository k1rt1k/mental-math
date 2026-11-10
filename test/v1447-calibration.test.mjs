// v14.47: training-calibration simulation. The real Session is driven by synthetic learners with
// known ability, so we can check the difficulty curve, stuck states, pattern mix, skill exposure and
// whether the rating ends up describing the learner rather than the random walk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDS } from '../public/js/engine.js';
import { PERSONAS, simulate, spearman } from '../tools/sim.mjs';

const SESSIONS = 30, SEED = 7;   // 13 skills now, so 30 sessions gives each skill the exposure 24 gave when there were 10
const runs = Object.values(PERSONAS).map((p) => simulate(p, { sessions: SESSIONS, seed: SEED }));
const byName = Object.fromEntries(runs.map((r) => [r.persona, r]));

test('every persona is exposed to every skill and no single pattern swallows the drill', () => {
  for (const r of runs) {
    assert.equal(r.skillsSeen, IDS.length, `${r.persona}: only ${r.skillsSeen}/${IDS.length} skills were served`);
    assert.ok(r.minSkill >= 4, `${r.persona}: one skill got only ${r.minSkill} questions`);
    assert.ok(r.patterns >= 8, `${r.persona}: only ${r.patterns} distinct patterns`);
    assert.ok(r.topShare <= 0.35, `${r.persona}: "${r.topPattern}" is ${Math.round(r.topShare * 100)}% of questions`);
  }
});

test('difficulty climbs steadily rather than jumping, and learners do not get stuck', () => {
  for (const r of runs) {
    assert.ok(r.maxDifficultyJump <= 2, `${r.persona}: difficulty jumped ${r.maxDifficultyJump.toFixed(1)} levels in one session`);
    assert.ok(r.worstColdStreak <= 8, `${r.persona}: ${r.worstColdStreak} wrong in a row`);
    assert.ok(r.roughSessions <= Math.max(2, Math.floor(SESSIONS * 0.2)), `${r.persona}: ${r.roughSessions} sessions under 50% accuracy`);
    assert.ok(r.lateAccuracy >= 0.55, `${r.persona}: late accuracy is only ${Math.round(r.lateAccuracy * 100)}%`);
    assert.ok(r.avgAccuracy >= 0.6, `${r.persona}: overall accuracy is only ${Math.round(r.avgAccuracy * 100)}%`);
  }
});

test('after enough practice the ratings describe real ability, including an uneven learner', () => {
  for (const r of runs) {
    assert.ok(r.mae <= 1.15, `${r.persona}: ratings miss the latent level by ${r.mae.toFixed(2)} on average`);
  }
  // Equal-latent personas have tied ranks, so only the uneven profile has a meaningful rank order.
  assert.ok(byName.Uneven.rankCorrelation >= 0.7, `Uneven: rating order does not track ability (rho ${byName.Uneven.rankCorrelation.toFixed(2)})`);
  const strong = IDS.filter((k) => byName.Uneven.latent[k] >= 8);
  const weak = IDS.filter((k) => byName.Uneven.latent[k] <= 5.5);
  const strongAvg = strong.reduce((a, k) => a + byName.Uneven.ratings[k], 0) / strong.length;
  const weakAvg = weak.reduce((a, k) => a + byName.Uneven.ratings[k], 0) / weak.length;
  assert.ok(strongAvg - weakAvg >= 1.5, `the uneven path should separate strong and weak skills (${strongAvg.toFixed(1)} vs ${weakAvg.toFixed(1)})`);
});

test('the calibration CLI follows the live skill count instead of a stale ten', () => {
  const src = readFileSync(new URL('../tools/calibrate.mjs', import.meta.url), 'utf8');
  assert.match(src, /import \{ IDS \}/);
  assert.match(src, /IDS\.length/);
  assert.doesNotMatch(src, /skillsSeen\s*(?:!==|===)\s*10|skillsSeen\}\/10/);
});

test('the rank helper handles ties instead of returning a division by zero', () => {
  assert.equal(spearman({ add: 5, sub: 5 }, { add: 3, sub: 3 }, ['add', 'sub']), 0);
  const rho = spearman({ add: 1, sub: 2, mul: 3, div: 4 }, { add: 10, sub: 20, mul: 30, div: 40 }, ['add', 'sub', 'mul', 'div']);
  assert.ok(Math.abs(rho - 1) < 1e-12);
});
