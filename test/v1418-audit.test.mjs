// 14.18 audit fixes: cached Gemini answers survive offline / exhausted quota, money is not eaten by the LaTeX tidy-up,
// the AI Method title is not double-escaped, and the skill AI is reachable from Home as well as Progress.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const store = {};
globalThis.localStorage = new Proxy(store, {
  get: (t, k) => (k === 'removeItem' ? (key) => delete t[key] : k === 'getItem' ? (key) => t[key] ?? null : t[k]),
  set: (t, k, v) => ((t[k] = String(v)), true),
  deleteProperty: (t, k) => (delete t[k], true),
});
globalThis.addEventListener = () => {};
globalThis.document = { addEventListener() {}, hidden: false, querySelector: () => null, querySelectorAll: () => [] };
const setOnline = (v) => Object.defineProperty(globalThis, 'navigator', { value: { onLine: v }, configurable: true, writable: true });

const ai = await import('../public/js/ai.js');
const { cleanReply } = await import('../netlify/lib/ailogic.mjs');
const rd = (f) => fs.readFileSync(new URL('../public/js/' + f, import.meta.url), 'utf8');

test('a saved Gemini answer is served offline and when the daily budget is used up; Regenerate still bypasses it', async () => {
  store['mmTrainer.sync'] = 'personal-device-secret';
  setOnline(true);
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ ok: true, source: 'gemini', text: 'Gemini read of Division', model: 'gemini-3.5-flash-lite' }), { status: 200, headers: { 'content-type': 'application/json' } }); };
  try {
    const context = { skill: 'Division', rating: 400, items: [] };
    const first = await ai.callAi({ action: 'skill', context });
    assert.equal(first.source, 'gemini'); assert.equal(calls, 1);

    setOnline(false);
    const offline = await ai.callAi({ action: 'skill', context });
    assert.equal(offline.source, 'gemini'); assert.equal(offline.cached, true); assert.equal(offline.text, 'Gemini read of Division');
    assert.equal(calls, 1, 'no request while offline');

    setOnline(true);
    ai.aiQuota.isExhausted = true; ai.aiQuota.resetAt = Date.now() + 3600e3;
    const exhausted = await ai.callAi({ action: 'skill', context });
    assert.equal(exhausted.cached, true); assert.equal(calls, 1, 'no request when the budget is known to be used up');

    // different data -> not a cache hit -> honest local fallback with the learner's own numbers
    const other = await ai.callAi({ action: 'skill', context: { skill: 'Addition', rating: 520, accuracyPct: 90 } });
    assert.equal(other.source, 'local'); assert.equal(other.quotaExhausted, true); assert.match(other.text, /Addition/);

    // Regenerate (forceRefresh) never serves the cache while offline
    ai.aiQuota.isExhausted = false; ai.aiQuota.resetAt = 0; setOnline(false);
    const forced = await ai.callAi({ action: 'skill', context, forceRefresh: true });
    assert.equal(forced.source, 'local'); assert.equal(forced.offline, true);
  } finally {
    globalThis.fetch = realFetch; ai.aiQuota.isExhausted = false; ai.aiQuota.resetAt = 0; setOnline(true); delete store['mmTrainer.sync'];
  }
});

test('LaTeX tidy-up converts maths but leaves money alone', () => {
  assert.equal(cleanReply('So $9 \\times 20$ is 180.'), 'So 9 × 20 is 180.');
  assert.equal(cleanReply('It costs $5 and $6 in total.'), 'It costs $5 and $6 in total.');
  assert.equal(cleanReply('20% of $80 is $16.'), '20% of $80 is $16.');
  assert.equal(cleanReply('Square: $10^2 = 100$.'), 'Square: 10^2 = 100.');
});

test('AI Method sheet: title escaped once, with Regenerate and follow-up like every other sheet', () => {
  const src = rd('ai.js');
  const fn = src.slice(src.indexOf('export async function showAiExplanation'), src.indexOf('A.aiExplain ='));
  assert.ok(fn.includes('title: `AI Method: ${q} = ${a}`'), 'raw title; dialog() escapes it');
  assert.ok(!/title:[^\n]*esc\(/.test(fn));
  assert.match(fn, /Regenerate/); assert.match(fn, /Ask a follow-up/); assert.match(fn, /forceRefresh: force/);
});

test('sheet action buttons are offered on local fallbacks too', () => {
  assert.ok(rd('ai.js').includes('const items = extra ? extra(res) || [] : [];'));
});

test('skill AI is reachable from Home skill cards and Progress rows through one shared builder', () => {
  const home = rd('views/home.js'), prog = rd('views/progress.js'), mod = rd('skillAi.js'), sw = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.match(home, /import \{ askSkillAi \} from '\.\.\/skillAi\.js'/);
  assert.match(home, /value: 'ai'/); assert.match(home, /v == 'ai'\) askSkillAi\(k\)/);
  assert.match(prog, /A\.aiSkill = \(d\) => askSkillAi\(d\.v\);/);
  assert.match(mod, /export function skillAiContext/); assert.match(mod, /action: 'skill'/);
  assert.match(sw, /js\/skillAi\.js/);
});
