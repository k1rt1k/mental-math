import { getStore } from "@netlify/blobs";
import { authenticate, lockedText } from "../lib/gate.mjs";
import { allLearners } from "../lib/learners.mjs";
import { BOARD, join, leave, postScore, readBoard, validDay } from "../lib/board.mjs";

const J = (o, status = 200, extra = {}) => Response.json(o, { status, headers: { "cache-control": "no-store", ...extra } });

// GET ?day=YYYY-MM-DD   the board (only for learners who joined)       PUT {name}   join or rename
// POST {day,pts,n,ok}   report today's Daily score (ignored unless joined)   DELETE   leave and remove the stored scores
export default async (req) => {
  const g = await authenticate(req);
  if (g.denied === "locked") return J({ error: lockedText(g.retryAfter) }, 429, { "retry-after": String(g.retryAfter) });
  if (g.denied) return J({ error: "unauthorized" }, 401);
  const who = { id: g.who.id }, store = getStore({ name: BOARD.STORE, consistency: "strong" });
  let body = {};
  if (req.method === "PUT" || req.method === "POST") { try { body = (await req.json()) || {}; } catch { return J({ error: "bad request" }, 400); } }
  try {
    if (req.method === "GET") {
      const day = new URL(req.url).searchParams.get("day") || new Date().toISOString().slice(0, 10);
      if (!validDay(day)) return J({ error: "That day is not accepted." }, 400);
      return J(await readBoard(store, who, day, new Set((await allLearners()).map((l) => l.id))));
    }
    const r = req.method === "PUT" ? await join(store, who, body.name) : req.method === "POST" ? await postScore(store, who, body) : req.method === "DELETE" ? await leave(store, who) : null;
    if (!r) return J({ error: "method not allowed" }, 405);
    return r.ok ? J(r) : J({ error: r.error }, r.status);
  } catch { return J({ error: "The board is unavailable right now." }, 503); }
};

export const config = { path: "/api/board" };
