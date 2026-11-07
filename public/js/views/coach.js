// AI Math Coach view: Personal Coach, Smart Analysis, Recommendations, Training Plans, and Conversational Tutor.
// ABSOLUTE REQUIREMENT: EVERYTHING MUST REMAIN COMPLETELY FREE. ₹0 SPENDING.

import { S } from '../state.js';
import { SK, IDS, COL } from '../engine.js';
import { esc } from '../util.js';
import { renderRich } from '../richtext.js';
import { A, register, view, go } from '../nav.js';
import { icon, toast } from '../ui.js';
import { ib } from '../info.js';
import {
  callAi,
  getChatHistory,
  saveChatHistory,
  clearChatHistory,
  getSavedAnalysis,
  getSavedAnalysisSource,
  getSavedAnalysisMessage,
  getSavedAnalysisAt,
  setSavedAnalysis,
  getSavedPlan,
  getSavedPlanSource,
  getSavedPlanMessage,
  getSavedPlanAt,
  setSavedPlan,
  buildCompactSummary,
  refreshAiBudget,
  aiBudgetLeft,
  aiQuota,
  aiHooks,
} from '../ai.js';
import { start } from './play.js';
import { drill } from './home.js';
import { weakestSkills, ERRL } from '../stats.js';
import { syncKey } from '../sync.js';

/* ---------- small building blocks ---------- */
const ago = (t) => {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const SEND = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V6m0 0-5.5 5.5M12 6l5.5 5.5"/></svg>';

/** Skill ratings as bars, weakest first (the two the coach would drill are marked). Rating is level x 100 on a 12-level scale. */
const skillBars = () => {
  const weak = new Set(weakestSkills(2));
  return `<div class="cskills" role="list">${IDS.map((k) => ({ k, v: Math.round(S.sk[k].lv * 100) })).sort((a, b) => a.v - b.v).map(({ k, v }) =>
    `<div class="csk${weak.has(k) ? ' weak' : ''}" role="listitem" style="--sc:${COL[k]}"><span class="nm"><i class="dot"></i>${esc(SK[k].n)}${weak.has(k) ? '<em>focus</em>' : ''}</span><span class="trk" aria-hidden="true"><i style="width:${Math.max(3, Math.min(100, v / 12))}%"></i></span><b class="num">${v}</b></div>`).join('')}</div>`;
};
/** The most frequent kinds of slip, each with a bar scaled to the most common one. */
const slipList = () => {
  const top = Object.entries(S.errs || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!top.length) return '<div class="cempty"><b>No recurring slips yet</b><span>Keep practising. Patterns show up after a few sessions.</span></div>';
  const max = top[0][1];
  return `<div class="cslips" role="list">${top.map(([k, n]) => `<div class="cslip" role="listitem"><span class="nm">${esc(ERRL[k] ? ERRL[k][0] : k)}</span><span class="trk" aria-hidden="true"><i style="width:${Math.max(6, Math.round((n / max) * 100))}%"></i></span><b class="num">${n}</b></div>`).join('')}</div>`;
};

let activeTab = 'coach'; // 'coach' | 'recommend' | 'plan' | 'tutor'
let coachAnalysisText = '';
let trainingPlanText = '';
let tutorInputText = '';
let coachAnalysisSource = 'unknown', coachAnalysisMessage = '', coachAnalysisAt = 0;
let trainingPlanSource = 'unknown', trainingPlanMessage = '', trainingPlanAt = 0;
let recommendationText = '', recommendationSource = 'unknown', recommendationMessage = '', recommendationStructured = null, recommendationAt = 0;
let isLoading = false;
let loadingKind = ''; // which request is in flight: 'analysis' | 'recommend' | 'plan' | 'chat'
// A reply can arrive after the learner has left this screen (even started a session): never paint over whatever they are on now.
const repaint = () => { if (view.scr === 'coach') coachView(); };

/** Who wrote this, when, and any note from the service. One quiet line above the text. */
function sourceNotice(source, message = '', at = 0, cached = false) {
  const gem = source === 'gemini';
  const label = gem ? 'Gemini' : source === 'local' ? 'Local fallback · not Gemini' : 'Saved result · source unknown';
  const meta = [at ? ago(at) : '', cached ? 'exact-question cache' : ''].filter(Boolean).join(' · ');
  return `<div class="asrc"><span class="tag ${gem ? 'ok' : 'warn'}">${icon(gem ? 'sparkle' : 'bolt')}${esc(label)}</span>${meta ? `<span class="when">${esc(meta)}</span>` : ''}</div>${message ? `<div class="anote">${esc(message)}</div>` : ''}`;
}

/** Turn a rendered AI reply into a readable report: intro paragraph, then one numbered card per heading. */
function report(text, source, message, at) {
  const html = renderRich(text);
  const parts = html.split(/(?=<h3>)/);
  const lead = parts.length && !parts[0].startsWith('<h3>') ? parts.shift() : '';
  const secs = parts.map((p, i) => {
    const m = p.match(/^<h3>([\s\S]*?)<\/h3>([\s\S]*)$/);
    if (!m) return `<section class="ai-sec"><div class="ai-prose">${p}</div></section>`;
    const title = m[1].replace(/^\s*\d+[.)]\s+/, '');
    return `<section class="ai-sec"><h3><span class="ai-n" aria-hidden="true">${i + 1}</span><span>${title}</span></h3><div class="ai-prose">${m[2]}</div></section>`;
  }).join('');
  return `<div class="areport">${sourceNotice(source, message, at)}${lead ? `<div class="ai-prose ai-lead">${lead}</div>` : ''}${secs ? `<div class="ai-secs${parts.length > 3 ? ' wide' : ''}">${secs}</div>` : ''}</div>`;
}

/** Placeholder lines while a reply is on its way. */
const skeleton = (label) => `<div class="askel" role="status" aria-live="polite"><span class="sr">${esc(label)}</span><div class="ln w1"></div><div class="ln w2"></div><div class="ln w3"></div><div class="ln w2"></div><div class="ln w1"></div></div>`;

/** A card head: icon badge, title, short line, and the action on the right. */
const cardHead = ({ ic, title, info, sub, actions = '' }) => `
  <div class="chead">
    <span class="cbadge" aria-hidden="true">${icon(ic)}</span>
    <div class="ct"><h2>${title}${info ? ib(info) : ''}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
    ${actions ? `<div class="cact">${actions}</div>` : ''}
  </div>`;

function coachView() {
  document.title = 'AI Coach · Mental Math';
  const uName = 'you';
  const summary = buildCompactSummary(S);
  const chat = getChatHistory();

  // Restore this device's saved analysis and plan. Each person uses their own device.
  if (!coachAnalysisText) {
    coachAnalysisText = getSavedAnalysis();
    coachAnalysisSource = getSavedAnalysisSource();
    coachAnalysisMessage = getSavedAnalysisMessage();
    coachAnalysisAt = getSavedAnalysisAt();
  }
  if (!trainingPlanText) {
    trainingPlanText = getSavedPlan();
    trainingPlanSource = getSavedPlanSource();
    trainingPlanMessage = getSavedPlanMessage();
    trainingPlanAt = getSavedPlanAt();
  }

  const main = document.querySelector('#main');
  if (!main) return;

  if (aiQuota.isExhausted && aiQuota.resetAt && Date.now() >= aiQuota.resetAt) { aiQuota.isExhausted = false; aiQuota.resetAt = 0; }
  const quotaPill = aiQuota.isExhausted
    ? `<span class="pill bad" title="Resets at midnight Pacific time">${icon('lock')} AI paused · resets Pacific midnight</span>`
    : `<span class="pill ok" id="ai-pill" title="Google AI Studio free tier; this is the shared daily allowance for the app">${icon('sparkle')} Gemini · ${aiBudgetLeft() == null ? 'free tier' : aiBudgetLeft() + ' left today'}</span>`;

  const tabs = [['coach', 'chart', 'Analysis'], ['recommend', 'target', 'Recommend'], ['plan', 'cal', 'Plans'], ['tutor', 'bulb', 'Tutor']];

  main.innerHTML = `
  <div class="coach-page">
  <header class="ch">
    <span class="ch-av" aria-hidden="true">${icon('sparkle')}</span>
    <div class="ch-t">
      <div class="eyebrow">AI Mathematics Coach</div>
      <h1>Personal Coach</h1>
      <p>Built from your practice on this device.</p>
    </div>
    <div class="ch-q">${quotaPill}</div>
  </header>

  <div class="ctabs" role="tablist" aria-label="AI Coach sections">
    ${tabs.map(([v, ic, t]) => `<button class="ctab" role="tab" type="button" aria-selected="${activeTab === v}" data-act="coachTab" data-v="${esc(v)}">${icon(ic)}<span>${t}</span></button>`).join('')}
  </div>

  ${syncKey() ? '' : `<div class="notice" style="margin-bottom:14px"><span>AI is off until sync is set up. Local summaries for now.</span><span class="btns"><button class="btn sm" data-go="settings">Set up</button></span></div>`}
  <div id="coach-content" class="coach-content" role="tabpanel">
    ${renderTabContent(summary, chat, uName)}
  </div>
  </div>
  `;
  if (aiBudgetLeft() == null) refreshAiBudget().then(() => { const p = document.querySelector('#ai-pill'); if (p && aiBudgetLeft() != null) p.innerHTML = `${icon('sparkle')} Gemini · ${aiBudgetLeft()} left today`; });
}

function renderTabContent(summary, chat, uName) {
  if (activeTab === 'coach') return renderCoachTab(summary, uName);
  if (activeTab === 'recommend') return renderRecommendTab(summary);
  if (activeTab === 'plan') return renderPlanTab(summary);
  if (activeTab === 'tutor') return renderTutorTab(chat, uName);
  return '';
}

function renderCoachTab(summary, uName) {
  const weakKey = weakestSkills(1)[0] || '';
  const busy = isLoading && loadingKind === 'analysis';
  const stats = [
    ['target', summary.avgRating, 'avg rating'],
    ['check', `${summary.accuracy}%`, 'accuracy'],
    ['bolt', summary.avgSpeed ? `${summary.avgSpeed}s` : '–', 'avg speed'],
    ['flame', `${summary.streak}d`, 'streak'],
  ];
  return `
  ${summary.sessionsCount === 0 ? `
  <div class="cwelcome">
    <div><h2>Welcome, ${esc(uName)}. Let's find your baseline.</h2>
    <p>No sessions on this device yet. A 2-minute run calibrates your ratings and speed, and then the coach has something real to work with.</p></div>
    <button class="btn primary" data-act="startFirst">${icon('play', 'fill')} Start first 2-min session</button>
  </div>` : ''}

  <section class="cpanel">
    <div class="cpanel-h"><span class="eyebrow">Your performance${ib('c.perf')}</span><span class="mu">${summary.sessionsCount} sessions · ${summary.totalAnswers} answers</span></div>
    <div class="cstats">
      ${stats.map(([ic, v, l]) => `<div class="cstat">${icon(ic)}<b class="num">${v}</b><span>${l}</span></div>`).join('')}
    </div>
    ${summary.weaknesses ? `<div class="cfocus"><span class="cbadge" aria-hidden="true">${icon('target')}</span><div><span class="eyebrow">Key focus area</span><b>${esc(summary.weaknesses)}</b></div>${weakKey && SK[weakKey] ? `<button class="btn sm" data-act="startAiDrill" data-v="${esc(weakKey)}">${icon('play', 'fill')} Drill it</button>` : ''}</div>` : ''}
  </section>

  <div class="cgrid">
    <section class="cpanel">
      <div class="cpanel-h"><span class="eyebrow">Skill ratings${ib('c.slips')}</span></div>
      ${skillBars()}
    </section>
    <section class="cpanel">
      <div class="cpanel-h"><span class="eyebrow">Common slips</span><span class="mu">times seen</span></div>
      ${slipList()}
    </section>
  </div>

  <section class="cpanel ai">
    ${cardHead({
      ic: 'sparkle', title: 'Smart Performance Analysis', info: 'c.analysis',
      actions: `<button class="btn primary" data-act="runAnalysis" ${isLoading ? 'disabled' : ''}>${busy ? 'Analysing…' : `${icon('sparkle')} ${coachAnalysisText ? 'Refresh' : 'Run analysis'}`}</button>`,
    })}
    <div id="analysis-output" class="cout">
      ${busy ? skeleton('Generating analysis') : coachAnalysisText ? report(coachAnalysisText, coachAnalysisSource, coachAnalysisMessage, coachAnalysisAt) : `<div class="cempty"><span class="cbadge lg" aria-hidden="true">${icon('chart')}</span><b>No analysis yet</b><span>Tap <b>Run analysis</b> to get a plain-language review of your last sessions.</span></div>`}
    </div>
  </section>
  `;
}

function renderRecommendTab(summary) {
  const weakKey = weakestSkills(1)[0] || 'all';
  const weakName = SK[weakKey] ? SK[weakKey].n : 'Arithmetic';
  const busy = isLoading && loadingKind === 'recommend';
  const rec = recommendationStructured && SK[recommendationStructured.skill] ? recommendationStructured : null;
  return `
  <div class="cgrid wide-left">
    <section class="cpanel ai">
      ${cardHead({
        ic: 'target', title: 'Personalized Recommendation', info: 'c.recommend',
        actions: `<button class="btn primary" data-act="runRecommend" ${isLoading ? 'disabled' : ''}>${busy ? 'Thinking…' : `${icon('sparkle')} ${recommendationText ? 'New pick' : 'Get recommendation'}`}</button>`,
      })}
      <div class="cout">
        ${busy ? skeleton('Generating recommendation') : recommendationText ? `
          ${rec ? `<div class="cdrill" style="--sc:${COL[rec.skill]}"><span class="dot"></span><div><span class="eyebrow">Suggested session</span><b>${rec.durationSec / 60}-min ${esc(SK[rec.skill].n)} drill</b></div><button class="btn primary" data-act="startAiRec">${icon('play', 'fill')} Start</button></div>` : ''}
          ${report(recommendationText, recommendationSource, recommendationMessage, recommendationAt)}`
        : `<div class="cempty"><span class="cbadge lg" aria-hidden="true">${icon('target')}</span><b>No recommendation yet</b><span>Generated on demand, never a canned tip. Or skip the AI and drill your weakest skill right away.</span></div>`}
      </div>
      <div class="cfoot"><button class="btn" data-act="startAiDrill" data-v="${esc(weakKey)}">${icon('play', 'fill')} Quick drill: ${esc(weakName)}</button><span class="mu">Local, no AI needed</span></div>
    </section>

    <section class="cpanel cdue${summary.dueCount ? ' has' : ''}">
      <div class="cpanel-h"><span class="eyebrow">Spaced review${ib('c.review')}</span></div>
      <div class="cdue-n"><b class="num">${summary.dueCount}</b><span>${summary.dueCount === 1 ? 'question' : 'questions'} due</span></div>
      <p>${summary.dueCount ? 'Missed questions come back at the right time so they stick.' : 'Nothing due. Missed questions will show up here when it is time to revisit them.'}</p>
      <button class="btn ${summary.dueCount ? 'primary' : ''}" data-act="startReview" ${summary.dueCount === 0 ? 'disabled' : ''}>${icon('book')} Review now${summary.dueCount ? ` (${summary.dueCount})` : ''}</button>
    </section>
  </div>`;
}

function renderPlanTab(summary) {
  const busy = isLoading && loadingKind === 'plan';
  return `
  <section class="cpanel ai">
    ${cardHead({
      ic: 'cal', title: 'AI Training Plans', info: 'c.plan',
      actions: `<button class="btn primary" data-act="runPlan" ${isLoading ? 'disabled' : ''}>${busy ? 'Building…' : `${icon('sparkle')} ${trainingPlanText ? 'Refresh plan' : 'Generate plan'}`}</button>`,
    })}
    <div class="cout">
      ${busy ? skeleton('Generating plan') : trainingPlanText ? report(trainingPlanText, trainingPlanSource, trainingPlanMessage, trainingPlanAt) : `
        <div class="cempty"><span class="cbadge lg" aria-hidden="true">${icon('cal')}</span><b>No custom plan yet</b><span>Tap <b>Generate plan</b> for a structured roadmap that fits your level and your daily goal.</span></div>`}
    </div>
  </section>
  `;
}

function renderTutorTab(chat, uName) {
  const last = chat[chat.length - 1];
  const label = (msg) => (msg.role === 'user' ? esc(uName === 'you' ? 'You' : uName)
    : msg.source === 'gemini' ? `Gemini${msg.model ? ' · ' + esc(msg.model) : ''}`
      : msg.source === 'local' ? 'Local fallback · not Gemini' : 'Saved reply · source unknown');
  const messages = chat.map((msg) => msg.role === 'user' ? `
    <div class="chat-msg user">
      <div class="chat-bubble"><p>${esc(msg.text)}</p></div>
    </div>` : `
    <div class="chat-msg coach">
      <span class="cav" aria-hidden="true">${icon('sparkle')}</span>
      <div class="cm-body">
        <div class="chat-author${msg.source === 'local' ? ' warn' : ''}">${label(msg)}</div>${msg.message ? `<div class="chat-note">${esc(msg.message)}</div>` : ''}
        <div class="chat-bubble ai-prose">${formatMarkdown(msg.text)}</div>
      </div>
    </div>`).join('');
  const thinking = isLoading && loadingKind === 'chat' && last && last.role === 'user'
    ? `<div class="chat-msg coach"><span class="cav" aria-hidden="true">${icon('sparkle')}</span><div class="cm-body"><div class="chat-bubble typing" aria-live="polite"><i></i><i></i><i></i><span class="sr">Thinking…</span></div></div></div>` : '';
  const starters = [
    ['bolt', '×11 shortcut', 'How do I multiply two-digit numbers by 11 quickly?'],
    ['star', '93 × 97 trick', 'What is the fastest mental way to calculate 93 × 97?'],
    ['target', 'Squaring ending in 5', 'Give me a mental trick for squaring numbers ending in 5.'],
    ['redo', 'Avoid carry slips', 'How can I stop making off-by-one errors when carrying?'],
    ['down', 'Divide by 5 & 25', 'How do I quickly divide large numbers by 5 or 25 mentally?'],
    ['chart', 'Percentages', 'How can I calculate 15% and 20% in my head in 2 seconds?'],
  ];
  const dis = isLoading ? 'disabled' : '';
  const empty = `
    <div class="tutor-empty">
      <span class="cbadge lg" aria-hidden="true">${icon('bulb')}</span>
      <b>Ask your tutor anything</b>
      <span>Pick a starter or type your own question below.</span>
      <div class="starters">${starters.map(([ic, t, q]) => `<button class="starter" type="button" data-act="presetTutor" data-v="${esc(q)}" ${dis}>${icon(ic)}<span>${esc(t)}</span></button>`).join('')}</div>
    </div>`;
  const follow = !isLoading && last && last.role !== 'user'
    ? `<div class="tutor-chips follow" aria-label="Follow-up suggestions">${[['Another example', 'Give me another worked example of that with different numbers.'], ['Explain simpler', 'Explain that again more simply, step by step.'], ['Quiz me', 'Quiz me with 3 short questions on that. Give the answers only after I reply.']].map(([t, q]) => `<button class="chip" type="button" data-act="presetTutor" data-v="${esc(q)}">${esc(t)}</button>`).join('')}</div>` : '';

  return `
  <section class="tutor">
    <div class="tutor-header">
      <span class="cbadge" aria-hidden="true">${icon('bulb')}</span>
      <div class="tutor-title"><h2>Math Tutor</h2><p>Ask for a trick or method. Every reply says whether Gemini or the local fallback wrote it.</p></div>
      ${messages ? `<button class="btn sm ghost danger" data-act="clearTutor" aria-label="Clear chat">${icon('trash')}<span>Clear</span></button>` : ''}
    </div>
    <div id="chat-stream" class="chat-stream" aria-live="polite">${messages || thinking ? messages + thinking : empty}</div>
    ${follow}
    <form class="chat-form" id="tutor-form" action="#">
      <input class="inp" id="tutor-input" type="text" enterkeyhint="send" placeholder="Ask a mental math question…" value="${esc(tutorInputText)}" autocomplete="off" aria-label="Your question" ${dis}>
      <button class="send" type="button" id="tutor-send" data-act="askTutor" aria-label="Send" ${dis}>${SEND}</button>
    </form>
  </section>
  `;
}

// Markdown + LaTeX rendering is shared with the explanation dialog (js/richtext.js).
const formatMarkdown = renderRich;

/* ---------- Actions ---------- */
A.coachTab = (d) => {
  activeTab = d.v;
  coachView();
};

A.runAnalysis = async () => {
  if (isLoading) return;
  isLoading = true; loadingKind = 'analysis';
  coachView();
  try {
    const res = await callAi({ action: 'analyze', previousResponse: coachAnalysisSource === 'gemini' ? coachAnalysisText : '', forceRefresh: true });
    coachAnalysisText = res.text;
    coachAnalysisSource = res.source || 'local';
    coachAnalysisMessage = res.message || '';
    coachAnalysisAt = Date.now();
    setSavedAnalysis(res.text, coachAnalysisSource, coachAnalysisMessage);
  } catch (err) {
    coachAnalysisText = 'The analysis request failed. Please try again.';
    coachAnalysisSource = 'local';
    coachAnalysisMessage = String(err.message || err);
  } finally {
    isLoading = false; loadingKind = '';
    repaint();
  }
};

A.runPlan = async () => {
  if (isLoading) return;
  isLoading = true; loadingKind = 'plan';
  coachView();
  try {
    const res = await callAi({ action: 'plan', previousResponse: trainingPlanSource === 'gemini' ? trainingPlanText : '', forceRefresh: true });
    trainingPlanText = res.text;
    trainingPlanSource = res.source || 'local';
    trainingPlanMessage = res.message || '';
    trainingPlanAt = Date.now();
    setSavedPlan(res.text, trainingPlanSource, trainingPlanMessage);
  } catch (err) {
    trainingPlanText = 'Could not generate plan right now. Please try again.';
    trainingPlanSource = 'local';
    trainingPlanMessage = String(err.message || err);
    trainingPlanAt = Date.now();
  } finally {
    isLoading = false; loadingKind = '';
    repaint();
  }
};

A.runRecommend = async () => {
  if (isLoading) return;
  isLoading = true; loadingKind = 'recommend';
  coachView();
  try {
    const res = await callAi({ action: 'recommend', previousResponse: recommendationSource === 'gemini' ? recommendationText : '', forceRefresh: true });
    recommendationText = res.text;
    recommendationStructured = res.structured || null;
    recommendationSource = res.source || 'local';
    recommendationMessage = res.message || '';
    recommendationAt = Date.now();
  } catch (err) {
    recommendationText = 'The recommendation request failed. Please try again.';
    recommendationSource = 'local';
    recommendationMessage = String(err.message || err);
    recommendationAt = Date.now();
  } finally {
    isLoading = false; loadingKind = '';
    repaint();
  }
};

// Keep the conversation in view without an inner scroll box: after sending, show the
// newest message; after a reply, start at the top of the reply so it can be read in order.
function scrollTutor(where) {
  setTimeout(() => {
    const stream = document.querySelector('#chat-stream');
    if (!stream) return;
    const msgs = stream.querySelectorAll('.chat-msg');
    const last = msgs[msgs.length - 1];
    if (!last) return;
    try { last.scrollIntoView({ block: where === 'reply' ? 'start' : 'end', behavior: 'smooth' }); } catch { last.scrollIntoView(); }
  }, 60);
}

A.askTutor = async () => {
  const inp = document.querySelector('#tutor-input');
  const text = (inp ? inp.value : tutorInputText).trim();
  if (!text || isLoading) return;

  const history = getChatHistory();
  history.push({ role: 'user', text, at: Date.now() });
  saveChatHistory(history);

  tutorInputText = '';
  isLoading = true; loadingKind = 'chat';
  coachView();

  scrollTutor('end');

  try {
    const res = await callAi({ action: 'chat', message: text, history });
    history.push({ role: 'model', text: res.text, source: res.source || 'local', model: res.model || null, message: res.message || '', at: Date.now() });
    saveChatHistory(history);
  } catch (err) {
    history.push({ role: 'model', text: 'The tutor request failed. Please try again when the AI service is available.', source: 'local', at: Date.now() });
    saveChatHistory(history);
  } finally {
    isLoading = false; loadingKind = '';
    repaint();
    if (view.scr === 'coach') scrollTutor('reply');
  }
};

A.presetTutor = (d) => {
  const inp = document.querySelector('#tutor-input');
  if (inp) {
    inp.value = d.v;
    A.askTutor();
  }
};

A.clearTutor = () => {
  clearChatHistory();
  toast('Chat history cleared');
  coachView();
};

A.startAiRec = () => {
  const r = recommendationStructured;
  if (r && SK[r.skill]) start(undefined, { dur: r.durationSec, only: r.skill });
};

A.startAiDrill = (d) => {
  const sk = d.v || 'all';
  drill(sk);
};

A.startFirst = () => {
  start(undefined, { dur: 120, only: 'all' });
};

A.startWeakest = () => {
  const w = weakestSkills(1)[0] || 'all';
  drill(w);
};

A.startSprint = () => {
  start('sprint');
};

A.startReview = () => {
  start('review');
};

// Enter key in tutor input
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing && e.target && e.target.id === 'tutor-input') {
    e.preventDefault();
    A.askTutor();
  }
});

/** "Ask a follow-up" on any AI sheet: seed the Math Tutor chat with that reply, so the next question is answered in its context. */
aiHooks.followUp = ({ title, text }) => {
  const h = getChatHistory();
  h.push({ role: 'model', text: `**${String(title || 'AI answer')}**\n\n${String(text || '')}`.slice(0, 1200), source: 'gemini', at: Date.now() });
  saveChatHistory(h);
  activeTab = 'tutor';
  go('coach');
  setTimeout(() => { const i = document.querySelector('#tutor-input'); if (i) i.focus(); }, 120);
};
register('coach', coachView);
export { coachView };

