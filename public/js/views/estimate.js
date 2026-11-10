// Estimation mode: a sum you are not meant to work out exactly. Type your best guess; it counts when it is within ±5, 10 or 20 % of the exact answer.
// Like Flash it is separate from Session: no skills or ratings, only a finished run saved as one session (m: 'est').
import { S, save } from '../state.js';
import { IDS } from '../engine.js';
import { esc, canSpeak } from '../util.js';
import { A, register, go, view } from '../nav.js';
import { icon, toast } from '../ui.js';
import { padOn } from '../theme.js';
import { countsToGoal } from '../stats.js';
import { digitsOnly } from '../chain.js';
import { makeProblem, within, pctOff, accepted, fmtExact, estPts, estKey, TOLS, LEVELS, ROUNDS } from '../estimate.js';
import { seg, blip, buzz, say, hush, speaking, padHtml, playing } from './flash.js';

const KEY = 'mmTrainer.est', BK = 'mmTrainer.estBest';
const KIND_OPTS = [['mix', ['Mixed', 'all']], ['mul', ['×', 'times']], ['div', ['÷', 'divide']], ['add', ['+', 'add']], ['pct', ['%', 'percent']]];
const LEVEL_OPTS = [[1, ['Easy', '2 × 2 digits']], [2, ['Medium', '3 × 2 digits']], [3, ['Hard', '3 × 3 digits']]];
const TOL_OPTS = [[5, ['±5%', 'Sharp']], [10, ['±10%', 'Standard']], [20, ['±20%', 'Relaxed']]];
const DEF = { k: 'mix', l: 1, t: 10 };
export function cfgLoad() {
  let o = {}; try { o = JSON.parse(localStorage[KEY] || '{}'); } catch (e) { /* none saved */ }
  return { k: KIND_OPTS.some((x) => x[0] == o.k) ? o.k : DEF.k, l: LEVELS.includes(o.l) ? o.l : DEF.l, t: TOLS.includes(o.t) ? o.t : DEF.t };
}
const cfgSave = (c) => { try { localStorage[KEY] = JSON.stringify(c); } catch (e) { /* private mode */ } };
// Best score per setting, kept on this device only (like the settings themselves).
const bestAll = () => { try { return JSON.parse(localStorage[BK] || '{}') || {}; } catch (e) { return {}; } };
const bestOf = (cfg) => +bestAll()[estKey(cfg)] || 0;
const bestSet = (cfg, pts) => { try { const b = bestAll(); b[estKey(cfg)] = pts; localStorage[BK] = JSON.stringify(b); } catch (e) { /* private mode */ } };

let E = null;   // the run in progress (E.ph: ask | fb)
const main = () => document.querySelector('#main');
const live = (e) => E === e && view.scr == 'est';
const modeWord = (k) => ({ mul: 'Multiplication', div: 'Division', add: 'Addition', pct: 'Percentages' })[k] || 'Mixed';

function setup() {
  hush(); E = null; playing(false); const c = cfgLoad(), best = bestOf(c);
  document.title = 'Estimate · Mental Math';
  main().innerHTML = `<div class="hd"><h1>Estimate</h1></div>
  <div class="card fl-card"><p class="mu fl-lead">A sum appears. Round to friendly numbers, work it out in your head and type your best guess. It counts when you are within the tolerance. ${ROUNDS} questions.</p>
    <div class="field"><div class="mu">Type</div>${seg('esK', c.k, KIND_OPTS)}</div>
    <div class="field"><div class="mu">Size</div>${seg('esL', c.l, LEVEL_OPTS)}</div>
    <div class="field"><div class="mu">Within</div>${seg('esT', c.t, TOL_OPTS)}</div>
    ${canSpeak() ? `<div class="field"><div class="mu">Speak questions</div>${seg('esV', S.speak ? 1 : 0, [[0, 'Off'], [1, 'On']])}</div>` : ''}
    <div class="fl-best"><span>Best at this setting</span>${best ? `<b>${best} pts</b>` : '<span class="fl-none">No run yet</span>'}</div>
    <div class="fl-btns fl-start"><button class="btn primary" data-act="esGo">${icon('play')} Start<kbd>Enter</kbd></button><button class="btn ghost" data-go="home">Home<kbd>Esc</kbd></button></div>
    <p class="mu fl-note">Working it out exactly is allowed, but it is the slow way. The skill is getting close, fast.</p></div>`;
}
const setC = (k) => (d) => { const c = cfgLoad(); c[k] = k == 'k' ? d.v : +d.v; cfgSave(c); setup(); };
A.esK = setC('k'); A.esL = setC('l'); A.esT = setC('t');
A.esV = (d) => { S.speak = +d.v == 1; save(); if (!S.speak) hush(); else say('Questions will be spoken'); setup(); };
A.est = () => go('est');
A.esGo = () => {
  blip(1, 0.001, 'sine', 0.0001);   // wakes the audio context inside this tap (iOS/Safari)
  if (speaking()) try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) { /* none */ }
  const cfg = cfgLoad(); E = { cfg, i: 0, ok: 0, t0: Date.now(), log: [], v: '', ph: 'ask' }; ask(E);
};

const pips = (e) => Array.from({ length: ROUNDS }, (_, i) => `<i class="${i < e.log.length ? (e.log[i] ? 'ok' : 'bad') : i == e.i ? 'now' : ''}"></i>`).join('');
const top = (e, ask) => `<div class="fl-top"><div class="fl-prog"><span class="fl-rd">Question <b>${e.i + 1}</b> of ${ROUNDS}</span><span class="fl-pips p10" aria-hidden="true">${pips(e)}</span></div><div class="fl-tools">${ask && speaking() ? `<button class="btn sm ghost" data-act="esSay" aria-label="Repeat the question">${icon('redo')}</button>` : ''}${ask ? `<button class="btn sm ghost" data-act="esQuit" aria-label="Quit run">Quit</button>` : ''}</div></div>`;

function ask(e) {
  e.ph = 'ask'; e.v = ''; e.p = makeProblem(e.cfg); const pad = padOn();
  playing(true); scrollTo({ top: 0, left: 0, behavior: 'instant' });
  const lab = `${esc(modeWord(e.cfg.k == 'mix' ? e.p.kind : e.cfg.k))} · estimate within ±${e.cfg.t}%`;
  if (pad) main().innerHTML = `<div class="flw live ask">${top(e, true)}<div class="fl-body"><div class="mu es-lab">${lab}</div><div class="es-prob" id="esp">${esc(e.p.text)}</div><div class="fl-val" id="esa" role="textbox" aria-readonly="true" aria-labelledby="esp"><span class="cur"></span></div></div><div class="fl-foot">${padHtml('esKey', 'esAns')}</div></div>`;
  else {   // keypad switched off in Settings: a plain number box, kept to digits
    main().innerHTML = `<div class="flw live ask">${top(e, true)}<div class="fl-body"><div class="mu es-lab">${lab}</div><label class="es-prob" id="esp" for="esa">${esc(e.p.text)}</label><input class="inp fl-a" id="esa" inputmode="numeric" pattern="[0-9]*" autocomplete="off" aria-label="Your estimate"></div><div class="fl-foot"><div class="fl-btns"><button class="btn primary" data-act="esAns" disabled>Check<kbd>Enter</kbd></button></div></div></div>`;
    const i = document.querySelector('#esa'), chk = document.querySelector('[data-act=esAns]'); i.focus();
    i.addEventListener('input', () => { const d = digitsOnly(i.value); if (i.value !== d) i.value = d; chk.disabled = !d; });
    i.addEventListener('keydown', (ev) => { if (ev.key == 'Enter') { ev.preventDefault(); A.esAns(); } });
  }
  A.esSay();
}
A.esSay = () => { const e = E; if (e && e.ph == 'ask' && e.p) say(e.p.say, 1); };
const showVal = (e) => {
  const el = document.querySelector('#esa'); if (el) el.innerHTML = esc(e.v) + '<span class="cur"></span>';
  const b = document.querySelector('[data-act=esAns]'); if (b) b.disabled = !e.v;   // Check stays dimmed until something is typed
};
A.esKey = (d) => {
  const e = E; if (!e || e.ph != 'ask') return;
  if (d.v == 'Backspace') e.v = e.v.slice(0, -1); else if (/^\d$/.test(d.v)) e.v = digitsOnly(e.v + d.v);
  showVal(e);
};
A.esAns = () => {
  const e = E; if (!e || e.ph != 'ask') return;
  const box = document.querySelector('#esa'), raw = digitsOnly(box && box.tagName == 'INPUT' ? box.value : e.v);
  if (!raw) return;   // nothing typed: stay on the question
  const got = parseInt(raw, 10), p = e.p, ok = within(got, p.exact, e.cfg.t); if (ok) e.ok++;
  e.log.push(ok); e.ph = 'fb';
  if (ok) { blip(740, 0.09, 'sine', 0.05); setTimeout(() => blip(988, 0.12, 'sine', 0.05), 90); } else { blip(170, 0.16, 'square', 0.035); buzz(40); }
  const off = Math.max(-99, pctOff(got, p.exact)), [lo, hi] = accepted(p.exact, e.cfg.t), ex = fmtExact(p.exact), frac = !Number.isInteger(p.exact);
  const how = off == 0 ? (got === p.exact ? 'Spot on' : 'Under 1% off') : Math.abs(off) + '% ' + (off > 0 ? 'too high' : 'too low');
  say((ok ? 'Right. ' : 'Not quite. ') + (frac ? 'It is about ' : 'It is ') + ex + '. You said ' + got + '.');
  main().innerHTML = `<div class="flw live fb" role="status">${top(e, false)}<div class="fl-body"><div class="fl-r ${ok ? 'ok' : 'bad'}">${ok ? 'Right' : 'Not quite'}</div>
    <div class="fl-x"><span class="fl-eq">${esc(p.text)}</span><span class="fl-tot">${frac ? '≈' : '='} ${esc(ex)}</span></div>
    <div class="mu">You typed ${esc(got)} · ${esc(how)}</div><div class="mu fl-sub">Within ±${e.cfg.t}% was ${esc(lo)} to ${esc(hi)}</div></div>
    <div class="fl-foot"><div class="fl-btns"><button class="btn primary" data-act="esNext">${e.i + 1 < ROUNDS ? 'Next question' : 'Finish'}<kbd>Enter</kbd></button></div></div></div>`;
};
A.esNext = () => { const e = E; if (!e || e.ph != 'fb') return; e.i++; if (e.i < ROUNDS) ask(e); else done(e); };
A.esQuit = () => { hush(); E = null; toast('Run stopped'); go('est'); };

function done(e) {
  const cfg = e.cfg, pts = e.ok * estPts(cfg), prev = bestOf(cfg), isBest = e.ok > 0 && pts > prev && prev > 0;
  let goal = false;
  if (e.ok > 0) {   // like every other mode, a run with nothing right is not a session
    const lv = {}; IDS.forEach((k) => (lv[k] = +S.sk[k].lv.toFixed(2)));
    const s = { t: Date.now(), m: 'est', dur: Math.max(1, Math.round((Date.now() - e.t0) / 1000)), n: ROUNDS, ok: e.ok, ft: e.ok, pts, tm: 0, by: {}, lv, off: 0 };
    goal = countsToGoal(s);
    S.sessions.push(s);
    if (pts > prev) bestSet(cfg, pts);
    save();
  }
  e.ph = 'done'; playing(false);
  say(`${e.ok} out of ${ROUNDS} within ${cfg.t} percent. ${pts} points.`);
  const lvl = LEVEL_OPTS.find((x) => x[0] == cfg.l)[1][0], kind = KIND_OPTS.find((x) => x[0] == cfg.k)[1][0] == 'all' ? 'mixed' : modeWord(cfg.k).toLowerCase();
  main().innerHTML = `<div class="flw res"><div class="fl-body"><div class="mu fl-cfg">Estimate · ${esc(kind)} · ${esc(lvl.toLowerCase())} · within ±${cfg.t}%</div>
    <div class="fl-r ${e.ok >= 8 ? 'ok' : ''}">${e.ok} / ${ROUNDS}</div><div class="mu">${e.log.map((x) => `<span class="fdot ${x ? 'on' : ''}"></span>`).join('')}</div>
    <div class="fl-x">${pts} pts${isBest ? ' · new best for this setting' : prev ? ' · best here ' + Math.max(prev, pts) : ''}</div>
    ${e.ok > 0 ? `<div class="mu fl-sub">Counts toward today’s streak${goal ? ' and daily goal' : ''}.</div>` : ''}
    <div class="mu fl-tip">${e.ok >= 8 ? 'Sharp. Try a tighter tolerance or a bigger size next.' : e.ok >= 5 ? 'Round both numbers to something easy first, then fix the answer up a little.' : 'Round more boldly, or switch to a wider tolerance. Close beats exact here.'}</div></div>
    <div class="fl-foot"><div class="fl-btns"><button class="btn primary" data-act="esGo">${icon('redo')} Again<kbd>Enter</kbd></button><div class="fl-row2"><button class="btn" data-act="est">Change settings</button><button class="btn ghost" data-go="home">Home<kbd>Esc</kbd></button></div></div></div></div>`;
  E = null;
}
addEventListener('keydown', (ev) => {
  if (view.scr != 'est' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const t = ev.target, typing = t.matches && t.matches('input'), e = E;
  if (ev.key == 'Escape') {
    ev.preventDefault(); ev.stopImmediatePropagation();
    if (!e) go('home'); else A.esQuit();
    return;
  }
  if (e && e.ph == 'ask' && !typing) {   // keypad mode: the physical keyboard drives the same readout
    const k = ev.key, hit = /^\d$/.test(k) || k == 'Backspace' || k == 'Enter';
    if (hit) { ev.preventDefault(); ev.stopImmediatePropagation(); if (k == 'Enter') A.esAns(); else A.esKey({ v: k }); return; }
  }
  if (typing) return;   // the answer box handles its own Enter; the global shortcuts already ignore typing
  if (t.matches && t.matches('button')) return;   // a focused button acts for itself
  if (ev.key == 'Enter') { const b = document.querySelector('#main .btn.primary'); if (b) { ev.preventDefault(); b.click(); } ev.stopImmediatePropagation(); return; }
  if (E) ev.stopImmediatePropagation();   // no stray shortcut may interrupt a run
}, true);
register('est', setup);
