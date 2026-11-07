// Service worker: precache the app shell, network-first with a timeout so a flaky connection never hangs the app.
const C = 'mm-v14-50';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'icon-monochrome-512.png', 'apple-touch-icon.png', 'favicon-32.png', 'badge-96.png', 'css/style.css', 'css/motion.css', 'css/extras.css', 'fonts/inter.woff2', 'fonts/fraunces.woff2', 'fonts/jbmono.woff2', 'fonts/sym.woff2', 'fonts/OFL.txt',
  'js/boot.js', 'js/main.js', 'js/util.js', 'js/engine.js', 'js/state.js', 'js/stats.js', 'js/session.js', 'js/sync.js', 'js/ui.js', 'js/charts.js', 'js/motion.js', 'js/morph.js', 'js/nav.js', 'js/theme.js', 'js/tricks.js', 'js/notify.js', 'js/ai.js', 'js/aiLocal.js', 'js/skillAi.js',
  'js/paths.js', 'js/views/home.js', 'js/views/play.js', 'js/views/results.js', 'js/views/progress.js', 'js/views/notebook.js', 'js/views/learn.js', 'js/views/settings.js', 'js/views/coach.js', 'js/richtext.js', 'js/share.js', 'js/info.js', 'js/infotext.js'];

self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(C).then((c) => c.addAll(SHELL))); });
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== C).map((x) => caches.delete(x)))).then(() => clients.claim())));

const netFirst = async (req) => {
  // With a cached copy we only wait briefly for the network (so a bad connection never stalls boot); with none we wait longer.
  const cached = await caches.match(req, { ignoreSearch: true });
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), cached ? 2500 : 8000);
  try {
    const r = await fetch(req, { signal: ctl.signal });
    clearTimeout(t);
    if (r.ok) { const c = await caches.open(C); c.put(req, r.clone()); }
    return r;
  } catch (err) {
    clearTimeout(t);
    return cached || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
  }
};
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(netFirst(e.request));
});

/* ---------- push notifications (daily reminder) ---------- */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  const title = d.title || 'Mental Math', url = d.url || '/?go=train';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || 'Time for a quick round.', tag: d.tag || 'mm-daily', renotify: true,
    icon: 'icon-192.png', badge: 'badge-96.png', data: { url },
    actions: url.includes('review') ? [{ action: 'review', title: 'Review now' }] : [{ action: 'train', title: 'Practise' }, { action: 'daily', title: 'Daily challenge' }],
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const base = (e.notification.data && e.notification.data.url) || '/?go=train';
  const go = e.action || new URL(base, location.origin).searchParams.get('go') || 'train';
  const target = '/?go=' + go + '&source=push';
  e.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find((c) => new URL(c.url).origin === location.origin);
    if (open) { await open.focus(); open.postMessage({ type: 'go', go }); return; }
    await clients.openWindow(target);
  })());
});
// The browser can rotate a push subscription; ask any open page to re-register it.
self.addEventListener('pushsubscriptionchange', (e) => e.waitUntil(clients.matchAll({ type: 'window' }).then((l) => l.forEach((c) => c.postMessage({ type: 'resub' })))));
