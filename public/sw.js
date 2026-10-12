// War Room service worker v2 — PUSH ONLY, NEVER CACHES.
// History: the original PWA worker cached the app shell and served stale
// builds for days ("I don't see the changes"). This worker has NO fetch
// handler at all — every request always hits the network — and on activate it
// still clears any caches an old worker left behind. Its only job is
// notifications for the installed iPhone/desktop app.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (e) {}
      try { await self.clients.claim(); } catch (e) {}
    })()
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const title = data.title || "War Room";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || undefined,
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of clients) {
        if ("focus" in c) { c.focus(); if ("navigate" in c) c.navigate(url).catch(() => {}); return; }
      }
      await self.clients.openWindow(url);
    })()
  );
});
