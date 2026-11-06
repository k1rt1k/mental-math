// The "i" explainers: one shared sheet, every key resolves, and the sheet files are shipped with the app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const rd = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');

test('every info key used in a view exists in INFO, and every INFO entry has a title and text', async () => {
  const { INFO } = await import('../public/js/infotext.js');
  for (const [k, v] of Object.entries(INFO)) {
    assert.ok(Array.isArray(v) && v.length >= 2 && v.every((x) => typeof x == 'string' && x.trim()), k);
  }
  const dir = new URL('../public/js/', import.meta.url);
  const files = ['views/' , ''].flatMap((d) => readdirSync(new URL(d, dir)).filter((f) => f.endsWith('.js')).map((f) => d + f));
  const used = new Set();
  for (const f of files) for (const m of rd('js/' + f).matchAll(/\bibs?\('([\w.]*\w)'/g)) used.add(m[1]);
  for (const m of rd('js/views/progress.js').matchAll(/statB\('(\w+)'\)/g)) used.add('p.' + m[1]);
  assert.ok(used.size >= 30, 'expected info buttons across the app, found ' + used.size);
  for (const k of used) assert.ok(INFO[k], 'missing INFO key: ' + k);
});

test('ib() makes a labelled button and ibs() a keyboard-reachable span for use inside buttons', async () => {
  const { ib, ibs } = await import('../public/js/infotext.js');
  const b = ib('p.rating'), s = ibs('p.streak');
  assert.match(b, /^<button type="button" class="ib "/);
  assert.match(b, /data-act="info" data-v="p\.rating"/);
  assert.match(b, /aria-label="About: Rating"/);
  assert.match(s, /^<span role="button" tabindex="0" class="ib "/);
  assert.equal(ib('no.such.key'), '');
});

test('screens that have a button inside a button never nest a real <button>', () => {
  // Mode tiles and the Skills summary are buttons / summaries themselves, so they must use ibs().
  const home = rd('js/views/home.js');
  assert.doesNotMatch(home, /<b>(Daily|Survival|Sprint|Drill weakest)\$\{ib\(/);
  assert.doesNotMatch(home, /ibs\('mode\./);   // the tiles describe themselves
  assert.doesNotMatch(home, /ibs\('home\.skills'\)/);   // the Skills summary toggles on tap, so it carries no i
  assert.doesNotMatch(rd('js/views/progress.js'), /ibs\(/);
});

test('switch rows keep a clean accessible name (the i button is outside the labelled element)', () => {
  const src = rd('js/views/settings.js');
  assert.match(src, /<span id="l-\$\{esc\(key\)\}">\$\{t\}<\/span>\$\{ib\('s\.' \+ key\)\}/);
});

test('info.js ships with the app and the sheet opens as a dialog the existing motion code already handles', () => {
  assert.match(rd('sw.js'), /'js\/info\.js'/);
  assert.match(rd('sw.js'), /'js\/infotext\.js'/);
  const src = rd('js/info.js');
  assert.match(src, /dialog\(\{/);
  assert.match(src, /A\.info = /);
  assert.match(rd('css/extras.css'), /dialog\.dlg\.info/);
});

test('the Play screen carries no explainers: not over the clock and not on the pause screen', () => {
  const play = rd('js/views/play.js');
  assert.doesNotMatch(play, /\bibs?\(/);
  assert.doesNotMatch(play, /pinfo/);
});

test('the curated explainer set is exactly what ships, with no unused text', async () => {
  const { INFO } = await import('../public/js/infotext.js');
  const keep = readFileSync(new URL('./info-keys.txt', import.meta.url), 'utf8').split('\n').filter(Boolean).sort();
  assert.deepEqual(Object.keys(INFO).sort(), keep);
});
