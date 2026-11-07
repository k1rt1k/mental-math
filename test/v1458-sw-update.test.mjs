import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const swSrc = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8');

// Run the real sw.js against a small fake of the worker globals.
function boot({ net }) {
  const handlers = {}, store = new Map(), calls = { fetch: [], skip: 0, claim: 0, installReqs: [] };
  const cache = { put: async (r, res) => { store.set(new URL(r.url || r, 'https://x.test/').pathname, res); }, addAll: async (reqs) => { calls.installReqs.push(...reqs); reqs.forEach((q) => store.set('/' + q.url.replace('https://x.test/', ''), { ok: true, tag: 'precached' })); } };
  const ctx = {
    self: { addEventListener: (n, f) => { handlers[n] = f; }, skipWaiting: () => { calls.skip++; }, registration: {} },
    location: { origin: 'https://x.test' }, URL, Response: { error: () => ({ error: true }) },
    Request: class { constructor(u, o) { this.url = new URL(u, 'https://x.test/').href; this.cache = o && o.cache; } },
    clients: { claim: () => { calls.claim++; }, matchAll: async () => [] },
    caches: { open: async () => cache, keys: async () => ['mm-v0-1', 'mm-v14-58'], delete: async (k) => { calls.deleted = k; }, match: async (req, o) => { const u = new URL(req.url || req, 'https://x.test/'); const hit = store.get(u.pathname === '/' ? '/./' : u.pathname) || store.get(u.pathname); return o && o.ignoreSearch ? hit : hit; } },
    fetch: async (req) => { calls.fetch.push(req.url); return net(req); },
  };
  vm.createContext(ctx); vm.runInContext(swSrc.replace(/const C = '[^']+'/, "const C = 'mm-v14-58'"), ctx);
  const ev = (o) => { const w = []; return { ...o, waitUntil: (p) => w.push(p), respondWith: (p) => { ev.res = p; }, _w: w }; };
  return { handlers, calls, store, ev };
}
const get = (path, mode = 'cors') => ({ method: 'GET', url: 'https://x.test' + path, mode });

test('a new worker waits: install does not skipWaiting, and the shell is fetched fresh', async () => {
  const w = boot({ net: async () => ({ ok: true }) });
  const e = w.ev({}); w.handlers.install(e); await Promise.all(e._w);
  assert.equal(w.calls.skip, 0);
  assert.ok(w.calls.installReqs.length > 40 && w.calls.installReqs.every((r) => r.cache === 'reload'));
});

test('skipWaiting happens only when the page asks for it', () => {
  const w = boot({ net: async () => ({ ok: true }) });
  w.handlers.message({ data: { type: 'other' } }); assert.equal(w.calls.skip, 0);
  w.handlers.message({ data: { type: 'skipWaiting' } }); assert.equal(w.calls.skip, 1);
});

test('activate removes old caches and claims clients', async () => {
  const w = boot({ net: async () => ({ ok: true }) });
  const e = w.ev({}); w.handlers.activate(e); await Promise.all(e._w);
  assert.equal(w.calls.deleted, 'mm-v0-1'); assert.equal(w.calls.claim, 1);
});

test('cached files are served without touching the network, whatever the ?v= says', async () => {
  const w = boot({ net: async () => { throw new Error('offline'); } });
  const i = w.ev({}); w.handlers.install(i); await Promise.all(i._w);
  const e = w.ev({ request: get('/js/main.js?v=14.58') }); w.handlers.fetch(e);
  const r = await ev_res(w, e); assert.equal(r.tag, 'precached'); assert.equal(w.calls.fetch.length, 0);
});

test('a miss goes to the network and is stored; offline navigation falls back to index.html; /api/ is never intercepted', async () => {
  const w = boot({ net: async () => ({ ok: true, clone() { return this; }, tag: 'net' }) });
  const i = w.ev({}); w.handlers.install(i); await Promise.all(i._w);
  const e = w.ev({ request: get('/img/new.png') }); w.handlers.fetch(e);
  assert.equal((await ev_res(w, e)).tag, 'net'); assert.ok(w.store.has('/img/new.png'));
  const off = boot({ net: async () => { throw new Error('offline'); } });
  const i2 = off.ev({}); off.handlers.install(i2); await Promise.all(i2._w);
  const n = off.ev({ request: get('/somewhere', 'navigate') }); off.handlers.fetch(n);
  assert.equal((await ev_res(off, n)).tag, 'precached');
  const a = w.ev({ request: get('/api/board') }); w.ev.res = undefined; w.handlers.fetch(a);
  assert.equal(w.ev.res, undefined);
});
const ev_res = async (w, e) => { await Promise.resolve(); return w.ev.res; };

test('the page offers the update, defers it while playing, and reloads only when asked', () => {
  assert.match(main, /Update available, tap to reload/);
  assert.match(main, /isPlaying\(\) \|\| dialogOpen\(\)\) return void setTimeout\(offer/);
  assert.match(main, /postMessage\(\{ type: 'skipWaiting' \}\)/);
  assert.match(main, /controllerchange', \(\) => \{ if \(reloading\) location\.reload\(\)/);
  assert.match(main, /reg\.waiting/); assert.match(main, /updatefound/); assert.match(main, /reg\.update\(\)/);
  assert.doesNotMatch(swSrc, /self\.skipWaiting\(\); e\.waitUntil/);
  assert.doesNotMatch(swSrc, /AbortController|2500/);
});
