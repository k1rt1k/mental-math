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
};
export const IDS = Object.keys(SK);
export const COL = { add: '#6ea8ff', sub: '#8e9bff', mul: '#ff9f5a', div: '#ffcf5c', sq: '#4cd98a', pw: '#4fd1c5', pct: '#ff6b9a', ops: '#b48cff', mod: '#f08a7a', dec: '#a6d65c' };
export const SH = { add: 'Add', sub: 'Sub', mul: 'Mul', div: 'Div', sq: 'Sq', pw: 'Pow', pct: '%', ops: 'Multi', mod: 'Mod', dec: 'Dec' };
export const MAXLV = 12;

/**
 * Par time (seconds) for a skill at difficulty d: what a typical trainee at that level needs, 100% right.
 * = fixed overhead (read the question, start typing) + typing time per answer digit + thinking time that grows with d.
 * Answering at par holds your rating; faster raises it, slower lowers it. `a` (the answer) sets the typing share;
 * without it a 2-digit answer is assumed. The old target had no overhead at all (about 1.1 s for a level-1 multiplication),
 * so a perfectly accurate player at a normal pace was marked "too slow" on every answer and rated down.
 */
export const PAR = { base: 1.3, digit: 0.3, think: 1.25, lin: 0.3, quad: 0.025 };
export const digitsOf = (a) => String(Math.abs(Math.round(+a || 0))).length;
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

/* ---------------- generators ---------------- */
const carries = (x, y) => { let c = 0, r = 0; while (x > 0 || y > 0) { const t = (x % 10) + (y % 10) + r; r = t >= 10 ? 1 : 0; c += r; x = Math.floor(x / 10); y = Math.floor(y / 10); } return c; };
const borrows = (x, y) => { let c = 0, r = 0; while (x > 0 || y > 0) { r = (x % 10) - r < (y % 10) ? 1 : 0; c += r; x = Math.floor(x / 10); y = Math.floor(y / 10); } return c; };
const lab = (n, w) => (n == 0 ? 'no ' + w : n == 1 ? '1 ' + w : '2+ ' + w + 's').replace('carrys', 'carries');

export function gen(k, d, R = Math.random) {
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
 * What kind of slip was a wrong entry? '' when it is right.
 * swap = same digits, wrong order (12 vs 21) · off1 = one away · place = a power of ten away (a carry or place-value slip)
 * digit = exactly one digit differs · other = anything else.
 */
export function errKind(a, typed) {
  a = String(a); typed = String(typed);
  if (a === typed) return '';
  const d = Math.abs(+typed - +a), same = a.length == typed.length;
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
