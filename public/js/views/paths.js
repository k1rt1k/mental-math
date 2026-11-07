// Guided learning paths: the path map, the four-phase lesson (teach, demonstrate, practise, check) and the run screens.
// Logic lives in js/paths.js; content in js/pathsData.js.
import { S, save } from '../state.js';
import { SK, COL, IDS, T, how as howTo, ansMatch } from '../engine.js';
import { TRICKS } from '../tricks.js';
import { esc } from '../util.js';
import { weakestSkills } from '../stats.js';
import { A, register, go, view, mark } from '../nav.js';
import { icon, toast, burst, dialogOpen } from '../ui.js';
import { PATHS, KINDS, PHASES, RET, RULES, PATH_STAGES, progress, donePhase, recordCheck, checkMode, PathSession, nextUp } from '../paths.js';

const $ = (s) => document.querySelector(s);
const main = () => $('#main');
const sk = (k) => `<span class="kc" style="--sc:${COL[k]}">${esc(SK[k].n)}</span>`;
const when = (t) => new Date(t).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const still = () => document.documentElement.dataset.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Which screen of the path flow is showing. scr: map | lesson | run | result. */
const ctx = { k: 'mul', si: 0, ph: 0, scr: 'map', dm: null, res: null };
let run = null, locked = false;

/* ---------- shared bits ---------- */
export function statusLine(k) {
  const p = progress(k);
  if (p.mastered) return 'Mastered: every check passed';
  if (p.dueRet >= 0) return RET[p.dueRet].label + ' is ready';
  if (p.assessed) { const r = p.ret.find((x) => x.state == 'waiting'); return 'Assessed · ' + (r ? r.label.toLowerCase() + ' ' + when(r.dueAt) : 'retention checks next'); }
  if (!p.started) return 'Not started';
  return 'Stage ' + (p.cur + 1) + ' of ' + PATH_STAGES + ' · ' + KINDS[p.cur];
}
const bar = (pct, k) => `<div class="bar pbar2" style="--sc:${COL[k]}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct * 100)}"><i style="width:${Math.round(pct * 100)}%"></i></div>`;
const cta = (k) => { const p = progress(k); return p.mastered ? 'Review' : p.dueRet >= 0 ? 'Take the check' : !p.started ? 'Start' : p.assessed ? 'Open' : 'Continue'; };

/** The Paths tab on Learn: one card per skill, with a suggested next step on top. */
export function pathsGrid() {
  const nu = nextUp(S.sessions.length ? weakestSkills(1)[0] : 'mul');
  const top = nu ? `<div class="card nextup pcard"><div><div class="eyebrow">${nu.kind == 'retain' ? 'Ready now' : nu.kind == 'start' ? 'Suggested start' : 'Pick up where you left off'}</div><b>${esc(SK[nu.k].n)}: ${esc(nu.kind == 'retain' ? RET[nu.ret].label : PATHS[nu.k].stages[Math.max(0, nu.p.cur)].t)}</b><div class="mu">${esc(statusLine(nu.k))}</div></div><button class="btn primary" data-act="pathOpen" data-v="${esc(nu.k)}">${esc(cta(nu.k))}</button></div>` : '';
  return `${top}<h2 class="phd">All ten paths</h2><div class="pgrid">${IDS.map((k) => {
    const p = progress(k);
    return `<article class="card ppath" style="--sc:${COL[k]}"><div class="kc">${esc(SK[k].n)}${p.mastered ? ' <span class="pill ok2">Mastered ✓</span>' : p.assessed ? ' <span class="pill ok2">Assessed ✓</span>' : ''}</div>
      <h3>${esc(PATHS[k].blurb)}</h3>${bar(p.pct, k)}
      <div class="trick-foot"><span class="mu">${esc(statusLine(k))}</span><button class="btn sm ${p.started ? '' : 'primary'}" data-act="pathOpen" data-v="${esc(k)}" aria-label="${esc(cta(k) + ' ' + SK[k].n + ' path')}">${esc(cta(k))}</button></div></article>`;
  }).join('')}</div>`;
}

/** The "continue your path" card on Home. */
export function pathCard() {
  const nu = nextUp(S.sessions.length ? weakestSkills(1)[0] : 'mul');
  if (!nu) return '';
  const k = nu.k, st = PATHS[k].stages[Math.max(0, nu.p.cur)];
  const title = nu.kind == 'retain' ? RET[nu.ret].label + ': ' + SK[k].n : (nu.kind == 'start' ? 'Learn ' : '') + SK[k].n + ' · ' + (nu.p.cur >= 0 ? 'Stage ' + (nu.p.cur + 1) + ', ' + st.t : st.t);
  return `<section class="card nextup pcard hpath" aria-label="Guided path"><div><div class="eyebrow">${nu.kind == 'retain' ? 'Retention check ready' : nu.kind == 'start' ? 'Guided path' : 'Continue your path'}</div><b>${esc(title)}</b><div class="mu">${nu.kind == 'retain' ? 'A short test that shows what stuck.' : esc(nu.kind == 'start' ? 'Teach, demonstrate, practise, check: five stages.' : statusLine(k))}</div></div><button class="btn" data-act="pathOpen" data-v="${esc(k)}">${esc(cta(k))}</button></section>`;
}

/* ---------- screens ---------- */
function map() {
  const k = ctx.k, P = PATHS[k], p = progress(k), now = Date.now();
  const stage = (s, i) => {
    const t = P.stages[i], dn = s.done ? 4 : s.ph;
    const btn = s.state == 'locked' ? `<span class="mu">${icon('lock')} Pass stage ${i}’s check first</span>` : `<button class="btn ${s.state == 'done' ? 'sm ghost' : 'primary'}" data-act="pathStage" data-v="${i}">${s.state == 'done' ? 'Review' : s.state == 'current' ? 'Continue' : 'Start'}</button>${s.state != 'done' ? `<button class="btn sm ghost" data-act="pathTestOut" data-v="${i}" title="Skip the lesson and take the check">Take the check</button>` : ''}`;
    return `<article class="card pstage ${s.state}" style="--sc:${COL[k]}"><div class="pnum" aria-hidden="true">${s.done ? icon('check') : i + 1}</div>
      <div class="pbody"><div class="kc">Stage ${i + 1} · ${KINDS[i]}${s.done ? ` <span class="pill ok2">Passed${s.sc ? ' · best ' + Math.round(s.sc * 100) + '%' : ''}</span>` : ''}</div><h3>${esc(t.t)}</h3><p class="mu">${esc(t.g)}</p>
        <div class="pmeta"><span class="pdots" role="img" aria-label="${esc(dn)} of 4 lesson steps done">${PHASES.map((n, j) => `<span class="pdot ${j < dn ? 'on' : ''}"></span>`).join('')}</span><span class="mu">${dn} of 4 steps</span></div></div>
      <div class="pact">${btn}</div></article>`;
  };
  const ret = p.ret.map((r) => {
    const body = r.state == 'locked' ? '<span class="mu">' + icon('lock') + ' Pass the mastery test first</span>'
      : r.state == 'waiting' ? `<span class="mu">Ready ${esc(when(r.dueAt))}</span>`
      : r.state == 'done' ? '<span class="pill ok2">Passed ✓</span>'
      : `<button class="btn primary" data-act="retStart" data-v="${esc(r.i)}">Take the check</button>`;
    return `<article class="card pret ${r.state}" style="--sc:${COL[k]}"><div><div class="kc">Retention · ${r.i == 0 ? 'a day later' : 'a week later'}</div><b>${esc(r.label)}</b><p class="mu">${r.i == 0 ? '6 fresh questions, no hints, the day after your mastery test.' : '6 more questions a week on: the real test of what stuck.'}${r.state == 'retry' ? ' You can retake it after a refresher.' : ''}</p></div><div>${body}</div></article>`;
  }).join('');
  main().innerHTML = `
  <div class="hd"><div><button class="btn sm ghost" data-act="pathExit">${icon('chev', 'flip')} Learn</button><h1 style="margin-top:8px">${esc(SK[k].n)} path</h1><p class="lede">${esc(P.blurb)}</p></div>
    <div class="pprog"><b class="num">${p.done}</b><span class="mu"> of ${p.total} milestones</span>${bar(p.pct, k)}</div></div>
  <div class="pstages">${p.stages.map(stage).join('')}</div><h2>Does it stick?</h2><div class="prets">${ret}</div>
  <p class="mu" style="margin-top:18px;max-width:62ch">${sk(k)} Prefer to browse? The <button class="lnk2" data-act="pathLib" data-v="${esc(k)}">trick library</button> has every shortcut as a stand-alone card.</p>`;
}

function stepper(k, si) {
  const s = progress(k).stages[si], dn = s.done ? 4 : s.ph;
  return `<ol class="pstep" aria-label="Lesson steps">${PHASES.map((n, j) => `<li><button class="pstb ${j == ctx.ph ? 'cur' : ''} ${j < dn ? 'done' : ''}" data-act="pathPhase" data-v="${esc(j)}" ${j == ctx.ph ? 'aria-current="step"' : ''}><span class="pn">${j < dn && j != ctx.ph ? icon('check') : j + 1}</span><span>${n}</span></button></li>`).join('')}</ol>`;
}
const trickCard = (t) => `<div class="card ptrick"><b>${esc(t.title)}</b><p class="mu">${esc(t.rule)}</p><div class="ex">${t.ex.map((x) => `<div>${esc(x)}</div>`).join('')}</div></div>`;

function lesson() {
  const k = ctx.k, si = ctx.si, st = PATHS[k].stages[si], ph = ctx.ph, P = progress(k);
  const head = `<div class="hd"><div><button class="btn sm ghost" data-act="pathMap">${icon('chev', 'flip')} ${esc(SK[k].n)} path</button><div class="eyebrow" style="margin-top:10px">Stage ${si + 1} of ${PATH_STAGES} · ${KINDS[si]}</div><h1>${esc(st.t)}</h1><p class="lede">${esc(st.g)}</p></div></div>${stepper(k, si)}`;
  let body = '';
  if (ph == 0) {
    body = `<div class="card ptch" style="--sc:${COL[k]}"><div class="eyebrow">Teach</div>${st.teach.map((x) => `<p>${esc(x)}</p>`).join('')}<div class="pkey"><div class="eyebrow" style="margin:0">Remember</div><b>${esc(st.key)}</b></div></div>
      ${st.tr.length ? `<h2>The tricks in this stage</h2><div class="ptricks">${st.tr.map((id) => TRICKS.find((t) => t.id == id)).filter(Boolean).map(trickCard).join('')}</div>` : ''}
      <div class="btns pnav"><button class="btn primary" data-act="pathNext" data-primary>Next: see it worked ${icon('chev')}</button></div>`;
  } else if (ph == 1) {
    body = `<div class="card ptch" style="--sc:${COL[k]}"><div class="eyebrow">Demonstrate</div><p class="mu">Step through the worked ${st.demo.length > 1 ? 'examples' : 'example'}. In the last one you finish the answer yourself.</p></div>${demoBody(st)}`;
  } else if (ph == 2) {
    const R = RULES.practise(st);
    body = `<div class="card ptch" style="--sc:${COL[k]}"><div class="eyebrow">Practise</div><ul class="prules"><li>${R.n} questions on exactly this stage.</li><li>Hints are free, and the method is shown for the first ${R.guided} questions, then it fades.</li><li>Answer wrong twice and the answer and method are shown.</li><li>A miss goes into your notebook for spaced review.</li></ul><div class="pkey"><div class="eyebrow" style="margin:0">Remember</div><b>${esc(st.key)}</b></div></div>
      <div class="btns pnav"><button class="btn primary" data-act="runStart" data-v="practise" data-primary>Start practising</button></div>`;
  } else {
    const mode = checkMode(si), R = RULES[mode](st), best = P.stages[si].sc;
    body = `<div class="card ptch" style="--sc:${COL[k]}"><div class="eyebrow">${mode == 'test' ? 'Mastery assessment' : 'Check'}</div>
      <ul class="prules"><li>${R.n} questions, no hints, no second tries.</li><li>You need <b>${R.need} first-try answers</b>${R.pace ? ` and an average pace within <b>${Math.round((R.pace - 1) * 100)}% of par</b>` : ''}.</li><li>Passing ${si == PATH_STAGES - 1 ? 'completes the path’s assessment and opens the retention checks' : 'unlocks stage ' + (si + 2)}.</li></ul>
      ${best ? `<p class="mu">Your best so far: ${Math.round(best * 100)}%.</p>` : ''}${P.stages[si].done ? '<p class="ok">You have already passed this stage. Retaking it is just practice.</p>' : ''}</div>
      <div class="btns pnav"><button class="btn primary" data-act="runStart" data-v="${esc(mode)}" data-primary>${mode == 'test' ? 'Start the timed test' : 'Start the check'}</button><button class="btn ghost" data-act="pathPhase" data-v="0">Review the lesson first</button></div>`;
  }
  main().innerHTML = head + body;
}

/* ----- demonstrate ----- */
const capOf = (st, j) => (j == st.demo.length - 1 ? st.demo[j].st.length - 1 : st.demo[j].st.length);
function demoBody(st) {
  const dm = ctx.dm, last = st.demo.length - 1;
  let h = '';
  for (let j = 0; j <= dm.i; j++) {
    const d = st.demo[j], cur = j == dm.i, cap = capOf(st, j), vis = cur ? Math.min(dm.shown, cap) : cap, isLast = j == last;
    const lines = d.st.slice(0, vis).map((x) => `<li>${esc(x)}</li>`);
    if (isLast && dm.solved) lines.push(`<li>${esc(d.st[d.st.length - 1])}</li>`);
    let ctl = '';
    if (cur) {
      if (!dm.solved && vis < cap) ctl = `<div class="btns pnav"><button class="btn primary" data-act="demoNext" data-primary>Show next step</button><button class="btn ghost" data-act="demoAll">Show all steps</button></div>`;
      else if (!isLast) ctl = `<div class="btns pnav"><button class="btn primary" data-act="demoAdv" data-primary>Next example ${icon('chev')}</button></div>`;
      else if (!dm.solved) ctl = `<div class="pyou"><label for="dans"><b>Your turn:</b> what is ${esc(d.q)}?</label><div class="btns" style="margin-top:10px;justify-content:flex-start"><input class="inp pin" id="dans" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Your answer" value="${esc(dm.val || '')}" style="margin:0"><button class="btn primary" data-act="demoCheck" data-primary>Check</button><button class="btn ghost" data-act="demoShow">Show answer</button></div><div class="pmsg" role="status" aria-live="polite" style="min-height:0;text-align:left;margin-bottom:0">${dm.tried ? '<span class="bad">Not quite.</span> <span class="mu">Re-read the steps above and try again.</span>' : ''}</div></div>`;
      else ctl = `<div class="pmsg" role="status" style="min-height:0"><span class="ok">${dm.gaveUp ? 'There it is.' : 'Correct.'}</span> <span class="mu">Now try some yourself.</span></div><div class="btns pnav"><button class="btn primary" data-act="pathNext" data-primary>Next: practise ${icon('chev')}</button></div>`;
    }
    h += `<div class="card pdemo ${cur ? '' : 'old'}"><div class="mu">Example ${j + 1} of ${st.demo.length}</div><div class="pq0">${esc(d.q)}</div><ol class="psteps">${lines.join('')}</ol>${ctl}</div>`;
  }
  return h;
}
const newDemo = () => ({ i: 0, shown: 1, solved: false, tried: 0, gaveUp: false, val: '' });
const finishDemo = () => { donePhase(ctx.k, ctx.si, 1); save(); };
A.demoNext = () => { ctx.dm.shown++; lesson(); focusPrimary(); };
A.demoAll = () => { ctx.dm.shown = capOf(PATHS[ctx.k].stages[ctx.si], ctx.dm.i); lesson(); focusPrimary(); };
A.demoAdv = () => { ctx.dm.i++; ctx.dm.shown = 1; lesson(); focusPrimary(); };
A.demoCheck = () => {
  const st = PATHS[ctx.k].stages[ctx.si], inp = $('#dans'), d = st.demo[st.demo.length - 1], v = inp ? inp.value.trim() : '';
  if (!v) return inp && inp.focus();
  if (ansMatch(v.replace(/−/g, '-'), d.a)) { ctx.dm.solved = true; finishDemo(); lesson(); focusPrimary(); } else { ctx.dm.tried++; ctx.dm.val = ''; lesson(); const i = $('#dans'); i && i.focus(); }
};
A.demoShow = () => { ctx.dm.solved = true; ctx.dm.gaveUp = true; finishDemo(); lesson(); focusPrimary(); };
function focusPrimary() { const b = $('[data-primary]'); if (b && b.tagName == 'BUTTON') b.focus({ preventScroll: true }); }

/* ----- run (practise / check / test / retain) ----- */
function startRun(mode, ret) {
  run = { s: new PathSession(ctx.k, ctx.si, mode), mode, ret, hint: false };
  run.s.begin();
  ctx.scr = 'run'; locked = false;
  const R = run.s.rule, st = run.s.stg;
  const label = { practise: 'Practise', check: 'Check', test: 'Mastery test', retain: ret == 0 ? 'Next-day check' : 'One-week check' }[mode];
  mark('path');
  main().innerHTML = `<div class="prun" style="--sc:${COL[ctx.k]}">
    <div class="phead"><button class="btn sm ghost" data-act="runLeave">${icon('chev', 'flip')} Leave</button><div class="mu">${esc(SK[ctx.k].n)} · ${esc(label)}</div><div class="mu num" id="pcount" style="margin-left:auto"></div></div>
    <div class="bar pbar2"><i id="pprog" style="width:0"></i></div>
    <div class="card">
      <div class="pmeth" id="pguide" hidden></div><div class="pq" id="pq" aria-live="polite"></div><div class="mu" id="ppar" style="text-align:center;min-height:1.4em"></div>
      <input class="inp pin" id="pin" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Your answer">
      <div class="pmsg" id="pfb" role="status" aria-live="polite"></div>
      <div class="btns"><button class="btn" data-act="runHint" id="phint" ${R.hints ? '' : 'hidden'}>${icon('bulb')} Hint</button><button class="btn primary" data-act="runNext" id="pnext" data-primary hidden>Next</button></div></div>
    <p class="mu" style="text-align:center;margin-top:12px">${mode == 'practise' ? 'Hints are free here. Wrong twice and the answer is shown.' : mode == 'test' || mode == 'retain' ? 'No hints. One try per question. Pace counts.' : 'No hints. One try per question.'}</p></div>`;
  $('#pin').addEventListener('input', onType);
  showQ();
}
function showQ() {
  const s = run.s;
  if (!s.next()) return;
  locked = false;
  const R = s.rule, p = s.cur;
  $('#pq').textContent = p.q; $('#pcount').textContent = (s.n + 1) + ' of ' + R.n;
  $('#pprog').style.width = (100 * s.n / R.n) + '%';
  const par = Math.round(10 * T(p.sk, p.d, p.a)) / 10;
  $('#ppar').textContent = run.mode == 'test' || run.mode == 'retain' ? 'par ' + par.toFixed(1) + ' s' : '';
  const g = $('#pguide'); g.hidden = !(run.mode == 'practise' && s.n < R.guided); g.innerHTML = g.hidden ? '' : '<b>Method:</b> ' + esc(s.stg.key);
  $('#pfb').innerHTML = ''; $('#pnext').hidden = true; $('#phint').disabled = false;
  const i = $('#pin'); i.value = ''; i.disabled = false; i.focus({ preventScroll: true });
}

function onType(e) {
  const el = e.target;
  if (locked || !run) return (el.value = '');
  const s = run.s, v = el.value.replace(/−/g, '-').replace(/[^\d./-]/g, '');       // the field mirrors the session's buffer, so only the tail is new
  if (v.length < s.buf.length) { s.back(); el.value = s.buf; return; }
  for (const ch of v.slice(s.buf.length)) {
    const r = s.judgeBuf(ch);
    el.value = s.buf;
    if (r == 'ok') return right();
    if (r == 'bad') return wrong();
  }
}
const fb = (h) => { const f = $('#pfb'); f && (f.innerHTML = h); };
function right() {
  const s = run.s, p = s.cur, res = s.record(true);
  s.checkpoint(); locked = true;
  fb(`<span class="ok">✓ ${res.tm.toFixed(1)} s</span>${p.hinted ? ' <span class="mu">with a hint</span>' : ''}`);
  setTimeout(() => run && advance(), run.mode == 'practise' ? 650 : 380);
}
function wrong() {
  const s = run.s, p = s.cur;
  if (run.mode == 'practise' && p.tries < 2) {
    fb(`<span class="bad">Not quite.</span> <span class="mu">Try again${p.tip ? ': ' + esc(p.tip) : '.'}</span>`);
    const i = $('#pin'); i.classList.add('shake'); setTimeout(() => { i.classList.remove('shake'); if (run && s.cur === p && s.wrong) { s.wrong = 0; s.buf = ''; i.value = ''; } }, 450);
    return;
  }
  locked = true; s.record(false); s.checkpoint();
  const hw = howTo(p);
  fb(`<span class="bad">✗ ${esc(p.q)} = ${esc(p.a)}</span>${p.tip ? `<div class="tip">${esc(p.tip)}</div>` : ''}${hw ? `<div class="tip">${esc(hw)}</div>` : ''}`);
  $('#pin').disabled = true; $('#phint').disabled = true; const nx = $('#pnext'); nx.hidden = false; nx.focus({ preventScroll: true });
}
function advance() { if (!run) return; run.s.finished ? finishRun() : showQ(); }
A.runNext = () => advance();
A.runHint = () => {
  if (!run || locked) return;
  const h = run.s.hint();
  fb(`${h.tip ? `<div class="tip">${esc(h.tip)}</div>` : ''}<div class="tip">${esc(h.how)}</div>`);
  const i = $('#pin'); i && i.focus({ preventScroll: true });
};
A.runLeave = () => { if (!run) return; const n = run.s.n; run = null; locked = false; save(); if (n) toast('Your answers so far are kept in your notebook and stats'); ctx.scr = 'lesson'; mark('path'); lesson(); };

function finishRun() {
  const { s, mode, ret } = run, v = s.verdict();
  run = null; locked = false;
  const si = ctx.si, k = ctx.k;
  if (mode == 'practise') donePhase(k, si, 2);
  else recordCheck(k, si, mode, { ...v, ret });
  save();
  ctx.res = { v, rows: s.rows, mode, ret, si, k, stage: s.stg };
  ctx.scr = 'result';
  if (v.pass && mode != 'practise') burst(mode == 'test' || mode == 'retain' ? 70 : 36);
  result();
}

function result() {
  const { v, rows, mode, ret, si, k } = ctx.res, st = PATHS[k].stages[si], last = si == PATH_STAGES - 1;
  const R = RULES[mode](st), P = progress(k);
  const title = mode == 'practise' ? 'Practice complete' : v.pass ? (mode == 'retain' ? 'Retained ✓' : last ? 'Mastery assessment passed' : 'Stage ' + (si + 1) + ' passed') : 'Not this time';
  const why = v.pass ? '' : v.reason == 'pace' ? `Accurate enough, but your average pace was ${v.pace}× par and the limit is ${v.paceLimit}×. Speed comes from the shortcuts, so a refresher helps.` : `You need ${v.need} first-try answers and had ${v.correct}. A hinted answer or a corrected slip does not count.`;
  let next = '';
  if (mode == 'practise') next = `<button class="btn primary" data-act="pathPhase" data-v="3" data-primary>Next: the check</button><button class="btn" data-act="runStart" data-v="practise">More practice</button>`;
  else if (mode == 'retain') next = `<button class="btn primary" data-act="pathMap" data-primary>Back to the path</button>${v.pass ? '' : `<button class="btn" data-act="pathStage" data-v="2">Refresher: shortcuts</button>`}`;
  else if (v.pass && !last) next = `<button class="btn primary" data-act="pathStage" data-v="${esc(si + 1)}" data-primary>Continue to stage ${si + 2}</button><button class="btn ghost" data-act="pathMap">Path map</button>`;
  else if (v.pass) next = `<button class="btn primary" data-act="pathMap" data-primary>See the retention checks</button>`;
  else next = `<button class="btn primary" data-act="runStart" data-v="${esc(mode)}" data-primary>Try again</button><button class="btn" data-act="pathPhase" data-v="0">Review the lesson</button><button class="btn ghost" data-act="pathMap">Path map</button>`;
  const note = v.pass && last && mode != 'retain' ? `<p class="ok" style="margin-top:10px">Your next-day check opens ${esc(when(P.ret[0].dueAt))}. Come back then: the point is to see what you still remember.</p>` : v.pass && mode == 'retain' && ret == 0 && P.ret[1] && P.ret[1].dueAt ? `<p class="mu" style="margin-top:10px">The one-week check opens ${esc(when(P.ret[1].dueAt))}.</p>` : '';
  main().innerHTML = `<div class="card pres ${mode == 'practise' || v.pass ? 'pass' : 'fail'}" style="--sc:${COL[k]}"><div class="eyebrow">${esc(SK[k].n)} · ${esc(KINDS[si])}</div><h1>${esc(title)}</h1>
    <div class="pscore"><b class="num">${v.correct}/${v.n}</b><span class="mu">${mode == 'practise' ? 'first try' : 'first-try correct'}${R.need ? ' · ' + R.need + ' needed' : ''}</span></div>
    ${v.pace && R.pace ? `<div class="pace ${R.pace && v.pace > R.pace ? 'bad' : ''}">Pace ${v.pace}× par${R.pace ? ' (limit ' + R.pace + '×)' : ''}</div>` : ''}
    ${why ? `<p>${esc(why)}</p>` : ''}${note}<div class="btns pnav">${next}</div></div>
    <h2>Every answer</h2><div class="card"><div class="plist">${rows.map((x) => `<div class="prow"><span>${esc(x.q)} = <b>${esc(x.a)}</b>${x.hinted ? ' <span class="mu">· hint</span>' : !x.first && x.ok ? ' <span class="mu">· slip first</span>' : ''}${x.ok ? '' : `<br><span class="mu">${esc(howTo({ q: x.q, a: x.a, sk: k }))}</span>`}</span><span><span class="mu num">${x.tm.toFixed(1)}s</span> <span class="${x.ok ? 'ok' : 'bad'}">${x.ok ? '✓' : '✗'}</span></span></div>`).join('')}</div></div>`;
  scrollTo({ top: 0, behavior: 'instant' });
}

/* ---------- actions ---------- */
function open(k, si, ph) { ctx.k = k; ctx.si = si; ctx.ph = ph; ctx.dm = newDemo(); }
function render() { mark('path'); (ctx.scr == 'lesson' ? lesson : ctx.scr == 'result' ? result : map)(); }
A.pathOpen = (d) => { if (!PATHS[d.v]) return; ctx.k = d.v; ctx.scr = 'map'; go('path'); };
A.pathMap = () => { run = null; ctx.scr = 'map'; render(); scrollTo({ top: 0, behavior: 'instant' }); };
A.pathExit = () => go('learn');
A.pathLib = (d) => { import('./learn.js').then((m) => { m.setLearnFilter(d.v); go('learn'); }); };
A.pathStage = (d) => {
  const si = +d.v, s = progress(ctx.k).stages[si];
  if (!s || !s.open) return;
  ctx.si = si; ctx.ph = s.done ? 0 : Math.min(s.ph, 3); ctx.dm = newDemo(); ctx.scr = 'lesson'; render(); scrollTo({ top: 0, behavior: 'instant' });
};
A.pathTestOut = (d) => { A.pathStage(d); A.pathPhase({ v: 3 }); };
A.pathPhase = (d) => {
  const ph = +d.v;
  if (ph < 0 || ph > 3) return;
  ctx.si = ctx.res && ctx.scr == 'result' ? ctx.res.si : ctx.si;
  ctx.ph = ph; ctx.dm = ph == 1 ? newDemo() : ctx.dm; ctx.scr = 'lesson'; render(); scrollTo({ top: 0, behavior: 'instant' });
};
A.pathNext = () => { donePhase(ctx.k, ctx.si, ctx.ph); save(); ctx.ph = Math.min(3, ctx.ph + 1); if (ctx.ph == 1) ctx.dm = newDemo(); lesson(); scrollTo({ top: 0, behavior: 'instant' }); };
A.runStart = (d) => { if (run) return; if (d.v == 'practise' || d.v == 'check' || d.v == 'test') { if (ctx.scr == 'result' && ctx.res) ctx.si = ctx.res.si; startRun(d.v); } };
A.retStart = (d) => { const i = +d.v; if (run || !RET[i] || progress(ctx.k).ret[i].state == 'locked') return; ctx.si = PATH_STAGES - 1; startRun('retain', i); };

register('path', () => {
  if (ctx.scr != 'run') run = null;           // arriving from elsewhere: any run left behind by a tab switch is gone
  if (ctx.scr == 'run' && !run) ctx.scr = 'map';
  if (ctx.scr == 'result' && !ctx.res) ctx.scr = 'map';
  document.title = SK[ctx.k].n + ' path · Mental Math';
  if (ctx.scr == 'run') return;
  ctx.scr == 'lesson' ? lesson() : ctx.scr == 'result' ? result() : map();
});

/* ---------- keys and visibility ---------- */
addEventListener('keydown', (e) => {
  if (view.scr != 'path' || dialogOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
  const tg = e.target, typing = tg && tg.matches && tg.matches('input,textarea,select');
  if (e.key == 'Escape') { e.preventDefault(); if (run) A.runLeave(); else if (ctx.scr == 'map') go('learn'); else A.pathMap(); return; }
  if (e.key == 'Enter') {
    if (typing && tg.id == 'dans') { e.preventDefault(); return A.demoCheck(); }
    if (typing && tg.id == 'pin') { e.preventDefault(); const nx = $('#pnext'); if (nx && !nx.hidden) A.runNext(); return; }
    if (typing || (tg.matches && tg.matches('button,a,summary'))) return;
    const b = $('[data-primary]'); if (b && !b.hidden) { e.preventDefault(); b.click(); }
  }
});
document.addEventListener('visibilitychange', () => { if (!run) return; if (document.hidden) run.s.pause(); else run.s.resume(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && run && run.s.n) run.s.checkpoint(); });
