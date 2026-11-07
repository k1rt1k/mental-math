import webpush from "web-push";
import { users } from "./auth.mjs";
export { users, resolveEnvUser } from "./auth.mjs";

/** Configure web-push from env vars. Returns { pub } or null when push is not set up. */
export const vapid = () => {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return null;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
  return { pub };
};

/** Reminders do not need an account: devices without a key live in one shared store (capped), with an unguessable subscription URL as their identity. */
export const DEVICES = { store: "mental-math-devices", cap: 400 };
