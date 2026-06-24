// Self-destructing service worker.
// An earlier PWA build registered a service worker that cached the app shell and
// kept serving stale content (and intercepting brand-new routes like /kpi-sources).
// Any browser still holding that worker will fetch THIS file on its next update
// check, install it, and it immediately unregisters itself, clears all caches, and
// reloads open tabs — fixing the stale app with no manual cache-clearing.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (e) {}
      try {
        await self.registration.unregister();
      } catch (e) {}
      try {
        const clients = await self.clients.matchAll({ type: "window" });
        clients.forEach((c) => c.navigate(c.url));
      } catch (e) {}
    })()
  );
});
