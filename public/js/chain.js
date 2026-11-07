// Flash mode's pure parts (no DOM), so they can be tested.
/** A chain: the first number is added; later ones are added or (when allowed) subtracted, never taking the total below zero, and never the same twice in a row. */
export function makeChain(cfg, rnd = Math.random) {
  const lo = cfg.d == 1 ? 1 : 10 ** (cfg.d - 1), hi = 10 ** cfg.d - 1, pick = () => lo + Math.floor(rnd() * (hi - lo + 1));
  const items = []; let total = 0;
  for (let i = 0; i < cfg.c; i++) {
    let x = pick(), tries = 0;
    while (i && x == items[i - 1].x && tries++ < 20) x = pick();
    const sub = !!(cfg.neg && i > 0 && rnd() < 0.35 && total - x >= 0);
    items.push({ x, sub }); total += sub ? -x : x;
  }
  return { items, total };
}
/** Points for a correct round: more numbers, more digits and a faster flash all pay more. */
export const roundPts = (cfg) => Math.round(cfg.c * cfg.d * (1000 / cfg.s) * 10);
export const expr = (ch) => ch.items.map((q, i) => (i ? (q.sub ? ' − ' : ' + ') : '') + q.x).join('') + ' = ' + ch.total;

/** The key a Flash setting is filed under, so every combination keeps its own best. */
export const bestKey = (c) => [c.c, c.s, c.d, c.neg ? 1 : 0].join('-');
/** Digits only, at most six, so typed or pasted junk can never become an answer ("12abc" is 12, never accepted as is). */
export const digitsOnly = (s) => String(s ?? '').replace(/\D/g, '').slice(0, 6);
