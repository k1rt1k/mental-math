import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { dueKind, message, localParts } from "../lib/pushlogic.mjs";
import { users, vapid, DEVICES } from "../lib/common.mjs";

// Runs every 10 minutes (Netlify scheduled function). For each person, sends a reminder to every device
// whose chosen time has arrived and who has not practised yet today. Expired subscriptions are removed.
export default async () => {
  if (!vapid()) return;
  const now = Date.now();
  for (const u of [...users(), { store: DEVICES.store }]) {
    const store = getStore({ name: u.store, consistency: "strong" });
    const l = await store.list({ prefix: "push-" }).catch(() => ({ blobs: [] }));
    for (const b of l.blobs) {
      const rec = await store.get(b.key, { type: "json" }).catch(() => null);
      if (!rec || !rec.sub) continue;
      const due = dueKind(rec, now);
      if (!due) continue;
      const kind = due.kind;
      const today = localParts(now, rec.tz).date;
      try {
        await webpush.sendNotification(rec.sub, JSON.stringify(message(kind, rec, now)), { TTL: 6 * 3600, urgency: "normal", topic: kind == "daily" ? "mm-daily" : "mm-streak" });
        await store.setJSON(b.key, kind == "daily" ? { ...rec, sent: { ...(rec.sent || {}), [due.slot]: today } } : { ...rec, sentS: today });
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) await store.delete(b.key).catch(() => {});
      }
    }
  }
};

export const config = { schedule: "*/10 * * * *" };
