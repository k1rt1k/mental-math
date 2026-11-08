import { S, save, forget, unforget, reviewPlan } from '../state.js';
import { IDS, SK, COL, how, MASTER_BOX } from '../engine.js';
import { masteryStats } from '../stats.js';
import { esc, ago, dueIn } from '../util.js';
import { register, A } from '../nav.js';
import { confirmDlg, icon, toast, hic, eic } from '../ui.js';
import { ib } from '../info.js';
import { start } from './play.js';
import { drill } from './home.js';
import { showAiSheet } from '../ai.js';

let filter = 'all', dueOnly = false, qtext = '';

function notebook() {
  document.title = 'Notebook · Mental Math';
  const now = Date.now();
  // due first, then least-mastered, then most recently missed
  const all = Object.values(S.weak).sort((a, b) => (a.due <= now ? 0 : 1) - (b.due <= now ? 0 : 1) || a.box - b.box || (b.at || 0) - (a.at || 0));
  if (filter != 'all' && !all.some((w) => w.sk == filter)) filter = 'all';
  const needle = qtext.trim().toLowerCase();
  const W = all.filter((w) => (filter == 'all' || w.sk == filter) && (!dueOnly || w.due <= now) && (!needle || String(w.q).toLowerCase().includes(needle) || String(w.a).includes(needle)));
  const counts = {}; all.forEach((w) => (counts[w.sk] = (counts[w.sk] || 0) + 1));
  const nDue = all.filter((w) => w.due <= now).length;
  const rp = reviewPlan(now);   // the same answer Review itself uses, so the button and the count agree
  const ms = masteryStats();
  const mastered = Object.entries(S.mastered || {}).sort((a, b) => ((b[1].lastLapse || b[1].masteredAt || 0) - (a[1].lastLapse || a[1].masteredAt || 0)));
  const card = (w) => { const m = how(w) || w.tip || '', isDue = w.due <= now; return `<article class="nbi" style="--sc:${COL[w.sk]}">
    <div class="nbq"><span class="q1">${esc(w.q)}</span><span class="eq">=</span><b class="a1">${esc(w.a)}</b>
      <span class="grow"></span><span class="dots" role="img" aria-label="Mastery ${w.box} of ${MASTER_BOX}: ${w.box} successful retrievals">${Array.from({ length: MASTER_BOX }, (_, i) => `<i class="${i < w.box ? 'on' : ''}"></i>`).join('')}</span>
      <button class="btn sm ghost" data-act="nbDrop" data-v="${esc(w.q)}" aria-label="Remove ${esc(w.q)}">${icon('x')}</button></div>
    <div class="mu nbm"><span class="kc">${esc(SK[w.sk].n)}</span> · missed ${ago(w.at || now)} · <span class="${isDue ? 'gd' : ''}">${esc(dueIn(w.due || 0, now))}</span></div>
    ${m ? `<div class="how">${esc(m)}</div>` : ''}
    <div class="nbact"><button class="btn sm tonal" data-act="nbDrill" data-sk="${esc(w.sk)}" data-pt="${esc(w.pt || '')}" aria-label="${esc('Drill ' + (w.pt || SK[w.sk].n))}">${icon('play')} <span>Drill ${esc(w.pt || SK[w.sk].n)}</span></button><button class="btn sm ghost" data-act="aiExplain" data-q="${esc(w.q)}" data-a="${esc(w.a)}" data-ty="${esc(w.ty || '')}" data-sk="${esc(w.sk)}" data-d="${esc(w.d ?? '')}" data-pt="${esc(w.pt || '')}">${icon('sparkle')} AI Method</button></div></article>`; };
  document.querySelector('#main').innerHTML = `
  <div class="hd"><h1>Notebook${ib('n.intro')}</h1>${all.length ? `<div class="btns">${all.length >= 3 ? `<button class="btn" data-act="aiPatterns">${icon('sparkle')} AI: find my patterns</button>` : ''}<button class="btn primary" data-act="review">${icon('redo')} Review ${rp.count}${rp.dueOnly ? ' due' : ''}<kbd>R</kbd></button></div>` : ''}</div>
  ${all.length ? `<p class="mu" style="margin:-8px 0 16px"><b style="color:var(--tx)">${nDue}</b> of ${all.length} due now</p>` : ''}
  ${all.length ? `<div class="chips fscroll" style="margin-bottom:14px" role="group" aria-label="Filter by skill"><button class="chip" aria-pressed="${filter == 'all'}" data-act="nbFilter" data-v="all">All ${all.length}</button>${IDS.filter((k) => counts[k]).map((k) => `<button class="chip" aria-pressed="${filter == k}" data-act="nbFilter" data-v="${esc(k)}"><span class="dot" style="--sc:${COL[k]}"></span>${esc(SK[k].n)} ${counts[k]}</button>`).join('')}</div>
  <div class="nbtools"><input class="inp" id="nbq" type="search" placeholder="Search" aria-label="Search the notebook" value="${esc(qtext)}"><button class="chip" aria-pressed="${dueOnly}" data-act="nbDue">Due now only</button></div>
  ${W.length ? `<div class="nbl">${W.map(card).join('')}</div>` : `<div class="card empty ei">${eic('search')}<b>No matches</b>Try another search or show everything.</div>`}
  <div class="nbfoot"><button class="btn sm ghost danger" data-act="clearAll">Clear all ${all.length} missed questions</button></div>`
  : `<div class="card empty ei">${eic(mastered.length ? 'tick' : 'book')}<b>${mastered.length ? 'Nothing to review' : 'Nothing missed yet'}</b>${mastered.length ? 'Every mastered question is holding. A question you miss will come back here.' : 'Questions you get wrong or skip land here, with the method to solve them.'}<div style="margin-top:14px"><button class="btn primary" data-go="home">Start practising</button></div></div>`}
  ${mastered.length ? `<details class="fold" style="margin-top:18px"><summary><h2>${hic('award','gd')}Mastered<span class="sub">${ms.retained} of ${ms.mastered} never slipped since</span></h2></summary>
    <div class="card tbl"><table><tr><th>Question<th class="hide-m">Skill<th class="r">Mastered<th class="r">Slipped<th></tr>
    ${mastered.map(([k, m]) => `<tr><td>${esc(m.q)} = <b>${esc(m.a)}</b><td class="hide-m">${esc(SK[m.sk].n)}<td class="r">${esc(ago(m.masteredAt || m.at || now))}<td class="r">${m.lapses ? `<span class="bad">${m.lapses}×</span>` : '<span class="ok">never</span>'}<td class="r"><button class="btn sm" data-act="nbRelearn" data-v="${esc(k)}" aria-label="Put ${esc(m.q)} back into review">Review again</button></tr>`).join('')}
    </table></div></details>` : ''}`;
}

A.aiPatterns = () => {
  const items = Object.values(S.weak).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 18).map((w, i) => ({ q: w.q, a: w.a, typed: w.ty || '', sk: SK[w.sk] ? SK[w.sk].n : w.sk, pt: w.pt || '', box: w.box, ...(i < 5 ? { method: (() => { try { return String(how(w) || '').slice(0, 170); } catch { return ''; } })() } : {}) }));
  showAiSheet({ title: 'Patterns in your mistakes', action: 'mistakes', context: { total: Object.keys(S.weak).length, items }, extra: () => [{ label: 'Review these now', run: () => start('review') }] });
};
A.nbDrill = (d) => { if (SK[d.sk]) drill(d.sk, d.pt || undefined); };
/** Bring a mastered question back into active review without erasing its retention history. */
A.nbRelearn = (d) => {
  const m = S.mastered[d.v]; if (!m) return;
  const now = Date.now(), key = m.q;
  S.weak[key] = { ...m, box: 0, due: now, seen: now, at: Math.max(now, (S.gone[key] || 0) + 1, (m.masteredAt || 0) + 1) };
  save(); notebook(); toast('Added back to the notebook');
};
A.nbFilter = (d) => { filter = d.v; notebook(); };
A.nbDue = () => { dueOnly = !dueOnly; notebook(); };
// live search: repaint, then put the caret back where it was
document.addEventListener('input', (e) => {
  if (!e.target || e.target.id != 'nbq') return;
  qtext = e.target.value; const at = e.target.selectionStart; notebook();
  const n = document.getElementById('nbq'); if (n) { n.focus(); n.setSelectionRange(at, at); }
});
A.nbDrop = (d) => { const w = S.weak[d.v]; if (!w) return; forget(d.v); save(); notebook(); toast('Removed from notebook', { label: 'Undo', onClick: () => { unforget(d.v, w); save(); notebook(); } }); };
A.clearAll = async () => { if (await confirmDlg('Clear the notebook?', `This removes all <b>${Object.keys(S.weak).length}</b> missed questions. Your sessions and ratings are not affected.`, { ok: 'Clear all', danger: true })) { const bak = { ...S.weak }; Object.keys(bak).forEach(forget); save(); filter = 'all'; notebook(); toast('Notebook cleared', { label: 'Undo', onClick: () => { Object.entries(bak).forEach(([k, w]) => unforget(k, w)); save(); notebook(); } }); } };
register('notebook', notebook);
export { notebook };
