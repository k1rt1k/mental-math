// Runs before first paint so there is no flash of the wrong theme. Classic script (no modules) on purpose.
(function () {
  try {
    var stateKey = localStorage['mmTrainer.activeUser'] === '2' ? 'mmTrainer.v1.user_2' : 'mmTrainer.v1';
    var S = JSON.parse(localStorage[stateKey] || '{}'), D = document.documentElement;
    var th = S.theme || (matchMedia('(prefers-color-scheme:light)').matches ? 'light' : 'dark');
    D.dataset.theme = th;
    D.dataset.font = S.font || 'serif';
    var A = { blue: ['#7aa8ff', '#2f63d6'], violet: ['#b69cff', '#6d46d6'], teal: ['#4fd1c5', '#0f857b'], rose: ['#ff8fb1', '#d1366b'], amber: ['#ffc15c', '#a05d00'] };
    D.style.setProperty('--ac', (A[S.acc] || A.blue)[th == 'light' ? 1 : 0]);
  } catch (e) { /* first run */ }
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
