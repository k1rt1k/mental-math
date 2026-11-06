#!/usr/bin/env node
// Live end-to-end check of every AI action against the real Gemini API, using the app's own
// prompt builder and caller. Run it on YOUR machine:
//
//   GEMINI_API_KEY=your-key node tools/ai-selftest.mjs                       # all actions, both models
//   GEMINI_API_KEY=your-key node tools/ai-selftest.mjs --actions=coach,plan  # only the named actions
//   GEMINI_API_KEY=your-key node tools/ai-selftest.mjs --probe                # also test thinking-level settings
//   GEMINI_API_KEY=your-key node tools/ai-selftest.mjs --latency              # also 6 repeated calls per model
//   GEMINI_API_KEY=your-key node tools/ai-selftest.mjs --rpm=8                # use a lower rolling cap (default 12)
//   node tools/ai-selftest.mjs --mock                                         # dry run with a fake API (no key, no network)
//
// It writes ai-selftest-report.txt (the key is never printed or saved) which you can paste back.
// Request count: 15 regular action cases per model, +4 with --probe, +6 with --latency (25 maximum).
// Every generation request goes through a rolling per-model scheduler that enforces the app's 12 RPM cap,
// including probes and latency runs. The tool never touches the app's quota store.
// It sends exactly what production sends (per-action token ceiling and thinking level), flags replies
// that would be aborted by the production per-attempt timeout, and checks CONTENT: invented causes, false
// "your example" claims, headings in chat, answers leaked in quiz mode, over-long replies.
import { writeFileSync } from 'node:fs';
import { CAUSE_RE, ownershipClaims, usesHeadings, leaksQuizAnswers } from './ai-checks.mjs';
import { ModelPacer } from './ai-pacing.mjs';
import {
  buildPrompt, buildPromptParts, callGeminiFreeApiWithMeta, cleanContext, cleanSummary, parseRecommendation, parseSkillMap, checkArithmetic, FREE_MODELS,
  ACTION_TUNING, GEMINI_RETRY_CONFIG,
} from '../netlify/lib/ailogic.mjs';

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes('--' + name);
const valueOf = (name) => {
  const withEq = args.find((a) => a.startsWith('--' + name + '='));
  if (withEq) return withEq.slice(name.length + 3);
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : '';
};
const mock = hasFlag('mock');
const probe = hasFlag('probe');
const latency = hasFlag('latency');
const rpmArg = Number(valueOf('rpm'));
const RPM_LIMIT = Number.isFinite(rpmArg) && rpmArg > 0 ? Math.floor(rpmArg) : 12;
const pickedActions = valueOf('actions').split(',').map((s) => s.trim()).filter(Boolean);
const key = (process.env.GEMINI_API_KEY || '').trim();
if (!mock && !key) { console.error('Set GEMINI_API_KEY (or use --mock).'); process.exit(2); }

const summary = cleanSummary({
  avgRating: 612, peakRating: 701, sessionsCount: 14, totalAnswers: 410, accuracy: 83, firstTryAcc: 74, avgSpeed: '3.4', streak: 3, longestStreak: 6,
  weaknesses: 'Multiplication, Division (Facts: 7×8, 6×9)', commonErrors: 'Carry or place slip (9), Off by one (5)', dueCount: 7, goal: 2,
  skillsList: 'Addition: 710, Subtraction: 655, Multiplication: 540, Division: 520',
  patterns: 'Multiplication · carry 58% (12 tries, 2× par time); Division · remainder 66% (9 tries)', strongPatterns: 'Addition · bridge 95% (20 tries, 0.9× par time)',
  trend: 'accuracy +4 pts, speed -0.2 s per answer (lower is faster)',
  skillIds: 'add=Addition, sub=Subtraction, mul=Multiplication, div=Division', recentMisses: '47 × 6 = 282; 83 − 29 = 54',
});
const cases = [
  { name: 'analyze', action: 'analyze' },
  { name: 'coach', action: 'coach' },
  { name: 'plan', action: 'plan' },
  { name: 'recommend (JSON)', action: 'recommend', json: true },
  { name: 'explain', action: 'explain', question: { q: '47 × 6', a: 282, ty: '272', sk: 'mul', d: 4, pt: 'carry', workedMethod: '47 × 6 = 40 × 6 + 7 × 6 = 240 + 42 = 282' } },
  { name: 'chat', action: 'chat', message: 'What is the fastest way to multiply by 11?', history: [] },
  { name: 'chat (quiz me)', action: 'chat', message: 'Quiz me with 3 short questions on that. Give the answers only after I reply.', history: [{ role: 'user', text: 'How do I square a number ending in 5?' }, { role: 'model', text: 'Multiply the tens digit by one more than itself, then append 25. 35² = 3 × 4 = 12, then 25 → 1225.' }] },
  { name: 'debrief', action: 'debrief', context: { mode: 'train', seconds: 120, questions: 28, correct: 25, accuracyPct: 89, avgSecPerAnswer: 4.3, bestStreak: 9, skipped: 1, missed: [{ q: '47 × 6', answer: 282, typed: '272' }, { q: '83 − 29', answer: 54, typed: '64' }], slowest: [{ q: '156 ÷ 12', sec: 9.1 }], errorKinds: { place: 2, skip: 1 }, ratingChanges: [{ skill: 'Multiplication', change: -12 }] } },
  { name: 'trick', action: 'trick', context: { trick: 'Multiply by 11', skill: 'Multiplication', rule: 'Split the digits and put their sum in the middle.', cardExamples: ['36 × 11 = 3_(3+6)_6 = 396'], yourTries: 8, yourAccuracyPct: 62 } },
  { name: 'mistakes', action: 'mistakes', context: { total: 3, items: [{ q: '47 × 6', a: 282, typed: '272', sk: 'Multiplication', pt: 'carry' }, { q: '58 × 7', a: 406, typed: '396', sk: 'Multiplication', pt: 'carry' }, { q: '83 − 29', a: 54, typed: '64', sk: 'Subtraction', pt: 'borrow' }] } },
  { name: 'skill', action: 'skill', context: { skill: 'Multiplication', rating: 480, change7d: -6, accuracyPct: 71, speedVsPar: 1.3, answers: 64, weakPatterns: [{ pattern: 'carry', tries: 14, accuracyPct: 57, speedVsPar: 1.5 }], items: [{ q: '47 × 6', answer: 282, typed: '272' }, { q: '58 × 7', answer: 406, typed: '396' }] } },
  { name: 'facts', action: 'facts', context: { facts: [{ fact: '7 × 8', product: 56, tries: 9, accuracyPct: 44, speedVsPar: 1.7 }, { fact: '6 × 9', product: 54, tries: 7, accuracyPct: 57, speedVsPar: 1.4 }, { fact: '8 × 8', product: 64, tries: 6, accuracyPct: 67, speedVsPar: 1.2 }] } },
  { name: 'nexttrick', action: 'nexttrick', context: { tricks: [{ id: 'mul25', title: 'Multiply by 25', skill: 'Multiplication', tries: 0, accuracyPct: null }, { id: 'mul99', title: 'Multiply by 99 or 101', skill: 'Multiplication', tries: 12, accuracyPct: 50 }, { id: 'sq5', title: 'Square a number ending in 5', skill: 'Squares', tries: 20, accuracyPct: 95 }], skillRatings: { Multiplication: 480, Squares: 720 } } },
  { name: 'session', action: 'session', context: { mode: 'train', daysAgo: 2, seconds: 120, answers: 26, correct: 19, accuracyPct: 73, avgSec: 4.4, points: 780, ptsPerMin: 390, vsPrevSameKind: -30, perSkill: [{ skill: 'Addition', tried: 9, correct: 9, avgSec: 2.9, ratingChange: 8 }, { skill: 'Division', tried: 7, correct: 3, avgSec: 6.8, ratingChange: -11 }, { skill: 'Squares', tried: 2, correct: 2, avgSec: 3.1, ratingChange: 0 }] } },
  { name: 'progress', action: 'progress', context: { sessionsTotal: 14, streakDays: 3, recent: [{ mode: 'train', secs: 120, answers: 27, accuracyPct: 70, avgSec: 4.0, points: 800, daysAgo: 2 }, { mode: 'train', secs: 120, answers: 28, accuracyPct: 75, avgSec: 3.8, points: 840, daysAgo: 1 }, { mode: 'train', secs: 120, answers: 30, accuracyPct: 80, avgSec: 3.6, points: 900, daysAgo: 0 }], skillRatings: { Addition: 710, Multiplication: 540 } } },
];

const selected = pickedActions.length
  ? cases.filter((c) => pickedActions.includes(c.action) || pickedActions.includes(c.name))
  : cases;
if (!selected.length) {
  console.error(`No matching actions. Choose from: ${[...new Set(cases.map((c) => c.action))].join(', ')}`);
  process.exit(2);
}

// ---- fake API for --mock
const fakeFetch = async (url, init) => {
  const body = JSON.parse(init.body);
  const wantsJson = body.generationConfig && body.generationConfig.responseMimeType === 'application/json';
  const isChat = String(body.contents?.[0]?.parts?.[0]?.text || '').includes('CHAT RULES');
  const text = isChat ? 'Split the digits and add them: 25 × 11 is 2, then 2 + 5, then 5.' : wantsJson ? '{"skill":"mul","durationSec":180,"headline":"Fix carries","reason":"Carry accuracy is 58%.","technique":"47 × 6 = 240 + 42 = 282."}' : '### Test\n- 47 × 6 = 282\n- 9 + 8 = 17';
  return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 400, candidatesTokenCount: 120, thoughtsTokenCount: 0, totalTokenCount: 520 } }), { status: 200 });
};
const fetchFn = mock ? fakeFetch : globalThis.fetch;

const out = [];
const log = (s = '') => { out.push(s); console.log(s); };

const pacer = new ModelPacer({
  limit: RPM_LIMIT,
  enabled: !mock,
  onWait: (model, used, limit, waitMs) => log(`  pacing ${model}: ${used}/${limit} in the last minute, waiting ${(waitMs / 1000).toFixed(1)} s`),
});
let listRequests = 0;
// ---- content checks: things the old run called 'passed' although the reply was wrong or invented
const dataText = JSON.stringify([summary, selected.map((c) => [c.question, c.context, c.message, c.history])]);
const redact = (s) => String(s).split(key || '\u0000').join('[key]');
const fails = [];
const check = (ok, what) => { if (!ok) fails.push(what); return ok ? 'ok' : 'FAIL'; };

log(`Mental Math AI self-test · ${new Date().toISOString()} · ${mock ? 'MOCK (no network)' : 'LIVE'}`);
log(`Node ${process.version}\n`);

// ---- 1. models exist for this key
if (!mock) {
  try {
    listRequests++;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(key)}`);
    const j = await r.json();
    const names = (j.models || []).map((m) => m.name.replace('models/', ''));
    log(`Model list HTTP ${r.status}; ${names.length} models visible`);
    for (const m of FREE_MODELS) log(`  ${m}: ${names.includes(m) ? 'available' : 'NOT in the list for this key'}${names.includes(m) ? '' : '  <-- check the ID'}`);
    const lite = names.filter((n) => /flash-lite/.test(n));
    log(`  Flash-Lite models seen: ${lite.join(', ') || 'none'}\n`);
  } catch (e) { log(`Model list failed: ${redact(e.message)}\n`); }
}

// ---- 2. every action on every allowed model
const rows = [];
for (const model of FREE_MODELS) {
  log(`=== ${model} ===`);
  for (const c of selected) {
    // Exactly what production sends: standing rules as systemInstruction, task + learner data as the user turn.
    const { system, user: prompt } = buildPromptParts({ action: c.action, summary, question: c.question || {}, message: c.message || '', history: c.history || [], context: cleanContext(c.context) });
    await pacer.acquire(model);
    try {
      const r = await callGeminiFreeApiWithMeta({
        apiKey: key || 'mock', model, prompt, system, fetchFn, jsonMode: Boolean(c.json), action: c.action, reserveQuota: async () => ({}),
        retryConfig: { maxAttempts: 1, backoffMs: [0], maxRetryAfterMs: 0, totalBudgetMs: 60000, perAttemptTimeoutMs: 45000 },
      });
      const words = r.text.split(/\s+/).filter(Boolean).length;
      const latex = (r.text.match(/\$[^$\n]+\$|\\(?:times|div|frac|pmod|cdot|text)\b/g) || []).length;
      const u = r.usage || {};
      let extra = '';
      let jsonOk = '';
      if (c.json) {
        const p = parseRecommendation(r.text, parseSkillMap(summary.skillIds));
        jsonOk = check(Boolean(p), `${model}/${c.name}: recommendation is not valid JSON with a real skill`);
        extra = ` json=${jsonOk}${p ? ` skill=${p.structured.skill} ${p.structured.durationSec}s` : ''}`;
      }
      const arith = checkArithmetic(r.text.replace(/\n\n### ⚠ Arithmetic check[\s\S]*$/, '')).flags;
      const trunc = check(!r.truncated, `${model}/${c.name}: reply was cut off (MAX_TOKENS)`);
      const lx = check(latex === 0, `${model}/${c.name}: LaTeX leaked ${latex} time(s)`);
      const wordCap = Math.round((ACTION_TUNING[c.action]?.words || 150) * 1.3);
      const wc = check(words <= wordCap, `${model}/${c.name}: ${words} words is over the ${wordCap}-word phone limit`);
      const cause = check(!CAUSE_RE.test(r.text), `${model}/${c.name}: asserts WHY the learner erred (${(r.text.match(CAUSE_RE) || [''])[0]})`);
      const own = ownershipClaims(r.text, dataText);
      const ownOk = check(own.length === 0, `${model}/${c.name}: calls ${own.join(', ')} the learner's own, but it is not in their data`);
      const hd = c.action === 'chat' ? check(!usesHeadings(r.text), `${model}/${c.name}: chat reply uses headings`) : 'n/a';
      const leak = c.name === 'chat (quiz me)' ? check(!leaksQuizAnswers(r.text), `${model}/${c.name}: quiz reply gave answers before the learner replied`) : 'n/a';
      const slow = check(r.latencyMs <= GEMINI_RETRY_CONFIG.perAttemptTimeoutMs, `${model}/${c.name}: ${r.latencyMs} ms is over the ${GEMINI_RETRY_CONFIG.perAttemptTimeoutMs} ms production timeout (production would abort it and fail over)`);
      const ar = check(arith.length === 0, `${model}/${c.name}: arithmetic errors: ${arith.map((f) => f.statement + ' (is ' + f.actual + ')').join('; ')}`);
      const row = `${c.name.padEnd(18)} ${String(r.latencyMs).padStart(5)} ms  in=${u.promptTokenCount ?? '?'} out=${u.candidatesTokenCount ?? '?'} think=${u.thoughtsTokenCount ?? 0}  finish=${r.finishReason}  words=${words}  cut=${trunc} latex=${lx} len=${wc} math=${ar} cause=${cause} own=${ownOk} chat=${hd} quiz=${leak} speed=${slow}${extra}`;
      log(row);
      rows.push({ model, name: c.name, text: r.text, latencyMs: r.latencyMs });
    } catch (e) {
      fails.push(`${model}/${c.name}: ${redact(e.message)}`);
      log(`${c.name.padEnd(18)} ERROR ${redact(e.message).slice(0, 220)}`);
    }
  }
  log('');
}

// ---- 3. optional: which thinking settings does each model accept?
if (probe && !mock) {
  log('=== thinking-level probe (does the API accept the setting, and does it cut thinking tokens?) ===');
  for (const model of FREE_MODELS) {
    for (const cfg of [null, { thinkingLevel: 'minimal' }, { thinkingLevel: 'low' }, { thinkingBudget: 0 }]) {
      const body = { contents: [{ parts: [{ text: buildPrompt({ action: 'coach', summary }) }] }], generationConfig: { maxOutputTokens: 1500, ...(cfg ? { thinkingConfig: cfg } : {}) } };
      await pacer.acquire(model);
      try {
        const t0 = Date.now();
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json();
        const u = j.usageMetadata || {};
        log(`${model} ${JSON.stringify(cfg)}: HTTP ${r.status} ${Date.now() - t0} ms think=${u.thoughtsTokenCount ?? 0} out=${u.candidatesTokenCount ?? '?'}${r.ok ? '' : ' ' + redact(j.error?.message || '').slice(0, 140)}`);
      } catch (e) { log(`${model} ${JSON.stringify(cfg)}: ${redact(e.message)}`); }
    }
  }
  log('');
}

// ---- 4. optional: repeated identical calls, to see latency spread and spikes per model
if (latency && !mock) {
  log('=== latency spread: 6 identical coach calls per model (production timeout is ' + GEMINI_RETRY_CONFIG.perAttemptTimeoutMs + ' ms) ===');
  for (const model of FREE_MODELS) {
    const times = [];
    for (let i = 0; i < 6; i++) {
      await pacer.acquire(model);
      try {
        const r = await callGeminiFreeApiWithMeta({ apiKey: key, model, prompt: buildPrompt({ action: 'coach', summary }), action: 'coach', reserveQuota: async () => ({}),
          retryConfig: { maxAttempts: 1, backoffMs: [0], maxRetryAfterMs: 0, totalBudgetMs: 60000, perAttemptTimeoutMs: 45000 } });
        times.push(r.latencyMs);
      } catch (e) { times.push(-1); }
    }
    const ok = times.filter((t) => t >= 0).sort((a, b) => a - b);
    const over = times.filter((t) => t > GEMINI_RETRY_CONFIG.perAttemptTimeoutMs || t < 0).length;
    log(`${model}: ${times.join(', ')} ms  median=${ok[Math.floor(ok.length / 2)] ?? '?'}  max=${ok[ok.length - 1] ?? '?'}  would-time-out=${over}/6`);
  }
  log('');
}

log(`=== request summary · rolling ${RPM_LIMIT}/min per model ===`);
log(`Actions: ${selected.map((c) => c.name).join(', ')}`);
for (const model of FREE_MODELS) log(`${model}: ${pacer.count(model)} generation request${pacer.count(model) === 1 ? '' : 's'}`);
log(`Total generation requests: ${pacer.total}${mock ? ' (mock, no network)' : ''}`);
if (!mock) log(`Model-list requests: ${listRequests}`);
log('');

log(fails.length ? `PROBLEMS (${fails.length}):\n- ${fails.join('\n- ')}` : 'All checks passed.');
if (!mock) {
  log('\n=== full replies (for reading quality) ===');
  for (const m of FREE_MODELS) {
    log(`\n######## ${m} ########`);
    for (const r of rows.filter((x) => x.model === m)) log(`\n--- ${r.name} (${r.latencyMs} ms) ---\n${r.text}`);
  }
}
writeFileSync(new URL('../ai-selftest-report.txt', import.meta.url), redact(out.join('\n')));
console.log('\nReport written to ai-selftest-report.txt (the key is not in it).');
process.exit(fails.length ? 1 : 0);
