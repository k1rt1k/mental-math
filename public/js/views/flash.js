// Flash / chain mode: numbers flash one at a time, you keep a running total, then type it. Separate from Session on purpose:
// there are no skills or ratings here, only a finished run saved as one session (m: 'flash').
import { S, save } from '../state.js';
import { IDS } from '../engine.js';
import { esc, clamp } from '../util.js';
import { A, register, go, view } from '../nav.js';
import { icon, toast } from '../ui.js';
import { makeChain, roundPts, expr } from '../chain.js';

const ROUNDS = 5, KEY = 'mmTrainer.flash';
export const SPEEDS = [[1500, 'Calm'], [1000, 'Steady'], [700, 'Quick'], [450, 'Blitz']];
export const COUNTS = [4, 6, 8, 10];
const DEF = { c: 4, s: 1500, d: 1, neg: 0 };
export function cfgLoad() {
  let o = {}; try { o = JSON.parse(localStorage[KEY] || '{}'); } catch (e) { /* none saved */ }
  return { c: COUNTS.includes(o.c) ? o.c : DEF.c, s: SPEEDS.some((x) => x[0] == o.s) ? o.s : DEF.s, d: clamp(+o.d || 1, 1, 3), neg: o.neg ? 1 : 0 };
}
const cfgSave = (c) => { try { localStorage[KEY] = JSON.stringify(c); } catch (e) { /* private mode */ } };

let F = null, tm = 0;   // the run in progress; the pending timer
const stop = () => { clearTimeout(tm); tm = 0; };
const live = (f) => F === f && view.scr == 'flash';
const main = () => document.querySelector('#main');
const seg = (act, cur, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button aria-pressed="${cur == v}" data-act="${esc(act)}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;

function setup() {
  stop(); F = null; const c = cfgLoad();
  document.title = 'Flash · Mental Math';
  main().innerHTML = `<div class="hd"><h1>Flash</h1></div>
  <div class="card" style="max-width:640px"><p class="mu" style="margin:0 0 6px">Numbers flash one at a time. Keep the running total in your head, then type it. ${ROUNDS} rounds.</p>
    <div class="field"><div class="mu">Numbers</div>${seg('flC', c.c, COUNTS.map((n) => [n, n]))}</div>
    <div class="field"><div class="mu">Speed</div>${seg('flS', c.s, SPEEDS.map(([v, l]) => [v, l + ' · ' + v / 1000 + ' s']))}</div>
    <div class="field"><div class="mu">Digits</div>${seg('flD', c.d, [[1, '1'], [2, '2'], [3, '3']])}</div>
    <div class="field"><div class="mu">Subtract</div>${seg('flN', c.neg, [[0, 'Add only'], [1, 'Add and subtract']])}</div>
    <div class="btns" style="margin-top:14px"><button class="btn primary" data-act="flGo">${icon('play')} Start<kbd>Enter</kbd></button><button class="btn ghost" data-go="home">Home<kbd>Esc</kbd></button></div>
    <p class="mu" style="margin:12px 0 0;font-size:var(--t-xs)">The numbers are drawn on screen only, so this mode is not announced by screen readers.</p></div>`;
}
const setC = (k) => (d) => { const c = cfgLoad(); c[k] = +d.v; cfgSave(c); setup(); };
A.flC = setC('c'); A.flS = setC('s'); A.flD = setC('d'); A.flN = setC('neg');
A.flash = () => go('flash');
A.flGo = () => {
  const cfg = cfgLoad(); F = { cfg, i: 0, ok: 0, t0: Date.now(), log: [] }; round();
};

function round() {
  const f = F; f.ch = makeChain(f.cfg); f.n = 0;
  main().innerHTML = `<div class="flw" role="status"><div class="mu">Round ${f.i + 1} of ${ROUNDS}</div><div class="fl-n" id="fln" aria-hidden="true">Ready</div></div>`;
  const gap = Math.min(160, Math.round(f.cfg.s * 0.25)), el = () => document.querySelector('#fln');
  const step = () => {
    if (!live(f)) return;
    if (document.hidden) return (tm = setTimeout(step, 300));    // never flash into a hidden tab
    if (f.n >= f.ch.items.length) return ask(f);
    const q = f.ch.items[f.n], e = el(); if (!e) return;
    e.textContent = (f.n ? (q.sub ? '−' : '+') : '') + q.x; e.className = 'fl-n on'; f.n++;
    tm = setTimeout(() => { if (!live(f)) return; const e2 = el(); if (e2) { e2.textContent = ''; e2.className = 'fl-n'; } tm = setTimeout(step, gap); }, f.cfg.s);
  };
  tm = setTimeout(() => { const e = el(); if (e) e.textContent = '3'; tm = setTimeout(() => { if (!live(f)) return; const e2 = el(); if (e2) e2.textContent = '2'; tm = setTimeout(() => { if (!live(f)) return; const e3 = el(); if (e3) e3.textContent = '1'; tm = setTimeout(step, 600); }, 600); }, 600); }, 500);
}
function ask(f) {
  main().innerHTML = `<div class="flw"><div class="mu">Round ${f.i + 1} of ${ROUNDS}</div><label class="fl-q" for="fla">What is the total?</label>
    <input class="inp fl-a" id="fla" inputmode="numeric" pattern="[0-9]*" autocomplete="off" aria-label="Running total"><div class="btns" style="justify-content:center;margin-top:14px"><button class="btn primary" data-act="flAns">Check<kbd>Enter</kbd></button></div></div>`;
  const i = document.querySelector('#fla'); i.focus();
  i.addEventListener('keydown', (e) => { if (e.key == 'Enter') { e.preventDefault(); A.flAns(); } });
}
A.flAns = () => {
  const f = F, i = document.querySelector('#fla'); if (!f || !i || !i.value.trim()) return;
  const got = parseInt(i.value, 10), ok = got === f.ch.total; if (ok) f.ok++;
  f.log.push(ok);
  main().innerHTML = `<div class="flw" role="status"><div class="mu">Round ${f.i + 1} of ${ROUNDS}</div><div class="fl-r ${ok ? 'ok' : 'bad'}">${ok ? 'Right' : 'Not quite'}</div>
    <div class="fl-x">${esc(expr(f.ch))}</div>${ok ? '' : `<div class="mu">You typed ${esc(got)}</div>`}
    <div class="btns" style="justify-content:center;margin-top:14px"><button class="btn primary" data-act="flNext">${f.i + 1 < ROUNDS ? 'Next round' : 'Finish'}<kbd>Enter</kbd></button></div></div>`;
};
A.flNext = () => { const f = F; if (!f) return; f.i++; if (f.i < ROUNDS) round(); else done(f); };
function done(f) {
  const pts = f.ok * roundPts(f.cfg), best = Math.max(0, ...S.sessions.filter((s) => s.m == 'flash').map((s) => s.pts));
  if (f.ok > 0) {   // like every other mode, a run with nothing right is not a session
    const lv = {}; IDS.forEach((k) => (lv[k] = +S.sk[k].lv.toFixed(2)));
    S.sessions.push({ t: Date.now(), m: 'flash', dur: Math.max(1, Math.round((Date.now() - f.t0) / 1000)), n: ROUNDS, ok: f.ok, ft: f.ok, pts, tm: 0, by: {}, lv, off: 0 });
    save();
  }
  main().innerHTML = `<div class="flw"><div class="mu">Flash · ${f.cfg.c} numbers · ${f.cfg.d} digit${f.cfg.d > 1 ? 's' : ''} · ${f.cfg.s / 1000} s${f.cfg.neg ? ' · add and subtract' : ''}</div>
    <div class="fl-r ${f.ok >= 4 ? 'ok' : ''}">${f.ok} / ${ROUNDS}</div><div class="mu">${f.log.map((x) => (x ? '●' : '○')).join(' ')}</div>
    <div class="fl-x">${pts} pts${pts > best && best ? ' · new best' : best ? ' · best ' + best : ''}</div>
    <div class="mu" style="max-width:44ch;margin:8px auto 0">${f.ok >= 4 ? 'Solid. Try more numbers, a faster flash or more digits next.' : f.ok >= 2 ? 'Keep this setting for another run before you speed up.' : 'Slow it down or use fewer numbers; accuracy first, speed second.'}</div>
    <div class="btns" style="justify-content:center;margin-top:16px"><button class="btn primary" data-act="flGo">${icon('redo')} Again<kbd>Enter</kbd></button><button class="btn" data-act="flash">Change settings</button><button class="btn ghost" data-go="home">Home<kbd>Esc</kbd></button></div></div>`;
  F = null;
}
addEventListener('keydown', (e) => {
  if (view.scr != 'flash' || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target, typing = t.matches && t.matches('input');
  if (e.key == 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (F) { stop(); F = null; toast('Run stopped'); go('flash'); } else go('home'); return; }
  if (typing) return;   // the answer box handles its own Enter; the global shortcuts already ignore typing
  if (t.matches && t.matches('button')) return;   // a focused button acts for itself
  if (e.key == 'Enter') { const b = document.querySelector('#main .btn.primary'); if (b) { e.preventDefault(); b.click(); } e.stopImmediatePropagation(); return; }
  if (F) e.stopImmediatePropagation();   // no stray shortcut may interrupt a run
}, true);
register('flash', setup);
