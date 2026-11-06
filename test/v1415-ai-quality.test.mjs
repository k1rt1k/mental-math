// v14.15: AI answer quality. Prompts are grounded in app-computed facts, advice is specific, replies are phone-sized,
// and the live self-test's content checks catch the flaws that the 14.14 report showed but called "passed".
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPrompt, describeGap, checkArithmetic, callGeminiFreeApiWithMeta, resetModelHealth, resetThinkingSupport,
  ACTION_TUNING, DEFAULT_MODEL, FREE_MODELS, QUOTA_LIMITS,
} from '../netlify/lib/ailogic.mjs';
import { CAUSE_RE, ownershipClaims, usesHeadings, leaksQuizAnswers } from '../tools/ai-checks.mjs';

const summary = {
  avgRating: 612, peakRating: 701, sessionsCount: 14, totalAnswers: 410, accuracy: 83, firstTryAcc: 74, avgSpeed: '3.4', streak: 3, longestStreak: 6,
  weaknesses: 'Multiplication, Division (Facts: 7×8, 6×9)', commonErrors: 'Carry or place slip (9)', dueCount: 7, goal: 2,
  skillsList: 'Addition: 710, Subtraction: 655, Multiplication: 540, Division: 520',
  patterns: 'Multiplication · carry 58% (12 tries, 2× par time)', strongPatterns: 'Addition · bridge 95%', trend: 'accuracy +4 pts',
  skillIds: 'add=Addition, mul=Multiplication', recentMisses: '47 × 6 = 282; 83 − 29 = 54',
};
const ACTIONS = ['coach', 'analyze', 'plan', 'recommend', 'explain', 'chat', 'debrief', 'trick', 'mistakes', 'progress'];

test('describeGap states only measurable facts about a wrong answer', () => {
  assert.match(describeGap(282, '272'), /272 is 10 below 282.*exactly one tens unit.*only the tens digit differs \(7 instead of 8\)/);
  assert.match(describeGap(54, '64'), /64 is 10 above 54/);
  assert.match(describeGap(406, '396'), /396 is 10 below 406; exactly one tens unit away$/);   // two digits differ: no single-digit claim
  assert.equal(describeGap(54, ''), 'skipped or timed out');
  assert.equal(describeGap(54, null), 'skipped or timed out');
  assert.equal(describeGap(54, 'abc'), null);
  assert.equal(describeGap('8 r 2', '8'), null, 'non-numeric answers are left to the model without a made-up gap');
  assert.match(describeGap(123, '132'), /same digits in a different order/);
  assert.match(describeGap(36, '360'), /factor of 10/);
  assert.match(describeGap(54, '54'), /matches/);
});

test('mistakes and debrief prompts carry app-computed gaps and the shared-gap pattern', () => {
  const items = [{ q: '47 × 6', a: 282, typed: '272' }, { q: '58 × 7', a: 406, typed: '396' }, { q: '83 − 29', a: 54, typed: '64' }];
  const m = buildPrompt({ action: 'mistakes', summary, context: { total: 3, items } });
  assert.match(m, /272 is 10 below 282/);
  assert.match(m, /3 of 3 wrong answers are exactly 10 away from the correct answer/);
  const d = buildPrompt({ action: 'debrief', summary, context: { missed: [{ q: '47 × 6', answer: 282, typed: '272' }, { q: '83 − 29', answer: 54, typed: '64' }], slowest: [{ q: '156 ÷ 12', sec: 9.1 }] } });
  assert.match(d, /64 is 10 above 54/);
  assert.match(d, /2 of 2 wrong answers are exactly 10/);
  assert.match(d, /slowest question/i, 'the slow question is a valid focus when no shared gap exists');
  const none = buildPrompt({ action: 'mistakes', summary, context: { items: [items[0], { q: '9 × 8', a: 72, typed: '70' }] } });
  assert.doesNotMatch(none, /gapSummary":/, 'no shared size of error, so no summary is invented');
});

test('explain prompt includes the computed gap so the model never subtracts for itself', () => {
  const p = buildPrompt({ action: 'explain', question: { q: '47 × 6', a: 282, ty: '272', workedMethod: '47 × 6 = 240 + 42 = 282' } });
  assert.match(p, /computed by the app, use it as written\): 272 is 10 below 282/);
  assert.match(p, /Do not say how they got it/);
  assert.match(buildPrompt({ action: 'explain', question: { q: '47 × 6', a: 282, ty: '' } }), /skipped or timed out/);
});

test('every prompt has the grounding rules, a phone-length target and no LaTeX permission', () => {
  for (const action of ACTIONS) {
    const p = buildPrompt({ action, summary, message: 'hi', context: { items: [], recent: [] }, question: { q: '1 + 1', a: 2 } });
    assert.match(p, /Never say WHY the learner got something wrong/, action);
    assert.match(p, /ONLY if that exact question appears in the supplied data/, action);
    assert.match(p, /Never use LaTeX/, action);
    assert.match(p, new RegExp(`about ${ACTION_TUNING[action].words} words`), action);
    assert.match(p, /TECHNIQUE MENU/, action);
  }
});

test('the technique menu is not just partial products, and its own arithmetic is correct', () => {
  const p = buildPrompt({ action: 'coach', summary });
  for (const t of ['round and adjust', 'round the subtrahend', 'nearest multiple of the divisor', 'anchor to a fact']) assert.ok(p.includes(t), t);
  assert.deepEqual(checkArithmetic(p).flags, [], 'every worked equation in the prompt is true');
  for (const a of ACTIONS) assert.deepEqual(checkArithmetic(buildPrompt({ action: a, summary })).flags, [], a);
});

test('coach, analyze, recommend, plan and chat all see the recently missed questions and skill ratings', () => {
  for (const action of ['coach', 'analyze', 'recommend', 'plan', 'chat']) {
    const p = buildPrompt({ action, summary, message: 'x' });
    assert.ok(p.includes('47 × 6 = 282'), `${action} sees recent misses`);
    assert.ok(p.includes('Division: 520'), `${action} sees skill ratings`);
  }
});

test('plan prompt maps the daily goal to that many sessions and ends in a measurable check', () => {
  const p2 = buildPrompt({ action: 'plan', summary });
  assert.match(p2, /### Every day \(2 sessions\)\nExactly 2 bullets/);
  assert.match(p2, /### Day 7 check/);
  const p1 = buildPrompt({ action: 'plan', summary: { ...summary, goal: 1 } });
  assert.match(p1, /### Every day \(1 session\)\nExactly 1 bullet,/);
});

test('chat prompt forbids headings, claiming examples as the learner\'s own, and quiz answers', () => {
  const p = buildPrompt({ action: 'chat', summary, message: 'Quiz me', history: [] });
  assert.match(p, /No headings/);
  assert.match(p, /never present an example as theirs/);
  assert.match(p, /give only the questions, no answers/);
});

test('progress prompt says sessions are oldest to newest and ties targets to the goal', () => {
  const p = buildPrompt({ action: 'progress', summary, context: { recent: [{ accuracyPct: 70, daysAgo: 2 }, { accuracyPct: 80, daysAgo: 0 }] } });
  assert.match(p, /oldest to newest/);
  assert.match(p, /daily goal of 2 sessions/);
});

test('default model is 3.5 Flash-Lite, 3.1 stays as the only backup, both free', () => {
  assert.equal(DEFAULT_MODEL, 'gemini-3.5-flash-lite');
  assert.deepEqual(FREE_MODELS, ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);
});

function capture(sent, status = 200, text = 'ok') {
  return async (url, init) => {
    sent.push({ model: /models\/([^:]+):/.exec(url)[1], cfg: JSON.parse(init.body).generationConfig });
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] }), { status });
  };
}
const base = { apiKey: 'k', prompt: 'p', sleepFn: async () => {}, reserveQuota: async () => ({}) };

test('requests use the per-action token ceiling and thinking level; plain calls keep the old defaults', async () => {
  resetThinkingSupport(); resetModelHealth();
  for (const action of ACTIONS) {
    const sent = [];
    await callGeminiFreeApiWithMeta({ ...base, model: DEFAULT_MODEL, fetchFn: capture(sent), action, jsonMode: action === 'recommend' });
    const t = ACTION_TUNING[action];
    assert.equal(sent[0].cfg.maxOutputTokens, t.maxOutputTokens, action);
    assert.ok(t.maxOutputTokens <= QUOTA_LIMITS.MAX_OUTPUT_TOKENS, `${action} stays within the global ceiling`);
    assert.deepEqual(sent[0].cfg.thinkingConfig, t.thinking ? { thinkingLevel: t.thinking } : undefined, action);
    assert.ok(!('thinkingBudget' in (sent[0].cfg.thinkingConfig || {})), 'thinkingBudget:0 is rejected by 3.5, never sent');
  }
  const sent = [];
  await callGeminiFreeApiWithMeta({ ...base, model: DEFAULT_MODEL, fetchFn: capture(sent) });
  assert.deepEqual(sent[0].cfg, { maxOutputTokens: QUOTA_LIMITS.MAX_OUTPUT_TOKENS });
});

test('maths-critical actions think a little; conversational ones do not', () => {
  for (const a of ['explain', 'mistakes', 'debrief', 'trick', 'recommend']) assert.equal(ACTION_TUNING[a].thinking, 'low', a);
  for (const a of ['coach', 'analyze', 'plan', 'chat', 'progress']) assert.equal(ACTION_TUNING[a].thinking, null, a);
});

test('a model that rejects the thinking setting is skipped for it from then on, and the backup still answers', async () => {
  resetThinkingSupport(); resetModelHealth();
  const sent = [];
  const rejecting = async (url, init) => {
    const cfg = JSON.parse(init.body).generationConfig;
    const model = /models\/([^:]+):/.exec(url)[1];
    sent.push({ model, thinking: Boolean(cfg.thinkingConfig) });
    if (model === 'gemini-3.5-flash-lite' && cfg.thinkingConfig) return new Response(JSON.stringify({ error: { message: 'Unsupported thinking config for this model' } }), { status: 400 });
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'fine' }] } }] }), { status: 200 });
  };
  const r = await callGeminiFreeApiWithMeta({ ...base, model: DEFAULT_MODEL, fetchFn: rejecting, action: 'explain' });
  assert.equal(r.text, 'fine');
  assert.equal(r.model, 'gemini-3.1-flash-lite');
  sent.length = 0;
  await callGeminiFreeApiWithMeta({ ...base, model: DEFAULT_MODEL, fetchFn: rejecting, action: 'explain' });
  assert.deepEqual(sent, [{ model: 'gemini-3.5-flash-lite', thinking: false }], 'next call goes straight to the primary without the rejected setting');
  resetThinkingSupport();
});

// Real replies from the 14.14 live report (gemini-3.1-flash-lite), kept as fixtures of what must now be caught or allowed.
const BAD_MISTAKES = 'In both, you calculated the tens place correctly but failed to add the carry-over from the units place. In 83 − 29, you likely subtracted 20 from 80 and added 9 to 3.';
const BAD_DEBRIEF = 'Both your missed questions indicate a focus error in place value calculation.';
const BAD_CHAT = '*   **47 × 11 (your recent challenge):**\n    *   Split 4 and 7.';
const DATA = JSON.stringify([summary, { missed: [{ q: '47 × 6' }, { q: '83 − 29' }] }, 'How do I square a number ending in 5? 35² = 3 × 4']);
const GOOD_EXPLAIN = 'Your result is exactly 10 lower than the correct answer. 50 × 6 = 300, 3 × 6 = 18, 300 - 18 = 282.';

test('content checks flag the 14.14 flaws and leave the good reply alone', () => {
  assert.match(BAD_MISTAKES, CAUSE_RE);
  assert.match(BAD_DEBRIEF, CAUSE_RE);
  assert.doesNotMatch(GOOD_EXPLAIN, CAUSE_RE);
  assert.deepEqual(ownershipClaims(BAD_CHAT, DATA), ['47 × 11']);
  assert.deepEqual(ownershipClaims('Try 47 × 6 (your recent miss).', DATA), [], 'a question that IS in the data may be called theirs');
  assert.equal(usesHeadings('### Squaring Numbers Ending in 5\n- 25²'), true);
  assert.equal(usesHeadings('Try these three:\n- 25²'), false);
  assert.equal(leaksQuizAnswers('Answers: 625, 4225'), true);
  assert.equal(leaksQuizAnswers('Reply with your answers when ready.'), false);
});

test('the arithmetic checker still catches a wrong worked example in a reply', () => {
  const r = checkArithmetic('47 × 6 = 40 × 6 + 7 × 6 = 240 + 42 = 283');
  assert.equal(r.flags.length, 1);
  assert.match(r.text, /240 \+ 42 = 283 is wrong: it equals 282/);
});
