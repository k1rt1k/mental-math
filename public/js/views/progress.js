import { S } from '../state.js';
import { IDS, SK, COL, rank } from '../engine.js';
import { avgLv } from '../state.js';
import { esc, ymd, pct, dayAgo } from '../util.js';
import { factClass, restInfo, weakFacts, ERRL, ctx, streak, week, lvAgo, weakestSkills, MS, zDef, zMD, msProgress, hourStats, masteryStats, retentionStats, RETENTION_MIN, modeLabel } from '../stats.js';
import { spark, bars, heatmap, heatWeeks, sessLabel } from '../charts.js';
import { register, A, go } from '../nav.js';
import { drill } from './home.js';
import { dialog, icon } from '../ui.js';
import { start } from './play.js';
import { showAiSheet } from '../ai.js';
import { askSkillAi } from '../skillAi.js';
import { ZDEF, zNorm } from '../engine.js';
import { ib, ibs } from '../info.js';
import { restChip } from '../rest.js';
import { weekCard } from '../weekly.js';
import './streak.js';
import './weeksheet.js';
const statB = (k) => ib('p.' + k);

let range = 40;   // sessions shown in trend charts
let tab = 'overview', more = 10;   // which part of the page is open; how many recent sessions are listed
let mode = 'all'; // which kind of session the trend charts use. Daily/Survival score differently, so mixing them skews pace
const MODES = [['all', 'All'], ['train', 'Train'], ['daily', 'Daily'], ['survival', 'Survival']];
const RANGES = [[20, 'Last 20'], [40, 'Last 40'], [100, 'Last 100']];
let fOpen = false;   // the Filters panel (session type and history length) is folded away until asked for
const inMode = (s) => s.m != 'flash' && (mode == 'all' || (mode == 'train' ? ['train', 'focus', 'zeta'].includes(s.m) : s.m == mode));
/** The previous session of the same kind and length, so "vs prev" compares like with like. */
const prevOf = (x) => { for (let i = S.sessions.indexOf(x) - 1; i >= 0; i--) { const y = S.sessions[i]; if (y.m == x.m && y.dur == x.dur) return y; } return null; };

function progress() {
  document.title = 'Progress · Mental Math';
  const c = ctx(), has = S.sessions.length > 0, ms = masteryStats(), rd = retentionStats();
  const ready = rd.cohort >= RETENTION_MIN;
  const retSub = ready
    ? `Initial accuracy ${Math.round(rd.initialRate * 100)}% · ${rd.cohort} question pairs`
    : rd.cohort || rd.pending
      ? `Collecting · ${rd.cohort} of ${RETENTION_MIN} pairs${rd.pending ? ` · ${rd.pending} waiting` : ''}`
      : 'Needs questions answered twice, 7 days apart';
  const L = S.sessions.filter(inMode).slice(-range), a = week(0, 7), b = week(7, 14);
  const dlt = (x, y, u = '') => !b.s ? '' : `<span class="${x >= y ? 'ok' : 'bad'}">${x >= y ? '▲' : '▼'}${Math.abs(Math.round(x - y))}${u}</span>`;
  if (!has) {
    document.querySelector('#main').innerHTML = `<div class="hd"><h1>Progress</h1></div><div class="card empty"><b>No sessions yet</b>Play a 2-minute session and your charts, ratings and weak spots will appear here.<div style="margin-top:14px"><button class="btn primary" data-go="home">Go practice</button></div></div>`;
    return;
  }
  const tr = S.sessions.filter((s) => s.m == 'train' && s.dur == 120);
  const wk = weakestSkills(2), dl7 = IDS.map((k) => [k, (S.sk[k].lv - lvAgo(k, 7)) * 100]).sort((x, y) => y[1] - x[1]);
  const cnt = {}; S.sessions.forEach((s) => (cnt[ymd(s.t)] = (cnt[ymd(s.t)] || 0) + 1));
  const P = Object.entries(S.pat).filter(([, o]) => o.n >= 8).map(([k, o]) => ({ k, n: o.n, acc: (100 * o.ok) / o.n, sp: o.ok ? o.r / o.ok : 0 }));
  const prow = (x) => `<tr><td>${esc(x.k)}<td class="r">${x.n}<td class="r">${Math.round(x.acc)}%<td class="r">${x.sp.toFixed(2)}×<td class="r"><button class="btn sm" data-act="drillPat" data-v="${esc(x.k)}">Drill</button></tr>`;

  const TABS = [['overview', 'Overview'], ['skills', 'Skills'], ['facts', 'Tables'], ['history', 'History']];
  if (!TABS.some(([v]) => v == tab)) tab = 'overview';
  const hs = hourStats();
  const hourCard = hs.best ? `<h2>When you play best${ib('p.hours')}</h2><div class="card"><div class="hrs">${hs.rows.map((r) => `<div class="hr ${r.l == hs.best.l ? 'top' : ''}"><b>${r.l}</b><span class="num">${r.s ? r.pace + '/min' : '–'}</span><span class="mu">${r.s ? r.acc + '% · ' + r.s + (r.s == 1 ? ' session' : ' sessions') : 'no sessions'}</span></div>`).join('')}</div><div class="mu" style="margin-top:8px">You score highest in the <b class="tx">${hs.best.l.toLowerCase()}</b>. Try your hardest sessions then.</div></div>` : '';
  const panel = {
    overview: `
  <div class="g g3">
    <div class="card stat"><button type="button" class="stat-hit" data-act="streakCard" aria-haspopup="dialog" aria-label="Streak details"></button><div class="l">Streak</div>${statB('streak')}<div class="v">${streak()}<span class="s"> days</span></div><div class="s">longest ${c.ls}${restInfo() ? ' ' + restChip(restInfo(), icon, esc) : ''}</div></div>
    <div class="card stat"><button type="button" class="stat-hit" data-act="ptab" data-v="skills" aria-label="See the rating of every skill"></button><div class="l">Rating</div>${statB('rating')}<div class="v">${Math.round(avgLv() * 100)}</div><div class="s">${esc(rank(Math.round(avgLv() * 100)))}</div></div>
    <div class="card stat"><button type="button" class="stat-hit" data-act="ptab" data-v="history" aria-label="See your session history"></button><div class="l">Sessions</div><div class="v">${S.sessions.length}</div><div class="s">${c.n.toLocaleString()} ${c.n == 1 ? 'answer' : 'answers'}</div></div>
    <div class="card stat"><button type="button" class="stat-hit" data-go="notebook" aria-label="Open the Notebook"></button><div class="l">7-day retention</div>${statB('retention')}<div class="v">${ready ? Math.round(rd.retentionRate * 100) + '%' : '–'}</div><div class="s">${retSub}</div>${ms.mastered ? `<div class="s">Mastery: ${Math.round(ms.rate * 100)}% never slipped</div>` : ''}</div>
    <div class="card stat"><button type="button" class="stat-hit" data-act="ptab" data-v="skills" aria-label="See the skills behind the estimate"></button><div class="l">Zetamac estimate</div>${statB('zeta')}<div class="v">${zDef()}</div><div class="s">× ÷ only ${zMD()}</div></div>
    <div class="card stat">${tr.length ? `<button type="button" class="stat-hit" data-act="sessInfo" data-v="${esc(tr.reduce((b, s) => (s.pts > b.pts ? s : b)).t)}" aria-label="Open your best 2-minute Train"></button>` : ''}<div class="l">Best 2-min train</div><div class="v">${tr.length ? Math.max(...tr.map((s) => s.pts)) : '–'}</div><div class="s">${tr.length ? Math.max(...tr.map((s) => s.ok)) + ' correct best' : 'play a 2-min Train'}</div></div>
  </div>
  <div class="card" style="margin-top:14px">Biggest 7-day gain: <button type="button" class="lnk" data-act="skill" data-v="${esc(dl7[0][0])}"><b>${esc(SK[dl7[0][0]].n)}</b></button> (${dl7[0][1] >= 0 ? '+' : ''}${Math.round(dl7[0][1])}) · Weakest right now: <button type="button" class="lnk" data-act="skill" data-v="${esc(wk[0])}"><b>${esc(SK[wk[0]].n)}</b></button></div>
  <div class="g c2 p4">
    <div><h2>Overall rating</h2><div class="card">${spark(L.map((s) => (IDS.reduce((q, k) => q + ((s.lv && s.lv[k]) || SK[k].s), 0) / IDS.length) * 100), 'var(--ok)', { labels: L.map(sessLabel) })}</div></div>
    <div><h2>Pace${ib('p.pace')}</h2><div class="card">${spark(L.map((s) => (s.pts * 60) / s.dur), 'var(--ac)', { labels: L.map(sessLabel), unit: '/min' })}</div></div>
    <div><h2>Accuracy${ib('p.acc')}</h2><div class="card">${spark(L.map((s) => pct(s.ok, Math.max(1, s.n))), '#ff9f5a', { unit: '%', labels: L.map(sessLabel) })}</div></div>
    <div><h2>Answers per day</h2><div class="card">${(() => { const D = [...Array(14)].map((_, i) => ymd(dayAgo(13 - i))); return bars(D.map((d) => S.sessions.filter((s) => ymd(s.t) == d).reduce((q, s) => q + s.n, 0)), 'var(--ac)', D); })()}</div></div>
  </div>
  ${weekCard()}
  <h2>This week vs last${ib('p.wvl')}</h2>
  <div class="card wvl wkopen" role="button" tabindex="0" data-act="weekSheet" aria-haspopup="dialog" aria-label="This week in detail"><div><span>Sessions</span><b>${a.s}</b>${dlt(a.s, b.s).replace('<span', '<small').replace('</span>', '</small>')}</div><div><span>Answers</span><b>${a.n}</b>${dlt(a.n, b.n).replace('<span', '<small').replace('</span>', '</small>')}</div><div><span>Accuracy</span><b>${Math.round(a.acc)}%</b>${dlt(a.acc, b.acc, '%').replace('<span', '<small').replace('</span>', '</small>')}</div><div><span>Pace / min</span><b>${Math.round(a.pace)}</b>${dlt(a.pace, b.pace).replace('<span', '<small').replace('</span>', '</small>')}</div></div>
  ${hourCard}`,
    skills: `
  <h2>Weakness map${ib('p.weak')}</h2>
  <div class="card tbl"><table><tr><th>Skill<th>Rating<th><th class="r">Accuracy<th class="r">Speed<th class="r hide-m">7 days<th class="r hide-m">To review<th></tr>
  ${IDS.map((k) => { const s = S.sk[k], d = (s.lv - lvAgo(k, 7)) * 100, wq = Object.values(S.weak).filter((w) => w.sk == k).length; return `<tr><td><span class="dot" style="--sc:${COL[k]}"></span> <button type="button" class="lnk" data-act="skill" data-v="${esc(k)}" aria-label="${esc(SK[k].n + ' details')}">${wk.includes(k) ? '<b>' + esc(SK[k].n) + '</b>' : esc(SK[k].n)}</button><td><b>${Math.round(s.lv * 100)}</b><td style="width:20%"><div class="bar" style="--sc:${COL[k]}"><i style="width:${(s.lv / 12) * 100}%"></i></div><td class="r">${Math.round(s.acc * 100)}%<td class="r">${s.n ? s.spd.toFixed(2) + '×' : '–'} <td class="r hide-m ${d >= 0 ? 'ok' : 'bad'}">${d >= 0 ? '+' : ''}${Math.round(d)}<td class="r hide-m">${wq}<td class="r"><span class="btns" style="justify-content:flex-end"><button class="btn sm" data-act="aiSkill" data-v="${esc(k)}" aria-label="Ask AI about ${esc(SK[k].n)}">${icon('sparkle')}</button><button class="btn sm" data-act="drill" data-v="${esc(k)}">Drill</button></span></tr>`; }).join('')}</table>
  <div class="mu" style="margin-top:6px">Speed 1.00× means on par pace (reading, thinking and typing included); lower is faster. The two weakest skills (bold) get extra practice in All-skills sessions.</div></div>
  <details class="fold"><summary><h2>Rating per skill</h2></summary>
  <div class="skills skcharts">${IDS.map((k) => `<div class="card"><b class="kc" style="--sc:${COL[k]}">${esc(SK[k].n)}</b> ${spark(L.map((s) => ((s.lv && s.lv[k] != null ? s.lv[k] : SK[k].s)) * 100), COL[k], { w: 320, h: 80, labels: L.map(sessLabel) })}</div>`).join('')}</div></details>
`,
    facts: `
  <h2>Times-table map${ib('p.facts')}</h2>
  <div class="card">${factGrid()}</div>
  ${errCard()}
  <h2>What actually slows you down${ib('p.slow')}</h2>
  <div class="card tbl">${P.length < 3 ? '<span class="mu">Patterns (carries, borrows, digit sizes, tricks) appear after about 8 attempts each.</span>'
    : `<table><tr><th>Slowest<th class="r">Tries<th class="r">Acc<th class="r">Speed<th></tr>${P.slice().sort((x, y) => y.sp - x.sp).slice(0, 5).map(prow).join('')}<tr><th>Most missed<th><th><th><th></tr>${P.slice().sort((x, y) => x.acc - y.acc).slice(0, 5).map(prow).join('')}</table>`}</div>
`,
    history: `
  <h2>Recent sessions${ib('p.hist')}</h2>
  <div class="card tbl"><table><tr><th>When<th class="hide-m">Mode<th class="r">Pts<th class="r hide-m">✓<th class="r">Acc<th class="r hide-m">Avg<th class="r" title="Points per minute vs your previous session of the same type and length">vs last same</tr>
  ${S.sessions.slice(-more).reverse().map((x) => { const pv = prevOf(x), d = pv ? (x.pts * 60) / x.dur - (pv.pts * 60) / pv.dur : 0; return `<tr><td><button class="lnk" data-act="sessInfo" data-v="${esc(x.t)}" aria-label="Details of the session on ${ymd(x.t)}">${ymd(x.t).slice(5)} ${new Date(x.t).toTimeString().slice(0, 5)}</button><td class="hide-m">${esc(modeLabel(x.m))}<td class="r">${x.pts}<td class="r hide-m">${x.ok}<td class="r">${pct(x.ok, Math.max(1, x.n))}%<td class="r hide-m">${x.tm}s<td class="r ${d >= 0 ? 'ok' : 'bad'}">${pv ? (d >= 0 ? '+' : '') + Math.round(d) + '/min' : '–'}</tr>`; }).join('')}</table></div>${S.sessions.length > more ? `<div class="btns" style="margin-top:10px"><button class="btn sm" data-act="moreSess">Show ${Math.min(20, S.sessions.length - more)} more</button></div>` : ''}
  <h2>Last ${heatWeeks()} weeks</h2><div class="card">${heatmap()}</div>
  <h2>Milestones<span class="sub">${S.ms.length} of ${MS.length}</span></h2>
  <div class="ms">${MS.map((m) => { const got = S.ms.includes(m[0]), pr = !got && msProgress(m[0], c); return `<button type="button" class="chip ${got ? 'on' : ''}" data-act="msTip" data-v="${esc(m[0])}" ${pr ? `title="${pr.cur} of ${pr.goal}"` : ''}>${icon(got ? 'trophy' : 'lock')} ${esc(m[1])}${pr ? ` <span class="mu">${Math.round((100 * pr.cur) / pr.goal)}%</span>` : ''}</button>`; }).join('')}</div>`,
  };
  const filterable = tab == 'overview' || tab == 'skills', modeName = (MODES.find((m) => m[0] == mode) || MODES[0])[1], rangeName = (RANGES.find((r) => r[0] == range) || RANGES[1])[1], filtered = mode != 'all' || range != 40;
  document.querySelector('#main').innerHTML = `
  <div class="hd"><h1>Progress</h1></div>
    <div class="pbar">${filterable ? `<button class="btn sm fchip${filtered ? ' on' : ''}" data-act="pfilters" aria-expanded="${fOpen}" aria-controls="pf" aria-label="Filters: ${esc(modeName)}, ${esc(rangeName)}">${icon('sliders')}<span>${esc(modeName)} · ${esc(rangeName)}</span>${icon('chev', 'cv')}</button>` : ''}<button class="btn sm ghost" data-act="aiProgress" aria-label="AI read of my progress">${icon('sparkle')} AI read</button></div>
    ${filterable ? `<div id="pf" class="pf" ${fOpen ? '' : 'hidden'}>
      <div><div class="mu">Session type${ib('p.filters')}</div><div class="seg" role="group" aria-label="Session type for the trend charts">${MODES.map(([v, l]) => `<button aria-pressed="${mode == v}" data-act="pmode" data-v="${esc(v)}">${l}</button>`).join('')}</div></div>
      <div><div class="mu">History shown</div><div class="seg" role="group" aria-label="History shown">${RANGES.map(([v, l]) => `<button aria-pressed="${range == v}" data-act="range" data-v="${esc(v)}">${l}</button>`).join('')}</div></div>
    </div>` : ''}
    <div class="tabs2" role="tablist" aria-label="Progress sections">${TABS.map(([v, l]) => `<button role="tab" id="pt-${esc(v)}" aria-selected="${tab == v}" aria-controls="pp" data-act="ptab" data-v="${esc(v)}">${l}</button>`).join('')}</div>
  <div id="pp" role="tabpanel" aria-labelledby="pt-${esc(tab)}">${panel[tab]}</div>`;
}

A.aiProgress = () => {
  const rows = S.sessions.slice(-12).map((s) => ({ mode: s.m, secs: s.dur, answers: s.n, accuracyPct: s.n ? Math.round((100 * s.ok) / s.n) : 0, avgSec: s.tm || null, points: s.pts, daysAgo: Math.round((Date.now() - s.t) / 864e5) }));
  showAiSheet({ title: 'Your progress, explained', action: 'progress', context: { sessionsTotal: S.sessions.length, streakDays: streak(), recent: rows, skillRatings: Object.fromEntries(IDS.map((k) => [SK[k].n, Math.round(S.sk[k].lv * 100)])) }, extra: () => [{ label: 'Drill my weakest skill', run: () => drill(weakestSkills(1)[0]) }] });
};

/** 2..12 grid: grey = not seen, red = missed often, amber = slow, green = good, bright = fast and accurate. Tap a number on the edge to drill that table, or a square for one fact. */
const FN = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
function factGrid() {
  const F = S.facts || {}, seen = Object.keys(F).length;
  const cell = (a, b) => { const k = Math.min(a, b) + '×' + Math.max(a, b), o = F[k]; return `<button class="fc ${factClass(o)}" data-act="factInfo" data-a="${a}" data-b="${b}" aria-label="${esc(a + ' times ' + b + ' equals ' + a * b + (o ? ', ' + o.ok + ' of ' + o.n + ' right' : ', not seen yet'))}" title="${a} × ${b} = ${a * b}${o ? ' · ' + o.ok + '/' + o.n + ' right' + (o.ok ? ' · ' + (o.r / o.ok).toFixed(2) + '× par' : '') : ' · not seen yet'}">${a * b}</button>`; };
  return `<div class="fgrid" role="group" aria-label="Times table map"><span></span>${FN.map((n) => `<button class="fh" data-act="tableDrill" data-v="${esc(n)}" aria-label="Drill the ${n} times table">${n}</button>`).join('')}
    ${FN.map((a) => `<button class="fh" data-act="tableDrill" data-v="${esc(a)}" aria-label="Drill the ${a} times table">${a}</button>${FN.map((b) => cell(a, b)).join('')}`).join('')}</div>
  <div class="legend fl"><span><i class="fc f0"></i> new</span><span><i class="fc fb"></i> missed</span><span><i class="fc fm"></i> slow</span><span><i class="fc fg"></i> good</span><span><i class="fc fa"></i> fast</span></div>
  <div class="mu" style="margin-top:6px">${seen ? seen + ' of 66 facts seen so far. ' : 'Fills in as × and ÷ questions come up. '}Tap a number to drill its table.</div>${weakFacts().length ? `<div class="btns" style="margin-top:10px"><button class="btn sm primary" data-act="weakFacts">Practise my ${weakFacts().length} weakest facts · 60 s</button><button class="btn sm" data-act="aiFacts">${icon('sparkle')} AI: memory hooks for these</button></div>` : ''}`;
}
function errCard() {
  const E = S.errs || {}, ks = Object.keys(ERRL).filter((k) => E[k] > 0).sort((a, b) => E[b] - E[a]), tot = ks.reduce((q, k) => q + E[k], 0);
  if (tot < 5) return '';
  return `<h2>Mistake patterns<span class="sub">all time, ${tot} slips</span>${ib('p.err')}</h2><div class="card">${ks.map((k) => `<div class="fr why"><span><b>${esc(ERRL[k][0])}</b> <span class="mu">${Math.round((100 * E[k]) / tot)}%</span><div class="bar" style="margin-top:5px"><i style="width:${(100 * E[k]) / tot}%;background:var(--ac)"></i></div></span><b class="num">${E[k]}</b></div>`).join('')}<div class="mu" style="margin-top:8px">${esc(ERRL[ks[0]][1])}</div></div>`;
}
A.weakFacts = () => start(undefined, { wf: 1, dur: 60, only: 'all', off: 0, patt: undefined });
A.tableDrill = (d) => { const n = +d.v; start(undefined, { only: 'zeta', zeta: zNorm({ ops: ['mul', 'div'], a: ZDEF.a, b: ZDEF.b, m: [n, n], n: [2, 12] }) }); };

/** A tooltip does nothing on a phone, so tapping a square opens its numbers and a one-fact drill. */
const FACT_WORD = { f0: 'Not seen yet', fb: 'Missed often', fm: 'Right, but slow', fg: 'Good', fa: 'Fast and accurate' };
A.factInfo = async (d) => {
  const a = +d.a, b = +d.b, o = (S.facts || {})[Math.min(a, b) + '×' + Math.max(a, b)], c = factClass(o);
  const body = o && o.n
    ? `<div class="sg"><div><div class="mu">Right</div><b>${o.ok}/${o.n}</b></div><div><div class="mu">Speed</div><b>${o.ok ? (o.r / o.ok).toFixed(2) + '× par' : '–'}</b></div><div><div class="mu">Verdict</div><b>${FACT_WORD[c]}</b></div></div>`
    : `<p class="mu">You haven't answered this one yet. It turns up as × and ÷ questions come around.</p>`;
  const v = await dialog({ title: `${a} × ${b} = ${a * b}`, body, actions: [{ label: 'Close', value: false }, { label: `Drill ${a} × ${b} · 60 s`, value: 'drill', primary: true }] });
  if (v == 'drill') start(undefined, { only: 'zeta', dur: 60, off: 0, zeta: zNorm({ ops: ['mul', 'div'], a: ZDEF.a, b: ZDEF.b, m: [a, a], n: [b, b] }) });
};

/** One past session: totals, and (for recent sessions, which keep it) the per-skill breakdown and rating moves. */
A.sessInfo = async (d) => {
  const i = S.sessions.findIndex((x) => x.t == d.v), x = S.sessions[i];
  if (!x) return;
  const pv = S.sessions[i - 1];
  const by = x.by ? IDS.filter((k) => x.by[k]).map((k) => { const b = x.by[k], mv = x.lv && pv && pv.lv ? Math.round((x.lv[k] - pv.lv[k]) * 100) : 0; return `<div class="fr"><span class="kc" style="--sc:${COL[k]}">${esc(SK[k].n)}</span><span>${b[1]}/${b[0]} · ${b[1] ? (b[2] / b[1]).toFixed(1) + 's' : '–'}${mv ? ` <span class="${mv > 0 ? 'ok' : 'bad'}">${mv > 0 ? '▲' : '▼'}${Math.abs(mv)}</span>` : ''}</span></div>`; }).join('') : '<div class="mu">The per-skill breakdown is only kept for your most recent sessions.</div>';
  const choice = await dialog({ title: modeLabel(x.m) + ' · ' + ymd(x.t), body: `<div class="sg"><div><div class="mu">Points</div><b>${x.pts}</b></div><div><div class="mu">Correct</div><b>${x.ok}/${x.n}</b></div><div><div class="mu">Accuracy</div><b>${pct(x.ok, Math.max(1, x.n))}%</b></div><div><div class="mu">Length</div><b>${x.dur >= 120 ? Math.round(x.dur / 60) + ' min' : x.dur + ' s'}</b></div><div><div class="mu">Avg answer</div><b>${x.tm}s</b></div><div><div class="mu">Pace</div><b>${Math.round((x.pts * 60) / x.dur)}/min</b></div></div>${by}`, actions: [{ label: 'AI read of this session', value: 'ai' }, { label: 'Close', value: true, primary: true }] });
  if (choice !== 'ai') return;
  const perSkill = x.by ? IDS.filter((k) => x.by[k]).map((k) => { const b = x.by[k]; return { skill: SK[k].n, tried: b[0], correct: b[1], avgSec: b[1] ? +(b[2] / b[1]).toFixed(1) : null, ratingChange: x.lv && pv && pv.lv ? Math.round((x.lv[k] - pv.lv[k]) * 100) : 0 }; }) : [];
  const same = prevOf(x);
  showAiSheet({ title: modeLabel(x.m) + ' · ' + ymd(x.t), action: 'session', context: { mode: x.m || 'train', daysAgo: Math.round((Date.now() - x.t) / 864e5), seconds: x.dur, answers: x.n, correct: x.ok, accuracyPct: pct(x.ok, Math.max(1, x.n)), avgSec: x.tm || null, points: x.pts, ptsPerMin: Math.round((x.pts * 60) / x.dur), vsPrevSameKind: same ? Math.round((x.pts * 60) / x.dur - (same.pts * 60) / same.dur) : null, perSkill }, extra: () => [{ label: 'Drill my weakest skill', run: () => drill(weakestSkills(1)[0]) }] });
};
A.aiSkill = (d) => askSkillAi(d.v);
A.aiFacts = () => {
  const F = S.facts || {};
  const facts = weakFacts().slice(0, 5).map(([a, b]) => { const o = F[Math.min(a, b) + '×' + Math.max(a, b)] || {}; return { fact: a + ' × ' + b, product: a * b, tries: o.n || 0, accuracyPct: o.n ? Math.round((100 * o.ok) / o.n) : null, speedVsPar: o.ok ? +(o.r / o.ok).toFixed(2) : null }; });
  showAiSheet({ title: 'Memory hooks for your weakest facts', action: 'facts', context: { facts }, extra: () => [{ label: 'Run the weakest-facts drill', run: () => A.weakFacts() }] });
};
A.range = (d) => { range = +d.v; progress(); };
/** Fold the filters open or shut IN PLACE, so nothing else repaints and the scroll position stays put. */
A.pfilters = (d, btn) => { fOpen = !fOpen; const p = document.getElementById('pf'); if (!p || !btn) { progress(); return; } p.hidden = !fOpen; btn.setAttribute('aria-expanded', String(fOpen)); };
A.ptab = (d) => { tab = d.v; progress(); scrollTo(0, 0); };
/** Home's Skill balance card opens Progress on its Skills tab. */
A.openSkills = () => { tab = 'skills'; go('progress'); };
A.moreSess = () => { more += 20; progress(); };
A.pmode = (d) => { mode = d.v; progress(); };
A.drillPat = (d) => { const [n, pt] = d.v.split(' · '), k = IDS.find((i) => SK[i].n == n); if (k) drill(k, pt); };
register('progress', progress);
export { progress };
