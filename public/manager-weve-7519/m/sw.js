// Staff phone app service worker (spec docs/superpowers/specs/2026-10-21-staff-push-android-design.md §3).
// Push alerts only: no fetch handler and no cache, so every deploy shows at once, as before.
const APP_PATH = '/manager-weve-7519/m';
const FALLBACK = { title: 'WEVE Staff', body: '새 소식이 있어요.', url: `${APP_PATH}?tab=consultations`, tag: 'weve' };

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let message = FALLBACK;
  try {
    message = { ...FALLBACK, ...(event.data ? event.data.json() : {}) };
  } catch {
    // Not JSON: show the fallback text.
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: '/staff-app/icon-192.png',
      badge: '/staff-app/icon-192.png',
      tag: message.tag,
      data: { url: message.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || FALLBACK.url, self.location.origin);
  // Only this app's own pages are opened.
  const url = target.origin === self.location.origin && target.pathname.startsWith(APP_PATH) ? target.href : `${self.location.origin}${FALLBACK.url}`;
  // An open app is brought forward and asked to show 상담 (no reload, so a report being written is not lost: the page keeps
  // its own leave check). With no open app, or if that fails, the app opens at the URL.
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windows) => {
        const open = windows.find((client) => new URL(client.url).pathname.startsWith(APP_PATH));
        if (!open) return self.clients.openWindow(url);
        open.postMessage({ type: 'weve-open-consultations' });
        return open.focus();
      })
      .catch(() => self.clients.openWindow(url)),
  );
});
