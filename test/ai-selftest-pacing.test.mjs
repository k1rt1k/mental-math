// The AI self-test shares the app's 12 RPM-per-model rule through ModelPacer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ModelPacer } from '../tools/ai-pacing.mjs';

const clock = (start = 0) => { let t = start; return { now: () => t, advance: (ms) => (t += ms) }; };

test('counts every attempt, separately for each model', async () => {
  const pacer = new ModelPacer({ limit: 2, enabled: false });
  await pacer.acquire('a'); await pacer.acquire('b'); await pacer.acquire('a');
  assert.equal(pacer.count('a'), 2);
  assert.equal(pacer.count('b'), 1);
  assert.equal(pacer.total, 3, 'the report counts all generation attempts');
});

test('the request after the cap waits until the oldest one leaves the rolling window', async () => {
  const c = clock(), waits = [];
  const pacer = new ModelPacer({
    limit: 2, windowMs: 1000, now: c.now,
    sleep: async (ms) => { waits.push(ms); c.advance(ms); },
  });
  await pacer.acquire('m'); await pacer.acquire('m');
  assert.deepEqual(waits, [], 'the first two requests go straight through');
  await pacer.acquire('m');
  assert.deepEqual(waits, [1100], 'waits for the first start to age out, plus the boundary guard');
  assert.equal(c.now(), 1100);
  assert.equal(pacer.count('m'), 3, 'the waiting request is counted');
});

test('each model has its own window', async () => {
  const c = clock(), waits = [];
  const pacer = new ModelPacer({
    limit: 1, windowMs: 1000, now: c.now,
    sleep: async (ms) => { waits.push(ms); c.advance(ms); },
  });
  await pacer.acquire('a');
  await pacer.acquire('b');
  assert.deepEqual(waits, [], 'a full window for a never delays b');
  await pacer.acquire('a');
  assert.equal(waits.length, 1);
});

test('a request is not delayed once the window has slid past older marks', async () => {
  const c = clock(), waits = [];
  const pacer = new ModelPacer({
    limit: 2, windowMs: 1000, now: c.now,
    sleep: async (ms) => { waits.push(ms); c.advance(ms); },
  });
  await pacer.acquire('m');
  c.advance(600);
  await pacer.acquire('m');
  c.advance(500);                       // t = 1100, the first mark is outside the window
  await pacer.acquire('m');
  assert.deepEqual(waits, []);
});

test('mock mode counts requests without waiting', async () => {
  const c = clock(), waits = [];
  const pacer = new ModelPacer({ limit: 1, windowMs: 1000, now: c.now, enabled: false, sleep: async (ms) => { waits.push(ms); c.advance(ms); } });
  await pacer.acquire('m'); await pacer.acquire('m'); await pacer.acquire('m');
  assert.deepEqual(waits, []);
  assert.equal(pacer.count('m'), 3);
});

test('the live self-test routes regular, probe and latency calls through the pacer', () => {
  const src = readFileSync(new URL('../tools/ai-selftest.mjs', import.meta.url), 'utf8');
  assert.equal((src.match(/await pacer\.acquire\(model\)/g) || []).length, 3, 'regular cases, thinking probe, latency runs');
  assert.match(src, /new ModelPacer\(\{[\s\S]*limit: RPM_LIMIT/);
  assert.match(src, /--actions=/);
  assert.match(src, /19 regular action cases per model/);
  assert.doesNotMatch(src, /setTimeout\(res,\s*(1200|1500)\)/, 'fixed delays no longer stand in for pacing');
});
