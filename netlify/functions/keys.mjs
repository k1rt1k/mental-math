import { authenticate, lockedText } from "../lib/gate.mjs";
import { addLearner, listLearners, removeLearner, LEARNERS } from "../lib/learners.mjs";
import { MIN_KEY_LENGTH } from "../lib/auth.mjs";

const J = (o, status = 200, extra = {}) => Response.json(o, { status, headers: { "cache-control": "no-store", ...extra } });

// Create and remove learner keys from inside the app. Only the administrator (the SYNC_KEY environment variable) may do it, so a
// learner who is merely signed in cannot hand out access. The server generates every key; the browser never picks one.
export default async (req) => {
  const g = await authenticate(req);
  if (g.denied === "locked") return J({ error: lockedText(g.retryAfter) }, 429, { "retry-after": String(g.retryAfter) });
  if (g.denied) return J({ error: "unauthorized" }, 401);
  if (!g.who.admin) {
    if (req.method === "GET") return J({ admin: false });          // lets the app say "only the main account can do this" instead of showing an error
    return J({ error: "Only the main account can manage learners." }, 403);
  }

  if (req.method === "GET") return J({ admin: true, learners: await listLearners(), max: LEARNERS.MAX, minKeyLength: MIN_KEY_LENGTH });

  if (req.method === "POST") {
    let body = null;
    try { body = await req.json(); } catch { /* handled below */ }
    const r = await addLearner(body && body.name);
    if (!r.ok) return J({ error: r.error }, r.status);
    return J({ ok: true, learner: r.learner, key: r.key }, 201);   // the only time the key exists in readable form
  }

  if (req.method === "DELETE") {
    const id = new URL(req.url).searchParams.get("id") || "";
    const r = await removeLearner(id);
    return r.ok ? J({ ok: true }) : J({ error: r.error }, r.status);
  }
  return J({ error: "method not allowed" }, 405);
};

export const config = { path: "/api/keys" };
