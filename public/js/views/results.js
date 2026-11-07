import { S, save } from '../state.js';
import { IDS, SK, COL, how } from '../engine.js';
import { esc, pct } from '../util.js';
import { coach, shareLine, recommend, ERRL, streak } from '../stats.js';
import { shareCard } from '../share.js';
import { raceChart } from '../charts.js';
import { burst, copy, icon, toast } from '../ui.js';
import { ib } from '../info.js';
import { A, go, mark, enter } from '../nav.js';
import { start, lastRun } from './play.js';
import { drill } from './home.js';
import { weakestSkills } from '../stats.js';
import { showAiSheet } from '../ai.js';
import { boardHint, reportDaily, boardHtml } from '../board.js';

let last = null, lastCtx = null, lastCard = null;

export function showResults(e, out) {
  mark('end');
  const tt = document.querySelector('#toast'); if (tt) tt.classList.remove('show');   // a combo toast from the run must not linger over the results
  const { rec, tag, unlocked, newBest } = out;
  last = { line: shareLine(rec), kind: e.kind, at: Date.now() };
  lastCard = { tag: tag, best: !!newBest, streak: streak(),
    ...(e.kind == 'sprint' ? { big: out.sprint + 's', bigLabel: 'Sprint time' } : { big: e.pts, bigLabel: 'points' }),
    rows: [['correct', e.ok], ['accuracy', pct(e.ok, e.n) + '%'], ['best streak', e.bc], ['average', rec.tm ? rec.tm + 's' : '–']] };
  document.title = 'Results · Mental Math';
  const stk = unlocked.find((m) => /^s\d+$/.test(m[0]));   // a streak milestone just landed
  if (newBest || e.lu.length || stk) burst(stk ? 70 : 44);
  const hasWeak = Object.keys(S.weak).length;
  const slow = e.tl.slice().sort((a, b) => b[1] - a[1]).slice(0, 4);
  const misses = e.log.filter((x, i, a) => !x.ok && a.findIndex((y) => !y.ok && y.q == x.q) == i);   // one row per question, however often it was missed
  const prev = S.best[e.mk], gap = prev && e.kind != 'sprint' && !newBest && e.pts < prev.pts ? prev.pts - e.pts : 0;
  const r = recommend();
  const pv = [...S.sessions].reverse().find((x) => x !== rec && x.m == rec.m && x.dur == rec.dur), dv = pv ? (e.kind == 'sprint' ? (pv.sc != null && rec.sc != null ? +(pv.sc - rec.sc).toFixed(1) : 0) : Math.round((rec.pts * 60) / rec.dur - (pv.pts * 60) / pv.dur)) : 0;
  const ek = {}; e.errs.forEach((k) => (ek[k] = (ek[k] || 0) + 1)); if (e.skips) ek.skip = e.skips;
  const eKeys = Object.keys(ek).sort((a, b) => ek[b] - ek[a]);
  lastCtx = {
    mode: e.kind, seconds: Math.round(e.el), questions: e.n, correct: e.ok, accuracyPct: pct(e.ok, e.n), avgSecPerAnswer: rec.tm || null, bestStreak: e.bc, skipped: e.skips,
    missed: misses.slice(0, 8).map((x, i) => ({ q: x.q, answer: x.a, typed: x.ty || '', pattern: x.pt || '', ...(i < 4 ? { method: (() => { try { return String(how(x) || '').slice(0, 170); } catch { return ''; } })() } : {}) })),
    slowest: slow.map((x) => ({ q: x[0], sec: +Number(x[1]).toFixed(1) })),
    errorKinds: ek, ratingChanges: out.dl.map(([k, v]) => ({ skill: SK[k].n, change: v })), levelUps: e.lu, newBest: !!newBest,
  };
  enter();                                                       // results arrive with the same cascade, count-ups and sweeps as any other screen
  const stat = (v, l) => `<div class="rs"><b class="num">${v}</b><span>${l}</span></div>`;
  document.querySelector('#main').innerHTML = `
  <div class="rhero ${newBest ? 'best' : ''}">
    <div class="rtag ${newBest ? 'gd' : 'mu'}">${newBest ? icon('star', 'fill') : ''}${esc(tag)}${ib('r.hero')}</div>
    ${e.kind == 'sprint' ? `<div class="score"><div class="v num">${out.sprint}<small>s</small></div></div><div class="mu">${e.el.toFixed(1)} s on the clock${e.slips + e.skips ? ` + ${3 * e.slips + 5 * e.skips} s penalties (${e.slips} slips, ${e.skips} skips)` : ', no penalties'} · ${e.pts} pts</div>` : `<div class="score"><div class="v num">${e.pts}<small>pts</small></div></div>`}
    ${newBest && out.bestBy > 0 ? `<div class="vsbest">Beat your best by <b>${out.bestBy}${e.kind == 'sprint' ? ' s' : ' pts'}</b></div>` : ''}
    ${gap ? `<div class="mu">${gap} short of your best here</div>` : ''}
    ${pv && (e.kind != 'sprint' || pv.sc != null) ? (e.kind == 'sprint' ? `<div class="vslast ${dv >= 0 ? 'ok' : 'bad'}">${dv >= 0 ? '▲' : '▼'} ${Math.abs(dv)} s ${dv >= 0 ? 'faster' : 'slower'} <span class="mu">than your last Sprint</span></div>` : `<div class="vslast ${dv >= 0 ? 'ok' : 'bad'}">${dv >= 0 ? '▲' : '▼'} ${Math.abs(dv)} pts/min <span class="mu">vs your last ${esc(rec.m == 'review' ? 'review' : rec.m == 'survival' ? 'survival run' : 'run like this')}</span></div>`) : ''}
    ${stk ? `<div class="lvup streakup">${icon('flame', 'fill')} ${esc(stk[1])} reached</div>` : ''}
    ${e.lu.length ? `<div class="lvup">${icon('up')} Level up: ${e.lu.map(esc).join(' · ')}</div>` : ''}
    ${out.dl.length && !e.frozen ? `<div class="movers" aria-label="Rating changes">${out.dl.map(([k, v]) => `<span class="pill ${v > 0 ? 'ok' : 'bad'}"><span class="dot" style="--sc:${COL[k]}"></span>${esc(SK[k].n)} ${v > 0 ? '▲' : '▼'}${Math.abs(v)}</span>`).join('')}</div>` : ''}
    <div class="rstats">${stat(e.ok, 'correct')}${stat(pct(e.ok, e.n) + '%', 'accuracy')}${stat(rec.tm ? rec.tm + 's' : '–', 'average')}${stat(e.bc, 'best streak')}${stat(e.fast < 99 ? e.fast.toFixed(1) + 's' : '–', 'fastest')}${stat(pct(e.ft, e.n) + '%', 'first try')}</div>
  </div>
  <div class="btns rbtns">
    <button class="btn primary" data-act="again">${icon('redo')} ${e.kind == 'daily' ? 'Back to home' : 'Play again'}<kbd>Enter</kbd></button>
    ${misses.length || hasWeak ? `<button class="btn" data-act="review">${icon('book')} ${misses.length ? 'Practise ' + misses.length + ' missed' : 'Review missed'}<kbd>R</kbd></button>` : ''}
    <button class="btn" data-act="weakest">${icon('target')} Drill weakest<kbd>W</kbd></button>
    <button class="btn" data-act="shareImg">${icon('share')} Share</button>
    <button class="btn ghost" data-go="home">Home<kbd>Esc</kbd></button>
  </div>
  ${r.act == 'daily' || r.act == 'survival' ? `<div class="card nextup rnext"><div><div class="eyebrow">Next up</div><b>${esc(r.title)}</b><div class="mu">${esc(r.why)}</div></div><button class="btn" data-act="${esc(r.act)}">${esc(r.cta)}</button></div>` : ''}
  ${e.kind == 'daily' && boardHint() ? `<h2>Today’s board<span class="sub">${esc(e.day)}</span></h2><div class="card" id="boardc" role="status"><p class="mu" style="margin:0">Sending your score…</p></div>` : ''}
  <div class="cols">
   <div>
    <h2>Coach</h2><div class="card">${esc(coach(e))}<div style="margin-top:10px"><button class="btn sm" data-act="aiDebrief">${icon('sparkle')} AI debrief of this session</button></div></div>
    ${eKeys.length ? `<h2>Why you missed${ib('r.why')}</h2><div class="card">${eKeys.map((k) => `<div class="fr why"><span><b>${esc(ERRL[k][0])}</b><br><span class="mu">${esc(ERRL[k][1])}</span></span><b class="num">${ek[k]}</b></div>`).join('')}</div>` : ''}
    ${e.g.length && e.kind != 'sprint' ? `<h2>Race against your ghost${ib('r.ghost')}</h2><div class="card">${raceChart(e.g, e.ghost, out.full && e.dur ? e.dur : e.el)}</div>` : ''}
    ${unlocked.length ? `<h2>Unlocked</h2><div class="ms">${unlocked.map((m) => `<span class="chip on">${esc(m[1])}</span>`).join('')}</div>` : ''}
    ${misses.length ? `<h2>Missed${ib('r.missed')}</h2><div class="card"><div class="log">${misses.slice(0, 12).map((x) => `<div class="x"><span>${esc(x.q)} = <b>${esc(x.a)}</b>${x.ty ? ` <span class="mu">you typed ${esc(x.ty)}</span>` : ''}<br><span class="mu">${esc(how(x))}</span></span><button class="btn sm ghost" style="padding:2px 8px;font-size:11px" data-act="aiExplain" data-q="${esc(x.q)}" data-a="${esc(x.a)}" data-ty="${esc(x.ty || '')}" data-sk="${esc(x.sk || '')}" data-d="${esc(x.d ?? '')}" data-pt="${esc(x.pt || '')}">${icon('sparkle')} AI Method</button><span class="bad">✗</span></div>`).join('')}</div></div>` : ''}
   </div>
   <div>
    <h2>By skill</h2><div class="card tbl"><table><tr><th>Skill<th class="r">Qs<th class="r">Acc<th class="r">Avg<th class="r">Rating</tr>
    ${IDS.filter((k) => e.by[k]).map((k) => { const i = IDS.indexOf(k), b = e.by[k], d = Math.round((S.sk[k].lv - e.lv0[i]) * 100); return `<tr><td><span class="dot" style="--sc:${COL[k]}"></span> ${esc(SK[k].n)}<td class="r">${b[0]}<td class="r">${pct(b[1], b[0])}%<td class="r">${b[1] ? (b[2] / b[1]).toFixed(1) + 's' : '–'}<td class="r">${Math.round(S.sk[k].lv * 100)} ${e.frozen || !d ? '' : `<span class="${d >= 0 ? 'ok' : 'bad'}">${d >= 0 ? '▲' : '▼'}${Math.abs(d)}</span>`}</tr>`; }).join('')}</table></div>
    ${slow.length ? `<h2>Slowest answers</h2><div class="card"><div class="log">${slow.map((x) => `<div><span>${esc(x[0])}${x[2] ? `<br><span class="mu">${esc(x[2])}</span>` : ''}</span><span class="a num">${x[1].toFixed(1)}s</span><span></span></div>`).join('')}</div></div>` : ''}
    <details class="card allans"><summary>Every answer<span class="sub">${e.log.length}</span></summary><div class="log">${e.log.map((x) => `<div class="${x.ok ? '' : 'x'}"><span>${esc(x.q)} <span class="a">= ${esc(x.a)}</span>${x.rt ? ' <span class="mu">· review</span>' : ''}${x.hinted ? ' <span class="mu">· hint</span>' : ''}</span><span class="a num">${x.tm.toFixed(1)}s</span><span class="${x.ok ? 'ok' : 'bad'}">${x.ok ? '✓' : '✗'}</span></div>`).join('')}</div></details>
    <h2>Share</h2><div class="card"><div style="font-family:var(--mono);font-size:13px;word-break:break-word;font-variant-ligatures:none">${esc(last.line)}</div><div style="margin-top:10px"><button class="btn sm" data-act="copyRes">${icon('share')} Copy text<kbd>C</kbd></button></div></div>
   </div>
  </div>`;
  padHint();
  if (e.kind == 'daily' && boardHint()) reportDaily(e).then((x) => { const c = document.querySelector('#boardc'); if (c) c.innerHTML = x ? boardHtml(x) : 'You are not on the board. Join it in Settings.'; });
}

/** Once, after a few sessions on a touchscreen: the calculator-style keypad is a setting most people never find. */
function padHint() {
  if (S.padHint || S.padFlip || S.sessions.length < 3 || !matchMedia('(pointer:coarse)').matches) return;
  S.padHint = 1; save();
  setTimeout(() => { if (document.querySelector('#main').dataset.scr == 'end') toast('7 8 9 on top, like a calculator?', { label: 'Switch', ms: 7000, onClick: () => { S.padFlip = true; save(); toast('Keypad switched. Change it any time in Settings'); } }); }, 1600);
}

A.aiDebrief = () => { if (lastCtx) showAiSheet({ title: 'AI session debrief', action: 'debrief', context: lastCtx, extra: () => [...(Object.keys(S.weak).length ? [{ label: 'Practise missed questions', run: () => start('review') }] : []), { label: 'Drill my weakest skill', run: () => drill(weakestSkills(1)[0]) }] }); };
const ready = () => Date.now() - (last ? last.at : 0) > 700;   // ignore the key press that ended the session
A.again = () => { if (last && last.kind == 'daily') go('home'); else lastRun ? start(lastRun.opt, lastRun.cfg) : start(); };   // repeat the run exactly, drills included
A.shareImg = async () => { if (!lastCard) return; const r = await shareCard(lastCard); if (r == 'saved') toast('Image saved'); };
A.copyRes = async () => { if (!last) return; if (navigator.share && matchMedia('(pointer:coarse)').matches) { try { await navigator.share({ text: last.line }); return; } catch (e) { if (e && e.name == 'AbortError') return; } } copy(last.line); };
export function resultsKey(k) {
  if (!ready()) return true;
  if (k == 'enter') A.again();
  else if (k == 'c') A.copyRes();
  else if (k == 'w') { if (S.sessions.length) drill(weakestSkills(1)[0]); }
  else if (k == 'r') { if (Object.keys(S.weak).length) start('review'); }
  else if (k == 'escape') go('home');
  else return false;
  return true;
}
