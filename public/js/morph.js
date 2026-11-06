// Fluid repaints. Screens are painted with innerHTML, which throws the old DOM away: switches, bars, chips and numbers
// all "teleport" to their new state because the element that could have transitioned no longer exists.
// This module makes an IN-PLACE repaint of #main (a toggle, a sync, a list change) reuse the existing elements instead:
//   - attributes, classes and text are patched, so every CSS transition you already have actually runs;
//   - focus, caret, scroll position and text selection survive;
//   - things that moved glide to their new place (FLIP), new things ease in, removed things ease out;
//   - numbers roll to their new value.
// Navigation, Play and Results still replace the DOM exactly as before. Reduce motion: patching still happens
// (so state is always right), only the movement is skipped.
const still = () => document.documentElement.dataset.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(.22, 1, .36, 1)';
const MORPHABLE = new Set(['home', 'coach', 'learn', 'progress', 'notebook', 'settings']);
const KEEP_CLASS = new Set(['rv', 'seen', 'lit', 'shine', 'has-ind', 'rdy', 'out', 'np']);   // classes added by motion.js on live elements; a repaint must not strip them
const KEEP_ATTR = new Set(['data-counted', 'data-ghost']);
const setHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML').set;
const getHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML').get;

/* ---------- what moves, appears and leaves ---------- */
const FLIP = '.hd, .card, .set, .field, .notice, .step, .wk, .tod, .lvl, .mode, .sk, .chips > *, .log > *, .fr, .chat-msg, .rs, .stat, .home, .home-main, .home-side, .modes, .skills, .g, .g3, .c2, .cols, .ms, .tbl tr, h2, .btns';
const LEAVE = '.card, .set, .field, .notice, .step, .fr, .chat-msg, .chips > *, .mode, .sk, .wk, .lvl, .log > *';
const NUM = '.stat .v, .lvl b, .sk .lv, .score .v, .rs b, .num, .stepper b, .fr b';

/** Identity of an element: its id, data-k, or its action+value; failing that, the first keyed thing inside it (a settings row is "the row with the mute switch"). Without a key elements match by position. Cached per pass. */
let kc = new Map();
const own = (n) => n.id || n.getAttribute('data-k') || (n.dataset && n.dataset.act && n.dataset.v != null ? n.dataset.act + '\u0001' + n.dataset.v : '');
function keyOf(n) {
  if (n.nodeType !== 1) return '';
  let k = kc.get(n);
  if (k === undefined) {
    k = own(n);
    if (!k && n.firstElementChild) { const d = n.querySelector('[id], [data-k], [data-act][data-v]'); k = d ? '~' + own(d) : ''; }
    kc.set(n, k);
  }
  return k;
}
const live = (n) => !(n.nodeType === 1 && (n.hasAttribute('data-ghost') || (n.localName === 'u' && (n.classList.contains('ind') || n.classList.contains('rip')))));
const same = (a, b) => a.nodeType === b.nodeType && (a.nodeType !== 1 || (a.localName === b.localName && keyOf(a) === keyOf(b)));

/* ---------- number roll ---------- */
const NUMRE = /^(\s*)(-?\d[\d,]*)(\s*|[^\d].*)$/s;
function roll(node, from, to) {
  const a = NUMRE.exec(from), b = NUMRE.exec(to);
  if (!a || !b || a[3] !== b[3]) return false;
  const x = parseInt(a[2].replace(/,/g, ''), 10), y = parseInt(b[2].replace(/,/g, ''), 10), sep = b[2].includes(',');
  if (!Number.isFinite(x) || !Number.isFinite(y) || x === y || Math.abs(x - y) > 1e7) return false;
  const tok = (node.__roll = {}), t0 = performance.now(), ms = Math.min(700, 320 + Math.abs(y - x) * 6);
  const fmt = (v) => (sep ? Math.round(v).toLocaleString() : String(Math.round(v)));
  node.nodeValue = from;
  const tick = (now) => {
    if (node.__roll !== tok) return;
    const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 4);
    node.nodeValue = b[1] + fmt(x + (y - x) * e) + b[3];
    if (k < 1) requestAnimationFrame(tick); else { node.nodeValue = to; node.__roll = null; }
  };
  requestAnimationFrame(tick);
  return true;
}
function patchText(o, n) {
  if (o.nodeValue === n.nodeValue) return;
  const p = o.parentElement;
  if (!still() && p && p.matches(NUM) && roll(o, o.nodeValue, n.nodeValue)) return;
  o.__roll = null; o.nodeValue = n.nodeValue;
}

/* ---------- element patch ---------- */
function patchAttrs(o, n) {
  for (const a of [...o.attributes]) if (!n.hasAttribute(a.name) && a.name !== 'class' && !KEEP_ATTR.has(a.name)) o.removeAttribute(a.name);
  for (const a of n.attributes) {
    if (a.name === 'class') continue;
    if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
  }
  const keep = [...o.classList].filter((c) => KEEP_CLASS.has(c)), want = n.getAttribute('class') || '';
  const next = (want + ' ' + keep.join(' ')).trim().replace(/\s+/g, ' ');
  if ((o.getAttribute('class') || '') !== next) { if (next) o.setAttribute('class', next); else o.removeAttribute('class'); }
}
function patchEl(o, n) {
  patchAttrs(o, n);
  const f = o.localName;
  if (f === 'input') {
    if (document.activeElement === o) return;                      // never fight someone who is typing
    if (o.type === 'checkbox' || o.type === 'radio') o.checked = n.checked; else if (o.value !== n.value) o.value = n.value;
    return;
  }
  if (f === 'img' || f === 'canvas') return;
  kids(o, n);
  if ((f === 'textarea' || f === 'select') && document.activeElement !== o && o.value !== n.value) o.value = n.value;
}

/* ---------- children ---------- */
function kids(op, np) {
  const olds = [...op.childNodes].filter(live), news = [...np.childNodes];
  let i = 0;
  for (const nn of news) {
    const on = olds[i];
    if (on && same(on, nn)) { patch(on, nn); i++; continue; }
    const k = keyOf(nn);
    if (k) {
      const j = olds.findIndex((x, idx) => idx > i && same(x, nn));
      if (j > -1) { const m = olds.splice(j, 1)[0]; olds.splice(i, 0, m); op.insertBefore(m, on || null); patch(m, nn); i++; continue; }
    }
    op.insertBefore(nn, on || null); added.push(nn);
  }
  for (const x of olds.slice(i)) { if (x.nodeType === 1) gone.push(x); op.removeChild(x); }
}
function patch(o, n) {
  if (o.nodeType === 3 || o.nodeType === 8) return patchText(o, n);
  patchEl(o, n);
}

/* ---------- FLIP / appear / leave ---------- */
let added = [], gone = [];
function measure(root) {
  const m = new Map();
  root.querySelectorAll(FLIP).forEach((el) => { if (!el.closest('svg')) m.set(el, el.getBoundingClientRect()); });
  return m;
}
function ghost(root, el, r) {
  if (!r || !r.width || !r.height || r.bottom < 0 || r.top > innerHeight) return;
  const g = el.cloneNode(true);
  g.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id')); g.removeAttribute('id');
  g.setAttribute('data-ghost', ''); g.setAttribute('aria-hidden', 'true'); g.removeAttribute('data-act');
  g.querySelectorAll('[data-act],[data-go],button,a,input').forEach((x) => { x.tabIndex = -1; x.removeAttribute('data-act'); x.removeAttribute('data-go'); });
  g.style.cssText += `;position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;pointer-events:none;z-index:2;animation:none`;
  root.append(g);
  const a = g.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.97) translateY(-4px)' }], { duration: 220, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
  a.onfinish = a.oncancel = () => g.remove();
  setTimeout(() => g.remove(), 600);
}
function settle(root, before) {
  const ents = [...before].filter(([el]) => el.isConnected && root.contains(el));
  const rel = new Map();
  for (const [el, r0] of ents) {                                    // document order: ancestors before descendants
    const r1 = el.getBoundingClientRect();
    let dx = r0.left - r1.left, dy = r0.top - r1.top;
    const abs = { dx, dy };
    let p = el.parentElement;
    while (p && p !== root && !rel.has(p)) p = p.parentElement;
    if (p && p !== root) { const a = rel.get(p); dx -= a.dx; dy -= a.dy; }
    rel.set(el, abs);
    if (Math.abs(dx) < 1.5 && Math.abs(dy) < 1.5) continue;
    if (r0.bottom < -200 && r1.bottom < -200) continue;
    if (r0.top > innerHeight + 200 && r1.top > innerHeight + 200) continue;   // nobody sees it move
    el.animate({ translate: [`${dx.toFixed(1)}px ${dy.toFixed(1)}px`, '0px 0px'] }, { duration: 420, easing: EASE });
  }
  for (const el of added) {
    if (el.nodeType !== 1 || !el.isConnected) continue;
    if (el.closest('svg') || el.localName === 'u') continue;
    el.animate([{ opacity: 0, transform: 'translateY(8px) scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 400, easing: EASE });
  }
}

/* ---------- entry point ---------- */
let lastScr = '';
function install(main) {
  Object.defineProperty(main, 'innerHTML', {
    configurable: true,
    get() { return getHTML.call(this); },
    set(html) {
      const scr = this.dataset.scr || '', fresh = this.dataset.fresh === '1';
      delete this.dataset.fresh;
      const sameScreen = !fresh && scr === lastScr && MORPHABLE.has(scr) && this.firstElementChild;
      lastScr = scr;
      if (!sameScreen) { setHTML.call(this, html); return; }
      const shadow = document.createElement('main');
      setHTML.call(shadow, html);
      const a = this.firstElementChild, b = shadow.firstElementChild;
      const h = (e) => { const x = e && e.querySelector('h1'); return x ? x.textContent : ''; };
      const cls = (e) => [...e.classList].filter((c) => !KEEP_CLASS.has(c)).join(' ');
      if (!b || cls(a) !== cls(b) || h(this) !== h(shadow)) { setHTML.call(this, html); return; }   // a different screen in disguise: replace
      const calm = still() || this.classList.contains('enter');       // during the entrance, rects include in-flight transforms: patch only
      added = []; gone = []; kc = new Map();
      const y0 = scrollY;                                              // an in-place repaint must never move the page
      const before = calm ? null : measure(this);
      const rects = before && new Map(before);
      try { kids(this, shadow); }
      catch (err) { console.error(err); setHTML.call(this, html); return; }        // never leave a half-patched screen
      if (!calm) {
        try { settle(this, before); for (const el of gone) if (el.matches && el.matches(LEAVE)) ghost(this, el, rects.get(el)); } catch (err) { console.error(err); }
      }
      if (Math.abs(scrollY - y0) > 1) scrollTo({ top: y0, left: 0, behavior: 'instant' });
      this.dispatchEvent(new CustomEvent('mm:paint'));
    },
  });
}

/** Patch the children of any small container the same way (Play's side panel, answer feed). `html` replaces its content. */
export function patchInto(el, html) {
  if (!el) return;
  if (!el.firstChild) { setHTML.call(el, html); return; }
  const shadow = document.createElement(el.localName);
  setHTML.call(shadow, html);
  const hold = [added, gone]; added = []; gone = []; kc = new Map();
  const before = still() ? null : measure(el), rects = before && new Map(before);
  kids(el, shadow);
  if (before) { settle(el, before); for (const x of gone) if (x.matches && x.matches(LEAVE)) ghost(el, x, rects.get(x)); }
  [added, gone] = hold;
}

const main = document.querySelector('#main');
if (main) install(main);
