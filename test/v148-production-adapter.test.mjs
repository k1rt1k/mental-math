// v14.8 production wiring regressions: real Netlify Blobs API signature and deployed version.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import aiHandler from '../netlify/functions/ai.mjs';

test('Netlify Blobs store is opened with the documented positional store-name argument', async () => {
  const source = await readFile(new URL('../netlify/lib/ai-quota.mjs', import.meta.url), 'utf8');
  assert.match(source, /return getStore\(STORE_NAME\);/);
  assert.doesNotMatch(source, /getStore\(\s*\{\s*name\s*:/);
  assert.match(source, /getWithMetadata\(key,\s*\{\s*consistency:\s*'strong'/);
});

test('AI status endpoint exposes a deployment fingerprint and exact live safety policy', async () => {
  const response = await aiHandler(new Request('https://mentalmath.test/api/ai', { method: 'GET' }));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.buildVersion, '14.48');
  assert.equal(response.headers.get('x-mental-math-ai-version'), '14.48');
  assert.equal(data.defaultModel, 'gemini-3.5-flash-lite');
  assert.deepEqual(data.models, ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);
  assert.deepEqual(data.budgetPolicy, {
    dailyShared: 300,
    perModelRollingMinute: 12,
    models: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
  });
});

test('quota adapter requests the exact site-wide Netlify Blobs store name', async () => {
  const quota = await import('../netlify/lib/ai-quota.mjs');
  let receivedName = null;
  const fakeStore = {
    async getWithMetadata() { return null; },
    async setJSON(_key, _value, options) {
      assert.equal(options.onlyIfNew, true);
      return { modified: true, etag: 'test-etag' };
    },
  };
  quota.setAiQuotaStoreForTests(null);
  quota.setAiQuotaStoreFactoryForTests((name) => { receivedName = name; return fakeStore; });
  try {
    const reservation = await quota.reserveAiRequest({ model: 'gemini-3.1-flash-lite', now: Date.parse('2026-11-06T12:00:00Z') });
    assert.equal(receivedName, 'mental-math-ai-budget');
    assert.equal(reservation.model, 'gemini-3.1-flash-lite');
  } finally {
    quota.setAiQuotaStoreFactoryForTests(null);
    quota.setAiQuotaStoreForTests(null);
  }
});
