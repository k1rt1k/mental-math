// v14.15 client: existing devices must move to the new default model, and the old saved value must not pin them.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = { 'mmTrainer.geminiModel': 'gemini-3.1-flash-lite' };   // what 14.14 silently wrote on every device
globalThis.localStorage = new Proxy(store, {
  get: (t, k) => (k === 'removeItem' ? (key) => delete t[key] : k === 'getItem' ? (key) => t[key] ?? null : t[k]),
  set: (t, k, v) => ((t[k] = String(v)), true),
  deleteProperty: (t, k) => (delete t[k], true),
});
globalThis.addEventListener = () => {};
globalThis.document = { addEventListener() {}, hidden: false, querySelector: () => null, querySelectorAll: () => [] };
const ai = await import('../public/js/ai.js');

test('a device that 14.14 pinned to 3.1 now uses 3.5 Flash-Lite', () => {
  assert.equal(ai.getSelectedModel(), 'gemini-3.5-flash-lite');
  assert.equal(ai.AI_MODELS[0].id, 'gemini-3.5-flash-lite');
  assert.deepEqual(ai.AI_MODELS.map((m) => m.id), ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);
});

test('an explicit choice is still honoured, and retired models are never sent', () => {
  assert.equal(ai.setSelectedModel('gemini-3.1-flash-lite'), 'gemini-3.1-flash-lite');
  assert.equal(ai.getSelectedModel(), 'gemini-3.1-flash-lite');
  assert.equal(ai.setSelectedModel('gemini-2.0-flash'), 'gemini-3.5-flash-lite');
  assert.equal(ai.getSelectedModel(), 'gemini-3.5-flash-lite');
});
