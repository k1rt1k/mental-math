// Estimation mode's pure parts (no DOM), so they can be tested.
// A question is a sum nobody should work out exactly; the answer counts when it is within a tolerance (±5, 10 or 20 %) of the exact value.
export const KINDS = ['mul', 'div', 'add', 'pct'];
export const TOLS = [5, 10, 20];
export const LEVELS = [1, 2, 3];
export const ROUNDS = 10;

const int = (rnd, lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
/** Per kind and level: the ranges the numbers are drawn from. Division draws divisor and quotient, then adds a remainder, so the answer is rarely a whole number. */
const SPEC = {
  mul: { 1: [[10, 99], [10, 99]], 2: [[100, 999], [11, 99]], 3: [[100, 999], [100, 999]] },
  div: { 1: { d: [11, 49], q: [20, 99] }, 2: { d: [21, 99], q: [50, 299] }, 3: { d: [31, 99], q: [200, 999] } },
  add: { 1: { n: 3, r: [100, 999] }, 2: { n: 4, r: [100, 999] }, 3: { n: 4, r: [1000, 9999] } },
  pct: { 1: { p: [11, 49], b: [100, 999] }, 2: { p: [11, 89], b: [100, 999] }, 3: { p: [3, 97], b: [1000, 9999] } },
};

/** One question: { kind, text (shown), say (spoken), exact }. `kind` may be 'mix'. Results are always 20 or more, so a whole-number guess has room to be within 5 %. */
export function makeProblem(cfg, rnd = Math.random) {
  const kind = cfg.k == 'mix' || !KINDS.includes(cfg.k) ? KINDS[int(rnd, 0, KINDS.length - 1)] : cfg.k, L = LEVELS.includes(cfg.l) ? cfg.l : 1, sp = SPEC[kind][L];
  for (let tries = 0; ; tries++) {
    let p;
    if (kind == 'mul') {
      const a = int(rnd, ...sp[0]), b = int(rnd, ...sp[1]);
      p = { text: `${a} × ${b}`, say: `${a} times ${b}`, exact: a * b };
    } else if (kind == 'div') {
      const d = int(rnd, ...sp.d), q = int(rnd, ...sp.q), n = q * d + int(rnd, 0, d - 1);
      p = { text: `${n} ÷ ${d}`, say: `${n} divided by ${d}`, exact: n / d };
    } else if (kind == 'add') {
      const xs = Array.from({ length: sp.n }, () => int(rnd, ...sp.r));
      p = { text: xs.join(' + '), say: xs.join(' plus '), exact: xs.reduce((a, b) => a + b, 0) };
    } else {
      const pc = int(rnd, ...sp.p), b = int(rnd, ...sp.b);
      p = { text: `${pc}% of ${b}`, say: `${pc} percent of ${b}`, exact: (pc * b) / 100 };
    }
    if (p.exact >= 20 || tries > 50) return { kind, ...p };
  }
}

/** Is a whole-number guess inside ±tol % of the exact value? */
export const within = (guess, exact, tol) => Math.abs(guess - exact) <= (exact * tol) / 100 + 1e-9;
/** How far off, in whole percent of the exact value; positive is too high, negative too low. */
export const pctOff = (guess, exact) => Math.round(((guess - exact) / exact) * 100);
/** The whole numbers that would have counted: [low, high]. */
export const accepted = (exact, tol) => [Math.ceil(exact - (exact * tol) / 100 - 1e-9), Math.floor(exact + (exact * tol) / 100 + 1e-9)];
/** The exact answer as people read it: whole numbers plain, otherwise one decimal. */
export const fmtExact = (x) => (Number.isInteger(x) ? String(x) : (Math.round(x * 10) / 10).toFixed(1));
/** Points per right answer: a harder level and a tighter tolerance both pay more. */
export const estPts = (cfg) => Math.round((10 * cfg.l * 10) / cfg.t);
/** The key an Estimation setting is filed under, so every combination keeps its own best. */
export const estKey = (c) => [c.k, c.l, c.t].join('-');
