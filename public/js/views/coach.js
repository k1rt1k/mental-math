// AI Math Coach view: Personal Coach, Smart Analysis, Recommendations, Training Plans, and Conversational Tutor.
// ABSOLUTE REQUIREMENT: EVERYTHING MUST REMAIN COMPLETELY FREE. ₹0 SPENDING.

import { S } from '../state.js';
import { SK } from '../engine.js';
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
import { weakestSkills } from '../stats.js';
import { syncKey } from '../sync.js';

let activeTab = 'coach'; // 'coach' | 'recommend' | 'plan' | 'tutor'
let coachAnalysisText = '';
let trainingPlanText = '';
let tutorInputText = '';
let coachAnalysisSource = 'unknown', coachAnalysisMessage = '', coachAnalysisAt = 0;
let trainingPlanSource = 'unknown', trainingPlanMessage = '', trainingPlanAt = 0;
let recommendationText = '', recommendationSource = 'unknown', recommendationMessage = '', recommendationStructured = null;
let isLoading = false;
// A reply can arrive after the learner has left this screen (even started a session): never paint over whatever they are on now.
const repaint = () => { if (view.scr === 'coach') coachView(); };

function sourceNotice(source, message = '', at = 0, cached = false) {
  const label = source === 'gemini' ? 'Gemini-generated' : source === 'local' ? 'Local fallback · not Gemini' : 'Saved result · source unknown';
  const when = at ? ` · ${new Date(at).toLocaleString()}` : '';
  const cache = cached ? ' · exact-question cache' : '';
  return `<div class="mu" style="font-size:12px;margin:8px 0 12px"><b>${esc(label)}</b>${esc(when + cache)}${message ? `<br>${esc(message)}` : ''}</div>`;
}

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

  main.innerHTML = `
  <div class="coach-page">
  <div class="hd coach-header" style="align-items:flex-start">
    <div>
      <div class="eyebrow" style="display:flex;align-items:center;gap:8px">
        <span>AI MATHEMATICS COACH</span>
        ${quotaPill}
      </div>
      <h1 style="margin-top:4px">Personal Coach</h1>
    </div>
    <div class="mu" style="font-size:12px">Your progress · This device</div>
  </div>

  <div class="chips fscroll coach-tabs" role="tablist" aria-label="AI Coach sections" style="margin-bottom:18px">
    <button class="chip" role="tab" aria-selected="${activeTab === 'coach'}" data-act="coachTab" data-v="coach">
      ${icon('chart')} Coach & Analysis
    </button>
    <button class="chip" role="tab" aria-selected="${activeTab === 'recommend'}" data-act="coachTab" data-v="recommend">
      ${icon('target')} Recommendations
    </button>
    <button class="chip" role="tab" aria-selected="${activeTab === 'plan'}" data-act="coachTab" data-v="plan">
      ${icon('cal')} Training Plans
    </button>
    <button class="chip" role="tab" aria-selected="${activeTab === 'tutor'}" data-act="coachTab" data-v="tutor">
      ${icon('bulb')} Math Tutor
    </button>
  </div>

  ${syncKey() ? '' : `<div class="notice" style="margin-bottom:14px"><span>The AI needs this device's sync password. Until it's set you only get local summaries.</span><span class="btns"><button class="btn sm" data-go="settings">Open Settings</button></span></div>`}
  <div id="coach-content" class="coach-content">
    ${renderTabContent(summary, chat, uName)}
  </div>
  </div>
  `;
  if (aiBudgetLeft() == null) refreshAiBudget().then(() => { const p = document.querySelector('#ai-pill'); if (p && aiBudgetLeft() != null) p.innerHTML = `${icon('sparkle')} Gemini · ${aiBudgetLeft()} left today`; });
}

function renderTabContent(summary, chat, uName) {
  if (activeTab === 'coach') {
    return renderCoachTab(summary, uName);
  }
  if (activeTab === 'recommend') {
    return renderRecommendTab(summary);
  }
  if (activeTab === 'plan') {
    return renderPlanTab(summary);
  }
  if (activeTab === 'tutor') {
    return renderTutorTab(chat, uName);
  }
  return '';
}

function renderCoachTab(summary, uName) {
  return `
  <div class="coach-top">
    <div>
      ${summary.sessionsCount === 0 ? `
      <div class="card" style="margin-bottom:16px;border-color:color-mix(in srgb, var(--ac) 40%, transparent)">
        <b style="color:var(--tx)">Welcome to your Personal AI Coach, ${esc(uName)}!</b>
        <p class="mu" style="margin:6px 0 12px">
          You haven't played any sessions on this device yet. Complete a 2-minute session to calibrate your ratings and speed baseline, or ask your tutor questions below!
        </p>
        <button class="btn primary" data-act="startFirst">${icon('play')} Start First 2-Min Session</button>
      </div>` : ''}
      <div class="card" style="margin-bottom:16px">
        <div class="eyebrow" style="color:var(--ac)">YOUR PERFORMANCE${ib('c.perf')}</div>
        <div class="rstats coach-performance" style="margin-top:10px">
          <div class="rs"><b class="num">${summary.avgRating}</b><span>avg rating</span></div>
          <div class="rs"><b class="num">${summary.accuracy}%</b><span>accuracy</span></div>
          <div class="rs"><b class="num">${summary.avgSpeed ? summary.avgSpeed + 's' : '–'}</b><span>avg speed</span></div>
          <div class="rs"><b class="num">${summary.streak}d</b><span>streak</span></div>
        </div>
        <p class="mu" style="margin-top:12px;font-size:14px">
          Based on <b>${summary.sessionsCount}</b> sessions (${summary.totalAnswers} total answers).
          ${summary.weaknesses ? `<br>Key focus area: <b>${esc(summary.weaknesses)}</b>.` : ''}
        </p>
      </div>
    </div>

    <div>
      <div class="card" style="margin-bottom:16px">
        <div class="eyebrow" style="color:var(--ac)">STRENGTHS & RECURRING SLIPS${ib('c.slips')}</div>
        <div style="margin:10px 0 12px">
          <b>Common Mistakes Identified:</b>
          <div class="mu" style="margin-top:4px">${esc(!summary.commonErrors || summary.commonErrors == 'None logged' ? 'No recurring slips recorded yet.' : summary.commonErrors)}</div>
        </div>
        <div>
          <b>Skill Ratings:</b>
          <div class="mu" style="margin-top:4px">${esc(summary.skillsList)}</div>
        </div>
      </div>
    </div>
  </div>

  <div>
      <h2>Smart Performance Analysis${ib('c.analysis')}</h2>
      <div class="card" style="margin-bottom:16px">
        <p class="mu" style="margin-top:0">
          Generate a fresh analysis from your recorded performance. Results clearly distinguish live Gemini responses from local fallback summaries.
        </p>
        <div class="btns" style="margin:12px 0">
          <button class="btn primary" data-act="runAnalysis" ${isLoading ? 'disabled' : ''}>
            ${isLoading ? 'Generating fresh analysis…' : `${icon('sparkle')} Run Smart Analysis`}
          </button>
        </div>
        <div id="analysis-output" class="ai-prose" style="margin-top:14px;border-top:1px solid var(--ln);padding-top:14px">
          ${coachAnalysisText ? sourceNotice(coachAnalysisSource, coachAnalysisMessage, coachAnalysisAt) + formatMarkdown(coachAnalysisText) : '<div class="mu">Click <b>Run Smart Analysis</b> above to request a fresh analysis of your current performance.</div>'}
        </div>
      </div>
    </div>
  </div>
  `;
}

function renderRecommendTab(summary) {
  const weakKey = weakestSkills(1)[0] || 'all';
  const weakName = SK[weakKey] ? SK[weakKey].n : 'Arithmetic';
  return `
  <div class="cols">
    <div>
      <h2>Personalized Recommendation${ib('c.recommend')}</h2>
      <div class="card" style="margin-bottom:16px">
        <p class="mu" style="margin-top:0">Ask Gemini to choose a focused next session using your current ratings, accuracy, speed and review queue. This is generated on demand, not a static canned recommendation.</p>
        <div class="btns" style="margin:12px 0">
          <button class="btn primary" data-act="runRecommend" ${isLoading ? 'disabled' : ''}>${isLoading ? 'Generating recommendation…' : `${icon('sparkle')} Generate AI Recommendation`}</button>
          <button class="btn" data-act="startAiDrill" data-v="${esc(weakKey)}">${icon('play')} Start local weakest-skill drill (${esc(weakName)})</button>
        </div>
        ${recommendationText ? sourceNotice(recommendationSource, recommendationMessage) + `<div class="ai-prose">${formatMarkdown(recommendationText)}</div>${recommendationStructured && SK[recommendationStructured.skill] ? `<div class="btns" style="margin-top:12px"><button class="btn primary" data-act="startAiRec">${icon('play', 'fill')} Start this ${recommendationStructured.durationSec / 60}-min ${esc(SK[recommendationStructured.skill].n)} drill</button></div>` : ''}` : '<div class="mu">No recommendation generated yet.</div>'}
      </div>
    </div>
    <div>
      <h2>Spaced Review Status${ib('c.review')}</h2>
      <div class="card">
        <b>${summary.dueCount} questions due for spaced review</b>
        <p class="mu" style="margin:6px 0 14px">Review missed questions at the right time to strengthen recall.</p>
        <button class="btn" data-act="startReview" ${summary.dueCount === 0 ? 'disabled' : ''}>${icon('book')} Review Missed Questions (${summary.dueCount})</button>
      </div>
    </div>
  </div>`;
}

function renderPlanTab(summary) {
  return `
  <div>
    <h2>AI Training Plans${ib('c.plan')}</h2>
    <p class="mu" style="max-width:64ch;margin:-4px 0 16px">
      Structured daily workouts and weekly progression roadmaps generated to fit your personal practice goal (${summary.goal} sessions/day).
    </p>

    <div class="btns" style="margin-bottom:16px">
      <button class="btn primary" data-act="runPlan" ${isLoading ? 'disabled' : ''}>
        ${isLoading ? 'Generating Plan…' : `${icon('sparkle')} Generate / Refresh Training Plan`}
      </button>
    </div>

    <div class="card ai-prose">
      ${trainingPlanText ? sourceNotice(trainingPlanSource, trainingPlanMessage, trainingPlanAt) + formatMarkdown(trainingPlanText) : `
        <div class="empty" style="text-align:center;padding:20px">
          <b>No custom plan generated yet</b>
          <p class="mu" style="margin:8px 0 14px">Click "Generate / Refresh Training Plan" to produce a structured roadmap for your level.</p>
        </div>
      `}
    </div>
  </div>
  `;
}

function renderTutorTab(chat, uName) {
  const label = (msg) => (msg.role === 'user' ? esc(uName === 'you' ? 'You' : uName)
    : msg.source === 'gemini' ? `Gemini${msg.model ? ' · ' + esc(msg.model) : ''}`
      : msg.source === 'local' ? 'Local fallback · not Gemini' : 'Saved reply · source unknown');
  const messages = chat.map((msg) => `
    <div class="chat-msg ${msg.role === 'user' ? 'user' : 'coach'}">
      <div class="chat-author">${label(msg)}</div>${msg.role !== 'user' && msg.message ? `<div class="chat-note">${esc(msg.message)}</div>` : ''}
      <div class="chat-bubble ai-prose">${msg.role === 'user' ? `<p>${esc(msg.text)}</p>` : formatMarkdown(msg.text)}</div>
    </div>
  `).join('');
  const thinking = isLoading && chat.length && chat[chat.length - 1].role === 'user'
    ? `<div class="chat-msg coach"><div class="chat-author">Gemini</div><div class="chat-bubble typing" aria-live="polite"><i></i><i></i><i></i><span class="sr">Thinking…</span></div></div>` : '';
  const presets = [
    ['×11 shortcut', 'How do I multiply two-digit numbers by 11 quickly?'],
    ['93 × 97 trick', 'What is the fastest mental way to calculate 93 × 97?'],
    ['Squaring ending in 5', 'Give me a mental trick for squaring numbers ending in 5.'],
    ['Avoid carry slips', 'How can I stop making off-by-one errors when carrying?'],
    ['Divide by 5 & 25', 'How do I quickly divide large numbers by 5 or 25 mentally?'],
    ['Percentages', 'How can I calculate 15% and 20% in my head in 2 seconds?'],
    ['Subtract from 100', 'How do I subtract numbers from 100, 1000 or round bases mentally?'],
  ].map(([t, q]) => `<button class="chip" data-act="presetTutor" data-v="${esc(q)}" ${isLoading ? 'disabled' : ''}>${esc(t)}</button>`).join('');

  return `
  <div class="card tutor-card">
    <div class="tutor-header">
      <div class="tutor-title">
        <b>Math Tutor</b>
        <div class="mu">Ask for a trick or method. Each reply says whether Gemini or the local fallback wrote it.</div>
      </div>
      ${messages ? `<button class="btn sm ghost danger" data-act="clearTutor" aria-label="Clear chat">${icon('trash')}<span>Clear</span></button>` : ''}
    </div>

    <div class="tutor-chips" aria-label="Suggested questions">${presets}</div>

    <div id="chat-stream" class="chat-stream" aria-live="polite">
      ${messages || thinking ? messages + thinking : `<div class="tutor-empty"><b>Ask your tutor anything</b><span>Tap a suggestion above or type your own question below.</span></div>`}
    </div>

    ${!isLoading && chat.length && chat[chat.length - 1].role !== 'user' ? `<div class="tutor-chips follow" aria-label="Follow-up suggestions">${[['Another example', 'Give me another worked example of that with different numbers.'], ['Explain simpler', 'Explain that again more simply, step by step.'], ['Quiz me', 'Quiz me with 3 short questions on that. Give the answers only after I reply.']].map(([t, q]) => `<button class="chip" data-act="presetTutor" data-v="${esc(q)}">${esc(t)}</button>`).join('')}</div>` : ''}
    <form class="chat-form" id="tutor-form" action="#">
      <input class="inp" id="tutor-input" type="text" enterkeyhint="send" placeholder="Ask a mental math question…" value="${esc(tutorInputText)}" autocomplete="off" aria-label="Your question" ${isLoading ? 'disabled' : ''}>
      <button class="btn primary" type="button" id="tutor-send" data-act="askTutor" ${isLoading ? 'disabled' : ''}>${isLoading ? 'Thinking…' : 'Ask'}</button>
    </form>
  </div>
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
  isLoading = true;
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
    isLoading = false;
    repaint();
  }
};

A.runPlan = async () => {
  if (isLoading) return;
  isLoading = true;
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
    isLoading = false;
    repaint();
  }
};

A.runRecommend = async () => {
  if (isLoading) return;
  isLoading = true;
  coachView();
  try {
    const res = await callAi({ action: 'recommend', previousResponse: recommendationSource === 'gemini' ? recommendationText : '', forceRefresh: true });
    recommendationText = res.text;
    recommendationStructured = res.structured || null;
    recommendationSource = res.source || 'local';
    recommendationMessage = res.message || '';
  } catch (err) {
    recommendationText = 'The recommendation request failed. Please try again.';
    recommendationSource = 'local';
    recommendationMessage = String(err.message || err);
  } finally {
    isLoading = false;
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
  isLoading = true;
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
    isLoading = false;
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

