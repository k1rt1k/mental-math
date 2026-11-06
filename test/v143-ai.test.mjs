// v14.3 AI response regressions: prompt specificity, freshness, cache isolation and truthful fallbacks.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SYNC_KEY = 'v142-ai-test-secret';
process.env.GEMINI_API_KEY = 'v142-gemini-test-key';

// Test-only Netlify Blobs store for the persistent shared AI budget.
import { setAiQuotaStoreForTests } from '../netlify/lib/ai-quota.mjs';
const quotaData = new Map();
let quotaEtag = 0;
setAiQuotaStoreForTests({
  async getWithMetadata(key) { const hit = quotaData.get(key); return hit ? { data: structuredClone(hit.value), etag: hit.etag } : null; },
  async setJSON(key, value, opts = {}) {
    const hit = quotaData.get(key);
    if (opts.onlyIfNew && hit) return { modified: false };
    if (opts.onlyIfMatch && (!hit || hit.etag !== opts.onlyIfMatch)) return { modified: false };
    const etag = `v143-q-${++quotaEtag}`; quotaData.set(key, { value: structuredClone(value), etag }); return { modified: true, etag };
  },
});

const aiLogic = await import('../netlify/lib/ailogic.mjs');
const aiHandler = (await import('../netlify/functions/ai.mjs')).default;

const post = (body, key = process.env.SYNC_KEY) => aiHandler(new Request('https://mentalmath.test/api/ai', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-sync-key': key },
  body: JSON.stringify(body),
}));

const summary = {
  avgRating: 610, peakRating: 680, sessionsCount: 12, totalAnswers: 240,
  accuracy: 88, firstTryAcc: 82, avgSpeed: '2.1', streak: 4,
  longestStreak: 9, weaknesses: 'Two-digit multiplication',
  commonErrors: 'carry (8)', dueCount: 3, skillsList: 'Addition: 720, Multiplication: 510', goal: 2,
};

const originalFetch = globalThis.fetch;
let requests = [];
function mockGemini() {
  requests = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ url: String(url), prompt: body.contents?.[0]?.parts?.map((p) => p.text).join('') || '' });
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: `Distinct mock answer ${requests.length}` }] } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

test('different AI Method questions produce different exact-question prompts and verified inputs', () => {
  const first = {
    q: '47 × 8', a: 376, ty: 366, sk: 'mul', d: 4, pt: 'two digit × one digit',
    workedMethod: '47 × 8 = 47 × (4 × 2) = 188 × 2 = 376',
  };
  const second = {
    q: '93 × 97', a: 9021, ty: 9022, sk: 'mul', d: 7, pt: 'near 100',
    workedMethod: '93 × 97 = 93 × (100 − 3) = 9300 − 279 = 9021',
  };
  const p1 = aiLogic.buildPrompt({ action: 'explain', question: first });
  const p2 = aiLogic.buildPrompt({ action: 'explain', question: second });
  for (const token of ['47 × 8', '376', '366', first.workedMethod]) assert.ok(p1.includes(token), `first prompt includes ${token}`);
  for (const token of ['93 × 97', '9021', '9022', second.workedMethod]) assert.ok(p2.includes(token), `second prompt includes ${token}`);
  assert.notEqual(p1, p2);
});

test('server explanation cache keys vary by owner, model, question, attempt and worked method', () => {
  const base = { ownerId: 'primary', model: aiLogic.DEFAULT_MODEL, question: { q: '47 × 8', a: 376, ty: 366, sk: 'mul', workedMethod: '47×8' } };
  const key = aiLogic.explanationCacheKey(base);
  assert.equal(aiLogic.explanationCacheKey(base), key, 'exact same input has a stable cache key');
  assert.notEqual(aiLogic.explanationCacheKey({ ...base, ownerId: 'sister' }), key);
  assert.notEqual(aiLogic.explanationCacheKey({ ...base, model: 'gemini-3.5-flash-lite', question: { ...base.question, q: '93 × 97' } }), key);
  assert.notEqual(aiLogic.explanationCacheKey({ ...base, question: { ...base.question, ty: 377 } }), key);
  assert.notEqual(aiLogic.explanationCacheKey({ ...base, question: { ...base.question, workedMethod: 'different solution' } }), key);
});

test('local AI Method fallback is explicitly local and changes with the exact problem', () => {
  const one = aiLogic.generateLocalFallback({ action: 'explain', question: {
    q: '47 × 8', a: 376, ty: 366, sk: 'mul', workedMethod: '47 × 8 = 47 × (4 × 2) = 188 × 2 = 376',
  } });
  const two = aiLogic.generateLocalFallback({ action: 'explain', question: {
    q: '93 × 97', a: 9021, ty: 9022, sk: 'mul', workedMethod: '93 × 97 = 9300 − 279 = 9021',
  } });
  assert.match(one, /Gemini unavailable/);
  assert.match(one, /47 × 8/);
  assert.match(two, /93 × 97/);
  assert.notEqual(one, two);
  assert.ok(!one.includes('break it into round numbers'));
});

test('repeat analyses are not served from the exact-question cache and receive prior output context', async () => {
  mockGemini();
  aiLogic.resetQuotaTracking();
  const first = await post({ action: 'analyze', summary, forceRefresh: true });
  const firstData = await first.json();
  assert.equal(firstData.source, 'gemini');
  const second = await post({ action: 'analyze', summary, previousResponse: firstData.text, forceRefresh: true });
  const secondData = await second.json();
  assert.equal(secondData.source, 'gemini');
  assert.equal(requests.length, 2, 'both analysis requests reached Gemini');
  assert.match(requests[1].prompt, /PREVIOUS OUTPUT TO AVOID REPEATING/);
  assert.ok(requests[1].prompt.includes(firstData.text));
  assert.notEqual(firstData.text, secondData.text);
});

test('server caches only an exact Gemini explanation; a different question calls Gemini again', async () => {
  mockGemini();
  aiLogic.resetQuotaTracking();
  const q1 = { q: '47 × 8', a: 376, ty: 366, sk: 'mul', d: 4, pt: 'two digit × one digit', workedMethod: '47 × 8 = 376' };
  const q2 = { q: '93 × 97', a: 9021, ty: 9022, sk: 'mul', d: 7, pt: 'near 100', workedMethod: '93 × 97 = 9021' };
  const one = await (await post({ action: 'explain', summary, question: q1 })).json();
  const oneCached = await (await post({ action: 'explain', summary, question: q1 })).json();
  const two = await (await post({ action: 'explain', summary, question: q2 })).json();
  assert.equal(one.source, 'gemini');
  assert.equal(oneCached.cached, true);
  assert.equal(two.source, 'gemini');
  assert.equal(requests.length, 2, 'same exact question uses cache; a different question is generated afresh');
  assert.match(requests[0].prompt, /47 × 8/);
  assert.match(requests[1].prompt, /93 × 97/);
});

test('fresh coach prompts include a previous response without pretending unchanged data changed', () => {
  const old = 'Previously identified multiplication as the weakest skill.';
  const prompt = aiLogic.buildPrompt({ action: 'analyze', summary, previousResponse: old });
  assert.ok(prompt.includes(old));
  assert.match(prompt, /Do not manufacture a new finding/);
});

test('Gemini safety blocks are not replaced with canned text and mislabelled as Gemini answers', async () => {
  aiLogic.resetQuotaTracking();
  const safetyFetch = async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
  await assert.rejects(
    () => aiLogic.callGeminiFreeApi({ apiKey: 'test', model: aiLogic.DEFAULT_MODEL, prompt: 'test', fetchFn: safetyFetch }),
    /filtered this response for safety/i,
  );
});

test('default model is preferred and only explicitly free Standard Flash models are allowed', () => {
  assert.equal(aiLogic.DEFAULT_MODEL, 'gemini-3.5-flash-lite');
  assert.deepEqual(aiLogic.FREE_MODELS, ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);
  for (const model of aiLogic.FREE_MODELS) assert.equal(aiLogic.validateModel(model), model);
  assert.throws(() => aiLogic.validateModel('gemini-2.5-flash'), /not allowed/i);
  assert.throws(() => aiLogic.validateModel('gemini-3.1-pro-preview'), /not allowed/i);
});

test.after(() => { globalThis.fetch = originalFetch; });


test('Gemini 3.8 requests omit unsupported temperature and topP sampling fields', async () => {
  aiLogic.resetQuotaTracking();
  let sent;
  const captureFetch = async (_url, init) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Specific answer' }] } }] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  await aiLogic.callGeminiFreeApi({ apiKey: 'test', model: aiLogic.DEFAULT_MODEL, prompt: 'Explain 93 × 97 specifically.', fetchFn: captureFetch });
  assert.deepEqual(sent.generationConfig, { maxOutputTokens: aiLogic.QUOTA_LIMITS.MAX_OUTPUT_TOKENS });
  assert.equal('temperature' in sent.generationConfig, false);
  assert.equal('topP' in sent.generationConfig, false);
  assert.equal('topK' in sent.generationConfig, false);
});
