// v14.51: the sync key is no longer an unlimited-guess password. Wrong keys are throttled per address, short keys are refused when
// chosen, and the main account can make and turn off learner keys from inside the app.
import test, { mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const blobs = new Map(), revs = new Map();
let broken = false;                                          // simulate the blob service being down
const raw = (n) => blobs.get(n) || blobs.set(n, new Map()).get(n);
const rev = (n) => revs.get(n) || revs.set(n, new Map()).get(n);
beforeEach(() => { blobs.clear(); revs.clear(); broken = false; });
const etagFor = (n, k) => { if (!raw(n).has(k)) return undefined; const r = rev(n); if (!r.has(k)) r.set(k, 0); return 'etag-' + r.get(k); };
const store = (n) => {
  const m = raw(n), r = rev(n), bump = (k) => r.set(k, (r.get(k) || 0) + 1), down = () => { if (broken && n === 'mental-math-auth') throw new Error('blobs down'); };
  return {
    get: async (k) => { down(); return m.has(k) ? structuredClone(m.get(k)) : null; },
    getWithMetadata: async (k) => (m.has(k) ? { data: structuredClone(m.get(k)), etag: etagFor(n, k) } : null),
    setJSON: async (k, v, o = {}) => {
      down();
      if (o.onlyIfNew && m.has(k)) return { modified: false };
      if (o.onlyIfMatch !== undefined && etagFor(n, k) !== o.onlyIfMatch) return { modified: false };
      m.set(k, structuredClone(v)); bump(k); return { modified: true, etag: etagFor(n, k) };
    },
    delete: async (k) => { down(); m.delete(k); r.delete(k); },
    list: async ({ prefix = '' } = {}) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
  };
};
mock.module('@netlify/blobs', { namedExports: { getStore: ({ name }) => store(name) } });
mock.module('web-push', { defaultExport: { setVapidDetails() {}, sendNotification: async () => ({}) } });

const ADMIN = 'main-admin-key-0123', SISTER = 'sister-key-xyz-7890', OLD = 'short';
process.env.SYNC_KEY = ADMIN; process.env.SYNC_KEY_SISTER = SISTER; process.env.SYNC_KEY_OLD = OLD;
process.env.VAPID_PUBLIC_KEY = 'pub'; process.env.VAPID_PRIVATE_KEY = 'priv';
const { default: sync } = await import('../netlify/functions/sync.mjs');
const { default: keys } = await import('../netlify/functions/keys.mjs');
const { default: push } = await import('../netlify/functions/push.mjs');
const { default: cron } = await import('../netlify/functions/push-cron.mjs');
const { keyProblem: serverProblem, MIN_KEY_LENGTH } = await import('../netlify/lib/auth.mjs');
const { keyProblem: clientProblem, MIN_KEY_LENGTH: clientMin } = await import('../public/js/sync.js?v1451');
const { LIMIT } = await import('../netlify/lib/throttle.mjs');

const hdr = (key, ip, extra = {}) => ({ ...(key === undefined ? {} : { 'x-sync-key': key }), ...(ip ? { 'x-nf-client-connection-ip': ip } : {}), 'content-type': 'application/json', ...extra });
const S = (key, ip, method = 'GET', body) => sync(new Request('http://x/api/sync', { method, headers: hdr(key, ip), body: body && JSON.stringify(body) }));
const K = (key, method = 'GET', body, q = '', ip) => keys(new Request('http://x/api/keys' + q, { method, headers: hdr(key, ip), body: body && JSON.stringify(body) }));
const state = (ts = [1]) => ({ v: 1, sk: { add: { lv: 5, n: 3 } }, sessions: ts.map((t) => ({ t, dur: 60, n: 10, ok: 9, pts: 100, tm: 2 })) });

// ---------- throttling ----------
test('eight wrong keys lock the address; a correct key is refused while locked, with Retry-After', async () => {
  for (let i = 0; i < LIMIT.MAX_FAILS - 1; i++) assert.equal((await S('wrong-' + i, '1.1.1.1')).status, 401);
  const tip = await S('wrong-last', '1.1.1.1');
  assert.equal(tip.status, 429, 'the guess that reaches the limit already gets the lock');
  assert.ok(+tip.headers.get('retry-after') > 800);
  assert.match(await tip.text(), /Too many wrong keys/);
  assert.equal((await S(ADMIN, '1.1.1.1')).status, 429, 'a correct key does not get through while locked');
  assert.equal((await S(ADMIN, '2.2.2.2')).status, 200, 'another address is unaffected');
});

test('the lock ends on its own, and a correct key clears earlier wrong ones', async () => {
  for (let i = 0; i < LIMIT.MAX_FAILS; i++) await S('nope' + i, '3.3.3.3');
  assert.equal((await S(ADMIN, '3.3.3.3')).status, 429);
  const m = raw('mental-math-auth'), id = [...m.keys()][0];
  m.set(id, { ...m.get(id), until: Date.now() - 1 });
  assert.equal((await S(ADMIN, '3.3.3.3')).status, 200, 'expired lock');
  assert.equal(m.has(id), false, 'success wipes the count');
  for (let i = 0; i < LIMIT.MAX_FAILS - 1; i++) await S('x' + i, '4.4.4.4');
  assert.equal((await S(ADMIN, '4.4.4.4')).status, 200);
  assert.equal((await S('x', '4.4.4.4')).status, 401, 'one wrong key after a success is just one wrong key');
});

test('the count is per address window: old failures stop counting', async () => {
  for (let i = 0; i < LIMIT.MAX_FAILS - 1; i++) await S('old' + i, '5.5.5.5');
  const m = raw('mental-math-auth'), id = [...m.keys()][0];
  m.set(id, { ...m.get(id), first: Date.now() - LIMIT.WINDOW - 1 });
  assert.equal((await S('once-more', '5.5.5.5')).status, 401, 'starts a new window instead of locking');
});

test('a request with no key is never counted as a guess', async () => {
  for (let i = 0; i < 20; i++) assert.equal((await S(undefined, '6.6.6.6')).status, 401);
  assert.equal((await S(ADMIN, '6.6.6.6')).status, 200);
});

test('the limiter fails open: if its store is down nobody is locked out', async () => {
  broken = true;
  assert.equal((await S('wrong', '7.7.7.7')).status, 401);
  assert.equal((await S(ADMIN, '7.7.7.7')).status, 200);
});

test('only a hash of the address is stored', async () => {
  await S('wrong', '203.0.113.9');
  const ids = [...raw('mental-math-auth').keys()];
  assert.equal(ids.length, 1); assert.ok(!ids[0].includes('203.0.113.9')); assert.match(ids[0], /^ip-[0-9a-f]{32}$/);
});

test('/api/push shares the limit; an anonymous device (no key) still works', async () => {
  const P = (key, ip) => push(new Request('http://x/api/push', { method: 'PUT', headers: hdr(key, ip), body: JSON.stringify({ sub: { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } } }) }));
  assert.equal((await P(undefined, '8.8.8.8')).status, 200, 'anonymous device');
  for (let i = 0; i < LIMIT.MAX_FAILS; i++) await P('bad' + i, '8.8.8.8');
  assert.equal((await P(ADMIN, '8.8.8.8')).status, 429);
  assert.equal((await P(ADMIN, '9.9.9.9')).status, 200);
});

// ---------- minimum length ----------
test('server and client agree on what a long enough key is', () => {
  assert.equal(MIN_KEY_LENGTH, clientMin);
  for (const k of ['', 'short', '12345678901', 'aaaaaaaaaaaaaaaa', 'abababababababab', '  padded-shortish  ', 'a-good-long-key-9', 'k7f2-m9xq-3tpa-hv8e-r4nw'])
    assert.equal(!!serverProblem(k), !!clientProblem(k), JSON.stringify(k));
  assert.ok(serverProblem('short')); assert.ok(!serverProblem('a-good-long-key-9'));
});

test('a key set up before the rule still works, and the pull says it is short', async () => {
  const r = await S(OLD, '10.0.0.1');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).weak, true);
  assert.equal((await (await S(SISTER, '10.0.0.2')).json()).weak, undefined, 'a long key carries no flag');
});

// ---------- creating keys inside the app ----------
test('only the main account may manage learners; others are told so', async () => {
  assert.deepEqual(await (await K(SISTER)).json(), { admin: false });
  assert.equal((await K(SISTER, 'POST', { name: 'cousin' })).status, 403);
  assert.equal((await K(SISTER, 'DELETE', undefined, '?id=x')).status, 403);
  assert.equal((await K('wrong', 'GET', undefined, '', '11.0.0.1')).status, 401);
  assert.equal((await K(undefined)).status, 401);
});

test('the main account creates a learner: strong key, shown once, stored only as a hash, with its own private store', async () => {
  const r = await K(ADMIN, 'POST', { name: 'Riya' });
  assert.equal(r.status, 201);
  const { key, learner } = await r.json();
  assert.match(key, /^([a-z2-9]{4}-){4}[a-z2-9]{4}$/);
  assert.ok(!serverProblem(key));
  assert.equal(learner.id, 'riya');
  const saved = JSON.stringify([...raw('mental-math-learners').values()]);
  assert.ok(!saved.includes(key), 'the readable key is not stored');
  // the new key signs in to its own space
  assert.equal((await S(key, '12.0.0.1', 'PUT', state([5, 6]))).status, 200);
  assert.deepEqual((await (await S(key, '12.0.0.1')).json()).data.sessions.map((x) => x.t), [5, 6]);
  assert.ok(raw('mental-math-riya').has('state'));
  assert.equal((await (await S(ADMIN, '12.0.0.2')).json()).data, null, 'the main account does not see it');
  assert.deepEqual((await (await K(ADMIN)).json()).learners.map((l) => l.id), ['riya']);
  assert.equal((await K(key)).status, 200); assert.equal((await K(key, 'POST', { name: 'x1' })).status, 403, 'a made learner cannot make more');
});

test('names: too short, taken by a Netlify learner, "primary", or already made are refused', async () => {
  assert.equal((await K(ADMIN, 'POST', { name: 'a' })).status, 400);
  assert.equal((await K(ADMIN, 'POST', {})).status, 400);
  assert.equal((await K(ADMIN, 'POST', { name: 'Sister' })).status, 409);
  assert.equal((await K(ADMIN, 'POST', { name: 'old' })).status, 409);
  assert.equal((await K(ADMIN, 'POST', { name: 'primary' })).status, 409);
  assert.equal((await K(ADMIN, 'POST', { name: 'Riya' })).status, 201);
  assert.equal((await K(ADMIN, 'POST', { name: 'riya!' })).status, 409, 'same after tidying');
});

test('turning a key off stops it at once; the same name again gives a new key and the same progress', async () => {
  const a = await (await K(ADMIN, 'POST', { name: 'Kabir' })).json();
  await S(a.key, '13.0.0.1', 'PUT', state([1, 2, 3]));
  assert.equal((await K(ADMIN, 'DELETE', undefined, '?id=kabir')).status, 200);
  assert.equal((await S(a.key, '13.0.0.1')).status, 401);
  assert.equal((await K(ADMIN, 'DELETE', undefined, '?id=kabir')).status, 404);
  const b = await (await K(ADMIN, 'POST', { name: 'Kabir' })).json();
  assert.notEqual(a.key, b.key);
  assert.deepEqual((await (await S(b.key, '13.0.0.1')).json()).data.sessions.map((x) => x.t), [1, 2, 3]);
});

test('at most ten learners can be made in the app', async () => {
  for (let i = 0; i < 10; i++) assert.equal((await K(ADMIN, 'POST', { name: 'learner' + i })).status, 201);
  assert.equal((await K(ADMIN, 'POST', { name: 'one-too-many' })).status, 409);
});

test('wrong keys against /api/keys count toward the same limit', async () => {
  for (let i = 0; i < LIMIT.MAX_FAILS; i++) await K('guess' + i, 'GET', undefined, '', '14.0.0.1');
  assert.equal((await K(ADMIN, 'GET', undefined, '', '14.0.0.1')).status, 429);
});

test('reminders also reach learners made in the app', async () => {
  const { key } = await (await K(ADMIN, 'POST', { name: 'Mira' })).json();
  const sub = { endpoint: 'https://push.example/mira', keys: { p256dh: 'p', auth: 'a' } };
  const r = await push(new Request('http://x/api/push', { method: 'PUT', headers: hdr(key, '15.0.0.1'), body: JSON.stringify({ sub, times: [{ h: 0, m: 0 }], on: true }) }));
  assert.equal(r.status, 200);
  assert.ok([...raw('mental-math-mira').keys()].some((k) => k.startsWith('push-')));
  await cron();   // must walk the new learner's store without throwing
});
