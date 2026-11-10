// Turning reminders on is two steps: keep the switch locally, then register the subscription with the server.
// If the server refuses (bad key or an outage), the local switch must not stay on and pretend it worked.
import test from 'node:test';
import assert from 'node:assert/strict';

const lsStore = {};
globalThis.localStorage = new Proxy(lsStore, {
  get: (t, k) => (k === 'getItem' ? (x) => t[x] ?? null : k === 'removeItem' ? (x) => delete t[x] : t[k]),
  set: (t, k, v) => ((t[k] = String(v)), true),
  deleteProperty: (t, k) => (delete t[k], true),
});
globalThis.addEventListener = () => {};
globalThis.document = { addEventListener() {}, hidden: false, querySelector: () => null, querySelectorAll: () => [] };
globalThis.matchMedia = () => ({ matches: false });
const sub = { toJSON: () => ({ endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } }) };
const reg = { pushManager: { getSubscription: async () => sub, subscribe: async () => sub } };
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { serviceWorker: { ready: Promise.resolve(reg) }, userAgent: 'node', platform: 'node', maxTouchPoints: 0 },
});
globalThis.PushManager = function PushManager() {};
globalThis.Notification = { permission: 'granted', requestPermission: async () => 'granted' };
globalThis.window = globalThis;

const { S, fresh, replaceState } = await import('../public/js/state.js');
const notify = await import('../public/js/notify.js');

function stubFetch(putStatus) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    calls.push({ url, method });
    if (method === 'GET') return new Response(JSON.stringify({ key: 'AQAB' }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response('no', { status: putStatus });
  };
  return calls;
}

const off = () => {
  replaceState(fresh());
  S.rem = { on: false, times: [{ h: 19, m: 0 }], days: [0, 1, 2, 3, 4, 5, 6] };
};

test('a server failure while enabling reminders leaves the device switch off', async () => {
  off();
  const calls = stubFetch(500);
  const r = await notify.enable([{ h: 9, m: 0 }]);
  assert.deepEqual(r, { ok: false, why: 'server' });
  assert.equal(S.rem.on, false, 'Settings must not show reminders on when they were never registered');
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'PUT']);
});

test('a rejected sync key also leaves reminders off', async () => {
  off();
  stubFetch(401);
  const r = await notify.enable([{ h: 9, m: 0 }]);
  assert.deepEqual(r, { ok: false, why: 'key' });
  assert.equal(S.rem.on, false);
});

test('the chosen time is kept so a retry does not ask again', async () => {
  off();
  stubFetch(500);
  await notify.enable([{ h: 8, m: 30 }]);
  assert.deepEqual(S.rem.times, [{ h: 8, m: 30 }]);
});
