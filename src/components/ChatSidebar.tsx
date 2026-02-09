import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, User, Tag as TagIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { WhatsAppMessage, ContactEbp, Tag, getContactId } from '../types';
import { TagManager } from './TagManager';

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
    { from: '#25D366', to: '#128C7E', text: '#25D366' },
    { from: '#E91E63', to: '#C2185B', text: '#E91E63' },
    { from: '#9C27B0', to: '#7B1FA2', text: '#9C27B0' },
    { from: '#3F51B5', to: '#303F9F', text: '#3F51B5' },
    { from: '#2196F3', to: '#1976D2', text: '#2196F3' },
    { from: '#00BCD4', to: '#0097A7', text: '#00BCD4' },
    { from: '#FF9800', to: '#F57C00', text: '#FF9800' },
    { from: '#FF5722', to: '#E64A19', text: '#FF5722' },
    { from: '#795548', to: '#5D4037', text: '#795548' },
    { from: '#607D8B', to: '#455A64', text: '#607D8B' },
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
            <div className="w-full h-full bg-[#111111] border-r border-[#25D366]/20 flex flex-col">
                {/* Header */}
                <div className="px-3 sm:px-4 flex items-center justify-between border-b border-[#25D366]/20 bg-[#0a0a0a] flex-shrink-0" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))', paddingBottom: '0.5rem' }}>
                    <div className="flex items-center gap-2">
                        <img
                            src="https://whmbrguzumyatnslzfsq.supabase.co/storage/v1/object/public/Client%20Logos/d44435d6-4dfb-4616-8e0f-6cd45a88403d.jpeg"
                            alt="Portal Logo"
                            className="w-7 h-9 sm:w-8 sm:h-10 rounded-md object-cover"
                        />
                        <span className="font-semibold text-white text-sm">Portal <span className="text-zinc-500 font-normal text-[10px] sm:text-[11px]">by Flowmaticlabs</span></span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={openTagManagerGlobal} className="p-1.5 rounded-full hover:bg-white/5 text-zinc-400 hover:text-[#25D366] transition-colors" title="Manage Tags">
                            <TagIcon size={16} />
                        </button>
                        <button className="p-1.5 sm:p-2 rounded-full hover:bg-white/5 text-[#25D366] transition-colors">
                            <Plus size={18} />
                        </button>
                    </div>
                </div>

                {/* Search */}
                <div className="p-2 sm:p-3 flex-shrink-0">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg py-2 pl-9 pr-3 text-xs sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#25D366]/50"
                        />
                    </div>
                </div>

                {/* Contact List */}
                <div className="flex-1 overflow-y-auto min-h-0">
                    {loading ? (
                        <div className="text-center text-[#25D366] text-xs py-6 animate-pulse">Loading...</div>
                    ) : filteredContacts.length === 0 ? (
                        <div className="text-center text-zinc-500 text-xs py-6">No conversations</div>
                    ) : (
                        filteredContacts.map((contact) => {
                            const color = getAvatarColor(contact.id);
                            const displayName = contact.name || `+${contact.id}`;
                            return (
                                <button
                                    key={contact.id}
                                    onClick={() => onSelectChat(contact.id)}
                                    className={`w-full px-3 py-2.5 sm:py-3 flex items-center gap-2.5 sm:gap-3 hover:bg-[#1a1a1a] transition-all border-b border-zinc-900/50 ${selectedChat === contact.id
                                        ? 'bg-[#25D366]/10 border-l-2 border-l-[#25D366]'
                                        : 'border-l-2 border-l-transparent'
                                        }`}
                                >
                                    {/* Avatar */}
                                    <div className="relative flex-shrink-0">
                                        <div
                                            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center"
                                            style={selectedChat === contact.id
                                                ? { background: `linear-gradient(135deg, ${color.from}, ${color.to})` }
                                                : { background: `linear-gradient(135deg, ${color.from}20, ${color.to}20)`, border: `1px solid ${color.from}30` }
                                            }
                                        >
                                            <User size={18} style={{ color: selectedChat === contact.id ? 'black' : color.text }} />
                                        </div>
                                        {contact.unreadCount > 0 && selectedChat !== contact.id && (
                                            <div className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#25D366] flex items-center justify-center">
                                                <span className="text-[9px] font-bold text-black">
                                                    {contact.unreadCount > 99 ? '99+' : contact.unreadCount}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0 text-left">
                                        <div className="flex items-center justify-between mb-0.5">
                                            <span className={`font-medium text-xs sm:text-sm truncate ${contact.unreadCount > 0 && selectedChat !== contact.id ? 'text-white' : 'text-zinc-300'}`}>
                                                {displayName}
                                            </span>
                                            <span className={`text-[9px] sm:text-[10px] ml-1.5 flex-shrink-0 ${contact.unreadCount > 0 && selectedChat !== contact.id ? 'text-[#25D366]' : 'text-zinc-500'}`}>
                                                {formatTime(contact.lastMessageTime)}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1">
                                            <p className={`text-[11px] sm:text-xs truncate flex-1 ${contact.unreadCount > 0 && selectedChat !== contact.id ? 'text-zinc-200 font-medium' : 'text-zinc-400'}`}>
                                                {contact.lastMessage}
                                            </p>
                                        </div>

                                        {/* Tags */}
                                        {contact.tags && contact.tags.length > 0 && (
                                            <div className="flex gap-1 mt-1 flex-wrap">
                                                {contact.tags.map(tagId => {
                                                    const tag = getTagById(tagId);
                                                    if (!tag) return null;
                                                    return (
                                                        <span
                                                            key={tagId}
                                                            className="px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-medium"
                                                            style={{
                                                                backgroundColor: `${tag['tag hex']}20`,
                                                                color: tag['tag hex'] || '#999',
                                                                border: `1px solid ${tag['tag hex']}40`,
                                                            }}
                                                        >
                                                            {tag['tag name']}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* Tag assign button */}
                                    <button
                                        onClick={(e) => openTagManagerForContact(e, contact.id, contact.tags || [])}
                                        className="p-1 rounded hover:bg-white/10 text-zinc-600 hover:text-zinc-300 flex-shrink-0"
                                    >
                                        <TagIcon size={12} />
                                    </button>
                                </button>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="hidden sm:flex h-8 px-4 items-center justify-center border-t border-[#25D366]/20 bg-[#0a0a0a] flex-shrink-0">
                    <span className="text-[9px] text-zinc-600 font-mono">PORTAL v1.0</span>
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
