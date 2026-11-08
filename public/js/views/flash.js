// Flash / chain mode: numbers flash one at a time, you keep a running total, then type it. Separate from Session on purpose:
// there are no skills or ratings here, only a finished run saved as one session (m: 'flash').
import { S, save } from '../state.js';
import { IDS } from '../engine.js';
import { esc, clamp } from '../util.js';
import { A, register, go, view } from '../nav.js';
import { icon, toast } from '../ui.js';
import { padOn } from '../theme.js';
import { countsToGoal } from '../stats.js';
import { makeChain, roundPts, expr, bestKey, digitsOnly } from '../chain.js';

const ROUNDS = 5, KEY = 'mmTrainer.flash', BK = 'mmTrainer.flashBest';
export const SPEEDS = [[1500, 'Calm'], [1000, 'Steady'], [700, 'Quick'], [450, 'Blitz']];
export const COUNTS = [4, 6, 8, 10];
const DEF = { c: 4, s: 1500, d: 1, neg: 0 };
export function cfgLoad() {
  let o = {}; try { o = JSON.parse(localStorage[KEY] || '{}'); } catch (e) { /* none saved */ }
  return { c: COUNTS.includes(o.c) ? o.c : DEF.c, s: SPEEDS.some((x) => x[0] == o.s) ? o.s : DEF.s, d: clamp(+o.d || 1, 1, 3), neg: o.neg ? 1 : 0 };
}
const cfgSave = (c) => { try { localStorage[KEY] = JSON.stringify(c); } catch (e) { /* private mode */ } };
// Best score per setting, kept on this device only (like the settings themselves).
const bestAll = () => { try { return JSON.parse(localStorage[BK] || '{}') || {}; } catch (e) { return {}; } };
const bestOf = (cfg) => +bestAll()[bestKey(cfg)] || 0;
const bestSet = (cfg, pts) => { try { const b = bestAll(); b[bestKey(cfg)] = pts; localStorage[BK] = JSON.stringify(b); } catch (e) { /* private mode */ } };

let F = null, tm = 0;   // the run in progress (F.ph: run | ask | fb | pause); the pending timer
const stop = () => { clearTimeout(tm); tm = 0; };
const live = (f) => F === f && f.ph == 'run' && view.scr == 'flash';
const main = () => document.querySelector('#main');
const seg = (act, cur, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button aria-pressed="${cur == v}" data-act="${esc(act)}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;

/* ---------- sound and touch: same switches as the other modes (Settings, Sound / Vibration) ---------- */
let AC = null;
const blip = (hz, dur, type = 'sine', gain = 0.04) => {
  if (S.mute) return;
  try {
    AC = AC || new AudioContext(); if (AC.state == 'suspended') AC.resume();
    const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
    o.type = type; o.frequency.value = hz;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch (e) { /* audio blocked */ }
};
const buzz = (ms) => { try { if (!S.noHap && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* no haptics */ } };

function setup() {
  stop(); F = null; const c = cfgLoad(), best = bestOf(c);
  document.title = 'Flash · Mental Math';
  main().innerHTML = `<div class="hd"><h1>Flash</h1></div>
  <div class="card fl-card"><p class="mu fl-lead">Numbers flash one at a time. Keep the running total in your head, then type it. ${ROUNDS} rounds.</p>
    <div class="field"><div class="mu">Numbers</div>${seg('flC', c.c, COUNTS.map((n) => [n, n]))}</div>
    <div class="field"><div class="mu">Speed</div>${seg('flS', c.s, SPEEDS.map(([v, l]) => [v, l + ' · ' + v / 1000 + ' s']))}</div>
    <div class="field"><div class="mu">Digits</div>${seg('flD', c.d, [[1, '1'], [2, '2'], [3, '3']])}</div>
    <div class="field"><div class="mu">Subtract</div>${seg('flN', c.neg, [[0, 'Add only'], [1, 'Add and subtract']])}</div>
    <div class="mu fl-best">${best ? 'Best at this setting: <b class="tx">' + best + ' pts</b>' : 'No run yet at this setting'}</div>
    <div class="btns fl-btns"><button class="btn primary" data-act="flGo">${icon('play')} Start<kbd>Enter</kbd></button><button class="btn ghost" data-go="home">Home<kbd>Esc</kbd></button></div>
    <p class="mu fl-note">The numbers are drawn on screen only, so this mode is not announced by screen readers.</p></div>`;
}
const setC = (k) => (d) => { const c = cfgLoad(); c[k] = +d.v; cfgSave(c); setup(); };
A.flC = setC('c'); A.flS = setC('s'); A.flD = setC('d'); A.flN = setC('neg');
A.flash = () => go('flash');
A.flGo = () => {
  blip(1, 0.001, 'sine', 0.0001);   // wakes the audio context inside this tap (iOS/Safari)
  const cfg = cfgLoad(); F = { cfg, i: 0, ok: 0, t0: Date.now(), log: [], v: '', ph: 'run' }; round();
};

const top = (f, pause) => `<div class="fl-top"><span class="mu">Round ${f.i + 1} of ${ROUNDS}</span>${pause ? `<button class="btn sm ghost" data-act="flPause" aria-label="Pause">${icon('pause')} Pause<kbd>Esc</kbd></button>` : ''}</div>`;

function round() {
  const f = F; f.ph = 'run'; f.ch = makeChain(f.cfg); f.n = 0; f.v = '';
  main().innerHTML = `<div class="flw" role="status">${top(f, true)}<div class="fl-n" id="fln" aria-hidden="true">Ready</div></div>`;
  const gap = Math.min(160, Math.round(f.cfg.s * 0.25)), el = () => document.querySelector('#fln');
  const step = () => {
    if (!live(f)) return;
    if (document.hidden) return (tm = setTimeout(step, 300));    // never flash into a hidden tab
    if (f.n >= f.ch.items.length) return ask(f);
    const q = f.ch.items[f.n], e = el(); if (!e) return;
    e.textContent = (f.n ? (q.sub ? '−' : '+') : '') + q.x; e.className = 'fl-n on'; f.n++;
    blip(440 + f.n * 28, 0.05, 'sine', 0.03);   // a soft tick per number, rising as the chain grows
    tm = setTimeout(() => { if (!live(f)) return; const e2 = el(); if (e2) { e2.textContent = ''; e2.className = 'fl-n'; } tm = setTimeout(step, gap); }, f.cfg.s);
  };
  const lead = (txt, next) => () => { if (!live(f)) return; const e = el(); if (e) e.textContent = txt; blip(330, 0.04, 'sine', 0.025); tm = setTimeout(next, 600); };
  tm = setTimeout(lead('3', lead('2', lead('1', step))), 500);
}

const padKeys = () => (S.padFlip ? [7, 8, 9, 4, 5, 6, 1, 2, 3, '', 0, '⌫'] : [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫']);
/** The same number pad the practice screen uses (same classes, same flip setting), so the phone keyboard never covers the page. */
const padHtml = () => '<div class="pad fl-pad" role="group" aria-label="Number pad">' + padKeys().map((k) => k === '' ? '<button type="button" class="fn sym off" tabindex="-1" aria-hidden="true"></button>' : `<button type="button" class="${k === '⌫' ? 'fn' : ''}" data-act="flKey" data-v="${esc(k === '⌫' ? 'Backspace' : k)}" aria-label="${esc(k === '⌫' ? 'Backspace' : k)}">${k === '⌫' ? icon('back') : k}</button>`).join('') + '</div>'
  + '<div class="padact fl-padact"><button type="button" class="btn primary" data-act="flAns">Check</button></div>';
const showVal = (f) => { const e = document.querySelector('#fla'); if (e) e.innerHTML = esc(f.v) + '<span class="cur"></span>'; };

function ask(f) {
  f.ph = 'ask'; f.v = ''; const pad = padOn();
  if (pad) main().innerHTML = `<div class="flw ask">${top(f, false)}<div class="fl-q" id="flq">What is the total?</div><div class="fl-val" id="fla" role="textbox" aria-readonly="true" aria-labelledby="flq"><span class="cur"></span></div>${padHtml()}</div>`;
  else {   // keypad switched off in Settings: a plain number box, kept to digits
    main().innerHTML = `<div class="flw ask">${top(f, false)}<label class="fl-q" for="fla">What is the total?</label><input class="inp fl-a" id="fla" inputmode="numeric" pattern="[0-9]*" autocomplete="off" aria-label="Running total"><div class="btns fl-btns c"><button class="btn primary" data-act="flAns">Check<kbd>Enter</kbd></button></div></div>`;
    const i = document.querySelector('#fla'); i.focus();
    i.addEventListener('input', () => { const d = digitsOnly(i.value); if (i.value !== d) i.value = d; });
    i.addEventListener('keydown', (e) => { if (e.key == 'Enter') { e.preventDefault(); A.flAns(); } });
  }
}
A.flKey = (d) => {
  const f = F; if (!f || f.ph != 'ask') return;
  if (d.v == 'Backspace') f.v = f.v.slice(0, -1); else if (/^\d$/.test(d.v)) f.v = digitsOnly(f.v + d.v);
  showVal(f);
};
A.flAns = () => {
  const f = F; if (!f || f.ph != 'ask') return;
  const box = document.querySelector('#fla'), raw = digitsOnly(box && box.tagName == 'INPUT' ? box.value : f.v);
  if (!raw) return;   // nothing typed: stay on the question
  const got = parseInt(raw, 10), ok = got === f.ch.total; if (ok) f.ok++;
  f.log.push(ok); f.ph = 'fb';
  if (ok) { blip(740, 0.09, 'sine', 0.05); setTimeout(() => blip(988, 0.12, 'sine', 0.05), 90); } else { blip(170, 0.16, 'square', 0.035); buzz(40); }
  main().innerHTML = `<div class="flw" role="status">${top(f, false)}<div class="fl-r ${ok ? 'ok' : 'bad'}">${ok ? 'Right' : 'Not quite'}</div>
    <div class="fl-x">${esc(expr(f.ch))}</div>${ok ? '' : `<div class="mu">You typed ${esc(got)}</div>`}
    <div class="btns fl-btns c"><button class="btn primary" data-act="flNext">${f.i + 1 < ROUNDS ? 'Next round' : 'Finish'}<kbd>Enter</kbd></button></div></div>`;
};
A.flNext = () => { const f = F; if (!f || f.ph != 'fb') return; f.i++; if (f.i < ROUNDS) round(); else done(f); };

/* ---------- pause: stop the clock; resuming starts this round again with fresh numbers (nothing is saved or lost) ---------- */
function pause() {
  const f = F; if (!f || f.ph != 'run') return;
  stop(); f.ph = 'pause';
  main().innerHTML = `<div class="flw" role="status"><div class="fl-r">Paused</div><div class="mu">Round ${f.i + 1} of ${ROUNDS} starts again with new numbers.</div>
    <div class="btns fl-btns c"><button class="btn primary" data-act="flResume">Resume<kbd>Enter</kbd></button><button class="btn ghost" data-act="flQuit">Quit run<kbd>Esc</kbd></button></div></div>`;
}
A.flPause = pause;
A.flResume = () => { if (F && F.ph == 'pause') round(); };
A.flQuit = () => { stop(); F = null; toast('Run stopped'); go('flash'); };

function done(f) {
  const cfg = f.cfg, pts = f.ok * roundPts(cfg), prev = bestOf(cfg), isBest = f.ok > 0 && pts > prev && prev > 0;
  let goal = false;
  if (f.ok > 0) {   // like every other mode, a run with nothing right is not a session
    const lv = {}; IDS.forEach((k) => (lv[k] = +S.sk[k].lv.toFixed(2)));
    const s = { t: Date.now(), m: 'flash', dur: Math.max(1, Math.round((Date.now() - f.t0) / 1000)), n: ROUNDS, ok: f.ok, ft: f.ok, pts, tm: 0, by: {}, lv, off: 0 };
    goal = countsToGoal(s);
    S.sessions.push(s);
    if (pts > prev) bestSet(cfg, pts);
    save();
  }
  f.ph = 'done';
  main().innerHTML = `<div class="flw"><div class="mu">Flash · ${cfg.c} numbers · ${cfg.d} digit${cfg.d > 1 ? 's' : ''} · ${cfg.s / 1000} s${cfg.neg ? ' · add and subtract' : ''}</div>
    <div class="fl-r ${f.ok >= 4 ? 'ok' : ''}">${f.ok} / ${ROUNDS}</div><div class="mu">${f.log.map((x) => `<span class="fdot ${x ? 'on' : ''}"></span>`).join('')}</div>
    <div class="fl-x">${pts} pts${isBest ? ' · new best for this setting' : prev ? ' · best here ' + Math.max(prev, pts) : ''}</div>
    ${f.ok > 0 ? `<div class="mu fl-sub">Counts toward today’s streak${goal ? ' and daily goal' : ''}.</div>` : ''}
    <div class="mu fl-tip">${f.ok >= 4 ? 'Solid. Try more numbers, a faster flash or more digits next.' : f.ok >= 2 ? 'Keep this setting for another run before you speed up.' : 'Slow it down or use fewer numbers; accuracy first, speed second.'}</div>
    <div class="btns fl-btns c"><button class="btn primary" data-act="flGo">${icon('redo')} Again<kbd>Enter</kbd></button><button class="btn" data-act="flash">Change settings</button><button class="btn ghost" data-go="home">Home<kbd>Esc</kbd></button></div></div>`;
  F = null;
}
addEventListener('keydown', (e) => {
  if (view.scr != 'flash' || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target, typing = t.matches && t.matches('input'), f = F;
  if (e.key == 'Escape') {
    e.preventDefault(); e.stopImmediatePropagation();
    if (!f) go('home'); else if (f.ph == 'run') pause(); else A.flQuit();
    return;
  }
  if (f && f.ph == 'ask' && !typing) {   // keypad mode: the physical keyboard drives the same readout
    const k = e.key, hit = /^\d$/.test(k) || k == 'Backspace' || k == 'Enter';
    if (hit) { e.preventDefault(); e.stopImmediatePropagation(); if (k == 'Enter') A.flAns(); else A.flKey({ v: k }); return; }
  }
  if (typing) return;   // the answer box handles its own Enter; the global shortcuts already ignore typing
  if (t.matches && t.matches('button')) return;   // a focused button acts for itself
  if (e.key == 'Enter') { const b = document.querySelector('#main .btn.primary'); if (b) { e.preventDefault(); b.click(); } e.stopImmediatePropagation(); return; }
  if (F) e.stopImmediatePropagation();   // no stray shortcut may interrupt a run
}, true);
register('flash', setup);
