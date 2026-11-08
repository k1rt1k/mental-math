// Sample mode: a believable learner, built from the app's own shapes, that can never reach saved data or the server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fresh, S, replaceState } from '../public/js/state.js';
import { buildDemo } from '../public/js/demo.js';
import { streak, plan } from '../public/js/stats.js';
import { IDS } from '../public/js/engine.js';

const src = (f) => readFileSync(new URL('../public/' + f, import.meta.url), 'utf8');

test('the sample learner is complete, current and survives the normal loader', () => {
  const now = Date.now();
  replaceState(buildDemo(fresh(), now));
  assert.ok(S.sessions.length >= 30, 'five weeks of sessions');
  assert.equal(streak(), 12, 'a live streak');
  assert.ok(S.sessions.every((x) => Number.isFinite(x.t) && x.t <= now && x.n >= x.ok), 'no future or impossible sessions');
  assert.ok(IDS.every((k) => S.sk[k].lv >= 1 && S.sk[k].lv <= 12 && S.sk[k].n > 0), 'every skill has a rating and history');
  assert.ok(Object.keys(S.weak).length >= 5 && Object.keys(S.pat).length > 10 && Object.keys(S.facts).length > 30, 'notebook, patterns, times table');
  assert.equal(plan(now)[0].detail, '1/2', 'today is under way, not finished');
  assert.deepEqual(JSON.parse(JSON.stringify(buildDemo(fresh(), now))).goal, 2);
});

test('sample mode never writes saved data or calls the sync server', () => {
  assert.match(src('js/state.js'), /export function persist\(\) \{\s*\n\s*if \(DEMO\) return true;/);
  const sync = src('js/sync.js');
  for (const fn of ['startSync()', 'push()', 'pull(afterConflict = false)']) assert.match(sync, new RegExp('function ' + fn.replace(/[()]/g, '\\$&') + ' \\{\\s*\\n\\s*if \\(DEMO\\) return;'), fn);
  assert.match(src('js/ai.js'), /if \(DEMO\) return \{ ok: true, fallback: true, source: 'local'/);   // the AI uses the local guide, not /api/ai
  assert.match(src('js/demoflag.js'), /sessionStorage/);
});

test('first visit: the choice appears after 8 to 15 seconds, only to someone with nothing yet', () => {
  const m = src('js/main.js');
  assert.match(m, /8000 \+ Math\.floor\(Math\.random\(\) \* 7000\)/);
  assert.match(m, /if \(DEMO \|\| S\.onb \|\| S\.sessions\.length\) return;/);
  assert.match(m, /Explore with sample data/);
});
