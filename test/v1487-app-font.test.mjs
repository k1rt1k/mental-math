// 14.87: whole-app font setting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');

globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
const T = await import('../public/js/theme.js');
const { S, PREF_KEYS, SYNCED_PREFS, devicePrefs } = await import('../public/js/state.js');

test('every app font has CSS (or is the default) and a picker sample', () => {
  const css = read('css/style.css'), extras = read('css/extras.css');
  for (const k of Object.keys(T.AFONTS)) {
    if (k != 'default') assert.match(css, new RegExp(`\\[data-afont=${k}\\]`), 'style.css ' + k);
    assert.match(extras, new RegExp(`\\.afont\\[data-af=${k}\\]`), 'picker sample ' + k);
  }
});

test('boot.js accepts exactly the fonts theme.js knows', () => {
  const boot = read('js/boot.js'), m = boot.match(/\/\^\(([^)]*)\)\$\/\.test\(S\.afont\)/);
  assert.ok(m, 'boot.js afont check');
  assert.deepEqual(m[1].split('|').sort(), Object.keys(T.AFONTS).filter((k) => k != 'default').sort());
});

test('the app font syncs, and Reset keeps it', () => {
  assert.ok(PREF_KEYS.includes('afont') && SYNCED_PREFS.includes('afont'));
  assert.equal(devicePrefs({ afont: 'mono' }).afont, 'mono');
});

test('applyTheme sets data-afont and falls back to default for junk', () => {
  const D = { dataset: {}, style: { setProperty() {} } };
  globalThis.document = { documentElement: D, querySelector: () => null, body: { classList: { toggle() {} } } };
  const keep = S.afont;
  for (const [v, want] of [['mono', 'mono'], ['system', 'system'], ['nope', 'default'], ['__proto__', 'default'], [undefined, 'default']]) {
    if (v === undefined) delete S.afont; else S.afont = v;
    T.applyTheme(); assert.equal(D.dataset.afont, want, String(v));
  }
  if (keep === undefined) delete S.afont; else S.afont = keep;
  delete globalThis.document;
});

test('Settings offers the picker and a handler for it', () => {
  const s = read('js/views/settings.js');
  assert.match(s, /data-act="afont"/); assert.match(s, /A\.afont = /);
});
