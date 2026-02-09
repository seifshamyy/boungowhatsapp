// Push notification subscription helper

// Check if push is supported
export function isPushSupported(): boolean {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// Check current permission status
export function getPushPermission(): NotificationPermission | 'unsupported' {
    if (!isPushSupported()) return 'unsupported';
    return Notification.permission;
}

// Register service worker early (can happen on load)
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!isPushSupported()) return null;
    try {
        const registration = await navigator.serviceWorker.register('/sw-push.js');
        console.log('[Push] Service worker registered');
        return registration;
    } catch (err) {
        console.error('[Push] SW registration failed:', err);
        return null;
    }
}

// Request permission + subscribe (MUST be called from user gesture on iOS)
export async function subscribeToPush(): Promise<boolean> {
    if (!isPushSupported()) {
        console.log('[Push] Not supported');
        return false;
    }

    try {
        // Request permission (this is the part that needs user gesture on iOS)
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.log('[Push] Permission denied');
            return false;
        }

        // Get or register service worker
        let registration = await navigator.serviceWorker.getRegistration('/sw-push.js');
        if (!registration) {
            registration = await navigator.serviceWorker.register('/sw-push.js');
        }

        // Wait for service worker to be ready
        await navigator.serviceWorker.ready;

        // Get VAPID public key from server
        const response = await fetch('/api/push/vapid-key');
        const { publicKey } = await response.json();

        if (!publicKey) {
            console.warn('[Push] No VAPID key from server');
            return false;
        }

        // Check if already subscribed
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
            // Subscribe
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
            });
        }

        // Send subscription to server
        await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription.toJSON()),
        });

        console.log('[Push] Subscribed successfully');
        return true;
    } catch (err) {
        console.error('[Push] Subscribe error:', err);
        return false;
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
