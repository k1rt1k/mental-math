import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
const morph = rd('js/morph.js'), nav = rd('js/nav.js'), motion = rd('js/motion.js'), css = rd('css/motion.css'), play = rd('js/views/play.js'), results = rd('js/views/results.js'), charts = rd('js/charts.js'), main = rd('js/main.js');

test('v14.25 morph: in-place repaints patch the DOM, navigation and Play/Results still replace it', () => {
  assert.match(morph, /Object\.defineProperty\(main, 'innerHTML'/);
  assert.match(morph, /MORPHABLE = new Set\(\['home', 'coach', 'learn', 'progress', 'notebook', 'settings'\]\)/);   // never Play or Results
  assert.match(morph, /dataset\.fresh/);                                                                           // a navigation always replaces
  assert.match(nav, /m\.dataset\.fresh = '1'/); assert.match(nav, /m\.dataset\.scr = name/);
  assert.match(main, /import '\.\/morph\.js'/);
  assert.match(morph, /catch \(err\) \{ console\.error\(err\); setHTML\.call\(this, html\); return; \}/);        // a failed patch falls back to the old behaviour
  assert.match(morph, /document\.activeElement === o/);                                                          // never overwrite a field someone is typing in
});

test('v14.25 morph: motion is skipped under Reduce motion and during the entrance, state is still patched', () => {
  assert.match(morph, /const calm = still\(\) \|\| this\.classList\.contains\('enter'\)/);
  assert.match(morph, /document\.documentElement\.dataset\.motion === 'reduce'/);
});

test('v14.25 theme colours are typed so theme and accent changes glide; the heatmap no longer shadows --c', () => {
  for (const n of ['bg', 'c', 'c2', 'ln', 'tx', 'mu', 'ac', 'ok', 'bad', 'gd']) assert.match(css, new RegExp(`@property --${n} \\{ syntax: '<color>'`));
  assert.match(css, /:root \{ transition: --bg /);
  assert.doesNotMatch(charts, /style=\\?"--c:/);          // --c is the card surface colour; a number there would break it
  assert.match(charts, /--wc:\$\{/); assert.match(css, /var\(--wc, 0\)/);
});

test('v14.25 Play and Results motion is wired', () => {
  assert.match(results, /import \{ A, go, mark, enter \} from '\.\.\/nav\.js'/); assert.match(results, /\benter\(\);/);
  assert.match(play, /patchInto\(\$\('#fd'\)/); assert.match(play, /function leave\(\)/); assert.match(play, /function lifeLost\(\)/);
  assert.match(play, /startsWith\(sess\.buf\)/);
  assert.match(css, /@keyframes dgpop/); assert.match(css, /\.paused\.out/); assert.match(css, /@keyframes cdtick/);
  assert.match(motion, /export function pulse/); assert.match(motion, /mm:paint/);
});
