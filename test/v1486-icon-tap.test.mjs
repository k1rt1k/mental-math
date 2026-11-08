// 14.86: the icon hover motion also plays on touch, from a tap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
const css = read('css/motion.css'), js = read('js/motion.js');

test('every icon hover animation has a tap twin, and the nav tabs are left out of the tap rules', () => {
  const hover = css.split('\n').filter((l) => /^\s*[^/].*:hover.*animation:/.test(l) && /\.i-/.test(l) && !/\.skg|\.swatch/.test(l));
  const tap = css.split('\n').filter((l) => /\.ipl/.test(l) && /animation:/.test(l));
  assert.ok(hover.length >= 30, 'found ' + hover.length);
  assert.equal(tap.length, hover.length);
  for (const l of tap) { assert.doesNotMatch(l, /\.nv\b/, l); assert.doesNotMatch(l, /:hover/, l); }
});

test('the tap rules sit outside any hover media query', () => {
  const at = css.indexOf('v14.86 icon motion on touch');
  assert.ok(at > 0);
  assert.doesNotMatch(css.slice(at), /@media \(hover: hover\)/);
});

test('a tap marks the control for a moment, skips mice with hover and Reduce motion, and the class is not the squeeze .tap', () => {
  assert.match(js, /document\.addEventListener\('click'/);
  assert.match(js, /if \(still\(\)/);
  assert.match(js, /e\.pointerType === 'touch'/); assert.match(js, /\(hover: hover\)/);
  assert.match(js, /classList\.add\('ipl'\)/); assert.match(js, /classList\.remove\('ipl'\)/);
  assert.match(css, /@keyframes i-spin45/);
  assert.doesNotMatch(css, /\.i-sun \{ animation: i-spinc/);
});
