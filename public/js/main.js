// Entry point: nav chrome, global keyboard shortcuts, onboarding, service worker, sync start.
import { S, save, onSave, CAL, lowered, restoreRatings, finishCal } from './state.js';
import { $, esc } from './util.js';
import { icon, toast, dialog, choiceDlg, dialogOpen } from './ui.js';
import { A, go, fromHash, view, rerender } from './nav.js';
import { applyTheme, themeNow } from './theme.js';
import { configure, startSync, onStatus, syncKey, statusText, status } from './sync.js';
import { IDS, SK } from './engine.js';
import { streak } from './stats.js';
import { clamp } from './util.js';
import { start, playKey, flush, isPlaying, liveSession } from './views/play.js';
import { home, SL } from './views/home.js';
import './views/coach.js';
import './views/progress.js';
import './views/learn.js';
import './views/notebook.js';
import './views/flash.js';
import { settings, wireImport, keysDialog, placement, helpDialog } from './views/settings.js';
import { resultsKey } from './views/results.js';
import { setBadge, refreshSoon } from './notify.js';
import './morph.js';
import './motion.js';

/* ---------- chrome ---------- */
const NAV = [['home', 'Train', 'home'], ['coach', 'Coach', 'sparkle'], ['learn', 'Learn', 'bulb'], ['progress', 'Progress', 'chart'], ['notebook', 'Notebook', 'book'], ['settings', 'Settings', 'gear']];
function drawNav() {
  const now = Date.now(), due = Object.values(S.weak).filter((w) => w.due <= now).length, st = streak(), runs = S.sessions.length;
  const mk = (list) => list.map(([id, l, ic]) => { const n = id == 'notebook' && due ? (due > 99 ? '99+' : due) : ''; return `<button class="nv" data-go="${esc(id)}" aria-label="${esc(l)}${n ? ', ' + due + ' to review' : ''}"><span class="nvi">${icon(ic)}${n ? `<span class="badge">${n}</span>` : ''}</span><span>${l}</span></button>`; }).join(''), btns = mk(NAV);
  setBadge(due);
  // The rail stays a compact icon rail; the wordmark and the streak/session context live inside it without adding rows.
  $('#rail').innerHTML = `<a class="brand" href="#/" aria-label="Mental Math, go home"><img class="logo" src="icon.svg" alt="" width="42" height="42"><span class="wm">Mental Math</span></a>${btns}<div class="railgrow"></div><div class="railfoot" aria-label="Your progress"><span title="${st ? st + '-day streak' : 'No streak yet'}">${icon('flame', 'fill')}${st || '–'}</span><span title="${runs} ${runs == 1 ? 'session' : 'sessions'} logged">${icon('chart', 'chart')}${runs}</span></div>`;
  $('#tabs').innerHTML = mk(NAV.filter(([id]) => id != 'settings'));   // five tabs on a phone, so the labels can be readable; Settings is the gear on Home (the rail keeps it)
  document.querySelectorAll('[data-go]').forEach((b) => b.dataset.go == view.scr && b.setAttribute('aria-current', 'page'));
}
onSave(drawNav);

/* ---------- onboarding (first run only) ---------- */
async function onboard() {
  S.onb = 1; save();
  const v = await dialog({
    title: 'Welcome to Mental Math',
    body: `<p>Short timed sessions that adapt to you. Type the answer and it submits itself: no Enter needed.</p><p>Every skill has a rating that rises as you get faster and more accurate. Questions you miss come back later, with the method to solve them.</p>`,
    actions: [{ label: 'Skip', value: 'skip' }, { label: 'Set my starting level', value: 'go', primary: true }],
  });
  if (v == 'go') {
    await placement();
    const g = await choiceDlg('How much will you practise?', '<p>A session is 2 minutes or more. Your goal drives the streak and the daily plan on Home. You can change it any time in Settings.</p>', [
      { value: 1, title: 'Light', desc: '1 session a day, about 2 minutes' },
      { value: 2, title: 'Steady', desc: '2 sessions a day (recommended)' },
      { value: 3, title: 'Serious', desc: '3 sessions a day' },
    ]);
    if (g) { S.goal = g; save(); }
    home();
  }
}

/* ---------- keyboard ---------- */
const typing = (t) => t && t.matches && t.matches('input,textarea,select');
addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || dialogOpen() || typing(e.target)) return;
  const k = e.key;
  if (view.scr == 'play') {
    if (['Enter', ' ', 'Backspace', 'Escape'].includes(k) || /^\d$/.test(k) || k.length == 1) { e.preventDefault(); document.activeElement && document.activeElement.blur && document.activeElement.blur(); playKey(k); }
    return;
  }
  const onCtl = e.target.matches && e.target.matches('button,a,summary,[role=button],[role=switch],[role=radio]');
  if ((k == 'Enter' || k == ' ') && onCtl) return;       // let the focused control act
  if (k.length > 1 && !['Enter', 'Escape', 'ArrowLeft', 'ArrowRight'].includes(k)) return;
  const lk = k.toLowerCase();
  if (view.scr == 'end' && resultsKey(lk)) { e.preventDefault(); return; }
  if (lk == '?') return void keysDialog();
  if (lk == 'c') return go('coach');
  if (lk == 'p') return go('progress');
  if (lk == 't') return go('learn');
  if (lk == 'n') return go('notebook');
  if (lk == 's') return go('settings');
  if (lk == 'l') { S.theme = themeNow() == 'light' ? 'dark' : 'light'; save(); applyTheme(); return view.scr == 'settings' && settings(); }
  if (lk == 'm') { S.mute = !S.mute; save(); return toast('Sound ' + (S.mute ? 'off' : 'on')); }
  if (lk == 'escape') return go('home');
  if (lk == 'r' && Object.keys(S.weak).length) return start('review');
  if (lk == 'y') return start('daily');
  if (lk == 'v') return start('survival');
  if (lk == 'x') return start('sprint');
  if (view.scr == 'home') {
    if (lk >= '1' && lk <= '6' && lk.length == 1) { e.preventDefault(); return A.cfg({ v: 'dur:' + [30, 60, 120, 300, 600, 0][lk - 1] }); }
    if (lk == 'arrowleft' || lk == 'arrowright') {
      const o = ['all', ...IDS], c = Object.assign({ only: 'all' }, S.cfg).only, i = (o.indexOf(c) + (lk == 'arrowright' ? 1 : o.length - 1)) % o.length;
      return A.cfg({ v: 'only:' + o[i] });
    }
  }
  if (lk == 'enter') { e.preventDefault(); start(); }
});
['pagehide', 'beforeunload'].forEach((ev) => addEventListener(ev, (e) => flush(e)));

/* ---------- offline status: the pill beside the sync chip shows only while the device is offline ---------- */
const netState = () => { document.documentElement.toggleAttribute('data-offline', navigator.onLine === false); };
addEventListener('online', netState); addEventListener('offline', netState); netState();

/* ---------- sync wiring ---------- */
configure({ guard: isPlaying, onChange: () => { applyTheme(); drawNav(); rerender(); } });
onStatus(() => {
  const el = $('.syncdot');
  if (el) { el.className = 'syncdot ' + (syncKey() ? status.kind : 'off'); const s = el.querySelector('#sy'); if (s) s.textContent = syncKey() ? statusText() : 'Set up sync'; el.setAttribute('aria-label', syncKey() ? 'Sync status: ' + statusText() : 'Sync is off. Set up sync'); }
});

/* ---------- PWA ---------- */
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); A._ip = e; if (view.scr == 'settings') settings(); });
addEventListener('appinstalled', () => { A._ip = null; toast('Installed. Open it from your home screen.'); if (view.scr == 'settings') settings(); });
if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // A tapped notification while the app is already open arrives here; a re-subscription request too.
  navigator.serviceWorker.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.type == 'go') launch(m.go);
    if (m.type == 'resub') refreshSoon();
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!had) return;     // first install, nothing to refresh
    const ask = () => toast('A new version is ready', { label: 'Reload', onClick: () => location.reload() });
    isPlaying() ? setTimeout(ask, 60000) : ask();
  });
}
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* ignore */ }
onSave((ev) => { if (ev == 'error') toast('Storage is full or blocked. Download a backup from Settings.', { ms: 6000 }); });

/* ---------- go ---------- */
wireImport();
applyTheme();
drawNav();
fromHash();
startSync();
/** Open a mode from a PWA shortcut or a notification tap. Never interrupts a session in progress. */
function launch(g) {
  if (isPlaying()) return;
  if (g == 'daily' || g == 'survival' || g == 'sprint') start(g);
  else if (g == 'review') Object.keys(S.weak).length ? start('review') : go('home');
  else if (g == 'train') start(undefined, { dur: 120, only: 'all', off: 0, patt: undefined });
}
{ // PWA shortcuts and notification taps: /?go=daily | survival | review | train
  const g = new URLSearchParams(location.search).get('go');
  if (g) history.replaceState(null, '', location.pathname + location.hash);
  if (g) setTimeout(() => launch(g), 0);
}
/** Once, after the 5.4 scoring fix: offer to undo rating drops the old, too-strict targets caused. */
async function recalPrompt() {
  if ((S.cal || 0) >= CAL || isPlaying()) return;
  const hit = lowered();
  if (hit.length < 2) { finishCal(); save(); return; }          // nothing meaningfully lowered
  const list = hit.map((k) => `${SK[k].n} ${Math.round(S.sk[k].lv * 100)} → ${Math.round(S.sk[k].pk * 100)}`).join(', ');
  const v = await choiceDlg('Scoring was fixed', `<p>The old scoring expected answers faster than reading and typing allow, so it lowered ratings even for correct, reasonably quick answers. These skills are 100+ below their peak: <b>${esc(list)}</b>.</p>`, [
    { value: 'restore', title: 'Restore them to their peak', desc: 'Ratings re-adjust to your real pace within a few sessions' },
    { value: 'keep', title: 'Keep my current ratings', desc: 'Start from where they are now' },
  ]);
  if (v === undefined) return;                                  // closed without choosing: ask again next time
  if (v == 'restore') restoreRatings();
  finishCal(); save(); rerender();
}
if (!S.onb && !S.sessions.length) onboard(); else setTimeout(recalPrompt, 700);
window.__mm = { S, go, get sess() { return liveSession(); } };   // handy for debugging in the console
