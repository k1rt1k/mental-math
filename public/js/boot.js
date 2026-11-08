// Runs before first paint so there is no flash of the wrong theme. Classic script (no modules) on purpose.
(function () {
  var D = document.documentElement;
  try {
    var stateKey = localStorage['mmTrainer.activeUser'] === '2' ? 'mmTrainer.v1.user_2' : 'mmTrainer.v1';
    var S = JSON.parse(localStorage[stateKey] || '{}');
    var th = S.theme || (matchMedia('(prefers-color-scheme:light)').matches ? 'light' : 'dark');
    D.dataset.theme = th;
    D.dataset.font = S.font || 'serif';
    D.dataset.afont = /^(inter|serif|system|round|mono)$/.test(S.afont) ? S.afont : 'default';   // keep in step with AFONTS in theme.js
    // Opening animation: once per launch (a reload or an update does not replay it), never for a home-screen shortcut (?go=),
    // never with Reduce motion, and off when the person turned it off in Settings. The CSS ends it by itself, so nothing can trap the screen.
    try {
      var still = S.rm || matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!S.noSplash && !still && !sessionStorage['mm.splash'] && !/[?&]go=/.test(location.search)) { D.dataset.splash = '1'; sessionStorage['mm.splash'] = '1'; }
    } catch (e) { /* no storage: no intro */ }
    // A device whose first visit is with this release (nothing saved yet) gets the new default look; everyone else keeps what they had until they choose.
    var flag = 'mm.look2:' + stateKey;
    if (localStorage[stateKey] == null && localStorage[flag] == null) localStorage[flag] = '1';
    var l2 = localStorage[flag] === '1';
    D.dataset.look2 = l2 ? '1' : '';
    // Keep these tables in step with ACC and SKINS in theme.js (a test checks it).
    var A = { grape: ['#a07bff', '#6a3df0'], blue: ['#7aa8ff', '#2f63d6'], violet: ['#b69cff', '#6d46d6'], teal: ['#4fd1c5', '#0f857b'], rose: ['#ff8fb1', '#d1366b'], amber: ['#ffc15c', '#a05d00'], coral: ['#ff8a65', '#c93e12'], emerald: ['#34d399', '#0a7a50'], sky: ['#4cc9f0', '#0a6c9c'], fuchsia: ['#f472d0', '#b0208c'], lime: ['#a3e635', '#4d7c0f'], indigo: ['#818cf8', '#4338ca'], slate: ['#cbd5e1', '#334155'] };
    var K = { aurora: ['#0e0a20', '#f6f3fb'], midnight: ['#071229', '#f1f4fa'], forest: ['#06180f', '#f1f5f0'], mocha: ['#170f09', '#f7f2ec'], ocean: ['#03161c', '#eff6f7'], classic: ['#0c1017', '#f3f4f8'] };
    var own = function (o, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); };
    var skin = own(K, S.skin) ? S.skin : l2 ? 'aurora' : 'classic';
    D.dataset.skin = skin;
    var pair = S.acc === 'custom' && /^#[0-9a-f]{6}$/i.test(S.accHex || '') ? null : A[own(A, S.acc) ? S.acc : l2 ? ({ aurora: 'grape', midnight: 'blue', forest: 'emerald', mocha: 'amber', ocean: 'teal', classic: 'grape' })[skin] || 'grape' : 'blue'];
    if (pair) D.style.setProperty('--ac', pair[th == 'light' ? 1 : 0]);   // a custom colour is worked out by theme.js a moment later
    var m = document.querySelector('meta[name=theme-color]');
    if (m) m.content = th == 'light' ? K[skin][1] : th == 'black' ? '#000000' : K[skin][0];
  } catch (e) { D.dataset.look2 = '1'; /* first run, or storage is blocked: show the new default */ }
})();

// Blank-screen watchdog. If the app has drawn nothing a few seconds after load (a script failed, or a stale cached file is broken), drop this
// site's service workers and caches and reload once, so a bad release can never trap a device. Once per tab session, so it cannot loop.
(function () {
  var KEY = 'mm.repaired';
  function blank() { var m = document.getElementById('main'); return !!m && !m.querySelector('*:not(noscript):not(noscript *)'); }
  function repair() {
    try { if (sessionStorage[KEY]) return; sessionStorage[KEY] = '1'; } catch (e) { return; }
    var jobs = [];
    try { if (navigator.serviceWorker) jobs.push(navigator.serviceWorker.getRegistrations().then(function (r) { return Promise.all(r.map(function (x) { return x.unregister(); })); })); } catch (e) { /* ignore */ }
    try { if (window.caches) jobs.push(caches.keys().then(function (k) { return Promise.all(k.map(function (x) { return caches.delete(x); })); })); } catch (e) { /* ignore */ }
    Promise.all(jobs).catch(function () {}).then(function () { location.reload(); });
  }
  addEventListener('load', function () { setTimeout(function () { if (blank()) repair(); }, 4000); });
})();
