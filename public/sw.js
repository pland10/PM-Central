/* PM Central service worker — Web Push for the installed PWA (iOS 16.4+).
   Shows the notification and, on tap, focuses an open window or opens the URL. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data && event.data.text ? event.data.text() : "" };
  }
  const title = data.title || "PM Central";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-pmc-192.png",
    badge: "/icon-pmc-192.png",
    tag: data.tag,
    data: { url: data.url || "/" },
  };
  // A notification with the same tag as one still in the notification center
  // replaces it — silently, unless renotify is set. Pop up (and sound) again.
  // (renotify without a tag is rejected by browsers, so only with one.)
  if (data.tag) options.renotify = true;
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w && w.url.indexOf(url) !== -1) return w.focus();
      }
      if (wins[0] && "focus" in wins[0]) {
        wins[0].navigate(url);
        return wins[0].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
