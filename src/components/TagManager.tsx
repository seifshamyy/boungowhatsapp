import { useState, useEffect } from 'react';
import { X, Plus, Edit2, Trash2, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Tag, TAG_COLORS } from '../types';

interface TagManagerProps {
    isOpen: boolean;
    onClose: () => void;
    onTagsChanged: () => void;
    // For assigning tags to a contact
    contactId?: string;
    contactTags?: number[];
}

export const TagManager = ({ isOpen, onClose, onTagsChanged, contactId, contactTags = [] }: TagManagerProps) => {
    const [tags, setTags] = useState<Tag[]>([]);
    const [creating, setCreating] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [tagName, setTagName] = useState('');
    const [tagHex, setTagHex] = useState(TAG_COLORS[0].hex);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) fetchTags();
    }, [isOpen]);

    const fetchTags = async () => {
        const { data } = await supabase.from('tags').select('*').order('id');
        if (data) setTags(data as Tag[]);
    };

    const createTag = async () => {
        if (!tagName.trim()) return;
        setLoading(true);
        const { error } = await supabase.from('tags').insert({ 'tag name': tagName.trim(), 'tag hex': tagHex });
        if (error) console.error('Create tag error:', error);
        setTagName('');
        setTagHex(TAG_COLORS[0].hex);
        setCreating(false);
        await fetchTags();
        onTagsChanged();
        setLoading(false);
    };

    const updateTag = async (id: number) => {
        if (!tagName.trim()) return;
        setLoading(true);
        const { error } = await supabase.from('tags').update({ 'tag name': tagName.trim(), 'tag hex': tagHex }).eq('id', id);
        if (error) console.error('Update tag error:', error);
        setEditingId(null);
        setTagName('');
        await fetchTags();
        onTagsChanged();
        setLoading(false);
    };

    const deleteTag = async (id: number) => {
        setLoading(true);
        await supabase.from('tags').delete().eq('id', id);
        await fetchTags();
        onTagsChanged();
        setLoading(false);
    };

    const toggleTagOnContact = async (tagId: number) => {
        if (!contactId) return;
        setLoading(true);
        const currentTags = contactTags || [];
        const newTags = currentTags.includes(tagId)
            ? currentTags.filter(t => t !== tagId)
            : [...currentTags, tagId];

        await supabase
            .from('contacts.ebp')
            .update({ tags: newTags })
            .eq('id', contactId);

        onTagsChanged();
        setLoading(false);
    };

    const startEdit = (tag: Tag) => {
        setEditingId(tag.id);
        setTagName(tag['tag name'] || '');
        setTagHex(tag['tag hex'] || TAG_COLORS[0].hex);
        setCreating(false);
    };

    const startCreate = () => {
        setCreating(true);
        setEditingId(null);
        setTagName('');
        setTagHex(TAG_COLORS[0].hex);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
            <div className="w-full sm:w-96 max-h-[80vh] bg-[#1a1a1a] rounded-t-2xl sm:rounded-2xl border border-zinc-700/50 flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                    <h3 className="text-white font-medium text-sm">
                        {contactId ? 'Assign Tags' : 'Manage Tags'}
                    </h3>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400">
                        <X size={18} />
                    </button>
                </div>

                {/* Tag List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                    {tags.map(tag => (
                        <div key={tag.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5">
                            {editingId === tag.id ? (
                                // Edit mode
                                <div className="flex-1 flex flex-col gap-2">
                                    <input
                                        value={tagName}
                                        onChange={e => setTagName(e.target.value)}
                                        className="bg-[#111] border border-zinc-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#25D366]/50"
                                        placeholder="Tag name"
                                        autoFocus
                                    />
                                    <div className="flex gap-1.5">
                                        {TAG_COLORS.map(c => (
                                            <button
                                                key={c.hex}
                                                onClick={() => setTagHex(c.hex)}
                                                className="w-6 h-6 rounded-full transition-all"
                                                style={{
                                                    backgroundColor: c.hex,
                                                    outline: tagHex === c.hex ? '2px solid white' : 'none',
                                                    outlineOffset: '2px',
                                                }}
                                            />
                                        ))}
                                    </div>
                                    <div className="flex gap-1.5 mt-1">
                                        <button
                                            onClick={() => updateTag(tag.id)}
                                            disabled={loading}
                                            className="px-3 py-1 bg-[#25D366] text-black rounded text-xs font-medium"
                                        >
                                            Save
                                        </button>
                                        <button
                                            onClick={() => setEditingId(null)}
                                            className="px-3 py-1 bg-zinc-700 text-white rounded text-xs"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                // Display mode
                                <>
                                    {contactId && (
                                        <button
                                            onClick={() => toggleTagOnContact(tag.id)}
                                            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${contactTags.includes(tag.id)
                                                ? 'border-[#25D366] bg-[#25D366]'
                                                : 'border-zinc-600'
                                                }`}
                                        >
                                            {contactTags.includes(tag.id) && <Check size={12} className="text-black" />}
                                        </button>
                                    )}
                                    <div
                                        className="w-3 h-3 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: tag['tag hex'] || '#666' }}
                                    />
                                    <span className="flex-1 text-white text-xs">{tag['tag name'] || 'Unnamed'}</span>
                                    <button onClick={() => startEdit(tag)} className="p-1 hover:bg-white/10 rounded text-zinc-500">
                                        <Edit2 size={13} />
                                    </button>
                                    <button onClick={() => deleteTag(tag.id)} className="p-1 hover:bg-red-500/20 rounded text-zinc-500 hover:text-red-400">
                                        <Trash2 size={13} />
                                    </button>
                                </>
                            )}
                        </div>
                    ))}

                    {tags.length === 0 && !creating && (
                        <p className="text-center text-zinc-500 text-xs py-4">No tags yet</p>
                    )}

                    {/* Create form */}
                    {creating && (
                        <div className="p-2 bg-white/5 rounded-lg space-y-2">
                            <input
                                value={tagName}
                                onChange={e => setTagName(e.target.value)}
                                className="w-full bg-[#111] border border-zinc-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#25D366]/50"
                                placeholder="Tag name"
                                autoFocus
                            />
                            <div className="flex gap-1.5">
                                {TAG_COLORS.map(c => (
                                    <button
                                        key={c.hex}
                                        onClick={() => setTagHex(c.hex)}
                                        className="w-6 h-6 rounded-full transition-all"
                                        style={{
                                            backgroundColor: c.hex,
                                            outline: tagHex === c.hex ? '2px solid white' : 'none',
                                            outlineOffset: '2px',
                                        }}
                                    />
                                ))}
                            </div>
                            <div className="flex gap-1.5 mt-1">
                                <button
                                    onClick={createTag}
                                    disabled={loading || !tagName.trim()}
                                    className="px-3 py-1 bg-[#25D366] text-black rounded text-xs font-medium disabled:opacity-50"
                                >
                                    Create
                                </button>
                                <button
                                    onClick={() => setCreating(false)}
                                    className="px-3 py-1 bg-zinc-700 text-white rounded text-xs"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {!creating && editingId === null && (
                    <div className="p-3 border-t border-zinc-800 flex gap-2">
                        <button
                            onClick={startCreate}
                            className="flex-1 py-2 bg-white/5 hover:bg-white/10 border border-zinc-700 rounded-lg text-xs text-zinc-300 flex items-center justify-center gap-1.5 transition-colors"
                        >
                            <Plus size={14} /> New Tag
                        </button>
                        <button
                            onClick={onClose}
                            className="flex-1 py-2 bg-[#25D366] hover:bg-[#1ebc57] rounded-lg text-xs text-black font-medium flex items-center justify-center gap-1.5 transition-colors"
                        >
                            <Check size={14} /> Done
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
