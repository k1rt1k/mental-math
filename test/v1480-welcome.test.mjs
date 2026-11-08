// The first-visit welcome: a purpose-built dialog that shows the product (the question board answering itself) and offers three ways in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const r = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');

test('welcomeDlg resolves demo | go | look, and anything dismissive means look', () => {
  const u = r('js/ui.js');
  assert.match(u, /export function welcomeDlg\(\)/);
  assert.match(u, /v === 'demo' \|\| v === 'go' \? v : 'look'/);
  assert.match(u, /aria-labelledby', 'wl-h'/);
  for (const v of ['demo', 'go', 'look']) assert.match(u, new RegExp('value="' + v + '"'));
});

test('it is built from the app tokens only, so every theme and contrast mode follows, and it respects reduced motion', () => {
  const c = r('css/extras.css'), start = c.indexOf('First-visit welcome'), css = c.slice(start);
  assert.ok(start > 0);
  assert.equal([...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].length, 0, 'no hard-coded colours in the welcome styles');
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /data-motion=reduce/);
  assert.match(css, /max-width: 560px/);   // the phone bottom sheet
});
