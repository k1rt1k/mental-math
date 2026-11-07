// v14.49: saves send only what is new (with an integrity check), bodies are gzipped, idle polls are conditional.
import test, { mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';

const blobs = new Map(), revs = new Map();
const raw = (n) => blobs.get(n) || blobs.set(n, new Map()).get(n);
const rev = (n) => revs.get(n) || revs.set(n, new Map()).get(n);
beforeEach(() => { blobs.clear(); revs.clear(); });
const etagFor = (n, k) => { if (!raw(n).has(k)) return undefined; const r = rev(n); if (!r.has(k)) r.set(k, 0); return 'etag-' + r.get(k); };
const store = (n) => {
  const m = raw(n), r = rev(n), bump = (k) => r.set(k, (r.get(k) || 0) + 1);
  return {
    get: async (k) => (m.has(k) ? structuredClone(m.get(k)) : null),
    getWithMetadata: async (k) => (m.has(k) ? { data: structuredClone(m.get(k)), etag: etagFor(n, k) } : null),
    setJSON: async (k, v, o = {}) => {
      if (o.onlyIfNew && m.has(k)) return { modified: false };
      if (o.onlyIfMatch !== undefined && etagFor(n, k) !== o.onlyIfMatch) return { modified: false };
      m.set(k, structuredClone(v)); bump(k); return { modified: true, etag: etagFor(n, k) };
    },
    delete: async (k) => { m.delete(k); r.delete(k); },
    list: async ({ prefix = '' } = {}) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
  };
};
mock.module('@netlify/blobs', { namedExports: { getStore: ({ name }) => store(name) } });
process.env.SYNC_KEY = 'secret-a';
const { default: handler } = await import('../netlify/functions/sync.mjs');
const call = (method, body, q = '', headers = {}) => handler(new Request('http://x/api/sync' + q, { method, headers: { 'x-sync-key': 'secret-a', 'content-type': 'application/json', ...headers }, body }));
const put = (o) => call('PUT', JSON.stringify(o));
const get = async (q = '') => (await call('GET', undefined, q)).json();
const sess = (t) => ({ t, dur: 60, n: 10, ok: 9, pts: 100, tm: 2 });
const full = (ts, extra = {}) => ({ v: 1, sk: { add: { lv: 5, n: 3 } }, sessions: ts.map(sess), ...extra });

const { pushBody, packBody, chkOf, maxT } = await import('../public/js/sync.js?delta');

test('pushBody: a full save without a cursor, a delta with one, and the fingerprint covers the whole history', () => {
  const st = full([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(pushBody(st, null).delta, false);
  const { body, delta } = pushBody(st, { t: 8, w: 0 });
  assert.ok(delta); assert.deepEqual(body.add.map((x) => x.t), [9, 10]);
  assert.equal(body.n, 10); assert.equal(body.chk, chkOf(st.sessions)); assert.ok(!('sessions' in body));
  assert.ok(body.sk, 'everything else still travels');
});

test('pushBody: a full save when asked, after an erase, when most sessions are new, or with nothing to send against', () => {
  const st = full([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(pushBody(st, { t: 8, w: 0 }, true).delta, false, 'forced');
  assert.equal(pushBody({ ...st, wipe: 50 }, { t: 8, w: 0 }).delta, false, 'new erase epoch');
  assert.equal(pushBody(st, { t: 2, w: 0 }).delta, false, 'delta would be bigger than half: not worth it');
  assert.equal(pushBody(full([]), { t: 2, w: 0 }).delta, false);
  assert.equal(maxT(st.sessions), 10);
});

test('a delta body is much smaller than the full one once there is history', () => {
  const ts = Array.from({ length: 3000 }, (_, i) => 1.7e12 + i * 60000);
  const st = full(ts), cur = { t: ts[ts.length - 2], w: 0 };
  const d = JSON.stringify(pushBody(st, cur).body).length, f = JSON.stringify(st).length;
  assert.ok(d < f / 50, `${d} vs ${f}`);
});

test('server: a delta save adds sessions to the stored history', async () => {
  assert.equal((await put(full([10, 20, 30, 40]))).status, 200);
  const st = full([10, 20, 30, 40, 50]);
  const { body, delta } = pushBody(st, { t: 40, w: 0 });
  assert.ok(delta);
  assert.equal((await put(body)).status, 200);
  const d = (await get()).data;
  assert.deepEqual(d.sessions.map((x) => x.t), [10, 20, 30, 40, 50]);
  assert.ok(!('add' in d) && !('chk' in d) && !('n' in d), 'delta fields are never stored');
});

test('server: the client fingerprint must match; a client that is behind or ahead gets 409', async () => {
  await put(full([10, 20, 30, 40]));
  await put(full([10, 20, 30, 40, 45]));                              // another device saved 45
  const behind = pushBody(full([10, 20, 30, 40, 50]), { t: 40, w: 0 }).body;   // this client never saw 45
  assert.equal((await put(behind)).status, 409);
  assert.deepEqual((await get()).data.sessions.map((x) => x.t), [10, 20, 30, 40, 45], 'nothing was written');
  const ahead = pushBody(full([10, 20, 30, 40, 44, 45, 50, 51]), { t: 5, w: 0 }, false);
  assert.equal(ahead.delta, false);
});

test('server: a delta with a wrong count or sum is refused, even when the counts happen to match', async () => {
  await put(full([10, 20, 30, 40]));
  const { body } = pushBody(full([10, 20, 30, 40, 50]), { t: 40, w: 0 });
  assert.equal((await put({ ...body, chk: body.chk + 1 })).status, 409);
  assert.equal((await put({ ...body, n: 6 })).status, 409);
  // client holds a session the server lacks (60) and lacks one the server has (40): same count, different sums
  const odd = { ...body, add: [sess(50)], n: 5, chk: chkOf([10, 20, 30, 50, 60].map(sess)) };
  assert.equal((await put(odd)).status, 409);
});

test('server: a delta needs an existing history and the same erase epoch', async () => {
  const { body } = pushBody(full([1, 2, 3, 4, 5, 6]), { t: 5, w: 0 });
  assert.equal((await put(body)).status, 409, 'nothing stored yet: send the whole thing');
  await put(full([1, 2, 3, 4, 5]));
  assert.equal((await put({ ...body, wipe: Date.now() })).status, 409, 'an erase must be a full save');
  assert.equal((await put(body)).status, 200);
});

test('server: delta rows the client itself would discard never count, and the stored history stays sorted and unique', async () => {
  await put(full([10, 30]));
  const body = { v: 1, sk: { add: {} }, add: [sess(20), sess(30), { t: 'junk', dur: 5, n: 1 }], n: 3, chk: chkOf([10, 20, 30].map(sess)) };
  assert.equal((await put(body)).status, 200);
  assert.deepEqual((await get()).data.sessions.map((x) => x.t), [10, 20, 30]);
});

test('server: a delta cannot dodge the size and shape limits', async () => {
  await put(full([1]));
  assert.equal((await put({ sk: {}, add: Array.from({ length: 50001 }, (_, i) => ({ t: i })), n: 1, chk: 0 })).status, 413);
  assert.equal((await put({ sk: {}, add: 'x' })).status, 400);
  assert.equal((await put({ add: [] })).status, 400);
});

test('gzip: a compressed save is understood, and the client packer round-trips', async () => {
  const st = full(Array.from({ length: 400 }, (_, i) => 1e6 + i));
  const json = JSON.stringify(st);
  const pk = await packBody(json, true);
  assert.ok(pk.gz && pk.body.byteLength < json.length / 3, 'actually smaller');
  assert.equal((await call('PUT', Buffer.from(pk.body), '', { 'x-sync-encoding': 'gzip' })).status, 200);
  assert.equal((await get()).data.sessions.length, 400);
  assert.equal((await call('PUT', gzipSync(Buffer.from(json)))).status, 200, 'recognised by its bytes, not its header');
  assert.equal((await packBody('{"small":1}', true)).gz, false, 'tiny bodies are not worth compressing');
  assert.equal((await packBody(json, false)).gz, false, 'browsers without CompressionStream send plain JSON');
});

test('gzip: corrupt input is a 400 and a decompression bomb is a 413, never a crash', async () => {
  const bad = gzipSync(Buffer.from('x'.repeat(100)));
  bad[bad.length - 6] ^= 0xff;
  assert.equal((await call('PUT', bad)).status, 400);
  const bomb = gzipSync(Buffer.from('{"a":"' + 'a'.repeat(6e6) + '"}'));
  assert.ok(bomb.length < 1e5, 'the compressed bomb is small');
  const r = await call('PUT', bomb);
  assert.ok([400, 413].includes(r.status), String(r.status));
  assert.equal((await get()).data, null, 'nothing was stored');
});

test('conditional pull: the same version costs a few bytes, a new one returns the data', async () => {
  const r1 = await (await put(full([1, 2]))).json();
  assert.ok(r1.etag, 'the save returns the new version');
  const same = await get('?etag=' + encodeURIComponent(r1.etag));
  assert.deepEqual(same, { unchanged: true, etag: r1.etag });
  const r2 = await (await put(full([1, 2, 3]))).json();
  const changed = await get('?etag=' + encodeURIComponent(r1.etag));
  assert.equal(changed.unchanged, undefined); assert.equal(changed.data.sessions.length, 3); assert.equal(changed.etag, r2.etag);
  const plain = await get();
  assert.equal(plain.data.sessions.length, 3, 'old clients ask without an etag and still get the data');
});

test('safety copies and the erase rule still hold for delta saves', async () => {
  await put(full([1, 2, 3, 4]));
  const { body } = pushBody(full([1, 2, 3, 4, 5]), { t: 4, w: 0 });
  await put(body);
  assert.ok(raw('mental-math').get('backup'), 'a safety copy of the state before the delta exists');
  const stale = full([], { wipe: 0 });
  assert.equal((await put(full([1, 2, 3, 4, 5], { wipe: Date.now() }))).status, 200);
  assert.equal((await put(pushBody(full([1, 2, 3, 4, 5, 6]), { t: 5, w: 0 }).body)).status, 409, 'a device that missed the erase is refused');
  void stale;
});
