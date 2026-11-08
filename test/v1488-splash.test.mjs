// 14.88: animated opening screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
const html = read('index.html'), css = read('css/motion.css'), boot = read('js/boot.js');

test('the splash is the first thing in <body>, so it paints before the app', () => {
  assert.match(html, /<body>\s*<div id="splash" aria-hidden="true">/);
  assert.match(html, /class="sp-logo" src="icon\.svg"/);
  assert.equal((html.match(/class="sp-sym"/g) || []).length, 6);
});

test('it is hidden unless boot.js asks for it, and Reduce motion (OS or in-app) never shows it', () => {
  assert.match(css, /#splash \{ display: none;/);
  assert.match(css, /\[data-splash="1"\] #splash \{ display: flex;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ #splash \{ display: none !important; \} \}/);
  assert.match(css, /\[data-motion=reduce\] #splash \{ display: none !important; \}/);
});

test('boot.js shows it once per launch, not for shortcuts, not with Reduce motion, not when switched off', () => {
  assert.match(boot, /!S\.noSplash/); assert.match(boot, /S\.rm \|\| matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(boot, /!sessionStorage\['mm\.splash'\]/); assert.match(boot, /\[\?&\]go=/);
  assert.match(boot, /dataset\.splash = '1'; sessionStorage\['mm\.splash'\] = '1'/);
});

test('the CSS alone ends it within 2.4 s, so a failed script can never trap the screen', () => {
  const m = css.match(/\[data-splash="1"\] #splash \{[^}]*animation: sp-out ([\d.]+)s cubic-bezier\([^)]*\) ([\d.]+)s forwards/);
  assert.ok(m, 'sp-out on #splash');
  assert.ok(+m[1] + +m[2] <= 2.4, 'ends by ' + (+m[1] + +m[2]));
  assert.match(css, /@keyframes sp-out \{ to \{ opacity: 0; visibility: hidden; \} \}/);
});

test('every part of the show has started before the lift-away begins, and only transform/opacity are animated', () => {
  const start = 1.85, sec = css.slice(css.indexOf('opening animation'));
  const decls = [...sec.matchAll(/animation: ([^;]*);/g)].map((x) => x[1]).filter((d) => !/sp-(out|logo-out)/.test(d.split(',')[0]) || /sp-logo-in/.test(d));
  assert.ok(decls.length >= 7, 'found ' + decls.length);
  for (const d of decls) for (const one of d.split(/,(?![^(]*\))/)) {
    if (/sp-(out|logo-out)/.test(one)) continue;
    const flat = one.replace(/cubic-bezier\([^)]*\)/g, '').replace(/calc\(([\d.]+)s[^)]*\)/g, '$1s').replace(/var\(--d[^)]*\)/g, '0s');
    const t = [...flat.matchAll(/([\d.]+)s/g)].map((x) => +x[1]);
    const delay = t[1] || 0;
    assert.ok(delay < start, one.trim() + ' starts at ' + delay);
  }
  for (const m of html.matchAll(/--d:([\d.]+)s/g)) assert.ok(+m[1] < start, 'symbol delay ' + m[1]);
  const kf = [...sec.matchAll(/@keyframes sp-[\w-]+ \{([\s\S]*?)\n?\}(?=\n|\.|@|\[|#|$)/g)].map((x) => x[1]).join('');
  assert.doesNotMatch(kf, /\b(width|height|top|left|margin|filter|box-shadow)\s*:/);
});

test('the intro is a synced setting with an off switch, a replay button, a tap-to-skip, and is precached', () => {
  const st = read('js/state.js'), set = read('js/views/settings.js'), sw = read('sw.js'), sp = read('js/splash.js');
  assert.match(st, /'afont', 'noSplash'/);
  assert.match(set, /'noSplash'\]\);/); assert.match(set, /row\('Opening animation'.*'noSplash', get\('noSplash'\)\)/);
  assert.match(set, /data-act="splashPlay"/); assert.match(set, /A\.splashPlay = /);
  assert.match(sw, /'js\/splash\.js'/); assert.match(read('js/main.js'), /import '\.\/splash\.js'/);
  assert.match(sp, /pointerdown/); assert.match(sp, /e\.animationName == 'sp-out'/);
});
