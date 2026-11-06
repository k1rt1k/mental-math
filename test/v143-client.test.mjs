// Client AI regression: local fallback responses must never enter the Gemini cache.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = {};
globalThis.localStorage = new Proxy(store, {
  get: (t, k) => {
    if (k === 'removeItem') return (key) => delete t[key];
    if (k === 'getItem') return (key) => t[key] ?? null;
    return t[k];
  },
  set: (t, k, v) => ((t[k] = String(v)), true),
  deleteProperty: (t, k) => (delete t[k], true),
});
globalThis.addEventListener = () => {};
globalThis.document = { addEventListener() {}, hidden: false, querySelector: () => null, querySelectorAll: () => [] };

const ai = await import('../public/js/ai.js');

 test('client never caches a local fallback as a Gemini explanation', async () => {
  store['mmTrainer.sync'] = 'personal-device-secret';
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const payload = JSON.parse(init.body);
    assert.equal(payload.action, 'explain');
    assert.ok(payload.question.q);
    return new Response(JSON.stringify({
      ok: true,
      source: 'local',
      fallback: true,
      text: `Local guide for ${payload.question.q}`,
      message: 'Gemini quota unavailable',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const question = { q: '47 × 8', a: 376, ty: 366, sk: 'mul', d: 4 };
    const first = await ai.callAi({ action: 'explain', question });
    const second = await ai.callAi({ action: 'explain', question });
    assert.equal(first.source, 'local');
    assert.equal(second.source, 'local');
    assert.equal(calls, 2, 'local fallback is fetched again, never returned from Gemini cache');
    assert.equal(ai.getCachedExplanation({ ...question, workedMethod: '47 × 8 = 376' }), null);
  } finally {
    globalThis.fetch = originalFetch;
    delete store['mmTrainer.sync'];
  }
});
