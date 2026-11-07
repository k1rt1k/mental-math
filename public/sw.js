// Service worker: precache the app shell per release and serve it cache-first; a new release waits until the person taps Update.
const C = 'mm-v14-74';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'icon-monochrome-512.png', 'apple-touch-icon.png', 'favicon-32.png', 'badge-96.png', 'css/style.css', 'css/motion.css', 'css/extras.css', 'fonts/inter.woff2', 'fonts/fraunces.woff2', 'fonts/jbmono.woff2', 'fonts/sym.woff2', 'fonts/OFL.txt',
  'js/boot.js', 'js/main.js', 'js/util.js', 'js/engine.js', 'js/state.js', 'js/stats.js', 'js/session.js', 'js/sync.js', 'js/ui.js', 'js/charts.js', 'js/motion.js', 'js/morph.js', 'js/nav.js', 'js/theme.js', 'js/tricks.js', 'js/notify.js', 'js/ai.js', 'js/aiLocal.js', 'js/skillAi.js',
  'js/paths.js','js/pathsData.js','js/views/paths.js', 'js/views/home.js', 'js/views/streak.js', 'js/views/weeksheet.js', 'js/views/play.js', 'js/views/results.js', 'js/views/progress.js', 'js/views/notebook.js', 'js/views/learn.js', 'js/views/settings.js', 'js/views/coach.js', 'js/richtext.js', 'js/board.js', 'js/boardlogic.js', 'js/rest.js', 'js/chain.js', 'js/weekly.js', 'js/weekdata.js', 'js/views/flash.js', 'js/share.js', 'js/info.js', 'js/infotext.js'];

// Install fetches every shell file fresh from the network (not the HTTP cache) into this release's own cache.
// There is no skipWaiting: a new worker waits until the page asks for it (message 'skipWaiting', sent when the person taps "Update available"),
// so the page never runs old code against a half-new cache and the swap never happens silently.
// RECOVERY switch: OFF since 14.74. It was on for 14.71 to 14.73 only, because 14.69 crashed on launch for anyone with saved Learn-path progress and the
// only code that could ask a waiting worker to take over (main.js) was the code that crashed. While RECOVER is true the worker takes over as soon as
// its shell is cached and reloads the open tabs once, which would wipe a Learn run in progress. Leave it false; turn it on for one release only if a
// release ever ships a launch crash that its own update button cannot fix.
const RECOVER = false;
self.addEventListener('install', (e) => e.waitUntil(caches.open(C).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => RECOVER && self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const keys = await caches.keys(), older = keys.filter((x) => x !== C);
  await Promise.all(older.map((x) => caches.delete(x)));
  await clients.claim();
  if (RECOVER && older.length) (await clients.matchAll({ type: 'window' })).forEach((c) => { try { c.navigate(c.url); } catch (err) { /* ignore */ } });   // an update, not a first install: reload once onto the fixed files
})()));
self.addEventListener('message', (e) => { if (e.data && e.data.type === 'skipWaiting') self.skipWaiting(); });

// Cache-first. The cache name changes with every release and the shell is precached whole, so a hit is always the right version
// (?v= is ignored on purpose: the cache already is the version). Updates arrive through a new worker, not through background refetching.
// Only a miss touches the network, so a weak connection costs nothing for the app itself.
const cacheFirst = async (req) => {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const r = await fetch(req);
    if (r.ok && req.mode !== 'navigate') { const c = await caches.open(C); c.put(req, r.clone()); }
    return r;
  } catch (err) {
    return req.mode === 'navigate' ? (await caches.match('index.html')) || Response.error() : Response.error();
  }
};
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(cacheFirst(e.request));
});

/* ---------- push notifications (daily reminder) ---------- */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  const title = d.title || 'Mental Math', url = d.url || '/?go=train';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || 'Time for a quick round.', tag: d.tag || 'mm-daily', renotify: true,
    icon: 'icon-192.png', badge: 'badge-96.png', data: { url },
    actions: url.includes('retain') ? [{ action: 'retain', title: 'Take the check' }] : url.includes('review') ? [{ action: 'review', title: 'Review now' }] : [{ action: 'train', title: 'Practise' }, { action: 'daily', title: 'Daily challenge' }],
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
