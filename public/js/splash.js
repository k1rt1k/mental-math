// Opening animation. The picture and its timing are pure CSS (#splash in index.html, "opening animation" in motion.css), started by boot.js
// before first paint. This file only lets a tap skip it, puts the page back when it ends, and replays it from Settings.
import { S } from './state.js';

const D = document.documentElement, el = () => document.getElementById('splash');
const still = () => D.dataset.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches;
let guard = 0;
const done = () => { clearTimeout(guard); D.dataset.splash = ''; const s = el(); if (s) s.classList.remove('skip'); };
const arm = () => { clearTimeout(guard); guard = setTimeout(done, 3500); };   // the CSS ends it in 2.4 s; this only covers a browser that never fires animationend

export const splashWanted = () => !S.noSplash;
/** Play the intro now (the Settings preview). False when Reduce motion is on. */
export function playSplash() {
  const s = el();
  if (!s || still()) return false;
  s.classList.remove('skip'); D.dataset.splash = ''; void s.offsetWidth;   // display:none, then back, so every animation restarts
  D.dataset.splash = '1'; arm();
  return true;
}

document.addEventListener('animationend', (e) => { if (e.target.id == 'splash' && e.animationName == 'sp-out') done(); });
document.addEventListener('pointerdown', (e) => { const s = el(); if (D.dataset.splash == '1' && s && s.contains(e.target)) s.classList.add('skip'); }, true);
if (D.dataset.splash == '1') arm();
