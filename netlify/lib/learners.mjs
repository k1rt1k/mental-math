import { getStore } from "@netlify/blobs";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { users } from "./auth.mjs";

// Learners created from inside the app (Settings > Learners and keys). The server makes the key, shows it once, and keeps only
// its SHA-256: the keys are random and long (about 98 bits), so a fast hash is enough and no password is ever stored.
// Learners from SYNC_KEY / SYNC_KEY_<NAME> environment variables keep working exactly as before.
export const LEARNERS = { STORE: "mental-math-learners", KEY: "index", MAX: 10 };
const ALPHABET = "abcdefghjkmnpqrstvwxyz23456789";   // no 0/o/1/l/i, so a key can be read aloud or copied by eye
const sha = (k) => createHash("sha256").update(String(k || "")).digest("hex");
const open = () => getStore({ name: LEARNERS.STORE, consistency: "strong" });

/** A new key like `k7f2-m9xq-3tpa-hv8e-r4nw`. */
const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
export const makeKey = () => Array.from({ length: 5 }, group).join("-");
export const slug = (name) => String(name || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);

async function readIndex(store) {
  if (typeof store.getWithMetadata === "function") {
    const row = await store.getWithMetadata(LEARNERS.KEY, { type: "json", consistency: "strong" });
    return row ? { list: Array.isArray(row.data && row.data.learners) ? row.data.learners : [], etag: row.etag, exists: true } : { list: [], etag: undefined, exists: false };
  }
  const d = await store.get(LEARNERS.KEY, { type: "json" });
  return { list: Array.isArray(d && d.learners) ? d.learners : [], etag: undefined, exists: !!d };
}
async function writeIndex(store, list, { etag, exists }) {
  const body = { learners: list };
  // Compare-and-swap so two administrators (or two taps) cannot overwrite each other; a store without ETags falls back to a plain write.
  const r = etag ? await store.setJSON(LEARNERS.KEY, body, { onlyIfMatch: etag }) : exists ? await store.setJSON(LEARNERS.KEY, body) : await store.setJSON(LEARNERS.KEY, body, { onlyIfNew: true });
  return !r || r.modified !== false;
}

/** Find the learner a key belongs to, or null. Never throws: a storage problem just means "not found". */
export async function findLearner(sent) {
  try {
    const want = Buffer.from(sha(sent), "hex");
    const { list } = await readIndex(open());
    let hit = null;
    for (const l of list) if (l && l.hash && timingSafeEqual(want, Buffer.from(l.hash, "hex")) && !hit) hit = l;
    return hit && { id: hit.id, store: hit.store, name: hit.name, admin: false, weak: false, key: undefined };
  } catch { return null; }
}

/** Environment learners and app-made learners, without any key, for jobs that act on every learner's store (reminders). */
export async function allLearners() {
  const env = users().map(({ id, store }) => ({ id, store }));
  try { const { list } = await readIndex(open()); return [...env, ...list.filter((l) => l && l.store).map(({ id, store }) => ({ id, store }))]; }
  catch { return env; }
}

export async function listLearners() {
  const { list } = await readIndex(open());
  return list.map(({ id, name, created }) => ({ id, name, created }));
}

/** Create a learner. Returns { ok, learner, key } (the key is only ever available here), or { ok:false, error, status }. */
export async function addLearner(name, now = Date.now()) {
  const id = slug(name);
  if (id.length < 2) return { ok: false, status: 400, error: "Use a name of at least two letters or numbers." };
  if (id === "primary" || users().some((u) => u.id === id || u.store === "mental-math-" + id)) return { ok: false, status: 409, error: "That name is already taken." };
  const store = open();
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await readIndex(store), { list } = cur;
    if (list.length >= LEARNERS.MAX) return { ok: false, status: 409, error: `Up to ${LEARNERS.MAX} learners can be created here.` };
    if (list.some((l) => l.id === id)) return { ok: false, status: 409, error: "That name is already taken." };
    const key = makeKey();
    const learner = { id, name: String(name).trim().slice(0, 40) || id, store: "mental-math-" + id, hash: sha(key), created: now };
    if (await writeIndex(store, [...list, learner], cur)) return { ok: true, learner: { id, name: learner.name, created: now }, key };
  }
  return { ok: false, status: 409, error: "Another change happened at the same time. Try again." };
}

/** Remove a learner's key. Their saved progress is left in place: creating the same name again gives a new key and the same progress. */
export async function removeLearner(id) {
  const store = open();
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await readIndex(store), { list } = cur;
    if (!list.some((l) => l.id === id)) return { ok: false, status: 404, error: "No such learner." };
    if (await writeIndex(store, list.filter((l) => l.id !== id), cur)) return { ok: true };
  }
  return { ok: false, status: 409, error: "Another change happened at the same time. Try again." };
}
