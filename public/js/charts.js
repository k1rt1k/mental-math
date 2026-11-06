// Small dependency-free SVG/HTML charts. All colours come from CSS variables so themes just work.
import { IDS, COL, SH, SK } from './engine.js';
import { S } from './state.js';
import { esc, ymd, dayAgo, mmss } from './util.js';

/** Tooltip title for a session point: date and time. */
export const sessLabel = (x) => new Date(x.t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

let sparkN = 0;
/** Compact JSON for the data-pts attribute: [[x, y, title, detail], ...] in viewBox units. */
const pts = (P, T) => esc(JSON.stringify(P.map((p, i) => [+p[0].toFixed(1), +p[1].toFixed(1), T[i][0], T[i][1]])));

/** Skill hexes are darkened on the Light theme by the same mix the CSS uses; CSS-variable colours pass through. */
const ink = (c) => (String(c).startsWith('#') ? `color-mix(in srgb, ${c} var(--fill-mix), var(--ink-base))` : c);

/** Line chart with area fill, best point highlighted and end value labelled. */
export function spark(v, col0, { w = 420, h = 96, fmt = (x) => Math.round(x), unit = '', labels = [] } = {}) {
  const col = ink(col0), uid = ++sparkN;
  if (v.length < 2) return '<div class="mu" style="padding:8px 0">Needs 2+ sessions</div>';
  const mn = Math.min(...v), mx = Math.max(...v), sp = mx - mn || 1, bi = v.indexOf(mx), pad = 10;
  const P = v.map((y, i) => [pad + (i * (w - pad * 2)) / (v.length - 1), h - pad - ((y - mn) / sp) * (h - pad * 2 - 6)]);
  const line = P.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
  const last = P[P.length - 1];
  const tips = v.map((y, i) => [labels[i] || 'Session ' + (i + 1) + ' of ' + v.length, fmt(y) + unit + (i ? ' (' + (y - v[i - 1] >= 0 ? '+' : '−') + fmt(Math.abs(y - v[i - 1])) + unit + ')' : '')]);
  return `<div class="chw"><svg viewBox="0 0 ${w} ${h}" class="sp ix" tabindex="0" data-ch="x" data-pts='${pts(P, tips)}' role="img" aria-label="Trend, low ${fmt(mn)}${esc(unit)}, best ${fmt(mx)}${esc(unit)}, latest ${fmt(v[v.length - 1])}${esc(unit)}">
    ${[0.25, 0.5, 0.75].map((f) => `<line x1="${pad}" x2="${w - pad}" y1="${(pad + f * (h - pad * 2)).toFixed(1)}" y2="${(pad + f * (h - pad * 2)).toFixed(1)}" style="stroke:var(--ln)" stroke-dasharray="2 5"/>`).join('')}
    <defs><linearGradient id="sg${esc(uid)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${col};stop-opacity:.34"/><stop offset="1" style="stop-color:${col};stop-opacity:0"/></linearGradient></defs>
    <path class="ar" d="M${P[0][0]},${h - pad} L${line.replaceAll(' ', ' L')} L${last[0]},${h - pad}Z" fill="url(#sg${uid})"/>
    <polyline class="ln" pathLength="1" fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" points="${line}"/>
    ${P.map((p, i) => `<circle class="pt" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i == bi ? 4.5 : i == P.length - 1 ? 3.5 : 6}" fill="${i == bi ? 'var(--gd)' : col}" opacity="${i == bi || i == P.length - 1 ? 1 : 0}"><title>${fmt(v[i])}${esc(unit)}</title></circle>`).join('')}
  </svg></div><div class="legend"><span>low ${fmt(mn)}${esc(unit)}</span><span>latest <b style="color:var(--tx)">${fmt(v[v.length - 1])}${esc(unit)}</b></span><span>best ${fmt(mx)}${esc(unit)}</span></div>`;
}

export function bars(v, col, labels) {
  const w = 420, h = 100, mx = Math.max(1, ...v), bw = w / v.length;
  const P = v.map((y, i) => [i * bw + bw / 2, h - Math.max(y ? 2 : 0, (y / mx) * h)]), tips = v.map((y, i) => [new Date(labels[i] + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }), y + (y == 1 ? ' answer' : ' answers')]);
  return `<div class="chw"><svg viewBox="0 0 ${w} ${h + 18}" class="sp ix" tabindex="0" data-ch="x" data-pts='${pts(P, tips)}' role="img" aria-label="Answers per day">${v.map((y, i) => {
    const bh = Math.max(y ? 2 : 0, (y / mx) * h);
    return `<rect class="bb" style="--i:${i}" x="${i * bw + 3}" y="${h - bh}" width="${bw - 6}" height="${bh}" rx="4" fill="${ink(col)}" opacity="${y ? 1 : 0}"><title>${esc(labels[i])}: ${y}</title></rect><rect x="${i * bw + 3}" y="${h - 1.5}" width="${bw - 6}" height="1.5" fill="var(--ln)"/><text x="${i * bw + bw / 2}" y="${h + 13}" text-anchor="middle">${esc(labels[i].slice(8))}</text>`;
  }).join('')}</svg></div>`;
}

/** Skill radar. */
export function radar() {
  const n = IDS.length, pt = (i, v) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [110 + 86 * v * Math.cos(a), 108 + 86 * v * Math.sin(a)]; };
  const ring = (f) => IDS.map((k, i) => pt(i, f).join(',')).join(' ');
  const P = IDS.map((k, i) => pt(i, S.sk[k].lv / 12)), tips = IDS.map((k) => [SK[k].n, 'rating ' + Math.round(S.sk[k].lv * 100) + ' · accuracy ' + Math.round(S.sk[k].acc * 100) + '%']);
  return `<div class="chw"><svg viewBox="0 -4 220 230" class="rd ix" tabindex="0" data-ch="radar" data-c="110,108" data-pts='${pts(P, tips)}' role="img" aria-label="Skill radar. Tap a corner for details">${[0.25, 0.5, 0.75, 1].map((f) => `<polygon points="${ring(f)}" fill="none" style="stroke:var(--ln)"/>`).join('')}
  ${IDS.map((k, i) => `<line x1="110" y1="108" x2="${pt(i, 1)[0]}" y2="${pt(i, 1)[1]}" style="stroke:var(--ln)"/>`).join('')}
  <polygon class="rp" points="${IDS.map((k, i) => pt(i, S.sk[k].lv / 12).join(',')).join(' ')}" style="fill:color-mix(in srgb,var(--ac) 24%,transparent);stroke:var(--ac)" stroke-width="2"/>
  ${IDS.map((k, i) => { const [x, y] = pt(i, 1.18); return `<text x="${x}" y="${y}" style="fill:color-mix(in srgb,${COL[k]} var(--ink-mix),var(--ink-base))" font-size="11" font-weight="650" text-anchor="middle" dominant-baseline="middle">${SH[k]}</text>`; }).join('')}</svg></div>`;
}

/** Points-over-time step chart, with ghost. */
export function raceChart(a, b, dur) {
  const w = 640, h = 140, mx = Math.max(1, ...a.map((x) => x[1]), ...(b || []).map((x) => x[1]));
  const last = Math.max(dur || 0, ...a.map((x) => x[0]), 1);
  const pth = (A, c, wd) => {
    if (!A || !A.length) return '';
    let d = 'M0 ' + (h - 6), py = 0;
    A.forEach(([t, y]) => { const X = ((t / last) * w).toFixed(1); d += ' L' + X + ' ' + (h - 6 - (py / mx) * (h - 12)).toFixed(1) + ' L' + X + ' ' + (h - 6 - (y / mx) * (h - 12)).toFixed(1); py = y; });
    return `<path class="rl" pathLength="1" d="${d}" fill="none" style="stroke:${c}" stroke-width="${wd}" stroke-linejoin="round"/>`;
  };
  const at = (A, t) => { let y = 0; for (const [x, v] of A || []) { if (x <= t) y = v; else break; } return y; };
  const N = 48, T = [...Array(N + 1)].map((_, i) => (last * i) / N);
  const P = T.map((t) => [(t / last) * w, h - 6 - (at(a, t) / mx) * (h - 12)]);
  const tips = T.map((t) => [mmss(t), 'you ' + at(a, t) + (b ? ' · ghost ' + at(b, t) : '') + ' pts']);
  return `<div class="chw"><svg viewBox="0 0 ${w} ${h}" class="sp ix" tabindex="0" data-ch="x" data-pts='${pts(P, tips)}' role="img" aria-label="Points over time. Drag to compare with your ghost">${pth(b, 'var(--mu2)', 1.5)}${pth(a, 'var(--ok)', 2.5)}</svg></div><div class="legend"><span class="ok">Your points over time</span><span>${b ? 'Ghost: your previous best' : 'No ghost yet'}</span></div>`;
}

/** Goal ring. */
export function ring(frac, label, size = 76) {
  const C = 2 * Math.PI * 30, id = 'rg' + ++sparkN, f = Math.min(1, Math.max(0, frac));
  return `<div class="chw ringw"><svg width="${size}" height="${size}" viewBox="0 0 70 70" class="ix" tabindex="0" data-ch="tap" data-pts='${pts([[35, 5]], [['Progress', Math.round(f * 100) + '% · ' + label]])}' role="img" aria-label="${esc(label)}"><defs><linearGradient id="${esc(id)}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:color-mix(in srgb,var(--ok) 70%,#fff)"/><stop offset="1" style="stop-color:var(--ok)"/></linearGradient></defs>
    <circle cx="35" cy="35" r="30" fill="none" style="stroke:var(--ln2)" stroke-width="5"/>
    <circle class="rf" cx="35" cy="35" r="30" fill="none" stroke="url(#${id})" stroke-width="5.5" stroke-linecap="round" stroke-dasharray="${C * f} ${C}" transform="rotate(-90 35 35)" style="${f > 0 ? 'filter:drop-shadow(0 0 3px color-mix(in srgb,var(--ok) 55%,transparent))' : ''}"/>
    <text x="35" y="41" text-anchor="middle" style="fill:var(--tx);font-family:var(--serif)" font-size="19" font-weight="600">${esc(label)}</text></svg></div>`;
}

/** Weeks the heatmap shows: half a year when there is room, a quarter on phones. */
export const heatWeeks = () => (matchMedia('(min-width: 900px)').matches ? 26 : 12);

/** Activity heatmap with month labels. */
export function heatmap() {
  const days = heatWeeks() * 7;
  const cnt = {};
  S.sessions.forEach((s) => { const k = ymd(s.t); cnt[k] = (cnt[k] || 0) + s.n; });
  const first = new Date(dayAgo(days - 1)), lead = first.getDay(), cells = Array(lead).fill('<b class="none"></b>'), month = [];
  for (let i = days - 1; i >= 0; i--) {
    const t = dayAgo(i), d = ymd(t), n = cnt[d] || 0;
    month.push(new Date(t).getMonth());
    cells.push(`<b style="--wc:${Math.floor(cells.length / 7)}" class="${n ? (n < 40 ? 'l1' : n < 120 ? 'l2' : 'l3') : ''}" data-d="${esc(d)}" data-n="${n}" title="${esc(d)}: ${n} answers"></b>`);
  }
  // one label per month, placed over the first week-column where that month appears
  const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], labels = [];
  let seen = -1;
  month.forEach((m, i) => { const col = Math.floor((i + lead) / 7); if (m !== seen && (labels.length == 0 || col - labels[labels.length - 1][0] >= 2)) { labels.push([col, MN[m]]); } seen = m; });
  return `<div class="chw"><div class="hmw"><div class="hml" aria-hidden="true">${labels.map(([c, l]) => `<span style="left:${c * 21}px">${l}</span>`).join('')}</div><div class="hm ixh" tabindex="0" role="img" aria-label="Practice activity for the last ${heatWeeks()} weeks">${cells.join('')}</div></div></div><div class="legend"><span>${ymd(first)}</span><span>less <span class="dot" style="background:var(--c2)"></span> <span class="dot" style="background:color-mix(in srgb,var(--ok) 32%,var(--c2))"></span> <span class="dot" style="background:color-mix(in srgb,var(--ok) 62%,var(--c2))"></span> <span class="dot" style="background:var(--ok)"></span> more</span><span>today</span></div>`;
}


/* ---------- interaction: hover, tap or drag over any chart; arrow keys too ---------- */
// One delegated set of listeners serves every chart, so charts redrawn by any view stay interactive.
const NS = 'http://www.w3.org/2000/svg';
let tip = null, cur = null, pinned = null;

function tipEl(host) {
  if (!tip) { tip = document.createElement('div'); tip.className = 'ctip'; tip.setAttribute('aria-hidden', 'true'); }
  if (tip.parentNode !== host) host.append(tip);
  return tip;
}
function clearChart() {
  if (cur) { const g = cur.svg.querySelector('.cur'); g && g.remove(); }
  if (tip) tip.classList.remove('on');
  cur = pinned = null;
}
const data = (svg) => (svg._pts ||= JSON.parse(svg.dataset.pts || '[]'));

/** Show point i of an svg chart: marker, guide line, tooltip. */
function showPoint(svg, i) {
  const P = data(svg); if (!P.length) return;
  i = Math.max(0, Math.min(P.length - 1, i));
  const [x, y, a, b] = P[i], vb = svg.viewBox.baseVal, host = svg.closest('.chw'), kind = svg.dataset.ch;
  let g = svg.querySelector('.cur');
  if (!g) { g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'cur'); g.setAttribute('pointer-events', 'none'); svg.append(g); }
  const c = (svg.dataset.c || '').split(',').map(Number);
  g.innerHTML = kind == 'radar'
    ? `<line x1="${c[0]}" y1="${c[1]}" x2="${x}" y2="${y}" class="cl"/><circle cx="${x}" cy="${y}" r="5.5" class="cd"/>`
    : kind == 'tap' ? ''
    : `<line x1="${x}" x2="${x}" y1="${vb.y + 2}" y2="${vb.y + vb.height - 2}" class="cl"/><circle cx="${x}" cy="${y}" r="5" class="cd"/>`;
  cur = { svg, i };
  const t = tipEl(host); t.innerHTML = `<b>${esc(a)}</b><span>${esc(b)}</span>`; t.classList.add('on');
  const r = svg.getBoundingClientRect(), hr = host.getBoundingClientRect(), k = r.width / vb.width;
  const px = r.left - hr.left + (x - vb.x) * k, py = r.top - hr.top + (y - vb.y) * k, tw = t.offsetWidth, th = t.offsetHeight;
  const lim = Math.max(hr.width, r.width);
  t.style.left = Math.max(0, Math.min(lim - tw, px - tw / 2)) + 'px';
  t.style.top = (py - th - 12 < -34 ? py + 14 : py - th - 12) + 'px';
  svg.setAttribute('data-i', i);
}

function nearest(svg, e) {
  const P = data(svg), vb = svg.viewBox.baseVal, r = svg.getBoundingClientRect();
  const X = vb.x + ((e.clientX - r.left) / r.width) * vb.width, Y = vb.y + ((e.clientY - r.top) / r.height) * vb.height;
  let best = 0, bd = Infinity;
  if (svg.dataset.ch == 'radar') {
    const [cx, cy] = svg.dataset.c.split(',').map(Number), ang = Math.atan2(Y - cy, X - cx);
    P.forEach((p, i) => { let d = Math.abs(Math.atan2(p[1] - cy, p[0] - cx) - ang); d = Math.min(d, 2 * Math.PI - d); if (d < bd) { bd = d; best = i; } });
  } else P.forEach((p, i) => { const d = Math.abs(p[0] - X); if (d < bd) { bd = d; best = i; } });
  return best;
}

/* heatmap: same idea on a grid of cells */
let hmSel = null;
function showCell(b) {
  if (!b || !b.dataset.d) return;
  hmSel && hmSel.classList.remove('sel'); hmSel = b; b.classList.add('sel');
  const host = b.closest('.chw'), hr = host.getBoundingClientRect(), r = b.getBoundingClientRect(), n = +b.dataset.n;
  const t = tipEl(host), dt = new Date(b.dataset.d + 'T12:00:00');
  t.innerHTML = `<b>${esc(dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }))}</b><span>${n ? n + (n == 1 ? ' answer' : ' answers') : 'no practice'}</span>`; t.classList.add('on');
  const tw = t.offsetWidth, th = t.offsetHeight;
  t.style.left = Math.max(0, Math.min(hr.width - tw, r.left - hr.left + r.width / 2 - tw / 2)) + 'px';
  t.style.top = (r.top - hr.top - th - 8 < -th ? r.bottom - hr.top + 8 : r.top - hr.top - th - 8) + 'px';
  pinned = null;
}
function clearCell() { hmSel && hmSel.classList.remove('sel'); hmSel = null; if (tip) tip.classList.remove('on'); }
const hmCells = (hm) => [...hm.querySelectorAll('b[data-d]')];

let dragging = null;
const svgAt = (e) => e.target.closest && e.target.closest('svg.ix');

document.addEventListener('pointerdown', (e) => {
  delete document.documentElement.dataset.kb;            // mouse or touch: no focus ring on charts
  const svg = svgAt(e), cell = e.target.closest && e.target.closest('.ixh b[data-d]');
  if (!svg && !cell) { clearChart(); clearCell(); return; }
  if (cell) { clearChart(); showCell(cell); return; }
  clearCell();
  if (cur && cur.svg !== svg) clearChart();
  dragging = svg; pinned = svg;
  try { svg.setPointerCapture(e.pointerId); } catch { /* not all targets can capture */ }
  showPoint(svg, svg.dataset.ch == 'tap' ? 0 : nearest(svg, e));
});
document.addEventListener('pointermove', (e) => {
  if (dragging) { showPoint(dragging, nearest(dragging, e)); return; }
  if (e.pointerType != 'mouse') return;
  const svg = svgAt(e), cell = e.target.closest && e.target.closest('.ixh b[data-d]');
  if (cell) showCell(cell);
  else if (svg && svg.dataset.ch != 'tap') { if (!pinned || pinned === svg) showPoint(svg, nearest(svg, e)); }
});
const up = () => { dragging = null; };
document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
document.addEventListener('pointerout', (e) => {          // a mouse leaving just hides the hover; a click keeps it pinned
  if (e.pointerType != 'mouse' || dragging) return;
  const from = svgAt(e), to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('svg.ix');
  if (from && from !== to && pinned !== from) clearChart();
  if (e.target.closest && e.target.closest('.ixh') && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.ixh'))) clearCell();
});
document.addEventListener('keydown', (e) => {
  const t = e.target; if (!t || !t.matches) return;
  if (e.key == 'Tab' || e.key.startsWith('Arrow')) document.documentElement.dataset.kb = '1';   // keyboard user: show the focus ring
  if (t.matches('svg.ix')) {
    const n = data(t).length, i = cur && cur.svg === t ? cur.i : -1;
    const ix = e.key == 'ArrowRight' || e.key == 'ArrowDown' ? (i < 0 ? 0 : i + 1) : e.key == 'ArrowLeft' || e.key == 'ArrowUp' ? (i < 0 ? n - 1 : i - 1) : e.key == 'Home' ? 0 : e.key == 'End' ? n - 1 : e.key == 'Enter' || e.key == ' ' ? (i < 0 ? n - 1 : i) : null;
    if (e.key == 'Escape') { clearChart(); return; }
    if (ix == null) return;
    e.preventDefault(); e.stopPropagation(); pinned = t; showPoint(t, Math.max(0, Math.min(n - 1, ix)));
  } else if (t.matches('.ixh')) {
    const C = hmCells(t).filter((b) => b.dataset.d), i = hmSel ? C.indexOf(hmSel) : C.length - 1;
    const d = { ArrowRight: 7, ArrowLeft: -7, ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (e.key == 'Escape') { clearCell(); return; }
    if (d == null) return;
    e.preventDefault(); e.stopPropagation();
    const j = Math.max(0, Math.min(C.length - 1, i + d)); showCell(C[j]); C[j].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}, true);
addEventListener('hashchange', () => { clearChart(); clearCell(); });
