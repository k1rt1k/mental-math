import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
const style = rd('css/style.css'), motion = rd('css/motion.css');

test('v14.26 chips in the swipe row never shrink (the ripple overflow:hidden would collapse them to dots)', () => {
  assert.match(motion, /:where\(\.chip, \.step, \.lnk2, \.syncdot\) \{ position: relative; overflow: hidden; overflow: clip; \}/);   // clip (hidden only as the fallback): hidden zeroes a flex item's min-width, clip does not
  assert.match(style, /\.chips\.fscroll > \.chip \{ flex: none; \}/);                                                // the guard
  const media = style.match(/@media \(max-width: 700px\) \{ \.chips\.fscroll \{[^\n]*\n/);
  assert.ok(media && /\.chips\.fscroll > \.chip \{ flex: none; \}/.test(media[0]), 'guard lives in the same phone block as the no-wrap row');
});

test('v14.26 phone header buttons: Clear all gets its own centred full-width row, buttons never exceed the container', () => {
  assert.match(style, /\.hd > \.btns > \.btn \{ max-width: 100%; justify-content: center; \}/);
  assert.match(style, /\.hd > \.btns > \.btn\.ghost \{ flex: 1 0 100%; min-height: 36px; \}/);
});
