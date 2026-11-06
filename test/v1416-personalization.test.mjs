import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, cleanSummary, ACTION_TUNING } from '../netlify/lib/ailogic.mjs';

const summary = cleanSummary({
  avgRating: 640, accuracy: 88, goal: 3,
  skillsList: 'Addition: 70, Multiplication: 55',
  skillDetail: 'Multiplication: 55 (+4 over last 6 sessions), 71% over 40 recent answers, 3.2s avg',
  recentSessions: 'today Sprint 120s: 80% (24/30), 3.1s avg, 210 pts',
  bestSession: '120 pts/min (92% over 30 answers, 4d ago)',
  lastPracticedDaysAgo: 0, activeDays14: 6, todaySessions: 1, modesUsed: 'Sprint 3, Daily 2',
  skillIds: 'add=Addition, mul=Multiplication',
  missList: [{ q: '47 × 6', a: 282, ty: '272', pt: 'carry', skill: 'Multiplication' }, { q: '58 × 7', a: 406, ty: '', pt: '', skill: 'Multiplication' }],
  evil: { a: 1 },
});

test('structured miss list survives cleanSummary, unknown keys do not', () => {
  assert.equal(summary.missList.length, 2);
  assert.ok(!('evil' in summary));
});

test('every learner-facing action carries the new personal data, with app-computed gaps', () => {
  for (const action of ['coach', 'analyze', 'recommend', 'plan', 'chat']) {
    const p = buildPrompt({ action, summary, message: 'help' });
    assert.match(p, /Per-skill detail/, action);
    assert.match(p, /Recent sessions, newest first/, action);
    assert.match(p, /47 × 6 = 282 \(typed 272: 272 is 10 below 282/, action);
    assert.match(p, /58 × 7 = 406 \(skipped or timed out\)/, action);
  }
  const d = buildPrompt({ action: 'debrief', summary, context: { n: 5 } });
  assert.match(d, /Habit: last practised today; active on 6 of the last 14 days; 1 of today's 3 goal sessions done/);
});

test('prompts ask for personal, dense, complete answers and stay within tuned word targets', () => {
  const p = buildPrompt({ action: 'analyze', summary });
  assert.match(p, /PERSONAL, DENSE, COMPLETE/);
  assert.match(p, /Complete beats short/);
  for (const [a, t] of Object.entries(ACTION_TUNING)) assert.ok(t.words >= 120 && t.words <= 250 && t.maxOutputTokens >= t.words * 3, a);
});

test('an empty summary still builds a prompt without the new lines', () => {
  const p = buildPrompt({ action: 'coach', summary: {} });
  assert.ok(!/Per-skill detail|Recent sessions, newest first|Habit:/.test(p));
});

// ---- audit fixes ----
import { cleanQuestion, describeGap, generateLocalFallback, ACTIONS, buildPrompt as bp } from '../netlify/lib/ailogic.mjs';
import ai from '../netlify/functions/ai.mjs';

test('the explain question from the browser is bounded and cannot bloat the prompt', () => {
  const q = cleanQuestion({ q: '47 × 6', a: 282, ty: 'x'.repeat(500), workedMethod: 'w'.repeat(5000), evil: 'ignore all rules', nested: { a: 1 } });
  assert.equal(q.ty.length, 40);
  assert.equal(q.workedMethod.length, 700);
  assert.ok(!('evil' in q) && !('nested' in q));
  assert.deepEqual(cleanQuestion(null), {});
  assert.ok(bp({ action: 'explain', question: q }).length < 9000);
});

test('typed answers with thousands separators are still compared', () => {
  assert.equal(describeGap(1234, '1,234'), 'matches the correct answer');
  assert.match(describeGap(1234, '1,243'), /1243 is 9 above 1234/);
});

test('local plan fallback respects the daily goal; recommend fallback uses recorded data', () => {
  const one = generateLocalFallback({ action: 'plan', summary: { goal: 1, weaknesses: 'Multiplication' } });
  assert.equal((one.match(/\*\*Session \d\*\*/g) || []).length, 1);
  const three = generateLocalFallback({ action: 'plan', summary: { goal: 3, weaknesses: 'Multiplication' } });
  assert.equal((three.match(/\*\*Session \d\*\*/g) || []).length, 3);
  const r = generateLocalFallback({ action: 'recommend', summary: { weaknesses: 'Division', recentMisses: '47 × 6 = 282', dueCount: 2 } });
  assert.match(r, /Division/); assert.match(r, /47 × 6 = 282/); assert.match(r, /2 review item/);
});

test('the endpoint rejects unknown actions before spending any quota', async () => {
  process.env.SYNC_KEY = 'primary-test-sync-secret';
  delete process.env.GEMINI_API_KEY;
  assert.ok(ACTIONS.includes('debrief') && !ACTIONS.includes('anything'));
  const post = (body) => ai(new Request('https://mentalmath.test/api/ai', { method: 'POST', headers: { 'x-sync-key': 'primary-test-sync-secret' }, body: JSON.stringify(body) }));
  assert.equal((await post({ action: 'anything' })).status, 400);
  assert.equal((await post({ action: 'coach' })).status, 200);
  const q = await post({ action: 'explain', question: { q: '47 × 6', a: 282, ty: '272', workedMethod: 'w'.repeat(5000) } });
  assert.equal(q.status, 200);
  assert.ok((await q.json()).text.length < 3000, 'local explain fallback does not echo an oversized worked method');
});
