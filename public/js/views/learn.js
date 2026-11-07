import { S, save } from '../state.js';
import { IDS, SK, COL, gen, how, symFor, ansMatch } from '../engine.js';
import { TRICKS } from '../tricks.js';
import { esc } from '../util.js';
import { weakestSkills } from '../stats.js';
import { PATHS, pathProgress, stageCfg, demoQuestion, recordPathDemo, goalText } from '../paths.js';
import { register, A, go } from '../nav.js';
import { drill } from './home.js';
import { start } from './play.js';
import { dialog, icon } from '../ui.js';
import { ib } from '../info.js';
import { showAiSheet } from '../ai.js';

let filter = 'all', pathSk = null;
export const setLearnFilter = (k) => { filter = k; if (k != 'all' && PATHS[k]) pathSk = k; };

/** The five-stage journey for one skill. Every stage carries a teach panel, a worked example, a practice run and an assessment goal. */
function guide() {
  const sk = pathSk && PATHS[pathSk] ? pathSk : (pathSk = weakestSkills(1)[0] || 'mul');
  const p = PATHS[sk], prog = pathProgress(sk), next = prog.next && prog.next.id;
  const chips = IDS.map((k) => {
    const q = pathProgress(k);
    return `<button class="chip" aria-pressed="${k == sk}" data-act="pathPick" data-v="${esc(k)}"><span class="dot" style="--sc:${COL[k]}"></span>${esc(SK[k].n)} <span class="mu">${q.done}/5</span></button>`;
  }).join('');
  const stage = (st, i) => {
    const n = i + 1, done = st.complete, passed = st.passed, isNext = st.id == next;
    const pill = done ? '<span class="pill ok2">Complete ✓</span>' : passed ? '<span class="pill">Assessment passed</span>' : isNext ? '<span class="pill sg2">Next</span>' : '<span class="pill">Not started</span>';
    const ret = st.retention;
    const retLine = ret
      ? `<span class="${ret.met ? 'ok' : 'mu'}">${ret.met ? '✓' : '○'} Delayed retention${ret.cohort ? ` · ${ret.cohort} pair${ret.cohort == 1 ? '' : 's'}${ret.met ? ` · ${Math.round(ret.retentionRate * 100)}% kept` : ''}` : ` · 0 of ${ret.min} pairs`}${ret.pending && !ret.met ? ` · ${ret.pending} waiting` : ''}</span>`
      : '';
    const tricks = st.id == 'shortcuts' && st.tricks.length
      ? `<div class="stage-tricks"><span class="mu">Shortcuts in this stage:</span> ${st.tricks.map((t) => `<button class="lnk2" data-act="tryTrick" data-v="${esc(t.id)}">${esc(t.title)}</button>`).join('')}</div>`
      : '';
    const last = st.row && st.row.n
      ? `Last run: ${st.row.ft}/${st.row.n} first try · ${st.row.spd.toFixed(2)}× par`
      : 'No saved run for this stage yet';
    return `<li class="stage ${done ? 'done' : passed ? 'passed' : isNext ? 'next' : ''}" ${done ? 'data-done="1"' : ''}>
      <div class="stage-h"><span class="stage-n" aria-hidden="true">${n}</span><div class="stage-title"><b>${esc(st.name)}</b><span class="mu">${esc(st.blurb)}</span></div>${pill}</div>
      <p class="stage-teach">${esc(st.teach)}</p>
      ${tricks}
      <div class="stage-checks"><span class="${st.demo ? 'ok' : 'mu'}">${st.demo ? '✓' : '○'} Worked example seen</span><span class="${passed ? 'ok' : 'mu'}">${passed ? '✓' : '○'} Assessment passed</span>${retLine}</div>
      <div class="stage-goal mu">Goal: ${esc(goalText(st.goal))}${ret ? ` · retention: ${ret.min} pairs at ${Math.round(ret.rate * 100)}%+ after 7 days` : ''}</div>
      <div class="stage-foot"><span class="mu">${esc(last)}</span><span class="btns"><button class="btn sm" data-act="pathDemo" data-sk="${esc(sk)}" data-v="${n}">See it worked</button><button class="btn sm primary" data-act="pathPractise" data-sk="${esc(sk)}" data-v="${n}">${st.id == 'mastery' ? 'Start timed test' : `Practise ${st.dur}s`}</button></span></div>
    </li>`;
  };
  return `<section class="card guide" aria-label="Guided learning path">
    <div class="guide-hd"><div><div class="eyebrow">Guided path${ib('l.path')}</div><h2>${esc(p.title)}</h2><p class="mu">${esc(p.blurb)}</p></div><div class="guide-num"><b class="num">${prog.done}<small>/5</small></b><span>${prog.complete ? 'Path complete' : next ? 'Next: ' + esc(prog.next.name) : ''}</span></div></div>
    <div class="bar pathbar" style="--sc:${COL[sk]}" role="progressbar" aria-label="Guided path progress" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${prog.done}"><i style="width:${Math.round(prog.pct * 100)}%"></i></div>
    <div class="chips fscroll" role="group" aria-label="Choose a guided path">${chips}</div>
    <ol class="stages">${prog.stages.map(stage).join('')}</ol>
  </section>`;
}

function learn() {
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
    return `${mastered ? '<span class="pill ok2">Mastered ✓</span> ' : ''}<span class="mu">You: ${o.n} tries · <span class="${acc >= 90 ? 'ok' : acc < 75 ? 'bad' : ''}">${acc}%</span> accurate${sp ? ' · ' + sp.toFixed(2) + '× par time' : ''}${sp ? ib('l.par') : ''}</span>`;
  };
  document.querySelector('#main').innerHTML = `
  <div class="hd"><h1>Learn</h1>${S.sessions.length ? `<div class="btns"><button class="btn" data-act="aiNextTrick">${icon('sparkle')} AI: which trick next?</button></div>` : ''}</div>
  <p class="mu" style="margin:-8px 0 16px;max-width:62ch">Follow a guided path from the basics to a timed mastery check, or read a short method and practise it. The drill serves only questions where that trick <span style="white-space:nowrap">applies.${ib('l.intro')}</span></p>
  ${guide()}
  <h2>Shortcut library<span class="sub">every trick, one card each</span></h2>
  <div class="chips fscroll" style="margin-bottom:16px" role="group" aria-label="Filter by skill"><button class="chip" aria-pressed="${filter == 'all'}" data-act="learnFilter" data-v="all">All</button>${IDS.filter((k) => TRICKS.some((t) => t.sk == k)).map((k) => `<button class="chip" aria-pressed="${filter == k}" data-act="learnFilter" data-v="${esc(k)}"><span class="dot" style="--sc:${COL[k]}"></span>${esc(SK[k].n)}</button>`).join('')}</div>
  <div class="tricks">${list.map((t) => `<article class="card trick" style="--sc:${COL[t.sk]}">
    <div class="kc">${esc(SK[t.sk].n)}${S.sessions.length && sugg.has(t.id) ? ' <span class="pill sg2">Suggested for you</span>' : ''}</div><h3>${esc(t.title)}</h3>
    <p>${esc(t.rule)}</p>
    <div class="ex">${t.ex.map((x) => `<div>${esc(x)}</div>`).join('')}</div>
    <div class="trick-foot">${stat(t)}<span class="btns"><button class="btn sm ghost iconly" data-act="aiTrick" data-v="${esc(t.id)}" aria-label="Ask AI about ${esc(t.title)}" title="Ask AI about this trick">${icon('sparkle')}</button><button class="btn sm" data-act="tryTrick" data-v="${esc(t.id)}">Try one</button><button class="btn sm primary" data-act="practiceTrick" data-v="${esc(t.id)}">Practise this</button></span></div></article>`).join('')}</div>`;
}
A.aiNextTrick = () => {
  const tricks = TRICKS.slice(0, 30).map((t) => { const o = t.pt && S.pat[SK[t.sk].n + ' · ' + t.pt]; return { id: t.id, title: t.title, skill: SK[t.sk].n, tries: o ? o.n : 0, accuracyPct: o && o.n ? Math.round((100 * o.ok) / o.n) : null }; });
  const skillRatings = Object.fromEntries(IDS.map((k) => [SK[k].n, Math.round(S.sk[k].lv * 100)]));
  showAiSheet({ title: 'Which trick should you learn next?', action: 'nexttrick', context: { tricks, skillRatings }, extra: (res) => TRICKS.filter((t) => String(res.text || '').includes(t.title)).slice(0, 2).map((t) => ({ label: `Practise: ${t.title}`, run: () => drill(t.sk, t.pt) })) });
};
A.learnFilter = (d) => { filter = d.v; learn(); };
A.pathPick = (d) => { if (PATHS[d.v]) { pathSk = d.v; learn(); } };
A.openPath = (d) => { if (PATHS[d.v]) { pathSk = d.v; go('learn'); } };
A.pathPractise = (d) => {
  const sk = d.sk, id = +d.v, cfg = stageCfg(sk, id);
  if (cfg && PATHS[sk]) start(undefined, cfg, { sk, stage: id });
};
/** Show, don't tell: a worked example for this stage. Seeing the method (or solving it) ticks the demo step. */
A.pathDemo = async (d) => {
  const sk = d.sk, id = +d.v, st = PATHS[sk] && PATHS[sk].stages[id - 1];
  if (!st) return;
  let p = demoQuestion(sk, id), shown = false;
  const mark = () => { if (!shown) { shown = true; recordPathDemo(sk, id); save(); } };
  const examples = st.tricks.length
    ? `<div class="ex">${st.tricks.slice(0, 3).map((t) => `<div><b>${esc(t.title)}</b> · ${esc(t.rule)}</div>`).join('')}</div>`
    : '';
  const out = await dialog({
    title: `${SK[sk].n} · ${st.name}`,
    body: `<p>${esc(st.teach)}</p>${examples}<div class="tryq" id="pq" aria-live="polite">${esc(p.q)}</div>
      <input class="inp tryin" id="pi" inputmode="numeric" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Your answer">
      <div class="tryres" id="prr" role="status" aria-live="polite"></div>
      <div class="btns" style="margin-top:10px"><button type="button" class="btn sm" id="pc">Check<kbd>Enter</kbd></button><button type="button" class="btn sm" id="ps">Show method</button><button type="button" class="btn sm ghost" id="pn">Another</button></div>`,
    actions: [{ label: 'Done', value: false }, { label: 'Practise this stage', value: 'practise', primary: true }],
    onOpen: (dlg) => {
      const q = dlg.querySelector('#pq'), inp = dlg.querySelector('#pi'), res = dlg.querySelector('#prr');
      const show = () => { q.textContent = p.q; inp.inputMode = symFor(p.sk) ? 'text' : 'numeric'; inp.value = ''; res.innerHTML = ''; inp.focus(); };
      const reveal = () => {
        mark();
        res.innerHTML = `<span class="ok">${esc(p.q)} = ${esc(p.a)}</span>${p.tip ? `<div class="tip">${esc(p.tip)}</div>` : ''}<div class="tip">${esc(how(p))}</div>`;
      };
      const check = () => {
        if (!inp.value.trim()) return;
        if (ansMatch(inp.value.trim().replace(/−/g, '-'), p.a)) { mark(); res.innerHTML = '<span class="ok">✓ Correct. The method is below.</span>'; }
        else { res.innerHTML = '<span class="bad">Not quite.</span> <span class="mu">Try again, or show the method.</span>'; inp.select(); return; }
        res.insertAdjacentHTML('beforeend', `<div class="tip">${esc(how(p))}</div>`);
      };
      dlg.querySelector('#pc').onclick = check;
      dlg.querySelector('#ps').onclick = reveal;
      dlg.querySelector('#pn').onclick = () => { p = demoQuestion(sk, id); show(); };
      inp.addEventListener('keydown', (e) => { if (e.key == 'Enter') { e.preventDefault(); check(); } });
      show();
    },
  });
  if (out == 'practise') A.pathPractise({ sk, v: String(id) });
  else if (shown) learn();
};
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
        if (ansMatch(inp.value.trim().replace(/−/g, '-'), p.a)) { solved = true; res.innerHTML = '<span class="ok">✓ Correct.</span> <span class="mu">Press Enter for another.</span>'; }
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
