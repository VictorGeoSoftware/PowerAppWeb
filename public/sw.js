// No fetch handler and no caching: the app is online-only.
// Push: FCM data-only messages from BmBackend (`WebPushPriceUpdatesNotifier`).
// Every push must show a notification (iOS revokes silent subscriptions).
// Strings mirror `src/lib/pwa/messages.ts` (checked by `sw.test.ts`).
const PRICE_UPDATES_TITLE = "Tarifas actualizadas";
const PRICE_UPDATES_BODY = "Hay nuevos precios. Toca para ver tus propuestas.";
const PUSH_FALLBACK_TITLE = "PowerApp";
const PRICE_UPDATES_MESSAGE = "bm:price_updates";
const ICON = "/icons/icon-192.png";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function pushType(event) {
  try {
    const json = event.data ? event.data.json() : null;
    return (json && json.data && json.data.type) || null;
  } catch {
    return null;
  }
}

function windowClients() {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true });
}

async function postToClients(clients) {
  for (const client of clients) client.postMessage({ type: PRICE_UPDATES_MESSAGE });
}

async function handlePush(event) {
  if (pushType(event) === "price_updates") {
    await postToClients(await windowClients());
    await self.registration.showNotification(PRICE_UPDATES_TITLE, {
      body: PRICE_UPDATES_BODY,
      icon: ICON,
      tag: "price_updates",
      data: { url: "/proposals" },
    });
    return;
  }
  await self.registration.showNotification(PUSH_FALLBACK_TITLE, { icon: ICON, data: { url: "/" } });
}

async function handleClick(event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  const priceUpdates = event.notification.tag === "price_updates";
  const [client] = await windowClients();
  if (!client) {
    await self.clients.openWindow(url);
    return;
  }
  await client.focus();
  if (client.navigate) await client.navigate(url).catch(() => {});
  if (priceUpdates) client.postMessage({ type: PRICE_UPDATES_MESSAGE });
}

self.addEventListener("push", (event) => {
  event.waitUntil(handlePush(event));
});

self.addEventListener("notificationclick", (event) => {
  event.waitUntil(handleClick(event));
});
