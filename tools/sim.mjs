// Calibration simulator: runs the real Session against synthetic learners so the difficulty curve,
// the rating model and question selection can be checked without a browser or a human.
//
// Each learner has a latent level per skill (what they can actually solve) and a speed factor.
// A question at difficulty d is answered correctly with a probability that falls as d rises above
// the learner's latent level. The app only sees answers, so the rating has to find that level on
// its own; these metrics show whether it does, and whether the ride is fair on the way.
import { S, replaceState, fresh } from '../public/js/state.js';
import { Session } from '../public/js/session.js';
import { IDS, T } from '../public/js/engine.js';
import { seeded } from '../public/js/util.js';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const uniform = (lv) => Object.fromEntries(IDS.map((k) => [k, lv]));

/** Four learners that cover the range the calibration must serve. */
export const PERSONAS = {
  beginner: { label: 'Beginner', latent: uniform(2.6), pace: 1.0 },
  intermediate: { label: 'Intermediate', latent: uniform(5.6), pace: 0.88 },
  advanced: { label: 'Advanced', latent: uniform(8.2), pace: 0.75 },
  uneven: {
    label: 'Uneven',
    latent: { add: 8.4, sub: 7.8, mul: 8.6, div: 7.2, sq: 8.2, pw: 6.4, pct: 7.4, ops: 4.8, mod: 6.2, dec: 5.4, neg: 6.6, frac: 6.0, life: 6.2 },
    pace: 0.9,
  },
};

const clock = (start = 1_700_000_000_000) => { let t = start; return { now: () => t, adv: (ms) => (t += ms) }; };

/**
 * One simulated session. `rand` is the seeded question stream; the same stream decides both the
 * generated question and whether the learner solves it, so runs are reproducible.
 */
function playSession(persona, rand, wall, cfg) {
  const s = new Session(undefined, { cfg, rand, now: wall.now, wall: wall.now });
  s.begin();
  s.next();
  const questions = [];
  while (s.cur && !s.over) {
    const p = s.cur, latent = persona.latent[p.sk] ?? 5.6;
    // A learner is about 90% likely to solve a question at their own level, and near par pace;
    // easier questions raise both, harder ones lower both. Ratings have to discover that level.
    const pOk = clamp(0.91 + 0.18 * (latent - p.d), 0.05, 0.995);
    const par = T(p.sk, p.d, p.a);
    wall.adv(Math.max(250, par * persona.pace * (0.9 + rand() * 0.2) * 1000));
    s.tick();
    const ok = rand() < pOk;
    questions.push({ sk: p.sk, d: p.d, pt: p.pt || '', ok, rt: !!p.rt, tries: p.tries || 0 });
    s.answer(ok);
    if (!s.next()) break;
    if (s.timedOut) break;
  }
  const out = s.finish();
  return { questions, out };
}

/** Average ranks, so Spearman works with ties (the uniform personas have equal latent levels). */
function ranks(xs) {
  const order = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[order[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

function pearson(xs, ys) {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; num += a * b; dx += a * a; dy += b * b; }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

/** Spearman rank correlation between the final ratings and the learner's real level. */
export const spearman = (ratings, latent, keys = IDS) => pearson(ranks(keys.map((k) => ratings[k])), ranks(keys.map((k) => latent[k])));

/**
 * Run one persona. `sessions` is the number of timed 120-second mixed sessions.
 * Returns raw facts plus the handful of metrics the calibration test and report use.
 */
export function simulate(persona, { sessions = 24, seed = 7, dur = 120 } = {}) {
  replaceState(fresh());
  const rand = seeded(seed), wall = clock();
  const all = [], perSession = [];
  for (let i = 0; i < sessions; i++) {
    const run = playSession(persona, rand, wall, { only: 'all', dur });
    all.push(...run.questions);
    const q = run.questions;
    perSession.push({
      n: q.length,
      ok: q.filter((x) => x.ok).length,
      acc: q.length ? q.filter((x) => x.ok).length / q.length : 0,
      avgD: q.length ? q.reduce((a, x) => a + x.d, 0) / q.length : 0,
      saved: !!run.out,
      rating: Object.fromEntries(IDS.map((k) => [k, S.sk[k].lv])),
    });
  }

  const skillCounts = Object.fromEntries(IDS.map((k) => [k, all.filter((x) => x.sk === k).length]));
  const patternCounts = {};
  all.forEach((x) => { if (x.pt) patternCounts[x.pt] = (patternCounts[x.pt] || 0) + 1; });
  const patterns = Object.entries(patternCounts).sort((a, b) => b[1] - a[1]);
  const top = patterns[0] || ['', 0];
  const ratings = Object.fromEntries(IDS.map((k) => [k, S.sk[k].lv]));
  const diffs = perSession.map((x) => x.avgD);
  const jumps = diffs.slice(1).map((d, i) => d - diffs[i]);

  let cold = 0, worstCold = 0;
  all.forEach((x) => { cold = x.ok ? 0 : cold + 1; worstCold = Math.max(worstCold, cold); });

  const late = perSession.slice(Math.max(3, Math.floor(sessions / 2)));
  const lateAcc = late.length ? late.reduce((a, x) => a + x.acc, 0) / late.length : 0;
  const mae = IDS.reduce((a, k) => a + Math.abs(ratings[k] - persona.latent[k]), 0) / IDS.length;

  return {
    persona: persona.label, sessions, questions: all.length,
    skillCounts, skillsSeen: IDS.filter((k) => skillCounts[k] > 0).length, minSkill: Math.min(...IDS.map((k) => skillCounts[k])),
    patterns: patterns.length, topPattern: top[0], topShare: all.length ? top[1] / all.length : 0,
    avgAccuracy: all.length ? all.filter((x) => x.ok).length / all.length : 0,
    perSession, avgDifficulty: diffs, finalAvgDifficulty: diffs[diffs.length - 1] || 0,
    maxDifficultyJump: Math.max(0, ...jumps), maxDifficultyDrop: Math.max(0, ...jumps.map((j) => -j)),
    worstColdStreak: worstCold,
    roughSessions: perSession.slice(3).filter((x) => x.acc < 0.5).length,
    lateAccuracy: lateAcc,
    ratings, latent: persona.latent, mae, rankCorrelation: spearman(ratings, persona.latent),
  };
}

/** The four-persona calibration report the CLI prints. */
export function report(opts = {}) {
  return Object.values(PERSONAS).map((p) => simulate(p, opts));
}
