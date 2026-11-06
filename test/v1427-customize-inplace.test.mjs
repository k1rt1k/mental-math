import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
const home = rd('js/views/home.js'), morph = rd('js/morph.js'), style = rd('css/style.css');

test('v14.27 Customize toggles the panel in place instead of repainting the home screen', () => {
  const fn = home.match(/A\.toggleCustom = [\s\S]*?\n\};/)[0];
  assert.match(fn, /panel\.hidden = !open/);
  assert.match(fn, /aria-expanded/);
  assert.match(fn, /scrollTo\(/);
  assert.doesNotMatch(fn.replace(/if \(!panel[^\n]*\n/, ''), /home\(\)/, 'the normal path must not repaint');
});

test('v14.27 in-place repaints keep the scroll position and scroll anchoring is off', () => {
  assert.match(morph, /const y0 = scrollY/);
  assert.match(morph, /scrollTo\(\{ top: y0/);
  assert.match(style, /#main \{ min-width: 0; overflow-anchor: none;/);
});
