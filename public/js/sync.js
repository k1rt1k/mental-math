// Cloud sync against /api/sync (Netlify Function + Blobs). One learner per device;
// the device's personal sync password selects the learner's isolated cloud store.
import { S, replaceState, mergeStates, migrate, persist, onSave, prefsSig, LEGACY_ACTIVE_USER } from './state.js';

// One sync credential per device. The credential itself selects the person's
// isolated server-side store (SYNC_KEY, SYNC_KEY_SISTER, etc.).
import { DEMO } from './demoflag.js';
export function migrateLegacySyncKey(storage = localStorage, selectedUser = LEGACY_ACTIVE_USER) {
  const marker = 'mmTrainer.v14.singleUserSync.v1';
  if (storage[marker]) return false;
  if (selectedUser === '2') {
    const selected = storage['mmTrainer.sync.user_2'];
    const previous = storage['mmTrainer.sync'];
    if (previous && previous !== selected && !storage['mmTrainer.legacy.sync.profile1']) {
      storage['mmTrainer.legacy.sync.profile1'] = previous;
    }
    if (selected) storage['mmTrainer.sync'] = selected;
    else { try { delete storage['mmTrainer.sync']; } catch { /* ignore */ } }
  }
  storage[marker] = '1';
  return true;
}
try { migrateLegacySyncKey(); } catch { /* sync remains available for manual setup */ }
export const syncStorageKey = () => 'mmTrainer.sync';
/** Shortest key accepted when one is chosen or changed. Keep in step with netlify/lib/auth.mjs. */
export const MIN_KEY_LENGTH = 12;
export const keyProblem = (key) => {
  const k = String(key || '').trim();
  if (k.length < MIN_KEY_LENGTH) return `Use at least ${MIN_KEY_LENGTH} characters.`;
  if (new Set(k.toLowerCase()).size < 5) return 'Use a key with more variety than that.';
  return '';
};
export const syncKey = () => { try { return localStorage[syncStorageKey()] || ''; } catch (e) { return ''; } };
export function setSyncKey(k) {
  try { k ? (localStorage[syncStorageKey()] = k) : localStorage.removeItem(syncStorageKey()); } catch (e) { /* storage blocked */ }
  epoch++; busy = false; conflicts = 0; writeCursor(null); fullNext = false; etag = ''; dirty = true;      // anything still in flight belongs to the old key and must not touch this account
  synced = false; weakKey = false; status = { kind: k ? 'busy' : 'off', msg: '', at: 0 };
  emit();
}

/**
 * Delta saves. The cursor says "every session of mine with t <= cursor.t is on the server (in erase epoch cursor.w)".
 * A save then sends only the newer sessions plus a count/sum fingerprint of the whole history. The server unions them and
 * answers 409 if the fingerprint disagrees, in which case the next save is a full one. Anything unusual (no cursor, a new
 * erase, a new key) is simply a full save, which is what every save used to be.
 */
const CURSOR = 'mmTrainer.sync.cursor';
const readCursor = () => { try { const c = JSON.parse(localStorage[CURSOR]); return c && Number.isFinite(c.t) ? c : null; } catch (e) { return null; } };
const writeCursor = (c) => { try { c ? (localStorage[CURSOR] = JSON.stringify(c)) : localStorage.removeItem(CURSOR); } catch (e) { /* storage blocked: every save is full */ } };
export const chkOf = (rows) => rows.reduce((a, x) => a + (+x.t % 1e9), 0);
export const maxT = (rows) => rows.reduce((m, x) => Math.max(m, +x.t || 0), 0);
/** The body to PUT: a delta when the cursor allows it and it is actually smaller, otherwise the whole state. */
export function pushBody(st, cursor, full = false) {
  const w = st.wipe || 0;
  if (full || !cursor || cursor.w !== w || !st.sessions.length) return { body: st, delta: false };
  const add = st.sessions.filter((x) => +x.t > cursor.t);
  if (add.length * 2 > st.sessions.length) return { body: st, delta: false };
  const { sessions, ...rest } = st;
  return { body: { ...rest, add, n: sessions.length, chk: chkOf(sessions) }, delta: true };
}
/** gzip a body when the browser can and it is big enough to matter. The server recognises gzip by its first bytes. */
export async function packBody(json, can = typeof CompressionStream != 'undefined') {
  if (!can || json.length < 2048) return { body: json, gz: false };
  try { return { body: await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(), gz: true }; }
  catch (e) { return { body: json, gz: false }; }
}

let weakKey = false, synced = false, busy = false, epoch = 0, conflicts = 0, pushT, fullNext = false, etag = '', gzipOk = true, dirty = true, saves = 0, guard = () => false, onChange = () => {};
/** True when the server says this key is shorter than the current minimum (a key set up before the rule). */
export const isWeakKey = () => weakKey;
export let status = { kind: DEMO ? 'ok' : syncKey() ? 'busy' : 'off', msg: '', at: DEMO ? Date.now() : 0 };   // sample mode shows a healthy, simulated sync and never calls the server   // kind: off | busy | ok | offline | key | locked
const subs = new Set();
const emit = () => subs.forEach((f) => f(status));
export const onStatus = (f) => { subs.add(f); return () => subs.delete(f); };
export const configure = (opts) => { if (opts.guard) guard = opts.guard; if (opts.onChange) onChange = opts.onChange; };

export const statusText = () => {
  const t = status.at ? new Date(status.at).toTimeString().slice(0, 5) : '';
  return { off: 'Sync off', busy: 'Syncing…', ok: 'Synced ' + t, offline: 'Offline, will retry', key: 'Wrong sync key', locked: 'Too many wrong keys, try later' }[status.kind];
};
const set = (kind) => { status = { kind, at: kind == 'ok' ? Date.now() : status.at }; emit(); };

class HttpError extends Error { constructor(code) { super('http' + code); this.code = code; } }
async function api(method, body, query = '') {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 15000);
  try {
    const json = body ? JSON.stringify(body) : undefined;
    let pk = json ? await packBody(json, gzipOk && typeof CompressionStream != 'undefined') : { body: undefined, gz: false };
    const go = () => fetch('/api/sync' + query, { method, headers: { 'x-sync-key': syncKey(), 'content-type': 'application/json', ...(pk.gz ? { 'x-sync-encoding': 'gzip' } : {}) }, body: pk.body, signal: ctl.signal });
    let r = await go();
    if (r.status == 400 && pk.gz) { gzipOk = false; pk = { body: json, gz: false }; r = await go(); }   // a server that does not understand gzip: send plain from now on
    if (!r.ok) throw new HttpError(r.status);
    return await r.json();
  } finally { clearTimeout(to); }
}
// 401 is a wrong key; 429 is the server's limit on wrong keys (it also refuses a correct one for a while), so neither is "offline".
const fail = (e) => set(e instanceof HttpError && e.code == 401 ? 'key' : e instanceof HttpError && e.code == 429 ? 'locked' : 'offline');

export async function push() {
  if (DEMO) return;
  if (!syncKey() || !synced || guard()) return;
  const ep = epoch, sv = saves, sentMax = maxT(S.sessions), sentWipe = S.wipe || 0;
  const { body, delta } = pushBody(S, readCursor(), fullNext);
  try {
    const r = await api('PUT', body);
    if (ep != epoch) return;
    conflicts = 0; fullNext = false; if (saves == sv) dirty = false;
    if (r && r.etag) etag = r.etag; else etag = '';
    writeCursor({ t: sentMax, w: sentWipe });
    set('ok');
  } catch (e) {
    if (ep != epoch) return;
    // Server has newer sessions (or, for a delta, a different history): merge first, then push again. Allowed even from
    // inside a pull (busy), twice at most. After a refused delta the retry is a full save.
    if (e instanceof HttpError && e.code == 409 && conflicts < 2) { conflicts++; synced = true; if (delta) fullNext = true; await pull(true); return; }
    conflicts = 0;
    fail(e);
  }
}
export function pushSoon() { if (!syncKey() || !synced) return; clearTimeout(pushT); pushT = setTimeout(push, 1200); }

export async function pull(afterConflict = false) {
  if (DEMO) return;
  if (!syncKey() || guard() || (busy && !afterConflict)) return;
  const ep = epoch;
  busy = true;
  if (!status.at) set('busy');
  try {
    // Ask only for what changed: with the version we already hold, an idle poll costs a few bytes.
    const res = await api('GET', null, etag && !afterConflict ? '?etag=' + encodeURIComponent(etag) : '');
    if (ep != epoch) return;            // the key changed while we waited: this answer is for another account
    set('ok');                          // reachable and authorised; a failing push below turns this into offline/key
    if (res.unchanged) { if (dirty) await push(); if (ep == epoch) busy = false; return; }
    const r = res.data; etag = res.etag || ''; weakKey = !!res.weak;
    if (r && r.sk && Array.isArray(r.sessions)) {
      const before = S.sessions.length, uBefore = S.u || 0, prefsBefore = prefsSig();
      replaceState(mergeStates(S, r));
      persist();
      synced = true;
      // A settings change from another device must repaint even when its timestamp is older than our last save.
      if ((r.u || 0) > uBefore || S.sessions.length != before || prefsSig() != prefsBefore) onChange();
      // Push when the server is missing anything we hold, including a newer setting of ours.
      // dirty first: if this push fails (offline), the next "unchanged" poll must still retry it.
      if (!afterConflict && (S.sessions.length != r.sessions.length || S.u != r.u || prefsSig() != prefsSig(migrate(r)))) { dirty = true; await push(); }
      else if (afterConflict) { dirty = true; await push(); }
    } else { synced = true; dirty = true; await push(); }
  } catch (e) { if (ep == epoch) fail(e); }
  if (ep == epoch) busy = false;
}

/** Manual "sync now" from the UI. */
export async function syncNow() {
  if (DEMO) { status = { kind: 'ok', at: Date.now() }; emit(); return true; }
  if (!syncKey()) return false;
  clearTimeout(pushT);
  if (synced) await push();
  await pull();
  return status.kind == 'ok';
}

/**
 * Learner and key management (/api/keys). Resolves { status, json } for any HTTP answer instead of throwing, so the caller can
 * tell "not the main account" (403) from "wrong key" (401) from "too many tries" (429). Rejects only when the network fails.
 */
export async function keysApi(method, { body, query = '' } = {}) {
  const r = await fetch('/api/keys' + query, { method, headers: { 'x-sync-key': syncKey(), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let json = {}; try { json = await r.json(); } catch (e) { /* an empty or non-JSON body */ }
  return { status: r.status, json };
}

/** Fetch the server's daily safety copy (for the "restore" action). */
export async function fetchBackup() {
  const r = await api('GET', null, '?backup=1');
  return r && r.state && Array.isArray(r.state.sessions) ? r : null;
}

onSave((ev) => { if (ev == 'saved') { saves++; dirty = true; pushSoon(); } });
export function startSync() {
  if (DEMO) return;
  addEventListener('focus', () => pull());
  addEventListener('online', () => pull());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
  setInterval(pull, 3e5);
  pull();
}

/** The Daily leaderboard (opt-in; see netlify/lib/board.mjs). Never throws: { status, json } with status 0 when the server could not be reached. */
export async function boardApi(method, { body, query = '' } = {}) {
  try {
    const r = await fetch('/api/board' + query, { method, headers: { 'x-sync-key': syncKey(), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    let json = {}; try { json = await r.json(); } catch (e) { /* an empty or non-JSON body */ }
    return { status: r.status, json };
  } catch (e) { return { status: 0, json: {} }; }
}
