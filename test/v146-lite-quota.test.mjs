// v14.8: independent per-model RPM budgets with a shared daily cap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setAiQuotaStoreForTests, reserveAiRequest, getAiBudgetStatus } from '../netlify/lib/ai-quota.mjs';

function createStore() {
  const data = new Map(); let version = 0;
  return {
    data,
    async getWithMetadata(key) {
      const hit = data.get(key);
      return hit ? { data: structuredClone(hit.value), etag: hit.etag } : null;
    },
    async setJSON(key, value, options = {}) {
      const hit = data.get(key);
      if (options.onlyIfNew && hit) return { modified: false };
      if (options.onlyIfMatch && (!hit || hit.etag !== options.onlyIfMatch)) return { modified: false };
      const etag = `etag-${++version}`;
      data.set(key, { value: structuredClone(value), etag });
      return { modified: true, etag };
    },
  };
}

const base = Date.parse('2026-11-06T10:00:00.000Z');

test('Flash-Lite configuration uses 3.5 primary and 3.1 backup only', async () => {
  const logic = await import('../netlify/lib/ailogic.mjs');
  assert.equal(logic.DEFAULT_MODEL, 'gemini-3.5-flash-lite');
  assert.deepEqual(logic.FREE_MODELS, ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);
  for (const id of logic.FREE_MODELS) assert.equal(logic.validateModel(id), id);
  for (const id of ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-2.5-flash']) {
    assert.throws(() => logic.validateModel(id), /not allowed/i);
  }
});

test('daily safety budget is shared, persistent and capped at 300 upstream attempts', async () => {
  const store = createStore(); setAiQuotaStoreForTests(store);
  for (let i = 0; i < 300; i++) await reserveAiRequest({ now: base + i * 61_000 });
  const status = await getAiBudgetStatus({ now: base + 300 * 61_000 });
  assert.equal(status.available, true);
  assert.equal(status.usedToday, 300);
  assert.equal(status.remainingToday, 0);
  await assert.rejects(() => reserveAiRequest({ now: base + 300 * 61_000 }), (err) => err.dailyBudgetExhausted === true && err.status === 429);
});

test('each Flash-Lite model gets its own 12 RPM safety allowance', async () => {
  const store = createStore(); setAiQuotaStoreForTests(store);
  for (let i = 0; i < 12; i++) await reserveAiRequest({ model: 'gemini-3.1-flash-lite', now: base });
  await assert.rejects(() => reserveAiRequest({ model: 'gemini-3.1-flash-lite', now: base + 1 }), (err) => err.modelRateLimited === true && err.model === 'gemini-3.1-flash-lite' && err.retryAt > base);
  const backup = await reserveAiRequest({ model: 'gemini-3.5-flash-lite', now: base + 1 });
  assert.equal(backup.model, 'gemini-3.5-flash-lite');
  assert.equal(backup.modelRequestsLastMinute, 1);
});

test('concurrent reservations enforce 12 RPM independently for each model', async () => {
  const store = createStore(); setAiQuotaStoreForTests(store);
  const results = await Promise.allSettled(Array.from({ length: 15 }, () => reserveAiRequest({ model: 'gemini-3.1-flash-lite', now: base })));
  const passed = results.filter((x) => x.status === 'fulfilled');
  const blocked = results.filter((x) => x.status === 'rejected');
  assert.equal(passed.length, 12);
  assert.equal(blocked.length, 3);
  const backupResults = await Promise.allSettled(Array.from({ length: 15 }, () => reserveAiRequest({ model: 'gemini-3.5-flash-lite', now: base })));
  assert.equal(backupResults.filter((x) => x.status === 'fulfilled').length, 12);
  const status = await getAiBudgetStatus({ now: base });
  assert.equal(status.usedToday, 24);
  assert.equal(status.perModel['gemini-3.1-flash-lite'].requestsLastMinute, 12);
  assert.equal(status.perModel['gemini-3.5-flash-lite'].requestsLastMinute, 12);
});

test('daily budget remains shared across both models', async () => {
  const store = createStore(); setAiQuotaStoreForTests(store);
  for (let i = 0; i < 300; i++) await reserveAiRequest({ model: i % 2 ? 'gemini-3.1-flash-lite' : 'gemini-3.5-flash-lite', now: base + i * 61_000 });
  const status = await getAiBudgetStatus({ now: base + 300 * 61_000 });
  assert.equal(status.usedToday, 300);
  await assert.rejects(() => reserveAiRequest({ model: 'gemini-3.1-flash-lite', now: base + 300 * 61_000 }), (err) => err.dailyBudgetExhausted === true);
});

test('budget storage failure fails closed instead of calling Gemini unmetered', async () => {
  setAiQuotaStoreForTests({
    async getWithMetadata() { throw new Error('storage down'); },
    async setJSON() { throw new Error('storage down'); },
  });
  await assert.rejects(() => reserveAiRequest({ now: base }), (err) => err.budgetStoreUnavailable === true && err.status === 503);
});


test('when primary app-side RPM cap is reached, request can use backup model allowance', async () => {
  const store = createStore(); setAiQuotaStoreForTests(store);
  for (let i = 0; i < 12; i++) await reserveAiRequest({ model: 'gemini-3.1-flash-lite', now: base });
  const logic = await import('../netlify/lib/ailogic.mjs');
  const seen = [];
  const result = await logic.callGeminiFreeApiWithMeta({
    apiKey: 'mock-key', model: 'gemini-3.1-flash-lite', prompt: 'Explain 98 × 97.',
    sleepFn: async () => {}, nowFn: () => Date.now(),
    reserveQuota: (model) => reserveAiRequest({ model, now: base + 100 }),
    fetchFn: async (url) => {
      const model = String(url).match(/models\/([^:]+)/)?.[1]; seen.push(model);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '98 × 97 = 9506.' }] } }] }), { status: 200 });
    },
  });
  assert.deepEqual(seen, ['gemini-3.5-flash-lite']);
  assert.equal(result.model, 'gemini-3.5-flash-lite');
  assert.equal(result.failover, true);
});
