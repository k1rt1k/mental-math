import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRecommendation, parseSkillMap, buildPrompt, callGeminiFreeApiWithMeta, resetModelHealth } from '../netlify/lib/ailogic.mjs';

const MAP = parseSkillMap('add=Addition, mul=Multiplication, bad id=Nope');

test('skill map parses id=name pairs and ignores junk', () => {
  assert.deepEqual(MAP, { add: 'Addition', mul: 'Multiplication' });
});

test('a JSON recommendation becomes validated structure plus readable text', () => {
  const raw = '```json\n{"skill":"mul","durationSec":180,"headline":"Fix carries","reason":"Carry accuracy is 62%.","technique":"Split 47 × 6 into 40 × 6 + 7 × 6 = 240 + 42 = 282."}\n```';
  const r = parseRecommendation(raw, MAP);
  assert.deepEqual(r.structured, { skill: 'mul', durationSec: 180, skillName: 'Multiplication' });
  assert.match(r.text, /### Fix carries/);
  assert.match(r.text, /3 min · Multiplication/);
});

test('an invented skill or non-JSON is rejected, bad duration is normalised', () => {
  assert.equal(parseRecommendation('{"skill":"quantum","reason":"x"}', MAP), null);
  assert.equal(parseRecommendation('just prose', MAP), null);
  assert.equal(parseRecommendation('{"skill":"add","durationSec":7,"reason":"r"}', MAP).structured.durationSec, 120);
});

test('profile data and the JSON contract reach the prompts', () => {
  const summary = { patterns: 'Multiplication · carry 62% (12 tries)', trend: 'accuracy +4 pts', skillIds: 'add=Addition, mul=Multiplication' };
  const rec = buildPrompt({ action: 'recommend', summary });
  assert.match(rec, /Multiplication · carry 62%/);
  assert.match(rec, /ONLY a JSON object/);
  assert.match(rec, /add=Addition/);
  assert.match(buildPrompt({ action: 'analyze', summary }), /accuracy \+4 pts/);
});

test('JSON mode is requested only for recommendations; a cooled-down model is tried last', async () => {
  resetModelHealth();
  const seen = [];
  const fetchFn = async (url, init) => {
    seen.push({ model: /models\/([^:]+):/.exec(url)[1], json: JSON.parse(init.body).generationConfig.responseMimeType });
    return seen.length === 1
      ? new Response(JSON.stringify({ error: { message: 'busy' } }), { status: 503 })
      : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }), { status: 200 });
  };
  const opts = { apiKey: 'k', model: 'gemini-3.1-flash-lite', prompt: 'p', fetchFn, sleepFn: async () => {}, reserveQuota: async () => ({}), trackHealth: true };
  await callGeminiFreeApiWithMeta({ ...opts, jsonMode: true });
  assert.equal(seen[0].json, 'application/json');
  assert.equal(seen[0].model, 'gemini-3.1-flash-lite');
  seen.length = 0;
  await callGeminiFreeApiWithMeta({ ...opts, fetchFn: async (url) => { seen.push(/models\/([^:]+):/.exec(url)[1]); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 }); } });
  assert.equal(seen[0], 'gemini-3.5-flash-lite', 'the model that just returned 503 is skipped first');
  resetModelHealth();
});
