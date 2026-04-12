import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronLeft, Search, User, Check, CheckCheck, AlertCircle, Loader2, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useConfig } from '../context/ConfigContext';
import { sendWhatsAppText, storeMessage, postToWebhook } from '../lib/whatsapp';

interface BroadcastContact {
    id: string;
    name: string | null;
    lastMessage: string;
    msRemaining: number;
}

type SendStatus = 'pending' | 'sending' | 'sent' | { error: string };

interface BroadcastModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const AVATAR_COLORS = [
    { from: '#f97316', to: '#c2410c' },
    { from: '#3b82f6', to: '#1d4ed8' },
    { from: '#8b5cf6', to: '#6d28d9' },
    { from: '#0ea5e9', to: '#0369a1' },
    { from: '#f59e0b', to: '#d97706' },
    { from: '#ec4899', to: '#be185d' },
    { from: '#06b6d4', to: '#0891b2' },
];

const getAvatarColor = (id: string) => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
};

const formatRemaining = (ms: number) => {
    const hrs = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
};

const urgencyColor = (ms: number) => {
    if (ms < 3 * 3600000) return '#ef4444';
    if (ms < 8 * 3600000) return '#f59e0b';
    return '#10b981';
};

const TEMPLATES_KEY = 'broadcast_templates_v1';

const loadTemplates = (): string[] => {
    try {
        const s = localStorage.getItem(TEMPLATES_KEY);
        return s ? JSON.parse(s) : [];
    } catch { return []; }
};

export const BroadcastModal = ({ isOpen, onClose }: BroadcastModalProps) => {
    const { config } = useConfig();
    const [step, setStep] = useState<'pick' | 'compose' | 'progress'>('pick');
    const [contacts, setContacts] = useState<BroadcastContact[]>([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [message, setMessage] = useState('');
    const [templates, setTemplates] = useState<string[]>(loadTemplates);
    const [sendResults, setSendResults] = useState<Map<string, SendStatus>>(new Map());
    const [isDone, setIsDone] = useState(false);
    const cancelledRef = useRef(false);

    const reset = useCallback(() => {
        setStep('pick');
        setSelected(new Set());
        setSearchQuery('');
        setMessage('');
        setSendResults(new Map());
        setIsDone(false);
        cancelledRef.current = false;
    }, []);

    const loadContacts = useCallback(async () => {
        setLoading(true);
        try {
            const since = new Date(Date.now() - 24 * 3600000).toISOString();
            const [msgResult, ebpResult] = await Promise.all([
                supabase
                    .from(config.tableMessages)
                    .select('from, to, created_at, text, type')
                    .gte('created_at', since)
                    .order('created_at', { ascending: false }),
                supabase.from(config.tableContacts).select('id, name_WA'),
            ]);

            const nameMap = new Map<string, string>();
            if (ebpResult.data) {
                (ebpResult.data as { id: number; name_WA: string | null }[])
                    .forEach(c => nameMap.set(String(c.id), c.name_WA || ''));
            }

            const seen = new Map<string, BroadcastContact>();
            ((msgResult.data ?? []) as any[]).forEach(msg => {
                if (!msg.from || !/^\d+$/.test(msg.from)) return;
                const contactId = msg.from as string;
                if (seen.has(contactId)) return;
                const msRemaining = new Date(msg.created_at).getTime() + 24 * 3600000 - Date.now();
                if (msRemaining <= 0) return;
                seen.set(contactId, {
                    id: contactId,
                    name: nameMap.get(contactId) || null,
                    lastMessage: msg.text || (msg.type === 'audio' ? '🎤 Voice' : '📷 Media'),
                    msRemaining,
                });
            });

            setContacts(
                Array.from(seen.values()).sort((a, b) => a.msRemaining - b.msRemaining)
            );
        } catch (err) {
            console.error('[Broadcast] load error:', err);
        } finally {
            setLoading(false);
        }
    }, [config.tableMessages, config.tableContacts]);

    useEffect(() => {
        if (!isOpen) return;
        reset();
        loadContacts();
    }, [isOpen, reset, loadContacts]);

    const toggleSelect = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const filteredContacts = contacts.filter(c =>
        !searchQuery ||
        c.id.includes(searchQuery) ||
        c.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const selectedContacts = contacts.filter(c => selected.has(c.id));

    const applyPersonalization = (text: string, contact: BroadcastContact) => {
        const firstName = contact.name?.split(' ')[0] || contact.id;
        return text
            .replace(/\{\{name\}\}/gi, contact.name || contact.id)
            .replace(/\{\{firstName\}\}/gi, firstName)
            .replace(/\{\{phone\}\}/gi, contact.id);
    };

    const saveTemplate = () => {
        const t = message.trim();
        if (!t || templates.includes(t)) return;
        const next = [t, ...templates].slice(0, 5);
        setTemplates(next);
        try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next)); } catch { /* noop */ }
    };

    const deleteTemplate = (i: number) => {
        const next = templates.filter((_, idx) => idx !== i);
        setTemplates(next);
        try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next)); } catch { /* noop */ }
    };

    const doSend = useCallback(async (toSend: BroadcastContact[]) => {
        setIsDone(false);
        setSendResults(prev => {
            const next = new Map(prev);
            toSend.forEach(c => next.set(c.id, 'pending'));
            return next;
        });

        for (const contact of toSend) {
            if (cancelledRef.current) break;
            setSendResults(prev => new Map(prev).set(contact.id, 'sending'));
            try {
                const text = applyPersonalization(message, contact);
                const res = await sendWhatsAppText(contact.id, text, config.whatsappApiUrl, config.whatsappToken);
                const mid = res.messages?.[0]?.id || `bc_${Date.now()}`;
                await storeMessage('text', text, null, mid, contact.id, config.tableMessages);
                await postToWebhook(mid, text, 'text', contact.id, config.webhookUrl);
                setSendResults(prev => new Map(prev).set(contact.id, 'sent'));
            } catch (err: any) {
                setSendResults(prev => new Map(prev).set(contact.id, { error: err.message || 'Failed' }));
            }
            if (!cancelledRef.current) await new Promise(res => setTimeout(res, 800));
        }
        setIsDone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [message, config]);

    const startSend = () => {
        setStep('progress');
        cancelledRef.current = false;
        doSend(selectedContacts);
    };

    const retryFailed = () => {
        const failed = contacts.filter(c => {
            const s = sendResults.get(c.id);
            return typeof s === 'object' && s !== null;
        });
        cancelledRef.current = false;
        doSend(failed);
    };

    const sentCount = Array.from(sendResults.values()).filter(v => v === 'sent').length;
    const failedCount = Array.from(sendResults.values()).filter(v => typeof v === 'object' && v !== null).length;
    const totalCount = sendResults.size;
    const expiringSoon = selectedContacts.filter(c => c.msRemaining < 2 * 3600000);
    const allSelected = filteredContacts.length > 0 && selected.size === filteredContacts.length;

    if (!isOpen) return null;

    const stepTitle = step === 'pick' ? 'Broadcast' : step === 'compose' ? 'Write message' : isDone ? 'Done' : 'Sending…';
    const stepSubtitle = step === 'pick'
        ? `${contacts.length} contact${contacts.length !== 1 ? 's' : ''} in 24h window`
        : step === 'compose'
            ? `${selected.size} selected`
            : isDone
                ? `${sentCount} sent · ${failedCount} failed`
                : `${sentCount + failedCount} / ${totalCount}`;

    return (
        <div
            className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={step === 'progress' && !isDone ? undefined : onClose}
        >
            <div
                className="bg-white w-full md:max-w-[440px] rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
                style={{ maxHeight: '92vh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
                    {step === 'compose' ? (
                        <button
                            onClick={() => setStep('pick')}
                            className="p-1 rounded-full hover:bg-slate-100 text-slate-400 transition"
                        >
                            <ChevronLeft size={20} />
                        </button>
                    ) : (
                        <div style={{ width: 28, height: 28 }} />
                    )}
                    <div className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                            <Zap size={15} style={{ color: 'var(--color-primary)' }} />
                            <h2 className="font-bold text-slate-900 text-base">{stepTitle}</h2>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{stepSubtitle}</p>
                    </div>
                    <button
                        onClick={step === 'progress' && !isDone ? undefined : onClose}
                        disabled={step === 'progress' && !isDone}
                        className="p-1 rounded-full hover:bg-slate-100 text-slate-400 transition disabled:opacity-30"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* ── STEP: PICK ── */}
                {step === 'pick' && (
                    <>
                        <div className="px-4 pt-3 pb-2 flex-shrink-0 border-b border-slate-50">
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Search contacts…"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                                    />
                                </div>
                                <button
                                    onClick={() => setSelected(allSelected ? new Set() : new Set(filteredContacts.map(c => c.id)))}
                                    className="text-xs font-semibold flex-shrink-0 px-3 py-2 rounded-xl border transition"
                                    style={{
                                        borderColor: allSelected ? 'var(--color-primary)' : '#e2e8f0',
                                        color: allSelected ? 'var(--color-primary)' : '#94a3b8',
                                        backgroundColor: allSelected ? 'color-mix(in srgb, var(--color-primary) 10%, white)' : 'white',
                                    }}
                                >
                                    {allSelected ? 'None' : 'All'}
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto min-h-0">
                            {loading ? (
                                <div className="text-center py-10 text-slate-400 text-sm animate-pulse">
                                    Loading contacts…
                                </div>
                            ) : filteredContacts.length === 0 ? (
                                <div className="text-center py-12 px-6">
                                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                                        <Zap size={20} className="text-slate-300" />
                                    </div>
                                    <p className="text-slate-500 text-sm font-semibold">No contacts in 24h window</p>
                                    <p className="text-slate-400 text-xs mt-1">Contacts who message you within 24 hours appear here</p>
                                </div>
                            ) : (
                                filteredContacts.map(c => {
                                    const color = getAvatarColor(c.id);
                                    const isSelected = selected.has(c.id);
                                    return (
                                        <button
                                            key={c.id}
                                            onClick={() => toggleSelect(c.id)}
                                            className="w-full flex items-center gap-3 px-4 py-3 border-b border-slate-50 transition-colors text-left"
                                            style={{ backgroundColor: isSelected ? 'color-mix(in srgb, var(--color-primary) 6%, white)' : 'white' }}
                                        >
                                            <div
                                                className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                                                style={{ background: `linear-gradient(135deg, ${color.from}, ${color.to})` }}
                                            >
                                                {c.name?.[0]?.toUpperCase() ?? <User size={16} />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="font-semibold text-slate-900 text-sm truncate">
                                                        {c.name || `+${c.id}`}
                                                    </span>
                                                    <span
                                                        className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white leading-none"
                                                        style={{ backgroundColor: urgencyColor(c.msRemaining) }}
                                                    >
                                                        {formatRemaining(c.msRemaining)}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-400 truncate">{c.lastMessage}</p>
                                            </div>
                                            <div
                                                className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                                                style={{
                                                    borderColor: isSelected ? 'var(--color-primary)' : '#e2e8f0',
                                                    backgroundColor: isSelected ? 'var(--color-primary)' : 'white',
                                                }}
                                            >
                                                {isSelected && <Check size={11} className="text-white" />}
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>

                        <div className="flex-shrink-0 px-4 py-3 border-t border-slate-100 bg-white">
                            <button
                                onClick={() => setStep('compose')}
                                disabled={selected.size === 0}
                                className="w-full py-3 rounded-2xl text-white text-sm font-bold transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                style={{ backgroundColor: 'var(--color-primary)' }}
                            >
                                <Zap size={15} />
                                Next — {selected.size} contact{selected.size !== 1 ? 's' : ''} selected
                            </button>
                        </div>
                    </>
                )}

                {/* ── STEP: COMPOSE ── */}
                {step === 'compose' && (
                    <>
                        <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                                    Message
                                </label>
                                <textarea
                                    value={message}
                                    onChange={e => setMessage(e.target.value)}
                                    placeholder="Type your message…"
                                    autoFocus
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-[var(--color-primary)] resize-none transition"
                                    rows={4}
                                />
                                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                    <span className="text-[10px] text-slate-400">Personalize:</span>
                                    {['{{name}}', '{{firstName}}', '{{phone}}'].map(v => (
                                        <button
                                            key={v}
                                            onClick={() => setMessage(m => m + v)}
                                            className="font-mono bg-slate-100 hover:bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[9px] transition"
                                        >
                                            {v}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {message.trim() && selectedContacts.length > 0 && (
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                                        Preview
                                    </label>
                                    <div
                                        className="px-4 py-2.5 rounded-2xl rounded-br-sm text-sm text-slate-900 max-w-[85%] ml-auto shadow-sm whitespace-pre-wrap break-words"
                                        style={{ backgroundColor: 'var(--color-outgoing-bubble, #ecfdf5)' }}
                                    >
                                        {applyPersonalization(message, selectedContacts[0])}
                                    </div>
                                    {selectedContacts.length > 1 && (
                                        <p className="text-[10px] text-slate-400 mt-1 text-right">
                                            +{selectedContacts.length - 1} more, each personalized
                                        </p>
                                    )}
                                </div>
                            )}

                            {templates.length > 0 && (
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                                        Saved templates
                                    </label>
                                    <div className="space-y-1.5">
                                        {templates.map((tmpl, i) => (
                                            <div key={i} className="flex items-center gap-2 group">
                                                <button
                                                    onClick={() => setMessage(tmpl)}
                                                    className="flex-1 text-left px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-100 text-slate-700 hover:bg-slate-100 transition truncate"
                                                >
                                                    {tmpl.length > 60 ? tmpl.slice(0, 60) + '…' : tmpl}
                                                </button>
                                                <button
                                                    onClick={() => deleteTemplate(i)}
                                                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-300 hover:text-red-400 transition flex-shrink-0"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {message.trim() && !templates.includes(message.trim()) && (
                                <button
                                    onClick={saveTemplate}
                                    className="text-xs text-slate-400 hover:text-[var(--color-primary)] transition"
                                >
                                    + Save as template
                                </button>
                            )}
                        </div>

                        <div className="flex-shrink-0 p-4 border-t border-slate-100 bg-white">
                            {expiringSoon.length > 0 && (
                                <div className="mb-2 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                                    <AlertCircle size={14} className="flex-shrink-0" />
                                    <span>
                                        {expiringSoon.length} contact{expiringSoon.length > 1 ? 's' : ''} expire within 2 hours
                                    </span>
                                </div>
                            )}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setStep('pick')}
                                    className="px-4 py-3 rounded-2xl border border-slate-200 text-sm text-slate-600 font-semibold hover:bg-slate-50 transition"
                                >
                                    ←
                                </button>
                                <button
                                    onClick={startSend}
                                    disabled={!message.trim()}
                                    className="flex-1 py-3 rounded-2xl text-white text-sm font-bold transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    style={{ backgroundColor: 'var(--color-primary)' }}
                                >
                                    <Zap size={15} />
                                    Send to {selected.size} contact{selected.size !== 1 ? 's' : ''}
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {/* ── STEP: PROGRESS ── */}
                {step === 'progress' && (
                    <>
                        <div className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-slate-100">
                            <div className="flex items-center justify-between text-xs mb-2">
                                <span className="font-semibold text-slate-700">
                                    {isDone
                                        ? failedCount === 0
                                            ? `All ${sentCount} sent ✓`
                                            : `${sentCount} sent · ${failedCount} failed`
                                        : `Sending ${sentCount + failedCount} / ${totalCount}…`}
                                </span>
                                {!isDone && totalCount > 0 && (
                                    <span className="text-slate-400">
                                        {Math.round(((sentCount + failedCount) / totalCount) * 100)}%
                                    </span>
                                )}
                            </div>
                            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-500 ease-out"
                                    style={{
                                        width: totalCount > 0
                                            ? `${((sentCount + failedCount) / totalCount) * 100}%`
                                            : '0%',
                                        backgroundColor: isDone && failedCount > 0
                                            ? '#f59e0b'
                                            : isDone
                                                ? '#10b981'
                                                : 'var(--color-primary)',
                                    }}
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto min-h-0">
                            {contacts
                                .filter(c => sendResults.has(c.id))
                                .map(c => {
                                    const status = sendResults.get(c.id);
                                    const color = getAvatarColor(c.id);
                                    return (
                                        <div key={c.id} className="flex items-center gap-3 px-5 py-3 border-b border-slate-50">
                                            <div
                                                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                                                style={{ background: `linear-gradient(135deg, ${color.from}, ${color.to})` }}
                                            >
                                                {c.name?.[0]?.toUpperCase() ?? '?'}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-slate-800 text-sm truncate">
                                                    {c.name || `+${c.id}`}
                                                </p>
                                                {typeof status === 'object' && status !== null && (
                                                    <p className="text-[10px] text-red-400 truncate">{status.error}</p>
                                                )}
                                            </div>
                                            <div className="flex-shrink-0 w-5 flex items-center justify-center">
                                                {status === 'pending' && (
                                                    <div className="w-4 h-4 rounded-full border-2 border-slate-200" />
                                                )}
                                                {status === 'sending' && (
                                                    <Loader2 size={16} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
                                                )}
                                                {status === 'sent' && (
                                                    <CheckCheck size={16} style={{ color: '#10b981' }} />
                                                )}
                                                {typeof status === 'object' && status !== null && (
                                                    <X size={16} className="text-red-400" />
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>

                        <div className="flex-shrink-0 p-4 border-t border-slate-100 flex gap-3">
                            {!isDone && (
                                <button
                                    onClick={() => { cancelledRef.current = true; }}
                                    className="flex-1 py-3 rounded-2xl border border-slate-200 text-sm text-slate-500 font-semibold hover:bg-slate-50 transition"
                                >
                                    Cancel
                                </button>
                            )}
                            {isDone && failedCount > 0 && (
                                <button
                                    onClick={retryFailed}
                                    className="flex-1 py-3 rounded-2xl border text-sm font-bold transition"
                                    style={{ borderColor: '#fde68a', color: '#d97706', backgroundColor: '#fffbeb' }}
                                >
                                    Retry {failedCount} failed
                                </button>
                            )}
                            {isDone && (
                                <button
                                    onClick={onClose}
                                    className="flex-1 py-3 rounded-2xl text-white text-sm font-bold transition"
                                    style={{ backgroundColor: 'var(--color-primary)' }}
                                >
                                    Done
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
