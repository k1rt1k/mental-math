// The "This week" sheet: tap the week card on Home (the day strip, the numbers or the footer) to open it.
// Seven tappable days, the totals against last week, and what happened on whichever day you pick. A day on the Home strip opens the sheet on that day.
import { S } from '../state.js';
import { SK } from '../engine.js';
import { esc } from '../util.js';
import { MS, modeLabel, msProgress, ctx } from '../stats.js';
import { icon, dialog, toast } from '../ui.js';
import { A } from '../nav.js';
import { shareCard } from '../share.js';
import { weekData, weekDays, dayInfo, weekLines, sgn, weekAiContext } from '../weekdata.js';
import { showAiSheet } from '../ai.js';

const fmt = (t, o) => new Date(t).toLocaleDateString(undefined, o);
const clock = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const dur = (s) => (s < 60 ? Math.round(s) + ' s' : Math.round(s / 60) + ' min');

const dayName = (d) => (d.today ? 'Today' : d.i == 1 ? 'Yesterday' : fmt(d.t, { weekday: 'long' })) + ' · ' + fmt(d.t, { month: 'short', day: 'numeric' });

function detail(d) {
  if (!d.sessions.length) return `<div class="wsd-h"><b>${esc(dayName(d))}</b></div><p class="mu wsd-none">${d.today ? 'Nothing yet today. One short session counts.' : 'No practice this day.'}</p>`;
  const rows = d.sessions.map((s) => {
    const a = s.n ? Math.round((100 * s.ok) / s.n) : 0;
    return `<li><button type="button" class="wsrow" data-act="sessInfo" data-v="${esc(s.t)}" aria-label="${esc(modeLabel(s.m) + ' at ' + clock(s.t) + ', details')}"><span class="wst">${esc(clock(s.t))}</span><b>${esc(modeLabel(s.m))}</b><span class="mu">${s.n} ${s.n == 1 ? 'answer' : 'answers'} · ${a}%</span><span class="mu wsp">${esc(dur(s.dur))}${s.pts ? ' · ' + s.pts + ' pts' : ''}</span></button></li>`;
  }).join('');
  return `<div class="wsd-h"><b>${esc(dayName(d))}</b><span class="mu">${d.sessions.length} ${d.sessions.length == 1 ? 'session' : 'sessions'} · ${d.n} answers · ${d.acc}% · ${d.min} min</span></div><ul class="wsd-l">${rows}</ul>`;
}

const strip = (D, sel) => {
  const mx = Math.max(1, ...D.map((d) => d.n));
  return D.map((d, idx) => {
    const cls = ['wsday', d.on ? 'on' : '', d.today ? 'today' : '', idx == sel ? 'sel' : ''].filter(Boolean).join(' ');
    const lab = fmt(d.t, { weekday: 'long', month: 'short', day: 'numeric' }) + ', ' + (d.n ? d.n + ' answers' : 'no practice');
    return `<button type="button" class="${cls}" data-wd="${idx}" aria-pressed="${idx == sel}" aria-label="${esc(lab)}"><span class="wsl">${'SMTWTFS'[new Date(d.t).getDay()]}</span><span class="wsb"><i style="height:${d.n ? Math.max(8, Math.round((d.n / mx) * 100)) : 0}%"></i></span><span class="wsn">${new Date(d.t).getDate()}</span></button>`;
  }).join('');
};

A.weekSheet = async (d) => {
  const D = weekDays(), W = weekData();
  let sel = Math.max(0, Math.min(6, d && d.v != null && d.v !== '' ? +d.v : 6));
  const nextMs = MS.find((m) => !S.ms.includes(m[0])), hasP = W.prev.sessions > 0, nd = D.filter((x) => x.on).length;
  const stat = (l, v, dl) => `<div><span>${esc(l)}</span><b>${esc(v)}</b>${dl ? `<small class="${dl.startsWith('+') ? 'ok' : dl.startsWith('−') ? 'bad' : ''}">${esc(dl)} vs last</small>` : ''}</div>`;
  const hi = W.empty ? [] : weekLines(W).slice(3);
  const body = `<div class="ws">
    <div class="ws-hero"><b class="num">${nd}</b><div><span>of 7 days practised</span><p class="mu">${W.empty ? 'No sessions in the last seven days. Play one and it shows up here.' : esc(W.sessions + (W.sessions == 1 ? ' session' : ' sessions') + ' in the last 7 days')}</p></div></div>
    ${W.empty ? '' : `<div class="ws-stats">${stat('Answers', W.n, hasP ? sgn(W.n - W.prev.n) : '')}${stat('Accuracy', W.acc + '%', hasP ? sgn(W.acc - W.prev.acc) + '%' : '')}${stat('Minutes', W.min, hasP ? sgn(W.min - W.prev.min) : '')}</div>`}
    <div class="ws-days" role="group" aria-label="Pick a day">${strip(D, sel)}</div>
    <div class="ws-detail" aria-live="polite">${detail(D[sel])}</div>
    ${hi.length ? `<ul class="ws-hi">${hi.map((l) => `<li>${icon('star')}<span>${esc(l)}</span></li>`).join('')}</ul>` : ''}
    <div class="ws-next mu">${icon('target')}<span>${nextMs ? 'Next unlock: <b>' + esc(nextMs[1]) + '</b>' : 'Every milestone unlocked'}</span></div>
  </div>`;
  const go = await dialog({
    title: 'This week', body,
    actions: W.empty ? [{ label: 'Close', value: false, primary: true }] : [{ label: 'Close', value: false }, { label: 'AI read', value: 'ai', icon: 'sparkle' }, { label: 'Share image', value: true, primary: true }],
    onOpen: (dl) => {
      dl.classList.add('stksheet', 'wsheet');
      const row = dl.querySelector('.ws-days'), box = dl.querySelector('.ws-detail');
      const pick = (i) => {
        sel = i; row.innerHTML = strip(D, sel); box.innerHTML = detail(D[sel]);
        const b = row.querySelector('[data-wd="' + i + '"]'); b && b.focus({ preventScroll: true });
      };
      row.addEventListener('click', (e) => { const b = e.target.closest('[data-wd]'); if (b) pick(+b.dataset.wd); });
      row.addEventListener('keydown', (e) => {
        const step = e.key == 'ArrowLeft' ? -1 : e.key == 'ArrowRight' ? 1 : 0;
        if (step) { e.preventDefault(); pick(Math.max(0, Math.min(6, sel + step))); }
      });
    },
  });
  if (go === 'ai' && !W.empty) {
    return showAiSheet({ title: 'Your week, explained', action: 'week', context: weekAiContext(), extra: () => (S.sessions.length ? [{ label: 'Drill my weakest skill', run: () => A.weakest && A.weakest() }] : []) });
  }
  if (go === true && !W.empty) {
    const r = await shareCard({ tag: 'My week', big: nd, bigLabel: 'of 7 days practised', rows: [['Answers', W.n], ['Accuracy', W.acc + '%'], ['Minutes', W.min], W.gain ? ['Top gain', '+' + W.gain.by] : ['Sessions', W.sessions]], streak: W.streak });
    if (r == 'saved') toast('Image saved');
  }
};

/** Any single day: the Progress heatmap and the Personal bests open it. */
A.daySheet = async (d) => {
  const k = d && d.v; if (!/^\d{4}-\d{2}-\d{2}$/.test(k || '')) return;
  const x = dayInfo(k);
  await dialog({ title: fmt(x.t, { weekday: 'long', month: 'long', day: 'numeric' }), body: `<div class="ws"><div class="ws-detail">${detail(x)}</div></div>`, actions: [{ label: 'Close', value: false, primary: true }], onOpen: (dl) => dl.classList.add('stksheet', 'wsheet') });
};

/** A milestone chip says how far off it is (Progress). */
A.msTip = (d) => {
  const m = MS.find((x) => x[0] == d.v); if (!m) return;
  if (S.ms.includes(m[0])) return toast(m[1] + ': unlocked');
  const pr = msProgress(m[0], ctx());
  toast(m[1] + (pr ? ': ' + pr.cur.toLocaleString() + ' of ' + pr.goal.toLocaleString() : ': not yet'));
};

/* Heatmap cells keep their hover and tap tooltip; a click on a practised day (or Enter on the focused map) also opens that day. */
document.addEventListener('click', (e) => {
  const c = e.target.closest && e.target.closest('.ixh b[data-d]');
  if (c && +c.dataset.n > 0) A.daySheet({ v: c.dataset.d });
});
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (e.key != 'Enter' || !t || !t.matches || !t.matches('.ixh')) return;
  const c = t.querySelector('b[data-d].sel');
  if (c && +c.dataset.n > 0) { e.preventDefault(); A.daySheet({ v: c.dataset.d }); }
});
