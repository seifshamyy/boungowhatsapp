import { useState } from 'react';
import { WhatsAppMessage, isOutgoing } from '../types';
import { AudioPlayer } from './ui/AudioPlayer';
import { CheckCheck, Clock, X, Download, ZoomIn } from 'lucide-react';

interface MessageBubbleProps {
    message: WhatsAppMessage;
}

export const MessageBubble = ({ message }: MessageBubbleProps) => {
    const isOwn = isOutgoing(message);
    const [showImageModal, setShowImageModal] = useState(false);

    const isRTL = message.text && /[\u0600-\u06FF]/.test(message.text);

    const formatTime = (timestamp: string) => {
        try {
            return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
            return '';
        }
    };

    const handleDownload = async () => {
        if (!message.media_url) return;
        try {
            const response = await fetch(message.media_url);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `image_${message.id || Date.now()}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch {
            window.open(message.media_url, '_blank');
        }
    };

    return (
        <>
            <div className={`flex w-full px-2 sm:px-0 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                <div
                    className={`
            relative max-w-[85%] sm:max-w-[75%] md:max-w-[65%] px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl
            ${isOwn
                            ? 'bg-gradient-to-br from-[#005c4b] to-[#004a3d] rounded-br-sm'
                            : 'bg-gradient-to-br from-[#1f2c33] to-[#1a252b] rounded-bl-sm'
                        }
          `}
                    dir={isRTL ? 'rtl' : 'ltr'}
                >
                    {/* Reply Indicator */}
                    {message.is_reply === 'true' && message.reply_to_mid && (
                        <div className="mb-1.5 px-2 py-1 rounded bg-black/30 border-l-2 border-[#25D366] text-[11px] text-zinc-400">
                            ↩️ Reply
                        </div>
                    )}

                    {/* Image */}
                    {message.type === 'image' && message.media_url && (
                        <div
                            className="mb-1.5 rounded-lg overflow-hidden -mx-0.5 -mt-0.5 cursor-pointer relative group"
                            onClick={() => setShowImageModal(true)}
                        >
                            <img
                                src={message.media_url}
                                alt="Media"
                                className="w-full max-w-[280px] sm:max-w-sm h-auto object-cover rounded-lg"
                                loading="lazy"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <ZoomIn size={28} className="text-white drop-shadow-lg" />
                            </div>
                        </div>
                    )}

                    {/* Audio */}
                    {message.type === 'audio' && message.media_url && (
                        <div className="min-w-[180px] sm:min-w-[240px]">
                            <AudioPlayer url={message.media_url} />
                        </div>
                    )}

                    {/* Video */}
                    {message.type === 'video' && message.media_url && (
                        <div className="mb-1.5 rounded-lg overflow-hidden -mx-0.5 -mt-0.5">
                            <video
                                src={message.media_url}
                                controls
                                className="w-full max-w-[280px] sm:max-w-sm h-auto rounded-lg"
                            />
                        </div>
                    )}

                    {/* Text */}
                    {message.text && (
                        <p className="text-[13px] sm:text-[15px] leading-relaxed whitespace-pre-wrap text-white/95">
                            {message.text}
                        </p>
                    )}

                    {/* Timestamp */}
                    <div className={`flex items-center gap-1 mt-1 ${isRTL ? 'justify-start' : 'justify-end'}`}>
                        <span className="text-[9px] sm:text-[10px] text-white/40">
                            {formatTime(message.created_at)}
                        </span>
                        {isOwn && (
                            message.mid ? (
                                <CheckCheck size={12} className="text-[#53bdeb]" />
                            ) : (
                                <Clock size={10} className="text-white/40" />
                            )
                        )}
                    </div>
                </div>
            </div>

            {/* Image Modal */}
            {showImageModal && message.media_url && (
                <div
                    className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-2 sm:p-4"
                    onClick={() => setShowImageModal(false)}
                >
                    <button
                        className="absolute top-2 right-2 sm:top-4 sm:right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
                        onClick={() => setShowImageModal(false)}
                    >
                        <X size={20} />
                    </button>

                    <button
                        className="absolute top-2 left-2 sm:top-4 sm:left-4 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-[#25D366] text-black font-medium text-xs sm:text-sm flex items-center gap-1.5"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDownload();
                        }}
                    >
                        <Download size={16} />
                        <span className="hidden sm:inline">Download</span>
                    </button>

                    <img
                        src={message.media_url}
                        alt="Full size"
                        className="max-w-full max-h-[85vh] sm:max-h-[90vh] object-contain rounded-lg"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </>
    );
};
