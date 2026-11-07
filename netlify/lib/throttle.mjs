import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

// Limits wrong-key guessing. Each client address gets MAX_FAILS wrong keys per WINDOW; after that it is refused (429) for LOCK,
// even with a correct key, so a guesser cannot keep going while locked. Counters live in a small blob store because functions
// are stateless. The limiter is best effort and fails OPEN: if the store is unreachable, learners are never locked out by it.
export const LIMIT = { MAX_FAILS: 8, WINDOW: 15 * 60e3, LOCK: 15 * 60e3, STORE: "mental-math-auth" };

/** Who is asking. Netlify sets the first header; the others cover local runs. Only a hash of the address is stored. */
export const clientId = (req) => {
  const raw = req.headers.get("x-nf-client-connection-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  return "ip-" + createHash("sha256").update(raw).digest("hex").slice(0, 32);
};

const open = () => getStore({ name: LIMIT.STORE, consistency: "strong" });

/** Seconds the caller must wait, or 0 when it may try. */
export async function lockedFor(req, now = Date.now()) {
  try {
    const rec = await open().get(clientId(req), { type: "json" });
    if (rec && rec.until > now) return Math.max(1, Math.ceil((rec.until - now) / 1000));
  } catch { /* fail open */ }
  return 0;
}

/** Count one wrong key. Returns the lock time in seconds when this one tipped the address over the limit, else 0. */
export async function recordFail(req, now = Date.now()) {
  try {
    const store = open(), id = clientId(req), rec = await store.get(id, { type: "json" });
    const fresh = !rec || now - (rec.first || 0) > LIMIT.WINDOW;
    const n = (fresh ? 0 : rec.n || 0) + 1;
    const next = { n, first: fresh ? now : rec.first };
    if (n >= LIMIT.MAX_FAILS) next.until = now + LIMIT.LOCK;
    await store.setJSON(id, next);
    return next.until ? Math.ceil(LIMIT.LOCK / 1000) : 0;
  } catch { return 0; }
}

/** A correct key clears that address's count (only writes when there is something to clear). */
export async function recordOk(req) {
  try {
    const store = open(), id = clientId(req);
    if (await store.get(id, { type: "json" })) await store.delete(id);
  } catch { /* fail open */ }
}
