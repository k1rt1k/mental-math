// Opt-in Daily-challenge leaderboard between the learners of one deployment.
// Nothing is shared until a learner joins. What is stored per learner: the display name they chose, and for each day their best
// points, answers and correct answers. It lives in its own store, never in the learner's progress, and leaving deletes it.
// Scores are reported by the browser, so this is a friendly board for a family or class, not a tamper-proof one.
export const BOARD = { STORE: "mental-math-board", MEMBERS: "members", KEEP_DAYS: 14, MAX_MEMBERS: 25, MAX_PTS: 50000, MAX_N: 600, NAME_MAX: 20 };
const dayKey = (d) => "day-" + d;
const clone = (o) => JSON.parse(JSON.stringify(o || {}));

export const cleanName = (s) => String(s || "").replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, "").replace(/\s+/g, " ").trim().slice(0, BOARD.NAME_MAX);
/** A day string the board will take: YYYY-MM-DD that exists, and within one day of the server's UTC date (local dates differ by up to a day either way). */
export function validDay(d, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d))) return false;
  const t = Date.parse(d + "T00:00:00Z");
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d && Math.abs(t - Date.parse(new Date(now).toISOString().slice(0, 10) + "T00:00:00Z")) <= 86400000;
}

/** Read-modify-write one JSON key with compare-and-swap, so two learners finishing at once do not overwrite each other. fn returns the new value, or null for "no change". */
async function update(store, key, fn) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = typeof store.getWithMetadata === "function" ? await store.getWithMetadata(key, { type: "json", consistency: "strong" }) : null;
    const cur = row ? row.data : typeof store.getWithMetadata === "function" ? null : await store.get(key, { type: "json" });
    const next = fn(clone(cur));
    if (next === null) return { ok: true, changed: false };
    const r = row && row.etag ? await store.setJSON(key, next, { onlyIfMatch: row.etag }) : cur ? await store.setJSON(key, next) : await store.setJSON(key, next, { onlyIfNew: true });
    if (!r || r.modified !== false) return { ok: true, changed: true, value: next };
  }
  return { ok: false };
}
const read = async (store, key) => (await store.get(key, { type: "json" })) || null;

export async function join(store, who, rawName, now = Date.now()) {
  const name = cleanName(rawName);
  if (name.length < 2) return { ok: false, status: 400, error: "Pick a display name of at least two characters." };
  let err = null;
  const r = await update(store, BOARD.MEMBERS, (d) => {
    const m = (d.members = d.members || {});
    if (Object.entries(m).some(([id, x]) => id !== who.id && String(x.name).toLowerCase() === name.toLowerCase())) { err = { status: 409, error: "Someone on the board already uses that name." }; return null; }
    if (!m[who.id] && Object.keys(m).length >= BOARD.MAX_MEMBERS) { err = { status: 409, error: "The board is full." }; return null; }
    m[who.id] = { name, since: (m[who.id] && m[who.id].since) || now };
    return d;
  });
  return err ? { ok: false, ...err } : r.ok ? { ok: true, name } : { ok: false, status: 409, error: "Another change happened at the same time. Try again." };
}

/** Leave: the membership goes first (that alone hides every score), then the stored scores are removed. */
export async function leave(store, who) {
  const r = await update(store, BOARD.MEMBERS, (d) => { if (!d.members || !d.members[who.id]) return null; delete d.members[who.id]; return d; });
  if (!r.ok) return { ok: false, status: 409, error: "Another change happened at the same time. Try again." };
  try {
    const { blobs } = await store.list({ prefix: "day-" });
    for (const b of blobs) await update(store, b.key, (d) => { if (!d.entries || !d.entries[who.id]) return null; delete d.entries[who.id]; return d; });
  } catch { /* the membership is already gone, which is what hides the scores */ }
  return { ok: true };
}

export async function postScore(store, who, { day, pts, n, ok }, now = Date.now()) {
  const isInt = (x, max) => Number.isInteger(x) && x >= 0 && x <= max;
  if (!validDay(day, now)) return { ok: false, status: 400, error: "That day is not accepted." };
  if (!isInt(pts, BOARD.MAX_PTS) || !isInt(n, BOARD.MAX_N) || !isInt(ok, BOARD.MAX_N) || ok > n) return { ok: false, status: 400, error: "That score is not accepted." };
  const mem = await read(store, BOARD.MEMBERS);
  if (!(mem && mem.members && mem.members[who.id])) return { ok: true, member: false };
  const r = await update(store, dayKey(day), (d) => {
    const e = (d.entries = d.entries || {});
    if (e[who.id] && e[who.id].pts >= pts) return null;          // the day's best is kept, like the score on the device
    e[who.id] = { pts, n, ok, t: now };
    return d;
  });
  if (!r.ok) return { ok: false, status: 409, error: "Another change happened at the same time. Try again." };
  try {   // keep two weeks of days
    const cutoff = Date.parse(new Date(now - BOARD.KEEP_DAYS * 86400000).toISOString().slice(0, 10) + "T00:00:00Z");
    const { blobs } = await store.list({ prefix: "day-" });
    for (const b of blobs) if (Date.parse(b.key.slice(4) + "T00:00:00Z") < cutoff) await store.delete(b.key);
  } catch { /* housekeeping only */ }
  return { ok: true, member: true };
}

/** The board for one day. `live` (optional Set of learner ids) hides members whose key has been turned off. */
export async function readBoard(store, who, day, live = null) {
  const mem = (await read(store, BOARD.MEMBERS)) || {}, members = mem.members || {};
  if (!members[who.id]) return { member: false, day };
  const ids = Object.keys(members).filter((id) => !live || live.has(id));
  const entries = ((await read(store, dayKey(day))) || {}).entries || {};
  const board = ids.filter((id) => entries[id]).map((id) => ({ name: members[id].name, pts: entries[id].pts, n: entries[id].n, ok: entries[id].ok, t: entries[id].t, you: id === who.id }))
    .sort((a, b) => b.pts - a.pts || a.t - b.t).map(({ t, ...x }) => x);
  return { member: true, name: members[who.id].name, day, board, waiting: ids.filter((id) => !entries[id]).map((id) => members[id].name) };
}
