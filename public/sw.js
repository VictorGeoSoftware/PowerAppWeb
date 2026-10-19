// Minimal service worker for installability. No fetch handler and no caching:
// the app is online-only. `web-push-registration` extends this file.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
