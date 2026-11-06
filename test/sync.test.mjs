// Backend: the sync function, run against an in-memory stand-in for Netlify Blobs.
import test, { mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const blobs = new Map();                                   // name -> Map(key -> json)
const revs = new Map();                                    // name -> Map(key -> revision), the source of each ETag
const raw = (name) => blobs.get(name) || blobs.set(name, new Map()).get(name);
const rev = (name) => revs.get(name) || revs.set(name, new Map()).get(name);
beforeEach(() => { blobs.clear(); revs.clear(); });        // every test starts with an empty server

// ETags are revision numbers, so a conditional write really does fail when another writer got there first.
const etagFor = (name, k) => {
  if (!raw(name).has(k)) return undefined;
  const r = rev(name); if (!r.has(k)) r.set(k, 0);
  return 'etag-' + r.get(k);
};
const store = (name) => {
  const m = raw(name), r = rev(name), bump = (k) => r.set(k, (r.get(k) || 0) + 1);
  return {
    get: async (k) => (m.has(k) ? structuredClone(m.get(k)) : null),
    getWithMetadata: async (k) => (m.has(k) ? { data: structuredClone(m.get(k)), etag: etagFor(name, k) } : null),
    setJSON: async (k, v, opts = {}) => {
      if (opts.onlyIfNew && m.has(k)) return { modified: false };
      if (opts.onlyIfMatch !== undefined && etagFor(name, k) !== opts.onlyIfMatch) return { modified: false };
      m.set(k, structuredClone(v)); bump(k);
      return { modified: true, etag: etagFor(name, k) };
    },
    delete: async (k) => { m.delete(k); r.delete(k); },
    list: async ({ prefix = '' } = {}) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
  };
};
mock.module('@netlify/blobs', { namedExports: { getStore: ({ name }) => store(name) } });
process.env.SYNC_KEY = 'secret-a'; process.env.SYNC_KEY_SISTER = 'secret-b';
const { default: handler } = await import('../netlify/functions/sync.mjs');

const req = (method, key, body, q = '') => handler(new Request('http://x/api/sync' + q, { method, headers: { 'x-sync-key': key ?? '', 'content-type': 'application/json' }, body: body === undefined ? undefined : typeof body == 'string' ? body : JSON.stringify(body) }));
const sess = (t) => ({ t, dur: 60, n: 10, ok: 9, pts: 100, tm: 2 });
const state = (ts, extra = {}) => ({ v: 1, sk: { add: { lv: 5, n: 3 } }, sessions: ts.map(sess), ...extra });

test('rejects missing and wrong keys, accepts each configured key', async () => {
  assert.equal((await req('GET', '')).status, 401);
  assert.equal((await req('GET', 'nope')).status, 401);
  assert.equal((await req('GET', 'secret-a')).status, 200);
  assert.equal((await req('GET', 'secret-b')).status, 200);
});

test('each key has its own private store', async () => {
  assert.equal((await req('PUT', 'secret-a', state([1, 2]))).status, 200);
  assert.equal((await req('PUT', 'secret-b', state([9]))).status, 200);
  assert.deepEqual((await (await req('GET', 'secret-a')).json()).data.sessions.map((x) => x.t), [1, 2]);
  assert.deepEqual((await (await req('GET', 'secret-b')).json()).data.sessions.map((x) => x.t), [9]);
});

test('rejects malformed bodies', async () => {
  for (const bad of ['not json', '{}', JSON.stringify({ sk: {}, sessions: 'x' }), JSON.stringify({ sessions: [] }), 'null']) assert.equal((await req('PUT', 'secret-a', bad)).status, 400, bad);
  assert.equal((await req('PUT', 'secret-a', { sk: {}, sessions: Array.from({ length: 50001 }, (_, i) => ({ t: i })) })).status, 413);
});

test('refuses a save that would drop a session the server has (409), even when the counts are equal', async () => {
  await req('PUT', 'secret-a', state([10, 20, 30]));
  assert.equal((await req('PUT', 'secret-a', state([10, 20]))).status, 409, 'fewer sessions');
  assert.equal((await req('PUT', 'secret-a', state([10, 20, 99]))).status, 409, 'same count, different history');
  assert.equal((await req('PUT', 'secret-a', state([10, 20, 30, 40]))).status, 200, 'superset is fine');
});

test('a malformed old row on the server never blocks syncing forever', async () => {
  raw('mental-math').set('state', { sk: {}, sessions: [{ t: 5 }, { t: 'junk', dur: 5, n: 1 }, sess(7)] });   // first two are rows the client discards
  assert.equal((await req('PUT', 'secret-a', state([7]))).status, 200);
});

test('keeps a rolling safety copy and returns it', async () => {
  const s = raw('mental-math');
  s.delete('backup'); [...s.keys()].filter((k) => k.startsWith('backup-')).forEach((k) => s.delete(k));
  await req('PUT', 'secret-a', state([7, 8]));
  await req('PUT', 'secret-a', state([7, 8, 9]));
  const b = await (await req('GET', 'secret-a', undefined, '?backup=1')).json();
  assert.deepEqual(b.state.sessions.map((x) => x.t), [7, 8], 'backup holds the state from BEFORE the latest save');
  const keys = (await (await req('GET', 'secret-a', undefined, '?backups=1')).json()).keys;
  assert.equal(keys.length, 1); assert.match(keys[0], /^backup-\d{4}-\d{2}-\d{2}$/);
});

test('keeps only the last 7 daily copies', async () => {
  const s = raw('mental-math');
  await req('PUT', 'secret-a', state([7]));                 // a first save, so there is something to snapshot
  for (let d = 1; d <= 9; d++) s.set('backup-2020-01-0' + d, { at: 1, state: {} });
  s.set('backup', { at: 0, state: {} });                    // old enough to trigger a new snapshot
  assert.equal((await req('PUT', 'secret-a', state([7, 8]))).status, 200);
  const keys = (await (await req('GET', 'secret-a', undefined, '?backups=1')).json()).keys;
  assert.ok(keys.length <= 7, `kept ${keys.length}`);
});

test('state round-trips untouched (calibration flag and ratings survive the server)', async () => {
  const st = state([100, 200], { cal: 2, sk: { add: { lv: 4.9, pk: 4.9, acc: 0.9, spd: 1, n: 40 } } });
  assert.equal((await req('PUT', 'secret-a', st)).status, 200);
  assert.deepEqual((await (await req('GET', 'secret-a')).json()).data, st);
});

test('other methods are refused', async () => assert.equal((await req('DELETE', 'secret-a')).status, 405));

// v14.45: compare-and-swap. Two devices writing over the same state must not silently overwrite each other.
test('concurrent different writes: exactly one wins and the other gets 409', async () => {
  const [a, b] = await Promise.all([
    req('PUT', 'secret-a', state([1])),
    req('PUT', 'secret-a', state([2])),
  ]);
  assert.deepEqual([a.status, b.status].sort((x, y) => x - y), [200, 409], 'one write wins, the loser is told to merge');
  const kept = (await (await req('GET', 'secret-a')).json()).data.sessions.map((x) => x.t);
  assert.equal(kept.length, 1);
  assert.ok(kept[0] === 1 || kept[0] === 2, 'the winner is intact');
});

test('concurrent identical writes both succeed and leave one intact state', async () => {
  const [a, b] = await Promise.all([
    req('PUT', 'secret-a', state([1, 2])),
    req('PUT', 'secret-a', state([1, 2])),
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.deepEqual((await (await req('GET', 'secret-a')).json()).data.sessions.map((x) => x.t), [1, 2]);
});

test('a racing write that would drop the winning session is rejected, and the backup stays a valid prior state', async () => {
  assert.equal((await req('PUT', 'secret-a', state([1, 2]))).status, 200);
  const [a, b] = await Promise.all([
    req('PUT', 'secret-a', state([1, 2, 3])),
    req('PUT', 'secret-a', state([1, 2, 4])),
  ]);
  assert.deepEqual([a.status, b.status].sort((x, y) => x - y), [200, 409]);
  const final = (await (await req('GET', 'secret-a')).json()).data.sessions.map((x) => x.t);
  const winner = final.includes(3) ? 3 : 4;
  assert.deepEqual(final, [1, 2, winner], 'the winning write survives whole');
  const bk = await (await req('GET', 'secret-a', undefined, '?backup=1')).json();
  assert.deepEqual(bk.state.sessions.map((x) => x.t), [1, 2], 'the backup is the state from before the winning write');
});
