// 14.85: background skins, more accents, a custom colour, and a new default look for first-time visitors only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');

globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
const T = await import('../public/js/theme.js');
const { S, PREF_KEYS, SYNCED_PREFS } = await import('../public/js/state.js');

const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const css = read('css/style.css'), extras = read('css/extras.css');
const vars = (b) => Object.fromEntries([...b.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const block = (src, sel) => { const i = src.indexOf(sel + ' {'); assert.ok(i >= 0, sel); return vars(src.slice(i, src.indexOf('}', i))); };
const root = block(css, ':root'), lightRoot = { ...root, ...block(css, '[data-theme=light]') };

test('every skin has a dark and a light block, and the JS table matches the CSS', () => {
  for (const [k, v] of Object.entries(T.SKINS)) {
    if (k == 'classic') { assert.doesNotMatch(extras, /\[data-skin=classic\]/); continue; }
    const d = block(extras, `[data-skin=${k}][data-theme=dark]`), l = block(extras, `[data-skin=${k}][data-theme=light]`);
    assert.equal(d.bg, v[1], k + ' dark page'); assert.equal(d.c2, v[2], k + ' dark card');
    assert.equal(l.bg, v[3], k + ' light page'); assert.equal(l.c2, v[4], k + ' light card');
  }
});

test('text, ok, bad and gold keep 4.5:1 on every surface of every skin', () => {
  for (const k of Object.keys(T.SKINS).filter((x) => x != 'classic')) for (const [mode, base] of [['dark', root], ['light', lightRoot]]) {
    const t = { ...base, ...block(extras, `[data-skin=${k}][data-theme=${mode}]`) };
    for (const fg of ['tx', 'mu', 'mu2', 'ok', 'bad', 'gd']) for (const bg of ['bg', 'bg2', 'c', 'c2']) assert.ok(ratio(t[fg], t[bg]) >= 4.5, `${k}/${mode}: --${fg} on --${bg} is ${ratio(t[fg], t[bg]).toFixed(2)}`);
  }
});

test('boot.js carries the same accent and skin tables as theme.js', () => {
  const boot = read('js/boot.js');
  for (const [k, [d, l]] of Object.entries(T.ACC)) assert.ok(boot.includes(`${k}: ['${d}', '${l}']`), 'accent ' + k);
  for (const [k, v] of Object.entries(T.SKINS)) assert.ok(boot.includes(`${k}: ['${v[5]}', '${v[6]}']`), 'skin ' + k);
});

test('a custom colour always yields a pair that keeps button text readable', () => {
  for (const hex of ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ffffff', '#000000', '#808080', '#a07bff', '#ff8a65', '#123456']) {
    const [d, l] = T.customPair(hex);
    assert.ok(/^#[0-9a-f]{6}$/.test(d) && /^#[0-9a-f]{6}$/.test(l), hex);
    assert.ok(ratio(d, '#08101f') >= 4.5, `${hex} dark ${d}`); assert.ok(ratio(l, '#ffffff') >= 4.5, `${hex} light ${l}`);
  }
});

test('new visitors get Aurora and grape; anyone who already had the app keeps blue on Classic until they choose', () => {
  const keep = { acc: S.acc, skin: S.skin, accHex: S.accHex };
  delete S.acc; delete S.skin; delete S.accHex;
  assert.deepEqual([T.accKey(), T.skinKey()], ['blue', 'classic']);                         // no marker: an existing device
  globalThis.document = { documentElement: { dataset: { look2: '1' } } };
  assert.deepEqual([T.accKey(), T.skinKey()], ['grape', 'aurora']);                          // marker: first visit on this release
  S.acc = 'teal'; S.skin = 'classic'; assert.deepEqual([T.accKey(), T.skinKey()], ['teal', 'classic']);   // a choice always wins
  S.acc = 'constructor'; S.skin = '__proto__'; assert.deepEqual([T.accKey(), T.skinKey()], ['grape', 'aurora']);   // junk falls back
  S.acc = 'custom'; S.accHex = 'red'; assert.equal(T.accKey(), 'grape');
  S.accHex = '#12ab34'; assert.equal(T.accKey(), 'custom');
  delete globalThis.document; Object.assign(S, keep); for (const k of ['acc', 'skin', 'accHex']) if (S[k] === undefined) delete S[k];
  const boot = read('js/boot.js');
  assert.match(boot, /localStorage\[stateKey\] == null && localStorage\[flag\] == null\) localStorage\[flag\] = '1'/);
  assert.match(boot, /catch \(e\) \{ D\.dataset\.look2 = '1'/);
});

test('skin and custom colour sync with the other settings', () => {
  for (const k of ['skin', 'accHex']) { assert.ok(PREF_KEYS.includes(k), k); assert.ok(SYNCED_PREFS.includes(k), k); }
});

test('Settings offers backgrounds and a colour picker, and the actions exist', () => {
  const s = read('js/views/settings.js');
  for (const x of ['data-act="skin"', 'id="acc-custom"', 'type="color"', 'role="radiogroup" aria-label="Background style"']) assert.ok(s.includes(x), x);
  assert.ok(s.includes('A.skin ='));
  assert.ok(!s.includes('Quick looks'), 'Quick looks repeated the Background row and was removed in 14.89');
  assert.match(s, /e\.target\.id != 'acc-custom'/);
});
