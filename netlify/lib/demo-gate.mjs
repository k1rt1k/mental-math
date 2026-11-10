import { createHash } from "node:crypto";

// Sample-mode Gemini. Visitors in ?demo=1 have no sync password, so they get a small, separate allowance instead of a key:
// DEMO_PER_IP calls per address per Pacific day, and DEMO_GLOBAL calls per day across every visitor, so a crowd of
// demo users can never use up the learners' share of the 300-call budget. Raise or lower these two numbers freely.
// The counters are best effort (a plain read then write, not a compare-and-swap) and the check fails CLOSED:
// if the counter store is unreachable the visitor gets the local guide, never an unmetered Gemini call.
export const DEMO_LIMIT = { DEMO_PER_IP: 25, DEMO_GLOBAL: 100, STORE: "mental-math-demo" };

export const pacificDay = (t = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(t));

let testStore = null;
export const setDemoStoreForTests = (s) => { testStore = s; };
// Loaded on first use, like ai-quota.mjs, so importing this file never needs the Blobs package.
const open = async () => testStore || (await import("@netlify/blobs")).getStore(DEMO_LIMIT.STORE);

/** Who is asking, as a hash (same header order as throttle.mjs). */
export const clientKey = (req) => "ip-" + createHash("sha256").update(req.headers.get("x-nf-client-connection-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown").digest("hex").slice(0, 32);

/** True when the request asks for sample mode and carries no key at all (a wrong key is never treated as demo). */
export const isDemoRequest = (req) => req.headers.get("x-mental-math-demo") === "1" && !req.headers.get("x-sync-key");

/** Counts one sample-mode call. Returns { ok: true } or { ok: false, why: 'ip' | 'global' | 'store' }. */
export async function takeDemoCall(req, now = Date.now()) {
  try {
    const store = await open(), day = pacificDay(now);
    const ipKey = `ip/${day}/${clientKey(req)}`, allKey = `all/${day}`;
    const [ip, all] = await Promise.all([store.get(ipKey, { type: "json" }), store.get(allKey, { type: "json" })]);
    const ipN = Number(ip?.n) || 0, allN = Number(all?.n) || 0;
    if (ipN >= DEMO_LIMIT.DEMO_PER_IP) return { ok: false, why: "ip" };
    if (allN >= DEMO_LIMIT.DEMO_GLOBAL) return { ok: false, why: "global" };
    await Promise.all([store.setJSON(ipKey, { n: ipN + 1 }), store.setJSON(allKey, { n: allN + 1 })]);
    return { ok: true };
  } catch { return { ok: false, why: "store" }; }
}

export const demoLimitText = (why) => why === "ip"
  ? "You have used today’s sample-mode Gemini allowance from this connection. The built-in local guide is shown; Gemini comes back tomorrow, or right away with a sync password."
  : why === "global"
    ? "Sample-mode Gemini has reached its daily limit for all visitors. The built-in local guide is shown; it resets tomorrow."
    : "Sample-mode Gemini could not check its allowance just now, so the built-in local guide is shown. Try again in a minute.";
