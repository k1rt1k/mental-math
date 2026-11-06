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
