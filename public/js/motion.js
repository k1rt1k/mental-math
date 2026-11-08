// Motion layer, JS half: numbers count up when a screen is entered. Everything else is CSS (css/motion.css).
// Runs only on navigation (#main.enter) and when a dialog opens, never on in-place repaints, and never with reduced motion.
const still = () => document.documentElement.dataset.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (t) => 1 - Math.pow(1 - t, 4);                 // easeOutQuart: quick start, soft landing

/** Count the first text node of `el` from 0 to its integer value. Skips anything that is not a plain number. */
function count(el, ms = 800, wait = 0) {
  const node = [...el.childNodes].find((n) => n.nodeType === 3 && /\d/.test(n.nodeValue));
  if (!node) return;
  const m = node.nodeValue.match(/^(\s*)(-?\d[\d,]*)(\s*|[^\d].*)$/s);
  if (!m) return;
  const to = parseInt(m[2].replace(/,/g, ''), 10), sep = m[2].includes(',');
  if (!Number.isFinite(to) || Math.abs(to) < 3 || Math.abs(to) > 1e7) return;
  const fmt = (v) => (sep ? Math.round(v).toLocaleString() : String(Math.round(v)));
  const t0 = performance.now() + wait;
  const tick = (now) => {
    const k = Math.min(1, Math.max(0, (now - t0) / ms));
    node.nodeValue = m[1] + fmt(to * ease(k)) + m[3];
    if (k < 1) requestAnimationFrame(tick);
  };
  node.nodeValue = m[1] + fmt(0) + m[3];
  requestAnimationFrame(tick);
}

const SEL = '.stat .v, .lvl b, .sk .lv, .score .v, .rs b, .pscore b, .pmstats b';
/** How long until `el` is visible: the longest entrance delay on it or any ancestor (cascade position), plus a beat for the fade to get going. */
function lead(el, root) {
  let d = 0;
  for (let n = el; n && n !== root && n.getAnimations; n = n.parentElement) for (const a of n.getAnimations()) { const t = a.effect && a.effect.getTiming(); if (t && typeof t.delay == 'number') d = Math.max(d, t.delay); }
  return d + 110;
}
function run(root) { if (!still()) root.querySelectorAll(SEL).forEach((el) => !el.dataset.counted && ((el.dataset.counted = 1), count(el, 800, lead(el, root)))); }

/** Wrong answer: the question shakes. Right answer on a streak: the flame pops. Web Animations, so they never fight the CSS entrance. */
export const nudge = (el) => { if (!el || still() || !el.animate) return; el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)', offset: .2 }, { transform: 'translateX(5px)', offset: .45 }, { transform: 'translateX(-3px)', offset: .7 }, { transform: 'translateX(1px)', offset: .88 }, { transform: 'translateX(0)' }], { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' }); };
export const bump = (el, k = 1.18) => { if (!el || still() || !el.animate) return; el.animate([{ transform: 'scale(1)' }, { transform: `scale(${k})`, offset: .35 }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.3,1.12,.5,1)' }); };

const phone = () => matchMedia('(max-width: 900px)').matches;

/** Light haptic tick on phones that support it (Android; iOS ignores it). Off with Reduce motion. */
export const buzz = (p) => { try { if (!still() && navigator.vibrate) navigator.vibrate(p); } catch { /* unsupported */ } };
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch' || !e.target.closest) return;
  if (e.target.closest('.pad button')) buzz(3); else if (e.target.closest('.nv, .mode, .sk, .btn.primary, .chip, .seg button')) buzz(6);
}, { passive: true });

/** Phones: blocks below the fold wait, then settle in as they scroll into view (charts draw at that moment too). */
let io;
function reveal(root) {
  if (still() || !('IntersectionObserver' in window)) return;
  io ||= new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) { x.target.classList.add('seen'); io.unobserve(x.target); } }), { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
  root.querySelectorAll('.card, .mode, .sk').forEach((el) => {
    if (el.closest('.rv') || el.closest('dialog') || el.getBoundingClientRect().top < innerHeight - 30) return;
    el.classList.add('rv'); io.observe(el);
  });
}

const main = document.querySelector('#main');
if (main) new MutationObserver(() => { if (main.classList.contains('enter')) { run(main); reveal(main); } }).observe(main, { childList: true });
new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && n.matches && n.matches('dialog.dlg') && run(n)))).observe(document.body, { childList: true });

/** Phone bottom sheets: drag the handle down to dismiss, with a springy snap-back. Same result as Esc. */
function sheet(d) {
  const g = document.createElement('div'); g.className = 'grab'; g.setAttribute('aria-hidden', 'true'); d.append(g);
  let y0 = 0, t0 = 0, dy = 0, on = false;
  const set = (v) => { d.style.transform = v ? `translateY(${v}px)` : ''; d.style.setProperty('--dim', String(Math.max(0, 1 - v / 420))); };
  g.addEventListener('pointerdown', (e) => { if (still()) return; on = true; y0 = e.clientY; t0 = e.timeStamp; dy = 0; d.style.transition = 'none'; g.setPointerCapture(e.pointerId); });
  g.addEventListener('pointermove', (e) => { if (!on) return; dy = Math.max(0, e.clientY - y0); set(dy); });
  const end = (e) => {
    if (!on) return; on = false;
    const v = dy / Math.max(1, e.timeStamp - t0);
    if (dy > 110 || (v > 0.6 && dy > 30)) { d.dataset.fast = '1'; d.style.transition = 'transform .22s cubic-bezier(.4,0,1,1)'; set(d.offsetHeight); setTimeout(() => d.close(), 200); }
    else { d.style.transition = 'transform .42s cubic-bezier(.3,1.12,.5,1)'; set(0); setTimeout(() => (d.style.transition = ''), 400); }
  };
  g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
}
/** Dialogs used to vanish in one frame after a soft entrance. Every way of closing one (Esc, backdrop, a button, d.close()) now plays the exit first, then closes for real, so `close` listeners and returnValue behave exactly as before. */
function exit(d) {
  const native = d.close.bind(d); let leaving = false;
  const leave = (v) => {
    if (leaving || !d.open) return;
    if (still() || d.dataset.fast) return native(v);
    leaving = true; d.classList.add('out');
    let done = false; const fin = () => { if (!done) { done = true; native(v); } };
    d.addEventListener('animationend', (e) => { if (e.target === d && !e.pseudoElement) fin(); });
    setTimeout(fin, 340);                                   // safety net if the animation never reports back
  };
  d.close = leave;
  d.addEventListener('cancel', (e) => { e.preventDefault(); leave(); });
  d.addEventListener('submit', (e) => { if (e.target.method !== 'dialog') return; e.preventDefault(); leave(e.submitter ? e.submitter.value : ''); }, true);
}
new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1 && n.matches && n.matches('dialog.dlg')) { sheet(n); exit(n); } }))).observe(document.body, { childList: true });

/** Light follows the pointer on every device: a mouse keeps a tile lit while it hovers, a finger lights it while held (and drags the light along), then it fades. */
const LIT = '.mode, .sk';
let sp = 0, held = null;
const aim = (el, e) => { const r = el.getBoundingClientRect(); el.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px'); el.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px'); };
document.addEventListener('pointermove', (e) => {
  if (sp || still()) return;
  const el = e.pointerType === 'mouse' ? e.target.closest && e.target.closest(LIT) : held; if (!el) return;
  sp = requestAnimationFrame(() => { sp = 0; aim(el, e); });
}, { passive: true });
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' || still() || !e.target.closest) return;
  const el = e.target.closest(LIT);
  if (el) { held = el; aim(el, e); el.classList.add('lit'); }
  const b = e.target.closest('.btn.primary');
  if (b && !b.disabled) { b.classList.remove('shine'); void b.offsetWidth; b.classList.add('shine'); }
}, { passive: true });
const drop = () => { if (!held) return; const el = held; held = null; setTimeout(() => el.classList.remove('lit'), 140); };
document.addEventListener('pointerup', drop, { passive: true }); document.addEventListener('pointercancel', drop, { passive: true });

/** Touch ripple: a soft wave from the fingertip (mouse keeps its hover sheen instead). */
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' || still() || !e.target.closest) return;
  const b = e.target.closest('.btn, .opt, .seg button, .tabs2 button, .chip, .step, .lnk2, .syncdot'); if (!b || b.disabled) return;
  const r = b.getBoundingClientRect(), d = document.createElement('u'); d.className = 'rip';
  d.style.cssText = `--x:${(e.clientX - r.left).toFixed(0)}px;--y:${(e.clientY - r.top).toFixed(0)}px;--s:${Math.round(Math.max(r.width, r.height) * 2.2)}px`;
  b.append(d); d.addEventListener('animationend', () => d.remove(), { once: true }); setTimeout(() => d.remove(), 900);
}, { passive: true });

/** Phone tab bar: one pill glides to the active tab. Measured from the real icon pill, so it fits any width, font or notch. */
const tabs = document.querySelector('#tabs');
if (tabs) {
  const place = () => {
    const all = [...tabs.querySelectorAll('[data-go]')], cur = tabs.querySelector('[aria-current=page] .nvi');
    tabs.classList.toggle('np', !cur);
    if (!cur || !cur.offsetWidth) return;
    let x = 0, y = 0, n = cur; while (n && n !== tabs) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    const st = tabs.style; st.setProperty('--px', x + 'px'); st.setProperty('--py', y + 'px'); st.setProperty('--pw', cur.offsetWidth + 'px'); st.setProperty('--ph', cur.offsetHeight + 'px');
    if (all.length && !tabs.classList.contains('rdy')) requestAnimationFrame(() => requestAnimationFrame(() => tabs.classList.add('rdy')));
  };
  new MutationObserver(place).observe(tabs, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-current'] });
  addEventListener('resize', place); if (document.fonts && document.fonts.ready) document.fonts.ready.then(place); place();
}

/** Segmented controls and sub-tabs: a single highlight glides from the old choice to the new one. Screens repaint with innerHTML, so the last position is remembered per control and the new highlight starts there. */
const spots = new Map();
function slide(root) {
  root.querySelectorAll('.seg, .tabs2').forEach((c, i) => {
    const on = c.querySelector('[aria-pressed=true], [aria-selected=true]'); if (!on || !on.offsetWidth) return;
    const tab = c.classList.contains('tabs2'), key = location.hash + '|' + c.className.replace(/\bhas-ind\b/, '').trim() + '|' + i + '|' + (c.getAttribute('aria-label') || '');
    const cur = tab ? { x: on.offsetLeft, y: on.offsetTop + on.offsetHeight - 2, w: on.offsetWidth, h: 2 } : { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
    const old = spots.get(key), glide = !!old && !still() && !main.classList.contains('enter') && (old.x !== cur.x || old.y !== cur.y || old.w !== cur.w);
    c.querySelectorAll(':scope > .ind').forEach((x) => x.remove());
    const u = document.createElement('u'); u.className = 'ind';
    const put = (r) => { u.style.setProperty('--ix', r.x + 'px'); u.style.setProperty('--iy', r.y + 'px'); u.style.setProperty('--iw', r.w + 'px'); u.style.setProperty('--ih', r.h + 'px'); };
    put(glide ? old : cur); c.prepend(u); c.classList.add('has-ind');
    if (glide) { void u.offsetWidth; u.classList.add('go'); put(cur); }
    spots.set(key, cur);
  });
}
if (main) { new MutationObserver(() => slide(main)).observe(main, { childList: true }); main.addEventListener('mm:paint', () => slide(main)); if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => slide(main)); }

/** A live number changed (points, streak, counters): the text swaps at once, the number gives one soft pulse so the eye catches it. */
export function pulse(el, text, k = 1.07) {
  if (!el) return;
  const t = String(text);
  if (el.textContent === t) return;
  el.textContent = t;
  if (still() || !el.animate) return;
  el.animate([{ transform: 'scale(1)' }, { transform: `scale(${k})`, offset: .3 }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(.3,1.12,.5,1)' });
}

/** Scroll state: sticky bars (tab bar, sub-tabs) gain depth only once content actually slides under them. One passive listener, one class, toggled only when it flips. */
{
  let sc = false, raf = 0;
  const upd = () => { raf = 0; const on = scrollY > 6; if (on !== sc) { sc = on; document.body.classList.toggle('scrolled', on); } };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(upd); }, { passive: true });
  upd();
}

/** Anything tapped on a phone answers with a very short, quiet tap on the thing itself (not only the ripple): a one-frame squeeze that releases softly. Covers whole cards and rows that are tappable but are not buttons. */
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' || still() || !e.target.closest) return;
  const el = e.target.closest('.card[data-act], .card[role=button], .log > [data-act], .fr[data-act], summary');
  if (!el || el.classList.contains('tap')) return;
  el.classList.add('tap'); const off = () => { el.classList.remove('tap'); };
  addEventListener('pointerup', off, { once: true, passive: true }); addEventListener('pointercancel', off, { once: true, passive: true });
  setTimeout(off, 1200);
}, { passive: true });

/** Touch has no hover, so a tap plays the icon motion that a mouse hover plays (css/motion.css, rules on .ipl). It is put on the tapped control (or the
 *  card, stat or heading row it sits in) for a moment and then taken off. Mouse users keep the hover rules; Reduce motion plays nothing. */
const IPL = 'button, a, .chip, .stat, .card[data-act], .cstat, .stk-hero, .stk-rest, .stk-h, .cpanel-h';
document.addEventListener('click', (e) => {
  if (still() || !e.target || !e.target.closest) return;
  const touch = e.pointerType === 'touch' || e.pointerType === 'pen' || !matchMedia('(hover: hover)').matches;
  if (!touch) return;
  const el = e.target.closest(IPL);
  if (!el || !el.querySelector('.ic')) return;
  el.classList.remove('ipl'); void el.offsetWidth; el.classList.add('ipl');      // restart if tapped again
  clearTimeout(el._ipl); el._ipl = setTimeout(() => el.classList.remove('ipl'), 1000);
}, { passive: true });
