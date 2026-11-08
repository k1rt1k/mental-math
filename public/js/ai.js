// Client-side Gemini AI integration for the single learner on this device.
// ABSOLUTE REQUIREMENT: EVERYTHING MUST REMAIN COMPLETELY FREE. ₹0 SPENDING.

import { S, avgLv, LEGACY_ACTIVE_USER } from './state.js';
import { syncKey } from './sync.js';
import { IDS, SK, how } from './engine.js';
import { weakestSkills, weakFacts, streak, longest, ERRL, todayCount } from './stats.js';
import { A } from './nav.js';
import { dialog } from './ui.js';
import { esc, ymd } from './util.js';
import { renderRich } from './richtext.js';
import { localInsight, focusPattern } from './aiLocal.js';
import { pathsSummary } from './pathAi.js';

export const AI_MODELS = [
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', tier: 'Free Tier', desc: 'Primary: fastest in the live self-test' },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash-Lite', tier: 'Free Tier', desc: 'Automatic backup model' },
];

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
// v2 key: older builds silently saved the old default (3.1) here, which would pin every existing device to it.
const AI_MODEL_STORAGE = 'mmTrainer.geminiModel.v2';
const EXPLANATION_CACHE_TTL = 4 * 60 * 60 * 1000;
const EXPLANATION_CACHE_VERSION = 'v6';
const AI_PREFIX = 'mmTrainer.ai.';

// Migrate only the previously selected learner's AI history on this device.
// The other legacy slot is deliberately retained as a recovery copy.
export function migrateLegacyAiData(storage = localStorage, selectedUser = LEGACY_ACTIVE_USER) {
  const marker = 'mmTrainer.v14.singleUserAi.v1';
  if (storage[marker]) return false;
  const suffix = selectedUser === '2' ? '2' : '1';
  const items = ['analysis', 'plan', 'chat', 'expl'];
  for (const item of items) {
    const target = AI_PREFIX + item;
    const source = `mmTrainer.ai_${suffix}_${item}`;
    if (!storage[target] && storage[source]) storage[target] = storage[source];
  }
  // Remove any legacy browser-stored API key. Credentials now live only in Netlify.
  try { delete storage['mmTrainer.geminiKey']; } catch { /* ignore */ }
  storage[marker] = '1';
  return true;
}
try { migrateLegacyAiData(); } catch { /* local AI history remains usable */ }

export function getSelectedModel() {
  // Old installations may still have a retired model saved. Never send it to the API.
  try {
    const saved = localStorage[AI_MODEL_STORAGE];
    const model = AI_MODELS.some((item) => item.id === saved) ? saved : DEFAULT_MODEL;
    if (saved !== model) localStorage[AI_MODEL_STORAGE] = model;
    return model;
  } catch { return DEFAULT_MODEL; }
}

export function setSelectedModel(model) {
  // This build deliberately exposes only a currently supported free-tier model.
  const safe = AI_MODELS.some((item) => item.id === model) ? model : DEFAULT_MODEL;
  try { localStorage[AI_MODEL_STORAGE] = safe; } catch { /* ignore */ }
  return safe;
}

// Quota state tracked locally
export const aiQuota = {
  isExhausted: false,
  resetAt: 0,
  usedToday: null,
  dailyLimit: 300,
};

/** Learn how much of today's shared free budget is left (GET /api/ai). Cached for a minute. */
let budgetCheckedAt = 0;
export async function refreshAiBudget() {
  if (Date.now() - budgetCheckedAt < 60000) return aiQuota;
  budgetCheckedAt = Date.now();
  try {
    const r = await fetch('/api/ai', { cache: 'no-store' });
    const j = await r.json();
    if (j && j.quota && Number.isFinite(j.quota.usedToday)) { aiQuota.usedToday = j.quota.usedToday; aiQuota.dailyLimit = j.quota.dailyLimit || 300; }
  } catch { /* the pill just keeps its generic label */ }
  return aiQuota;
}
export const aiBudgetLeft = () => (aiQuota.usedToday == null ? null : Math.max(0, aiQuota.dailyLimit - aiQuota.usedToday));

/**
 * Builds a compact, token-efficient performance summary for this device's learner.
 * Tokens are kept to ~120-150 words to stay well within free limits.
 */
export function buildCompactSummary(st = S) {
  const totalAnswers = st.sessions.reduce((acc, s) => acc + (s.n || 0), 0);
  const totalCorrect = st.sessions.reduce((acc, s) => acc + (s.ok || 0), 0);
  const totalFirstTry = st.sessions.reduce((acc, s) => acc + (s.ft ?? s.ok ?? 0), 0);
  const accuracy = totalAnswers ? Math.round((100 * totalCorrect) / totalAnswers) : 0;
  const firstTryAcc = totalAnswers ? Math.round((100 * totalFirstTry) / totalAnswers) : 0;

  const validTimes = st.sessions.filter((s) => s.tm > 0);
  const avgSpeed = validTimes.length
    ? (validTimes.reduce((acc, s) => acc + s.tm, 0) / validTimes.length).toFixed(1)
    : null;

  const ratings = IDS.map((k) => Math.round(st.sk[k].lv * 100));
  const avgRating = Math.round(avgLv() * 100);
  const peakRating = Math.max(...ratings, avgRating);

  const weak = weakestSkills(2).map((k) => SK[k].n).join(', ');
  const wf = weakFacts().slice(0, 5).map(([a, b]) => `${a}×${b}`).join(', ');

  const errCounts = st.errs || {};
  const commonErrors = Object.entries(errCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k, count]) => `${ERRL[k] ? ERRL[k][0] : k} (${count})`)
    .join(', ');

  const dueCount = Object.values(st.weak || {}).filter((w) => w.due <= Date.now()).length;

  // Question patterns ("Multiplication · carry"): the most specific signal the app has about what to fix.
  const pats = Object.entries(st.pat || {}).filter(([, o]) => o && o.n >= 5)
    .map(([k, o]) => ({ k, n: o.n, acc: Math.round((100 * o.ok) / o.n), sp: o.ok ? +(o.r / o.ok).toFixed(2) : null }));
  const fmtP = (p) => `${p.k} ${p.acc}% (${p.n} tries${p.sp ? `, ${p.sp}× par time` : ''})`;
  const patterns = [...pats].sort((a, b) => a.acc - b.acc || (b.sp || 0) - (a.sp || 0)).filter((p) => p.acc < 90 || (p.sp || 0) > 1.2).slice(0, 6).map(fmtP).join('; ');
  const strongPatterns = [...pats].filter((p) => p.acc >= 90 && (p.sp || 9) <= 1).sort((a, b) => (a.sp || 9) - (b.sp || 9)).slice(0, 4).map(fmtP).join('; ');
  let trend = '';
  if (st.sessions.length >= 6) {
    const avg = (arr, f) => (arr.length ? arr.reduce((a, s) => a + f(s), 0) / arr.length : 0);
    const recent = st.sessions.slice(-3), before = st.sessions.slice(-6, -3);
    const acc = (s) => (s.n ? (100 * s.ok) / s.n : 0);
    const dAcc = Math.round(avg(recent, acc) - avg(before, acc));
    const tmR = avg(recent.filter((s) => s.tm > 0), (s) => s.tm), tmB = avg(before.filter((s) => s.tm > 0), (s) => s.tm);
    trend = `accuracy ${dAcc >= 0 ? '+' : ''}${dAcc} pts` + (tmR && tmB ? `, speed ${(tmR - tmB) >= 0 ? '+' : ''}${(tmR - tmB).toFixed(1)} s per answer (lower is faster)` : '');
  }

  // Everything below is app-measured; the server prompt tells the model to use it as written.
  const DAY = 864e5, now = Date.now();
  const MODE = { daily: 'Daily', review: 'Review', survival: 'Survival', sprint: 'Sprint', train: 'Practice', path: 'Learn path' };
  const recentSessions = st.sessions.slice(-8).reverse().map((x) => {
    const ago = Math.max(0, Math.round((now - x.t) / DAY));
    return `${ago ? ago + 'd ago' : 'today'} ${MODE[x.m] || x.m || 'Practice'} ${x.dur}s: ${x.n ? Math.round((100 * x.ok) / x.n) : 0}% (${x.ok}/${x.n})${x.tm ? ', ' + x.tm + 's avg' : ''}, ${x.pts} pts`;
  }).join('; ');
  const last = st.sessions[st.sessions.length - 1];
  const lastPracticedDaysAgo = last ? Math.max(0, Math.round((now - last.t) / DAY)) : null;
  const activeDays14 = new Set(st.sessions.filter((x) => now - x.t < 14 * DAY).map((x) => ymd(x.t))).size;
  const modesUsed = Object.entries(st.sessions.slice(-20).reduce((o, x) => ((o[MODE[x.m] || x.m || 'Practice'] = (o[MODE[x.m] || x.m || 'Practice'] || 0) + 1), o), {})).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ');
  // Per-skill: rating, change across the last 6 sessions, and accuracy / speed over the last 10 sessions.
  const skillDetail = IDS.map((k) => {
    const rs = st.sessions.slice(-6).map((x) => x.lv && x.lv[k]).filter((v) => Number.isFinite(v));
    const move = rs.length >= 3 ? Math.round((rs[rs.length - 1] - rs[0]) * 100) : null;
    let n = 0, ok = 0, tm = 0;
    st.sessions.slice(-10).forEach((x) => { const b = x.by && x.by[k]; if (b) { n += b[0]; ok += b[1]; tm += b[2]; } });
    return `${SK[k].n}: ${Math.round(st.sk[k].lv * 100)}${move == null ? '' : ` (${move >= 0 ? '+' : ''}${move} over last ${rs.length} sessions)`}${n >= 5 ? `, ${Math.round((100 * ok) / n)}% over ${n} recent answers${ok ? ', ' + (tm / ok).toFixed(1) + 's avg' : ''}` : ''}`;
  }).join(' | ');
  const best = st.sessions.filter((x) => x.dur >= 60 && x.n >= 5 && x.m != 'path').sort((a, b) => b.pts * 60 / b.dur - a.pts * 60 / a.dur)[0];
  const bestSession = best ? `${Math.round((best.pts * 60) / best.dur)} pts/min (${best.n ? Math.round((100 * best.ok) / best.n) : 0}% over ${best.n} answers, ${Math.round((now - best.t) / DAY)}d ago)` : '';
  const missList = Object.values(st.weak || {}).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 8)
    .map((w, i) => {
      // The app's own worked solution for the newest misses: the model reuses it instead of re-deriving (and mis-deriving) the arithmetic.
      let worked = '';
      if (i < 3) { try { worked = String(how(w) || '').slice(0, 170); } catch { worked = ''; } }
      return { q: w.q, a: w.a, ty: w.ty || '', pt: w.pt || '', skill: SK[w.sk] ? SK[w.sk].n : '', ...(worked ? { worked } : {}) };
    });
  // The single most useful thing to drill, decided by the app (lowest accuracy among patterns with enough tries), so the model never has to pick between conflicting signals.
  const fp = focusPattern(st.pat);
  const focus = fp ? `${fp.k}: ${fp.acc}% over ${fp.n} tries${fp.sp ? `, ${fp.sp}× par time` : ''}` : '';
  const focusSkill = fp ? IDS.find((k) => fp.k.startsWith(SK[k].n + ' · ')) || '' : '';

  const skillsList = IDS.map((k) => `${SK[k].n}: ${Math.round(st.sk[k].lv * 100)}`).join(', ');

  return {
    userName: 'you',
    avgRating,
    peakRating,
    sessionsCount: st.sessions.length,
    totalAnswers,
    accuracy,
    firstTryAcc,
    avgSpeed,
    streak: streak(),
    longestStreak: longest(),
    weaknesses: weak + (wf ? ` (Facts: ${wf})` : ''),
    patterns, strongPatterns, trend, focus, focusSkill,
    skillIds: IDS.map((k) => `${k}=${SK[k].n}`).join(', '),
    recentMisses: missList.map((w) => `${w.q} = ${w.a}`).join('; '),
    missList,
    recentSessions, skillDetail, bestSession, modesUsed,
    lastPracticedDaysAgo, activeDays14, todaySessions: todayCount(),
    commonErrors: commonErrors || 'None logged',
    dueCount,
    ...pathsSummary(),
    goal: st.goal || 2,
    skillsList,
  };
}

// AI history and cached explanations are local to this device. Each person uses
// their own device and their own sync password for the corresponding cloud account.
export function getSavedAnalysis() {
  try { return localStorage[AI_PREFIX + 'analysis'] || ''; } catch { return ''; }
}
export function setSavedAnalysis(text, source = 'unknown', message = '') {
  try {
    localStorage[AI_PREFIX + 'analysis'] = text;
    localStorage[AI_PREFIX + 'analysisSource'] = source;
    localStorage[AI_PREFIX + 'analysisMessage'] = message;
    localStorage[AI_PREFIX + 'analysisAt'] = String(Date.now());
  } catch { /* ignore */ }
}
export function getSavedAnalysisSource() {
  try { return localStorage[AI_PREFIX + 'analysisSource'] || 'unknown'; } catch { return 'unknown'; }
}
export function getSavedAnalysisMessage() {
  try { return localStorage[AI_PREFIX + 'analysisMessage'] || ''; } catch { return ''; }
}
export function getSavedAnalysisAt() {
  try { return Number(localStorage[AI_PREFIX + 'analysisAt'] || 0); } catch { return 0; }
}
export function getSavedPlan() {
  try { return localStorage[AI_PREFIX + 'plan'] || ''; } catch { return ''; }
}
export function setSavedPlan(text, source = 'unknown', message = '') {
  try {
    localStorage[AI_PREFIX + 'plan'] = text;
    localStorage[AI_PREFIX + 'planSource'] = source;
    localStorage[AI_PREFIX + 'planMessage'] = message;
    localStorage[AI_PREFIX + 'planAt'] = String(Date.now());
  } catch { /* ignore */ }
}
export function getSavedPlanSource() {
  try { return localStorage[AI_PREFIX + 'planSource'] || 'unknown'; } catch { return 'unknown'; }
}
export function getSavedPlanMessage() {
  try { return localStorage[AI_PREFIX + 'planMessage'] || ''; } catch { return ''; }
}
export function getSavedPlanAt() {
  try { return Number(localStorage[AI_PREFIX + 'planAt'] || 0); } catch { return 0; }
}
export function getChatHistory() {
  try {
    const raw = localStorage[AI_PREFIX + 'chat'];
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
export function saveChatHistory(history) {
  try { localStorage[AI_PREFIX + 'chat'] = JSON.stringify((history || []).slice(-20)); }
  catch { /* ignore */ }
}
export function clearChatHistory() {
  try { delete localStorage[AI_PREFIX + 'chat']; } catch { /* ignore */ }
}
function explanationCacheKey(question, model = getSelectedModel()) {
  if (typeof question === 'string') return `${model}|${question}`; // legacy API compatibility
  const q = question || {};
  return JSON.stringify([
    EXPLANATION_CACHE_VERSION,
    model,
    String(q.q ?? ''),
    String(q.a ?? ''),
    String(q.ty ?? ''),
    String(q.sk ?? ''),
    String(q.d ?? ''),
    String(q.pt ?? ''),
    String(q.workedMethod ?? ''),
  ]);
}

export function getCachedExplanation(question, model = getSelectedModel()) {
  try {
    const raw = localStorage[AI_PREFIX + 'expl'];
    const cache = raw ? JSON.parse(raw) : {};
    const hit = cache[explanationCacheKey(question, model)];
    if (!hit || hit.source !== 'gemini' || !hit.at || Date.now() - hit.at > EXPLANATION_CACHE_TTL) return null;
    return hit;
  } catch { return null; }
}
export function setCachedExplanation(question, text, model = getSelectedModel(), generatedByModel = model) {
  try {
    const raw = localStorage[AI_PREFIX + 'expl'];
    const cache = raw ? JSON.parse(raw) : {};
    cache[explanationCacheKey(question, model)] = { text, at: Date.now(), source: 'gemini', model: generatedByModel };
    const keys = Object.keys(cache);
    while (keys.length > 50) delete cache[keys.shift()];
    localStorage[AI_PREFIX + 'expl'] = JSON.stringify(cache);
  } catch { /* ignore */ }
}

// Actions that analyse a specific chunk of the learner's data. Their Gemini answers are cached
// on this device for a few hours so reopening the same sheet costs no quota.
const inflight = new Map();   // identical requests (a double tap) share one upstream call
const CONTEXT_ACTIONS = new Set(['debrief', 'trick', 'mistakes', 'progress', 'recommend', 'skill', 'facts', 'nexttrick', 'session', 'lesson', 'pathrun', 'nextpath', 'week']);
/** Late-bound hooks so ai.js never imports a view (the Coach registers `followUp`). */
export const aiHooks = {};
const hashKey = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; return h.toString(36) + str.length; };
function getCtxCache(key) {
  try {
    const hit = JSON.parse(localStorage[AI_PREFIX + 'ctx'] || '{}')[hashKey(key)];
    return hit && Date.now() - hit.at < EXPLANATION_CACHE_TTL ? hit : null;
  } catch { return null; }
}
function setCtxCache(key, text, model, structured = null) {
  try {
    const cache = JSON.parse(localStorage[AI_PREFIX + 'ctx'] || '{}');
    cache[hashKey(key)] = { text, at: Date.now(), model, structured };
    const keys = Object.keys(cache);
    while (keys.length > 60) delete cache[keys.shift()];
    localStorage[AI_PREFIX + 'ctx'] = JSON.stringify(cache);
  } catch { /* ignore */ }
}

/**
 * Open a sheet that asks Gemini about a specific piece of the learner's data and shows the
 * reply, labelled with its real source. "Regenerate" bypasses the on-device cache.
 */
export async function showAiSheet({ title, action, context = null, message = '', extra = null }) {
  let force = false, chosen = null, lastText = '';
  for (;;) {
    const choice = await dialog({
      title,
      body: '<div class="ai-slot" aria-live="polite"><div class="chat-bubble typing" style="width:fit-content"><i></i><i></i><i></i><span class="sr">Thinking…</span></div></div>',
      actions: [{ label: 'Regenerate', value: 'regen' }, ...(aiHooks.followUp ? [{ label: 'Ask a follow-up', value: 'follow' }] : []), { label: 'Done', value: true, primary: true }],
      onOpen: async (dlg) => {
        const slot = dlg.querySelector('.ai-slot');
        const regen = [...dlg.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Regenerate');
        const follow = [...dlg.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Ask a follow-up');
        if (regen) regen.disabled = true;
        if (follow) follow.disabled = true;
        const res = await callAi({ action, context, message, forceRefresh: force });
        if (!slot.isConnected) return;
        lastText = res.source === 'gemini' ? res.text : '';
        if (follow) follow.disabled = !lastText;   // the Coach only keeps Gemini replies as chat context
        const label = res.source === 'gemini' ? `Gemini response · ${esc(res.model || '')}${res.cached ? ' · saved on this device' : ''}` : 'Local fallback · not Gemini';
        const why = res.source !== 'gemini' && res.message ? `<div class="chat-note" style="margin-bottom:8px">${esc(res.message)}</div>` : '';
        slot.innerHTML = `<div class="mu" style="font-size:12px;margin-bottom:10px">${label}</div>${why}<div class="ai-prose">${renderRich(res.text)}</div>`;
        if (regen) regen.disabled = false;
        // Follow-up buttons so the advice can be acted on straight away.
        const acts = dlg.querySelector('.acts');
        const items = extra ? extra(res) || [] : [];   // actions stay available on a local fallback too: they are the point when Gemini is offline
        if (acts && items.length) {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;width:100%';
          items.forEach((it) => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'btn tonal'; b.textContent = it.label;
            b.onclick = () => { chosen = it.run; dlg.close(); };
            row.appendChild(b);
          });
          acts.parentNode.insertBefore(row, acts);
        }
      },
    });
    if (chosen) { const run = chosen; setTimeout(run, 50); return; }
    if (choice === 'follow' && lastText && aiHooks.followUp) { const t = lastText; setTimeout(() => aiHooks.followUp({ title, text: t }), 50); return; }
    if (choice !== 'regen') return;
    force = true;
  }
}

/**
 * Call the Free Gemini AI backend (/api/ai).
 * Automatically passes compact summaries, rate limits, user isolation,
 * and handles fallbacks gracefully.
 */
export async function callAi({ action = 'coach', question = null, message = '', history = [], previousResponse = '', forceRefresh = false, context = null }) {
  if (aiQuota.isExhausted && aiQuota.resetAt && Date.now() >= aiQuota.resetAt) { aiQuota.isExhausted = false; aiQuota.resetAt = 0; }
  const summary = buildCompactSummary(S);
  const model = getSelectedModel();
  const personalSyncKey = syncKey();
  const requestQuestion = question && typeof question === 'object' ? { ...question } : question;

  if (action === 'explain' && requestQuestion && typeof requestQuestion === 'object') {
    // Include the app's own worked solution so both Gemini and the local fallback
    // respond to this exact problem instead of giving generic mental-math advice.
    if (!requestQuestion.workedMethod) {
      try { requestQuestion.workedMethod = how(requestQuestion) || ''; } catch { requestQuestion.workedMethod = ''; }
    }
    if (requestQuestion.workedMethod && requestQuestion.workedMethod.length > 500) {
      requestQuestion.workedMethod = requestQuestion.workedMethod.slice(0, 500);
    }
  }

  if (!personalSyncKey) {
    return {
      ok: true, fallback: true, source: 'local', authRequired: true,
      text: `### Local guide · Gemini not connected\n\nSet this device’s personal sync password in Settings to use the Gemini Coach.\n\n${generateClientOfflineFallback(action, summary, requestQuestion, message, context)}`,
      message: 'Set this device’s personal sync password in Settings to use Gemini.',
    };
  }

  if (action === 'explain' && requestQuestion && requestQuestion.q && !forceRefresh) {
    const hit = getCachedExplanation(requestQuestion, model);
    if (hit) return { ok: true, text: hit.text, cached: true, source: 'gemini', model: hit.model || model, freeTier: true };
  }

  // A saved Gemini answer for the same data is served first, so it still works offline or after the daily budget is used up.
  const ctxKey = CONTEXT_ACTIONS.has(action) ? JSON.stringify([action, model, message, context, summary.skillsList, summary.patterns, summary.recentMisses, summary.dueCount, summary.goal, summary.sessionsCount, summary.paths]) : '';
  if (ctxKey && !forceRefresh) {
    const hit = getCtxCache(ctxKey);
    if (hit) return { ok: true, text: hit.text, structured: hit.structured || null, cached: true, source: 'gemini', model: hit.model || model, freeTier: true };
  }
  // Known-exhausted daily budget: don't make a request that the server will only refuse.
  if (aiQuota.isExhausted && aiQuota.resetAt && Date.now() < aiQuota.resetAt && !forceRefresh) {
    return {
      ok: true, fallback: true, source: 'local', quotaExhausted: true,
      text: generateClientOfflineFallback(action, summary, requestQuestion, message, context),
      message: `The shared free-tier AI budget is used up for today. It resets around ${new Date(aiQuota.resetAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`,
    };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: true, fallback: true, source: 'local', offline: true, text: generateClientOfflineFallback(action, summary, requestQuestion, message, context), message: 'You are offline, so Gemini could not be reached.' };
  }
  const cleanHist = (Array.isArray(history) ? history : []).filter((h) => h && (h.role === 'user' || (h.role === 'model' && h.source === 'gemini'))).slice(-8).map((h) => ({ role: h.role, text: String(h.text || '').slice(0, 1200) }));
  const payload = { action, summary, question: requestQuestion, message, history: cleanHist, context, previousResponse: String(previousResponse || '').slice(0, 1800), model, forceRefresh };
  const flightKey = ctxKey || (action === 'explain' && requestQuestion && requestQuestion.q ? 'x' + JSON.stringify(requestQuestion) : '');
  if (flightKey && inflight.has(flightKey) && !forceRefresh) return inflight.get(flightKey);
  const run = (async () => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 35000);
  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sync-key': personalSyncKey },
      body: JSON.stringify(payload),
      signal: ctl.signal,
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      return {
        ok: true, fallback: true, source: 'local', authRequired: true,
        text: `### Local guide · Gemini authentication needed\n\nThe server did not accept this device’s sync password. Check Settings.\n\n${generateClientOfflineFallback(action, summary, requestQuestion, message, context)}`,
        message: 'This device’s sync password was not accepted by the AI service. Check Settings.',
      };
    }
    if (!res.ok) throw new Error(data.error || `AI request failed (${res.status})`);

    if (data.budget && Number.isFinite(data.budget.usedToday)) { aiQuota.usedToday = data.budget.usedToday; aiQuota.dailyLimit = data.budget.dailyLimit || aiQuota.dailyLimit; }
    if (data.quotaExhausted) {
      aiQuota.isExhausted = true;
      aiQuota.resetAt = data.resetAt || (Date.now() + 3600000);
    }
    const source = data.source === 'gemini' && !data.fallback ? 'gemini' : 'local';
    // Never cache local fallback text as if Gemini generated it.
    if (action === 'explain' && requestQuestion && requestQuestion.q && data.text && source === 'gemini') {
      if (!data.truncated && !(data.arithmeticFlags || []).length) setCachedExplanation(requestQuestion, data.text, model, data.model || model);
    }

    if (ctxKey && data.text && source === 'gemini' && !data.truncated && !(data.arithmeticFlags || []).length) setCtxCache(ctxKey, data.text, data.model || model, data.structured || null);

    return {
      ok: true,
      text: data.text || 'No response was returned. Please try again.',
      structured: data.structured || null,
      source,
      fallback: source !== 'gemini',
      fallbackReason: data.message || data.error || '',
      quotaExhausted: data.quotaExhausted || false,
      dailyBudgetExhausted: data.dailyBudgetExhausted || false,
      rateLimited: data.rateLimited || false,
      providerStatus: data.providerStatus || null,
      modelsTried: data.modelsTried || [],
      budget: data.budget || null,
      cached: data.cached || false,
      truncated: Boolean(data.truncated),
      model: source === 'gemini' ? (data.model || model) : null,
      freeTier: source === 'gemini',
      message: data.message || data.error || '',
    };
  } catch (err) {
    return {
      ok: true,
      fallback: true,
      source: 'local',
      text: generateClientOfflineFallback(action, summary, requestQuestion, message, context),
      offline: true,
      message: err && err.name === 'AbortError' ? 'Gemini took too long to answer (over 35 s). Showing a local guide instead; try again.' : `Gemini request failed: ${err.message || 'network unavailable'}. Showing a local guide instead.`,
    };
  } finally {
    clearTimeout(timer);
  }
  })();
  if (flightKey) { inflight.set(flightKey, run); run.finally(() => inflight.delete(flightKey)); }
  return run;
}

/**
 * Client-side instant offline fallback generator.
 * Guarantees zero blank screens even without any internet connection.
 */
function generateClientOfflineFallback(action, summary, question, message, context = null) {
  const weak = summary.weaknesses || 'not enough recorded data';
  const insight = ['debrief', 'mistakes', 'progress', 'skill', 'facts', 'nexttrick', 'session', 'lesson', 'pathrun', 'nextpath', 'week'].includes(action) ? localInsight(action, summary, context) : null;
  if (insight) return insight;

  if (action === 'coach' || action === 'analyze') {
    const hasData = Number(summary.sessionsCount) > 0 && Number(summary.totalAnswers) > 0;
    return `### Local performance snapshot · Gemini unavailable\n\n` +
      (hasData ? `- **Sessions:** ${summary.sessionsCount}\n- **Answers:** ${summary.totalAnswers}\n- **Recorded accuracy:** ${summary.accuracy}%\n- **Average response time:** ${summary.avgSpeed ? summary.avgSpeed + 's' : 'not available'}\n- **Current focus from app data:** ${weak}\n\n` : `There is not enough practice history for a reliable performance analysis yet. Complete a few sessions first.\n\n`) +
      `This is a local summary, not a Gemini-generated diagnosis. It does not infer unrecorded mistakes or strengths.`;
  }
  if (action === 'explain' && question) {
    const worked = question.workedMethod || (() => { try { return how(question); } catch { return ''; } })();
    return `### Local worked method · Gemini unavailable\n\n` +
      `**Problem:** ${question.q} = ${question.a}\n\n` +
      `**Your answer:** ${question.ty === '' || question.ty == null ? 'Skipped / timed out' : question.ty}\n\n` +
      (worked ? `**Verified method from the app:**\n\n${worked}\n\n` : `The app does not have a stored worked method for this question format. The correct answer recorded by the maths engine is **${question.a}**; no guessed steps are shown.\n\n`) +
      `This local guide can show the calculation path, but it cannot know exactly why you made the mistake.`;
  }
  if (action === 'recommend') {
    return `### Local practice suggestion · Gemini unavailable\n\n- **Focus:** ${weak}.\n${summary.patterns ? `- **Weakest patterns:** ${summary.patterns}.\n` : ''}${summary.recentMisses ? `- **Recent misses to redo:** ${summary.recentMisses}.\n` : ''}- **Session:** a 2-minute drill on that skill, then clear the ${Number(summary.dueCount) > 0 ? summary.dueCount + ' review item(s) due' : 'Notebook'}.\n\nThis is a basic local suggestion built from your recorded data, not a generated AI recommendation.`;
  }
  if (CONTEXT_ACTIONS.has(action)) {
    return `### Local note · Gemini unavailable\n\nNo AI analysis was generated, so nothing here is a diagnosis. Try again in a minute; your data is unchanged.`;
  }
  if (action === 'plan') {
    const goal = Math.min(6, Math.max(1, Number(summary.goal) || 2));
    const steps = ['a 120 s session on **' + weak + '**', 'a 60 s warm-up on mixed questions', 'a Review session of the Notebook items that are due', 'a Sprint to practise speed under pressure', 'a second 120 s session on **' + weak + '**', 'a 60 s mixed cool-down'];
    return `### Local training outline · Gemini unavailable\n\n#### Every day (${goal} session${goal === 1 ? '' : 's'})\n` + steps.slice(0, goal).map((x, i) => `- **Session ${i + 1}**: ${x}.`).join('\n') + '\n\nThis is a basic local outline from your recorded data, not an AI-generated plan.';
  }
  if (action === 'chat') {
    return `Gemini is unavailable, so I can't reliably answer **“${String(message).slice(0, 180)}”** right now. Please try again when the AI service is online. Your practice data is safe.`;
  }
  return `Mental calculation relies on decomposing numbers into round bases. Keep practicing daily!`;
}

// Markdown + LaTeX rendering shared with the Coach (js/richtext.js).
const formatAiText = renderRich;

export async function showAiExplanation({ q, a, ty = '', sk = '', d = '', pt = '' }) {
  const question = { q, a, ty, sk, d, pt };
  try { question.workedMethod = how(question) || ''; } catch { question.workedMethod = ''; }
  let force = false, lastText = '';
  for (;;) {
    const choice = await dialog({
      title: `AI Method: ${q} = ${a}`,   // dialog() escapes the title itself
      body: '<div class="ai-slot" aria-live="polite"><div class="chat-bubble typing" style="width:fit-content"><i></i><i></i><i></i><span class="sr">Thinking…</span></div></div>',
      actions: [{ label: 'Regenerate', value: 'regen' }, ...(aiHooks.followUp ? [{ label: 'Ask a follow-up', value: 'follow' }] : []), { label: 'Got it', value: true, primary: true }],
      onOpen: async (dlg) => {
        const slot = dlg.querySelector('.ai-slot');
        const find = (t) => [...dlg.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
        const regen = find('Regenerate'), follow = find('Ask a follow-up');
        if (regen) regen.disabled = true;
        if (follow) follow.disabled = true;
        let res;
        try { res = await callAi({ action: 'explain', question, forceRefresh: force }); }
        catch { res = { source: 'local', text: 'Could not load the AI explanation. Try Regenerate.', message: '' }; }
        if (!slot.isConnected) return;
        lastText = res.source === 'gemini' ? res.text : '';
        if (follow) follow.disabled = !lastText;
        if (regen) regen.disabled = false;
        const sourceLabel = res.source === 'gemini' ? (res.cached ? 'Gemini response · cached exact question' : `Gemini response · ${res.model || 'current model'}`) : 'Local worked method · Gemini not used';
        const notice = res.message ? `<p class="mu" style="font-size:12px">${esc(res.message)}</p>` : '';
        slot.innerHTML = `<div class="mu" style="font-size:12px;margin-bottom:10px">${esc(sourceLabel)}</div>${notice}<div class="ai-prose" style="max-height:60vh;overflow-y:auto">${formatAiText(res.text)}</div>`;
      },
    });
    if (choice === 'follow' && lastText && aiHooks.followUp) { const t = lastText; setTimeout(() => aiHooks.followUp({ title: `${q} = ${a}`, text: t }), 50); return; }
    if (choice !== 'regen') return;
    force = true;
  }
}

A.aiExplain = (d) => showAiExplanation(d);

