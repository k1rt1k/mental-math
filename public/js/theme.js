// Appearance: theme, accent, question font, keypad, focus layout.
import { S } from './state.js';

export const ACC = {
  blue: ['#7aa8ff', '#2f63d6'], violet: ['#b69cff', '#6d46d6'], teal: ['#4fd1c5', '#0f857b'],
  rose: ['#ff8fb1', '#d1366b'], amber: ['#ffc15c', '#a05d00'],
};
export const FONTS = { serif: 'Serif', sans: 'Sans', mono: 'Mono', round: 'Rounded' };
export const isTouch = () => matchMedia('(pointer:coarse)').matches;
export const padOn = () => (S.pad != null ? !!S.pad : isTouch());
export const themeNow = () => S.theme || (matchMedia('(prefers-color-scheme:light)').matches ? 'light' : 'dark');

export function applyTheme() {
  const th = themeNow(), D = document.documentElement;
  D.dataset.theme = th;
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = th == 'light' ? '#f3f4f8' : th == 'black' ? '#000000' : '#0c1017';
  D.dataset.font = S.font && FONTS[S.font] ? S.font : 'serif';
  D.dataset.ts = ['l', 'xl'].includes(S.ts) ? S.ts : 'm';         // text size
  D.dataset.contrast = S.hc ? 'high' : '';
  D.dataset.cb = S.cb ? '1' : '';           // colour-blind-safe pair: blue / orange instead of green / red
  D.dataset.big = S.bigA ? '1' : '';        // larger answer digits while playing
  D.dataset.motion = S.rm ? 'reduce' : '';
  D.style.setProperty('--ac', (ACC[S.acc] || ACC.blue)[th == 'light' ? 1 : 0]);
  document.body.classList.toggle('padon', padOn());
  document.body.classList.toggle('zen', !!S.zen);
}
matchMedia('(prefers-color-scheme:light)').addEventListener('change', () => { if (!S.theme) applyTheme(); });
