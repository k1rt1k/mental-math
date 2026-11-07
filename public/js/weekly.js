// Weekly summary card (Progress). The numbers come from weekdata.js.
import { esc } from './util.js';
import { A } from './nav.js';
import { copy, toast } from './ui.js';
import { shareCard } from './share.js';
import { weekData, weekLines, weekText } from './weekdata.js';

export function weekCard() {
  const w = weekData();
  if (w.empty) return `<h2>Your week<span class="sub">last 7 days</span></h2><div class="card wk7"><p class="mu" style="margin:0">No sessions in the last seven days. Play one and your week shows up here.</p></div>`;
  const stat = (l, v, d) => `<div><span>${esc(l)}</span><b>${esc(v)}</b>${d ? `<small class="${d.startsWith('+') ? 'ok' : d.startsWith('−') ? 'bad' : ''}">${esc(d)} vs last</small>` : ''}</div>`;
  const hasP = w.prev.sessions > 0;
  return `<h2>Your week<span class="sub">last 7 days</span></h2><div class="card wk7"><div class="wvl">
    ${stat('Days practised', w.days + ' / 7')}${stat('Answers', w.n, hasP ? sgn(w.n - w.prev.n) : '')}${stat('Accuracy', w.acc + '%', hasP ? sgn(w.acc - w.prev.acc) + '%' : '')}${stat('Minutes', w.min, hasP ? sgn(w.min - w.prev.min) : '')}</div>
    <ul class="wk7l">${weekLines(w).slice(3).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    <div class="btns" style="margin-top:12px"><button class="btn sm" data-act="weekCopy">Copy text</button><button class="btn sm" data-act="weekImg">Share image</button></div></div>`;
}

A.weekCopy = async () => { const t = weekText(weekData()); if (!t) return; if (navigator.share && matchMedia('(pointer:coarse)').matches) { try { await navigator.share({ text: t }); return; } catch (e) { if (e && e.name == 'AbortError') return; } } copy(t); };
A.weekImg = async () => {
  const w = weekData(); if (w.empty) return;
  const r = await shareCard({ tag: 'My week', big: w.days, bigLabel: 'of 7 days practised', rows: [['Answers', w.n], ['Accuracy', w.acc + '%'], ['Minutes', w.min], w.gain ? ['Top gain', '+' + w.gain.by] : ['Sessions', w.sessions]], streak: w.streak });
  if (r == 'saved') toast('Image saved');
};
