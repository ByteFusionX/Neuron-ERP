// Plain custom service worker: handles Web Push only. Not an Angular ngsw asset/cache worker.
// Compiled to sw-push.js via scripts/build-sw-push.mjs before ng serve/build (browsers can't run .ts directly).

export {};

declare const self: ServiceWorkerGlobalScope;

interface PushPayload {
  title?: string;
  body?: string;
  message?: string;
  icon?: string;
  badge?: string;
  data?: {
    routePath?: string;
    routeData?: unknown;
    [key: string]: unknown;
  };
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  let payload: PushPayload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Notification', body: event.data.text() };
  }

  const title = payload.title || 'Neuron ERP';
  const options: NotificationOptions = {
    body: payload.body || payload.message,
    icon: payload.icon || 'assets/images/favicon.png',
    badge: payload.badge || 'assets/images/favicon.png',
    data: payload.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const routePath = event.notification.data?.routePath || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if ('focus' in client) {
          client.postMessage({ type: 'PUSH_NOTIFICATION_CLICK', routePath, routeData: event.notification.data?.routeData });
          return (client as WindowClient).focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(routePath);
      }
      return undefined;
    })
  );
});
