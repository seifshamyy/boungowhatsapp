// Push notification service worker
self.addEventListener('push', (event) => {
    let data = { title: 'New Message', body: 'You have a new message' };

    try {
        data = event.data.json();
    } catch (e) {
        // fallback to defaults
    }

    const options = {
        body: data.body,
        icon: '/vite.svg',
        badge: '/vite.svg',
        vibrate: [200, 100, 200],
        data: data.data || {},
        actions: [{ action: 'open', title: 'Open' }],
        tag: 'portal-message',
        renotify: true,
    };

    event.waitUntil(self.registration.showNotification(data.title, options));
});

// Click handler — open the app when notification is tapped
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // If app is already open, focus it
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise open a new window
            return clients.openWindow('/');
        })
    );
});
