import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// --- Config ---
const PORT = process.env.PORT || 3000;

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@flowmaticlabs.com';

const SUPABASE_URL = 'https://whmbrguzumyatnslzfsq.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndobWJyZ3V6dW15YXRuc2x6ZnNxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTM1MTY4OSwiZXhwIjoyMDY0OTI3Njg5fQ.h-YbToBRx8WTW5KCk2IAYnmuhob3oiARGsnn61HwYQc';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- VAPID Setup ---
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    console.log('[Push] VAPID keys configured');
} else {
    console.warn('[Push] VAPID keys not set - push notifications disabled');
}

// --- API Routes ---

// Get VAPID public key (frontend needs this)
app.get('/api/push/vapid-key', (req, res) => {
    res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Subscribe to push
app.post('/api/push/subscribe', async (req, res) => {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: 'Invalid subscription' });
    }

    try {
        // Upsert: if endpoint exists, update keys; otherwise insert
        const { error } = await supabase
            .from('push_subscriptions')
            .upsert(
                {
                    endpoint: subscription.endpoint,
                    keys: subscription.keys,
                },
                { onConflict: 'endpoint' }
            );

        if (error) {
            console.error('[Push] Subscribe error:', error);
            return res.status(500).json({ error: 'Failed to save subscription' });
        }

        console.log('[Push] New subscription saved');
        res.json({ success: true });
    } catch (err) {
        console.error('[Push] Subscribe error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Unsubscribe
app.post('/api/push/unsubscribe', async (req, res) => {
    const { endpoint } = req.body;
    if (!endpoint) {
        return res.status(400).json({ error: 'Missing endpoint' });
    }

    const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', endpoint);

    if (error) {
        console.error('[Push] Unsubscribe error:', error);
    }

    res.json({ success: true });
});

// --- Serve static files ---
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    }
});

// --- Supabase Realtime: Listen for new messages ---
async function startRealtimeListener() {
    console.log('[Realtime] Starting listener for new messages...');

    const channel = supabase
        .channel('new-messages')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'whatsappebp',
            },
            async (payload) => {
                const msg = payload.new;

                // Only notify on incoming messages (msg.from is populated)
                if (!msg.from) return;

                console.log(`[Realtime] New message from ${msg.from}`);

                // Look up contact name
                let senderName = `+${msg.from}`;
                try {
                    const { data: contact } = await supabase
                        .from('contacts.ebp')
                        .select('name_WA')
                        .eq('id', msg.from)
                        .single();
                    if (contact?.name_WA) {
                        senderName = contact.name_WA;
                    }
                } catch (e) {
                    // fallback to phone number
                }

                // Send push to all subscribers
                await sendPushToAll({
                    title: senderName,
                    body: msg.text || '📎 Media message',
                    data: { contactId: String(msg.from) },
                });
            }
        )
        .subscribe((status) => {
            console.log(`[Realtime] Subscription status: ${status}`);
        });
}

async function sendPushToAll(notification) {
    // Get all subscriptions
    const { data: subs, error } = await supabase
        .from('push_subscriptions')
        .select('*');

    if (error || !subs || subs.length === 0) {
        console.log('[Push] No subscriptions to notify');
        return;
    }

    console.log(`[Push] Sending to ${subs.length} subscriber(s)`);

    const payload = JSON.stringify(notification);

    const results = await Promise.allSettled(
        subs.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    {
                        endpoint: sub.endpoint,
                        keys: sub.keys,
                    },
                    payload
                );
            } catch (err) {
                // If subscription expired/invalid, remove it
                if (err.statusCode === 410 || err.statusCode === 404) {
                    console.log(`[Push] Removing expired subscription: ${sub.endpoint.slice(-20)}`);
                    await supabase
                        .from('push_subscriptions')
                        .delete()
                        .eq('endpoint', sub.endpoint);
                } else {
                    console.error(`[Push] Send error:`, err.message);
                }
            }
        })
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    console.log(`[Push] Sent ${sent}/${subs.length}`);
}

// --- Start ---
app.listen(PORT, () => {
    console.log(`[Server] Running on port ${PORT}`);
    startRealtimeListener();
});
