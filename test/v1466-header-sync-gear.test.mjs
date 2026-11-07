import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { icon } from '../public/js/ui.js';

const rd = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
const home = rd('js/views/home.js'), settings = rd('js/views/settings.js'), extras = rd('css/extras.css');

test('the Settings icon is a cog, not a sun with rays (it looked like a theme toggle)', () => {
  const g = icon('gear');
  assert.doesNotMatch(g, /M12 3v2\.5M12 18\.5V21/, 'the old eight-ray sun is gone');
  assert.match(g, /A7\.3 7\.3/, 'a toothed ring: teeth joined by arcs');
  assert.equal((g.match(/L/g) || []).length >= 24, true, 'eight teeth, three line segments each');
  assert.match(g, /M15 12a3 3 0 1 1-6 0/, 'with the hub circle');
});

test('the cloud on Home is a real button that says it opens something', () => {
  assert.match(home, /class=\"syncdot[^>]*data-act=\"sync\" aria-haspopup=\"dialog\"/);
});

test('tapping the cloud: wide screens sync straight away, phones open a sheet with the status words', () => {
  assert.match(settings, /A\.sync = async \(_d, el\) =>/);
  assert.match(settings, /if \(!syncKey\(\)\) \{ go\('settings'\); setTimeout\(\(\) => A\.syncKey\(\), 50\); return; \}/, 'no key yet: straight to key setup, as before');
  assert.match(settings, /display != 'none'\) return A\.syncNow\(\)/, 'status label visible beside the cloud: just sync');
  assert.match(settings, /dl\.classList\.add\('synsheet'\)/);
  for (const k of ['ok', 'busy', 'offline', 'key', 'locked']) assert.match(settings, new RegExp('\\b' + k + ': \''), 'a hint for ' + k);
});

test('phone header: cloud and cog are drawn as buttons, like the streak pill', () => {
  assert.match(extras, /\.home-hd \.syncdot, \.hd-gear \{[^}]*border-radius: 50%[^}]*background: var\(--c2\)/);
  assert.match(extras, /dialog\.dlg\.synsheet \{ width: min\(420px/);
  assert.match(extras, /prefers-reduced-motion: reduce\) \{ \.syncdot\.busy \.sico \.ic \{ animation: none/);
});
