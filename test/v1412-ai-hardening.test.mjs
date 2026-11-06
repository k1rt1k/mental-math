import test from 'node:test';
import assert from 'node:assert/strict';
import { checkArithmetic, cleanSummary, cleanHistory, callGeminiFreeApiWithMeta, GEMINI_RETRY_CONFIG } from '../netlify/lib/ailogic.mjs';

test('arithmetic check flags real mistakes only', () => {
  assert.equal(checkArithmetic('47 × 6 = 282 and 9 + 8 = 17 and 182 ÷ 7 = 26').flags.length, 0);
  const bad = checkArithmetic('So 47 × 6 = 272.');
  assert.equal(bad.flags.length, 1);
  assert.equal(bad.flags[0].actual, 282);
  assert.match(bad.text, /Arithmetic check/);
});

test('arithmetic check ignores chains, remainders, decimals and prose', () => {
  for (const s of ['3 + 4 × 5 = 23', '17 ÷ 5 = 3 r 2', '17 ÷ 5 = 3.4', '1.5 × 2 = 3', 'Take 100 - 7 = 93, then 93 - 5 = 88', 'x = 5', 'Step 1: 20 + 6 = 26.']) {
    assert.equal(checkArithmetic(s).flags.length, 0, s);
  }
});

test('summary and history from the browser are bounded and well-formed', () => {
  const s = cleanSummary({ weaknesses: 'x'.repeat(1000), avgRating: Infinity, evil: { a: 1 } });
  assert.equal(s.weaknesses.length, 900);
  assert.equal(s.avgRating, 0);
  assert.ok(!('evil' in s));
  const h = cleanHistory([null, 5, { role: 'user', text: 'hi' }, { role: 'system', text: 'x' }, { role: 'model', text: 'y'.repeat(5000) }]);
  assert.deepEqual(h.map((x) => x.role), ['user', 'model']);
  assert.equal(h[1].text.length, 1200);
  assert.deepEqual(cleanHistory('nope'), []);
});

test('a slow answer gets more than 5 s, and a cut-off reply is flagged', async () => {
  assert.ok(GEMINI_RETRY_CONFIG.perAttemptTimeoutMs >= 8000);
  const fetchFn = async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'Half an answ' }] } }] }), { status: 200 });
  const r = await callGeminiFreeApiWithMeta({ apiKey: 'k', model: 'gemini-3.1-flash-lite', prompt: 'p', fetchFn, reserveQuota: async () => ({}) });
  assert.equal(r.truncated, true);
  assert.match(r.text, /cut off/);
});

test('an empty reply from the first model falls through to the backup model', async () => {
  let n = 0;
  const fetchFn = async () => (++n === 1
    ? new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [] } }] }), { status: 200 })
    : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 }));
  const r = await callGeminiFreeApiWithMeta({ apiKey: 'k', model: 'gemini-3.1-flash-lite', prompt: 'p', fetchFn, sleepFn: async () => {}, reserveQuota: async () => ({}) });
  assert.equal(r.text, 'ok');
  assert.equal(r.model, 'gemini-3.5-flash-lite');
});
