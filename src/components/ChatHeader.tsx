import { useState } from 'react';
import { MoreVertical, ArrowLeft, User } from 'lucide-react';

interface ChatHeaderProps {
    contactId: string | null;
    onBack?: () => void;
    showBackButton?: boolean;
    isEnabled?: boolean;
    onToggle?: (enabled: boolean) => void;
}

export const ChatHeader = ({ contactId, onBack, showBackButton, isEnabled = true, onToggle }: ChatHeaderProps) => {
    const [enabled, setEnabled] = useState(isEnabled);

    const handleToggle = () => {
        const newState = !enabled;
        setEnabled(newState);
        onToggle?.(newState);
    };

    if (!contactId) return null;

    return (
        <div className="h-12 sm:h-14 px-2 sm:px-4 flex items-center justify-between border-b border-[#25D366]/20 bg-gradient-to-r from-[#0a0a0a] to-[#0f0f0f] flex-shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                {showBackButton && (
                    <button onClick={onBack} className="p-1.5 -ml-1 rounded-full hover:bg-white/5 text-[#25D366] transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                )}

                {/* Avatar */}
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-[#25D366] to-[#128C7E] flex items-center justify-center flex-shrink-0">
                    <User size={16} className="text-black" />
                </div>

                {/* Info */}
                <div className="min-w-0">
                    <h2 className="text-white font-medium text-xs sm:text-sm truncate">+{contactId}</h2>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                {/* Toggle Switch */}
                <button
                    onClick={handleToggle}
                    className={`relative w-10 h-5 sm:w-12 sm:h-6 rounded-full transition-all duration-300 ${enabled
                            ? 'bg-[#25D366]'
                            : 'bg-zinc-700'
                        }`}
                >
                    <div
                        className={`absolute top-0.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white shadow-md transition-all duration-300 ${enabled ? 'left-[22px] sm:left-[26px]' : 'left-0.5'
                            }`}
                    />
                </button>

                <button className="p-1.5 sm:p-2 rounded-full hover:bg-white/5 text-zinc-400 hover:text-[#25D366] transition-colors">
                    <MoreVertical size={18} />
                </button>
            </div>
        </div>
    );
};
