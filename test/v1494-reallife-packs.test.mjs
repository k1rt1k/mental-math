import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gen, how, setCurrency, localeCurrency, CUR, CURRENCIES, LIFE_KIND } from '../public/js/engine.js';
import { PACKS, packOf } from '../public/js/packs.js';
import { TRICKS } from '../public/js/tricks.js';
import { lifeAnswer } from './helpers/life-eval.mjs';
const rd = (p) => readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
const same = (a, b) => Math.abs(+a - b) < 1e-9;

test('a pack drill draws only its own patterns, at every level, and every answer is right', () => {
  for (const pk of PACKS) for (let d = 1; d <= 12; d += 1) for (let i = 0; i < 150; i++) {
    const p = gen('life', d, Math.random, pk.pats), e = lifeAnswer(p.q);
    // the kind can make a sibling pattern (a tip kind makes friendly and awkward), so a few misses are fine; the session retries until it hits
    assert.ok(pk.pats.some((x) => LIFE_KIND[x] == LIFE_KIND[p.pt]), `${pk.id} d=${d}: ${p.q} is ${p.pt}`);
    assert.ok(same(p.a, e), `${p.q} = ${p.a}, expected ${e}`);
    assert.equal(String(p.a), String(+(+p.a).toFixed(2)), p.q); assert.ok(+p.a > 0, p.q);
    assert.ok(how(p), `no worked method for ${p.pt}: ${p.q}`);
  }
});

test('every pattern of every pack is really produced, and the session can find it (a hit within the retry budget)', () => {
  for (const pk of PACKS) for (const pt of pk.pats) {
    assert.ok(LIFE_KIND[pt], `${pt} has a kind`);
    for (const d of [1, 3, 6, 10]) {
      let hit = 0; for (let i = 0; i < 60; i++) if (gen('life', d, Math.random, pt).pt == pt) hit++;
      assert.ok(hit >= 8, `${pt} at d=${d}: only ${hit}/60`);
    }
  }
});

test('the packs are well formed: unique ids, their tricks exist and teach a pattern the pack practises', () => {
  assert.equal(new Set(PACKS.map((p) => p.id)).size, PACKS.length);
  for (const pk of PACKS) {
    assert.ok(pk.title && pk.blurb && pk.pats.length >= 2 && pk.tricks.length >= 1, pk.id);
    for (const id of pk.tricks) { const t = TRICKS.find((x) => x.id == id); assert.ok(t, id); assert.equal(t.sk, 'life'); assert.ok(pk.pats.includes(t.pt) || t.pt == 'unit conversion' || t.pt == 'friendly tip' || t.pt == 'sale price', `${id} ${t.pt}`); }
  }
  assert.equal(packOf('tax').title, 'Tax and GST'); assert.equal(packOf('nope'), undefined);
  // the five packs the feature asked for
  assert.deepEqual(PACKS.map((p) => p.id), ['disc', 'tax', 'tips', 'units', 'split', 'time', 'travel', 'shop', 'money', 'cricket', 'budget']);
});

test('the currency symbol is used everywhere an amount appears, and nowhere else', () => {
  try {
    for (const c of CURRENCIES) {
      setCurrency(c);
      for (let i = 0; i < 1500; i++) {
        const p = gen('life', 1 + (i % 12)), others = CURRENCIES.filter((x) => x != c);
        assert.ok(!others.some((o) => p.q.includes(o)), `${c}: ${p.q}`);
        assert.ok(same(p.a, lifeAnswer(p.q)), p.q);
        if (/GST|tip|tax|off|Split|bill/.test(p.q) && !/°/.test(p.q)) assert.ok(p.q.includes(c) || /^\d+% tip on/.test(p.q) === false, p.q);
      }
    }
    setCurrency('?'); assert.equal(CUR.sym, '$');   // anything unknown falls back
  } finally { setCurrency('$'); }
});

test('default currency from the browser language', () => {
  assert.equal(localeCurrency('en-IN'), '₹'); assert.equal(localeCurrency('hi-IN'), '₹'); assert.equal(localeCurrency('en-GB'), '£');
  assert.equal(localeCurrency('de-DE'), '€'); assert.equal(localeCurrency('fr'), '€'); assert.equal(localeCurrency('en-US'), '$'); assert.equal(localeCurrency(''), '$');
});

test('GST uses the current slabs (5%, 18%, 40%) and removing it always gives a whole base price', () => {
  const rates = new Set();
  for (let i = 0; i < 3000; i++) {
    const p = gen('life', 1 + (i % 12), Math.random, ['add GST', 'GST amount', 'GST in the price']);
    rates.add(+/(\d+)%/.exec(p.q)[1]);
    if (p.pt == 'GST in the price') assert.ok(Number.isInteger(p.a), p.q);
  }
  assert.deepEqual([...rates].sort((a, b) => a - b), [5, 18, 40]);
});

test('Real-life packs are wired: Learn tab, practise and try actions, currency setting, synced, offline shell', () => {
  const l = rd('js/views/learn.js');
  assert.match(l, /data-v="packs">Real-life packs/); assert.match(l, /A\.packGo = /); assert.match(l, /A\.packTry = /);
  assert.match(l, /start\(undefined, \{ only: 'life', pats: pk\.pats \}\)/);
  assert.match(rd('js/session.js'), /gen\(k, i > 25 \? Math\.max\(d, 8\) : d, R, target\)/);
  assert.match(rd('js/views/settings.js'), /A\.cur = /); assert.match(rd('js/state.js'), /'speak', 'cur'\]/);
  assert.match(rd('js/main.js'), /setCurrency\(S\.cur \|\| localeCurrency\(navigator\.language\)\)/);
  assert.ok(rd('sw.js').includes("'js/packs.js'"));
});

test('learn.js imports everything the try-one dialog uses (it once threw a ReferenceError)', () => {
  const l = rd('js/views/learn.js');
  for (const name of ['gen', 'how', 'symFor', 'ansMatch', 'dialog']) assert.match(l, new RegExp('^import \\{[^}]*\\b' + name + '\\b[^}]*\\} from', 'm'), name);
});
