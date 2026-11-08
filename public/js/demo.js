// A realistic sample learner for visitors: five weeks of practice, a live streak, a notebook, a path in progress.
// Built from the same shapes the app writes itself, with a fixed seed so every visitor sees the same story. Never saved, never synced.
// Nothing here is drawn as a smooth curve. Every question is simulated one at a time, so the totals come out lumpy the way a real person's do:
// good days and flat days, a missed week with some rust after it, a plateau or two, short sessions when life interrupts, uneven habits.
import { IDS, SK, gen } from './engine.js';
import { TRICKS } from './tricks.js';
import { ymd } from './util.js';

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** Where each skill is heading (rating / 100). Stronger at the basics, weaker on remainders and fractions, so there is a story to coach. */
const GOAL = { add: 8.1, sub: 7.3, mul: 6.2, div: 5.5, sq: 6.9, pw: 4.7, pct: 5.9, ops: 5.1, mod: 3.4, dec: 5.3, neg: 4.9, frac: 3.8, life: 5.6 };
/** Skills that stall for a stretch (share of the five weeks) before moving again. Real progress has flat spots. */
const STALL = { mul: [0.4, 0.62], pct: [0.55, 0.78], dec: [0.25, 0.45], sq: [0.7, 0.9] };
/** How noisy each skill's rating is. Weak, fiddly skills jump around more. */
const WOBBLE = { mod: 0.2, frac: 0.17, neg: 0.15, pw: 0.14, ops: 0.12, dec: 0.12 };
const DAYS = 35, STREAK = 12, GAP = [25, 26, 27, 28];   // a missed stretch (a trip, a cold) about four weeks back, then a patchy return
const stall = (f, a, b) => f < a ? f : f < b ? a + (f - a) * 0.1 : a + (b - a) * 0.1 + (f - b) * (1 - a - (b - a) * 0.1) / (1 - b);

export function buildDemo(b, now = Date.now()) {
  const R = rng(20260611), r = (a, z) => a + (z - a) * R(), pick = (a) => a[Math.floor(R() * a.length)], chance = (p) => R() < p;
  const gauss = () => (R() + R() + R() + R() - 2) / 0.577;
  const wpick = (items, w) => { let x = R() * w.reduce((s, v) => s + v, 0); for (let i = 0; i < items.length; i++) { x -= w[i]; if (x <= 0) return items[i]; } return items[items.length - 1]; };
  const DAY = 864e5, startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const at = (day0, h, m = 0) => day0 + (h * 60 + m) * 6e4;
  const sessions = [], daily = {}, perSkill = Object.fromEntries(IDS.map((k) => [k, { n: 0, ok: 0, tm: 0 }]));
  let bestTrain = { pts: 0, n: 0 }, bestSurv = 0, bestSprint = 99, survOk = 0, dailyDays = 0;

  // Ratings are a running state, not a formula: each session nudges them toward where they are heading, plus noise.
  const lv = Object.fromEntries(IDS.map((k) => [k, SK[k].s + r(-0.2, 0.3)]));
  const peak = { ...lv };
  const lvr = () => Object.fromEntries(IDS.map((k) => [k, +Math.min(12, Math.max(1, lv[k])).toFixed(2)]));
  let form = 0, lastActive = null, dailyToday = false;

  for (let d = DAYS; d >= 0; d--) {
    const day0 = startOfToday - d * DAY, dow = new Date(day0).getDay(), wkend = dow == 0 || dow == 6;
    const prevMissed = lastActive != null && lastActive - d > 1;
    // One unbroken streak up to today. Before that, patchier: weekends lighter, a missed stretch, and misses tend to cluster.
    let active;
    if (d == STREAK) active = false;
    else if (d < STREAK) active = true;
    else if (GAP.includes(d)) active = false;
    else active = chance((wkend ? 0.5 : 0.76) - (prevMissed ? 0 : 0) - (lastActive != null && lastActive - d == 1 && false ? 0 : 0));
    if (!active) continue;
    const gapDays = lastActive == null ? 0 : lastActive - d;   // days since the last session (lastActive is counted in days-ago, so it runs downwards)
    const f = (DAYS - d) / DAYS;
    // Today's form: carries over a little from yesterday, plus the odd rough or great day.
    form = 0.5 * form + 0.035 * gauss();
    let dayFx = form;
    const rough = d != 0 && chance(0.11), great = !rough && chance(0.08);
    if (rough) dayFx -= r(0.07, 0.13); if (great) dayFx += r(0.03, 0.06);
    if (gapDays >= 3) { dayFx -= 0.04; IDS.forEach((k) => { lv[k] -= r(0.05, 0.12) * Math.min(gapDays, 6) * (0.6 + R() * 0.8); }); }   // rust after time away
    if (rough) IDS.forEach((k) => { if (chance(0.35)) lv[k] -= r(0.05, 0.25); });
    const slow = 1 + (rough ? r(0.08, 0.2) : 0) - (great ? 0.05 : 0) - form * 0.8 + (gapDays >= 3 ? 0.06 : 0);

    // How many runs, and when. Weekday mornings, a lunch or evening top-up; weekends later and looser.
    const nRuns = d == 0 ? 1 : wkend ? wpick([1, 2, 3], [50, 40, 10]) : wpick([1, 2, 3], [56, 35, 9]);
    const slots = [];
    if (wkend) slots.push(at(day0, 9, 20 + Math.floor(r(0, 150)))); else slots.push(at(day0, 6, 40 + Math.floor(r(0, 160))));
    if (nRuns > 1) slots.push(chance(0.5) ? at(day0, 12, Math.floor(r(0, 100))) : at(day0, 19, 20 + Math.floor(r(0, 175))));
    if (nRuns > 2) slots.push(at(day0, 21, Math.floor(r(0, 90))));
    slots.sort((a, z) => a - z);
    dailyToday = false;

    slots.forEach((slot, i) => {
      const t = d == 0 ? Math.min(now - 6 * 6e4 - Math.floor(r(0, 5)) * 6e4, slot) : slot;
      // Pick the mode. Today stays a normal training run so the day plan reads "under way".
      let m = 'train';
      if (d != 0) {
        if (d < 17 && !dailyToday && chance(i == 0 ? 0.5 : 0.18)) m = 'daily';
        else if (i >= 1 && chance(0.22)) m = 'sprint';
        else if (i >= 1 && chance(0.2)) m = 'survival';
        else if (i == 0 && d < STREAK && chance(0.1)) m = 'daily';
      }
      if (m == 'daily') dailyToday = true;
      // The best learning happens in the middle; each skill has its own stall and wobble.
      IDS.forEach((k) => {
        const [a, z] = STALL[k] || [2, 3];
        const tgt = SK[k].s + ((GOAL[k] || SK[k].s + 1) - SK[k].s) * (1 - Math.pow(1 - stall(Math.min(1, f + i * 0.004), a, z), 1.6));
        lv[k] += (tgt - lv[k]) * 0.1 + gauss() * (WOBBLE[k] || 0.08) * 0.5;
        lv[k] = Math.min(12, Math.max(1, lv[k]));
        peak[k] = Math.max(peak[k], lv[k]);
      });
      const avg = IDS.reduce((s, k) => s + lv[k], 0) / IDS.length;
      const fatigue = i * 0.015 + (t % DAY > 21 * 36e5 ? 0.02 : 0);
      const sessFx = dayFx - fatigue + r(-0.03, 0.03);
      const tq = (k) => Math.max(1.3, 1.3 + 0.3 * (10 - lv[k]));
      const pa = (k) => Math.min(0.985, Math.max(0.4, 0.58 + 0.05 * lv[k] + sessFx));
      const pool = m == 'daily' ? ['add', 'sub', 'mul', 'pct', 'sq'] : IDS;
      const w = pool.map((k) => 1 + Math.max(0, 6 - lv[k]) * 0.12);   // the app leans toward what is weaker
      let budget = m == 'daily' ? 60 : m == 'sprint' ? 1e9 : m == 'survival' ? 150 : d == 0 ? 120 : wpick([60, 120, 300, 30, 600], [18, 55, 19, 5, 3]);
      let target = m == 'sprint' ? 20 : m == 'survival' ? 1e9 : 1e9, lives = m == 'survival' ? 3 : 1e9;
      const cut = m == 'train' && d != 0 && chance(0.07);   // phone buzzed, or life: stopped early
      const cutAt = cut ? budget * r(0.3, 0.7) : budget;
      const by = {};
      let el = 0, n = 0, ok = 0, ft = 0, tsum = 0, miss = 0;
      while (el < cutAt && n < target && miss < lives) {
        const k = wpick(pool, w), good = chance(pa(k));
        let qt = tq(k) * slow * (0.55 + 0.9 * R() + (R() < 0.06 ? 1.2 : 0));   // now and then a question just stumps you
        if (!good) qt *= r(1.1, 1.8);
        qt = +qt.toFixed(1);
        el += qt + 0.35; n++;
        const e = by[k] || (by[k] = [0, 0, 0]); e[0]++;
        if (good) { ok++; e[1]++; e[2] = +(e[2] + qt).toFixed(1); tsum += qt; if (qt < tq(k) * 1.35) ft++; } else miss++;
        perSkill[k].n++; if (good) perSkill[k].ok++; perSkill[k].tm += good ? qt : 0;
      }
      if (n == 0) return;
      const dur = m == 'daily' ? 60 : m == 'sprint' ? Math.max(1, Math.round(el)) : m == 'survival' ? Math.max(1, Math.round(el)) : cut ? Math.max(5, Math.round(el)) : budget;
      const spdF = Math.max(0.8, Math.min(1.3, slow));
      const pts = Math.max(0, Math.round(ok * (8 + avg * 1.1) * (1.12 - (spdF - 0.95) * 0.4) * (0.96 + R() * 0.08)));
      const rec = { t: Math.round(t), m, dur, n, ok, ft, pts, tm: ok ? +(tsum / ok).toFixed(2) : 0, by, lv: lvr(), off: 0 };
      if (m == 'sprint') { rec.sc = +el.toFixed(1); bestSprint = Math.min(bestSprint, rec.sc); }
      if (m == 'daily') { daily[ymd(t)] = Math.max(daily[ymd(t)] || 0, pts); dailyDays++; }
      if (m == 'survival') { bestSurv = Math.max(bestSurv, pts); survOk = Math.max(survOk, ok); }
      if (m == 'train' && dur == 120 && !cut && pts > bestTrain.pts) bestTrain = { pts, n: ok, g: 'A' };
      sessions.push(rec);
    });
    lastActive = d;
  }
  sessions.sort((a, z) => a.t - z.t);
  const last = sessions[sessions.length - 1] || { lv: {} };
  const sk = {};
  IDS.forEach((k) => { const p = perSkill[k], l = last.lv[k] || SK[k].s; sk[k] = { lv: l, pk: +Math.max(l, peak[k]).toFixed(2), acc: +(p.n ? p.ok / p.n : 0.85).toFixed(3), spd: +Math.min(1.5, Math.max(0.6, 0.72 + (10 - l) * 0.07 + gauss() * 0.04)).toFixed(2), n: p.n + Math.round(r(40, 130)) }; });

  // Error types: split what was actually missed, unevenly. Mostly slips in a digit, some place-value, a few sign and skipped ones.
  const wrong = IDS.reduce((s, k) => s + perSkill[k].n - perSkill[k].ok, 0);
  const shape = { digit: 0.3, place: 0.19, swap: 0.1, sign: 0.07, other: 0.25, skip: 0.09 };
  const errs = {}; Object.keys(shape).forEach((e) => { errs[e] = Math.max(1, Math.round(wrong * shape[e] * r(0.65, 1.4) * 0.8)); });

  // Pattern counters, by skill strength. Some barely touched, some drilled a lot.
  const pat = {}, facts = {};
  TRICKS.forEach((t) => {
    if (!t.pt) return;
    const g = GOAL[t.sk] || 5, tier = g > 6 ? r(2, 4.2) : g > 4.5 ? r(1.2, 2.8) : r(0.5, 1.8);
    let n = Math.max(1, Math.round(r(2, 14) * tier)); if (chance(0.2)) n = Math.max(1, Math.round(n * 0.3));
    const a = Math.min(0.98, Math.max(0.35, 0.5 + g * 0.05 + r(-0.12, 0.1))), ok = Math.min(n, Math.round(n * a));
    pat[SK[t.sk].n + ' · ' + t.pt] = { n, ok, r: +(ok * Math.max(0.5, 1.3 - g * 0.06 + r(-0.25, 0.3))).toFixed(2) };
  });
  // Times table: the usual suspects are the ones that trip people up, everything else mostly fine with the odd slip.
  const trouble = new Set(['6×7', '6×8', '7×8', '7×9', '8×9', '6×9', '7×12', '8×12', '4×7']);
  for (let a = 2; a <= 12; a++) for (let c = a; c <= 12; c++) {
    const key = a + '×' + c, hard = trouble.has(key) || (a >= 6 && c >= 7 && chance(0.35)) || ((a == 9 || c == 9) && chance(0.4));
    const n = Math.max(1, Math.round(r(2, 10) + (hard ? r(2, 7) : 0) - (a <= 3 ? r(0, 2) : 0)));
    const ok = Math.min(n, Math.round(n * (hard ? r(0.45, 0.88) : chance(0.2) ? r(0.75, 0.9) : r(0.9, 1))));
    const per = Math.min(2.3, Math.max(0.45, 0.5 + (a * c) / 120 + (hard ? 0.2 : 0) + r(-0.15, 0.15)));
    facts[key] = { n, ok, r: +(ok * per).toFixed(2) };
  }

  // Notebook: questions the engine itself would write, from what the learner actually misses. Some due now, some later, at uneven times.
  const weak = {};
  const order = IDS.map((k) => [k, sk[k].lv + gauss() * 0.8]).sort((x, y) => x[1] - y[1]).map((x) => x[0]).slice(0, 11);
  order.forEach((k, i) => {
    if (Object.keys(weak).length >= 9) return;
    const d = Math.max(3, Math.round(sk[k].lv + (chance(0.4) ? 1 : 0)));
    const p = gen(k, d, R); if (!p || p.q == null || weak[p.q]) return;
    const due = chance(0.45) ? now - Math.round(r(0.5, 40) * 36e5) : now + Math.round(r(0.4, 6) * DAY);
    weak[p.q] = { q: p.q, a: p.a, sk: k, d, pt: p.pt || '', tip: p.tip || '', box: wpick([0, 1, 2], [50, 33, 17]), due, at: now - Math.round(r(0.3, 9) * DAY) };
  });

  // Learning paths: stages passed on uneven days with uneven scores, one stage in progress.
  const sc = () => +r(0.78, 0.97).toFixed(2);
  const stage = (ph, pass, s) => ({ ph, pass: pass ? now - pass * DAY : 0, sc: pass ? s : 0, at: pass ? now - pass * DAY : 0 });
  const ret = (ok, days = 2) => ({ t: ok ? now - days * DAY : 0, ok: ok ? now - days * DAY : 0 });
  const passDays = (start, n) => { const out = []; let x = start; for (let i = 0; i < n; i++) { out.push(Math.max(0, x)); x -= Math.round(r(1, 4)); } return out; };
  const pAdd = passDays(24, 5), pSub = passDays(17, 3), pMul = passDays(12, 2);
  const paths = {
    add: { st: pAdd.map((x) => stage(4, x, sc())), ret: [ret(1, 5), ret(0)] },
    sub: { st: [...pSub.map((x) => stage(4, x, sc())), stage(2, 0, 0), stage(0, 0, 0)], ret: [ret(1, 3), ret(0)] },
    mul: { st: [...pMul.map((x) => stage(4, x, sc())), stage(3, 0, 0), stage(0, 0, 0), stage(0, 0, 0)], ret: [ret(0), ret(0)] },
  };
  const c = (o) => ({ ...b, ...o });
  return c({
    onb: 1, goal: 2, lastExport: now, skOpen: true, sk, sessions, daily, pat, facts, errs, weak, paths,
    best: { train: bestTrain.pts ? bestTrain : { pts: 410, n: 38, g: 'A' }, survival: { pts: bestSurv || 142, n: survOk || 31 }, sprint: { t: bestSprint < 99 ? bestSprint : 47.6 } },
    ms: ['s3', 's7', 'a1', 'a2', 'l6', 'l8', 'd1', 'd7', 'sv20'].filter((id) => id != 'd7' || dailyDays >= 7),
    ctr: { v: 1, base: { pat, facts, errs }, dev: {} },
  });
}
