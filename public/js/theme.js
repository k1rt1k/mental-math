// Appearance: theme, background skin, accent (preset or your own colour), question font, keypad, focus layout.
import { S } from './state.js';

/** Accent colours: [for Dark and Black, for Light]. The light one is always dark enough to carry white button text. */
export const ACC = {
  grape: ['#a07bff', '#6a3df0'], blue: ['#7aa8ff', '#2f63d6'], violet: ['#b69cff', '#6d46d6'], teal: ['#4fd1c5', '#0f857b'],
  rose: ['#ff8fb1', '#d1366b'], amber: ['#ffc15c', '#a05d00'], coral: ['#ff8a65', '#c93e12'], emerald: ['#34d399', '#0a7a50'],
  sky: ['#4cc9f0', '#0a6c9c'], fuchsia: ['#f472d0', '#b0208c'], lime: ['#a3e635', '#4d7c0f'], indigo: ['#818cf8', '#4338ca'],
  slate: ['#cbd5e1', '#334155'],
};
/** Background skins: [name, dark page, dark card, light page, light card, theme-color dark, theme-color light]. The real values live in extras.css. */
export const SKINS = {
  aurora: ['Aurora', '#0b0813', '#1f1833', '#f6f3fb', '#f0ebf8', '#0b0813', '#f6f3fb'],
  midnight: ['Midnight', '#060b16', '#162038', '#f1f4fa', '#e9eef7', '#060b16', '#f1f4fa'],
  forest: ['Forest', '#07100c', '#15271d', '#f1f5f0', '#e9efe7', '#07100c', '#f1f5f0'],
  mocha: ['Mocha', '#100c09', '#271e17', '#f7f2ec', '#f3ede5', '#100c09', '#f7f2ec'],
  ocean: ['Ocean', '#061116', '#142a34', '#eff6f7', '#e4f0f2', '#061116', '#eff6f7'],
  classic: ['Classic', '#07090d', '#181d28', '#f4f4f1', '#efeee9', '#0c1017', '#f3f4f8'],
};
/** What a brand-new visitor sees. People who already had the app keep the old blue-on-classic look until they pick something (see boot.js). */
export const DEFAULT_ACC = 'grape', DEFAULT_SKIN = 'aurora', LEGACY_ACC = 'blue', LEGACY_SKIN = 'classic';
export const FONTS = { serif: 'Serif', sans: 'Sans', mono: 'Mono', round: 'Rounded' };
/** App fonts (whole app, not just questions): [name, sample]. The stacks live in style.css under [data-afont]. Only fonts already bundled or built into the device, so nothing new to download. */
export const AFONTS = { default: ['Classic', 'Aa'], inter: ['Clean', 'Aa'], serif: ['Serif', 'Aa'], system: ['Device', 'Aa'], round: ['Rounded', 'Aa'], mono: ['Mono', 'Aa'] };
export const isTouch = () => matchMedia('(pointer:coarse)').matches;
export const padOn = () => (S.pad != null ? !!S.pad : isTouch());
export const themeNow = () => S.theme || (matchMedia('(prefers-color-scheme:light)').matches ? 'light' : 'dark');

const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
export const HEX = /^#[0-9a-f]{6}$/i;
/** boot.js marks a device whose first visit happened with this release (no saved data yet); only those get the new default look. */
const newLook = () => typeof document !== 'undefined' && document.documentElement.dataset.look2 === '1';
export const accKey = () => (S.acc === 'custom' && HEX.test(S.accHex || '') ? 'custom' : has(ACC, S.acc) ? S.acc : newLook() ? DEFAULT_ACC : LEGACY_ACC);
export const skinKey = () => (has(SKINS, S.skin) ? S.skin : newLook() ? DEFAULT_SKIN : LEGACY_SKIN);

/* ---- a custom colour becomes a Dark/Light pair that always keeps button text readable (4.5:1) ---- */
const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
function toHsl(h) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1)), hu = mx == r ? ((g - b) / d + (g < b ? 6 : 0)) : mx == g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hu * 60, s, l];
}
function fromHsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}
export function customPair(hex) {
  const [h, s, l0] = toHsl(hex.toLowerCase());
  let l = Math.max(l0, 0.6), dark = fromHsl(h, s, l);
  while (ratio(dark, '#08101f') < 4.5 && l < 0.95) { l += 0.02; dark = fromHsl(h, s, l); }
  l = Math.min(l0, 0.46); let light = fromHsl(h, s, l);
  while (ratio(light, '#ffffff') < 4.5 && l > 0.05) { l -= 0.02; light = fromHsl(h, s, l); }
  return [dark, light];
}
export const accPair = () => (accKey() == 'custom' ? customPair(S.accHex) : ACC[accKey()]);

export function applyTheme() {
  const th = themeNow(), D = document.documentElement, sk = skinKey();
  D.dataset.theme = th;
  D.dataset.skin = sk;
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = th == 'light' ? SKINS[sk][6] : th == 'black' ? '#000000' : SKINS[sk][5];
  D.dataset.font = S.font && FONTS[S.font] ? S.font : 'serif';
  D.dataset.afont = has(AFONTS, S.afont) ? S.afont : 'default';   // whole-app font
  D.dataset.ts = ['l', 'xl'].includes(S.ts) ? S.ts : 'm';         // text size
  D.dataset.contrast = S.hc ? 'high' : '';
  D.dataset.cb = S.cb ? '1' : '';           // colour-blind-safe pair: blue / orange instead of green / red
  D.dataset.big = S.bigA ? '1' : '';        // larger answer digits while playing
  D.dataset.motion = S.rm ? 'reduce' : '';
  D.style.setProperty('--ac', accPair()[th == 'light' ? 1 : 0]);
  document.body.classList.toggle('padon', padOn());
  document.body.classList.toggle('zen', !!S.zen);
}
matchMedia('(prefers-color-scheme:light)').addEventListener('change', () => { if (!S.theme) applyTheme(); });
