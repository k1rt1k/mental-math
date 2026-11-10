// v14.3: one learner per device; personal sync password identifies each cloud/AI owner.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VERSION as REL, CACHE } from './helpers/version.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const localStorageStore = {};
globalThis.localStorage = new Proxy(localStorageStore, {
  get: (t, k) => {
    if (k === 'removeItem') return (x) => delete t[x];
    if (k === 'getItem') return (x) => t[x] ?? null;
    return t[k];
  },
  set: (t, k, v) => ((t[k] = String(v)), true),
  deleteProperty: (t, k) => (delete t[k], true),
});
globalThis.addEventListener = () => {};
globalThis.document = {
  addEventListener() {}, hidden: false,
  querySelector: () => null, querySelectorAll: () => [],
};

// AI authentication uses a lightweight shared auth module; no push package is needed here.
process.env.SYNC_KEY = 'primary-test-sync-secret';
process.env.SYNC_KEY_SISTER = 'sister-test-sync-secret';
delete process.env.GEMINI_API_KEY;

const {
  FREE_MODELS, DEFAULT_MODEL, validateModel, getQuotaStatus,
  recordQuotaExhaustion, checkRateAndQuota, buildPrompt,
  generateLocalFallback, setCache, getCache, callGeminiFreeApi,
  resetQuotaTracking,
} = await import('../netlify/lib/ailogic.mjs');
const aiHandler = (await import('../netlify/functions/ai.mjs')).default;
const ai = await import('../public/js/ai.js');
const state = await import('../public/js/state.js');
const sync = await import('../public/js/sync.js');
const { VERSION } = await import('../public/js/util.js');

const postAi = (key, body, extraHeaders = {}) => aiHandler(new Request('https://mentalmath.test/api/ai', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(key ? { 'x-sync-key': key } : {}), ...extraHeaders },
  body: JSON.stringify(body || {}),
}));

test('version and service-worker cache are aligned with the VERSION file', () => {
  assert.equal(VERSION, REL);
  const sw = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes(CACHE));
});

test('legacy User 2 selection migrates its state to the single canonical device slot without deleting the old data', () => {
  const storage = {
    'mmTrainer.v1': JSON.stringify({ marker: 'former-user-1', sessions: [{ t: 1 }] }),
    'mmTrainer.v1.user_2': JSON.stringify({ marker: 'selected-user-2', sessions: [{ t: 2 }] }),
    'mmTrainer.activeUser': '2',
  };
  assert.equal(state.migrateLegacySingleUser(storage, '2'), true);
  assert.equal(JSON.parse(storage['mmTrainer.v1']).marker, 'selected-user-2');
  assert.equal(JSON.parse(storage['mmTrainer.legacy.profile1.state']).marker, 'former-user-1');
  assert.equal(JSON.parse(storage['mmTrainer.v1.user_2']).marker, 'selected-user-2');
  assert.equal(storage['mmTrainer.activeUser'], undefined);
  assert.equal(state.migrateLegacySingleUser(storage, '2'), false, 'migration runs only once');
});

test('if legacy User 2 was selected but had no state, do not inherit User 1 data', () => {
  const storage = { 'mmTrainer.v1': JSON.stringify({ marker: 'former-user-1' }) };
  state.migrateLegacySingleUser(storage, '2');
  assert.deepEqual(JSON.parse(storage['mmTrainer.v1']), {});
  assert.equal(JSON.parse(storage['mmTrainer.legacy.profile1.state']).marker, 'former-user-1');
});

test('legacy sync password migration follows the selected learner and preserves the other key in an archive', () => {
  const storage = { 'mmTrainer.sync': 'primary-key', 'mmTrainer.sync.user_2': 'sister-key' };
  assert.equal(sync.migrateLegacySyncKey(storage, '2'), true);
  assert.equal(storage['mmTrainer.sync'], 'sister-key');
  assert.equal(storage['mmTrainer.legacy.sync.profile1'], 'primary-key');
  assert.equal(sync.migrateLegacySyncKey(storage, '2'), false);
  assert.equal(sync.syncStorageKey(), 'mmTrainer.sync');
});

test('legacy AI history migrates from only the selected learner to one device-local coach', () => {
  const storage = {
    'mmTrainer.ai_1_chat': JSON.stringify([{ role: 'user', text: 'profile 1' }]),
    'mmTrainer.ai_2_chat': JSON.stringify([{ role: 'user', text: 'profile 2' }]),
    'mmTrainer.ai_2_analysis': 'profile 2 analysis',
  };
  ai.migrateLegacyAiData(storage, '2');
  assert.deepEqual(JSON.parse(storage['mmTrainer.ai.chat']), [{ role: 'user', text: 'profile 2' }]);
  assert.equal(storage['mmTrainer.ai.analysis'], 'profile 2 analysis');
  assert.equal(storage['mmTrainer.ai_1_chat'].includes('profile 1'), true, 'other legacy history remains recoverable');
});

test('the visible application no longer offers in-app User 1 / User 2 switching', () => {
  const coach = fs.readFileSync(new URL('../public/js/views/coach.js', import.meta.url), 'utf8');
  const settings = fs.readFileSync(new URL('../public/js/views/settings.js', import.meta.url), 'utf8');
  const main = fs.readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8');
  for (const source of [coach, settings, main]) {
    assert.doesNotMatch(source, /switchProf|renameProf|Active Profile|Select User Profile/);
  }
  assert.match(settings, /personal sync password/i);
});

test('one device has one AI history, analysis, plan and explanation cache', () => {
  for (const key of Object.keys(localStorageStore)) delete localStorageStore[key];
  ai.saveChatHistory([{ role: 'user', text: 'hello from this device' }]);
  ai.setSavedAnalysis('My analysis');
  ai.setSavedPlan('My plan');
  ai.setCachedExplanation('19 × 7', '133');
  assert.equal(ai.getChatHistory()[0].text, 'hello from this device');
  assert.equal(ai.getSavedAnalysis(), 'My analysis');
  assert.equal(ai.getSavedPlan(), 'My plan');
  assert.equal(ai.getCachedExplanation('19 × 7').text, '133');
});

test('getChatHistory returns an array even when the stored value is corrupt', () => {
  localStorageStore['mmTrainer.ai.chat'] = JSON.stringify({ not: 'an array' });
  assert.deepEqual(ai.getChatHistory(), []);
  localStorageStore['mmTrainer.ai.chat'] = 'not json';
  assert.deepEqual(ai.getChatHistory(), []);
  delete localStorageStore['mmTrainer.ai.chat'];
});

test('only eligible configured Gemini models pass the free-model allow-list', () => {
  assert.ok(Array.isArray(FREE_MODELS) && FREE_MODELS.length > 0);
  assert.equal(validateModel(DEFAULT_MODEL), DEFAULT_MODEL);
  for (const model of ['gemini-1.5-pro', 'gemini-2.5-pro', 'gemini-pro', 'gemini-ultra', 'gpt-4o']) {
    assert.throws(() => validateModel(model), /not allowed|not eligible/i);
  }
});

test('free-tier quota guard records exhaustion and blocks additional requests', () => {
  resetQuotaTracking();
  assert.equal(getQuotaStatus().freeTierOnly, true);
  recordQuotaExhaustion(3600000);
  assert.equal(getQuotaStatus().isExhausted, true);
  assert.throws(() => checkRateAndQuota(), (err) => err.status === 429 && err.quotaExhausted === true);
  resetQuotaTracking();
});

test('server-side cache can store and retrieve a result', () => {
  setCache('v141-cache-test', 'cached response');
  assert.equal(getCache('v141-cache-test'), 'cached response');
  assert.equal(getCache('v141-not-found'), null);
});

test('compact performance summary contains no account credentials and prompts stay bounded', () => {
  state.replaceState(state.fresh());
  state.S.sessions = [
    { t: Date.now() - 3600000, m: 'train', dur: 120, n: 25, ok: 23, pts: 350, tm: 2.1 },
    { t: Date.now(), m: 'train', dur: 120, n: 28, ok: 27, pts: 420, tm: 1.9 },
  ];
  const summary = ai.buildCompactSummary(state.S);
  assert.equal(summary.sessionsCount, 2);
  assert.equal(summary.totalAnswers, 53);
  assert.ok(summary.accuracy >= 90);
  const prompt = buildPrompt({ action: 'coach', summary });
  assert.ok(prompt.length > 50 && prompt.length < 8000);
  assert.doesNotMatch(prompt, /sync password|api key|email|ip address/i);
});

test('AI endpoint rejects missing and invalid personal sync passwords', async () => {
  const missing = await postAi('', { action: 'coach' });
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).authRequired, true);
  const invalid = await postAi('not-a-valid-key', { action: 'coach' });
  assert.equal(invalid.status, 401);
});

test('AI endpoint derives owner identity from the validated sync password, not client input', async () => {
  const primary = await postAi('primary-test-sync-secret', { action: 'coach', user: 'sister' });
  assert.equal(primary.status, 200);
  const p = await primary.json();
  assert.equal(p.user, 'primary');
  assert.equal(p.fallback, true, 'no server Gemini key means local fallback');

  const sister = await postAi('sister-test-sync-secret', { action: 'coach', user: 'primary' });
  assert.equal(sister.status, 200);
  const s = await sister.json();
  assert.equal(s.user, 'sister');
});

test('client-provided Gemini keys are ignored by the server', async () => {
  const response = await postAi('primary-test-sync-secret', { action: 'coach' }, { 'x-gemini-key': 'must-not-be-used' });
  const data = await response.json();
  assert.equal(data.unconfigured, true);
  assert.equal(data.fallback, true);
});

test('AI endpoint still rejects disallowed paid models after authentication', async () => {
  const response = await postAi('primary-test-sync-secret', { model: 'gemini-1.5-pro' });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).freeTierViolation, true);
});

test('AI client attaches this device personal sync password and returns server response', async () => {
  localStorageStore['mmTrainer.sync'] = 'primary-test-sync-secret';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/ai');
    assert.equal(init.headers['x-sync-key'], 'primary-test-sync-secret');
    return new Response(JSON.stringify({ ok: true, text: 'Personalized response', model: DEFAULT_MODEL }), { status: 200 });
  };
  try {
    const result = await ai.callAi({ action: 'chat', message: 'How do I calculate faster?' });
    assert.equal(result.text, 'Personalized response');
  } finally {
    globalThis.fetch = originalFetch;
    delete localStorageStore['mmTrainer.sync'];
  }
});

test('client uses a clear setup fallback when this device has no personal sync password', async () => {
  delete localStorageStore['mmTrainer.sync'];
  const result = await ai.callAi({ action: 'coach' });
  assert.equal(result.authRequired, true);
  assert.match(result.text, /personal sync password/i);
});

test('offline fallbacks work for coach, analysis, explanation, recommendation, plan and tutor', () => {
  const summary = { avgRating: 720, accuracy: 92, sessionsCount: 15, avgSpeed: '1.9', weaknesses: 'Two-digit multiplication' };
  for (const action of ['coach', 'analyze', 'recommend', 'plan']) {
    assert.ok(generateLocalFallback({ action, summary }).length > 40);
  }
  assert.ok(generateLocalFallback({ action: 'explain', question: { q: '47 × 8', a: 376, ty: 366, sk: 'mul' } }).includes('47 × 8'));
  assert.ok(generateLocalFallback({ action: 'chat', message: 'How do I multiply by 11?' }).includes('11'));
});

test('Gemini response parser concatenates parts and propagates quota exhaustion', async () => {
  const success = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Part 1. ' }, { text: 'Part 2.' }] } }] }) });
  assert.equal(await callGeminiFreeApi({ apiKey: 'mock-key', model: DEFAULT_MODEL, prompt: 'test', fetchFn: success }), 'Part 1. Part 2.');
  const exhausted = async () => ({ ok: false, status: 429, text: async () => 'Resource exhausted' });
  await assert.rejects(() => callGeminiFreeApi({ apiKey: 'mock-key', model: DEFAULT_MODEL, prompt: 'test', fetchFn: exhausted }), (err) => err.status === 429 && err.providerRateLimited === true);
});
