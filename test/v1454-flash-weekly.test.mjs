import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeChain, roundPts, expr } from '../public/js/chain.js';

test('every flash chain adds up, never dips below zero, never repeats a number back to back, and respects the digit setting', () => {
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (const d of [1, 2, 3]) for (const c of [4, 6, 8, 10]) for (const neg of [0, 1]) for (let r = 0; r < 200; r++) {
    const ch = makeChain({ c, d, neg, s: 1000 }, rnd);
    assert.equal(ch.items.length, c);
    let run = 0;
    ch.items.forEach((q, i) => {
      run += q.sub ? -q.x : q.x;
      assert.ok(run >= 0, 'total stays non-negative');
      assert.ok(q.x >= (d == 1 ? 1 : 10 ** (d - 1)) && q.x < 10 ** d, 'digits');
      if (i) assert.notEqual(q.x, ch.items[i - 1].x);
      if (!neg || !i) assert.equal(q.sub, false);
    });
    assert.equal(run, ch.total);
    assert.ok(expr(ch).endsWith('= ' + ch.total));
  }
});

test('subtraction really happens when allowed, and points grow with count, digits and speed', () => {
  let seed = 3; const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  assert.ok(Array.from({ length: 50 }, () => makeChain({ c: 10, d: 2, neg: 1, s: 1000 }, rnd)).some((ch) => ch.items.some((q) => q.sub)));
  assert.ok(roundPts({ c: 8, d: 2, s: 1000 }) > roundPts({ c: 4, d: 2, s: 1000 }));
  assert.ok(roundPts({ c: 4, d: 3, s: 1000 }) > roundPts({ c: 4, d: 1, s: 1000 }));
  assert.ok(roundPts({ c: 4, d: 2, s: 450 }) > roundPts({ c: 4, d: 2, s: 1500 }));
});

test('Flash is wired: route, home tile, saved as a session, and kept out of pace and trend charts', () => {
  const rd = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
  assert.match(rd('js/views/flash.js'), /register\('flash', setup\)/);
  assert.match(rd('js/views/flash.js'), /m: 'flash'/);
  assert.match(rd('js/views/home.js'), /data-act="flash"/);
  assert.match(rd('js/main.js'), /import '\.\/views\/flash\.js'/);
  assert.match(rd('js/views/progress.js'), /s\.m != 'flash'/);
  assert.match(rd('js/stats.js'), /px = x\.filter\(\(s\) => s\.m != 'flash' && s\.m != 'est'\)/);
  for (const f of ['js/chain.js', 'js/weekly.js', 'js/weekdata.js', 'js/views/flash.js']) assert.ok(rd('sw.js').includes(`'${f}'`), f);
});

test('the weekly summary counts the last seven days against the seven before', async () => {
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const { S, fresh, replaceState } = await import('../public/js/state.js');
  const { weekData, weekLines, weekText } = await import('../public/js/weekdata.js');
  const NOW = Date.parse('2026-11-07T12:00:00'), D = 864e5;
  const mk = (ago, o = {}) => ({ t: NOW - ago * D, m: 'train', dur: 120, n: 20, ok: 18, ft: 18, pts: 300, tm: 2, by: {}, lv: {}, off: 0, ...o });
  replaceState(Object.assign(fresh(), { sessions: [mk(0.1), mk(1.2), mk(1.3, { m: 'flash', n: 5, ok: 4, pts: 90, dur: 100 }), mk(9, { n: 10, ok: 5 })] }));
  const w = weekData(NOW);
  assert.equal(w.sessions, 3); assert.equal(w.n, 45); assert.equal(w.days, 2); assert.equal(w.acc, Math.round((100 * 40) / 45));
  assert.equal(w.prev.sessions, 1); assert.equal(w.prev.acc, 50);
  assert.deepEqual(w.flash, { runs: 1, best: 90 });
  assert.match(weekText(w), /^My week in Mental Math\n2 of 7 days practised/);
  assert.ok(weekLines(w).some((l) => /vs last week/.test(l)));
  replaceState(fresh()); assert.equal(weekData(NOW).empty, true); assert.equal(weekText(weekData(NOW)), '');
});

test('the weekly card imports every weekdata helper it calls (a missing sgn crashed Progress once both weeks had sessions)', async () => {
  const wd = await import('../public/js/weekdata.js');
  const src = readFileSync(new URL('../public/js/weekly.js', import.meta.url), 'utf8');
  const imp = /import \{([^}]*)\} from '\.\/weekdata\.js'/.exec(src)[1].split(',').map((x) => x.trim());
  for (const name of Object.keys(wd)) if (new RegExp('\\b' + name + '\\(').test(src)) assert.ok(imp.includes(name), name + ' is used in weekly.js but not imported');
  assert.equal(wd.sgn(3), '+3'); assert.equal(wd.sgn(-2), '−2'); assert.equal(wd.sgn(0), '±0');
  // every bare helper weekly.js calls must exist somewhere it can reach
  assert.ok(typeof wd.sgn == 'function', 'sgn must be exported');
});
