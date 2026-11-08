import { S, save } from '../state.js';
import { IDS, SK, COL } from '../engine.js';
import { TRICKS } from '../tricks.js';
import { esc } from '../util.js';
import { weakestSkills } from '../stats.js';
import { PATHS, dueChecks } from '../paths.js';
import { pathsGrid } from './paths.js';
import { register, A } from '../nav.js';
import { drill } from './home.js';
import { icon, mk } from '../ui.js';
import { ib } from '../info.js';
import { showAiSheet } from '../ai.js';

let filter = 'all', tab = 'paths';
/** Opening Learn on one skill's shortcuts (from a skill sheet, say) lands on the library, filtered. */
export const setLearnFilter = (k) => { filter = k; tab = 'lib'; };

function learn(swap = false) {
  document.title = 'Learn · Mental Math';
  // "Suggested" only means something if it is rare: the three best next steps, from the weakest skills first, least practised first.
  const wkOrder = weakestSkills(3), tries = (t) => { const o = t.pt && S.pat[SK[t.sk].n + ' · ' + t.pt]; return o ? o.n : 0; };
  const sugg = new Set(TRICKS.filter((t) => wkOrder.includes(t.sk) && t.pt && (() => { const o = S.pat[SK[t.sk].n + ' · ' + t.pt]; return !o || o.n < 8 || o.ok / o.n < 0.85; })()).sort((a, b) => wkOrder.indexOf(a.sk) - wkOrder.indexOf(b.sk) || tries(a) - tries(b)).slice(0, 3).map((t) => t.id));
  const list = TRICKS.filter((t) => filter == 'all' || t.sk == filter).sort((a, b) => (sugg.has(b.id) ? 1 : 0) - (sugg.has(a.id) ? 1 : 0));   // stable: suggested first, library order otherwise
  const stat = (t) => {
    const o = t.pt && S.pat[SK[t.sk].n + ' · ' + t.pt];
    if (!o || !o.n) return t.pt ? '<span class="mu">Not practised yet</span>' : '';
    const acc = Math.round((100 * o.ok) / o.n), sp = o.ok ? o.r / o.ok : 0;
    const mastered = o.n >= 15 && acc >= 90 && sp && sp <= 1;
    return `${mastered ? `<span class="pill ok2">${icon('check')}Mastered</span> ` : ''}<span class="mu">You: ${o.n} tries · <span class="${acc >= 90 ? 'ok' : acc < 75 ? 'bad' : ''}">${acc}%</span> accurate${sp ? ' · ' + sp.toFixed(2) + '× par time' : ''}${sp ? ib('l.par') : ''}</span>`;
  };
  const nChk = dueChecks().length;
  const segHtml = () => `<div class="seg learnseg" role="group" aria-label="Learn"><button aria-pressed="${tab == 'paths'}" data-act="learnTab" data-v="paths">Guided paths${nChk ? ` <span class="badge-inline" aria-label="${esc(nChk + (nChk == 1 ? ' retention check ready' : ' retention checks ready'))}">${nChk}</span>` : ''}</button><button aria-pressed="${tab == 'lib'}" data-act="learnTab" data-v="lib">Shortcut library</button></div>`;
  const aiBtn = () => (S.sessions.length ? (tab == 'paths' ? `<button class="btn sm learnai" data-act="aiNextPath">${icon('sparkle')} Which path next?</button>` : `<button class="btn sm learnai" data-act="aiNextTrick">${icon('sparkle')} Which trick next?</button>`) : '');
  const lede = () => (tab == 'paths' ? 'Take one skill from the basics to a timed mastery test. Each stage teaches, shows an example, lets you practise, then checks you on your own.' : 'Stand-alone shortcuts. Try one on a sample question, or practise it with real ones.') + (tab == 'paths' ? ib('l.path') : ib('l.intro'));
  const body = () => tab == 'paths' ? pathsGrid() : `<div class="chips fscroll" style="margin-bottom:16px" role="group" aria-label="Filter by skill"><button class="chip" aria-pressed="${filter == 'all'}" data-act="learnFilter" data-v="all">All</button>${IDS.filter((k) => TRICKS.some((t) => t.sk == k)).map((k) => `<button class="chip" aria-pressed="${filter == k}" data-act="learnFilter" data-v="${esc(k)}"><span class="dot" style="--sc:${COL[k]}"></span>${esc(SK[k].n)}</button>`).join('')}</div>
  <div class="tricks">${list.map((t) => `<article class="card trick" style="--sc:${COL[t.sk]}">
    <div class="kc">${esc(SK[t.sk].n)}${S.sessions.length && sugg.has(t.id) ? ' <span class="pill sg2">Suggested for you</span>' : ''}</div><h3>${esc(t.title)}</h3>
    <p>${esc(t.rule)}</p>
    <div class="ex">${t.ex.map((x) => `<div>${esc(x)}</div>`).join('')}</div>
    <div class="trick-foot">${stat(t)}<span class="btns"><button class="btn sm ghost iconly" data-act="aiTrick" data-v="${esc(t.id)}" aria-label="Ask AI about ${esc(t.title)}" title="Ask AI about this trick">${icon('sparkle')}</button><button class="btn sm" data-act="tryTrick" data-v="${esc(t.id)}">Try one</button><button class="btn sm primary" data-act="practiceTrick" data-v="${esc(t.id)}">Practise this</button></span></div></article>`).join('')}</div>`;
  const paint = () => {
    const m = document.querySelector('#main'), bodyEl = m.querySelector('#learnbody');
    if (!bodyEl) {   // first paint, or coming back from another screen: build the whole page once
      m.innerHTML = `<div class="learnhd"><h1>Learn</h1><span id="learnai">${aiBtn()}</span></div>${segHtml()}<p class="learnlede" id="learnlede">${lede()}</p><div class="learnbody" id="learnbody">${body()}</div>`;
      return;
    }
    // Switching tabs or filters: keep the header, the control and the scroll position, and only swap what is underneath.
    m.querySelectorAll('.learnseg [data-act=learnTab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v == (tab == 'lib' ? 'lib' : 'paths'))));
    m.querySelector('#learnai').innerHTML = aiBtn();
    m.querySelector('#learnlede').innerHTML = lede();
    bodyEl.innerHTML = body();
    if (swap) { bodyEl.classList.remove('swap'); void bodyEl.offsetWidth; bodyEl.classList.add('swap'); }
    m.dispatchEvent(new Event('mm:paint'));   // lets the highlight glide to the new choice
  };
  paint();
}
A.aiNextTrick = () => {
  const tricks = TRICKS.slice(0, 30).map((t) => { const o = t.pt && S.pat[SK[t.sk].n + ' · ' + t.pt]; return { id: t.id, title: t.title, skill: SK[t.sk].n, tries: o ? o.n : 0, accuracyPct: o && o.n ? Math.round((100 * o.ok) / o.n) : null }; });
  const skillRatings = Object.fromEntries(IDS.map((k) => [SK[k].n, Math.round(S.sk[k].lv * 100)]));
  showAiSheet({ title: 'Which trick should you learn next?', action: 'nexttrick', context: { tricks, skillRatings }, extra: (res) => TRICKS.filter((t) => String(res.text || '').includes(t.title)).slice(0, 2).map((t) => ({ label: `Practise: ${t.title}`, run: () => drill(t.sk, t.pt) })) });
};
A.learnFilter = (d) => { filter = d.v; learn(false); };
A.learnTab = (d) => { const next = d.v == 'lib' ? 'lib' : 'paths'; if (next == tab) return; tab = next; learn(true); };
A.aiTrick = (d) => {
  const t = TRICKS.find((x) => x.id == d.v); if (!t) return;
  const o = t.pt && S.pat[SK[t.sk].n + ' · ' + t.pt];
  showAiSheet({ title: t.title, action: 'trick', context: { trick: t.title, skill: SK[t.sk].n, rule: t.rule, cardExamples: t.ex, yourTries: o ? o.n : 0, yourAccuracyPct: o && o.n ? Math.round((100 * o.ok) / o.n) : null }, extra: () => [{ label: 'Practise this trick', run: () => drill(t.sk, t.pt) }] });
};
A.practiceTrick = (d) => { const t = TRICKS.find((x) => x.id == d.v); if (t) drill(t.sk, t.pt); };

/** One question where the trick applies. Hard patterns only exist at higher difficulty, so the search widens as it goes. */
function sample(t) {
  const base = Math.max(5, Math.round(S.sk[t.sk].lv));
  let p;
  for (let i = 0; i < 90; i++) { p = gen(t.sk, i < 30 ? base : i < 60 ? 8 : 11); if (!t.pt || p.pt == t.pt) break; }
  return p;
}
/** A throw-away try-out: nothing is recorded, so it is safe to experiment and look at the method. */
A.tryTrick = async (d) => {
  const t = TRICKS.find((x) => x.id == d.v);
  if (!t) return;
  let p = sample(t), solved = false;
  await dialog({
    title: t.title,
    body: `<p class="mu">${esc(t.rule)}</p><div class="tryq" id="tq" aria-live="polite"></div>
      <input class="inp tryin" id="ti" inputmode="numeric" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Your answer">
      <div class="tryres" id="tr" role="status" aria-live="polite"></div>
      <div class="btns" style="margin-top:10px"><button type="button" class="btn sm" id="tc">Check<kbd>Enter</kbd></button><button type="button" class="btn sm" id="ts">Show method</button><button type="button" class="btn sm ghost" id="tn">Another</button></div>`,
    actions: [{ label: 'Done', value: true, primary: true }],
    onOpen: (dlg) => {
      const q = dlg.querySelector('#tq'), inp = dlg.querySelector('#ti'), res = dlg.querySelector('#tr');
      const show = () => { q.textContent = p.q; inp.inputMode = symFor(p.sk) ? 'text' : 'numeric'; inp.value = ''; res.innerHTML = ''; solved = false; inp.focus(); };
      const reveal = () => { res.innerHTML = `<span class="ok">${esc(p.q)} = ${esc(p.a)}</span>${p.tip ? `<div class="tip">${esc(p.tip)}</div>` : ''}<div class="tip">${esc(how(p))}</div>`; };
      const check = () => {
        if (solved) { p = sample(t); return show(); }
        if (!inp.value.trim()) return;
        if (ansMatch(inp.value.trim().replace(/−/g, '-'), p.a)) { solved = true; res.innerHTML = '<span class="ok">' + mk(true) + 'Correct.</span> <span class="mu">Press Enter for another.</span>'; }
        else { res.innerHTML = '<span class="bad">Not quite.</span> <span class="mu">Try again, or show the method.</span>'; inp.select(); }
      };
      dlg.querySelector('#tc').onclick = check;
      dlg.querySelector('#ts').onclick = () => { reveal(); solved = true; inp.focus(); };
      dlg.querySelector('#tn').onclick = () => { p = sample(t); show(); };
      inp.addEventListener('keydown', (e) => { if (e.key == 'Enter') { e.preventDefault(); check(); } });
      show();
    },
  });
};
register('learn', learn);
export { learn };
