import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bestKey, digitsOnly } from '../public/js/chain.js';
import { countsToGoal, days } from '../public/js/stats.js';
import { S } from '../public/js/state.js';

const rd = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
const css = rd('css/style.css'), extras = rd('css/extras.css'), main = rd('js/main.js'), home = rd('js/views/home.js'), flash = rd('js/views/flash.js');

test('phone tab bar: five tabs with readable labels; Settings is a gear on Home and stays in the desktop rail', () => {
  assert.match(css, /#tabs\s*\{[^}]*repeat\(5, minmax\(0, 1fr\)\)/s);
  const m = /#tabs \.nv \{[^}]*font-size: clamp\((\d+(?:\.\d+)?)px/.exec(css);
  assert.ok(m && +m[1] >= 11, 'tab labels are at least 11px');
  assert.match(main, /NAV\.filter\(\(\[id\]\) => id != 'settings'\)/);   // tabs without Settings
  assert.match(main, /\$\('#rail'\)\.innerHTML = [^;]*\$\{btns\}/);       // rail keeps all six
  assert.match(home, /class="hd-gear" data-go="settings"/);
  assert.match(extras, /\.hd-gear \{ display: none;/);                    // hidden on desktop
  assert.match(extras, /@media \(max-width: 760px\) \{ \.hd-gear \{ display: inline-grid; \} \}/);
});

test('Flash: answer goes through the shared number pad, typed junk is stripped, no inline styles remain', () => {
  assert.match(flash, /class="pad fl-pad"/);
  assert.match(flash, /padOn\(\)/);
  assert.equal(digitsOnly('12abc'), '12');
  assert.equal(digitsOnly(' 4-5.6 '), '456');
  assert.equal(digitsOnly('1234567890'), '123456');
  assert.equal(digitsOnly(null), '');
  assert.doesNotMatch(flash, /style="/);
});

test('Flash: sound and vibration obey the same mute / no-haptics switches; pause exists; best is kept per setting', () => {
  assert.match(flash, /if \(S\.mute\) return;/);
  assert.match(flash, /!S\.noHap && navigator\.vibrate/);
  assert.match(flash, /A\.flPause = pause/);
  assert.match(flash, /A\.flResume/);
  assert.notEqual(bestKey({ c: 4, s: 1500, d: 1, neg: 0 }), bestKey({ c: 4, s: 1500, d: 1, neg: 1 }));
  assert.notEqual(bestKey({ c: 4, s: 1500, d: 1, neg: 0 }), bestKey({ c: 6, s: 1500, d: 1, neg: 0 }));
  assert.equal(bestKey({ c: 4, s: 1500, d: 1, neg: 0 }), bestKey({ c: 4, s: 1500, d: 1 }));
});

test('Flash keeps the streak alive, and counts for the daily goal at 3+ rounds right', () => {
  const t = Date.now(), run = (ok) => ({ t, m: 'flash', dur: 60, n: 5, ok, ft: ok, pts: 100 * ok, tm: 0, by: {}, off: 0 });
  assert.equal(countsToGoal(run(3)), true);
  assert.equal(countsToGoal(run(2)), false);
  assert.equal(countsToGoal(run(0)), false);
  assert.equal(countsToGoal({ ...run(5), dur: 300 }), true);
  assert.equal(countsToGoal({ t, m: 'train', dur: 60, n: 10, ok: 9 }), false);   // other modes unchanged
  const keep = S.sessions; S.sessions = [run(1)];
  try { assert.ok(days().has(new Date(t).getFullYear() + '-' + String(new Date(t).getMonth() + 1).padStart(2, '0') + '-' + String(new Date(t).getDate()).padStart(2, '0'))); }
  finally { S.sessions = keep; }
});
