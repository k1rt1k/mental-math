import { getStore } from "@netlify/blobs";
import { resolveSyncUser } from "../lib/auth.mjs";

const MAX_BYTES = 4e6;
const KEEP_DAILY = 7;
const CAS_ATTEMPTS = 3;
const J = (o, status = 200) => Response.json(o, { status, headers: { "cache-control": "no-store" } });
const T = (msg, status) => new Response(msg, { status, headers: { "cache-control": "no-store" } });
/** Time of the newest Reset/Replace that produced this state. A save carrying a newer one is allowed to drop sessions. */
const wipeOf = (x) => (x && Number.isFinite(+x.wipe) && +x.wipe > 0 ? +x.wipe : 0);
const validRow = (x) => x && Number.isFinite(+x.t) && x.dur > 0 && x.n >= 0;

/** Read the current state and its ETag. The ETag is what makes the write below a compare-and-swap. */
async function readState(store) {
  if (typeof store.getWithMetadata === "function") {
    const row = await store.getWithMetadata("state", { type: "json", consistency: "strong" });
    return row ? { old: row.data || null, etag: row.etag } : { old: null, etag: undefined };
  }
  // Older/self-hosted stand-ins may not expose metadata: keep working, but without CAS.
  return { old: await store.get("state", { type: "json" }), etag: undefined };
}

/** Write only if the state still matches the ETag we validated. Returns true when it landed. */
async function writeState(store, body, old, etag) {
  if (!old || !etag) {
    // No existing row: create only if another writer has not created it first.
    if (!old && typeof store.setJSON === "function") {
      const r = await store.setJSON("state", body, { onlyIfNew: true });
      return !r || r.modified !== false;
    }
    // A metadata-less store: last writer wins, just as before (the caller still validated sessions).
    const r = await store.setJSON("state", body);
    return !r || r.modified !== false;
  }
  const r = await store.setJSON("state", body, { onlyIfMatch: etag });
  return !r || r.modified !== false;
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
  const who = resolveSyncUser(req.headers.get("x-sync-key"));
  if (!who) return T("unauthorized", 401);

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
    return J({ data: await store.get("state", { type: "json" }) });
  }

  if (req.method === "PUT") {
    const text = await req.text();
    if (text.length > MAX_BYTES) return T("too large", 413);
    let body;
    try { body = JSON.parse(text); } catch { body = null; }
    if (!body || typeof body !== "object" || !body.sk || typeof body.sk !== "object" || !Array.isArray(body.sessions)) return T("bad data", 400);
    if (body.sessions.length > 50000) return T("too many sessions", 413);
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
      if (!erasing && old && Array.isArray(old.sessions)) {
        const have = new Set(body.sessions.map((x) => x && +x.t));
        if (old.sessions.some((x) => validRow(x) && !have.has(+x.t))) return T("would lose sessions", 409);
      }
      if (await writeState(store, body, old, etag)) {
        await saveBackup(store, old, erasing);
        return J({ ok: true });
      }
    }
    return T("conflict", 409);
  }
  return T("method not allowed", 405);
};

export const config = { path: "/api/sync" };
