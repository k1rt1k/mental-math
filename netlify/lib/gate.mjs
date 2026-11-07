import { resolveEnvUser } from "./auth.mjs";
import { findLearner } from "./learners.mjs";
import { lockedFor, recordFail, recordOk } from "./throttle.mjs";

/**
 * The one place a request's sync key is checked, for /api/sync, /api/ai, /api/push and /api/keys.
 *   { who }                       the learner this key belongs to
 *   { who: null }                 no key was sent and `optional` is set (an anonymous reminder device)
 *   { denied: 'key' }             a missing or wrong key
 *   { denied: 'locked', retryAfter }  too many wrong keys from this address lately: refused without looking at the key
 * A request with no key at all is never counted as a guess, so an unconfigured device cannot lock anyone out.
 */
export async function authenticate(req, { optional = false } = {}) {
  const sent = String(req.headers.get("x-sync-key") || "");
  if (!sent) return optional ? { who: null } : { denied: "key" };
  const wait = await lockedFor(req);
  if (wait) return { denied: "locked", retryAfter: wait };
  const who = resolveEnvUser(sent) || (await findLearner(sent));
  if (!who) {
    const lock = await recordFail(req);
    return lock ? { denied: "locked", retryAfter: lock } : { denied: "key" };
  }
  await recordOk(req);
  return { who };
}

/** The 429 body shared by every endpoint (plain text; callers that speak JSON wrap it themselves). */
export const lockedText = (retryAfter) => `Too many wrong keys. Try again in ${Math.max(1, Math.ceil(retryAfter / 60))} min.`;
