// Sample mode can use Gemini without a sync password, under its own small per-address and all-visitor daily allowance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDemoRequest, takeDemoCall, setDemoStoreForTests, DEMO_LIMIT, demoLimitText } from '../netlify/lib/demo-gate.mjs';

const mem = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, setJSON: async (k, v) => { m.set(k, v); } }; };
const req = (h = {}) => new Request('https://x.test/api/ai', { method: 'POST', headers: h });

test('only a keyless request that says it is sample mode counts as one', () => {
  assert.equal(isDemoRequest(req({ 'x-mental-math-demo': '1' })), true);
  assert.equal(isDemoRequest(req({ 'x-mental-math-demo': '1', 'x-sync-key': 'wrong-key-1234' })), false, 'a wrong key is never promoted to sample mode');
  assert.equal(isDemoRequest(req({})), false);
});

test('each address gets DEMO_PER_IP calls a day, then the local guide', async () => {
  setDemoStoreForTests(mem());
  const r = () => req({ 'x-mental-math-demo': '1', 'x-nf-client-connection-ip': '1.1.1.1' });
  for (let i = 0; i < DEMO_LIMIT.DEMO_PER_IP; i++) assert.equal((await takeDemoCall(r())).ok, true);
  assert.deepEqual(await takeDemoCall(r()), { ok: false, why: 'ip' });
  assert.equal((await takeDemoCall(req({ 'x-nf-client-connection-ip': '2.2.2.2' }))).ok, true, 'another address is unaffected');
});

test('all visitors together stop at DEMO_GLOBAL, and a broken store fails closed', async () => {
  setDemoStoreForTests(mem());
  for (let i = 0; i < DEMO_LIMIT.DEMO_GLOBAL; i++) assert.equal((await takeDemoCall(req({ 'x-nf-client-connection-ip': 'ip' + i }))).ok, true);
  assert.deepEqual(await takeDemoCall(req({ 'x-nf-client-connection-ip': 'fresh' })), { ok: false, why: 'global' });
  setDemoStoreForTests({ get: async () => { throw new Error('down'); }, setJSON: async () => {} });
  assert.deepEqual(await takeDemoCall(req()), { ok: false, why: 'store' });
  assert.match(demoLimitText('store'), /local guide/);
  setDemoStoreForTests(null);
});

test('the function and the client are wired to it', () => {
  const fn = readFileSync(new URL('../netlify/functions/ai.mjs', import.meta.url), 'utf8');
  assert.match(fn, /const demo = isDemoRequest\(req\);/);
  assert.ok(fn.indexOf('takeDemoCall(req)') > fn.indexOf('if (cacheKey) {'), 'a cached answer costs no allowance');
  assert.ok(fn.indexOf('takeDemoCall(req)') < fn.indexOf('callGeminiFreeApiWithMeta({'), 'charged before Gemini is called');
});
