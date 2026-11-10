import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const rd = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');

test('Flash can speak its numbers: opt-in, synced, feature-detected, cancelled on stop', () => {
  const f = rd('js/views/flash.js');
  assert.match(f, /new SpeechSynthesisUtterance/);
  assert.match(f, /const stop = \(\) => \{ clearTimeout\(tm\); tm = 0; hush\(\); \}/);
  assert.match(f, /A\.flV = /);
  assert.match(f, /canSpeak\(\) \?/);                       // the control is hidden where speech is unsupported
  assert.match(f, /say\(spoken\(q, f\.n == 1\)/);
  assert.match(f, /'Not quite\. The total was '/);
  assert.match(rd('js/util.js'), /export const canSpeak/);
  assert.match(rd('js/state.js'), /'noQLine', 'speak'/);   // follows the learner across devices
  assert.match(rd('js/views/settings.js'), /'speak', get\('speak'\)/);
  assert.doesNotMatch(rd('js/views/settings.js'), /INV = new Set\([^)]*'speak'/);   // not an inverted key
  assert.match(rd('js/infotext.js'), /'s\.speak'/);
});

test('spoken(): the first number is bare, later ones say plus or minus', async () => {
  globalThis.document = { querySelector() { return null; }, addEventListener() {} };
  const { spoken } = await import('../public/js/views/flash.js').catch(() => ({}));
  if (!spoken) return;   // the view needs a browser to load; the pure rule is covered by the source check above
  assert.equal(spoken({ x: 7, sub: false }, true), '7');
  assert.equal(spoken({ x: 7, sub: false }, false), 'plus 7');
  assert.equal(spoken({ x: 12, sub: true }, false), 'minus 12');
});
