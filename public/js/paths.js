// Guided learning paths: five teach → demonstrate → practise → assess stages for every skill.
// The catalogue is pure data; progress lives in `S.paths` (one row per skill + stage) so it syncs
// and merges like the rest of the learner's history.
import { S } from './state.js';
import { IDS, SK, gen } from './engine.js';
import { TRICKS } from './tricks.js';
import { retentionStats, RETENTION_MIN } from './stats.js';
import { clamp } from './util.js';

/** One delayed-retention bar shared by the catalogue, the UI and the tests. */
export const RETENTION_RATE = 0.6;

/** Stage definitions shared by every path. `goal` is checked against one saved run. */
const STAGE_META = [
  {
    id: 'foundation', name: 'Foundation', blurb: 'Start here: the basic facts and the size of the numbers.',
    dur: 60, goal: { n: 8, acc: 0.8, spd: 1.6 },
  },
  {
    id: 'intermediate', name: 'Intermediate', blurb: 'The main method, with carrying, splitting and place value.',
    dur: 90, goal: { n: 10, acc: 0.8, spd: 1.45 },
  },
  {
    id: 'shortcuts', name: 'Mental shortcuts', blurb: 'The tricks that turn a long calculation into one small step.',
    dur: 90, goal: { n: 8, acc: 0.8, spd: 1.45 },
  },
  {
    id: 'independent', name: 'Independent practice', blurb: 'Mixed questions, no pattern hint. Choose the method yourself.',
    dur: 120, goal: { n: 12, acc: 0.85, spd: 1.3 },
  },
  {
    id: 'mastery', name: 'Mastery assessment', blurb: 'A timed test now, then a delayed retention check after seven days.',
    dur: 120, goal: { n: 15, acc: 0.85, spd: 1.25 }, retention: { min: RETENTION_MIN, rate: RETENTION_RATE },
  },
];

/** Per-skill content. `tricks` are shortcut ids from tricks.js; only those with a `pt` drive a pattern drill. */
const SPEC = {
  add: {
    title: 'Addition mastery',
    blurb: 'From quick facts to carrying, left-to-right addition and clean two-digit sums.',
    teach: {
      foundation: 'Start with the biggest place value. 47 + 38 is 47 + 30 = 77, then 77 + 8 = 85. Small numbers first, so the route becomes automatic.',
      intermediate: 'When a column passes ten, carry it once and keep going. Add the tens, then the ones, and fold the carry in at the end.',
      shortcuts: 'Left-to-right addition and rounding one number up, then taking back the difference, save working memory. Try 68 + 29 as 68 + 30 − 1.',
      independent: 'Mixed addition at your current level. No pattern prompt: pick the route that fits the numbers, and put first-try accuracy before speed.',
      mastery: 'A timed mixed addition test. Then the delayed check: questions you answer cleanly now should still be right after seven days.',
    },
    tricks: ['addl'],
  },
  sub: {
    title: 'Subtraction mastery',
    blurb: 'Borrowing, counting up and compensating without losing your place.',
    teach: {
      foundation: 'Subtraction is the reverse of addition. When the gap is small, count up from the smaller number; when a digit is too big, borrow one ten.',
      intermediate: 'For 83 − 47, add 3 to both numbers: 86 − 50 = 36. Compensating turns a borrow into a round number.',
      shortcuts: 'Subtract the nearest round number and correct: 83 − 50 = 33, then add back the 3 you overshot.',
      independent: 'Mixed subtraction with no hint. Watch for the borrow before you start, not halfway through.',
      mastery: 'A timed mixed subtraction test, then a delayed recall check on the questions you answered cleanly.',
    },
    tricks: ['subc'],
  },
  mul: {
    title: 'Multiplication mastery',
    blurb: 'Table facts, two-digit splitting and the ×11, ×25, ×99 and near-100 shortcuts.',
    teach: {
      foundation: 'Multiplication is repeated addition plus place value: 14 × 3 is 10 × 3 + 4 × 3. Know the 2–12 tables cold before two-digit products.',
      intermediate: 'Split the smaller number into tens and ones: 14 × 23 = 14 × 20 + 14 × 3 = 280 + 42 = 322.',
      shortcuts: 'Once splitting is solid, look for structure: ×11, ×25, ×99/×101 and pairs near 100 each collapse into one small calculation.',
      independent: 'Mixed multiplication without a trick prompt. Choose the method that fits the numbers; speed follows accuracy.',
      mastery: 'A timed mixed multiplication test, then a delayed retention check on the questions you answer cleanly.',
    },
    tricks: ['mul11', 'mul25', 'mul99', 'mul100', 'split'],
  },
  div: {
    title: 'Division mastery',
    blurb: 'Quotients, remainders and multiplying up in easy chunks.',
    teach: {
      foundation: 'Division asks “how many groups?”. Use the multiplication table backwards: 56 ÷ 7 = 8 because 7 × 8 = 56.',
      intermediate: 'For larger divisions, multiply up in chunks: 391 ÷ 17 → 17 × 20 = 340, 51 left → 17 × 3 = 51, so 23.',
      shortcuts: 'Estimate the quotient first, then correct it with one multiplication. The gap left over is the remainder.',
      independent: 'Mixed division with no prompt. Say the multiplication fact that proves your answer before you type it.',
      mastery: 'A timed mixed division test, then a delayed recall check on the questions you answered cleanly.',
    },
    tricks: ['divm'],
  },
  sq: {
    title: 'Squares mastery',
    blurb: 'Squares to know cold, then the endings-in-5, near-50 and near-100 patterns.',
    teach: {
      foundation: 'A square is a number times itself. Learn the squares to 15 × 15; they anchor every shortcut that follows.',
      intermediate: 'Split around a round number: 43² = (40 + 3)² = 1600 + 240 + 9 = 1849.',
      shortcuts: 'Ends in 5, near 50, near 100: each has a one-line pattern that removes the long multiplication.',
      independent: 'Mixed squares with no hint. Decide whether the number is near a round base before you calculate.',
      mastery: 'A timed mixed squares test, then a delayed retention check on the questions you answer cleanly.',
    },
    tricks: ['sq5', 'sq50', 'sq100'],
  },
  pw: {
    title: 'Roots & cubes mastery',
    blurb: 'Squares, cubes and the last-digit rules that make roots quick.',
    teach: {
      foundation: 'Roots undo squares and cubes. Learn the squares to 20² and the cubes to 10³; they are the lookup table.',
      intermediate: 'Estimate between two known roots, then use the last digit to choose the final answer: √576 is between 20 and 30 and ends in 4 or 6, so 24.',
      shortcuts: 'Last-digit rules for square and cube roots turn a search into a two-step check.',
      independent: 'Mixed roots and cubes with no prompt. Estimate the size first, then use the ending to finish.',
      mastery: 'A timed mixed roots-and-cubes test, then a delayed retention check on the questions you answer cleanly.',
    },
    tricks: ['sqrt', 'cube', 'cbrt'],
  },
  pct: {
    title: 'Percent mastery',
    blurb: 'Build any percentage from 10% and 1%, then use friendly fractions.',
    teach: {
      foundation: 'Percent means per hundred. 10% is one decimal place left; 1% is two. Build the answer from those two pieces.',
      intermediate: '15% = 10% + 5%, and 5% is half of 10%. 17% = 10% + seven lots of 1%.',
      shortcuts: 'Friendly fractions make many percentages instant: 50% half, 25% a quarter, 75% three quarters, 20% a fifth.',
      independent: 'Mixed percentages with no hint. Find the ten-percent anchor first, then add or subtract the small piece.',
      mastery: 'A timed mixed percent test, then a delayed retention check on the questions you answer cleanly.',
    },
    tricks: ['pct10'],
  },
  ops: {
    title: 'Multi-step mastery',
    blurb: 'Order of operations and a steady running total.',
    teach: {
      foundation: 'Order of operations: brackets first, then × and ÷, then + and −. Say the intermediate result out loud in your head.',
      intermediate: 'Keep a running total and do one operation at a time. For (a + b) × c, add first, then multiply.',
      shortcuts: 'Look for a common factor or a round number before calculating: in 7 + 6 × 5, do 6 × 5 first, then add 7.',
      independent: 'Mixed multi-step questions with no hint. Bracket the calculation in your head before you touch the keypad.',
      mastery: 'A timed mixed multi-step test, then a delayed retention check on the questions you answer cleanly.',
    },
    tricks: ['ops'],
  },
  mod: {
    title: 'Remainders mastery',
    blurb: 'Nearest multiples, digit sums and mod 11.',
    teach: {
      foundation: 'A remainder is what is left after the largest multiple that fits. 200 mod 7: 7 × 28 = 196, so the answer is 4.',
      intermediate: 'Find the nearest multiple below the number, subtract, and check the remainder is smaller than the divisor.',
      shortcuts: 'Mod 9 and mod 3 collapse to a digit sum; mod 11 uses an alternating sum from the right.',
      independent: 'Mixed remainders with no hint. Pick between nearest multiple, digit sum and alternating sum.',
      mastery: 'A timed mixed remainders test, then a delayed retention check on the questions you answer cleanly.',
    },
    tricks: ['mod9', 'mod11', 'modn'],
  },
  dec: {
    title: 'Decimals mastery',
    blurb: 'Friendly fractions, moving the point and whole-number answers.',
    teach: {
      foundation: 'Decimals are fractions with a point. 0.5 = 1/2, 0.25 = 1/4, 0.2 = 1/5, 0.1 = 1/10. Multiplying by a power of ten moves the point.',
      intermediate: 'Ignore the point, multiply whole numbers, then put it back: 3.6 × 15 → 36 × 15 = 540 → 54.',
      shortcuts: 'Friendly decimals become halving, quartering or dividing by five; dividing by 0.5 doubles.',
      independent: 'Mixed decimals with no hint. Decide whether to move the point or turn the decimal into a fraction.',
      mastery: 'A timed mixed decimals test, then a delayed retention check on the questions you answer cleanly.',
    },
    tricks: ['decf', 'decd', 'decs', 'dect'],
  },
  neg: {
    title: 'Negatives mastery',
    blurb: 'Signs, crossing zero, subtracting negatives and signed products.',
    teach: {
      foundation: 'A negative number is below zero. Adding a negative moves left on the number line; adding a positive moves right. Start with sums that cross zero, like −7 + 12.',
      intermediate: 'When the signs differ, subtract the smaller size from the bigger and keep the sign of the bigger one. When both are negative, add the sizes and keep the minus.',
      shortcuts: 'Subtracting a negative is adding. In × and ÷, the same signs give a positive and different signs give a negative, so do the sizes first.',
      independent: 'Mixed signed questions with no hint. Decide first whether the answer is positive or negative, then find its size.',
      mastery: 'A timed mixed negatives test, then a delayed retention check on the questions you answer cleanly.',
    },
    tricks: ['negx', 'negd', 'negm'],
  },
  frac: {
    title: 'Fractions mastery',
    blurb: 'Fractions of a number, simplifying, and adding, multiplying and dividing fractions.',
    teach: {
      foundation: 'A fraction of a number: divide by the bottom, then multiply by the top. 3/4 of 36 is 36 ÷ 4 = 9, then 9 × 3 = 27. Type a fraction answer with the / key.',
      intermediate: 'Simplify by dividing the top and bottom by the same number. With the same bottom, add or subtract the tops and keep the bottom.',
      shortcuts: 'Unlike bottoms: cross-multiply, a/b + c/d = (ad + cb)/bd. To multiply, multiply across. To divide, flip the second fraction and multiply.',
      independent: 'Mixed fractions with no hint. Answer in lowest terms: a whole number if it divides out, otherwise a/b.',
      mastery: 'A timed mixed fractions test, then a delayed retention check on the questions you answer cleanly.',
    },
    tricks: ['fraco', 'fracs', 'fracd', 'fracm'],
  },
  life: {
    title: 'Real-life maths mastery',
    blurb: 'Tips, discounts, tax, unit conversion, clock gaps, recipes and rates.',
    teach: {
      foundation: 'Everyday sums. A 10% tip is the bill with the point moved one place left. A discount of p% means you pay (100 − p)%. Use the . key for answers like 7.2.',
      intermediate: 'Convert units by thinking which is bigger: big unit to small, multiply; small to big, divide. For clock gaps, count up to the next whole hour first.',
      shortcuts: 'Build any percentage from 10%: 20% is double, 15% is 10% plus half of it, 25% off is three quarters. Scale a recipe by finding the amount for one.',
      independent: 'Mixed real-life questions with no hint. Work out which operation the story is asking for before you calculate.',
      mastery: 'A timed mixed real-life test, then a delayed retention check on the questions you answer cleanly.',
    },
    tricks: ['lifet', 'lifes', 'lifeu', 'lifec'],
  },
};

const trick = (id) => TRICKS.find((t) => t.id === id);

function build(sk) {
  const s = SPEC[sk];
  if (!s) throw new Error('No guided path for ' + sk);
  const stages = STAGE_META.map((m, i) => {
    const tricks = m.id === 'shortcuts' ? s.tricks.map(trick).filter(Boolean) : [];
    const pats = tricks.map((t) => t.pt).filter(Boolean);
    const drill = { only: sk, dur: m.dur };
    if (pats.length) drill.pats = [...new Set(pats)];
    return {
      ...m,
      teach: s.teach[m.id] || '',
      tricks,
      pats,
      drill,
      assess: `${m.goal.n}+ answers · ${Math.round(m.goal.acc * 100)}% first try · ${m.goal.spd.toFixed(2)}× par or faster`,
      retention: m.retention ? { ...m.retention } : null,
    };
  });
  return { sk, ...s, stages };
}

/** Every skill gets the same five-stage journey; only the teaching and shortcut list change. */
export const PATHS = Object.fromEntries(IDS.map((k) => [k, build(k)]));

export const pathFor = (sk) => PATHS[sk] || null;
export const stageNumber = (id) => Math.max(1, Math.min(STAGE_META.length, Math.round(+id || 1)));

/** The drill config for one stage. Kept in one place so the UI and tests agree. */
export function stageCfg(sk, id) {
  const st = PATHS[sk] && PATHS[sk].stages[stageNumber(id) - 1];
  if (!st) return null;
  const cfg = { only: sk, dur: st.drill.dur };
  if (st.drill.pats && st.drill.pats.length) cfg.pats = st.drill.pats.slice();
  return cfg;
}

const rowFor = (sk, id) => {
  const idn = stageNumber(id);
  S.paths = S.paths || {};
  const rows = (S.paths[sk] = S.paths[sk] || {});
  return (rows[idn] = rows[idn] || { seen: 0, demo: 0, at: 0, n: 0, ok: 0, ft: 0, spd: 9, pass: 0 });
};

/** Record that the learner has seen one worked example for this stage. */
export function recordPathDemo(sk, id, now = Date.now()) {
  if (!PATHS[sk]) return false;
  const row = rowFor(sk, id);
  row.demo = 1;
  row.at = Math.max(row.at || 0, now);
  return true;
}

/** A run is the best evidence so far when it passed, then by first-try rate, then volume, then pace. */
function betterRun(a, b) {
  const key = (r) => [r.pass ? 1 : 0, r.n ? r.ft / r.n : 0, r.ft || 0, r.n || 0, -(r.spd || 9)];
  const x = key(a), y = key(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

/**
 * Record one finished stage run. `run` is { n, ok, ft, spd, dur }, where `spd` is the average
 * time ÷ par for correct answers. A passing run stamps `pass`; a failing run can still improve
 * the displayed best. The caller saves and refreshes the view.
 */
export function recordPathRun(sk, id, run, now = Date.now()) {
  const n = Math.max(0, Math.round(+run.n || 0)), ok = clamp(Math.round(+run.ok || 0), 0, n), ft = clamp(Math.round(+run.ft || 0), 0, ok);
  const spd = Number.isFinite(+run.spd) && +run.spd > 0 ? +run.spd : 9;
  const idn = stageNumber(id), st = PATHS[sk] && PATHS[sk].stages[idn - 1];
  if (!st) return null;
  const pass = n >= st.goal.n && (n ? ft / n : 0) >= st.goal.acc && spd <= st.goal.spd;
  const row = rowFor(sk, idn);
  const candidate = { n, ok, ft, spd, pass: pass ? now : 0 };
  if (pass || betterRun(candidate, row)) Object.assign(row, { n, ok, ft, spd });
  if (pass) row.pass = Math.max(row.pass || 0, now);
  row.at = Math.max(row.at || 0, now);
  const stt = stageState(sk, idn), progress = pathProgress(sk);
  return {
    sk, stage: idn, name: st.name, skill: SK[sk].n,
    pass, complete: stt.complete, retention: stt.retention,
    pathComplete: progress.complete, pathDone: progress.done,
  };
}

/** Delayed retention for one skill, using only question pairs that carry that skill. */
export function retentionFor(sk) {
  const r = retentionStats(sk);
  const min = RETENTION_MIN;
  return { ...r, min, rate: RETENTION_RATE, met: r.cohort >= min && r.retentionRate >= RETENTION_RATE };
}

/** Everything the Learn screen needs about one stage. */
export function stageState(sk, id) {
  const idn = stageNumber(id), st = PATHS[sk] && PATHS[sk].stages[idn - 1];
  if (!st) return null;
  const row = (S.paths && S.paths[sk] && S.paths[sk][idn]) || null;
  const demo = !!(row && row.demo), passed = !!(row && row.pass);
  const retention = idn === 5 ? retentionFor(sk) : null;
  return { stage: st, row, demo, passed, complete: demo && passed && (!retention || retention.met), retention };
}

export function pathProgress(sk) {
  const p = PATHS[sk];
  if (!p) return { done: 0, total: 0, pct: 0, stages: [], next: null, complete: false };
  const stages = p.stages.map((st, i) => ({ ...st, ...stageState(sk, i + 1) }));
  const done = stages.filter((s) => s.complete).length;
  return { done, total: stages.length, pct: done / stages.length, stages, next: stages.find((s) => !s.complete) || null, complete: done === stages.length };
}

/**
 * A question for the "show me" step. Shortcut stages search for the first trick's pattern, so
 * the demonstration really matches the rule being taught. Math.random is fine here: this is
 * presentation, not saved data.
 */
export function demoQuestion(sk, id, R = Math.random) {
  const idn = stageNumber(id), st = PATHS[sk] && PATHS[sk].stages[idn - 1];
  if (!st) return null;
  const base = clamp(Math.round(+((S.sk[sk] || {}).lv) || 5), 1, 12);
  const d = idn === 1 ? Math.max(1, base - 1) : idn === 5 ? Math.min(12, base + 1) : base;
  const first = idn === 3 ? st.tricks.find((t) => t.pt) : null;
  if (first) for (let i = 0; i < 120; i++) {
    const p = gen(sk, i < 40 ? Math.max(1, d - 1) : i < 80 ? d : Math.min(12, d + 2), R);
    if (p.pt === first.pt) return p;
  }
  return gen(sk, d, R);
}

/** "8+ answers · 80% first try · 1.60× par or faster" — used under every stage. */
export const goalText = (goal) => `${goal.n}+ answers · ${Math.round(goal.acc * 100)}% first try · ${goal.spd.toFixed(2)}× par or faster`;

/** One line for the results screen. */
export function pathResultText(out) {
  if (!out) return '';
  return out.pathComplete ? `${out.skill} guided path complete` : `${out.skill} · ${out.name} passed`;
}
