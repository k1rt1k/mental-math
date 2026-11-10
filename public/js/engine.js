// Pure maths engine: skills, question generators, worked methods, scoring.
// No DOM, no storage — everything here is unit-tested in test/engine.test.mjs.
import { clamp, gcd, ri, lerp } from './util.js';

export const SK = {
  add: { n: 'Addition', m: 0.8, s: 4.5 },
  sub: { n: 'Subtraction', m: 0.9, s: 4.5 },
  mul: { n: 'Multiplication', m: 1, s: 5 },
  div: { n: 'Division', m: 1, s: 5 },
  sq: { n: 'Squares', m: 0.9, s: 4 },
  pw: { n: 'Roots & cubes', m: 1.1, s: 4 },
  pct: { n: 'Percent', m: 1.1, s: 4 },
  ops: { n: 'Multi-step', m: 1.5, s: 4 },
  mod: { n: 'Remainders', m: 1.1, s: 4 },
  dec: { n: 'Decimals', m: 1.2, s: 4 },
  neg: { n: 'Negatives', m: 1.1, s: 4 },
  frac: { n: 'Fractions', m: 1.2, s: 4 },
  life: { n: 'Real-life', m: 1.2, s: 4 },
};
export const IDS = Object.keys(SK);
/** The original ten skills: whole, non-negative answers typed with digits only. The Daily challenge still draws from these so its questions stay the same for everyone. */
export const CORE = ['add', 'sub', 'mul', 'div', 'sq', 'pw', 'pct', 'ops', 'mod', 'dec'];
/** Skills whose answers need one more key than the digits: a minus sign, a fraction slash or a decimal point. */
export const SYM = { neg: '-', frac: '/', life: '.' };
export const symFor = (sk) => SYM[sk] || '';
/** Show a typed or stored answer with a real minus sign. */
export const showAns = (a) => String(a ?? '').replace(/-/g, '−');
export const COL = { add: '#6ea8ff', sub: '#8e9bff', mul: '#ff9f5a', div: '#ffcf5c', sq: '#4cd98a', pw: '#4fd1c5', pct: '#ff6b9a', ops: '#b48cff', mod: '#f08a7a', dec: '#a6d65c', neg: '#7fb8ff', frac: '#f2a65a', life: '#5fd0b5' };
export const SH = { add: 'Add', sub: 'Sub', mul: 'Mul', div: 'Div', sq: 'Sq', pw: 'Pow', pct: '%', ops: 'Multi', mod: 'Mod', dec: 'Dec', neg: 'Neg', frac: 'Frac', life: 'Life' };
export const MAXLV = 12;

/**
 * Par time (seconds) for a skill at difficulty d: what a typical trainee at that level needs, 100% right.
 * = fixed overhead (read the question, start typing) + typing time per answer digit + thinking time that grows with d.
 * Answering at par holds your rating; faster raises it, slower lowers it. `a` (the answer) sets the typing share;
 * without it a 2-digit answer is assumed. The old target had no overhead at all (about 1.1 s for a level-1 multiplication),
 * so a perfectly accurate player at a normal pace was marked "too slow" on every answer and rated down.
 */
export const PAR = { base: 1.3, digit: 0.3, think: 1.25, lin: 0.3, quad: 0.025 };
export const digitsOf = (a) => {
  const t = String(a ?? '');
  return /^-?\d+$/.test(t) || typeof a == 'number' && Number.isInteger(a) ? String(Math.abs(Math.round(+a || 0))).length + (+a < 0 ? 1 : 0) : Math.max(1, t.length);   // a point, a slash and a minus sign are keystrokes too
};
export const T = (k, d, a) => PAR.base + PAR.digit * (a == null ? 2 : digitsOf(a)) + PAR.think * SK[k].m * (PAR.lin * d + PAR.quad * d * d);

/** Points an answer is worth before the speed bonus: grows with difficulty. (This is the old target formula, kept so past scores and ghosts stay comparable.) */
export const worth = (k, d) => Math.round(10 * SK[k].m * (0.8 + 0.3 * d + 0.025 * d * d));
/**
 * Longest an answer is timed for. The old flat 15 s cap sat BELOW the par of the hardest multi-step questions (16 s at level 12),
 * so a player who took 40 s on one was scored as 0.94× par, faster than par, and gained rating. Scaled to par, the cap lands on the
 * 2.5× point where the score has already hit its floor, so slowness always reads as slowness.
 */
export const timeCap = (par) => Math.max(15, 2.5 * par);

/** Speed multiplier on points: up to +25% for beating par comfortably, never a penalty. r = time ÷ par. */
export const speedMult = (r) => (r <= 0.6 ? 1.25 : r >= 1 ? 1 : 1 + (0.25 * (1 - r)) / 0.4);

export const rank = (r) => (r < 400 ? 'Apprentice' : r < 600 ? 'Sharp' : r < 800 ? 'Elite' : r < 1000 ? 'Prodigy' : 'Savant');

/** The currency symbol Real-life questions use. Set at start-up and when the learner picks one; the maths never depends on it. */
export const CURRENCIES = ['$', '£', '€', '₹'];
export const CUR = { sym: '$' };
export const setCurrency = (c) => { CUR.sym = CURRENCIES.includes(c) ? c : '$'; };
/** A sensible default from the browser language: rupees for India, pounds for the UK, euros for the common euro-zone languages, otherwise dollars. */
export const localeCurrency = (lang = '') => (/-IN$/i.test(lang) ? '₹' : /-GB$/i.test(lang) ? '£' : /^(de|fr|es|it|nl|pt)(-|$)|-(DE|FR|ES|IT|NL|IE|AT|BE|FI|PT)$/i.test(lang) ? '€' : '$');
/** [big unit, small unit, how many small make one big]. Every pair is exact, so answers never need rounding. */
export const UNITS = [['km', 'm', 1000], ['h', 'min', 60], ['kg', 'g', 1000], ['m', 'cm', 100], ['L', 'mL', 1000], ['ft', 'inches', 12], ['yd', 'ft', 3], ['lb', 'oz', 16], ['day', 'h', 24], ['week', 'days', 7], ['min', 's', 60], ['cm', 'mm', 10]];
/** Which kind of Real-life question makes each pattern label, so a drill on a pattern can draw only the kinds that can produce it. */
export const LIFE_KIND = { 'friendly tip': 'tip', 'awkward tip': 'tip', 'total with tip': 'tiptot', 'sale price': 'sale', 'discount amount': 'off', 'percent off': 'pcoff', 'original price': 'orig', 'successive discounts': 'twice', 'unit conversion': 'unit', temperature: 'temp', 'clock time': 'time', 'scale a recipe': 'recipe', ratio: 'ratio', speed: 'rate', 'unit price': 'rate', 'split the bill': 'split', 'split with tip': 'splittip', 'split with GST': 'splittip', 'add tax': 'tax', 'add GST': 'gst', 'GST amount': 'gst', 'GST in the price': 'ungst', distance: 'dist', 'travel time': 'ttime', 'fuel used': 'fuel', 'fuel cost': 'fcost', 'duration sum': 'dur', 'hourly pay': 'wage', 'days between': 'days', 'price per 100': 'per100', 'price gap': 'gap', 'free items': 'free', 'bundle saving': 'bundle', 'simple interest': 'si', 'percent change': 'pchg', 'salary hike': 'hike', 'rule of 72': 'r72', 'months to save': 'msave', 'compound interest': 'ci', 'run rate': 'rr', 'required rate': 'req', 'strike rate': 'sr', 'batting average': 'avg', 'balls in overs': 'balls', 'monthly and yearly': 'myr', 'daily budget': 'dayb', 'budget rule': 'rule', 'shared rent': 'rent', 'take-home': 'take' };

/* ---------------- generators ---------------- */
const carries = (x, y) => { let c = 0, r = 0; while (x > 0 || y > 0) { const t = (x % 10) + (y % 10) + r; r = t >= 10 ? 1 : 0; c += r; x = Math.floor(x / 10); y = Math.floor(y / 10); } return c; };
const borrows = (x, y) => { let c = 0, r = 0; while (x > 0 || y > 0) { r = (x % 10) - r < (y % 10) ? 1 : 0; c += r; x = Math.floor(x / 10); y = Math.floor(y / 10); } return c; };
const lab = (n, w) => (n == 0 ? 'no ' + w : n == 1 ? '1 ' + w : '2+ ' + w + 's').replace('carrys', 'carries');

/** `want` (optional, Real-life only): a pattern label or list of them. The question is then drawn only from the kinds that can make one, at any level, so a pack drill never falls back to a far harder level to find its pattern. */
export function gen(k, d, R = Math.random, want) {
  d = clamp(d, 1, MAXLV);
  let q, a, pt = '', tip = '';
  const M = Math.round(10 ** (0.5 + 0.35 * d));
  const A = Math.round(lerp([9, 9, 12, 12, 12, 20, 30, 50, 75, 99, 150, 300], d));
  const B = Math.round(lerp([9, 12, 30, 60, 99, 99, 99, 99, 99, 99, 99, 99], d));
  const L = (h, f) => Math.min(h, Math.max(2, Math.round(h * f)));
  if (k == 'add') {
    const x = ri(L(M, 0.2), M, R), y = ri(L(M, 0.2), M, R);
    q = x + ' + ' + y; a = x + y; pt = lab(Math.min(2, carries(x, y)), 'carry');
  } else if (k == 'sub') {
    const x = ri(Math.max(3, L(M, 0.35)), M, R), y = ri(Math.min(x - 1, L(x, 0.2)), x - 1, R);
    q = x + ' − ' + y; a = x - y; pt = lab(Math.min(2, borrows(x, y)), 'borrow');
  } else if (k == 'mul') {
    let x = ri(L(A, 0.35), A, R), y = ri(L(B, 0.35), B, R);
    const t = d >= 3 && R() < 0.28 ? Math.floor(R() * 4) : -1;
    pt = String(x).length + '×' + String(y).length + ' digits';
    if (t == 0) { x = 11; y = d < 6 ? ri(12, 99, R) : ri(100, Math.min(999, Math.round(100 + (d - 5) * 130)), R); pt = '×11 trick'; tip = '×11: split the digits and put their sum between (36×11 → 3_9_6 = 396)'; }
    else if (t == 1) { x = 25; y = ri(Math.round(2 + d * 1.5), Math.round(30 + d * 15), R); pt = '×25 trick'; tip = '×25 = ÷4 then ×100 (e.g. 36×25 → 9 → 900)'; }
    else if (t == 2 && d >= 6) { const nr = () => { let v; do v = ri(88, 112, R); while (v == 100); return v; }; x = nr(); y = nr(); pt = 'near-100 trick'; tip = 'near 100: 100×(100+a+b) + a×b, with a,b signed distances from 100'; }
    else if (t == 3) { x = ri(L(A, 0.35), A, R); y = R() < 0.5 ? 99 : 101; pt = '×99/×101 trick'; tip = '×99 = ×100 − x; ×101 = ×100 + x'; }
    if (x % 100 == 0) x++;                                 // ×100 and ×200 are free, not mental maths
    if (y % 100 == 0) y++;
    q = x + ' × ' + y; a = x * y;
  } else if (k == 'div') {
    let x = ri(L(A, 0.35), A, R); const y = ri(L(B, 0.35), B, R);
    if (x % 100 == 0) x++;
    q = x * y + ' ÷ ' + x; a = y; pt = 'quotient ' + String(y).length + '-digit';
  } else if (k == 'sq') {
    const mx = Math.round(lerp([12, 15, 20, 25, 30, 40, 50, 75, 99, 125, 150, 200], d));
    let n = ri(Math.max(3, L(mx, 0.35)), mx, R);
    const t = R() < 0.3 ? Math.floor(R() * 3) : -1;
    pt = 'general';
    if (t == 0 && mx >= 35) { n = ri(Math.max(1, Math.round(Math.floor((mx - 5) / 10) * 0.35)), Math.floor((mx - 5) / 10), R) * 10 + 5; pt = 'ends in 5 trick'; tip = 'n5²: n×(n+1), then append 25 (35² → 3×4=12 → 1225)'; }
    else if (t == 1 && mx >= 55) { do n = ri(40, 60, R); while (n == 50); pt = 'near-50 trick'; tip = '(50±k)² = 2500 ± 100k + k²'; }
    else if (t == 2 && mx >= 95) { do n = ri(91, 109, R); while (n == 100); pt = 'near-100 trick'; tip = '(100±k)² = 10000 ± 200k + k²'; }
    if (n % 100 == 0) n++;                                 // 100² and 200² are free
    q = n + '²'; a = n * n;
  } else if (k == 'pw') {
    if (d < 4 || R() < 0.45) {
      const mx = Math.round(lerp([10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 150], d));
      const n = ri(Math.max(2, L(mx, 0.35)), mx, R);
      q = '√' + n * n; a = n; pt = 'square root';
      tip = 'Squares end in 0,1,4,5,6 or 9. The last digit narrows the root: …4 → root ends in 2 or 8, …9 → 3 or 7, …6 → 4 or 6';
    } else {
      const mx = Math.round(lerp([5, 6, 7, 8, 9, 10, 12, 13, 15, 18, 20, 25], d));
      const n = ri(2, mx, R);
      if (R() < 0.5) { q = n + '³'; a = n ** 3; pt = 'cube'; tip = 'n³ = n² × n. Learn 1–10 cold: 1, 8, 27, 64, 125, 216, 343, 512, 729, 1000'; }
      else { q = '∛' + n ** 3; a = n; pt = 'cube root'; tip = 'A cube’s last digit gives the root’s: …8 → 2, …7 → 3, …3 → 7, …2 → 8, the rest stay the same'; }
    }
  } else if (k == 'pct') {
    const P = d < 3 ? [10, 50, 25, 20] : d < 5 ? [10, 50, 25, 20, 5, 75, 40, 30] : d < 7 ? [15, 12, 35, 60, 45, 8, 90, 5] : [17, 13, 28, 37, 6, 65, 125, 35, 15, 45];
    const p = P[Math.floor(R() * P.length)], st = 100 / gcd(p, 100), U = Math.max(1, Math.floor(10 ** (2 + 0.12 * d) / st));
    const n = st * ri(Math.max(1, Math.round(U * 0.3)), U, R);
    q = p + '% of ' + n; a = (n * p) / 100; pt = [10, 50, 25, 20, 5, 75].includes(p) ? 'friendly %' : 'awkward %';
  } else if (k == 'mod') {
    const mm = Math.round(lerp([5, 7, 9, 9, 12, 13, 15, 20, 25, 30, 50, 99], d)), xm = Math.round(lerp([30, 50, 80, 100, 150, 200, 300, 500, 700, 999, 1500, 2500], d));
    const t = d >= 3 && R() < 0.35 ? [9, 3, 11][Math.floor(R() * 3)] : 0;
    let m = t || ri(Math.max(3, L(mm, 0.3)), mm, R); if (m == 10) m = 12;   // mod 10 is just the last digit
    const x = ri(Math.max(m + 1, L(xm, 0.3)), Math.max(m + 2, xm), R);
    const xx = x % m ? x : x + 1;                          // a remainder of 0 is too easy to guess
    q = xx + ' mod ' + m; a = xx % m;
    pt = m == 9 || m == 3 ? 'digit-sum trick' : m == 11 ? 'alternating-sum trick' : m <= 9 ? 'small modulus' : 'big modulus';
    tip = m == 9 || m == 3 ? 'mod ' + m + ': add the digits of the number (repeat if needed), then take that mod ' + m : m == 11 ? 'mod 11: alternate + − + − through the digits from the right, then reduce' : '';
  } else if (k == 'dec') {
    const mx = Math.round(lerp([30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 600, 900], d));
    const ds = (v) => String(v / 100);                                  // hundredths -> text, no float noise for these values
    const kinds = d < 3 ? ['add', 'mul', 'shift'] : d < 6 ? ['add', 'mul', 'mul', 'div', 'shift'] : ['add', 'mul', 'div', 'dmul', 'dmul', 'shift'];
    const kd = kinds[Math.floor(R() * kinds.length)];
    const FR = (d < 3 ? [[50, 2], [10, 10]] : d < 6 ? [[50, 2], [10, 10], [20, 5], [25, 4], [150, 2]] : [[50, 2], [20, 5], [25, 4], [150, 2], [75, 4], [250, 2], [10, 10]]);
    if (kd == 'add') {
      const hi = d >= 7, h = hi ? ri(1, 99, R) : 10 * ri(1, 9, R), x = ri(1, Math.max(2, mx >> 2), R), y = ri(1, Math.max(2, mx >> 2), R);
      q = ds(x * 100 + h) + ' + ' + ds(y * 100 + 100 - h); a = x + y + 1; pt = hi ? 'hundredths' : 'tenths';
      tip = 'Add the whole parts, then the decimal parts: they make exactly 1';
    } else if (kd == 'mul') {
      const [f, m] = FR[Math.floor(R() * FR.length)], top = Math.max(2, Math.floor(mx / m)), lo = Math.max(1, Math.ceil(2 / ((m * f) / 100)));   // lo: the answer is never a free 1
      const w = m * ri(Math.min(lo, top), top, R);
      q = R() < 0.5 ? ds(f) + ' × ' + w : w + ' × ' + ds(f); a = (w * f) / 100; pt = 'friendly decimal';
      tip = '0.5 = half · 0.25 = quarter · 0.2 = fifth · 0.1 = tenth · 1.5 = itself + half · 0.75 = three quarters';
    } else if (kd == 'div') {
      const [f] = FR[Math.floor(R() * FR.length)], st = 100 / gcd(f, 100), a0 = st * ri(2, Math.max(3, Math.ceil(mx / st / 2)), R);   // quotient of at least 2 units: no "1 ÷ 0.1"
      q = (a0 * f) / 100 + ' ÷ ' + ds(f); a = a0; pt = 'divide by a decimal';
      tip = 'Dividing by 0.5 doubles, by 0.25 quadruples, by 0.1 is ×10, by 1.5 is ×2 ÷3';
    } else if (kd == 'dmul') {
      let H; do H = ri(11, 99, R); while (H % 10 == 0);               // a one-place decimal like 3.6, never a whole number
      const u = 10 / gcd(H, 10), top = Math.min(Math.floor(99 / u), Math.max(2, Math.floor(mx / u / 4))), w = u * ri(Math.max(1, Math.round(top * 0.3)), top, R);   // w is a multiple of u, so the answer is whole
      q = R() < 0.5 ? ds(H * 10) + ' × ' + w : w + ' × ' + ds(H * 10); a = (H * w) / 10; pt = 'decimal × whole';
      tip = 'Ignore the point, multiply, then put it back: 3.6 × 15 → 36 × 15 = 540 → 54';
    } else {
      const p = ri(1, 2, R), X0 = ri(11, d < 3 ? 99 : 999, R), X = X0 % 10 ? X0 : X0 + 1, e = ri(p, d < 3 ? 2 : 3, R);   // never a trailing zero, so the number really is a decimal; small numbers first
      q = ds(X * 10 ** (2 - p)) + ' × ' + 10 ** e; a = (X * 10 ** e) / 10 ** p; pt = 'move the point';
      tip = '× 10 moves the point one place right, × 100 two places, × 1000 three';
    }
  } else if (k == 'neg') {
    const Mx = Math.round(lerp([9, 12, 15, 20, 30, 40, 60, 80, 99, 150, 250, 400], d));
    const sm = Math.round(lerp([5, 6, 7, 9, 9, 12, 12, 13, 15, 20, 25, 30], d));      // factor size for × and ÷
    const f = (v) => (v < 0 ? '−' + -v : String(v)), g = (v) => (v < 0 ? '(−' + -v + ')' : String(v));
    const kinds = d < 3 ? ['cross', 'cross', 'both'] : d < 5 ? ['cross', 'both', 'dbl', 'mul'] : d < 7 ? ['cross', 'dbl', 'mul', 'mul', 'div'] : ['cross', 'dbl', 'mul', 'div', 'chain', 'chain'];
    const kd = kinds[Math.floor(R() * kinds.length)], sg2 = () => (R() < 0.5 ? -1 : 1);
    const SG = [[-1, 1], [1, -1], [-1, -1]], [sa, sb] = SG[Math.floor(R() * SG.length)];   // never both positive: there is always a minus to handle
    if (kd == 'cross') {
      const p = ri(2, Mx, R); let r = ri(2, Mx, R); if (r == p) r++;
      q = R() < 0.5 ? '−' + p + ' + ' + r : r + ' − ' + p; a = r - p; pt = 'cross zero';
      tip = 'Different signs: take the smaller size from the bigger, and keep the sign of the bigger one';
    } else if (kd == 'both') {
      const p = ri(2, Mx, R), r = ri(2, Mx, R);
      q = '−' + p + ' − ' + r; a = -(p + r); pt = 'both negative';
      tip = 'Two negatives add up in size and the answer stays negative';
    } else if (kd == 'dbl') {
      let x = sg2() * ri(2, Mx, R); const y = ri(2, Mx, R);
      if (x + y == 0) x += x < 0 ? -1 : 1;
      q = f(x) + ' − (−' + y + ')'; a = x + y; pt = 'subtract a negative';
      tip = 'Subtracting a negative is the same as adding';
    } else if (kd == 'mul') {
      const x = ri(2, sm, R), y = ri(2, sm, R);
      q = f(sa * x) + ' × ' + g(sb * y); a = sa * sb * x * y; pt = sa * sb > 0 ? 'negative × negative' : 'signed product';
      tip = 'Same signs give a positive, different signs give a negative';
    } else if (kd == 'div') {
      const x = ri(2, sm, R), y = ri(2, sm, R);
      q = f(sa * x * y) + ' ÷ ' + g(sb * y); a = sa * sb * x; pt = 'signed quotient';
      tip = 'Divide the sizes, then same signs give a positive and different signs a negative';
    } else {
      const v = sg2() * ri(2, Mx, R), m2 = ri(2, Mx, R); let m3 = ri(2, Mx, R);
      const o2 = R() < 0.5 ? '+' : '−', o3 = R() < 0.5 ? '+' : '−', tot = (m) => v + (o2 == '+' ? m2 : -m2) + (o3 == '+' ? m : -m);
      if (tot(m3) == 0) m3++;
      q = f(v) + ' ' + o2 + ' ' + m2 + ' ' + o3 + ' ' + m3; a = tot(m3); pt = 'chain';
      tip = 'Work left to right and keep track of the sign as you go';
    }
  } else if (k == 'frac') {
    const DN = d < 3 ? [2, 3, 4, 5, 10] : d < 6 ? [2, 3, 4, 5, 6, 8, 10] : d < 9 ? [2, 3, 4, 5, 6, 8, 10, 12] : [3, 4, 5, 6, 7, 8, 9, 10, 12, 15];
    const pick = (arr) => arr[Math.floor(R() * arr.length)];
    const fr = (n, m) => { const c = gcd(n, m); n /= c; m /= c; return m == 1 ? n : n + '/' + m; };   // lowest terms; a whole number comes back as a number
    const kinds = d < 2 ? ['of'] : d < 3 ? ['of', 'of', 'simp'] : d < 5 ? ['of', 'simp', 'same'] : d < 7 ? ['of', 'simp', 'same', 'mul', 'diff'] : ['of', 'simp', 'same', 'mul', 'diff', 'div'];
    const kd = kinds[Math.floor(R() * kinds.length)], top = Math.round(lerp([6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80], d));
    tip = 'Give the answer in lowest terms';
    if (kd == 'of') {
      const den = pick(DN), num = ri(1, den - 1, R), w = den * ri(2, Math.max(3, top), R);
      q = num + '/' + den + ' of ' + w; a = (num * w) / den; pt = num == 1 ? 'unit fraction' : 'fraction of';
      tip = num == 1 ? 'Divide by ' + den : 'Divide by ' + den + ' first, then multiply by ' + num;
    } else if (kd == 'simp') {
      const m = ri(2, Math.round(lerp([5, 6, 8, 9, 10, 12, 12, 15, 15, 16, 18, 20], d)), R); let r = 1;
      for (let i = 0; i < 20; i++) { const c = ri(1, m - 1, R); if (gcd(c, m) == 1) { r = c; break; } }
      const kk = ri(2, Math.round(lerp([3, 4, 5, 6, 6, 8, 8, 9, 10, 10, 12, 12], d)), R);
      q = 'Simplify ' + r * kk + '/' + m * kk; a = r + '/' + m; pt = 'simplify';
      tip = 'Divide the top and bottom by the biggest number that goes into both';
    } else if (kd == 'same') {
      const den = pick(DN.filter((x) => x > 2)); let n1 = ri(1, den - 1, R), n2 = ri(1, den - 1, R);
      const plus = R() < 0.65; if (!plus && n1 == n2) { n1 = Math.min(den - 1, n2 + 1); if (n1 == n2) n2--; }
      if (!plus && n1 < n2) [n1, n2] = [n2, n1];
      q = n1 + '/' + den + (plus ? ' + ' : ' − ') + n2 + '/' + den; a = fr(plus ? n1 + n2 : n1 - n2, den); pt = 'same denominator';
      tip = 'Same bottom: add or subtract the tops, keep the bottom, then simplify';
    } else if (kd == 'diff') {
      const D = d < 9 ? [2, 3, 4, 5, 6, 8] : [2, 3, 4, 5, 6, 7, 8, 9, 10, 12]; let d1 = pick(D), d2 = pick(D), tries = 0;
      while ((d1 == d2 || d1 % d2 == 0 || d2 % d1 == 0) && tries++ < 40) { d1 = pick(D); d2 = pick(D); }
      if (d1 == d2) d2 = d1 == 2 ? 3 : 2;
      let n1 = ri(1, d1 - 1, R), n2 = ri(1, d2 - 1, R); const plus = R() < 0.65;
      if (!plus && n1 * d2 <= n2 * d1) { [d1, d2] = [d2, d1]; [n1, n2] = [n2, n1]; }
      if (!plus && n1 * d2 == n2 * d1) n1 = Math.min(d1 - 1, n1 + 1);
      if (!plus && n1 * d2 <= n2 * d1) { q = n2 + '/' + d2 + ' + ' + n1 + '/' + d1; a = fr(n1 * d2 + n2 * d1, d1 * d2); }   // no clean subtraction found: add instead
      else { q = n1 + '/' + d1 + (plus ? ' + ' : ' − ') + n2 + '/' + d2; a = fr(plus ? n1 * d2 + n2 * d1 : n1 * d2 - n2 * d1, d1 * d2); }
      pt = 'unlike denominators';
      tip = 'Make the bottoms match first (multiply them), then add or subtract the tops';
    } else if (kd == 'mul') {
      const d1 = pick(DN), d2 = pick(DN), n1 = ri(1, d1 - 1, R), n2 = ri(1, d2 - 1, R);
      q = n1 + '/' + d1 + ' × ' + n2 + '/' + d2; a = fr(n1 * n2, d1 * d2); pt = 'multiply fractions';
      tip = 'Multiply the tops, multiply the bottoms, then simplify';
    } else {
      const d1 = pick(DN), d2 = pick(DN), n1 = ri(1, d1 - 1, R), n2 = ri(1, d2 - 1, R);
      q = n1 + '/' + d1 + ' ÷ ' + n2 + '/' + d2; a = fr(n1 * d2, d1 * n2); pt = 'divide fractions';
      tip = 'Flip the second fraction and multiply, then simplify';
    }
  } else if (k == 'life') {
    const hi = Math.round(lerp([40, 60, 80, 100, 120, 160, 200, 250, 300, 400, 500, 800], d));
    const pick = (arr) => arr[Math.floor(R() * arr.length)], r2 = (v) => +v.toFixed(2);
    const c$ = CUR.sym;
    let kinds = d < 2 ? ['tip', 'sale', 'split'] : d < 3 ? ['tip', 'sale', 'unit', 'split', 'off', 'dist', 'per100'] : d < 4 ? ['tip', 'sale', 'unit', 'time', 'split', 'off', 'tiptot', 'gst', 'dist', 'ttime', 'dur', 'per100', 'free', 'hike'] : d < 6 ? ['tip', 'sale', 'unit', 'time', 'recipe', 'rate', 'split', 'off', 'tiptot', 'gst', 'pcoff', 'ungst', 'splittip', 'dist', 'ttime', 'dur', 'fuel', 'wage', 'days', 'per100', 'free', 'hike', 'gap', 'bundle', 'si', 'pchg', 'r72', 'msave'] : d < 8 ? ['tip', 'sale', 'unit', 'time', 'recipe', 'rate', 'split', 'tax', 'off', 'tiptot', 'gst', 'pcoff', 'ungst', 'splittip', 'temp', 'orig', 'dist', 'ttime', 'dur', 'fuel', 'wage', 'days', 'fcost', 'per100', 'free', 'hike', 'gap', 'bundle', 'si', 'pchg', 'r72', 'msave', 'ci'] : ['tip', 'sale', 'time', 'recipe', 'ratio', 'rate', 'split', 'tax', 'twice', 'unit', 'off', 'tiptot', 'gst', 'pcoff', 'ungst', 'splittip', 'temp', 'orig', 'dist', 'ttime', 'dur', 'fuel', 'wage', 'days', 'fcost', 'per100', 'free', 'hike', 'gap', 'bundle', 'si', 'pchg', 'r72', 'msave', 'ci'];
    const wk = want ? [].concat(want).map((x) => LIFE_KIND[x]).filter(Boolean) : [];
    if (wk.length) kinds = [...new Set(wk)];
    else kinds = kinds.concat(d >= 2 ? ['rr', 'balls', 'myr'] : [], d >= 3 ? ['dayb', 'take', 'sr'] : [], d >= 4.5 ? ['avg', 'req', 'rule', 'rent'] : []);   // cricket and budget kinds join as the level rises
    const kd = kinds[Math.floor(R() * kinds.length)];
    if (kd == 'tip') {
      const p = pick(d < 3 && !wk.includes('tip') ? [10, 20] : d < 6 ? [10, 15, 20, 25] : [10, 12, 15, 18, 20]), bill = ri(4, Math.max(5, Math.floor(hi / 2)), R) * 2;
      q = p + '% tip on ' + c$ + bill; a = r2((bill * p) / 100); pt = p == 10 || p == 20 ? 'friendly tip' : 'awkward tip';
      tip = '10% is the number with the point moved one place left; build the rest from that';
    } else if (kd == 'sale') {
      const p = pick(d < 4 ? [10, 20, 25, 50] : [10, 15, 20, 25, 30, 40, 60, 75]), price = 10 * ri(2, Math.max(3, Math.floor(hi / 5)), R);
      q = p + '% off ' + c$ + price; a = r2(price - (price * p) / 100); pt = 'sale price';
      tip = (100 - p) + '% of the price is what you pay';
    } else if (kd == 'unit') {
      const [big, small, fct] = pick(d < 2 ? UNITS.slice(0, 5) : UNITS);
      const x = d < 5 || fct <= 60 ? ri(1, 9, R) + (R() < 0.5 ? 0.5 : 0) : ri(11, 99, R) / 10;
      if (R() < 0.5) { q = x + ' ' + big + ' in ' + small; a = r2(x * fct); } else { q = r2(x * fct) + ' ' + small + ' in ' + big; a = x; }
      pt = 'unit conversion'; tip = '1 ' + big + ' = ' + fct + ' ' + small + '; bigger unit to smaller, multiply; the other way, divide';
    } else if (kd == 'time') {
      const sh = ri(1, 11, R), sm = d < 6 ? pick([0, 15, 30, 45]) : ri(0, 59, R), gap = ri(25, Math.round(lerp([80, 100, 130, 160, 200, 240, 260, 300, 320, 360, 400, 480], d)), R), e = sh * 60 + sm + gap;
      const h12 = (m) => ((Math.floor(m / 60) + 11) % 12) + 1, clock = (m) => h12(m) + ':' + String(m % 60).padStart(2, '0');
      q = 'Minutes from ' + clock(sh * 60 + sm) + ' to ' + clock(e); a = gap; pt = 'clock time';
      tip = 'Go up to the next whole hour first, then add the rest';
    } else if (kd == 'recipe') {
      const s0 = pick([2, 3, 4, 5, 6]); let s1 = pick([2, 3, 4, 5, 6, 8, 10, 12]); if (s1 == s0) s1 += 2;
      const m = ri(2, Math.max(3, Math.floor(hi / 12)), R) * (d >= 6 ? 5 : 1), qty = s0 * m;
      q = 'Recipe: ' + qty + ' g for ' + s0 + '. For ' + s1 + '?'; a = m * s1; pt = 'scale a recipe';
      tip = 'Find the amount for one, then multiply';
    } else if (kd == 'ratio') {
      const r1 = ri(2, 7, R); let r2n = ri(2, 9, R); if (r2n == r1) r2n++;
      const kk = ri(2, Math.max(3, Math.floor(hi / 20)), R);
      q = 'Ratio ' + r1 + ':' + r2n + '. First is ' + r1 * kk + '. Second?'; a = r2n * kk; pt = 'ratio';
      tip = 'Find what one part is worth, then multiply';
    } else if (kd == 'rate') {
      if (R() < 0.5) {
        const t = pick([1.5, 2, 2.5, 3, 4]), sp = (t % 1 ? 2 : 1) * ri(3, Math.max(5, Math.floor(hi / 6)), R) * (d >= 6 ? 2 : 1);
        q = r2(sp * t) + ' km in ' + t + ' h. km/h?'; a = sp; pt = 'speed';
        tip = 'Distance ÷ time';
      } else {
        const n = pick([2, 3, 4, 5, 6]), c = 5 * ri(2, Math.max(4, Math.floor(hi / 8)), R);
        q = n + ' for ' + c$ + r2((n * c) / 100) + '. Price of one?'; a = r2(c / 100); pt = 'unit price';
        tip = 'Total ÷ number of items';
      }
    } else if (kd == 'split') {
      const n = pick([2, 4, 5, 10]), total = n * ri(3, Math.max(5, Math.floor(hi / 6)), R) + pick([0, 0, n / 2 == Math.floor(n / 2) ? n / 2 : 0]);
      q = 'Split ' + c$ + total + ' between ' + n; a = r2(total / n); pt = 'split the bill';
      tip = 'Divide the total by the number of people';
    } else if (kd == 'tax') {
      const p = pick([5, 8, 10]), price = 10 * ri(2, Math.max(3, Math.floor(hi / 5)), R);
      q = c$ + price + ' plus ' + p + '% tax'; a = r2(price + (price * p) / 100); pt = 'add tax';
      tip = 'Find ' + p + '% of the price, then add it on';
    } else if (kd == 'gst') {
      const r = pick(d < 5 ? [5, 18] : [5, 18, 40]), unit = r == 5 ? 20 : d < 5 ? 100 : 50, price = unit * ri(2, Math.round(lerp([4, 5, 6, 8, 10, 12, 14, 18, 24, 30, 40, 50], d)), R), amt = r2((price * r) / 100);
      const how10 = r == 5 ? '5% is half of 10%' : r == 18 ? '18% is 20% minus 2%, or 10% plus 8%' : '40% is four times 10%';
      if (R() < 0.5) { q = c$ + price + ' plus ' + r + '% GST'; a = r2(price + amt); pt = 'add GST'; tip = 'Find the GST first (' + how10 + '), then add it on'; }
      else { q = 'GST at ' + r + '% on ' + c$ + price; a = amt; pt = 'GST amount'; tip = 'Start from 10%: ' + how10; }
    } else if (kd == 'ungst') {
      const r = pick(d < 6 ? [5, 18] : [5, 18, 40]), kk = ri(2, Math.max(4, Math.round(lerp([4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30, 40], d))), R), base = (d < 8 ? 100 : r == 5 ? 20 : 50) * kk;
      q = c$ + r2((base * (100 + r)) / 100) + ' includes ' + r + '% GST. Price before GST?'; a = base; pt = 'GST in the price';
      tip = 'The total is ' + (100 + r) + '% of the price: divide by ' + (100 + r) + ' for 1%, then multiply by 100';
    } else if (kd == 'off') {
      const p = pick(d < 4 ? [10, 20, 25, 50] : [10, 15, 20, 25, 30, 40, 60, 75]), price = 10 * ri(2, Math.max(3, Math.floor(hi / 5)), R);
      q = p + '% off ' + c$ + price + '. You save?'; a = r2((price * p) / 100); pt = 'discount amount';
      tip = 'The saving is ' + p + '% of the price: build it from 10%';
    } else if (kd == 'pcoff') {
      const p = pick(d < 6 ? [10, 20, 25, 50] : [10, 20, 25, 30, 40, 50, 60, 75]), price = 20 * ri(2, Math.max(4, Math.floor(hi / 10)), R), now = (price * (100 - p)) / 100;
      q = 'Was ' + c$ + price + ', now ' + c$ + now + '. % off?'; a = p; pt = 'percent off';
      tip = 'The drop is ' + (price - now) + '. Divide the drop by the old price: a tenth is 10%, a fifth 20%, a quarter 25%';
    } else if (kd == 'orig') {
      const p = pick([10, 20, 25, 50]), orig = 20 * ri(2, Math.max(4, Math.floor(hi / 10)), R), paid = (orig * (100 - p)) / 100;
      q = 'Paid ' + c$ + paid + ' after ' + p + '% off. Original price?'; a = orig; pt = 'original price';
      tip = 'What you paid is ' + (100 - p) + '% of the original: divide by ' + (100 - p) + ' for 1%, then multiply by 100';
    } else if (kd == 'tiptot') {
      const p = pick(d < 6 ? [10, 15, 20] : [10, 12, 15, 18, 20]), bill = ri(4, Math.max(5, Math.floor(hi / 2)), R) * 2;
      q = 'Bill ' + c$ + bill + ' plus ' + p + '% tip. Total?'; a = r2((bill * (100 + p)) / 100); pt = 'total with tip';
      tip = 'Find the tip from 10%, then add it to the bill';
    } else if (kd == 'splittip') {
      const n = pick([2, 4, 5]), bill = 100 * ri(1, Math.max(2, Math.round(lerp([2, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16], d))), R);
      if (R() < 0.5) { const p = pick([10, 20]); q = c$ + bill + ' bill, ' + p + '% tip, ' + n + ' people. Each pays?'; a = r2((bill * (100 + p)) / 100 / n); pt = 'split with tip'; tip = 'Add the tip first, then divide by ' + n; }
      else { const r = pick([5, 18]); q = c$ + bill + ' plus ' + r + '% GST, ' + n + ' people. Each pays?'; a = r2((bill * (100 + r)) / 100 / n); pt = 'split with GST'; tip = 'Add the GST first, then divide by ' + n; }
    } else if (kd == 'dist') {
      const sp = 10 * ri(3, 6 + Math.floor(d / 2), R), t = pick(d < 6 ? [1.5, 2, 2.5, 3, 4] : [1.5, 2, 2.5, 3, 3.5, 4, 5, 6]);
      q = sp + ' km/h for ' + t + ' h. Distance?'; a = r2(sp * t); pt = 'distance';
      tip = 'Distance = speed × time: whole hours first, then the half hour is half the speed';
    } else if (kd == 'ttime') {
      const sp = 10 * ri(3, 6 + Math.floor(d / 2), R), t = pick(d < 6 ? [1.5, 2, 2.5, 3, 4] : [1.5, 2, 2.5, 3, 3.5, 4, 5, 6]);
      q = r2(sp * t) + ' km at ' + sp + ' km/h. Hours?'; a = t; pt = 'travel time';
      tip = 'Time = distance ÷ speed: how many times does the speed fit?';
    } else if (kd == 'fuel') {
      const eff = pick(d < 6 ? [10, 12, 15, 20] : [10, 12, 15, 16, 18, 20, 25]), L = ri(2, Math.max(5, Math.floor(hi / 8)), R);
      q = eff * L + ' km at ' + eff + ' km per litre. Litres?'; a = L; pt = 'fuel used';
      tip = 'Litres = distance ÷ km per litre';
    } else if (kd == 'fcost') {
      const eff = pick([10, 12, 15, 20, 25]), L = ri(2, Math.max(5, Math.floor(hi / 12)), R), price = 5 * ri(10, 24, R);
      q = eff * L + ' km, ' + eff + ' km per litre, ' + c$ + price + ' per litre. Cost?'; a = L * price; pt = 'fuel cost';
      tip = 'Litres first (' + eff * L + ' ÷ ' + eff + '), then × the price per litre';
    } else if (kd == 'dur') {
      const mm = () => (d < 6 ? pick([15, 30, 45]) : 5 * ri(1, 11, R)), h1 = ri(1, 6, R), h2 = ri(1, 6, R), m1 = mm(), m2 = mm();
      q = h1 + ' h ' + m1 + ' min + ' + h2 + ' h ' + m2 + ' min. Minutes?'; a = (h1 + h2) * 60 + m1 + m2; pt = 'duration sum';
      tip = 'Add the hours and the minutes separately, then turn the hours into minutes';
    } else if (kd == 'wage') {
      const rate = 5 * ri(10, Math.max(14, Math.round(lerp([14, 16, 20, 24, 30, 36, 44, 52, 60, 70, 80, 90], d))), R), t = ri(2, 8, R) + (R() < 0.5 ? 0.5 : 0);
      q = c$ + rate + ' an hour for ' + t + ' h. Pay?'; a = r2(rate * t); pt = 'hourly pay';
      tip = 'Whole hours × the rate, then add half the rate for a half hour';
    } else if (kd == 'days') {
      const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], ML = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], mi = ri(2, 10, R), d1 = ri(5, ML[mi], R), d2 = ri(1, 20, R);
      q = 'Days from ' + d1 + ' ' + MN[mi] + ' to ' + d2 + ' ' + MN[mi + 1]; a = ML[mi] - d1 + d2; pt = 'days between';
      tip = 'Days left in the first month, then the days into the next one';
    } else if (kd == 'per100') {
      const g = pick(['g', 'ml']), qty = pick(d < 6 ? [200, 500, 250, 400] : [200, 250, 400, 500, 750, 1500]), pp = 2 * ri(3, Math.max(8, Math.round(lerp([8, 10, 12, 15, 20, 25, 30, 35, 40, 50, 60, 70], d))), R);
      q = qty + ' ' + g + ' for ' + c$ + r2((qty / 100) * pp) + '. Price per 100 ' + g + '?'; a = pp; pt = 'price per 100';
      tip = 'Divide by ' + qty / 100 + ' to get the price of 100';
    } else if (kd == 'gap') {
      const N = [2, 4, 5, 10], na = pick(N); let nb = pick(N.filter((x) => x != na));
      const half = (n) => (n % 2 == 0 && R() < 0.5 ? 0.5 : 0), pb = ri(6, 30, R) + half(nb), pa0 = pb + ri(1, 5, R) + half(na), pa = na % 2 ? Math.ceil(pa0) : pa0;   // an odd count keeps whole-number totals
      const ta = r2(na * pa), tb = r2(nb * pb);
      q = na + ' for ' + c$ + ta + ' or ' + nb + ' for ' + c$ + tb + '. Saving per item?'; a = r2(pa - pb); pt = 'price gap';
      tip = 'Price of one each way (' + ta + ' ÷ ' + na + ', ' + tb + ' ÷ ' + nb + '), then subtract';
    } else if (kd == 'free') {
      const b = pick([1, 2, 3]), f = pick([1, 1, 2]), k = ri(2, 4, R), price = 5 * ri(2, Math.max(6, Math.round(hi / 10)), R);
      q = 'Buy ' + b + ' get ' + f + ' free, ' + c$ + price + ' each. Cost of ' + k * (b + f) + ' items?'; a = k * b * price; pt = 'free items';
      tip = 'Items come in groups of ' + (b + f) + ', and you pay for ' + b + ' in each group';
    } else if (kd == 'bundle') {
      const n = pick([3, 4, 5]), each = 5 * ri(4, Math.max(8, Math.round(hi / 8)), R), save = 5 * ri(1, Math.max(2, Math.floor((each * n) / 10)), R);
      q = c$ + each + ' each, or ' + n + ' for ' + c$ + (each * n - save) + '. Saving on ' + n + '?'; a = save; pt = 'bundle saving';
      tip = 'Price for ' + n + ' separately (' + each + ' × ' + n + ') minus the bundle price';
    } else if (kd == 'si') {
      const P = 500 * ri(2, Math.max(4, Math.round(lerp([4, 5, 6, 8, 10, 12, 14, 16, 20, 24, 30, 40], d))), R), r = pick(d < 6 ? [5, 10] : [5, 6, 8, 10, 12]), t = ri(2, d < 6 ? 4 : 6, R);
      q = c$ + P + ' at ' + r + '% a year for ' + t + ' years. Simple interest?'; a = (P * r * t) / 100; pt = 'simple interest';
      tip = 'One year is ' + r + '% of ' + P + '; then multiply by ' + t + ' years';
    } else if (kd == 'pchg') {
      const p = pick(d < 6 ? [10, 20, 25, 50] : [10, 15, 20, 25, 30, 40, 50, 60]), up = R() < 0.5, old = 20 * ri(2, Math.max(4, Math.floor(hi / 10)), R), now = (old * (up ? 100 + p : 100 - p)) / 100;
      q = (up ? 'Rose' : 'Fell') + ' from ' + c$ + old + ' to ' + c$ + now + '. % ' + (up ? 'rise' : 'fall') + '?'; a = p; pt = 'percent change';
      tip = 'Change ÷ the starting value: ' + Math.abs(now - old) + ' ÷ ' + old;
    } else if (kd == 'hike') {
      const p = pick(d < 6 ? [10, 20, 5] : [5, 8, 10, 12, 15, 20]), S0 = 1000 * ri(10, Math.max(20, Math.round(lerp([20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 100, 120], d))), R);
      q = c$ + S0 + ' salary, ' + p + '% hike. New salary?'; a = r2((S0 * (100 + p)) / 100); pt = 'salary hike';
      tip = 'Find the hike from 10% (' + p + '% of ' + S0 + '), then add it on';
    } else if (kd == 'r72') {
      const r = pick(d < 6 ? [2, 3, 4, 6, 8, 9, 12] : [2, 3, 4, 6, 8, 9, 12, 18, 24]);
      q = 'Rule of 72: years to double at ' + r + '%?'; a = 72 / r; pt = 'rule of 72';
      tip = 'Divide 72 by the rate';
    } else if (kd == 'msave') {
      const m = 500 * ri(1, Math.max(4, Math.round(lerp([4, 5, 6, 8, 10, 12, 14, 16, 20, 24, 30, 40], d))), R), n = ri(4, 24, R);
      q = 'Save ' + c$ + m + ' a month. Months to reach ' + c$ + m * n + '?'; a = n; pt = 'months to save';
      tip = 'Goal ÷ the monthly amount';
    } else if (kd == 'ci') {
      const P = 1000 * ri(2, Math.max(4, Math.round(lerp([4, 5, 6, 8, 10, 12, 14, 16, 20, 24, 30, 40], d))), R), r = pick([5, 10, 20]);
      q = c$ + P + ' at ' + r + '% a year for 2 years, compounded. Total?'; a = r2((P * (100 + r) * (100 + r)) / 10000); pt = 'compound interest';
      tip = 'Grow by ' + r + '% once, then grow the new total by ' + r + '% again';
    } else if (kd == 'rr') {
      const ov = pick([5, 10, 20, 50]), rr = ri(4, d < 6 ? 10 : 14, R) + (ov % 10 == 0 && d >= 4 && R() < 0.5 ? 0.5 : 0);
      q = r2(ov * rr) + ' runs in ' + ov + ' overs. Run rate?'; a = rr; pt = 'run rate';
      tip = 'Runs per over = runs ÷ overs';
    } else if (kd == 'req') {
      const T = pick([20, 50]), od = pick(T == 20 ? [5, 8, 10, 12] : [10, 20, 25, 30]), need = ri(6, 11, R), s0 = ri(3, 8, R) * od, tg = s0 + need * (T - od);
      q = 'Target ' + tg + ' in ' + T + ' overs. ' + s0 + ' after ' + od + '. Runs per over needed?'; a = need; pt = 'required rate';
      tip = 'Runs still needed (' + (tg - s0) + ') ÷ overs left (' + (T - od) + ')';
    } else if (kd == 'sr') {
      const bl = pick([10, 20, 25, 50]), rn = ri(Math.ceil(bl / 4), bl * 2, R);
      q = rn + ' runs off ' + bl + ' balls. Strike rate?'; a = r2((rn * 100) / bl); pt = 'strike rate';
      tip = 'Runs per 100 balls: scale the ' + bl + ' balls up to 100';
    } else if (kd == 'avg') {
      const inn = pick([4, 5, 8, 10]), av = 5 * ri(4, 14, R);
      q = av * inn + ' runs in ' + inn + ' innings. Average?'; a = av; pt = 'batting average';
      tip = 'Average = runs ÷ innings';
    } else if (kd == 'balls') {
      const o = ri(1, d < 6 ? 6 : 19, R), b = ri(0, 5, R);
      q = o + '.' + b + ' overs. Balls bowled?'; a = o * 6 + b; pt = 'balls in overs';
      tip = 'Each over is 6 balls; the digit after the point is extra balls, not a decimal';
    } else if (kd == 'myr') {
      const m = 500 * ri(20, Math.max(30, Math.round(lerp([30, 36, 44, 52, 60, 70, 80, 90, 100, 120, 140, 160], d))), R);
      if (R() < 0.5) { q = c$ + m + ' a month. Per year?'; a = m * 12; } else { q = c$ + m * 12 + ' a year. Per month?'; a = m; }
      pt = 'monthly and yearly'; tip = 'A year is 12 months: × 12 is × 10 plus × 2; per month is ÷ 12';
    } else if (kd == 'dayb') {
      const days = pick([7, 30]), pd = 50 * ri(4, 20, R);
      q = c$ + pd * days + ' for ' + days + ' days. Per day?'; a = pd; pt = 'daily budget';
      tip = 'Divide by ' + days + (days == 30 ? ': divide by 3, then by 10' : '');
    } else if (kd == 'rule') {
      const inc = 5000 * ri(6, 24, R), [wh, pc] = pick([['Needs', 50], ['Wants', 30], ['Savings', 20]]);
      q = c$ + inc + ' income, 50-30-20 rule. ' + wh + '?'; a = r2((inc * pc) / 100); pt = 'budget rule';
      tip = 'Needs are half, wants three tenths, savings two tenths: find 10% first';
    } else if (kd == 'rent') {
      const n = pick([2, 3, 4]), e1 = 1000 * ri(4, 15, R), e2 = 100 * ri(2, 15, R);
      q = 'Rent ' + c$ + n * e1 + ' and bills ' + c$ + n * e2 + ', ' + n + ' people. Each?'; a = e1 + e2; pt = 'shared rent';
      tip = 'Divide the rent and the bills by ' + n + ' separately, then add';
    } else if (kd == 'take') {
      const p = pick([10, 12, 15, 20, 25, 30]), S0 = 5000 * ri(6, 24, R);
      q = c$ + S0 + ' salary, ' + p + '% deducted. Take-home?'; a = r2((S0 * (100 - p)) / 100); pt = 'take-home';
      tip = 'You keep ' + (100 - p) + '%: find the deduction from 10%, then subtract it';
    } else if (kd == 'temp') {
      const c = 5 * ri(1, d < 6 ? 8 : 16, R), f = (c * 9) / 5 + 32;
      if (R() < 0.5) { q = c + '°C in °F'; a = f; } else { q = f + '°F in °C'; a = c; }
      pt = 'temperature'; tip = '°C to °F: × 9, ÷ 5, then + 32. °F to °C: − 32, × 5, ÷ 9';
    } else {
      const P = [10, 20, 25, 50], p1 = pick(P), p2 = pick(P.filter((x) => x != p1)), price = 100 * ri(1, Math.max(2, Math.floor(hi / 60)), R);
      q = p1 + '% off, then ' + p2 + '% off ' + c$ + price; a = r2((price * (100 - p1) * (100 - p2)) / 10000); pt = 'successive discounts';
      tip = 'Each discount multiplies: ' + (100 - p1) + '% of the price, then ' + (100 - p2) + '% of that';
    }
  } else {
    const s1 = Math.round(lerp([9, 12, 20, 30, 50, 80, 99, 150, 250, 400, 600, 999], d));
    const s2 = Math.round(lerp([5, 6, 8, 9, 12, 12, 15, 20, 25, 30, 40, 50], d));
    const f = Math.floor(R() * 4);
    pt = ['a + b × c', '(a + b) × c', 'a × b − c', '(a − b) × c'][f];
    const x = ri(Math.max(3, L(s1, 0.3)), s1, R), y = ri(L(s2, 0.4), s2, R), z = ri(L(s2, 0.4), s2, R);
    const h1 = Math.max(3, s1 >> 1), u = ri(L(h1, 0.3), h1, R), v = ri(L(h1, 0.3), h1, R);
    if (f == 0) { q = x + ' + ' + y + ' × ' + z; a = x + y * z; }
    else if (f == 1) { q = '(' + u + ' + ' + v + ') × ' + z; a = (u + v) * z; }
    else if (f == 2) { const c = ri(1, Math.max(1, Math.min(s1, Math.floor(0.85 * y * z))), R); q = y + ' × ' + z + ' − ' + c; a = y * z - c; }
    else { const r = ri(1, Math.max(1, Math.round(x * 0.7)), R); q = '(' + x + ' − ' + r + ') × ' + y; a = (x - r) * y; }
  }
  return { q, a, sk: k, d, pt, tip };
}

/* ---------------- worked methods ---------------- */
const parts = (y) => String(y).split('').map((c, i, A) => +c * 10 ** (A.length - 1 - i)).filter(Boolean);
const sg = (v) => (v < 0 ? '−' : '+');

/** Human-readable worked solution for a question object ({q,a,sk}). */
export function how(p) {
  const q = String(p.q ?? '');
  const n = (q.match(/\d+/g) || []).map(Number), a = p.a;
  let m, t;
  if (p.sk == 'neg') {
    const e = q.replace(/−/g, '-'), sz = (e.match(/\d+/g) || []).map(Number), A = String(a).replace('-', '−');
    if (p.pt == 'cross zero') { const hi = Math.max(sz[0], sz[1]), lo = Math.min(sz[0], sz[1]); return 'Different signs: ' + hi + ' − ' + lo + ' = ' + (hi - lo) + '. The bigger number is ' + ((a < 0) ? 'the negative one' : 'the positive one') + ', so the answer is ' + A; }
    if (p.pt == 'both negative') return 'Two negatives add up in size: ' + sz[0] + ' + ' + sz[1] + ' = ' + (sz[0] + sz[1]) + ', and it stays negative: ' + A;
    if (p.pt == 'subtract a negative') { const x = e.trim().startsWith('-') ? -sz[0] : sz[0]; return 'Subtracting a negative adds: ' + String(x).replace('-', '−') + ' + ' + sz[1] + ' = ' + A; }
    if (p.pt == 'chain') {
      const tk = e.match(/^-?\d+|[+-] \d+/g) || []; let t = 0, out = [];
      tk.forEach((x, i) => { t += i ? (x[0] == '-' ? -sz[i] : sz[i]) : +x; out.push(i ? x.replace('-', '−') + ' → ' + String(t).replace('-', '−') : String(+x).replace('-', '−')); });
      return 'Left to right: ' + out.join(', ') + '. The answer is ' + A;
    }
    const mu = p.pt != 'signed quotient', neg = a < 0, ans = mu ? sz[0] + ' × ' + sz[1] + ' = ' + sz[0] * sz[1] : sz[0] + ' ÷ ' + sz[1] + ' = ' + Math.abs(a);
    return 'Sizes first: ' + ans + '. ' + (neg ? 'Different signs, so the answer is negative' : 'Same signs, so the answer is positive') + ': ' + A;
  }
  if (p.sk == 'frac') {
    const nums = (q.match(/\d+/g) || []).map(Number), gc = (x, y) => (y ? gc(y, x % y) : x), A = String(a);
    const lw = (n, m) => { const c = gc(n, m); return c > 1 ? n + '/' + m + ' = ' + n / c + '/' + m / c : ''; };
    if (p.pt == 'unit fraction' || p.pt == 'fraction of') return nums[2] + ' ÷ ' + nums[1] + ' = ' + nums[2] / nums[1] + (nums[0] > 1 ? ', × ' + nums[0] + ' = ' + A : '');
    if (p.pt == 'simplify') { const c = gc(nums[0], nums[1]); return 'Both ' + nums[0] + ' and ' + nums[1] + ' divide by ' + c + ', so ' + nums[0] + '/' + nums[1] + ' = ' + A; }
    const [n1, d1, n2, d2] = nums;
    if (p.pt == 'same denominator') { const t = q.includes('+') ? n1 + n2 : n1 - n2; return 'Same bottom: ' + n1 + (q.includes('+') ? ' + ' : ' − ') + n2 + ' = ' + t + ', so ' + t + '/' + d1 + (t + '/' + d1 == A ? '' : (lw(t, d1) ? ' = ' + lw(t, d1).split(' = ')[1] : '') + ' = ' + A); }
    if (p.pt == 'unlike denominators') { const pl = q.includes('+'), t = pl ? n1 * d2 + n2 * d1 : n1 * d2 - n2 * d1; return 'Common bottom ' + d1 * d2 + ': ' + n1 * d2 + '/' + d1 * d2 + (pl ? ' + ' : ' − ') + n2 * d1 + '/' + d1 * d2 + ' = ' + t + '/' + d1 * d2 + ', in lowest terms ' + A; }
    if (p.pt == 'multiply fractions') return 'Tops: ' + n1 + ' × ' + n2 + ' = ' + n1 * n2 + '. Bottoms: ' + d1 + ' × ' + d2 + ' = ' + d1 * d2 + '. In lowest terms ' + A;
    return 'Flip the second and multiply: ' + n1 + '/' + d1 + ' × ' + d2 + '/' + n2 + ' = ' + n1 * d2 + '/' + d1 * n2 + ', in lowest terms ' + A;
  }
  if (p.sk == 'life') {
    const v = (q.match(/\d+(?:\.\d+)?/g) || []).map(Number), A = String(a);
    if (p.pt == 'friendly tip' || p.pt == 'awkward tip') return '10% of ' + v[1] + ' = ' + +(v[1] / 10).toFixed(2) + '. ' + v[0] + '% is ' + v[0] / 10 + ' of those: ' + A;
    if (p.pt == 'sale price') return (100 - v[0]) + '% is what you pay: ' + (100 - v[0]) + '% of ' + v[1] + ' = ' + A;
    if (p.pt == 'unit conversion') { const m = /^([\d.]+) (\S+) in (\S+)$/.exec(q), u = m && UNITS.find(([b, sm]) => (b == m[2] && sm == m[3]) || (sm == m[2] && b == m[3])); return u ? (m[2] == u[0] ? m[1] + ' × ' + u[2] + ' = ' + A : m[1] + ' ÷ ' + u[2] + ' = ' + A) : ''; }
    if (p.pt == 'clock time') { const m = q.match(/(\d+):(\d+) to (\d+):(\d+)/); const s = +m[1] * 60 + +m[2]; let e = (+m[3]) * 60 + +m[4]; while (e < s) e += 720; return 'Start ' + m[1] + ':' + m[2] + ', end ' + m[3] + ':' + m[4] + '. Up to the next hour, then the rest: ' + (e - s) + ' minutes' + (String(e - s) == A ? '' : ' = ' + A); }
    if (p.pt == 'scale a recipe') return v[0] + ' ÷ ' + v[1] + ' = ' + v[0] / v[1] + ' for one. × ' + v[2] + ' = ' + A;
    if (p.pt == 'ratio') return 'First part: ' + v[2] + ' ÷ ' + v[0] + ' = ' + v[2] / v[0] + ' per part. Second: ' + v[2] / v[0] + ' × ' + v[1] + ' = ' + A;
    if (p.pt == 'speed') return v[0] + ' ÷ ' + v[1] + ' = ' + A + ' km/h';
    if (p.pt == 'unit price') return CUR.sym + v[1] + ' ÷ ' + v[0] + ' = ' + CUR.sym + A;
    if (p.pt == 'split the bill') return v[0] + ' ÷ ' + v[1] + ' = ' + A;
    if (p.pt == 'add tax') { const tx = +((v[0] * v[1]) / 100).toFixed(2); return v[1] + '% of ' + v[0] + ' = ' + tx + '. ' + v[0] + ' + ' + tx + ' = ' + A; }
    if (p.pt == 'add GST') { const g = +((v[0] * v[1]) / 100).toFixed(2); return v[1] + '% of ' + v[0] + ' = ' + g + '. ' + v[0] + ' + ' + g + ' = ' + A; }
    if (p.pt == 'GST amount') return v[0] + '% of ' + v[1] + ': 10% is ' + +(v[1] / 10).toFixed(2) + ', so ' + v[0] + '% = ' + A;
    if (p.pt == 'GST in the price') return 'The total is ' + (100 + v[1]) + '% of the price. ' + v[0] + ' ÷ ' + (100 + v[1]) + ' = ' + +(v[0] / (100 + v[1])).toFixed(2) + ' for 1%. × 100 = ' + A;
    if (p.pt == 'discount amount') return v[0] + '% of ' + v[1] + ': 10% is ' + +(v[1] / 10).toFixed(2) + ', so ' + v[0] + '% = ' + A + ' saved';
    if (p.pt == 'percent off') return 'The drop is ' + v[0] + ' − ' + v[1] + ' = ' + (v[0] - v[1]) + '. ' + (v[0] - v[1]) + ' ÷ ' + v[0] + ' = ' + A + '%';
    if (p.pt == 'original price') return 'Paid is ' + (100 - v[1]) + '% of the original. ' + v[0] + ' ÷ ' + (100 - v[1]) + ' = ' + +(v[0] / (100 - v[1])).toFixed(2) + ' for 1%. × 100 = ' + A;
    if (p.pt == 'total with tip') { const t = +((v[0] * v[1]) / 100).toFixed(2); return v[1] + '% of ' + v[0] + ' = ' + t + '. ' + v[0] + ' + ' + t + ' = ' + A; }
    if (p.pt == 'split with tip' || p.pt == 'split with GST') { const t = +((v[0] * v[1]) / 100).toFixed(2), n = v[2]; return v[1] + '% of ' + v[0] + ' = ' + t + '. ' + v[0] + ' + ' + t + ' = ' + +(v[0] + t).toFixed(2) + '. ÷ ' + n + ' = ' + A; }
    if (p.pt == 'distance') return v[0] + ' × ' + v[1] + ' = ' + A + ' km';
    if (p.pt == 'travel time') return v[0] + ' ÷ ' + v[1] + ' = ' + A + ' h';
    if (p.pt == 'fuel used') return v[0] + ' ÷ ' + v[1] + ' = ' + A + ' litres';
    if (p.pt == 'fuel cost') return 'Litres: ' + v[0] + ' ÷ ' + v[1] + ' = ' + v[0] / v[1] + '. Cost: ' + v[0] / v[1] + ' × ' + v[2] + ' = ' + A;
    if (p.pt == 'duration sum') return 'Hours: ' + v[0] + ' + ' + v[2] + ' = ' + (v[0] + v[2]) + ' h = ' + (v[0] + v[2]) * 60 + ' min. Minutes: ' + v[1] + ' + ' + v[3] + ' = ' + (v[1] + v[3]) + '. Total ' + A;
    if (p.pt == 'hourly pay') return v[0] + ' × ' + v[1] + ' = ' + A;
    if (p.pt == 'days between') { const ML = { Mar: 31, Apr: 30, May: 31, Jun: 30, Jul: 31, Aug: 31, Sep: 30, Oct: 31, Nov: 30 }, mo = /from \d+ (\w+)/.exec(q)[1]; return ML[mo] + ' − ' + v[0] + ' = ' + (ML[mo] - v[0]) + ' days left in ' + mo + ', then ' + v[1] + ' more: ' + A; }
    if (p.pt == 'price per 100') return v[1] + ' ÷ ' + v[0] / 100 + ' = ' + A + ' for 100';
    if (p.pt == 'price gap') { const [na, ta, nb, tb] = v; return ta + ' ÷ ' + na + ' = ' + +(ta / na).toFixed(2) + ' each; ' + tb + ' ÷ ' + nb + ' = ' + +(tb / nb).toFixed(2) + ' each; difference ' + A; }
    if (p.pt == 'free items') { const [b, f, pr, tot] = v, g = tot / (b + f); return tot + ' items is ' + g + ' groups of ' + (b + f) + '. You pay for ' + b + ' in each: ' + g * b + ' × ' + pr + ' = ' + A; }
    if (p.pt == 'bundle saving') return v[0] + ' × ' + v[1] + ' = ' + v[0] * v[1] + ' separately. ' + v[0] * v[1] + ' − ' + v[2] + ' = ' + A;
    if (p.pt == 'simple interest') return v[1] + '% of ' + v[0] + ' = ' + +((v[0] * v[1]) / 100).toFixed(2) + ' a year. × ' + v[2] + ' years = ' + A;
    if (p.pt == 'percent change') return 'Change: ' + Math.abs(v[1] - v[0]) + '. ' + Math.abs(v[1] - v[0]) + ' ÷ ' + v[0] + ' = ' + A + '%';
    if (p.pt == 'salary hike') return v[1] + '% of ' + v[0] + ' = ' + +((v[0] * v[1]) / 100).toFixed(2) + '. ' + v[0] + ' + ' + +((v[0] * v[1]) / 100).toFixed(2) + ' = ' + A;
    if (p.pt == 'rule of 72') return '72 ÷ ' + v[0] + ' = ' + A + ' years';
    if (p.pt == 'months to save') return v[1] + ' ÷ ' + v[0] + ' = ' + A + ' months';
    if (p.pt == 'compound interest') { const y1 = +((v[0] * (100 + v[1])) / 100).toFixed(2); return 'Year 1: ' + v[0] + ' × ' + (100 + v[1]) / 100 + ' = ' + y1 + '. Year 2: ' + y1 + ' × ' + (100 + v[1]) / 100 + ' = ' + A; }
    if (p.pt == 'run rate') return v[0] + ' ÷ ' + v[1] + ' = ' + A + ' runs an over';
    if (p.pt == 'required rate') return 'Runs left: ' + v[0] + ' − ' + v[2] + ' = ' + (v[0] - v[2]) + '. Overs left: ' + v[1] + ' − ' + v[3] + ' = ' + (v[1] - v[3]) + '. ' + (v[0] - v[2]) + ' ÷ ' + (v[1] - v[3]) + ' = ' + A;
    if (p.pt == 'strike rate') return v[0] + ' × (100 ÷ ' + v[1] + ') = ' + v[0] + ' × ' + 100 / v[1] + ' = ' + A;
    if (p.pt == 'batting average') return v[0] + ' ÷ ' + v[1] + ' = ' + A;
    if (p.pt == 'balls in overs') { const m = /^(\d+)\.(\d)/.exec(q); return m[1] + ' overs × 6 = ' + m[1] * 6 + ', + ' + m[2] + ' = ' + A + ' balls'; }
    if (p.pt == 'monthly and yearly') return q.includes('a month') ? v[0] + ' × 12 = ' + A : v[0] + ' ÷ 12 = ' + A;
    if (p.pt == 'daily budget') return v[0] + ' ÷ ' + v[1] + ' = ' + A;
    if (p.pt == 'budget rule') { const wh = /\. (\w+)\?$/.exec(q)[1], pc = { Needs: 50, Wants: 30, Savings: 20 }[wh]; return '10% of ' + v[0] + ' = ' + v[0] / 10 + '. ' + wh + ' is ' + pc + '%: ' + pc / 10 + ' × ' + v[0] / 10 + ' = ' + A; }
    if (p.pt == 'shared rent') return v[0] + ' ÷ ' + v[2] + ' = ' + v[0] / v[2] + ' and ' + v[1] + ' ÷ ' + v[2] + ' = ' + v[1] / v[2] + '. Together ' + A;
    if (p.pt == 'take-home') { const dd = +((v[0] * v[1]) / 100).toFixed(2); return v[1] + '% of ' + v[0] + ' = ' + dd + '. ' + v[0] + ' − ' + dd + ' = ' + A; }
    if (p.pt == 'temperature') return q.includes('°C in') ? v[0] + ' × 9 ÷ 5 = ' + (v[0] * 9) / 5 + ', + 32 = ' + A : '(' + v[0] + ' − 32) × 5 ÷ 9 = ' + A;
    if (p.pt == 'successive discounts') return 'Multiply what is left each time: ' + v[2] + ' × ' + (100 - v[0]) / 100 + ' × ' + (100 - v[1]) / 100 + ' = ' + A;
    return '';
  }
  if (p.sk == 'add') { t = n[0]; return n[0] + parts(n[1]).map((v) => ' + ' + v + ' → ' + (t += v)).join(''); }
  if (p.sk == 'sub') { t = n[0]; return n[0] + parts(n[1]).map((v) => ' − ' + v + ' → ' + (t -= v)).join(''); }
  if (p.sk == 'mul') {
    const x = Math.max(n[0], n[1]), y = Math.min(n[0], n[1]), P = parts(y);
    return P.length < 2 ? x + ' × ' + y + ' = ' + a : P.map((v) => x + '×' + v).join(' + ') + ' = ' + P.map((v) => x * v).join(' + ') + ' = ' + a;
  }
  if (p.sk == 'div') return n[1] + ' × ' + a + ' = ' + n[0] + ', so ' + n[0] + ' ÷ ' + n[1] + ' = ' + a;
  if (p.sk == 'sq') {
    const c = Math.round(n[0] / 10) * 10, e = n[0] - c;
    return e && c ? n[0] + '² = (' + c + sg(e) + Math.abs(e) + ')² = ' + c * c + ' ' + sg(2 * c * e) + ' ' + Math.abs(2 * c * e) + ' + ' + e * e + ' = ' + a : n[0] + '² = ' + a;
  }
  if (p.sk == 'pw') {
    if (q[0] == '√') return a + '² = ' + n[0] + ', so √' + n[0] + ' = ' + a;
    if (q[0] == '∛') return a + '³ = ' + a + '² × ' + a + ' = ' + a * a + ' × ' + a + ' = ' + n[0] + ', so ∛' + n[0] + ' = ' + a;
    return n[0] + '³ = ' + n[0] + '² × ' + n[0] + ' = ' + n[0] * n[0] + ' × ' + n[0] + ' = ' + a;
  }
  if (p.sk == 'mod') {
    const x = n[0], m = n[1], f = Math.floor(x / m), ds = String(x).split('').reduce((q, c) => q + +c, 0);
    if (m == 11) { const dg = String(x).split('').reverse().map(Number), alt = dg.reduce((q, c, i) => q + (i % 2 ? -c : c), 0), r = ((alt % 11) + 11) % 11; return 'Alternate + and − from the right: ' + dg.map((c, i) => (i ? (i % 2 ? '− ' : '+ ') : '') + c).join(' ') + ' = ' + String(alt).replace('-', '−') + (alt < 0 || alt >= 11 ? ' → ' + r + ' after reducing mod 11' : '') + '. So ' + x + ' mod 11 = ' + a; }
    return m * f + ' is the largest multiple of ' + m + ' that fits (' + m + ' × ' + f + '), ' + x + ' − ' + m * f + ' = ' + a
      + (m == 9 || m == 3 ? '. Digit sum: ' + String(x).split('').join(' + ') + ' = ' + ds + ' → ' + ds + ' mod ' + m + ' = ' + (ds % m) : '');
  }
  if (p.sk == 'dec') {
    const v = (q.match(/\d+(?:\.\d+)?/g) || []).map(Number), f = (x) => String(+x.toFixed(4));
    if (q.includes('+')) { const [x, y] = v, wx = Math.floor(x), wy = Math.floor(y); return wx + ' + ' + wy + ' = ' + (wx + wy) + ', and the decimal parts ' + f(x - wx) + ' + ' + f(y - wy) + ' = 1, so ' + a; }
    if (q.includes('÷')) {
      const [w, d0] = v, W = (x) => f(x), M = {
        0.1: '÷ 0.1 is × 10 (ten tenths make 1): ' + w + ' × 10', 0.2: '÷ 0.2 is × 5 (five fifths make 1): ' + w + ' × 5',
        0.25: '÷ 0.25 is × 4 (four quarters make 1): ' + w + ' × 4', 0.5: '÷ 0.5 is × 2 (two halves make 1): ' + w + ' × 2',
        0.75: '÷ 0.75 is × 4/3, so divide by 3 then multiply by 4: ' + W(w / 3) + ' × 4', 1.5: '÷ 1.5 is × 2/3, so divide by 3 then multiply by 2: ' + W(w / 3) + ' × 2',
        2.5: '÷ 2.5 is × 2/5, so divide by 5 then multiply by 2: ' + W(w / 5) + ' × 2',
      };
      return M[d0] ? M[d0] + ' = ' + a : '';
    }
    if (p.pt == 'decimal × whole') {
      const dc = v.find((z) => !Number.isInteger(z)), wh = v.find((z) => Number.isInteger(z)), H = Math.round(dc * 10);
      return 'Ignore the point: ' + H + ' × ' + wh + ' = ' + H * wh + '. One decimal place goes back in: ' + H * wh + ' ÷ 10 = ' + a;
    }
    const pw = v.find((z) => [10, 100, 1000].includes(z)), o = v.find((z) => z !== pw);
    if (pw && o !== undefined && !String(p.pt).startsWith('friendly')) { const pl = String(pw).length - 1; return '× ' + pw + ' moves the point ' + pl + (pl == 1 ? ' place' : ' places') + ' right: ' + o + ' → ' + a; }
    const fr = v.find((z) => [0.1, 0.2, 0.25, 0.5, 0.75, 1.5, 2.5].includes(z)), w = v.find((z) => z !== fr) ?? v[0];
    const k = { 0.1: 'a tenth: ' + w + ' ÷ 10', 0.2: 'a fifth: ' + w + ' ÷ 5', 0.25: 'a quarter: ' + w + ' ÷ 4', 0.5: 'half: ' + w + ' ÷ 2', 0.75: 'three quarters: (' + w + ' ÷ 4) × 3', 1.5: 'once plus half: ' + w + ' + ' + w / 2, 2.5: 'twice plus half: ' + 2 * w + ' + ' + w / 2 }[fr];
    return k ? fr + ' is ' + k + ' = ' + a : '';
  }
  if (p.sk == 'pct') {
    const P = n[0], N = n[1], f = (x) => String(+x.toFixed(2)), ten = N / 10, one = N / 100;
    if (P == 50) return 'Half of ' + N + ' = ' + a;
    if (P == 25) return 'A quarter is half of half: ' + N + ' → ' + f(N / 2) + ' → ' + a;
    if (P == 75) return '75% is three quarters. A quarter of ' + N + ' = ' + f(N / 4) + ', × 3 = ' + a;
    if (P % 10 == 0) return '10% of ' + N + ' = ' + f(ten) + ', × ' + P / 10 + ' = ' + a;
    const t = Math.floor(P / 10), r = P % 10, hi = ten * t, lo = r == 5 ? ten / 2 : one * r;
    return '10% of ' + N + ' = ' + f(ten) + (r && r != 5 ? ', 1% = ' + f(one) : '') + '. '
      + (t > 1 ? '10% × ' + t + ' = ' + f(hi) + '. ' : '')
      + (r == 5 ? '5% is half of that = ' + f(lo) + '. ' : r ? '1% × ' + r + ' = ' + f(lo) + '. ' : '')
      + (t && r ? f(hi) + ' + ' + f(lo) + ' = ' + a : '');
  }
  if ((m = q.match(/^\((\d+) ([+−]) (\d+)\) × (\d+)$/))) { const i = m[2] == '+' ? +m[1] + +m[3] : m[1] - m[3]; return '(' + m[1] + ' ' + m[2] + ' ' + m[3] + ') = ' + i + ', then × ' + m[4] + ' = ' + a; }
  if ((m = q.match(/^(\d+) \+ (\d+) × (\d+)$/))) return m[2] + ' × ' + m[3] + ' = ' + m[2] * m[3] + ' first, then + ' + m[1] + ' = ' + a;
  if ((m = q.match(/^(\d+) × (\d+) − (\d+)$/))) return m[1] + ' × ' + m[2] + ' = ' + m[1] * m[2] + ', then − ' + m[3] + ' = ' + a;
  return '';
}

/**
 * Is what was typed the answer? Exact text always counts. A decimal answer also accepts the same value written another way
 * (.5 for 0.5), and a fraction answer accepts an equal fraction of the same length (6/8 for 3/4).
 */
export function ansMatch(buf, ans) {
  buf = String(buf ?? ''); ans = String(ans ?? '');
  if (buf === ans) return true;
  if (!buf || /[./-]$/.test(buf)) return false;
  if (ans.includes('.') && /^-?\d*\.?\d+$/.test(buf)) return +buf === +ans;
  if (ans.includes('/') && buf.length == ans.length) {
    const f = (t) => /^(-?\d+)\/(\d+)$/.exec(t), x = f(buf), y = f(ans);
    return !!(x && y && +x[2] && +y[2] && +x[1] * +y[2] === +y[1] * +x[2]);
  }
  return false;
}

/**
 * What kind of slip was a wrong entry? '' when it is right.
 * swap = same digits, wrong order (12 vs 21) · sign = right size, wrong sign (−5 vs 5) · off1 = one away · place = a power of ten away (a carry or place-value slip)
 * digit = exactly one digit differs · other = anything else.
 */
export function errKind(a, typed) {
  a = String(a); typed = String(typed);
  if (a === typed) return '';
  const d = Math.abs(+typed - +a), same = a.length == typed.length;
  if (+a !== 0 && +typed === -+a) return 'sign';                 // right size, wrong sign (−5 typed as 5): a sign slip, not a place-value slip
  if (same && [...a].sort().join('') == [...typed].sort().join('')) return 'swap';
  if (d == 1) return 'off1';
  if (d >= 10 && /^10*$/.test(String(d))) return 'place';
  if (same && [...a].filter((c, i) => c != typed[i]).length == 1) return 'digit';
  return 'other';
}

/** "7 × 8" or "56 ÷ 7" -> "7×8" (smaller factor first) when both factors are in the 2..12 times table, else ''. Drives the times-table map. */
export const factOf = (q) => {
  let m = /^(\d+) × (\d+)$/.exec(q), a, b;
  if (m) { a = +m[1]; b = +m[2]; }
  else if ((m = /^(\d+) ÷ (\d+)$/.exec(q))) { b = +m[2]; a = +m[1] / b; }
  else return '';
  return Number.isInteger(a) && a >= 2 && a <= 12 && b >= 2 && b <= 12 ? Math.min(a, b) + '×' + Math.max(a, b) : '';
};

/** Order-insensitive key so "3 + 5" and "5 + 3" count as the same question. */
export const qk = (q) => {
  const s = String(q ?? '');
  const m = s.match(/^(\d+) ([+×]) (\d+)$/);
  return m ? [+m[1], +m[3]].sort((a, b) => a - b).join(m[2]) : s;
};

/* ---------------- scoring ---------------- */
/**
 * 0..1 performance score for an answer. r = time ÷ par (see T). Par pace scores exactly .72, the rating-neutral point:
 * ≤ 0.6 of par scores 1, then it falls smoothly (no jumps) to .72 at par, .45 at 2× par and a floor of .3 at 2.5× par or slower.
 * A correct answer never scores below the floor (and nextRating caps one answer's loss), so slowness nudges a rating down but never wipes it out.
 * Each slip (a wrong entry you then corrected) costs 30%, down to 40%: a fixed mistake is still a mistake.
 */
export const perfScore = (ok, r, tries = 0) => {
  if (!ok) return 0;
  const base = r <= 0.6 ? 1 : r <= 1 ? 1 - 0.7 * (r - 0.6) : Math.max(0.3, 0.72 - 0.27 * (r - 1));
  return base * Math.max(0.4, 1 - 0.3 * tries);
};

/**
 * New rating after an answer. `s` is the skill record {lv,n}; par pace (.72) holds steady.
 * Learning rate starts high so a new or mis-set rating finds your level within a few sessions, then settles as evidence builds.
 * One answer can lose at most .25 (a skip or a wrong answer is not a verdict on your level). A bonus question multiplies gains only.
 */
export const nextRating = (s, sc, bonus) => {
  const lr = s.n < 30 ? 0.8 : s.n < 100 ? 0.55 : 0.4;
  const delta = Math.max(-0.25, lr * (sc - 0.72));
  return clamp(s.lv + delta * (bonus && delta > 0 ? 1.3 : 1), 1, MAXLV);
};

/** Skill strength: higher = weaker (drives extra practice). */
export const weakness = (s) => (1 - s.acc) * 3 + Math.max(0, s.spd - 1);

/**
 * Spaced-repetition intervals (ms) by Leitner box. A fast, first-try correct answer moves a
 * question one box forward, so it is next due after:
 *   box 1: 10 minutes   box 2: 1 day   box 3: 3 days   box 4: 7 days
 * One more successful retrieval after box 4 confirms retention and removes it from active review.
 */
export const MASTER_BOX = 5;
export const INTERVALS = [0, 6e5, 864e5, 2592e5, 6048e5];
/** Short labels for the five mastery steps, indexed by completed successful retrievals (box). */
export const MASTERY_STEPS = ['New', '10 minutes', '1 day', '3 days', '7 days', 'Mastered'];

/**
 * Rough "Zetamac" score estimate: 120 s ÷ average seconds per question × accuracy.
 * Your pace at Zetamac-level difficulty d0 is par there, scaled by (a) your measured speed against par and
 * (b) how far your rating sits above (faster) or below (slower) d0: about 22% per rating level.
 * Without (b) the estimate was the same at rating 200 and rating 1000, because speed is measured against par at your own level.
 */
const ZDIG = { add: 3, sub: 2, mul: 3, div: 2 };    // typical answer length in the default Zetamac ranges
export function zetaEstimate(sk, ids, d0) {
  const t = ids.map((k) => T(k, d0[k], 10 ** ((ZDIG[k] || 2) - 1)) * clamp(sk[k].spd, 0.5, 2) * clamp(Math.exp(0.2 * (d0[k] - sk[k].lv)), 0.35, 2.5));
  const acc = ids.reduce((a, k) => a + sk[k].acc, 0) / ids.length;
  return Math.round((120 / (t.reduce((a, b) => a + b) / t.length)) * acc);
}

/* ---------------- custom ranges (Zetamac-style) and times tables ---------------- */
export const ZDEF = { ops: ['add', 'sub', 'mul', 'div'], a: [2, 100], b: [2, 100], m: [2, 12], n: [2, 100] };
/** Make any saved/edited range config safe: ints, min<=max, at least one operation. */
export function zNorm(z) {
  const r = (v, d) => { let [x, y] = Array.isArray(v) ? v : d; x = Math.max(0, Math.min(9999, Math.round(+x) || 0)); y = Math.max(0, Math.min(9999, Math.round(+y) || 0)); return x <= y ? [x, y] : [y, x]; };
  const ops = (z && Array.isArray(z.ops) ? z.ops : ZDEF.ops).filter((o) => ['add', 'sub', 'mul', 'div'].includes(o));
  return { ops: ops.length ? ops : ['add'], a: r(z && z.a, ZDEF.a), b: r(z && z.b, ZDEF.b), m: r(z && z.m, ZDEF.m), n: r(z && z.n, ZDEF.n) };
}
export const zKey = (z) => { z = zNorm(z); return z.ops.join('') + z.a + '_' + z.b + '_' + z.m + '_' + z.n; };
export const zLabel = (z) => {
  z = zNorm(z);
  if (z.m[0] == z.m[1] && z.ops.every((o) => o == 'mul' || o == 'div')) return z.m[0] + '× table';
  return z.ops.map((o) => ({ add: '+', sub: '−', mul: '×', div: '÷' })[o]).join(' ');
};
/** One question from a custom range config. Subtraction and division are the reverse of addition / multiplication, so answers stay whole. */
export function genZeta(z, R = Math.random) {
  z = zNorm(z);
  const k = z.ops[Math.floor(R() * z.ops.length)];
  let q, a;
  if (k == 'add' || k == 'sub') { const x = ri(z.a[0], z.a[1], R), y = ri(z.b[0], z.b[1], R); if (k == 'add') { q = x + ' + ' + y; a = x + y; } else { q = x + y + ' − ' + x; a = y; } }
  else { const x = ri(z.m[0], z.m[1], R), y = ri(z.n[0], z.n[1], R); if (k == 'mul') { q = x + ' × ' + y; a = x * y; } else { q = x * y + ' ÷ ' + (x || 1); a = x ? y : x * y; } }
  return { q, a, sk: k, d: 5, pt: 'range', tip: '' };
}
