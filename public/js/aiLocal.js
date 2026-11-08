// Pure helpers shared by the browser and the Netlify function: no DOM, no network, no imports.
// They are the app's own deterministic arithmetic about a learner's answers, so the AI never has to guess it
// and the offline fallbacks can still say something real.

/**
 * Plain-language, app-computed description of how a typed answer differs from the right one.
 * The model is told to use ONLY this, so it never has to guess (or mis-subtract) why an answer was wrong.
 */
export function describeGap(correct, typed) {
  if (typed === '' || typed === null || typed === undefined) return 'skipped or timed out';
  const typedClean = String(typed).trim().replace(/(?<=\d)[,\s](?=\d{3}\b)/g, '');
  const c = Number(String(correct).trim().replace(/(?<=\d)[,\s](?=\d{3}\b)/g, '')), t = Number(typedClean);
  if (!Number.isFinite(c) || !Number.isFinite(t) || typedClean === '') return null;
  if (t === c) return 'matches the correct answer';
  const d = t - c, ad = Math.abs(d);
  const out = [`${t} is ${ad} ${d > 0 ? 'above' : 'below'} ${c}`];
  const place = { 1: 'ones', 10: 'tens', 100: 'hundreds', 1000: 'thousands' };
  if (place[ad]) out.push(`exactly one ${place[ad]} unit away`);
  const cs = String(Math.abs(c)), ts = String(Math.abs(t));
  if (c >= 0 && t >= 0 && cs.length === ts.length) {
    const diff = [...cs].map((ch, i) => (ch === ts[i] ? -1 : i)).filter((i) => i >= 0);
    if (diff.length === 1) {
      const names = ['ones', 'tens', 'hundreds', 'thousands', 'ten-thousands'];
      const i = diff[0], pos = cs.length - 1 - i;
      out.push(`only the ${names[pos] || 'leading'} digit differs (${ts[i]} instead of ${cs[i]})`);
    } else if ([...cs].sort().join('') === [...ts].sort().join('')) out.push('same digits in a different order');
  }
  if (c !== 0 && t === -c) out.push('the right size with the opposite sign (a sign slip)');
  if (c !== 0 && (t === c * 10 || c === t * 10)) out.push('a factor of 10 away (place-value shift)');
  return out.join('; ');
}


const str = (v, n = 80) => String(v ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, n);
const pct = (x) => (Number.isFinite(+x) ? Math.round(+x) : null);

/** One missed question as a bullet: the question, what was typed, the app-computed gap and the app-verified method. */
function missLine(m) {
  const q = str(m.q, 60), a = str(m.answer ?? m.a, 30), ty = m.typed ?? m.ty ?? '';
  const g = describeGap(a, ty);
  return `- **${q} = ${a}**${ty !== '' ? ` · typed ${str(ty, 20)}${g ? ` (${g})` : ''}` : ' · skipped or timed out'}${m.method ? `\n  - Method: ${str(m.method, 200)}` : ''}`;
}

/**
 * What the app can say about a piece of the learner's data WITHOUT an AI. Used when Gemini is unavailable.
 * Everything here is measured or computed, never a guess about why a mistake happened.
 * `context` is the same object the AI sheets send (debrief: missed/slowest; mistakes: items).
 */
export function localInsight(action, summary = {}, context = null) {
  if (['skill', 'facts', 'nexttrick', 'session'].includes(action)) return localInsight2(action, summary, context);
  if (['lesson', 'pathrun', 'nextpath', 'week'].includes(action)) return localInsight3(action, summary, context);
  const ctx = context && typeof context === 'object' ? context : {};
  const head = (t) => `### ${t} · local view (Gemini unavailable)\n\n`;
  const foot = '\n\nBuilt by the app from your recorded data. No AI was used, so there is no pattern diagnosis.';
  if (action === 'debrief') {
    const miss = Array.isArray(ctx.missed) ? ctx.missed.slice(0, 5) : [];
    const slow = Array.isArray(ctx.slowest) ? ctx.slowest.slice(0, 3) : [];
    if (!Number.isFinite(+ctx.questions)) return null;
    const lines = [`- **Score:** ${ctx.correct ?? '?'} of ${ctx.questions} correct (${pct(ctx.accuracyPct) ?? '?'}%)${ctx.avgSecPerAnswer ? `, ${ctx.avgSecPerAnswer} s average` : ''}${ctx.bestStreak ? `, best streak ${ctx.bestStreak}` : ''}.`];
    if (Array.isArray(ctx.ratingChanges) && ctx.ratingChanges.length) lines.push('- **Ratings:** ' + ctx.ratingChanges.slice(0, 4).map((r) => `${str(r.skill, 30)} ${r.change > 0 ? '+' : ''}${r.change}`).join(', ') + '.');
    if (miss.length) lines.push(`- **Missed:**\n${miss.map(missLine).map((l) => '  ' + l.replace(/\n/g, '\n  ')).join('\n')}`);
    if (slow.length) lines.push('- **Slowest:** ' + slow.map((s) => `${str(s.q, 40)} (${s.sec} s)`).join(', ') + '.');
    const shared = sharedGap(miss);
    if (shared) lines.push(`- **Shared size of error:** ${shared}.`);
    return head('Session recap') + lines.join('\n') + foot;
  }
  if (action === 'mistakes') {
    const items = (Array.isArray(ctx.items) ? ctx.items : []).filter((m) => m && m.q != null).slice(0, 6);
    if (!items.length) return null;
    const shared = sharedGap(items);
    return head('Your recent misses') + (shared ? `**${shared}.**\n\n` : '') + items.map(missLine).join('\n') + foot;
  }
  if (action === 'progress') {
    const rows = Array.isArray(ctx.recent) ? ctx.recent.filter((r) => r && Number.isFinite(+r.accuracyPct)) : [];
    if (rows.length < 2) return null;
    const f = rows[0], l = rows[rows.length - 1];
    const lines = [`- **Accuracy:** ${pct(f.accuracyPct)}% in your first listed session, ${pct(l.accuracyPct)}% in your latest (${rows.length} sessions listed).`];
    if (f.avgSec && l.avgSec) lines.push(`- **Speed:** ${f.avgSec} s per answer first, ${l.avgSec} s latest.`);
    if (summary.weaknesses) lines.push(`- **Lowest area:** ${str(summary.weaknesses, 120)}.`);
    return head('Progress') + lines.join('\n') + foot;
  }
  return null;
}

/** "3 of 4 wrong answers are exactly 10 away", or '' when the misses share nothing measurable. */
export function sharedGap(items) {
  const ds = (items || []).map((m) => Number(String(m.typed ?? m.ty ?? '').trim()) - Number(m.answer ?? m.a)).filter((d) => Number.isFinite(d) && d !== 0);
  if (ds.length < 2) return '';
  const by = new Map();
  ds.forEach((d) => by.set(Math.abs(d), (by.get(Math.abs(d)) || 0) + 1));
  const [size, n] = [...by.entries()].sort((x, y) => y[1] - x[1])[0];
  return n >= 2 ? `${n} of ${ds.length} wrong answers are exactly ${size} away from the correct answer` : '';
}

/** Best drill target from pattern stats {key: {n, ok, r}}: lowest accuracy with enough tries, slower on ties. Null when nothing is weak. */
export function focusPattern(pat) {
  const rows = Object.entries(pat || {}).filter(([, o]) => o && o.n >= 5)
    .map(([k, o]) => ({ k, n: o.n, acc: Math.round((100 * o.ok) / o.n), sp: o.ok ? +(o.r / o.ok).toFixed(2) : 0 }))
    .filter((p) => p.acc < 90 || p.sp > 1.2)
    .sort((a, b) => a.acc - b.acc || b.sp - a.sp);
  return rows[0] || null;
}

/**
 * A verified decomposition for a times-table fact (2..12), or '' when no simple one applies.
 * Every number is computed here, so the line is always a true equation: 7 × 8 = 7 × 10 − 7 × 2 = 70 − 14 = 56.
 */
export function factDecomp(a, b) {
  a = Number(a); b = Number(b);
  if (![a, b].every((n) => Number.isInteger(n) && n >= 2 && n <= 12)) return '';
  const s = Math.min(a, b), l = Math.max(a, b), p = a * b;
  if (l === 10) return `${s} × 10 = ${p}`;
  if (l > 10) return `${s} × ${l} = ${s} × 10 + ${s} × ${l - 10} = ${s * 10} + ${s * (l - 10)} = ${p}`;
  if (l >= 8) return `${s} × ${l} = ${s} × 10 − ${s} × ${10 - l} = ${s * 10} − ${s * (10 - l)} = ${p}`;
  if (l >= 6) return `${s} × ${l} = ${s} × 5 + ${s} × ${l - 5} = ${s * 5} + ${s * (l - 5)} = ${p}`;
  if (l === 5) return `${s} × 5 = ${s} × 10 ÷ 2 = ${s * 10} ÷ 2 = ${p}`;
  return '';
}

/** Local reads for the per-skill, weak-facts, next-trick and past-session sheets: only measured numbers, no guessed causes. */
export function localInsight2(action, summary = {}, context = null) {
  const ctx = context && typeof context === 'object' ? context : {};
  const head = (t) => `### ${t} · local view (Gemini unavailable)\n\n`;
  const foot = '\n\nBuilt by the app from your recorded data. No AI was used, so there is no pattern diagnosis.';
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
  const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v);
  if (action === 'skill') {
    if (!ctx.skill) return null;
    const lines = [`- **${str(ctx.skill, 40)}:** rating ${num(ctx.rating) ?? '?'}${num(ctx.change7d) != null ? ` (${ctx.change7d > 0 ? '+' : ''}${ctx.change7d} in 7 days)` : ''}, ${num(ctx.accuracyPct) ?? '?'}% accurate${num(ctx.speedVsPar) != null ? `, ${ctx.speedVsPar}× par time` : ''}.`];
    const pats = arr(ctx.weakPatterns).slice(0, 3);
    if (pats.length) lines.push('- **Weakest patterns:** ' + pats.map((x) => `${str(x.pattern, 40)} (${num(x.accuracyPct) ?? '?'}% over ${num(x.tries) ?? '?'} tries)`).join('; ') + '.');
    const items = arr(ctx.items).slice(0, 4);
    if (items.length) {
      const shared = sharedGap(items);
      if (shared) lines.push(`- **Shared size of error:** ${shared}.`);
      lines.push('- **Recent misses:** ' + items.map((m) => `${str(m.q, 40)} = ${str(m.answer ?? m.a, 20)}`).join('; ') + '.');
    }
    return head('Skill read') + lines.join('\n') + foot;
  }
  if (action === 'facts') {
    const rows = arr(ctx.facts).slice(0, 5);
    if (!rows.length) return null;
    const lines = rows.map((f) => {
      const [a, b] = String(f.fact || '').split('×').map((x) => parseInt(x, 10));
      const d = factDecomp(a, b);
      return `- **${str(f.fact, 12)} = ${a && b ? a * b : str(f.product, 6)}** · ${num(f.accuracyPct) ?? '?'}% over ${num(f.tries) ?? '?'} tries${d ? `\n  - Hook: ${d}` : ''}`;
    });
    return head('Weakest facts') + lines.join('\n') + '\n\nThe hooks are computed by the app; each is a true equation.' + foot;
  }
  if (action === 'nexttrick') {
    const rows = arr(ctx.tricks).filter((t) => t.title);
    if (!rows.length) return null;
    const rated = (t) => num((ctx.skillRatings || {})[t.skill]) ?? 999;
    const rank = (t) => (num(t.tries) > 0 ? (num(t.tries) >= 8 ? num(t.accuracyPct) ?? 100 : 90) : 80) + rated(t) / 100;
    const pick = rows.filter((t) => !(num(t.tries) >= 15 && num(t.accuracyPct) >= 90)).sort((x, y) => rank(x) - rank(y)).slice(0, 2);
    if (!pick.length) return head('Next trick') + 'Every trick you have practised is at 90% or better. Pick any new one from the list.' + foot;
    return head('Next trick') + pick.map((t) => `- **${str(t.title, 60)}** · ${str(t.skill, 30)}${num(t.tries) ? `: ${num(t.accuracyPct) ?? '?'}% over ${t.tries} tries` : ': not practised yet'}`).join('\n') + foot;
  }
  if (action === 'session') {
    if (!Number.isFinite(+ctx.answers)) return null;
    const lines = [`- **Score:** ${ctx.correct ?? '?'} of ${ctx.answers} correct (${num(ctx.accuracyPct) ?? '?'}%)${ctx.avgSec ? `, ${ctx.avgSec} s average` : ''}${num(ctx.ptsPerMin) != null ? `, ${ctx.ptsPerMin} pts/min` : ''}.`];
    if (num(ctx.vsPrevSameKind) != null) lines.push(`- **Against the previous same-kind session:** ${ctx.vsPrevSameKind > 0 ? '+' : ''}${ctx.vsPrevSameKind} pts/min.`);
    const sk = arr(ctx.perSkill).filter((x) => num(x.tried) >= 3).sort((x, y) => (x.correct / x.tried) - (y.correct / y.tried));
    if (sk.length >= 2) lines.push(`- **Weakest skill here:** ${str(sk[0].skill, 30)} (${sk[0].correct}/${sk[0].tried}). **Strongest:** ${str(sk[sk.length - 1].skill, 30)} (${sk[sk.length - 1].correct}/${sk[sk.length - 1].tried}).`);
    else if (arr(ctx.perSkill).length) lines.push('- Too few answers per skill in this session to rank them.');
    return head('Session recap') + lines.join('\n') + foot;
  }
  return null;
}

/**
 * Local reads for the guided-path lesson, a finished path run, the next-path pick and the week sheet.
 * A lesson falls back to the app's own rule and worked examples; the rest are measured numbers only, never a guessed cause.
 */
export function localInsight3(action, summary = {}, context = null) {
  const ctx = context && typeof context === 'object' ? context : {};
  const head = (t) => `### ${t} · local view (Gemini unavailable)\n\n`;
  const foot = '\n\nBuilt by the app from your recorded data. No AI was used, so there is no pattern diagnosis.';
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
  const strs = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []);
  const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? null : +v);
  const sgn = (d) => (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d);
  if (action === 'lesson') {
    if (!ctx.rule && !ctx.title) return null;
    const ex = strs(ctx.examples).slice(0, 2);
    const lines = [];
    if (ctx.title) lines.push(`**${str(ctx.title, 80)}**${ctx.goal ? ': ' + str(ctx.goal, 120) : ''}`);
    if (ctx.rule) lines.push(`**Rule:** ${str(ctx.rule, 120)}`);
    if (ex.length) lines.push('**Worked examples from the lesson:**\n' + ex.map((e) => `- ${str(e, 240)}`).join('\n'));
    return head('Stage lesson') + lines.join('\n\n') + '\n\nThese are the lesson’s own examples, written and checked by the app. No AI was used, so this is not a new explanation.';
  }
  if (action === 'pathrun') {
    if (!Number.isFinite(+ctx.questions)) return null;
    const lines = [`- **${str(ctx.run || 'Run', 40)}:** ${num(ctx.firstTryCorrect) ?? '?'} of ${ctx.questions} first-try correct${num(ctx.needed) ? ` (${ctx.needed} needed)` : ''}${num(ctx.paceVsPar) != null ? `, pace ${ctx.paceVsPar}× par${num(ctx.paceLimit) ? ` (limit ${ctx.paceLimit}×)` : ''}` : ''}.${ctx.verdict ? ' Verdict: ' + str(ctx.verdict, 60) + '.' : ''}`];
    const help = [num(ctx.hintedAnswers) ? `${ctx.hintedAnswers} with a hint` : '', num(ctx.slippedThenRight) ? `${ctx.slippedThenRight} corrected after a slip` : ''].filter(Boolean);
    if (help.length) lines.push('- **Not counted as first try:** ' + help.join(', ') + '.');
    const miss = arr(ctx.missed).slice(0, 5);
    if (miss.length) lines.push(`- **Missed:**\n${miss.map(missLine).map((l) => '  ' + l.replace(/\n/g, '\n  ')).join('\n')}`);
    const shared = sharedGap(miss);
    if (shared) lines.push(`- **Shared size of error:** ${shared}.`);
    const slow = arr(ctx.slowest).slice(0, 3);
    if (slow.length) lines.push('- **Slowest:** ' + slow.map((x) => `${str(x.q, 40)} (${x.sec} s${num(x.parSec) ? `, par ${x.parSec} s` : ''})`).join(', ') + '.');
    if (ctx.stageRule) lines.push(`- **Stage rule:** ${str(ctx.stageRule, 120)}`);
    return head('Run review') + lines.join('\n') + foot;
  }
  if (action === 'nextpath') {
    const rows = arr(ctx.paths).filter((p) => p.skill && p.kind);
    if (!rows.length) return null;
    const order = { ready: 0, continue: 1, start: 2 };
    const pick = rows.filter((p) => p.kind in order).sort((a, b) => order[a.kind] - order[b.kind] || (num(a.rating) ?? 999) - (num(b.rating) ?? 999)).slice(0, 2);
    if (!pick.length) return head('Next path') + 'Every path is mastered or waiting for its retention checks, so there is nothing new to start.' + foot;
    const why = (p) => (p.kind === 'ready' ? 'a retention check is ready now' : p.kind === 'continue' ? `in progress, stage ${num(p.stage) ?? '?'} of 5` : `not started${num(p.rating) != null ? ` · rating ${p.rating}` : ''}`);
    return head('Next path') + pick.map((p) => `- **${str(p.skill, 40)}** · ${why(p)}`).join('\n') + '\n\nOrdered by the app: a ready retention check, then a path in progress, then the lowest-rated skill not yet started.' + foot;
  }
  if (action === 'week') {
    if (!Number.isFinite(+ctx.answers) || !num(ctx.sessions)) return null;
    const lines = [`- **This week:** ${num(ctx.daysPracticed) ?? '?'} of 7 days, ${ctx.sessions} session${ctx.sessions == 1 ? '' : 's'}, ${ctx.answers} answers, ${num(ctx.accuracyPct) ?? '?'}% accurate, ${num(ctx.minutes) ?? '?'} min.`];
    const lw = ctx.lastWeek && typeof ctx.lastWeek === 'object' ? ctx.lastWeek : null;
    if (lw && num(lw.sessions)) lines.push(`- **Against last week:** answers ${sgn(ctx.answers - lw.answers)}, accuracy ${sgn(ctx.accuracyPct - lw.accuracyPct)} pts, minutes ${sgn(ctx.minutes - lw.minutes)}.`);
    else lines.push('- **Against last week:** nothing to compare yet.');
    if (ctx.biggestGain && ctx.biggestGain.skill) lines.push(`- **Biggest gain:** ${str(ctx.biggestGain.skill, 30)} +${num(ctx.biggestGain.by) ?? '?'}.`);
    return head('Your week') + lines.join('\n') + foot;
  }
  return null;
}
