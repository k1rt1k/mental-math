// App state: one stable object `S`, persisted to localStorage, with migration and a sync-safe merge.
import { IDS, SK, MASTER_BOX, qk } from './engine.js';
import { clamp } from './util.js';

export const KEY = 'mmTrainer.v1'; // one local learner per device; legacy profile data is migrated once below.
export const LEGACY_ACTIVE_USER = (() => {
  try { return localStorage['mmTrainer.activeUser'] === '2' ? '2' : '1'; }
  catch { return '1'; }
})();

/**
 * The old v14 UI stored User 1 and User 2 in separate local slots. This app is now
 * one learner per device: preserve the selected learner's state in the canonical
 * key and archive the other slot rather than merging two people's histories.
 */
export function migrateLegacySingleUser(storage = localStorage, selectedUser = LEGACY_ACTIVE_USER) {
  const marker = 'mmTrainer.v14.singleUserState.v1';
  if (storage[marker]) return false;
  if (selectedUser === '2') {
    const selected = storage['mmTrainer.v1.user_2'];
    const previous = storage[KEY];
    if (previous && !storage['mmTrainer.legacy.profile1.state']) {
      storage['mmTrainer.legacy.profile1.state'] = previous;
    }
    // If the selected legacy profile had no data, start it empty instead of
    // accidentally inheriting the other learner's sessions.
    storage[KEY] = selected || '{}';
  }
  storage[marker] = '1';
  try { delete storage['mmTrainer.activeUser']; } catch { /* legacy selector is no longer used */ }
  return true;
}

try { migrateLegacySingleUser(); } catch { /* blocked storage: continue with the canonical local state */ }
export function activeKey() { return KEY; }
/** Scoring calibration version. Data saved before 5.4 has no `cal`: its ratings were lowered by the old, too-tight target times. */
export const CAL = 2;

/**
 * Delayed-recall analytics. A question enters the ledger on its first clean answer (first try, no hint,
 * not a same-session retry). Its 7-day outcome is the first clean answer at least `RECALL_GAP` later.
 * The ledger is capped so a long history cannot bloat storage or a sync payload.
 */
export const RECALL_GAP = 7 * 864e5;
export const RECALL_MAX = 500;
/** Guided paths have five stages; keeping the count here lets migration reject stray keys. */
export const PATH_STAGES = 5;
const num = (x, d) => (Number.isFinite(+x) && x !== null && x !== '' ? +x : d);


/* ---------- learning counters: per-device contributions ----------
 * pat / facts / errs are lifetime counters that every device increments. Merging two copies with "larger wins" loses the
 * other device's work (laptop 5→8, phone 5→7 should be 10, not 8), and adding the copies double-counts the shared history.
 * So the source of truth is split by who observed what:
 *   ctr.base       the aggregate as it was when this model was introduced (shared, frozen history; merged once by "larger wins")
 *   ctr.dev[id]    what ONE device has observed since. Only that device ever writes its own slot, so a slot only grows
 *                  and two copies of it merge exactly with a per-field max (idempotent, order-independent, no double counting)
 * S.pat / S.facts / S.errs stay as the derived totals (base + every slot), so every screen reads them unchanged.
 */
const KINDS = ['pat', 'facts', 'errs'];
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
function emptyCtr() { return { v: 1, base: { pat: {}, facts: {}, errs: {} }, dev: {} }; }
const FACT_CAP = 80;   // 11x11 table = 66 facts at most

/** One device id per browser profile. Kept OUTSIDE the state so exporting/importing a backup never makes two devices share a slot. */
const DEV_KEY = 'mmTrainer.device.v1';
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
let devId = (() => {
  try { let d = localStorage[DEV_KEY]; if (!d || typeof d != 'string') { d = 'd' + rid(); localStorage[DEV_KEY] = d; } return d; }
  catch { return 'd' + rid(); }   // blocked storage: a throwaway id for this page load
})();
export const deviceId = () => devId;
/** Tests only: act as another device. */
export const setDeviceId = (id) => { devId = String(id); };

const cell = (o) => {
  if (!isObj(o) || !Number.isFinite(+o.n) || o.n === null || o.n === '') return null;
  const n = Math.max(0, +o.n);
  return { n, ok: clamp(fin(o.ok), 0, n), r: Math.max(0, fin(o.r)) };
};
/** Sanitise one {pat, facts, errs} group into fresh objects (never aliases its input). */
function cleanGroup(g) {
  const out = { pat: {}, facts: {}, errs: {} };
  if (!isObj(g)) return out;
  ['pat', 'facts'].forEach((k) => { if (isObj(g[k])) Object.entries(g[k]).forEach(([key, o]) => { const c = cell(o); if (c) out[k][key] = c; }); });
  if (isObj(g.errs)) Object.entries(g.errs).forEach(([key, n]) => { if (Number.isFinite(+n) && n !== null && n !== '' && +n >= 0) out.errs[key] = +n; });
  return out;
}
const validCtr = (c) => isObj(c) && c.v === 1 && isObj(c.base) && isObj(c.dev);
/** Counters of a loaded object. Data from before this model has only the flat totals: they become the shared base. */
function readCtr(s) {
  if (!validCtr(s.ctr)) return { v: 1, base: cleanGroup(s), dev: {} };
  const dev = {};
  Object.entries(s.ctr.dev).forEach(([id, g]) => { if (isObj(g)) dev[id] = cleanGroup(g); });
  return { v: 1, base: cleanGroup(s.ctr.base), dev };
}
/** Rebuild the derived totals from base + all device slots. */
export function rollup(st) {
  const c = st.ctr;
  KINDS.forEach((k) => {
    const out = {};
    [c.base, ...Object.values(c.dev)].forEach((g) => Object.entries(g[k]).forEach(([key, o]) => {
      if (k == 'errs') out[key] = (out[key] || 0) + o;
      else { const t = (out[key] = out[key] || { n: 0, ok: 0, r: 0 }); t.n += o.n; t.ok += o.ok; t.r += o.r; }
    }));
    st[k] = out;
  });
}
/**
 * Record an observation on THIS device: updates this device's slot (what syncs) and the live total (what screens read).
 * pat/facts: bump(kind, key, 1, ok ? 1 : 0, ok ? ratio : 0); errs: bump('errs', kind, 1).
 */
export function bump(kind, key, n = 1, ok = 0, r = 0) {
  if (!KINDS.includes(kind)) return;
  const c = (S.ctr = validCtr(S.ctr) ? S.ctr : readCtr(S));
  const slot = (c.dev[devId] = c.dev[devId] || { pat: {}, facts: {}, errs: {} });
  const tot = (S[kind] = isObj(S[kind]) ? S[kind] : {});
  if (kind == 'errs') { slot.errs[key] = (slot.errs[key] || 0) + n; tot[key] = (tot[key] || 0) + n; return; }
  if (kind == 'facts' && !(key in tot) && Object.keys(tot).length >= FACT_CAP) return;
  [slot[kind], tot].forEach((M) => { const o = (M[key] = M[key] || { n: 0, ok: 0, r: 0 }); o.n += n; o.ok += ok; o.r += r; });
}
/** Same value rules as a fresh start: the larger (n, ok, r) wins as a whole, so a cell is never stitched from two snapshots. */
const cellMax = (x, y) => (!y || (x && (x.n - y.n || x.ok - y.ok || x.r - y.r) >= 0) ? x : y);
const fieldMax = (x, y) => ({ n: Math.max(x.n, y.n), ok: Math.max(x.ok, y.ok), r: Math.max(x.r, y.r) });
/** Scoring was recalibrated: speed ratios measured against the old targets restart at neutral (r = ok), as finishCal does. */
const neutral = (g) => { ['pat', 'facts'].forEach((k) => Object.values(g[k]).forEach((o) => { o.r = o.ok; })); return g; };
function mergeCtr(a, b, calA, calB) {
  if (calA < calB) { neutral(a.base); Object.values(a.dev).forEach(neutral); }
  else if (calB < calA) { neutral(b.base); Object.values(b.dev).forEach(neutral); }
  const out = { v: 1, base: { pat: {}, facts: {}, errs: {} }, dev: {} };
  ['pat', 'facts'].forEach((k) => new Set([...Object.keys(a.base[k]), ...Object.keys(b.base[k])]).forEach((key) => (out.base[k][key] = cellMax(a.base[k][key], b.base[k][key]))));
  new Set([...Object.keys(a.base.errs), ...Object.keys(b.base.errs)]).forEach((key) => (out.base.errs[key] = Math.max(a.base.errs[key] || 0, b.base.errs[key] || 0)));
  new Set([...Object.keys(a.dev), ...Object.keys(b.dev)]).forEach((id) => {
    const x = a.dev[id], y = b.dev[id];
    if (!x || !y) { out.dev[id] = x || y; return; }
    const g = (out.dev[id] = { pat: {}, facts: {}, errs: {} });
    ['pat', 'facts'].forEach((k) => new Set([...Object.keys(x[k]), ...Object.keys(y[k])]).forEach((key) => (g[k][key] = x[k][key] && y[k][key] ? fieldMax(x[k][key], y[k][key]) : x[k][key] || y[k][key])));
    new Set([...Object.keys(x.errs), ...Object.keys(y.errs)]).forEach((key) => (g.errs[key] = Math.max(x.errs[key] || 0, y.errs[key] || 0)));
  });
  return out;
}

export const fresh = () => {
  const sk = {};
  IDS.forEach((k) => (sk[k] = { lv: SK[k].s, acc: 0.9, spd: 1, n: 0 }));
  return { v: 1, cal: CAL, sk, sessions: [], weak: {}, mastered: {}, recall: {}, paths: {}, best: {}, ms: [], lastExport: 0, pat: {}, facts: {}, errs: {}, rustFor: 0, hist: [], daily: {}, gone: {}, ctr: emptyCtr() };
};

/**
 * Settings that follow the learner to every browser and device. Each one carries its own change time in `S.pt`
 * (stamped in `save()` when its value actually changes), so the newest change to each setting wins independently:
 * theme set on the laptop and keypad set on the phone both survive. Goal, the saved session setup and the saved
 * setups sync the same way.
 */
export const PREF_KEYS = ['pad', 'theme', 'acc', 'font', 'zen', 'mute', 'noBlur', 'noCd', 'noHap', 'ts', 'hc', 'cb', 'bigA', 'pace', 'padFlip', 'rm'];
export const SYNCED_PREFS = [...PREF_KEYS, 'goal', 'cfg', 'presets'];
/** Genuinely tied to one browser: the push subscription behind reminders, which panels are open, and snoozed banners. */
export const DEVICE_LOCAL = ['rem', 'skOpen', 'bkSnooze', 'padHint'];
/** What Reset keeps: device-bound settings plus the synced appearance/input settings (and their change times). Progress, goal and setups go. */
export const devicePrefs = (st = S) => {
  const out = Object.fromEntries([...DEVICE_LOCAL, ...PREF_KEYS].filter((k) => st[k] !== undefined).map((k) => [k, st[k]]));
  if (isObj(st.pt)) { const pt = {}; PREF_KEYS.forEach((k) => { if (st.pt[k] > 0) pt[k] = st.pt[k]; }); if (Object.keys(pt).length) out.pt = pt; }
  return out;
};

const prefVal = (v) => (v === undefined ? '' : JSON.stringify(v));
let prefSnap = {};
/** Remember the current value of every synced setting, so `stampPrefs` can tell what changed since. */
function snapPrefs(st = S) { prefSnap = Object.fromEntries(SYNCED_PREFS.map((k) => [k, prefVal(st[k])])); }
/** Stamp every synced setting whose value changed since the last snapshot. Merges and loads re-snapshot without stamping. */
function stampPrefs() {
  const now = Date.now();
  S.pt = isObj(S.pt) ? S.pt : {};
  SYNCED_PREFS.forEach((k) => { const v = prefVal(S[k]); if (v !== prefSnap[k]) { S.pt[k] = now; prefSnap[k] = v; } });
}
/** Order-independent fingerprint of the synced settings and their change times; used to notice a settings-only change. */
export const prefsSig = (st = S) => JSON.stringify(SYNCED_PREFS.map((k) => [st[k] === undefined ? null : st[k], (st.pt && st.pt[k]) || 0]));

/** Make any loaded/imported/synced object safe to use. Never throws. Adds new skills with starting ratings. */
const ONLY = ['all', 'mix', 'zeta', ...IDS];
const fin = (x, d = 0) => (Number.isFinite(+x) && x !== null && x !== '' ? +x : d);
const PRESET_MAX = 6;
/**
 * Sanitise a saved session setup. Home, Settings and the presets all write the same shape, so one
 * cleaner keeps a corrupt import or an old build from leaving values the session maths cannot use.
 */
function cleanCfg(c) {
  if (!isObj(c)) return null;
  const out = { ...c };
  if (!ONLY.includes(out.only)) out.only = 'all';
  if (out.dur != null) out.dur = out.dur === 0 ? 0 : clamp(Math.round(fin(out.dur, 120)), 10, 3600);
  if (out.mix != null) {
    const mix = Array.isArray(out.mix) ? [...new Set(out.mix.filter((k) => IDS.includes(k)))] : [];
    if (mix.length) out.mix = mix; else delete out.mix;
  }
  if (out.only == 'mix' && !(out.mix || []).length) out.only = 'all';
  if (out.off != null) { const off = +out.off; out.off = [-1.5, 0, 1.5, 3].includes(off) ? off : 0; }
  delete out.patt;                         // pattern drills are per-run now; older versions saved one by accident and replayed it forever
  delete out.pats;                         // shortcut-stage patterns are per-run too; never replay a guided drill on Start
  return out;
}
export function migrate(o) {
  const b = fresh();
  const s = o && typeof o === 'object' ? o : {};
  const out = { ...b, ...s };
  out.sk = {};
  IDS.forEach((k) => {
    const r = (s.sk && s.sk[k]) || {};
    out.sk[k] = { ...r, lv: clamp(num(r.lv, SK[k].s), 1, 12), acc: clamp(num(r.acc, 0.9), 0, 1), spd: clamp(num(r.spd, 1), 0.2, 5), n: Math.max(0, num(r.n, 0)) };
  });
  // sessions: keep only well-formed rows, with every number finite so charts never show NaN
  out.sessions = (Array.isArray(s.sessions) ? s.sessions : [])
    .filter((x) => x && typeof x === 'object' && Number.isFinite(+x.t) && x.dur > 0 && x.n >= 0)
    .map((x) => {
      const n = Math.max(0, +x.n), ok = clamp(fin(x.ok), 0, n);
      const row = {
        ...x, t: +x.t, dur: +x.dur, n, ok,
        ft: clamp(Math.round(fin(x.ft, ok)), 0, ok),   // a first-try count can never exceed the correct answers
        pts: Math.max(0, fin(x.pts)), tm: Math.max(0, fin(x.tm)), m: typeof x.m == 'string' ? x.m : 'train',
      };
      // A saved per-skill breakdown is only read for known skills and three finite counts.
      if (isObj(x.by)) {
        const by = {};
        Object.entries(x.by).forEach(([k, b]) => {
          if (!SK[k] || !Array.isArray(b)) return;
          const bn = Math.max(0, Math.round(fin(b[0]))), bok = clamp(Math.round(fin(b[1])), 0, bn), btm = Math.max(0, fin(b[2]));
          if (bn) by[k] = [bn, bok, btm];
        });
        row.by = by;
      } else delete row.by;
      // Rating snapshots feed the per-skill charts; keep real skills and real 1..12 ratings only.
      if (isObj(x.lv)) {
        const lv = {};
        Object.entries(x.lv).forEach(([k, v]) => { if (SK[k] && v != null && v !== '' && Number.isFinite(+v)) lv[k] = clamp(+v, 1, 12); });
        row.lv = lv;
      } else delete row.lv;
      return row;
    });
  out.ctr = readCtr(s); rollup(out);   // pat / facts / errs are derived from the per-device counters
  ['weak', 'mastered', 'best', 'daily', 'gone'].forEach((k) => { if (!out[k] || typeof out[k] !== 'object' || Array.isArray(out[k])) out[k] = {}; });
  // notebook rows must name a real skill, or the Notebook screen would throw on them
  out.weak = {};
  Object.entries(s.weak && typeof s.weak == 'object' && !Array.isArray(s.weak) ? s.weak : {}).forEach(([k, w]) => {
    if (w && typeof w == 'object' && SK[w.sk] && w.q != null && w.a != null) out.weak[k] = { ...w, box: clamp(Math.round(fin(w.box)), 0, MASTER_BOX - 1), due: fin(w.due), at: fin(w.at) };
  });
  // Mastered questions are no longer active, but their history is kept so retention is visible.
  out.mastered = {};
  Object.entries(s.mastered && typeof s.mastered == 'object' && !Array.isArray(s.mastered) ? s.mastered : {}).forEach(([, w]) => {
    if (!w || typeof w != 'object' || !SK[w.sk] || w.q == null || w.a == null) return;
    const m = {
      ...w, box: MASTER_BOX,
      masteredAt: Math.max(0, fin(w.masteredAt, fin(w.at))),
      firstMasteredAt: Math.max(0, fin(w.firstMasteredAt, fin(w.masteredAt, fin(w.at)))),
      at: Math.max(0, fin(w.at, fin(w.masteredAt))),
      lapses: Math.max(0, Math.round(fin(w.lapses))),
      lastLapse: Math.max(0, fin(w.lastLapse)),
      retrievals: Math.max(MASTER_BOX, Math.round(fin(w.retrievals, MASTER_BOX))),
    };
    const key = qk(m.q), prev = out.mastered[key];
    out.mastered[key] = prev ? mergeMasteredEntry(prev, m) : m;
  });
  // Delayed-recall ledger: one row per question, holding the first clean answer and the first clean
  // answer at least seven days later. Rows are immutable observations, so a merge is a union.
  out.recall = {};
  Object.entries(s.recall && typeof s.recall == 'object' && !Array.isArray(s.recall) ? s.recall : {}).forEach(([k, r]) => {
    if (!r || typeof r != 'object') return;
    const q = typeof r.q == 'string' && r.q ? r.q : (typeof k == 'string' ? k : '');
    const t0 = Math.max(0, fin(r.t0));
    if (!q || !t0) return;
    let t1 = Math.max(0, fin(r.t1));
    if (t1 && t1 - t0 < RECALL_GAP) t1 = 0;   // a delayed row must really be at least seven days later
    const row = { q, t0, ok0: +r.ok0 ? 1 : 0, t1, ok1: t1 && +r.ok1 ? 1 : 0, sk: SK[r.sk] ? r.sk : '' };
    const key = qk(q), prev = out.recall[key];
    out.recall[key] = prev ? mergeRecallEntry(prev, row) : row;
  });
  // Guided-path progress: one row per skill and stage, keeping the best run and the demo/pass stamps.
  out.paths = {};
  Object.entries(s.paths && typeof s.paths == 'object' && !Array.isArray(s.paths) ? s.paths : {}).forEach(([sk, rows]) => {
    if (!SK[sk] || !rows || typeof rows != 'object' || Array.isArray(rows)) return;
    out.paths[sk] = {};
    Object.entries(rows).forEach(([id, r]) => {
      const idn = Math.round(fin(id));
      if (!(idn >= 1 && idn <= PATH_STAGES) || !r || typeof r != 'object') return;
      const n = Math.max(0, Math.round(fin(r.n)));
      const ok = clamp(Math.round(fin(r.ok)), 0, n), ft = clamp(Math.round(fin(r.ft)), 0, ok);
      out.paths[sk][idn] = {
        seen: +r.seen ? 1 : 0, demo: +r.demo ? 1 : 0, at: Math.max(0, fin(r.at)),
        n, ok, ft, spd: clamp(fin(r.spd, 9), 0.01, 99), pass: Math.max(0, fin(r.pass)),
      };
    });
  });
  const cfg = cleanCfg(out.cfg);
  if (cfg) out.cfg = cfg; else delete out.cfg;
  // Saved setups: Home maps and slices this list, so it must always be an array of usable rows.
  out.presets = (Array.isArray(s.presets) ? s.presets : []).slice(0, PRESET_MAX).map((p) => {
    if (!isObj(p)) return null;
    const cfg = cleanCfg(p.cfg);
    const name = typeof p.n == 'string' ? p.n.trim().slice(0, 28) : '';
    return cfg && name ? { n: name, cfg } : null;
  }).filter(Boolean);
  // Per-setting change times (see SYNCED_PREFS): only known settings, only real timestamps.
  out.pt = {};
  if (isObj(s.pt)) SYNCED_PREFS.forEach((k) => { const t = fin(s.pt[k]); if (t > 0) out.pt[k] = t; });
  out.goal = clamp(Math.round(fin(s.goal, 2)), 1, 5);   // the Settings stepper is 1..5, and plan arithmetic assumes a number
  out.cal = Number.isFinite(+s.cal) && s.cal !== null && s.cal !== '' ? +s.cal : Array.isArray(s.sessions) && s.sessions.length ? 0 : CAL;   // existing data without it predates the scoring fix
  out.ms = Array.isArray(s.ms) ? s.ms : [];
  out.hist = Array.isArray(s.hist) ? s.hist : [];
  return out;
}

/** The single live state object. Mutated in place so imports never go stale. */
export const S = {};
export const replaceState = (o) => { Object.keys(S).forEach((k) => delete S[k]); Object.assign(S, migrate(o)); snapPrefs(); };

let loaded = {};
try { loaded = JSON.parse(localStorage[activeKey()]); } catch (e) { /* first run or blocked storage */ }
replaceState(loaded);

const listeners = new Set();
export const onSave = (f) => listeners.add(f);
/**
 * Keep storage and sync payloads small as history grows. Only the newest sessions need their per-skill
 * breakdown (`by`, last 60) and rating snapshot (`lv`, last 150); that is all any chart or screen reads.
 */
export const KEEP_BY = 60, KEEP_LV = 150;
export function compact(st = S) {
  const g = Object.entries(st.gone || {}).filter(([, t]) => t > Date.now() - 90 * 864e5).sort((a, b) => b[1] - a[1]).slice(0, 200);
  st.gone = Object.fromEntries(g);
  const n = st.sessions.length;
  st.sessions.forEach((x, i) => { if (i < n - KEEP_BY && x.by) delete x.by; if (i < n - KEEP_LV && x.lv) delete x.lv; });
  trimRecall(st);
}
/** Keep the retention ledger bounded: oldest pending baselines go first, then oldest completed pairs. */
export function trimRecall(st = S) {
  const rows = Object.entries(st.recall || {}), extra = rows.length - RECALL_MAX;
  if (extra <= 0) return;
  const pending = rows.filter(([, r]) => !r.t1).sort((a, b) => (a[1].t0 || 0) - (b[1].t0 || 0));
  const done = rows.filter(([, r]) => r.t1).sort((a, b) => (a[1].t1 || 0) - (b[1].t1 || 0));
  [...pending, ...done].slice(0, extra).forEach(([k]) => delete st.recall[k]);
}

/** Write to localStorage without touching the modified-time (used after a sync merge). */
export function persist() {
  try { localStorage[activeKey()] = JSON.stringify(S); return true; } catch (e) { return false; }
}
/** Stamp as modified, persist, and tell the sync layer. */
export function save() {
  S.u = Date.now();
  stampPrefs();
  compact();
  if (!persist()) { listeners.forEach((f) => f('error')); return false; }
  listeners.forEach((f) => f('saved'));
  return true;
}

/**
 * Remove a notebook entry and remember that we did. The tombstone lets a merge tell "mastered here" apart
 * from "never seen here", so a question you cleared on your phone does not come back from your laptop.
 */
/** What a Review session will cover: the due notebook items when any are due, otherwise everything saved. Capped at REVIEW_MAX. The Notebook, Home and Session all read this one answer. */
export const REVIEW_MAX = 20;
export function reviewPlan(now = Date.now()) {
  const all = Object.values(S.weak || {}), due = all.filter((w) => w.due <= now);
  return { saved: all.length, due: due.length, dueKeys: due.map((w) => w.q), dueOnly: due.length > 0, count: Math.min(REVIEW_MAX, due.length || all.length) };
}
export function forget(key) { delete S.weak[key]; S.gone[key] = Date.now(); }
/** The retained history for a question key, if it has ever been mastered. */
export const masteredFor = (q) => S.mastered[qk(q)] || S.mastered[q] || null;
/**
 * Confirm retention: retire a notebook entry into the mastery ledger. The ledger keeps the
 * question, when it was mastered, how many successful retrievals it took and every later lapse.
 * A tombstone still stops another device from reviving the active notebook row.
 */
export function master(key, w, now = Date.now()) {
  const mk = qk(w.q || key), prev = S.mastered[mk] || S.mastered[key];
  S.mastered[mk] = {
    ...(prev || {}), ...w,
    box: MASTER_BOX,
    masteredAt: now,
    firstMasteredAt: prev && prev.firstMasteredAt ? prev.firstMasteredAt : now,
    at: now,
    lapses: prev ? Math.max(0, Math.round(fin(prev.lapses))) : 0,
    lastLapse: prev ? Math.max(0, fin(prev.lastLapse)) : 0,
    retrievals: (prev ? Math.max(0, Math.round(fin(prev.retrievals))) : 0) + MASTER_BOX,
  };
  forget(key);
}
/** A previously mastered question was missed again. Keep the history and count the lapse once. */
export function recordLapse(q, now = Date.now()) {
  const mk = qk(q), m = S.mastered[mk] || S.mastered[q];
  if (!m) return false;
  m.lapses = Math.max(0, Math.round(fin(m.lapses))) + 1;
  m.lastLapse = now;
  m.at = now;
  return true;
}
/**
 * Record one clean answer in the delayed-recall ledger, keyed by the canonical question.
 * `clean` means first try, unhinted and not a same-session retry; a hinted or fixed-up answer
 * is not a fair memory test, so the next clean attempt is used instead.
 * Returns 'baseline' for the first clean answer, 'delayed' for the first clean answer at least
 * seven days later, or '' when the answer changes nothing.
 */
export function recordRecall(q, ok, now = Date.now(), clean = true, sk = '') {
  if (!clean || !q || !Number.isFinite(now) || now <= 0) return '';
  const key = qk(String(q)), rows = (S.recall = S.recall || {}), skill = SK[sk] ? sk : '';
  const r = rows[key];
  if (!r) {
    rows[key] = { q: String(q), t0: now, ok0: ok ? 1 : 0, t1: 0, ok1: 0, ...(skill ? { sk: skill } : {}) };
    trimRecall();
    return 'baseline';
  }
  if (skill && !r.sk) r.sk = skill;   // an old row can still gain its skill from a later clean answer
  if (!r.t1 && now - r.t0 >= RECALL_GAP) {
    r.t1 = now;
    r.ok1 = ok ? 1 : 0;
    return 'delayed';
  }
  return '';
}
/** Undo `forget`. */
export function unforget(key, w) {
  // `at` must beat the tombstone, or the next merge with a device that already saw the removal deletes the entry again
  S.weak[key] = { ...w, at: Math.max(w.at || 0, (S.gone[key] || 0) + 1) };
  delete S.gone[key];
}

/* ---------- one-time recovery from the pre-5.4 scoring ---------- */
/** Skills whose rating sits at least 100 below their own peak. After the scoring fix these are the ones the old scorer pushed down. */
export const lowered = () => IDS.filter((k) => S.sk[k].n > 0 && (S.sk[k].pk || 0) - S.sk[k].lv >= 1);
/** Put the skills from `lowered()` back to their peak; the faster learning rate then settles them at the true level. */
export function restoreRatings() { lowered().forEach((k) => (S.sk[k].lv = clamp(S.sk[k].pk, 1, 12))); }
/**
 * Finish the one-time recovery. Speed ratios and per-pattern timings in old data were measured against the old targets
 * (everyone looked "slow"), which would mislead coaching and extra-practice picks, so they restart at neutral (1 = par).
 */
export function finishCal() {
  IDS.forEach((k) => (S.sk[k].spd = 1));
  Object.values(S.pat).forEach((o) => { if (o && Number.isFinite(o.ok)) o.r = o.ok; });
  if (validCtr(S.ctr)) [S.ctr.base, ...Object.values(S.ctr.dev)].forEach(neutral);   // the stored contributions must agree with the totals
  S.cal = CAL;
}

/* ---------- derived stats ---------- */
export const avgLv = () => IDS.reduce((a, k) => a + S.sk[k].lv, 0) / IDS.length;
export const cfgNow = () => Object.assign({ dur: 120, only: 'all' }, S.cfg);
export const hasData = () => S.sessions.length > 0;

/* ---------- merge two states (used by cloud sync) ---------- */
/**
 * Merge so that no device ever loses work:
 *  - sessions: union by timestamp
 *  - per-skill rating: the side with more answers (more experience) wins
 *  - missed questions: union, newer wins per key
 *  - pattern / fact / error counters: every device's own contribution is kept and summed (see `bump`), never "larger wins"
 *  - bests, daily scores: higher wins; milestones: union
 *  - settings (appearance, keypad, sound, goal, saved setups): the newest change to each one wins, see SYNCED_PREFS
 *  - everything else: whichever state was saved last
 *  - reminders, open panels and banner snoozes stay as they are on this device (a)
 */
/** Merge two copies of the same mastered question without losing its first mastery or a lapse. */
function mergeMasteredEntry(x, y) {
  const latest = (y.at || 0) >= (x.at || 0) ? y : x;
  return {
    ...x, ...y, ...latest,
    box: MASTER_BOX,
    masteredAt: Math.max(x.masteredAt || 0, y.masteredAt || 0),
    firstMasteredAt: Math.min(x.firstMasteredAt || x.masteredAt || 0, y.firstMasteredAt || y.masteredAt || 0),
    at: Math.max(x.at || 0, y.at || 0),
    lapses: Math.max(x.lapses || 0, y.lapses || 0),
    lastLapse: Math.max(x.lastLapse || 0, y.lastLapse || 0),
    retrievals: Math.max(x.retrievals || 0, y.retrievals || 0),
  };
}
/**
 * Merge two ledgers for the same question. A completed pair is kept as one whole observation
 * (never stitched from one device's baseline and the other's outcome). Otherwise the earliest
 * baseline wins. Comparators are total orders, so the result does not depend on merge direction.
 */
function mergeRecallEntry(x, y) {
  const done = [x, y].filter((r) => r && r.t1 > 0 && r.t1 - r.t0 >= RECALL_GAP)
    .sort((a, b) => (a.t0 - b.t0) || (a.t1 - b.t1) || (b.ok0 - a.ok0) || (b.ok1 - a.ok1));
  const pick = done[0] || ([x, y].sort((a, b) => (a.t0 - b.t0) || (b.ok0 - a.ok0) || String(a.q).localeCompare(String(b.q)))[0]);
  const sk = pick.sk || x.sk || y.sk || '';
  return { ...pick, ...(sk ? { sk } : {}) };
}
/**
 * One guided-path row. A passing run wins over a failing one; otherwise the better first-try run
 * wins. The demo/pass stamps are monotonic, so a merge never removes progress.
 */
function mergePathEntry(x, y) {
  if (!x) return y;
  if (!y) return x;
  const score = (r) => [r.pass ? 1 : 0, r.n ? r.ft / r.n : 0, r.ft || 0, r.n || 0, -(r.spd || 9)];
  const a = score(x), b = score(y), better = a.some((v, i) => v !== b[i]) ? a.findIndex((v, i) => v !== b[i]) : -1;
  const best = better < 0 || a[better] > b[better] ? x : y;
  return {
    ...best,
    seen: Math.max(x.seen || 0, y.seen || 0),
    demo: Math.max(x.demo || 0, y.demo || 0),
    pass: Math.max(x.pass || 0, y.pass || 0),
    at: Math.max(x.at || 0, y.at || 0),
  };
}
export function mergeStates(a, b) {
  a = migrate(a); b = migrate(b);
  const aNew = (a.u || 0) >= (b.u || 0), nw = aNew ? a : b, od = aNew ? b : a;
  const m = { ...od, ...nw };
  const seen = new Set();
  m.sessions = [...a.sessions, ...b.sessions].filter((x) => !seen.has(x.t) && seen.add(x.t)).sort((x, y) => x.t - y.t);
  m.sk = {};
  IDS.forEach((k) => { const x = a.sk[k], y = b.sk[k]; m.sk[k] = x.n > y.n ? x : y.n > x.n ? y : nw.sk[k]; });
  m.weak = { ...od.weak };
  Object.entries(nw.weak).forEach(([k, w]) => { const o = m.weak[k]; if (!o || (w.at || 0) >= (o.at || 0)) m.weak[k] = w; });
  m.gone = { ...od.gone };
  Object.entries(nw.gone).forEach(([k, t]) => { m.gone[k] = Math.max(t, m.gone[k] || 0); });
  // Mastery history is a union too: a question mastered on either device stays mastered, with the newest details
  // and the worst lapse count. `masteredAt` also acts as a tombstone for the active notebook row.
  m.mastered = { ...od.mastered };
  Object.entries(nw.mastered).forEach(([k, w]) => { const o = m.mastered[k]; m.mastered[k] = o ? mergeMasteredEntry(o, w) : w; });
  // The delayed-recall ledger is a union too. Each question contributes one baseline/7-day pair.
  m.recall = { ...od.recall };
  Object.entries(nw.recall).forEach(([k, r]) => { const o = m.recall[k]; m.recall[k] = o ? mergeRecallEntry(o, r) : r; });
  trimRecall(m);
  // Guided-path progress is a union: every stage keeps its best run, its demo and its pass.
  m.paths = {};
  new Set([...Object.keys(a.paths), ...Object.keys(b.paths)]).forEach((sk) => {
    if (!SK[sk]) return;
    m.paths[sk] = {};
    new Set([...Object.keys(a.paths[sk] || {}), ...Object.keys(b.paths[sk] || {})]).forEach((id) => {
      const row = mergePathEntry(a.paths[sk] && a.paths[sk][id], b.paths[sk] && b.paths[sk][id]);
      if (row) m.paths[sk][id] = row;
    });
  });
  Object.keys(m.weak).forEach((k) => {
    const w = m.weak[k], mk = qk(w.q || k);
    const retired = Math.max(m.gone[k] || 0, (m.mastered[mk] && m.mastered[mk].masteredAt) || 0);
    if (retired >= (w.at || 0)) delete m.weak[k];   // cleared or mastered after it was last missed
  });
  m.ctr = mergeCtr(a.ctr, b.ctr, a.cal || 0, b.cal || 0); rollup(m);   // counters: per-device slots add up, shared base merges once
  m.ms = [...new Set([...a.ms, ...b.ms])];
  m.best = {};
  new Set([...Object.keys(a.best), ...Object.keys(b.best)]).forEach((k) => {
    const x = a.best[k], y = b.best[k];
    m.best[k] = !y || (x && (k == 'sprint' ? x.t <= y.t : x.pts >= y.pts)) ? x : y;   // a Sprint best is the lowest time, not the most points
  });
  m.daily = {};
  new Set([...Object.keys(a.daily), ...Object.keys(b.daily)]).forEach((k) => (m.daily[k] = Math.max(a.daily[k] || 0, b.daily[k] || 0)));
  m.lastExport = Math.max(a.lastExport || 0, b.lastExport || 0);
  m.u = Math.max(a.u || 0, b.u || 0);
  m.cal = Math.max(a.cal || 0, b.cal || 0);
  m.onb = a.onb || b.onb;
  // Settings: the newest change to each one wins. With no change time on either side (data from before settings
  // synced), this device keeps its own value and an unset device adopts a set one, so nothing changes by surprise.
  m.pt = {};
  SYNCED_PREFS.forEach((k) => {
    const ta = a.pt[k] || 0, tb = b.pt[k] || 0;
    const w = ta !== tb ? (ta > tb ? a : b) : (a[k] !== undefined || b[k] === undefined ? a : b);
    if (w[k] === undefined) delete m[k]; else m[k] = w[k];
    if (Math.max(ta, tb)) m.pt[k] = Math.max(ta, tb);
  });
  DEVICE_LOCAL.forEach((k) => { if (a[k] === undefined) delete m[k]; else m[k] = a[k]; });
  return m;
}
