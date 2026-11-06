// UI primitives: icons, toast, dialogs (replacing prompt()/confirm()), confetti, clipboard.
import { $, esc } from './util.js';

const P = {
  home: '<path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>',
  play: '<path d="M7 5v14l12-7z"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .2 1.2.8 2 1.6 2.4C10 8.5 10.5 5.5 12 3z"/>',
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
  star: '<path d="m12 4 2.500 5.200 5.500.800-4 3.900.900 5.600L12 16.900 7.100 19.500 8 13.900 4 10l5.500-.800z"/>',
  back: '<path d="M9 6h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5-6z"/><path d="m12.500 10 4 4m0-4-4 4"/>',
  keys: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>',
  sparkle: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
};
export const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;

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
    d.innerHTML = `<form method="dialog"><h3>${esc(title)}</h3><div class="body">${intro}</div><div style="display:grid;gap:8px">${options.map((o, i) => `<button class="opt${o.danger ? ' danger' : ''}" value="${i}"><div><b>${esc(o.title)}</b><span>${esc(o.desc || '')}</span></div></button>`).join('')}</div><div class="acts"><button class="btn" value="x">Cancel</button></div></form>`;
    document.body.append(d);
    d.addEventListener('close', () => { const i = d.returnValue; d.remove(); resolve(i === '' || i === 'x' ? undefined : options[+i].value); });
    d.showModal();
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
