// One place that builds what the AI is told about the guided Learn paths, so every path screen asks from the same measured facts.
// Pure (no DOM, no network): the screens pass these objects to showAiSheet. The server treats them as data, never as instructions,
// and the same objects feed the offline fallbacks in aiLocal.js.
import { S } from './state.js';
import { IDS, SK, how } from './engine.js';
import { TRICKS } from './tricks.js';
import { PATHS, KINDS, PATH_STAGES, RET, progress, nextUp } from './paths.js';

/**
 * The learner's measured accuracy and speed on the question patterns of one stage. The mixed stages have no pattern list,
 * so they use the skill's own weakest patterns instead. Only patterns with 3+ tries count, weakest first.
 */
export function stagePatterns(k, st) {
  const pre = SK[k].n + ' · ', want = st && st.p ? st.p.map((p) => pre + p) : null;
  return Object.entries(S.pat || {})
    .filter(([n, o]) => o && o.n >= 3 && (want ? want.includes(n) : n.startsWith(pre)))
    .map(([n, o]) => ({ pattern: n.slice(pre.length), tries: o.n, accuracyPct: Math.round((100 * o.ok) / o.n), speedVsPar: o.ok ? +(o.r / o.ok).toFixed(2) : null }))
    .sort((a, b) => a.accuracyPct - b.accuracyPct).slice(0, 4);
}

/** The lesson the learner is reading: its own text and verified worked examples, plus how they do on this stage's patterns. Null for an unknown stage. */
export function lessonAiContext(k, si) {
  const st = PATHS[k] && PATHS[k].stages[si];
  if (!st) return null;
  const mine = stagePatterns(k, st);
  return {
    skill: SK[k].n, stage: `Stage ${si + 1} of ${PATH_STAGES}: ${KINDS[si]}`, title: st.t, goal: st.g, rule: st.key,
    teach: st.teach.slice(),
    examples: st.demo.map((d) => `${d.q} = ${d.a}: ${d.st.join('; ')}`),
    tricks: st.tr.map((id) => TRICKS.find((t) => t.id == id)).filter(Boolean).map((t) => ({ title: t.title, rule: t.rule })),
    ...(mine.length ? { yourPatterns: mine } : {}),
  };
}

const RUN_LABEL = { place: 'Level check (placement quiz)', practise: 'Practice', check: 'Stage check', test: 'Timed mastery test' };

/**
 * A finished path run (practice, check, test, retention check or placement quiz), as the `pathrun` action expects it.
 * rows are PathSession rows ({ q, a, ty, d, pt, ok, first, hinted, tm, par }); v is the judged verdict (absent for a placement);
 * place is { from, to, cleared } for a placement. Misses carry the app's own worked method so the model reuses it.
 */
export function runAiContext({ k, si, mode, ret, v = null, rows = [], place = null }) {
  const stage = Math.max(0, Math.min(si, PATH_STAGES - 1)), st = PATHS[k].stages[stage];
  const label = mode == 'retain' ? (ret == 0 ? 'Next-day retention check' : 'One-week retention check') : RUN_LABEL[mode] || 'Run';
  const good = rows.filter((x) => x.ok && x.first && !x.hinted), mine = stagePatterns(k, st);
  const method = (x) => { try { return String(how({ q: x.q, a: x.a, sk: k, d: x.d, pt: x.pt }) || '').slice(0, 170); } catch { return ''; } };
  const missed = rows.filter((x) => !x.ok).slice(0, 8).map((x, i) => ({ q: x.q, answer: x.a, typed: x.ty ?? '', ...(i < 4 ? { method: method(x) } : {}) }));
  const slowest = mode == 'practise' ? [] : good.filter((x) => x.par > 0).map((x) => ({ q: x.q, sec: +x.tm.toFixed(1), parSec: +x.par.toFixed(1), ratio: x.tm / x.par }))
    .sort((a, b) => b.ratio - a.ratio).slice(0, 3).map(({ ratio, ...o }) => o);
  let verdict;
  if (mode == 'practise') verdict = 'practice, no pass mark';
  else if (place) {
    const at = Math.min(place.to, PATH_STAGES - 1) + 1;
    verdict = place.cleared ? `placement cleared ${place.cleared} stage${place.cleared == 1 ? '' : 's'}; the path opens at stage ${at}` : `placement cleared nothing; stage ${at} is the right place to start`;
  } else verdict = v && v.pass ? 'passed' : 'not passed';
  return {
    skill: SK[k].n, run: label,
    stage: place ? `placement quiz, started at stage ${place.from + 1}` : `Stage ${stage + 1} of ${PATH_STAGES}: ${KINDS[stage]}`,
    stageTitle: st.t, stageRule: st.key, verdict,
    firstTryCorrect: v ? v.correct : good.length, questions: v ? v.n : rows.length, needed: v && v.need ? v.need : null,
    paceVsPar: mode != 'practise' && v && v.pace ? v.pace : null, paceLimit: v && v.paceLimit ? v.paceLimit : null,
    failedOn: v && !v.pass && mode != 'practise' ? v.reason : '',
    hintedAnswers: rows.filter((x) => x.hinted).length, slippedThenRight: rows.filter((x) => x.ok && !x.first && !x.hinted).length,
    missed, slowest, ...(mine.length ? { yourPatterns: mine } : {}),
  };
}

/** Every skill's path as the `nextpath` action expects it: where the learner stands on each, so the model can rank them. */
export function pathsAiContext() {
  return {
    paths: IDS.filter((k) => PATHS[k]).map((k) => {
      const p = progress(k), s = S.sk[k], weak = stagePatterns(k, null)[0];
      const kind = p.mastered ? 'mastered' : p.dueRet >= 0 ? 'ready' : p.assessed ? 'assessed' : p.started ? 'continue' : 'start';
      return {
        skill: SK[k].n, kind, stagesPassed: p.stages.filter((x) => x.done).length, stage: p.cur >= 0 ? p.cur + 1 : null,
        rating: Math.round(s.lv * 100), accuracyPct: s.n ? Math.round(s.acc * 100) : null,
        ...(kind == 'ready' ? { check: RET[p.dueRet].label } : {}),
        ...(weak ? { weakestPattern: `${weak.pattern} ${weak.accuracyPct}% over ${weak.tries} tries` } : {}),
      };
    }),
  };
}

/**
 * Where the learner stands on the guided paths, as two short strings for every AI request: the paths they have started or finished,
 * and the step the app itself would suggest next. Lets the Coach tie advice to the real next step instead of generic practice.
 */
export function pathsSummary() {
  const bits = [];
  for (const k of IDS) {
    if (!PATHS[k]) continue;
    const p = progress(k);
    if (p.mastered) bits.push(`${SK[k].n}: mastered`);
    else if (p.dueRet >= 0) bits.push(`${SK[k].n}: ${RET[p.dueRet].label.toLowerCase()} ready`);
    else if (p.assessed) bits.push(`${SK[k].n}: assessed, retention checks to come`);
    else if (p.started) bits.push(`${SK[k].n}: stage ${p.cur + 1} of ${PATH_STAGES} (${KINDS[p.cur]})`);
  }
  const nu = nextUp(null), next = nu ? (nu.kind == 'retain' ? `${SK[nu.k].n} ${RET[nu.ret].label.toLowerCase()}` : `${SK[nu.k].n} stage ${Math.max(0, nu.p.cur) + 1} (${PATHS[nu.k].stages[Math.max(0, nu.p.cur)].t})`) : '';
  return { paths: bits.slice(0, 8).join('; ').slice(0, 600), pathNext: next };
}

/** Skill ids named in an AI reply, in the order they first appear (bold names win), so the sheet can offer an "Open path" button for each. */
export function skillsInReply(text, limit = 2) {
  const t = String(text || '');
  const find = (bold) => IDS.filter((k) => PATHS[k]).map((k) => [t.indexOf((bold ? '**' : '') + SK[k].n), k]).filter(([at]) => at >= 0);
  const hits = find(true).length ? find(true) : find(false);
  return hits.sort((a, b) => a[0] - b[0]).slice(0, limit).map((x) => x[1]);
}
