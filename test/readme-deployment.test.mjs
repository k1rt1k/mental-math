// The deployment instructions in README.md must match the code that is actually deployed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERSION } from '../public/js/util.js';
import { DEFAULT_MODEL, FREE_MODELS } from '../netlify/lib/ailogic.mjs';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const section = (() => {
  const start = readme.indexOf('## Current backend contract');
  const end = readme.indexOf('## Honest limitations');
  assert.ok(start >= 0 && end > start, 'README has a current backend contract section before the limitations');
  return readme.slice(start, end);
})();
const dotted = VERSION.replaceAll('.', '\\.');

test('README deployment instructions report the live version and model order', () => {
  assert.match(section, new RegExp(`buildVersion: "${dotted}"`));
  assert.match(section, new RegExp(`x-mental-math-ai-version: ${dotted}`));
  assert.match(section, new RegExp(`"buildVersion": "${dotted}"`));
  assert.match(section, new RegExp(`"defaultModel": "${DEFAULT_MODEL}"`));
  assert.ok(section.includes(`"models": [${FREE_MODELS.map((m) => `"${m}"`).join(', ')}]`), 'the model list is in allow-list order');
  assert.match(section, /Gemini 3\.5 Flash-Lite primary/);
  assert.match(section, /Gemini 3\.1 Flash-Lite as the only backup/);
});

test('README no longer carries the old v14.15 deployment response as current instructions', () => {
  assert.doesNotMatch(section, /buildVersion: "14\.15"/);
  assert.doesNotMatch(section, /x-mental-math-ai-version: 14\.15/);
  assert.doesNotMatch(section, /"defaultModel": "gemini-3\.1-flash-lite"/);
});
