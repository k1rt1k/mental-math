import { getStore } from "@netlify/blobs";
import { authenticate, lockedText } from "../lib/gate.mjs";

const MAX_BYTES = 4e6;
const KEEP_DAILY = 7;
const CAS_ATTEMPTS = 3;
const J = (o, status = 200) => Response.json(o, { status, headers: { "cache-control": "no-store" } });
const T = (msg, status) => new Response(msg, { status, headers: { "cache-control": "no-store" } });
/** Time of the newest Reset/Replace that produced this state. A save carrying a newer one is allowed to drop sessions. */
const wipeOf = (x) => (x && Number.isFinite(+x.wipe) && +x.wipe > 0 ? +x.wipe : 0);
/** Cheap integrity check over a set of sessions: count and a sum of timestamps, so a delta save can prove the client and server agree. */
const sessionsChk = (rows) => rows.reduce((a, x) => a + (+x.t % 1e9), 0);
const validRow = (x) => x && Number.isFinite(+x.t) && x.dur > 0 && x.n >= 0;

/**
 * Read the request body as text, gunzipping it when the client compressed it (detected by the gzip magic bytes, so it works
 * whether or not a proxy touched the headers). The size cap applies to the decompressed bytes, so a small bomb cannot expand.
 */
async function readBody(req) {
  const reader = req.body ? req.body.getReader() : null;
  const chunks = []; let total = 0;
  const cap = MAX_BYTES, raw = 6e6;   // compressed input is capped too; Netlify rejects larger requests anyway
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length; chunks.push(value);
    if (total > raw) return null;
  }
  const buf = Buffer.concat(chunks);
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    const { gunzip } = await import("node:zlib");
    try {
      return await new Promise((res, rej) => gunzip(buf, { maxOutputLength: cap + 1 }, (e, out) => (e ? rej(e) : res(out.toString("utf8")))));
    } catch { return undefined; }   // corrupt, or it would expand past the cap
  }
  return buf.toString("utf8");
}

/** Read the current state and its ETag. The ETag is what makes the write below a compare-and-swap. */
async function readState(store) {
  if (typeof store.getWithMetadata === "function") {
    const row = await store.getWithMetadata("state", { type: "json", consistency: "strong" });
    return row ? { old: row.data || null, etag: row.etag } : { old: null, etag: undefined };
  }
  // Older/self-hosted stand-ins may not expose metadata: keep working, but without CAS.
  return { old: await store.get("state", { type: "json" }), etag: undefined };
}

/** Write only if the state still matches the ETag we validated. Returns { etag } when it landed, otherwise null. */
const landed = (r) => (!r || r.modified !== false ? { etag: r && r.etag } : null);
async function writeState(store, body, old, etag) {
  if (!old || !etag) {
    // No existing row: create only if another writer has not created it first.
    if (!old && typeof store.setJSON === "function") return landed(await store.setJSON("state", body, { onlyIfNew: true }));
    // A metadata-less store: last writer wins, just as before (the caller still validated sessions).
    return landed(await store.setJSON("state", body));
  }
  return landed(await store.setJSON("state", body, { onlyIfMatch: etag }));
}

/** One daily safety copy of the state from before the successful write. Best effort: never fail a save. */
async function saveBackup(store, old, erasing = false) {
  if (!old) return;
  try {
    const bk = await store.get("backup", { type: "json" });
    // An erase always keeps what it is about to destroy (unless there was nothing to lose), however fresh the daily copy is.
    const hadData = Array.isArray(old.sessions) && old.sessions.length > 0;
    if (erasing && hadData) await store.setJSON("backup-pre-erase", { at: Date.now(), state: old });
    if (!bk || (erasing && hadData) || Date.now() - (bk.at || 0) > 864e5) {
      const snap = { at: Date.now(), state: old };
      await store.setJSON("backup", snap);
      await store.setJSON("backup-" + new Date().toISOString().slice(0, 10), snap);
      const l = await store.list({ prefix: "backup-" });
      const keys = l.blobs.map((b) => b.key).sort();
      for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_DAILY))) await store.delete(k);
    }
  } catch { /* rotation is best-effort; the authoritative state has already been written */ }
}

export default async (req) => {
  const g = await authenticate(req);
  if (g.denied === "locked") return new Response(lockedText(g.retryAfter), { status: 429, headers: { "cache-control": "no-store", "retry-after": String(g.retryAfter) } });
  if (g.denied) return T("unauthorized", 401);
  const who = g.who;

  const store = getStore({ name: who.store, consistency: "strong" });

  if (req.method === "GET") {
    // /api/sync?backup=1 returns the newest safety copy (kept for older clients)
    const q = new URL(req.url).searchParams;
    if (q.has("backup")) return J((await store.get("backup", { type: "json" })) || {});
    // /api/sync?backups=1 lists the rolling daily copies
    if (q.has("backups")) {
      const l = await store.list({ prefix: "backup-" }).catch(() => ({ blobs: [] }));
      return J({ keys: l.blobs.map((b) => b.key).sort() });
    }
    // Conditional pull: a client that already holds this exact version gets a few bytes instead of the whole state.
    const { old, etag } = await readState(store);
    const have = q.get("etag");
    if (have && etag && have === etag) return J({ unchanged: true, etag });
    // `weak` is only present for a key configured before the minimum-length rule, so the app can ask its owner to replace it.
    // Full pulls only: the first pull after any page load has no ETag yet, so it always carries the flag.
    return J({ data: old, etag, ...(who.weak ? { weak: true } : {}) });
  }

  if (req.method === "PUT") {
    const text = await readBody(req);
    if (text === null || (text && text.length > MAX_BYTES)) return T("too large", 413);
    let body;
    try { body = JSON.parse(text); } catch { body = null; }
    // Two shapes: a full save carries `sessions`; a delta save carries `add` (sessions new since the client's cursor) plus `n`
    // and `chk`, which prove the client's whole history matches what the server will hold after adding them.
    const isDelta = !!body && typeof body === "object" && Array.isArray(body.add) && !("sessions" in body);
    if (!body || typeof body !== "object" || !body.sk || typeof body.sk !== "object" || !(isDelta || Array.isArray(body.sessions))) return T("bad data", 400);
    if ((isDelta ? body.add : body.sessions).length > 50000) return T("too many sessions", 413);
    const bw = wipeOf(body);
    if (bw > Date.now() + 864e5) return T("bad data", 400);   // a wipe time from the far future would lock every other device out

    // Compare-and-swap: read the ETag, validate against that exact version, then write only if it is unchanged.
    // A racing device that got there first makes the ETag stale, so we retry against its state and either accept
    // (the new body is still a safe superset) or return 409 for the client to merge and retry. Backups are only
    // written after a successful swap, so a conflict never replaces a valid safety copy with a partial state.
    for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
      const { old, etag } = await readState(store);
      // Refuse a save that would drop any session the server already has (the client must merge first).
      // Compare by timestamp, not count: two devices with the same number of different sessions used to slip through.
      // Rows the client itself would discard as malformed are ignored, or a bad row would block syncing forever.
      // A Reset or Replace carries a newer `wipe` and is the one save allowed to drop sessions. The opposite, a device that
      // has not heard about the erase yet, is refused so it merges the new state instead of bringing the old data back.
      const ow = wipeOf(old), erasing = bw > ow;
      if (bw < ow) return T("stale", 409);
      let next = body;
      if (isDelta) {
        // A delta can only add. It needs an existing history to add to, the same erase epoch, and a matching fingerprint;
        // anything else is a 409 and the client answers with a full save (which has all the older safeguards).
        if (!old || !Array.isArray(old.sessions) || erasing) return T("need full", 409);
        const byT = new Map();
        for (const x of old.sessions) if (validRow(x) && !byT.has(+x.t)) byT.set(+x.t, x);
        for (const x of body.add) if (validRow(x) && !byT.has(+x.t)) byT.set(+x.t, x);
        const merged = [...byT.values()].sort((x, y) => +x.t - +y.t);
        if (merged.length > 50000) return T("too many sessions", 413);
        if (merged.length !== body.n || sessionsChk(merged) !== body.chk) return T("out of sync", 409);
        const { add: _a, n: _n, chk: _c, ...rest } = body;
        next = { ...rest, sessions: merged };
        if (JSON.stringify(next).length > MAX_BYTES) return T("too large", 413);
      }
      if (!isDelta && !erasing && old && Array.isArray(old.sessions)) {
        const have = new Set(body.sessions.map((x) => x && +x.t));
        if (old.sessions.some((x) => validRow(x) && !have.has(+x.t))) return T("would lose sessions", 409);
      }
      const done = await writeState(store, next, old, etag);
      if (done) {
        await saveBackup(store, old, erasing);
        return J({ ok: true, etag: done.etag });
      }
    }
    return T("conflict", 409);
  }
  return T("method not allowed", 405);
};

export const config = { path: "/api/sync" };
