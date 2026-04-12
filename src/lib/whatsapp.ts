import { supabase } from './supabase';

export const generateRandomId = () => Math.floor(Math.random() * 1000000000) + 1;

export const postToWebhook = async (
    mid: string,
    data: string,
    type: string,
    to: string,
    webhookUrl: string,
) => {
    try {
        const payload = { mid, data, type, id: generateRandomId(), to };
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            mode: 'no-cors',
        });
    } catch (err) {
        console.error('Webhook error:', err);
    }
};

export const sendWhatsAppText = async (
    to: string,
    text: string,
    apiUrl: string,
    token: string,
) => {
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'text',
            text: { preview_url: false, body: text },
        }),
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Failed to send');
    }
    return response.json();
};

export const storeMessage = async (
    type: string,
    text: string | null,
    mediaUrl: string | null,
    mid: string,
    toNumber: string,
    tableMessages: string,
) => {
    const insertData = {
        type,
        text,
        media_url: mediaUrl,
        from: null,
        to: toNumber,
        is_reply: 'false',
        mid,
        created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from(tableMessages).insert(insertData).select();
    if (error) throw new Error(`DB error: ${error.message}`);
    return data?.[0];
};
