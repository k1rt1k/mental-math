// v11.0 design system guarantees: fonts, no emoji icons, accessible colour tokens, no patch-layer CSS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pub = fileURLToPath(new URL('../public/', import.meta.url));
const css = readFileSync(join(pub, 'css/style.css'), 'utf8');
const sw = readFileSync(join(pub, 'sw.js'), 'utf8');
const jsFiles = (d) => readdirSync(join(pub, d)).filter((f) => f.endsWith('.js')).map((f) => join(pub, d, f));

test('bundled fonts exist, are declared in CSS, and are precached for offline use', () => {
  for (const f of ['inter', 'fraunces', 'jbmono', 'sym']) {
    assert.ok(existsSync(join(pub, `fonts/${f}.woff2`)), `fonts/${f}.woff2 exists`);
    assert.ok(css.includes(`fonts/${f}.woff2`), `${f} declared via @font-face`);
    assert.ok(sw.includes(`fonts/${f}.woff2`), `${f} in the service-worker shell`);
  }
  assert.ok(!/https?:\/\/[^ )]*\.(woff2?|ttf)/.test(css), 'no third-party font hosts (the CSP forbids them)');
});

test('the symbol font covers every non-Latin glyph the question generator can emit', () => {
  const src = readFileSync(join(pub, 'js/engine.js'), 'utf8') + readFileSync(join(pub, 'js/tricks.js'), 'utf8');
  // U+2212 (minus) and U+2215 are in Inter itself, so only the rest need the symbol font
  // U+2212 (minus) and U+2215 are in Inter itself, so only the rest need the symbol font
  const need = [...new Set([...src].map((c) => c.codePointAt(0)).filter((cp) => cp > 0x2200 && cp != 0x2212 && cp != 0x2215))];
  const range = css.match(/unicode-range:([^;]+);/)[1];
  const ok = (cp) => range.split(',').some((r) => { const m = r.trim().match(/U\+([0-9A-F]+)(?:-([0-9A-F]+))?/i); return m && cp >= parseInt(m[1], 16) && cp <= parseInt(m[2] || m[1], 16); });
  for (const cp of need) assert.ok(ok(cp), `U+${cp.toString(16)} is covered by the MM Sym unicode-range`);
});

test('no emoji icons in UI code: icons are SVG so they look the same on every device', () => {
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2B50}]/u;
  for (const f of [...jsFiles('js/views'), join(pub, 'js/ui.js'), join(pub, 'js/main.js'), join(pub, 'js/charts.js')]) {
    const lines = readFileSync(f, 'utf8').split('\n').filter((l) => emoji.test(l));
    assert.deepEqual(lines, [], `${f.split('/').pop()} has emoji`);
  }
});

test('skill colours are never applied as raw text colour (they fail contrast on Light); use .kc', () => {
  for (const f of jsFiles('js/views')) {
    const bad = readFileSync(f, 'utf8').split('\n').filter((l) => /style="[^"]*\bcolor:\$\{COL/.test(l));
    assert.deepEqual(bad, [], `${f.split('/').pop()} sets color:\${COL…} inline`);
  }
});

// ---- colour tokens: parse the three theme blocks and check WCAG contrast
const block = (sel) => { const i = css.indexOf(sel + ' {'); assert.ok(i >= 0, sel); return css.slice(i, css.indexOf('}', i)); };
const vars = (b) => Object.fromEntries([...b.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const lum = (h) => { if (h.length == 4) h = '#' + [...h.slice(1)].map((c) => c + c).join(''); const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const root = vars(block(':root'));
const THEMES = { dark: root, light: { ...root, ...vars(block('[data-theme=light]')) }, black: { ...root, ...vars(block('[data-theme=black]')) } };

for (const [name, t] of Object.entries(THEMES)) {
  test(`${name} theme: text tokens meet 4.5:1 on every surface`, () => {
    for (const fg of ['tx', 'mu', 'mu2', 'ok', 'bad', 'gd']) for (const bg of ['bg', 'c', 'c2']) {
      assert.ok(ratio(t[fg], t[bg]) >= 4.5, `${name}: --${fg} on --${bg} is ${ratio(t[fg], t[bg]).toFixed(2)}`);
    }
  });
}

test('every accent keeps primary-button text readable in both modes', () => {
  const src = readFileSync(join(pub, 'js/theme.js'), 'utf8');
  const acc = [...src.matchAll(/(\w+): \['(#[0-9a-f]{6})', '(#[0-9a-f]{6})'\]/g)];
  assert.equal(acc.length, 5);
  for (const [, n, dark, light] of acc) {
    assert.ok(ratio(dark, THEMES.dark.ach) >= 4.5, `${n} dark`);
    assert.ok(ratio(light, THEMES.light.ach) >= 4.5, `${n} light`);
  }
});

test('stylesheet is one coherent system, not stacked patch passes', () => {
  assert.ok(!/\/\*[^*]*\b(pass \d|v\d+(\.\d+)?\s*[:–-])/i.test(css.replace(/Mental Math Trainer: design system \(11\.0\)/, '')), 'no "pass N" / "vN" override layers');
  const sel = [...css.matchAll(/^(\.[\w-]+) \{/gm)].map((m) => m[1]);
  const dup = sel.filter((s, i) => sel.indexOf(s) !== i && !['.fc', '.hr', '.sk', '.btn', '.mode', '.ms', '.hm'].includes(s));
  assert.ok(dup.length <= 8, `few repeated top-level selectors (found ${[...new Set(dup)].join(' ')})`);
  assert.ok(css.split('\n').length < 1100, 'stays compact');
});

test('main has min-width:0 so wide content can never push a phone layout sideways', () => {
  assert.match(css, /#main \{ min-width: 0;/);
  assert.match(css, /#shell \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});

test('phone play layout is height-aware: board flexes, keypad anchors to the bottom, short-screen tiers exist', () => {
  assert.match(css, /\.play > div:first-child \{ display: flex; flex-direction: column; min-height: calc\(100vh[^;]+; min-height: calc\(100dvh/);
  assert.match(css, /\.play \.board, \.padon \.play \.board \{ flex: 1 1 140px/);
  assert.match(css, /\.play \.pad \{ margin: auto auto 0/);
  assert.match(css, /max-width: 900px\) and \(max-height: 700px\)/);
  assert.match(css, /max-width: 900px\) and \(max-height: 600px\)/);
});

test('phone home is compact: single-row header, one-button notice, icon-left mode tiles', () => {
  assert.match(css, /\.home-hd \{ flex-wrap: nowrap/);
  assert.match(css, /\.notice \.btns \.btn:nth-child\(2\) \{ display: none; \}/);
  assert.match(css, /\.modes \.mode \{ display: grid; grid-template-columns: auto minmax\(0, 1fr\)/);
});

test('primary-button gradient never lightens in Light mode (white ink needs the accent or darker)', () => {
  const light = vars(block('[data-theme=light]'));
  assert.equal(light['btn-top'], 'var(--ac)');
  assert.match(light['btn-bot'], /#000/);
  assert.match(root['btn-top'], /#fff/, 'dark mode is lit from above');
});
