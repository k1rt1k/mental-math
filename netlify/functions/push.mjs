import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { timingSafeEqual, createHash } from "node:crypto";
import { cleanRec, message } from "../lib/pushlogic.mjs";
import { users, vapid, DEVICES } from "../lib/common.mjs";

const digest = (s) => createHash("sha256").update(String(s || "")).digest();
const same = (a, b) => timingSafeEqual(digest(a), digest(b));

const J = (o, status = 200) => Response.json(o, { status, headers: { "cache-control": "no-store" } });
const T = (msg, status) => new Response(msg, { status, headers: { "cache-control": "no-store" } });
const id = (endpoint) => "push-" + createHash("sha1").update(endpoint).digest("hex");

export default async (req) => {
  const url = new URL(req.url);
  // Public: the browser needs the public key to subscribe. Safe to share by design.
  if (req.method === "GET") { const v = vapid(); return v ? J({ key: v.pub }) : J({ error: "not configured" }, 501); }

  const sent = req.headers.get("x-sync-key");
  let who = null;
  for (const u of users()) if (same(sent, u.key) && !who) who = u;
  if (!who && sent) return T("unauthorized", 401);          // a wrong key is an error; no key means an anonymous device
  if (!who) who = { store: DEVICES.store, anon: true };
  if (!vapid()) return T("push not configured", 501);
  const store = getStore({ name: who.store, consistency: "strong" });

  let body = {};
  if (req.method !== "DELETE" || (req.headers.get("content-length") || "0") !== "0") { try { body = await req.json(); } catch { body = {}; } }
  const sub = body && body.sub;
  if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return T("bad subscription", 400);
  const k = id(sub.endpoint);

  if (req.method === "DELETE") { await store.delete(k).catch(() => {}); return J({ ok: true }); }

  if (req.method === "PUT") {
    // Cap stored subscriptions per person so the endpoint cannot be used to fill storage.
    const l = await store.list({ prefix: "push-" }).catch(() => ({ blobs: [] }));
    if (l.blobs.length >= (who.anon ? DEVICES.cap : 20) && !l.blobs.some((b) => b.key === k)) return T("too many devices", 429);
    const old = await store.get(k, { type: "json" }).catch(() => null);
    const rec = { ...cleanRec(body), sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, sent: old && old.sent ? old.sent : {}, sentS: old ? old.sentS : "", at: Date.now() };
    await store.setJSON(k, rec);
    return J({ ok: true });
  }

  if (req.method === "POST") {   // send a test notification to this device only
    const rec = { ...cleanRec(body) };
    try {
      await webpush.sendNotification(sub, JSON.stringify({ ...message("daily", { ...rec, due: 0 }), title: "Reminders are on", body: "You will get a nudge at the times you chose.", tag: "mm-test" }), { TTL: 3600 });
      return J({ ok: true });
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { await store.delete(k).catch(() => {}); return T("subscription expired", 410); }
      return T("send failed", 502);
    }
  }
  return T("method not allowed", 405);
};

export const config = { path: "/api/push" };
