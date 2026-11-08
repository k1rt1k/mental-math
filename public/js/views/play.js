// The practice screen: drives a Session and paints the board, HUD, keypad and live feedback.
import { S, save } from '../state.js';
import { buzz, nudge, bump, pulse } from '../motion.js';
import { patchInto } from '../morph.js';
import { SK, COL, IDS, T, how as howTo, symFor, showAns } from '../engine.js';
import { Session, applyRust, LIVES, SPRINT } from '../session.js';
import { $, esc, mmss } from '../util.js';
import { toast, icon } from '../ui.js';
import { A, go, mark, view } from '../nav.js';
import { padOn, isTouch } from '../theme.js';
import { showResults } from './results.js';

let sess = null, tickId = 0, cdId = 0, counting = false, locked = false, WL = null, AC = null;
export const isPlaying = () => !!sess;
/** The last run's mode and config override, so "Play again" repeats a drill exactly instead of falling back to the saved setup. */
export let lastRun = null;

async function wake(on) {
  try { if (on && 'wakeLock' in navigator) WL = await navigator.wakeLock.request('screen'); else if (WL) { WL.release(); WL = null; } } catch (e) { /* not supported */ }
}

function sound(ok) {
  try { if (!S.noHap && !ok && navigator.vibrate) navigator.vibrate(40); } catch (e) { /* no haptics */ }
  if (S.mute) return;
  try {
    AC = AC || new AudioContext();
    if (AC.state == 'suspended') AC.resume();      // iOS/Safari start suspended until a gesture resumes them
    const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime, dur = ok ? 0.07 : 0.16;
    o.frequency.value = ok ? 740 + Math.min(sess ? sess.combo : 0, 12) * 22 : 170;
    o.type = ok ? 'sine' : 'square';
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(ok ? 0.05 : 0.035, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);   // soft attack/release: no clicks
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch (e) { /* audio blocked */ }
}

const padKeys = () => (S.padFlip ? [7, 8, 9, 4, 5, 6, 1, 2, 3, '', 0, '⌫'] : [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫']);
const padHtml = () => '<div class="pad" role="group" aria-label="Number pad">' + padKeys().map((k) => k === '' ? `<button type="button" class="fn sym hintk" id="symk" data-act="key" data-v="h" aria-label="Show the method (half points)">${icon('bulb')}</button>` : `<button type="button" class="${k === '⌫' ? 'fn' : ''}" data-act="key" data-v="${esc(k === '⌫' ? 'Backspace' : k)}" aria-label="${esc(k === '⌫' ? 'Backspace' : k)}">${k === '⌫' ? icon('back') : k}</button>`).join('') + '</div>'
  + `<div class="padact one"><button type="button" class="btn" id="hintb" data-act="key" data-v="h" aria-label="Show the method (half points)" hidden>${icon('bulb')} Hint</button>${S.ent ? '<button type="button" class="btn primary" data-act="key" data-v="Enter" aria-label="Submit answer">Submit</button>' : ''}<button type="button" class="btn" id="skipb" data-act="key" data-v="Skip" aria-label="Skip question">Skip</button></div>`;
const PAD = () => padHtml();

/** opt: see Session. cfg: optional config override for this run only; it is never saved, so a drill can't leave hidden state behind. */
export function start(opt, cfg) {
  if (sess) return;
  lastRun = { opt, cfg };
  const msg = applyRust();
  if (msg) toast(msg, { ms: 4500 });
  sess = new Session(opt, { cfg });
  rolling = false;
  locked = false; counting = true;
  mark('play');
  document.title = 'Get ready · Mental Math';
  const sv = sess.kind == 'survival';
  $('#main').innerHTML = `<div class="play${S.noTimer ? ' nt' : ''}${S.noQLine ? ' nq' : ''}${sv ? ' sv' : ''}"><div>
    <div class="hud">
      <button class="btn sm" data-act="pause" aria-label="Pause session">${icon('pause')} Pause<kbd>Esc</kbd></button>
      <div class="cl"><div class="big" id="t"></div><div class="lbl" id="tl"></div></div>
      <div class="pts"><div class="big" id="pt">0</div><div class="lbl" id="acc">points</div></div>
    </div>
    <div class="bar tbar" ${sess.un || sv ? 'hidden' : ''}><i id="tb" style="width:100%;background:var(--ac)"></i></div>
    <div class="bar tbar pbar" id="pbw" ${sess.kind == 'sprint' || sess.kind == 'review' ? '' : 'hidden'} role="progressbar" aria-label="Questions done" aria-valuemin="0" aria-valuemax="100"><i id="pb" style="width:4%;background:var(--ok)"></i></div>
    <div class="race" ${sess.kind == 'sprint' || !sess.ghost ? 'hidden' : ''}><div class="lg"><span>You <b id="yp" class="num">0</b></span><span id="gh"></span><span>Ghost <b id="gp" class="num">–</b></span></div><div class="bar"><i class="gh" id="gb"></i><i class="me" id="yb"></i></div></div>
    <div class="board cd" id="qc"><div class="tag"><span class="pill" id="sk">Get ready</span><span class="tagr"><span id="pr" class="mu"></span><span id="bn" class="gd"></span><span id="cc" class="cmbchip" hidden></span>${S.pace ? '<span id="pcv" class="pcv num" aria-hidden="true"></span>' : ''}</span></div>
      <div class="q" id="q" aria-live="polite">3</div><div class="bf" id="bf" aria-label="Your answer"></div><span class="qtl" aria-hidden="true">Pace vs par</span><div class="qt" title="Your time on this question against its par time"><i id="qt"></i></div></div>
    <div class="msg" id="ms" role="status" aria-live="polite"></div>
    ${PAD()}${!padOn() && isTouch() ? '<input id="kin" class="kin" inputmode="numeric" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Your answer" value=" ">' : ''}<div class="mu hint">${S.ent ? '<button type="button" class="lnk2" data-act="key" data-v="Enter"><kbd>Enter</kbd> submit</button> · <button type="button" class="lnk2" data-act="key" data-v="Skip"><kbd>Space</kbd> skip</button>' : '<button type="button" class="lnk2" data-act="key" data-v="Enter"><kbd>Enter</kbd> skip</button>'} · <button type="button" class="lnk2" data-act="key" data-v="h"><kbd>H</kbd> show method</button> · <button type="button" class="lnk2" data-act="pause"><kbd>Esc</kbd> pause</button> · ${S.ent ? 'nothing is judged until you submit' : 'answers submit as you type'}</div>
   </div>
   <aside class="side" aria-label="Live stats">
    <div class="card"><div class="mu">Correct in a row</div><div class="cmb num" id="cmb">0</div><div class="mu" id="bcm">best 0</div></div>
    <div class="card"><div class="mu">By skill</div><div id="sb" class="mu"><span class="ph">Fills in as you answer</span></div></div>
    <div class="card"><div class="mu">Last answers</div><div id="fd" class="mu"><span class="ph">Your last few answers</span></div></div>
   </aside></div>`;
  head();
  wake(true);
  softKeys();
  let c3 = 3;
  const tickCd = () => { const q = $('#q'); if (q) { q.classList.remove('tk'); void q.offsetWidth; q.classList.add('tk'); } };   // each countdown number pops in
  tickCd();
  const go0 = () => { clearInterval(cdId); counting = false; $('#qc') && $('#qc').classList.remove('cd'); sess.begin(); document.title = 'Mental Math'; nextQ(); clearInterval(tickId); tickId = setInterval(tick, 100); if (document.hidden) pause(); };   // the countdown can finish while the app is in the background: do not burn the clock
  sess.go = go0;
  if (S.noCd) go0(); else cdId = setInterval(() => { c3--; if (c3 > 0) { $('#q').textContent = c3; tickCd(); buzz(8); } else go0(); }, 650);
}


/** Touch device with the on-screen keypad switched off: a hidden field brings up the OS number keyboard. */
function softKeys() {
  const k = $('#kin');
  if (!k) return;
  const focus = () => k.focus({ preventScroll: true });
  $('#qc').addEventListener('click', focus);
  k.addEventListener('input', () => {
    const v = k.value;
    k.value = ' ';                                        // a sentinel space lets us see Backspace on an "empty" field
    if (v.length < 1) playKey('Backspace');
    else for (const ch of v.replace(/\s/g, '')) if (/[\d./−-]/.test(ch)) playKey(ch);
  });
  k.addEventListener('keydown', (e) => { if (e.key == 'Enter') { e.preventDefault(); playKey('Enter'); } });
  setTimeout(focus, 0);
}

function head() {
  const sv = sess.kind == 'survival';
  $('#tl').textContent = sv ? 'lives' : sess.un ? 'elapsed' : 'time left';
  $('#t').innerHTML = sv ? hearts() : mmss(sess.un ? 0 : sess.dur);
  $('#t').style.color = '';
}
/** The heart that was just lost swells, flashes and settles into its empty state. */
function lifeLost() {
  const h = document.querySelector('.lives .gone svg'); if (!h || still() || !h.animate) return;
  h.animate([{ transform: 'scale(1.7)', opacity: 1, filter: 'drop-shadow(0 0 6px var(--bad))' }, { transform: 'scale(.8) rotate(-12deg)', opacity: .9, offset: .45 }, { transform: 'scale(1)', opacity: 1, filter: 'drop-shadow(0 0 0 transparent)' }], { duration: 620, easing: 'cubic-bezier(.22, 1, .36, 1)' });
}
const hearts = () => `<span class="lives" role="img" aria-label="${sess.lives} lives left">${icon('heart', 'fill').repeat(sess.lives)}<span class="gone">${icon('heart', 'fill').repeat(LIVES - sess.lives)}</span></span>`;

/** The answered question slides away as a ghost while the new one rises in. Purely visual and never blocks input. */
function leave() {
  const q = $('#q'), host = $('#qc');
  if (!q || !host || !q.textContent || still()) return;
  const r = q.getBoundingClientRect(), hr = host.getBoundingClientRect(), g = document.createElement('div');
  g.className = 'q qx'; g.textContent = q.textContent; g.setAttribute('aria-hidden', 'true');
  g.style.cssText = `position:absolute;left:${(r.left - hr.left - host.clientLeft).toFixed(1)}px;top:${(r.top - hr.top - host.clientTop).toFixed(1)}px;width:${r.width.toFixed(1)}px;margin:0;pointer-events:none;z-index:1`;
  host.append(g);
  const a = g.animate([{ opacity: .5, transform: 'translateX(0) scale(1)' }, { opacity: 0, transform: 'translateX(-38px) scale(.94)' }], { duration: 190, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' });
  a.onfinish = a.oncancel = () => g.remove(); setTimeout(() => g.remove(), 500);
}
const still = () => document.documentElement.dataset.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches;

/** First question you ever see: say what "par 4.4s" and "Multi-step · 400" mean, once, in the message line (no layout shift). Stored on this device only. */
function termsNote(rating) {
  if (S.tipPar) return;
  S.tipPar = 1; save();
  $('#ms').innerHTML = `<div class="cmark"><span><b>par</b> is the target time for this question.${rating ? ` <b>${esc(rating)}</b> is your rating in this skill.` : ''}</span><button type="button" class="lnk2" data-act="cmOk">Got it</button></div>`;
}
A.cmOk = () => { const el = $('#ms'); if (el) el.innerHTML = ''; };

function nextQ() {
  if (!sess.next()) return end();
  locked = false;
  leave();
  const p = sess.cur, c = COL[p.sk];
  $('#bn').textContent = p.bonus ? 'Bonus ×2 points' : sess.kind == 'sprint' ? Math.min(SPRINT, sess.n + 1) + ' / ' + SPRINT : sess.kind == 'review' ? 'Question ' + Math.min(sess.total, Object.keys(sess.done).length + 1) + ' of ' + sess.total : '';
  $('#q').textContent = p.q; $('#q').classList.toggle('wordy', p.q.length > 22);   // word problems (Real-life ratios) are sentences: smaller type so they sit in two lines
  const pw = $('#pbw');
  if (pw && !pw.hidden) { const f = sess.kind == 'sprint' ? sess.n / SPRINT : Object.keys(sess.done).length / Math.max(1, sess.total), w = Math.round(100 * Math.min(1, f)); $('#pb').style.width = Math.max(4, w) + '%'; pw.setAttribute('aria-valuenow', w); }   // 4% floor is visual only: a bar that starts with a sliver reads as begun, and aria-valuenow stays the true figure
  $('#pr').textContent = 'par ' + T0(p).toFixed(1) + 's';
  $('#pr').title = 'Par: the target time for this question. Answer faster and your pace bar stays green.';
  const lv = sess.kind == 'daily' || sess.kind == 'survival' || sess.kind == 'sprint' ? '' : ' · ' + Math.round(S.sk[p.sk].lv * 100);
  $('#sk').textContent = SK[p.sk].n + lv + (p.rt ? ' · review' : '');
  $('#sk').title = lv ? SK[p.sk].n + ' · your rating in this skill (100 to 1200). Higher means harder questions.' : SK[p.sk].n;
  termsNote(lv.replace(/^ · /, ''));
  $('#qc').style.setProperty('--cc', c);
  $('#qc').style.borderColor = c + '88';
  $('#bf').innerHTML = '<span class="cur"></span>'; bl = 0;
  const sym = symFor(p.sk), sk = $('#symk'), kin = $('#kin');
  if (sk) {   // the slot is the symbol key when the question needs one; otherwise it is the Hint key, so it is never dead space
    const hintB = $('#hintb');
    sk.classList.toggle('hintk', !sym);
    if (sym) { sk.dataset.v = sym; sk.textContent = showAns(sym); sk.setAttribute('aria-label', { '-': 'Minus sign', '/': 'Fraction slash', '.': 'Decimal point' }[sym] || ''); }
    else { sk.dataset.v = 'h'; sk.innerHTML = icon('bulb'); sk.setAttribute('aria-label', 'Show the method (half points)'); }
    sk.tabIndex = 0; sk.removeAttribute('aria-hidden');
    if (hintB) { hintB.hidden = !sym; hintB.parentNode.classList.toggle('one', !sym && !S.ent); }   // Hint moves to the action row only while the slot is busy with a symbol
  }
  if (kin) kin.inputMode = sym ? 'text' : 'numeric';   // the number keyboard has no minus or slash
  const q = $('#q'); q.classList.remove('in'); void q.offsetWidth; q.classList.add('in');
}

let bl = 0;   // length of the answer buffer at the last paint: only a digit that was just added pops
const digits = (b, grew) => (grew && b ? esc(showAns(b.slice(0, -1))) + '<span class="dg">' + esc(showAns(b.slice(-1))) + '</span>' : esc(showAns(b)));
const renderBuf = () => { const b = sess.buf, grew = b.length > bl; bl = b.length; const A = String(sess.cur.a), off = b && !A.startsWith(sess.buf) && !A.replace(/^(-?)0\./, '$1.').startsWith(sess.buf); $('#bf').innerHTML = (off ? '<span class="bad">' + digits(b, grew) + '</span>' : digits(b, grew)) + '<span class="cur"></span>'; };   // red as soon as a digit can no longer lead to the answer; Backspace still fixes it before it counts
function flash(ok) { buzz(ok ? 4 : [14, 36, 14]); const c = $('#qc'); if (!c) return; c.classList.remove('okf', 'badf'); void c.offsetWidth; c.classList.add(ok ? 'okf' : 'badf'); if (ok) bump($('#cc')); else nudge($('#q')); }

function side(r) {
  pulse($('#cmb'), sess.combo, 1.14); $('#bcm').textContent = 'best ' + sess.bc;
  const cc = $('#cc'); if (cc) { cc.hidden = sess.combo < 3; cc.innerHTML = icon('flame', 'fill') + sess.combo; }
  if (r) patchInto($('#fd'), sess.feed.map((f) => `<div class="fr" data-k="${esc(f[0])}@${Number(f[2]).toFixed(3)}"><span>${esc(f[0])}</span><span class="${f[1] ? (f[3] <= 0.7 ? 'ok' : '') : 'bad'}">${f[1] ? f[2].toFixed(1) + 's' : '✗'}</span></div>`).join('') || '<span class="ph">Your last few answers</span>');
  patchInto($('#sb'), IDS.filter((k) => sess.by[k]).map((k) => { const b = sess.by[k]; return `<div class="fr" data-k="${esc(k)}"><span class="kc" style="--sc:${COL[k]}">${esc(SK[k].n)}</span><span>${b[1]}/${b[0]}</span></div>`; }).join('') || '<span class="ph">Fills in as you answer</span>');
}

function feedback(r) {
  const p = r.p;
  sound(r.ok); flash(r.ok);
  if (sess.kind == 'survival') { $('#t').innerHTML = hearts(); if (!r.ok) lifeLost(); }
  if (r.ok && [10, 25, 50, 100].includes(sess.combo)) toast(sess.combo + ' in a row');
  if (r.mastered) toast('Mastered: ' + p.q);
  else if (r.lapse) toast('Back in the notebook: ' + p.q);
  if (r.rough) toast('Rough patch: accuracy first, slow down a touch');
  const hw = r.ok ? '' : howTo(p);
  $('#ms').innerHTML = r.ok
    ? (r.lvl ? `<span class="gd">Level up: ${esc(r.lvl)}</span>` : `<span class="${r.r <= 0.7 ? 'ok' : 'mu'}">${r.tm.toFixed(1)}s${r.r <= 0.7 ? ' ' + icon('bolt', 'fill sm') : ''}</span>`)
    : `<span class="bad">✗ ${esc(p.q)} = ${esc(p.a)}</span>${p.tip ? `<div class="tip">${esc(p.tip)}</div>` : ''}${hw ? `<div class="tip">${esc(hw)}</div>` : ''}`;
  side(true);
}

/** A correct answer: score it and move on. */
function solved() {
  $('#bf').innerHTML = `<span class="ok">${esc(showAns(sess.buf))}</span>`;
  feedback(sess.answer(true));
  if (sess.n % 10 == 0) sess.checkpoint();
  if (sess.kind == 'sprint' && sess.n >= sess.target) { locked = true; return setTimeout(() => sess && end(), 250); }
  nextQ();
}
/** A wrong answer that has already been counted as a slip. */
function slipped() {
  const bf = $('#bf'); bf.innerHTML = `<span class="bad">${esc(showAns(sess.buf))}</span>`;
  sound(false); flash(false); side(false);
  if (sess.kind == 'survival') { $('#t').innerHTML = hearts(); lifeLost(); }
  bf.classList.remove('shake'); void bf.offsetWidth; bf.classList.add('shake');
  if (sess.over) { locked = true; setTimeout(() => sess && end(), 800); return; }
  const cur = sess.cur;
  setTimeout(() => { if (sess && sess.cur === cur && sess.wrong) { sess.wrong = 0; sess.buf = ''; renderBuf(); } }, 450);
}
const GRACE_MS = 1500;
/** Right length, last digit one key off: nothing is counted yet. Backspace or another digit fixes it; otherwise it becomes a slip. */
function near() {
  $('#bf').innerHTML = `<span class="near">${esc(showAns(sess.buf))}</span><span class="cur"></span>`;
  $('#ms').innerHTML = '<span class="mu">Close. Fix the last digit.</span>';
  const cur = sess.cur, t0 = Date.now();
  const settle = () => {
    if (!sess || sess.cur !== cur || !sess.grace) return;
    if (sess.paused || Date.now() - t0 < GRACE_MS) return setTimeout(settle, sess.paused ? 300 : GRACE_MS - (Date.now() - t0));   // the clock is stopped while paused, so is the grace
    if (sess.commit() == 'bad') slipped();
  };
  setTimeout(settle, GRACE_MS);
}
function press(dg) {
  if (locked) return;
  const res = sess.type(dg);
  if (res == 'ok') solved();
  else if (res == 'bad') slipped();
  else if (res == 'near') near();
  else renderBuf();
}
/** Enter-to-submit mode: judge what has been typed. */
function submit() {
  if (locked) return;
  const res = sess.submit();
  if (res == 'ok') solved(); else if (res == 'bad') slipped();
}

function skip() {
  if (locked) return;
  sess.grace = 0;
  const r = sess.answer(false);
  feedback(r);
  if (sess.n % 10 == 0) sess.checkpoint();
  if (sess.over) { locked = true; setTimeout(() => sess && end(), 800); return; }
  if (sess.kind == 'sprint' && sess.n >= sess.target) { locked = true; return setTimeout(() => sess && end(), 250); }
  nextQ();
}

function tick() {
  if (!sess || sess.paused || counting) return;
  if (sess.idle()) { pause(); return toast('Auto-paused: no answer for 30 seconds'); }
  const el = sess.tick();
  if (sess.timedOut) return end();
  const qe = $('#qt');
  if (qe && sess.cur) {
    const rr = sess.qAge() / (Math.max(0.3, T0(sess.cur)));
    qe.style.width = Math.max(0, 100 * (1 - rr / 2)) + '%';
    qe.style.background = rr <= 0.7 ? 'var(--ok)' : rr <= 1.4 ? 'var(--gd)' : 'var(--bad)';
    const pv = $('#pcv'); if (pv) { pv.textContent = sess.qAge().toFixed(1) + ' / ' + T0(sess.cur).toFixed(1) + ' s'; pv.style.color = rr <= 0.7 ? 'var(--ok)' : rr <= 1.4 ? 'var(--gd)' : 'var(--bad)'; }   // optional pace readout: seconds on this question against the target
  }
  if (sess.kind != 'survival') {
    const left = sess.left(), c = sess.un ? Math.floor(el) : Math.ceil(left);
    if (!sess.un && left <= 10) pulse($('#t'), mmss(c), 1.1); else $('#t').textContent = mmss(c);   // the last ten seconds tick
    $('#t').style.color = !sess.un && left <= 10 ? 'var(--bad)' : '';
    if (!sess.un) $('#tb').style.width = (100 * left) / sess.dur + '%';
    document.title = S.noTimer ? 'Mental Math' : mmss(c) + ' · Mental Math';
  } else $('#tl').textContent = S.noTimer ? 'lives' : 'lives · ' + mmss(el);
  rollPts();
  if (sess.kind == 'sprint') $('#acc').textContent = sess.n + ' of ' + SPRINT + (sess.slips + sess.skips ? ' · +' + (3 * sess.slips + 5 * sess.skips) + ' s' : '');
  else $('#acc').textContent = sess.n ? sess.ok + ' correct · ' + Math.round((100 * sess.ok) / sess.n) + '%' + '' : 'points';
  let gp = 0;
  if (sess.ghost) for (const e of sess.ghost) { if (e[0] <= el) gp = e[1]; else break; }
  const mx = Math.max(sess.gmax, sess.pts, 1);
  $('#yp').textContent = sess.pts; $('#gp').textContent = sess.ghost ? gp : 'first run';
  $('#yb').style.width = (100 * sess.pts) / mx + '%'; $('#gb').style.left = (100 * gp) / mx + '%';
  $('#gh').innerHTML = sess.ghost ? (sess.pts >= gp ? `<span class="ok">${sess.pts - gp} ahead</span>` : `<span class="bad">${gp - sess.pts} behind</span>`) : 'you set the ghost';
}
const T0 = (p) => T(p.sk, p.d, p.a);

/** Points count up to the new total instead of jumping (a bigger gain rolls further). Reduce motion and tiny gains just set it. */
let rollTo = 0, rolling = false;
function rollPts() {
  const el = $('#pt'); if (!el) return;
  rollTo = sess.pts;
  const from = +el.textContent || 0;
  if (rolling || from === rollTo) return;
  if (still() || !el.animate || rollTo < from || rollTo - from < 3) return pulse(el, rollTo, 1.08);
  rolling = true; const t0 = performance.now();
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)', offset: .3 }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(.3,1.12,.5,1)' });
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 260);
    el.textContent = Math.round(from + (rollTo - from) * (1 - (1 - k) ** 3));
    if (k < 1 && document.contains(el)) requestAnimationFrame(step); else { rolling = false; if (document.contains(el)) el.textContent = rollTo; }
  };
  requestAnimationFrame(step);
}

/* ---------- pause / end ---------- */
export function pause() {
  if (!sess || sess.paused || counting) return;
  sess.pause();
  if (sess.n) sess.checkpoint();
  const b = $('#qc');
  b.insertAdjacentHTML('beforeend', `<div class="paused" id="pz" role="dialog" aria-label="Paused"><div class="ptitle">Paused</div><div class="mu">The clock is stopped · ${sess.pts} pts · ${sess.ok}/${sess.n} right</div><div class="btns"><button class="btn primary" data-act="resume">Resume<kbd>Esc</kbd></button><button class="btn" data-act="restartRun">Restart</button><button class="btn ghost" data-act="endNow">End session</button></div></div>`);
  const r = $('#pz .btn'); r && r.focus();
}
export function resume() {
  if (!sess || !sess.paused) return; sess.resume();
  const z = $('#pz');
  if (z) { if (still()) z.remove(); else { z.removeAttribute('id'); z.classList.add('out'); setTimeout(() => z.remove(), 220); } }
  renderBuf();
}
function end() {
  clearInterval(tickId); clearInterval(cdId); wake(false);
  const e = sess; sess = null; counting = false;
  const out = e.finish();
  if (!out) { toast(!e.n ? 'Session cancelled' : e.n < 5 ? 'Too short to count: play at least 5 answers' : 'Nothing answered correctly, so this run was not saved'); return go('home'); }
  showResults(e, out);
}
/**
 * Called on page hide so a closed tab still saves what you did.
 * A page going into the back/forward cache (`persisted`) or a tab merely hidden on a phone comes back alive: finishing the
 * session there left a frozen play screen with no session behind it. In that case only checkpoint and pause.
 */
export function flush(ev) {
  if (!sess || !sess.n) return;
  // beforeunload also fires when the page then goes into the back/forward cache (or the navigation is cancelled), so it must
  // never end the run: only pagehide with persisted === false means the page is really going away.
  if (ev && ev.type == 'beforeunload') { sess.checkpoint(); return; }
  if (ev && ev.persisted) { sess.checkpoint(); pause(); return; }
  clearInterval(tickId); const e = sess; sess = null; e.finish();
}
/** Throw this run away and start the same one again. Ratings already checkpointed stay (they were earned). */
function restart() {
  if (!sess) return;
  clearInterval(tickId); clearInterval(cdId); wake(false);
  const r = lastRun; sess = null; counting = false;
  start(r && r.opt, r && r.cfg);
}

// Auto-pause on blur is debounced: a notification shade, a permission prompt or a click into devtools gives focus back within a moment and must not stop the clock.
// Switching tabs or minimising pauses at once through visibilitychange below; leaving the window for longer than BLUR_MS pauses here.
const BLUR_MS = 1500; let blurId = 0;
addEventListener('blur', () => { if (S.noBlur) return; clearTimeout(blurId); blurId = setTimeout(() => { if (!document.hasFocus()) pause(); }, BLUR_MS); });
addEventListener('focus', () => clearTimeout(blurId));
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (sess && sess.n) sess.checkpoint(); pause(); } else if (sess) wake(true); });

/** Keyboard/keypad input while on this screen. */
export function playKey(k) {
  if (!sess) return false;
  if (counting) { if (k == 'Escape') { clearInterval(cdId); counting = false; sess = null; wake(false); go('home'); } else if (k == 'Enter' || k == ' ') sess.go(); return true; }
  if (sess.paused) { if (k == 'Enter' || k == ' ') resume(); else if (k == 'Escape') resume(); return true; }
  if (/^\d$/.test(k)) { try { !S.noHap && navigator.vibrate && matchMedia('(pointer:coarse)').matches && navigator.vibrate(5); } catch (e) { /* none */ } press(k); }
  else if (/^[-−./]$/.test(k)) press(k == '−' ? '-' : k);   // minus, fraction slash, decimal point: only a question that uses it accepts it
  else if (k == 'Backspace') { sess.back(); renderBuf(); }
  else if (k == 'Enter' && S.ent) submit();   // Enter-to-submit: Enter never skips; Space and the Skip button do
  else if (k == 'Enter' || k == ' ' || k == 'Skip') skip();
  else if (k == 'Escape') pause();
  else if (k == 'h' || k == 'H') { const h = sess.hint(); $('#ms').innerHTML = `${h.tip ? `<div class="tip">${esc(h.tip)}</div>` : ''}<div class="tip">${esc(h.how)}</div><div class="tip">Hint used: half points, no rating change</div>`; }
  return true;
}

A.key = (d) => playKey(d.v);
A.pause = () => pause();
A.resume = () => resume();
A.endNow = () => { if (sess) end(); };
A.restartRun = () => restart();
/** Debug / test hook: the live session, or null. */
export const liveSession = () => sess;
