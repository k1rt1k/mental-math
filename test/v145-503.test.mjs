// v14.8: Flash-Lite primary/backup model chain and truthful diagnostics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setAiQuotaStoreForTests } from '../netlify/lib/ai-quota.mjs';

const quotaData = new Map();
let quotaEtag = 0;
const quotaStore = {
  async getWithMetadata(key) { const hit = quotaData.get(key); return hit ? { data: structuredClone(hit.value), etag: hit.etag } : null; },
  async setJSON(key, value, opts = {}) {
    const hit = quotaData.get(key);
    if (opts.onlyIfNew && hit) return { modified: false };
    if (opts.onlyIfMatch && (!hit || hit.etag !== opts.onlyIfMatch)) return { modified: false };
    const etag = `q-${++quotaEtag}`; quotaData.set(key, { value: structuredClone(value), etag }); return { modified: true, etag };
  },
};
setAiQuotaStoreForTests(quotaStore);

process.env.SYNC_KEY = 'v145-test-sync-secret';
process.env.GEMINI_API_KEY = 'v145-test-gemini-key';
const ai = await import('../netlify/lib/ailogic.mjs');
const aiHandler = (await import('../netlify/functions/ai.mjs')).default;

const unavailable = (message = 'The model is temporarily overloaded.') => new Response(
  JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message } }),
  { status: 503, headers: { 'content-type': 'application/json' } },
);
const success = (text) => new Response(
  JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
  { status: 200, headers: { 'content-type': 'application/json' } },
);

const retryOptions = { sleepFn: async () => {}, nowFn: () => Date.now() };

test('transient 503 retries the preferred model, then fails over to a free Standard model', async () => {
  ai.resetQuotaTracking();
  const seen = [];
  const result = await ai.callGeminiFreeApiWithMeta({
    apiKey: 'mock-key', model: ai.DEFAULT_MODEL, prompt: 'Explain 93 × 97.',
    ...retryOptions,
    fetchFn: async (url) => {
      const model = String(url).match(/models\/([^:]+)/)?.[1];
      seen.push(model);
      if (seen.length === 1) return unavailable();
      return success('93 × 97 = 9021 using the exact near-100 method.');
    },
  });
  assert.deepEqual(seen, ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);
  assert.equal(result.model, 'gemini-3.1-flash-lite');
  assert.equal(result.failover, true);
  assert.match(result.text, /9021/);
  assert.equal(result.attempts, 2);
});

test('503 is not misclassified as exhausted quota; bounded two-model failover ends with a clear error', async () => {
  ai.resetQuotaTracking();
  const seen = [];
  await assert.rejects(
    () => ai.callGeminiFreeApiWithMeta({
      apiKey: 'mock-key', model: ai.DEFAULT_MODEL, prompt: 'test',
      ...retryOptions,
      fetchFn: async (url) => {
        const model = String(url).match(/models\/([^:]+)/)?.[1];
        seen.push(model);
        return unavailable('High demand. Try again later.');
      },
    }),
    (err) => {
      assert.equal(err.status, 503);
      assert.equal(err.quotaExhausted, undefined);
      assert.equal(err.attempts, 2);
      assert.match(err.message, /temporarily unavailable after 2 attempt/);
      assert.match(err.message, /High demand/);
      return true;
    },
  );
  assert.deepEqual(seen, ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);
});

test('a model-specific 429 tries the other free model once, without daily-locking the project', async () => {
  ai.resetQuotaTracking();
  const seen = [];
  const result = await ai.callGeminiFreeApiWithMeta({
    apiKey: 'mock-key', model: ai.DEFAULT_MODEL, prompt: 'test',
    ...retryOptions,
    fetchFn: async (url) => {
      const model = String(url).match(/models\/([^:]+)/)?.[1];
      seen.push(model);
      if (seen.length === 1) return new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Per-model requests per minute quota reached' } }), {
        status: 429, headers: { 'content-type': 'application/json' },
      });
      return success('Backup model answered.');
    },
  });
  assert.deepEqual(seen, ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);
  assert.equal(result.model, 'gemini-3.1-flash-lite');
  assert.equal(result.failover, true);
  assert.equal(ai.getQuotaStatus().isExhausted, false);
});

test('model-not-found errors skip the unavailable model and try the next free Standard model', async () => {
  ai.resetQuotaTracking();
  const seen = [];
  const result = await ai.callGeminiFreeApiWithMeta({
    apiKey: 'mock-key', model: ai.DEFAULT_MODEL, prompt: 'test',
    ...retryOptions,
    fetchFn: async (url) => {
      const model = String(url).match(/models\/([^:]+)/)?.[1];
      seen.push(model);
      if (model === 'gemini-3.5-flash-lite') {
        return new Response(JSON.stringify({ error: { message: 'Model not found' } }), {
          status: 404, headers: { 'content-type': 'application/json' },
        });
      }
      return success('Backup model response.');
    },
  });
  assert.deepEqual(seen, ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);
  assert.equal(result.model, 'gemini-3.1-flash-lite');
  assert.equal(result.failover, true);
});

test('AI endpoint reports the real fallback model and marks a successful response as Gemini', async () => {
  ai.resetQuotaTracking();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    if (calls === 1) return unavailable();
    const model = String(url).match(/models\/([^:]+)/)?.[1];
    assert.equal(model, 'gemini-3.1-flash-lite');
    return success('Specific answer from the backup model.');
  };
  try {
    const response = await aiHandler(new Request('https://mentalmath.test/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sync-key': process.env.SYNC_KEY },
      body: JSON.stringify({ action: 'chat', message: 'Explain 93 × 97', summary: {} }),
    }));
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.source, 'gemini');
    assert.equal(data.model, 'gemini-3.1-flash-lite');
    assert.equal(data.modelFailover, true);
    assert.match(data.message, /temporarily unavailable/);
    assert.match(data.text, /backup model/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('persistent provider 503 returns a truthful local fallback with the upstream status and attempts', async () => {
  ai.resetQuotaTracking();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => unavailable('Model capacity is temporarily exhausted.');
  try {
    const response = await aiHandler(new Request('https://mentalmath.test/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sync-key': process.env.SYNC_KEY },
      body: JSON.stringify({ action: 'chat', message: 'Teach me a shortcut for 93 × 97.', summary: {} }),
    }));
    const data = await response.json();
    assert.equal(response.status, 200, 'the app can still display a local fallback');
    assert.equal(data.source, 'local');
    assert.equal(data.providerStatus, 503);
    assert.equal(data.retryable, true);
    assert.equal(data.attempts, 2);
    assert.match(data.message, /temporarily unavailable \(HTTP 503\)/);
    assert.match(data.text, /93 × 97/);
  } finally {
    globalThis.fetch = originalFetch;
    ai.resetQuotaTracking();
  }
});

test('AI endpoint fails closed without calling Gemini if persistent budget storage is unavailable', async () => {
  setAiQuotaStoreForTests({
    async getWithMetadata() { throw new Error('simulated Blobs outage'); },
    async setJSON() { throw new Error('simulated Blobs outage'); },
  });
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => { upstreamCalls++; return success('must not be called'); };
  try {
    const response = await aiHandler(new Request('https://mentalmath.test/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sync-key': process.env.SYNC_KEY },
      body: JSON.stringify({ action: 'chat', message: 'test budget guard' }),
    }));
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.source, 'local');
    assert.equal(data.budgetStoreUnavailable, true);
    assert.equal(data.providerStatus, 503);
    assert.equal(upstreamCalls, 0, 'no Gemini request is sent without a verified budget reservation');
  } finally {
    globalThis.fetch = originalFetch;
    setAiQuotaStoreForTests(quotaStore);
  }
});
