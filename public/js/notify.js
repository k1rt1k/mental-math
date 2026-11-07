// Daily reminders via Web Push. The browser holds a push subscription; our Netlify scheduler (push-cron)
// sends the reminder at the times you set here in the app. No account or sync key is needed.
import { S, save, onSave } from './state.js';
import { ymd } from './util.js';
import { streak } from './stats.js';
import { pendingChecks } from './paths.js';
import { syncKey } from './sync.js';

export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** What the Settings card should show. */
export async function state() {
  if (!canPush()) return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    return sub && S.rem && S.rem.on ? 'on' : 'off';
  } catch (e) { return 'off'; }
}

const b64 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } };

async function call(method, body) {
  const r = await fetch('/api/push', { method, headers: { ...(syncKey() ? { 'x-sync-key': syncKey() } : {}), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r;
}
/** The reminder settings, always in the current shape (older builds stored a single h/m). */
export const rem = () => {
  const r = S.rem || {};
  const times = Array.isArray(r.times) && r.times.length ? r.times : [{ h: r.h ?? 19, m: r.m ?? 0 }];
  return { on: !!r.on, times, days: Array.isArray(r.days) && r.days.length ? r.days : [0, 1, 2, 3, 4, 5, 6], skip: r.skip !== false, save: r.save !== false };
};
export const setRem = (patch) => { S.rem = { ...rem(), ...patch }; save(); refreshSoon(); };
const payload = (sub) => {
  const R = rem(), ts = S.sessions.length ? Math.max(...S.sessions.map((x) => x.t)) : 0;
  return { sub: sub.toJSON(), times: R.times, days: R.days, skip: R.skip, tz: tz(), last: ts ? ymd(ts) : '', streak: streak(), due: Object.values(S.weak).filter((w) => w.due <= Date.now()).length, saveStreak: R.save, on: true, ret: pendingChecks() };
};

/** Turn reminders on. Returns { ok } or { ok:false, why } with a short user-facing reason. */
export async function enable(times) {
  if (!canPush()) return { ok: false, why: 'unsupported' };
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, why: 'denied' };
  let key;
  try { const r = await fetch('/api/push'); if (!r.ok) return { ok: false, why: 'server' }; key = (await r.json()).key; } catch (e) { return { ok: false, why: 'offline' }; }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) }));
    S.rem = { ...rem(), ...(times ? { times } : {}), on: true }; save();
    const r = await call('PUT', payload(sub));
    if (r.status === 401) return { ok: false, why: 'key' };
    if (!r.ok) return { ok: false, why: 'server' };
    return { ok: true };
  } catch (e) { return { ok: false, why: 'error' }; }
}

export async function disable() {
  try {
    const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if (sub) { await call('DELETE', { sub: sub.toJSON() }).catch(() => {}); await sub.unsubscribe(); }
  } catch (e) { /* nothing to undo */ }
  S.rem = { ...rem(), on: false }; save();
}

/** Send a test notification to this device. */
export async function test() {
  const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
  if (!sub) return false;
  const r = await call('POST', { ...payload(sub) });
  return r.ok;
}

/** Keep the server's copy of "have you practised today / streak / due" fresh so it never nags after you have played. */
let t, lastSig = '';
export function refreshSoon() {
  if (!S.rem || !S.rem.on || !canPush() || Notification.permission !== 'granted') return;
  clearTimeout(t);
  t = setTimeout(async () => {
    try {
      const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
      if (!sub) return;
      const p = payload(sub), sig = JSON.stringify([p.times, p.days, p.skip, p.last, p.streak, p.due, p.saveStreak, p.tz, p.ret]);
      if (sig === lastSig) return;
      const r = await call('PUT', p);
      if (r.ok) lastSig = sig;
    } catch (e) { /* offline: will retry on the next save */ }
  }, 4000);
}
onSave((ev) => { if (ev == 'saved') refreshSoon(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSoon(); });

/** Home-screen badge (installed app): number of reviews due. */
export function setBadge(n) {
  try { n > 0 ? navigator.setAppBadge && navigator.setAppBadge(Math.min(n, 99)) : navigator.clearAppBadge && navigator.clearAppBadge(); } catch (e) { /* unsupported */ }
}
