// Loaded into the generated service worker (workbox importScripts).
// Clicking a reminder focuses corkboard (or opens it) and shows that note.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const noteId = event.notification.data && event.notification.data.tag;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = all[0];
      if (client) {
        await client.focus();
        client.postMessage({ type: 'reveal-note', noteId });
      } else {
        await self.clients.openWindow(self.registration.scope);
      }
    })(),
  );
});
