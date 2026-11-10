// UI primitives: icons, toast, dialogs (replacing prompt()/confirm()), confetti, clipboard.
import { $, esc } from './util.js';

const P = {
  home: '<path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11"/>',
  gear: '<path d="M10.30 4.90L10.77 2.68L13.23 2.68L13.70 4.90A7.3 7.3 0 0 1 15.81 5.78L17.72 4.54L19.46 6.28L18.22 8.19A7.3 7.3 0 0 1 19.10 10.30L21.32 10.77L21.32 13.23L19.10 13.70A7.3 7.3 0 0 1 18.22 15.81L19.46 17.72L17.72 19.46L15.81 18.22A7.3 7.3 0 0 1 13.70 19.10L13.23 21.32L10.77 21.32L10.30 19.10A7.3 7.3 0 0 1 8.19 18.22L6.28 19.46L4.54 17.72L5.78 15.81A7.3 7.3 0 0 1 4.90 13.70L2.68 13.23L2.68 10.77L4.90 10.30A7.3 7.3 0 0 1 5.78 8.19L4.54 6.28L6.28 4.54L8.19 5.78A7.3 7.3 0 0 1 10.30 4.90zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/>',
  play: '<path d="M7 5v14l12-7z"/>',
  moon: '<path d="M20 14.500A8 8 0 0 1 9.500 4a8 8 0 1 0 10.500 10.500z"/>',
  flame: '<path d="M8.500 14.500A2.500 2.500 0 0 0 11 12c0-1.380-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.500 2 4.900 4 6.500 2 1.600 3 3.500 3 5.500a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.500 2.500 0 0 0 2.500 2.500z"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.600-7 10-7 10z"/>',
  redo: '<path d="M4 12a8 8 0 0 1 14-5.300L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.300L4 15M4 20v-5h5"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.500"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.500 10.900c.6.500 1 1.200 1 2.100h5c0-.9.400-1.600 1-2.100A6 6 0 0 0 12 3z"/>',
  down: '<path d="M12 4v12m0 0-5-5m5 5 5-5M5 20h14"/>',
  up: '<path d="M12 20V8m0 0-5 5m5-5 5 5M5 4h14"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9.500 4.200 4.200 0 0 1 17.500 18z"/>',
  check: '<path d="m5 12.500 4.500 4.500L19 7.500"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  share: '<path d="M12 15V4m0 0L8 8m4-4 4 4M5 13v6h14v-6"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a1 1 0 0 0-1 1 3 3 0 0 0 3 3M16 6h3a1 1 0 0 1 1 1 3 3 0 0 1-3 3M12 13v4M9 20h6M10 17h4"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  approx: '<path d="M4 9c2.500-2.500 5.500-2.500 8 0s5.500 2.500 8 0M4 15c2.500-2.500 5.500-2.500 8 0s5.500 2.500 8 0"/>',
  star: '<path d="m12 4 2.500 5.200 5.500.800-4 3.900.900 5.600L12 16.900 7.100 19.500 8 13.900 4 10l5.500-.800z"/>',
  back: '<path d="M9 6h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5-6z"/><path d="m12.500 10 4 4m0-4-4 4"/>',
  keys: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>',
  sparkle: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  trendup: '<path d="M4 16.500 9.500 11l3.500 3.500L20 7.500M15 7.500h5v5"/>',
  trenddown: '<path d="M4 7.500 9.500 13l3.500-3.500 7 7M15 16.500h5v-5"/>',
  caretup: '<path d="M12 7.500 5.500 16h13z"/>',
  caretdown: '<path d="M12 16.500 5.500 8h13z"/>',
  tick: '<circle cx="12" cy="12" r="8.500"/><path d="m8.500 12.300 2.400 2.400 4.600-5"/>',
  cross: '<circle cx="12" cy="12" r="8.500"/><path d="m9.200 9.200 5.600 5.600m0-5.600-5.600 5.600"/>',
  info: '<circle cx="12" cy="12" r="8.500"/><path d="M12 11v5M12 8h.01"/>',
  clock: '<circle cx="12" cy="12" r="8.500"/><path d="M12 7.500V12l3 2"/>',
  timer: '<circle cx="12" cy="13.500" r="7"/><path d="M12 10v3.500l2 1.500M9.500 3h5M12 3v3.500"/>',
  gauge: '<path d="M4 17.500a8.500 8.500 0 1 1 16 0"/><path d="m12 14 3.600-4.600M12 14h.01"/>',
  award: '<circle cx="12" cy="9" r="5.500"/><path d="m8.800 13.600-1.300 6.900 4.500-2 4.500 2-1.300-6.900"/>',
  layers: '<path d="m12 4 8.500 4.500L12 13 3.500 8.500z"/><path d="m3.500 12.500 8.500 4.500 8.500-4.500M3.500 16.500l8.500 4.500 8.500-4.500"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.500"/><rect x="13" y="4" width="7" height="7" rx="1.500"/><rect x="4" y="13" width="7" height="7" rx="1.500"/><rect x="13" y="13" width="7" height="7" rx="1.500"/>',
  list: '<path d="M9 7h11M9 12h11M9 17h11M4.500 7h.01M4.500 12h.01M4.500 17h.01"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.600-5.900L4 8.500M4 4v4.500h4.500M12 8v4.200l2.800 1.800"/>',
  calc: '<rect x="5" y="3.500" width="14" height="17" rx="2.500"/><path d="M8.500 7.500h7M8.500 12h.01M12 12h.01M15.500 12h.01M8.500 16h.01M12 16h.01M15.500 16h.01"/>',
  eye: '<path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12z"/><circle cx="12" cy="12" r="2.800"/>',
  bell: '<path d="M6 16.500V11a6 6 0 0 1 12 0v5.500l1.500 1.500h-15zM10 20.500h4"/>',
  palette: '<path d="M12 3.500a8.500 8.500 0 1 0 0 17c1.400 0 2-.9 2-1.800 0-1.400-1.200-1.500-1.200-2.700 0-.9.800-1.500 1.700-1.500H17a3.500 3.500 0 0 0 3.500-3.500C20.500 6.600 16.800 3.500 12 3.500z"/><path d="M7.500 11h.01M10 7.800h.01M14.500 7.800h.01"/>',
  type: '<path d="M5 7V5h14v2M12 5v14M9 19h6"/>',
  sun: '<circle cx="12" cy="12" r="3.800"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600 7 7M17 17l1.400 1.400M18.400 5.600 17 7M7 17l-1.400 1.400"/>',
  shield: '<path d="M12 3.500 5 6v5.500c0 4.200 2.900 7.300 7 9 4.100-1.700 7-4.800 7-9V6z"/><path d="m9 12 2.200 2.200 4-4.200"/>',
  key: '<circle cx="8" cy="15" r="3.500"/><path d="m10.500 12.500 8-8M15.500 7.500l2.500 2.500"/>',
  users: '<circle cx="9" cy="8" r="3.500"/><path d="M2.500 20v-1a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v1M16 4.700a3.500 3.500 0 0 1 0 6.600M21.500 20v-1a5 5 0 0 0-3.500-4.800"/>',
  flag: '<path d="M5 21V4M5 5h11l-2 3.500 2 3.500H5"/>',
  hash: '<path d="M9 4 7 20M17 4l-2 16M4.500 9h16M3.500 15h16"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  pencil: '<path d="M4 20v-4L16 4a2.100 2.100 0 0 1 3 0l1 1a2.100 2.100 0 0 1 0 3L8 20zM14 6l4 4"/>',
  bookmark: '<path d="M6.500 4h11v16.500L12 16.500l-5.500 4z"/>',
  route: '<circle cx="6" cy="18" r="2.200"/><circle cx="18" cy="6" r="2.200"/><path d="M8.200 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.800"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  dot: '<circle cx="12" cy="12" r="5"/>',
  mail: '<rect x="3.500" y="5.500" width="17" height="13" rx="2.500"/><path d="m4 7.500 8 6 8-6"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.500"/><path d="M11 18h2"/>',
  repeat: '<path d="M4 11V9a3 3 0 0 1 3-3h11M15 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H6M9 21l-3-3 3-3"/>',
  search: '<circle cx="11" cy="11" r="6.500"/><path d="m16 16 4.500 4.500"/>',
  alert: '<path d="M12 4 3.500 19h17z"/><path d="M12 10v4M12 16.500h.01"/>',
};
export const icon = (n, cls = '') => `<svg class="ic ${cls} i-${n}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;

/** Heading badge: a small tinted tile with an icon, placed in front of a section title (tone: ac | gd | ok | bad). */
export const hic = (n, tone = '') => `<span class="hic ${tone}" aria-hidden="true">${icon(n)}</span>`;
/** Empty-state badge: a larger tinted tile with an icon, at the top of a `.card.empty.ei` (which hides the graph-paper mark). */
export const eic = (n) => `<span class="eic" aria-hidden="true">${icon(n)}</span>`;
/** Result mark: a filled round tick (right) or cross (wrong), replacing the plain ✓ / ✗ glyphs. */
export const mk = (ok) => `<span class="mk ${ok ? 'ok' : 'bad'}" aria-hidden="true">${icon(ok ? 'check' : 'x')}</span>`;
/** Up / down delta arrow for "better / worse than before". */
export const tri = (up) => `<span class="tri ${up ? 'up' : 'dn'}" aria-hidden="true">${icon(up ? 'caretup' : 'caretdown', 'fill')}</span>`;

/** The symbol that stands for each skill (shown in a coloured tile next to its name). */
const SKG = { add: '+', sub: '−', mul: '×', div: '÷', sq: 'x²', pw: '√', pct: '%', ops: '( )', mod: 'mod', dec: '0.5', neg: '±', frac: '½', life: '$' };
export const skg = (k) => { const g = SKG[k] || '•'; return `<i class="skg${g.length >= 3 ? ' skg3' : ''}" aria-hidden="true">${g}</i>`; };

/* ---------- toast ---------- */
let toastT;
export function toast(msg, { label, onClick, ms = 2600 } = {}) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${label ? `<button type="button">${esc(label)}</button>` : ''}`;
  t.classList.toggle('act', !!label);
  if (label) t.querySelector('button').onclick = () => { t.classList.remove('show'); onClick && onClick(); };
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), label ? Math.max(ms, 7000) : ms);
}

/* ---------- dialogs ---------- */
/* Scroll lock: while any dialog/sheet is open the page behind it must not scroll (wheel, touch, keyboard, iOS rubber-band).
   The page is pinned with position:fixed at its current offset and restored on close; a MutationObserver covers every dialog, however it is opened. */
let lockY = null;
function syncScrollLock() {
  const open = !!document.querySelector('dialog[open]');
  const root = document.documentElement, b = document.body;
  if (open && lockY === null) {
    lockY = window.scrollY || root.scrollTop || 0;
    const sbw = window.innerWidth - root.clientWidth;
    b.style.top = `-${lockY}px`;
    b.classList.add('dlg-lock');
    if (sbw > 0) b.style.paddingRight = `${sbw}px`;
  } else if (!open && lockY !== null) {
    const y = lockY; lockY = null;
    b.classList.remove('dlg-lock');
    b.style.top = ''; b.style.paddingRight = '';
    const prev = root.style.scrollBehavior; root.style.scrollBehavior = 'auto';
    window.scrollTo(0, y);
    root.style.scrollBehavior = prev;
  }
}
if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
  new MutationObserver(syncScrollLock).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
}

export const dialogOpen = () => !!document.querySelector('dialog[open]');

/** Close on a click on the backdrop, but not when a text selection drag merely ended there. */
function backdropClose(d) {
  let down = null;
  d.addEventListener('pointerdown', (e) => (down = e.target));
  d.addEventListener('click', (e) => { if (e.target === d && down === d) d.close(); down = null; });
}

/**
 * Generic dialog. `actions`: [{label, value, primary, danger}]. Resolves with the clicked value,
 * or `undefined` if dismissed (Esc / backdrop). `render(form)` can wire up extra controls.
 */
export function dialog({ title, body = '', actions = [{ label: 'OK', value: true, primary: true }], onOpen, collect }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'dlg';
    d.setAttribute('aria-label', title);
    const pi = actions.findIndex((a) => a.primary);
    d.innerHTML = `<form method="dialog"><h3>${esc(title)}</h3><div class="body">${body}</div>${pi >= 0 ? `<button class="sr" tabindex="-1" aria-hidden="true" value="${pi}"></button>` : ''}<div class="acts">${actions.map((a, i) => `<button class="btn ${a.primary ? 'primary' : ''} ${a.danger ? 'danger' : ''}" value="${i}" ${a.primary ? '' : 'formnovalidate'}>${a.icon ? icon(a.icon) + ' ' : ''}${esc(a.label)}</button>`).join('')}</div></form>`;
    document.body.append(d);
    let out;
    d.addEventListener('close', () => {
      const i = d.returnValue;
      out = i === '' || i == null ? undefined : actions[+i].value;
      if (out !== undefined && collect) out = collect(d, out);
      d.remove(); resolve(out);
    });
    backdropClose(d);
    d.showModal();
    onOpen && onOpen(d);
  });
}
/** Destructive confirmation: the red button stays disabled until `word` is typed exactly. Resolves true or false. */
export const typedConfirmDlg = (title, msg, word, { ok = 'Erase' } = {}) =>
  dialog({
    title,
    body: `<div>${msg}</div><label style="display:block;margin-top:12px">Type <b>${esc(word)}</b> to confirm<input class="inp" name="w" autocomplete="off" autocapitalize="characters" spellcheck="false" style="margin-top:8px" aria-label="Type ${esc(word)} to confirm"></label>`,
    actions: [{ label: 'Cancel', value: false }, { label: ok, value: true, danger: true }],
    onOpen: (d) => {
      const inp = d.querySelector('input[name="w"]'), go = d.querySelector('button.danger');
      const match = () => inp.value.trim().toUpperCase() === word.toUpperCase();
      go.disabled = true;
      inp.addEventListener('input', () => { go.disabled = !match(); });
      inp.focus();
    },
    collect: (d, v) => v === true && d.querySelector('input[name="w"]').value.trim().toUpperCase() === word.toUpperCase(),   // Enter in the field can bypass the disabled button; the word is re-checked here
  }).then((v) => v === true);
export const confirmDlg = (title, msg, { ok = 'Confirm', danger = false } = {}) =>
  dialog({ title, body: `<p>${msg}</p>`, actions: [{ label: 'Cancel', value: false }, { label: ok, value: true, primary: !danger, danger }] }).then((v) => v === true);

export const promptDlg = (title, label, value = '', { type = 'text', min, max, ok = 'Save', hint = '' } = {}) =>
  dialog({
    title,
    body: `<label>${esc(label)}<input class="inp" name="v" type="${esc(type)}" value="${esc(value)}" ${min != null ? `min="${min}"` : ''} ${max != null ? `max="${max}"` : ''} ${type == 'number' ? 'inputmode="numeric"' : 'autocomplete="off" autocapitalize="off" spellcheck="false"'} style="margin-top:8px"></label>${hint ? `<p class="mu" style="margin-top:8px">${hint}</p>` : ''}`,
    actions: [{ label: 'Cancel', value: false }, { label: ok, value: true, primary: true }],
    onOpen: (d) => { const i = d.querySelector('input'); i.focus(); i.select(); },
    collect: (d, v) => (v ? d.querySelector('input').value : null),
  }).then((v) => (v === undefined || v === false ? null : v));

/** Pick one of several options. options: [{value,title,desc}] */
export function choiceDlg(title, intro, options) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'dlg';
    d.setAttribute('aria-label', title);
    backdropClose(d);
    d.innerHTML = `<form method="dialog"><h3>${esc(title)}</h3><div class="body">${intro}</div><div style="display:grid;gap:8px">${options.map((o, i) => `<button class="opt${o.danger ? ' danger' : ''}${o.primary ? ' feat' : ''}" value="${i}"><div>${o.tag ? `<em class="otag">${esc(o.tag)}</em>` : ''}<b>${esc(o.title)}</b><span>${esc(o.desc || '')}</span></div></button>`).join('')}</div><div class="acts"><button class="btn" value="x">Cancel</button></div></form>`;
    document.body.append(d);
    d.addEventListener('close', () => { const i = d.returnValue; d.remove(); resolve(i === '' || i === 'x' ? undefined : options[+i].value); });
    d.showModal();
  });
}

/**
 * The first-visit welcome. One signature moment (the question board answering itself), then three clear ways in.
 * Resolves 'demo' | 'go' | 'look' (Esc, backdrop, swipe and "just look" all mean 'look').
 */
export function welcomeDlg() {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'dlg welcome';
    d.tabIndex = -1;   // it opens unprompted: focus the dialog itself, not the first button, so no ring is drawn until someone presses Tab
    d.setAttribute('aria-labelledby', 'wl-h');
    backdropClose(d);
    d.innerHTML = `<form method="dialog">
      <div class="wl-hero" aria-hidden="true">
        <div class="wl-board">
          <div class="wl-tag"><span class="pill wl-pill">Multiplication</span><span class="wl-par">par 6.0s</span></div>
          <div class="wl-q">47 × 38</div>
          <div class="wl-a"><span>1</span><span>7</span><span>8</span><span>6</span><i class="wl-cur"></i></div>
          <div class="wl-qt"><i></i></div>
          <span class="wl-ok">${icon('check')}Right</span>
        </div>
      </div>
      <div class="wl-main">
        <h3 id="wl-h">Get faster at the math in your head</h3>
        <p class="wl-sub">Timed sessions that adapt to you. Every miss comes back, with the method to solve it.</p>
        <div class="wl-acts">
          <button class="btn primary lg block wl-go" value="demo">${icon('play')}<span>Take the tour</span></button>
          <p class="wl-note">Sample data, five weeks in. Nothing is saved.</p>
          <div class="wl-two">
            <button class="btn lg" value="go">Start practising</button>
            <button class="btn ghost lg" value="look">Just look around</button>
          </div>
        </div>
        <p class="wl-foot">Works offline. Progress stays on this device unless you turn on sync.</p>
      </div>
    </form>`;
    document.body.append(d);
    d.addEventListener('close', () => { const v = d.returnValue; d.remove(); resolve(v === 'demo' || v === 'go' ? v : 'look'); });
    d.showModal();
    d.focus({ preventScroll: true });
  });
}

/* ---------- misc ---------- */
export function burst(n = 44) {
  if (matchMedia('(prefers-reduced-motion:reduce)').matches || document.documentElement.dataset.motion == 'reduce') return;
  const c = document.createElement('div'), K = ['var(--ac)', 'var(--gd)', 'var(--ok)', '#ff6b9a', '#b48cff'];
  c.className = 'bst';
  for (let i = 0; i < n; i++) {
    const b = document.createElement('i');
    b.style.cssText = `left:${Math.random() * 100}%;--k:${K[i % K.length]};--w:${6 + Math.random() * 6}px;--h:${9 + Math.random() * 8}px;--dx:${(Math.random() - 0.5) * 160}px;animation-delay:${Math.random() * 0.5}s`;
    c.append(b);
  }
  document.body.append(c);
  setTimeout(() => c.remove(), 3400);
}

export async function copy(t) {
  try { await navigator.clipboard.writeText(t); }
  catch (e) { const x = document.createElement('textarea'); x.value = t; document.body.append(x); x.select(); document.execCommand('copy'); x.remove(); }
  toast('Copied to clipboard');
}

export function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
