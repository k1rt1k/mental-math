// Every file that repeats the release number must agree with the VERSION file. Fix with: node tools/version.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { stamp, current, TARGETS } from '../tools/version.mjs';
import { VERSION } from './helpers/version.mjs';

test('VERSION, the service worker, index.html, the AI function and the README all carry the same release', () => {
  assert.equal(current(), VERSION);
  assert.deepEqual(stamp(), [], 'run: node tools/version.mjs');
});

test('the stamping tool covers every place the release is written', () => {
  assert.deepEqual([...new Set(TARGETS.map((t) => t[0]))].sort(), ['README.md', 'netlify/functions/ai.mjs', 'public/index.html', 'public/js/util.js', 'public/sw.js']);
});
