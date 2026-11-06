// Cloud sync against /api/sync (Netlify Function + Blobs). One learner per device;
// the device's personal sync password selects the learner's isolated cloud store.
import { S, replaceState, mergeStates, persist, onSave, LEGACY_ACTIVE_USER } from './state.js';

// One sync credential per device. The credential itself selects the person's
// isolated server-side store (SYNC_KEY, SYNC_KEY_SISTER, etc.).
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
export const syncKey = () => { try { return localStorage[syncStorageKey()] || ''; } catch (e) { return ''; } };
export function setSyncKey(k) {
  try { k ? (localStorage[syncStorageKey()] = k) : localStorage.removeItem(syncStorageKey()); } catch (e) { /* storage blocked */ }
  epoch++; busy = false; conflicts = 0;      // anything still in flight belongs to the old key and must not touch this account
  synced = false; status = { kind: k ? 'busy' : 'off', msg: '', at: 0 };
  emit();
}

let synced = false, busy = false, epoch = 0, conflicts = 0, pushT, guard = () => false, onChange = () => {};
export let status = { kind: syncKey() ? 'busy' : 'off', msg: '', at: 0 };   // kind: off | busy | ok | offline | key
const subs = new Set();
const emit = () => subs.forEach((f) => f(status));
export const onStatus = (f) => { subs.add(f); return () => subs.delete(f); };
export const configure = (opts) => { if (opts.guard) guard = opts.guard; if (opts.onChange) onChange = opts.onChange; };

export const statusText = () => {
  const t = status.at ? new Date(status.at).toTimeString().slice(0, 5) : '';
  return { off: 'Sync off', busy: 'Syncing…', ok: 'Synced ' + t, offline: 'Offline, will retry', key: 'Wrong sync key' }[status.kind];
};
const set = (kind) => { status = { kind, at: kind == 'ok' ? Date.now() : status.at }; emit(); };

class HttpError extends Error { constructor(code) { super('http' + code); this.code = code; } }
async function api(method, body, query = '') {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch('/api/sync' + query, { method, headers: { 'x-sync-key': syncKey(), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
    if (!r.ok) throw new HttpError(r.status);
    return await r.json();
  } finally { clearTimeout(to); }
}
const fail = (e) => set(e instanceof HttpError && e.code == 401 ? 'key' : 'offline');

export async function push() {
  if (!syncKey() || !synced || guard()) return;
  const ep = epoch;
  try { await api('PUT', S); if (ep != epoch) return; conflicts = 0; set('ok'); }
  catch (e) {
    if (ep != epoch) return;
    // Server has newer sessions: merge first, then push again. Allowed even from inside a pull (busy), twice at most.
    if (e instanceof HttpError && e.code == 409 && conflicts < 2) { conflicts++; synced = true; await pull(true); return; }
    conflicts = 0;
    fail(e);
  }
}
export function pushSoon() { if (!syncKey() || !synced) return; clearTimeout(pushT); pushT = setTimeout(push, 1200); }

export async function pull(afterConflict = false) {
  if (!syncKey() || guard() || (busy && !afterConflict)) return;
  const ep = epoch;
  busy = true;
  if (!status.at) set('busy');
  try {
    const r = (await api('GET')).data;
    if (ep != epoch) return;            // the key changed while we waited: this answer is for another account
    set('ok');                          // reachable and authorised; a failing push below turns this into offline/key
    if (r && r.sk && Array.isArray(r.sessions)) {
      const before = S.sessions.length, uBefore = S.u || 0;
      replaceState(mergeStates(S, r));
      persist();
      synced = true;
      if ((r.u || 0) > uBefore || S.sessions.length != before) onChange();
      if (!afterConflict && (S.sessions.length != r.sessions.length || S.u != r.u)) await push();
      else if (afterConflict) await push();
    } else { synced = true; await push(); }
  } catch (e) { if (ep == epoch) fail(e); }
  if (ep == epoch) busy = false;
}

/** Manual "sync now" from the UI. */
export async function syncNow() {
  if (!syncKey()) return false;
  clearTimeout(pushT);
  if (synced) await push();
  await pull();
  return status.kind == 'ok';
}

/** Fetch the server's daily safety copy (for the "restore" action). */
export async function fetchBackup() {
  const r = await api('GET', null, '?backup=1');
  return r && r.state && Array.isArray(r.state.sessions) ? r : null;
}

onSave((ev) => { if (ev == 'saved') pushSoon(); });
export function startSync() {
  addEventListener('focus', () => pull());
  addEventListener('online', () => pull());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
  setInterval(pull, 3e5);
  pull();
}
