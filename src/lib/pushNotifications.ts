// Push notification subscription helper

export async function initPushNotifications(): Promise<void> {
    // Check support
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('[Push] Not supported in this browser');
        return;
    }

    try {
        // Register service worker
        const registration = await navigator.serviceWorker.register('/sw-push.js');
        console.log('[Push] Service worker registered');

        // Request permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.log('[Push] Permission denied');
            return;
        }

        // Get VAPID public key from server
        const response = await fetch('/api/push/vapid-key');
        const { publicKey } = await response.json();

        if (!publicKey) {
            console.warn('[Push] No VAPID public key from server');
            return;
        }

        // Subscribe
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });

        // Send subscription to server
        await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription.toJSON()),
        });

        console.log('[Push] Subscribed successfully');
    } catch (err) {
        console.error('[Push] Setup error:', err);
    }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
