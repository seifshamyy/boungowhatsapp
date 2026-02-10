import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, User, Tag as TagIcon, Bell, BellRing } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { WhatsAppMessage, ContactEbp, Tag, getContactId } from '../types';
import { TagManager } from './TagManager';
import { subscribeToPush, isPushSupported } from '../lib/pushNotifications';

interface SidebarContact {
    id: string;
    name: string | null;
    lastMessage: string;
    lastMessageTime: string;
    unreadCount: number;
    tags: number[];
}

interface ChatSidebarProps {
    onSelectChat: (contactId: string) => void;
    selectedChat: string | null;
}

const READ_MESSAGES_KEY = 'portal_read_messages';

const loadReadMessages = (): Set<number> => {
    try {
        const stored = localStorage.getItem(READ_MESSAGES_KEY);
        if (stored) return new Set(JSON.parse(stored));
    } catch (e) { console.error('Failed to load read messages:', e); }
    return new Set();
};

const saveReadMessages = (ids: Set<number>) => {
    try { localStorage.setItem(READ_MESSAGES_KEY, JSON.stringify([...ids])); }
    catch (e) { console.error('Failed to save read messages:', e); }
};

const AVATAR_COLORS = [
    { from: '#ef4444', to: '#b91c1c', text: '#ef4444' },
    { from: '#3b82f6', to: '#1d4ed8', text: '#3b82f6' },
    { from: '#8b5cf6', to: '#6d28d9', text: '#8b5cf6' },
    { from: '#f59e0b', to: '#d97706', text: '#f59e0b' },
    { from: '#ec4899', to: '#be185d', text: '#ec4899' },
    { from: '#06b6d4', to: '#0891b2', text: '#06b6d4' },
    { from: '#10b981', to: '#059669', text: '#10b981' },
];

const getAvatarColor = (contactId: string) => {
    let hash = 0;
    for (let i = 0; i < contactId.length; i++) {
        hash = contactId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

export const ChatSidebar = ({ onSelectChat, selectedChat }: ChatSidebarProps) => {
    const [contacts, setContacts] = useState<SidebarContact[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [notifEnabled, setNotifEnabled] = useState(() =>
        typeof Notification !== 'undefined' && Notification.permission === 'granted'
    );
    const [loading, setLoading] = useState(true);
    const [readMessages, setReadMessages] = useState<Set<number>>(() => loadReadMessages());
    const [contactsMap, setContactsMap] = useState<Map<string, ContactEbp>>(new Map());
    const [allTags, setAllTags] = useState<Tag[]>([]);
    const [tagManagerOpen, setTagManagerOpen] = useState(false);
    const [tagManagerContactId, setTagManagerContactId] = useState<string | undefined>();
    const [tagManagerContactTags, setTagManagerContactTags] = useState<number[]>([]);

    // Fetch tags
    const fetchTags = useCallback(async () => {
        const { data } = await supabase.from('tags').select('*');
        if (data) setAllTags(data as Tag[]);
    }, []);

    // Fetch contacts from contacts.ebp
    const fetchContactsEbp = useCallback(async () => {
        const { data } = await supabase.from('contacts.ebp').select('*');
        if (data) {
            const map = new Map<string, ContactEbp>();
            (data as ContactEbp[]).forEach(c => map.set(String(c.id), c));
            setContactsMap(map);
        }
    }, []);

    const fetchContacts = useCallback(async () => {
        const { data } = await supabase
            .from('whatsappebp')
            .select('*')
            .order('created_at', { ascending: false });

        if (data) {
            const msgs = data as WhatsAppMessage[];
            const contactMap = new Map<string, SidebarContact>();

            msgs.forEach((msg) => {
                const contactId = getContactId(msg);
                if (!contactId) return;

                const isIncoming = msg.from && /^\d+$/.test(msg.from);
                const isRead = readMessages.has(msg.id);
                const ebpContact = contactsMap.get(contactId);

                if (!contactMap.has(contactId)) {
                    contactMap.set(contactId, {
                        id: contactId,
                        name: ebpContact?.name_WA || null,
                        lastMessage: msg.text || (msg.type === 'audio' ? '🎤 Voice message' : '📷 Media'),
                        lastMessageTime: msg.created_at,
                        unreadCount: isIncoming && !isRead ? 1 : 0,
                        tags: ebpContact?.tags || [],
                    });
                } else if (isIncoming && !isRead) {
                    const existing = contactMap.get(contactId)!;
                    existing.unreadCount++;
                }
            });

            const sortedContacts = Array.from(contactMap.values()).sort(
                (a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
            );

            setContacts(sortedContacts);
        }
        setLoading(false);
    }, [readMessages, contactsMap]);

    useEffect(() => {
        if (selectedChat) {
            const markAsRead = async () => {
                const { data } = await supabase
                    .from('whatsappebp')
                    .select('id')
                    .eq('from', selectedChat);

                if (data) {
                    setReadMessages(prev => {
                        const next = new Set(prev);
                        data.forEach((m: { id: number }) => next.add(m.id));
                        saveReadMessages(next);
                        return next;
                    });
                }
            };
            markAsRead();
        }
    }, [selectedChat]);

    useEffect(() => {
        fetchContactsEbp();
        fetchTags();
    }, [fetchContactsEbp, fetchTags]);

    useEffect(() => {
        fetchContacts();
        const pollInterval = setInterval(() => {
            fetchContacts();
            fetchContactsEbp();
        }, 2000);
        return () => clearInterval(pollInterval);
    }, [fetchContacts, fetchContactsEbp]);

    const filteredContacts = contacts.filter((c) =>
        c.id.includes(searchQuery) ||
        c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const formatTime = (timestamp: string) => {
        try {
            const date = new Date(timestamp);
            const now = new Date();
            const isToday = date.toDateString() === now.toDateString();
            if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        } catch { return ''; }
    };

    const getTagById = (tagId: number) => allTags.find(t => t.id === tagId);

    const openTagManagerForContact = (e: React.MouseEvent, contactId: string, contactTagIds: number[]) => {
        e.stopPropagation();
        setTagManagerContactId(contactId);
        setTagManagerContactTags(contactTagIds);
        setTagManagerOpen(true);
    };

    const openTagManagerGlobal = () => {
        setTagManagerContactId(undefined);
        setTagManagerContactTags([]);
        setTagManagerOpen(true);
    };

    const handleTagsChanged = () => {
        fetchTags();
        fetchContactsEbp();
    };

    return (
        <>
            <div className="w-full h-full bg-[#ffffff] border-r border-slate-200 flex flex-col">
                {/* Header */}
                <div className="px-3 sm:px-4 flex items-center justify-between border-b border-slate-200 bg-white flex-shrink-0" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))', paddingBottom: '0.5rem' }}>
                    <div className="flex items-center gap-2">
                        <img
                            src="https://whmbrguzumyatnslzfsq.supabase.co/storage/v1/object/public/Client%20Logos/download%20(8).jpeg"
                            alt="CRM Agent Logo"
                            className="w-8 h-8 rounded-full object-cover border border-slate-200"
                        />
                        <div className="flex flex-col">
                            <span className="font-bold text-slate-900 text-sm leading-tight">CRM Agent</span>
                            <span className="text-slate-500 font-medium text-[10px]">Active Hub</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={async () => {
                                if (!isPushSupported()) {
                                    alert('Notifications require adding this app to your home screen.');
                                    return;
                                }
                                const success = await subscribeToPush();
                                if (success) setNotifEnabled(true);
                            }}
                            className={`p-1.5 rounded-full hover:bg-slate-100 transition-colors ${notifEnabled ? 'text-red-500' : 'text-slate-400 hover:text-red-500 animate-pulse'
                                }`}
                            title={notifEnabled ? 'Notifications enabled' : 'Enable notifications'}
                        >
                            {notifEnabled ? <BellRing size={16} /> : <Bell size={16} />}
                        </button>
                        <button onClick={openTagManagerGlobal} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-red-500 transition-colors" title="Manage Tags">
                            <TagIcon size={16} />
                        </button>
                        <button className="p-1.5 sm:p-2 rounded-full hover:bg-slate-100 text-red-500 transition-colors">
                            <Plus size={18} />
                        </button>
                    </div>
                </div>

                {/* Search */}
                <div className="p-2 sm:p-3 flex-shrink-0 bg-slate-50/50">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search chats..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg py-2 pl-9 pr-3 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500/30 focus:border-red-500/50"
                        />
                    </div>
                </div>

                {/* Contact List */}
                <div className="flex-1 overflow-y-auto min-h-0">
                    {loading ? (
                        <div className="text-center text-red-500 text-xs py-6 animate-pulse">Scanning...</div>
                    ) : filteredContacts.length === 0 ? (
                        <div className="text-center text-slate-400 text-xs py-10 px-4">
                            No conversations match your search
                        </div>
                    ) : (
                        filteredContacts.map((contact) => {
                            const color = getAvatarColor(contact.id);
                            return (
                                <button
                                    key={contact.id}
                                    onClick={() => onSelectChat(contact.id)}
                                    className={`w-full p-2.5 sm:p-3 flex items-center gap-3 transition-all cursor-pointer border-l-2 ${selectedChat === contact.id
                                        ? 'bg-red-50 border-red-500'
                                        : 'hover:bg-slate-50 border-transparent'
                                        }`}
                                >
                                    {/* Avatar */}
                                    <div className="relative flex-shrink-0">
                                        <div
                                            className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-white font-semibold text-sm sm:text-base shadow-sm"
                                            style={{
                                                background: `linear-gradient(135deg, ${color.from}, ${color.to})`
                                            }}
                                        >
                                            {contact.name?.[0]?.toUpperCase() || <User size={18} />}
                                        </div>
                                        {contact.unreadCount > 0 && selectedChat !== contact.id && (
                                            <div className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                                                {contact.unreadCount}
                                            </div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-1 mb-0.5">
                                            <span className="font-semibold text-slate-900 truncate text-sm sm:text-base text-left">
                                                {contact.name || `+${contact.id}`}
                                            </span>
                                            <span className={`text-[9px] sm:text-[10px] ml-1.5 flex-shrink-0 ${contact.unreadCount > 0 && selectedChat !== contact.id ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                                                {formatTime(contact.lastMessageTime)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                            <p className={`text-xs truncate flex-1 text-left ${contact.unreadCount > 0 && selectedChat !== contact.id ? 'text-slate-900 font-medium' : 'text-slate-500'}`}>
                                                {contact.lastMessage}
                                            </p>
                                        </div>
                                        {/* Tags Display + Assign Button */}
                                        <div className="flex items-center gap-1 mt-1.5">
                                            <div className="flex flex-wrap gap-1 flex-1">
                                                {contact.tags && contact.tags.length > 0 && contact.tags.map(tagId => {
                                                    const tag = getTagById(tagId);
                                                    if (!tag) return null;
                                                    return (
                                                        <span
                                                            key={tag.id}
                                                            className="px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-medium leading-none"
                                                            style={{
                                                                backgroundColor: `${tag['tag hex']}15`,
                                                                color: tag['tag hex'] || '#ef4444',
                                                                border: `1px solid ${tag['tag hex']}30`
                                                            }}
                                                        >
                                                            {tag['tag name']}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                            <button
                                                onClick={(e) => openTagManagerForContact(e, contact.id, contact.tags || [])}
                                                className="p-0.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                                                title="Assign tags"
                                            >
                                                <TagIcon size={12} />
                                            </button>
                                        </div>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="hidden sm:flex h-8 px-4 items-center justify-center border-t border-slate-100 bg-slate-50 flex-shrink-0">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">CRM AGENT v1.1</span>
                </div>
            </div>

            {/* Tag Manager Modal */}
            <TagManager
                isOpen={tagManagerOpen}
                onClose={() => setTagManagerOpen(false)}
                onTagsChanged={handleTagsChanged}
                contactId={tagManagerContactId}
                contactTags={tagManagerContactTags}
            />
        </>
    );
};
