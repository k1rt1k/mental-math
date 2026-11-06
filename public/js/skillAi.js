// One place that builds the per-skill AI read, so Home (skill card) and Progress (weakness map) ask exactly the same question.
import { S } from './state.js';
import { SK } from './engine.js';
import { lvAgo } from './stats.js';
import { showAiSheet } from './ai.js';
import { start } from './views/play.js';

/** Everything the app measured about one skill, in the shape the `skill` AI action expects. Null for an unknown skill. */
export function skillAiContext(k) {
  const s = S.sk[k];
  if (!s || !SK[k]) return null;
  const pre = SK[k].n + ' · ';
  const weakPatterns = Object.entries(S.pat || {})
    .filter(([n, o]) => n.startsWith(pre) && o && o.n >= 3)
    .map(([n, o]) => ({ pattern: n.slice(pre.length), tries: o.n, accuracyPct: Math.round((100 * o.ok) / o.n), speedVsPar: o.ok ? +(o.r / o.ok).toFixed(2) : null }))
    .sort((a, b) => a.accuracyPct - b.accuracyPct).slice(0, 5);
  const items = Object.values(S.weak || {}).filter((w) => w.sk == k).slice(0, 6).map((w) => ({ q: w.q, answer: w.a, typed: w.ty ?? '', pattern: w.pt || '' }));
  return { skill: SK[k].n, rating: Math.round(s.lv * 100), change7d: Math.round((s.lv - lvAgo(k, 7)) * 100), accuracyPct: Math.round(s.acc * 100), speedVsPar: s.n ? +s.spd.toFixed(2) : null, answers: s.n, weakPatterns, items };
}

/** Open the AI sheet for one skill, with one-tap drill and review buttons. */
export function askSkillAi(k) {
  const context = skillAiContext(k);
  if (!context) return;
  return showAiSheet({
    title: SK[k].n,
    action: 'skill',
    context,
    extra: () => [{ label: `Drill ${SK[k].n}`, run: () => start(undefined, { only: k, patt: undefined }) }, ...(context.items.length ? [{ label: 'Review missed', run: () => start('review') }] : [])],
  });
}
