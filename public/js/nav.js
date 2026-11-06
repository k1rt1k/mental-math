// Tiny router + action registry. Views register themselves; nothing here knows about any view.
import { $, $$ } from './util.js';

export const view = { scr: 'home' };
const routes = {};
export const A = {};                      // data-act handlers: A.name(dataset, element, event)
export const register = (name, fn) => (routes[name] = fn);
const MAIN = ['home', 'coach', 'learn', 'progress', 'notebook', 'settings'];
let skipHash = false;

export function mark(name) {
  view.scr = name;
  document.body.classList.toggle('playing', name == 'play');
  $$('[data-go]').forEach((b) => (name == b.dataset.go ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  const m = $('#main');
  m.dataset.scr = name;                    // which screen the DOM below belongs to (morph.js only patches in place within one screen)
  m.focus({ preventScroll: true });
}

/** Play the entrance cascade for the screen that is about to be painted (navigation, a session starting, results arriving). Never for in-place repaints. */
export function enter(dir = '') {
  const m = $('#main'); m.dataset.dir = dir; m.classList.add('enter'); clearTimeout(enter.t); enter.t = setTimeout(() => m.classList.remove('enter'), 1300);
}

export function go(name) {
  if (!routes[name]) name = 'home';
  if (MAIN.includes(name)) {
    const h = name == 'home' ? '#/' : '#/' + name;
    if (location.hash !== h && !(name == 'home' && !location.hash)) { skipHash = true; location.hash = h; }
  }
  const pi = MAIN.indexOf(view.scr), ni = MAIN.indexOf(name), dir = pi < 0 || ni < 0 || pi == ni ? '' : ni > pi ? 'f' : 'b';   // which way the screen slides in on phones
  mark(name);
  scrollTo({ top: 0, left: 0, behavior: 'instant' });
  const m = $('#main'); m.dataset.fresh = '1';   // the next paint replaces the DOM (a new screen); later ones patch it in place
  enter(dir);                                    // entrance motion on navigation only, never on in-place repaints
  run(name);
}

/** Paint a screen; if it throws (corrupt data, a bug), show a way out instead of leaving a blank page. */
function run(name) {
  try { routes[name](); }
  catch (err) {
    console.error(err);
    const m = $('#main');
    if (m) m.innerHTML = '<div class="card empty crash"><b>This screen hit a problem</b>Your progress is safe. You can go home, download a backup, or reload.<div class="btns" style="justify-content:center;margin-top:14px"><button class="btn primary" data-go="home">Go home</button><button class="btn" data-act="export">Download backup</button><button class="btn" data-act="reload">Reload</button></div></div>';
  }
}
A.reload = () => location.reload();

export function fromHash() {
  const n = location.hash.replace(/^#\/?/, '') || 'home';
  go(MAIN.includes(n) ? n : 'home');
}

addEventListener('hashchange', () => {
  if (skipHash) { skipHash = false; return; }
  if (view.scr == 'play') { A.pause && A.pause(); return; }   // browser "back" during a session just pauses it
  fromHash();
});

document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-go]');
  if (g) { e.preventDefault(); if (view.scr == 'play') return;
    const to = g.dataset.go, calm = document.documentElement.dataset.motion == 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !calm && to != view.scr && MAIN.includes(to)) { try { document.startViewTransition(() => go(to)); return; } catch { /* fall through */ } }   // old screen fades out while the new one arrives
    go(to); return; }
  const a = e.target.closest('[data-act]');
  if (a && A[a.dataset.act]) { e.preventDefault(); const act = a.dataset.act, v = a.dataset.v; A[act](a.dataset, a, e); keepFocus(act, v); }
});
/** Screens repaint with innerHTML, which destroys the focused button. Put focus back on its twin so keyboard users keep their place. */
function keepFocus(act, v) {
  if (act == 'key') return;
  requestAnimationFrame(() => {
    const ae = document.activeElement;
    if (ae && ae !== document.body && ae.isConnected) return;     // focus is fine (or a dialog has it)
    const n = $$('[data-act]').find((x) => x.dataset.act == act && x.dataset.v === v);
    n && n.focus({ preventScroll: true });
  });
}
document.addEventListener('keydown', (e) => {
  if ((e.key == 'Enter' || e.key == ' ') && e.target.matches && e.target.matches('[role=button][data-act]')) { e.preventDefault(); e.target.click(); }
});

/** Repaint the current screen in place (e.g. after a sync brought in new data). No-op during play/results. */
export function rerender() { if (routes[view.scr] && MAIN.includes(view.scr)) run(view.scr); }
