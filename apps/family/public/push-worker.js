/**
 * Standalone service worker for Web Push, independent of the next-pwa
 * caching service worker (which is disabled in dev and controls the root
 * scope). Registered at a narrow scope by src/lib/push.ts, purely to receive
 * push events and show notifications — no fetch/caching logic here.
 */
self.addEventListener("push", (event) => {
  let payload = { title: "SabiDrive", body: "You have a new notification." };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // ignore malformed payloads
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon.svg",
      data: { url: payload.url || "/" }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
