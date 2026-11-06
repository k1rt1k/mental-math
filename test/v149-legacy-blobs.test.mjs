import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveAiRequest, setAiQuotaStoreForTests } from '../netlify/lib/ai-quota.mjs';

// Old @netlify/blobs (8.x) ignores onlyIf* and returns void from setJSON.
test('void-returning setJSON counts as exactly one reservation', async () => {
  const data = new Map();
  setAiQuotaStoreForTests({
    async getWithMetadata(k) { const v = data.get(k); return v ? { data: structuredClone(v), etag: 'x' } : null; },
    async setJSON(k, v) { data.set(k, structuredClone(v)); },
  });
  const r = await reserveAiRequest({ model: 'gemini-3.1-flash-lite', now: Date.now() });
  assert.equal(r.usedToday, 1);
  assert.equal(r.modelRequestsLastMinute, 1);
  setAiQuotaStoreForTests(null);
});
