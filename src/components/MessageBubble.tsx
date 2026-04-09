import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { WhatsAppMessage, isOutgoing } from '../types';
import { AudioPlayer } from './ui/AudioPlayer';
import { CheckCheck, Clock, X, Download, ZoomIn, ImageIcon } from 'lucide-react';

interface MessageBubbleProps {
    message: WhatsAppMessage;
    allMessages?: WhatsAppMessage[];
}

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

function renderTextWithLinks(text: string) {
    const parts = text.split(URL_REGEX);
    return parts.map((part, i) =>
        URL_REGEX.test(part) ? (
            <a
                key={i}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                className="underline break-all"
                style={{ color: 'var(--color-primary)' }}
                onClick={e => e.stopPropagation()}
            >
                {part}
            </a>
        ) : part
    );
}

// Portalled modal — escapes CSS transform stacking contexts on ancestor containers.
// Without this, position:fixed is relative to the transformed slide container, not
// the viewport, making the modal appear offset and transition janky.
function ImageModal({ url, onClose, onDownload }: { url: string; onClose: () => void; onDownload: () => void }) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Trigger fade-in on next frame
        const id = requestAnimationFrame(() => setVisible(true));
        // Lock body scroll while modal is open
        document.body.style.overflow = 'hidden';
        return () => {
            cancelAnimationFrame(id);
            document.body.style.overflow = '';
        };
    }, []);

    const close = () => {
        setVisible(false);
        setTimeout(onClose, 180);
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4"
            style={{
                backgroundColor: `rgba(0,0,0,${visible ? 0.95 : 0})`,
                transition: 'background-color 180ms ease',
            }}
            onClick={close}
        >
            {/* Top bar — safe-area aware, full width, buttons at opposite ends */}
            <div
                className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3"
                style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white font-bold text-sm shadow-lg active:opacity-80"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                    onClick={onDownload}
                >
                    <Download size={16} />
                    Save
                </button>

                <button
                    className="w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center active:bg-white/30"
                    onClick={close}
                >
                    <X size={20} />
                </button>
            </div>

            <img
                src={url}
                alt="Full size"
                className="max-w-full max-h-[88vh] object-contain rounded-xl select-none"
                style={{
                    transform: visible ? 'scale(1)' : 'scale(0.92)',
                    opacity: visible ? 1 : 0,
                    transition: 'transform 200ms cubic-bezier(0.34,1.56,0.64,1), opacity 180ms ease',
                }}
                onClick={(e) => e.stopPropagation()}
                draggable={false}
            />
        </div>,
        document.body
    );
}

export const MessageBubble = ({ message, allMessages }: MessageBubbleProps) => {
    const isOwn = isOutgoing(message);
    const [showImageModal, setShowImageModal] = useState(false);

    // Ad message detection — strip the /// prefix before rendering
    const isAd = message.text?.startsWith('///') ?? false;
    const displayMessage = isAd
        ? { ...message, text: message.text!.slice(3).trimStart() }
        : message;

    const repliedTo = displayMessage.is_reply === 'true' && displayMessage.reply_to_mid && allMessages
        ? allMessages.find(m => m.mid === displayMessage.reply_to_mid) ?? null
        : null;

    const isRTL = displayMessage.text && /[\u0600-\u06FF]/.test(displayMessage.text);

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
            <div className={`flex w-full px-2 sm:px-0 ${isOwn ? 'message-animate-out justify-end' : 'message-animate-in justify-start'}`}>
                <div className="relative max-w-[85%] sm:max-w-[75%] md:max-w-[65%]">
                    {/* Ad label — sits above the bubble */}
                    {isAd && (
                        <div className={`flex items-center gap-1 mb-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                            <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full border border-dashed" style={{ color: 'var(--color-accent)', borderColor: 'var(--color-accent)' }}>
                                Ad
                            </span>
                        </div>
                    )}

                    <div
                        className={`
                relative px-3 py-2 rounded-2xl shadow-sm
                ${isOwn
                                ? 'text-slate-900 border rounded-br-sm'
                                : 'text-slate-900 border border-slate-100 rounded-bl-sm'
                            }
                ${isAd ? 'border-dashed border-2' : ''}
              `}
                        style={{
                            backgroundColor: isOwn ? 'var(--color-outgoing-bubble)' : 'var(--color-incoming-bubble)',
                            borderColor: isAd ? 'var(--color-accent)' : isOwn ? 'var(--color-outgoing-bubble)' : undefined,
                        }}
                        dir={isRTL ? 'rtl' : 'ltr'}
                    >
                        {/* Reply Indicator */}
                        {displayMessage.is_reply === 'true' && displayMessage.reply_to_mid && (
                            <div className="mb-2 rounded-lg bg-slate-50 border-l-2 overflow-hidden" style={{ borderColor: 'var(--color-primary)' }}>
                                {repliedTo ? (
                                    repliedTo.type === 'image' && repliedTo.media_url ? (
                                        <img
                                            src={repliedTo.media_url}
                                            alt="Replied image"
                                            className="w-full max-h-24 object-cover"
                                        />
                                    ) : (
                                        <p className="px-2 py-1.5 text-[11px] text-slate-500 truncate">
                                            {repliedTo.text || 'Media message'}
                                        </p>
                                    )
                                ) : (
                                    <div className="px-2 py-1.5 flex items-center gap-1.5">
                                        <ImageIcon size={10} className="text-slate-400 flex-shrink-0" />
                                        <span className="text-[11px] text-slate-400 italic">Original message</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Image */}
                        {displayMessage.type === 'image' && displayMessage.media_url && (
                            <div
                                className="mb-1.5 rounded-xl overflow-hidden -mx-1 -mt-1 cursor-pointer relative group border border-slate-100"
                                onClick={() => setShowImageModal(true)}
                            >
                                <img
                                    src={displayMessage.media_url}
                                    alt="Media"
                                    className="w-full max-w-[280px] sm:max-w-sm h-auto object-cover"
                                    loading="lazy"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                    <ZoomIn size={28} className="text-white drop-shadow-lg" />
                                </div>
                            </div>
                        )}

                        {/* Audio */}
                        {displayMessage.type === 'audio' && displayMessage.media_url && (
                            <div className="min-w-[200px] sm:min-w-[260px] my-1">
                                <AudioPlayer url={displayMessage.media_url} />
                            </div>
                        )}

                        {/* Video */}
                        {displayMessage.type === 'video' && displayMessage.media_url && (
                            <div className="mb-1.5 rounded-xl overflow-hidden -mx-1 -mt-1 border border-slate-100">
                                <video
                                    src={displayMessage.media_url}
                                    controls
                                    className="w-full max-w-[280px] sm:max-w-sm h-auto"
                                />
                            </div>
                        )}

                        {/* Text */}
                        {displayMessage.text && (
                            <p className="text-[14px] sm:text-[15px] leading-relaxed whitespace-pre-wrap font-medium break-words">
                                {renderTextWithLinks(displayMessage.text)}
                            </p>
                        )}

                        {/* Timestamp & Status */}
                        <div className={`flex items-center gap-1.5 mt-1 ${isRTL ? 'justify-start' : 'justify-end'}`}>
                            <span className="text-[10px] text-slate-400 font-medium">
                                {formatTime(message.created_at)}
                            </span>
                            {isOwn && (
                                <>
                                    {message.status === 'sending' && <Clock size={12} className="text-slate-400 animate-pulse" />}
                                    {message.status === 'error' && <span className="text-emerald-600 text-[10px] font-bold">Retry</span>}
                                    {(!message.status || message.status === 'sent') && (
                                        message.mid ? (
                                            <CheckCheck size={14} style={{ color: 'var(--color-primary)' }} />
                                        ) : (
                                            <Clock size={12} className="text-slate-300" />
                                        )
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Image Modal — rendered via portal into document.body so CSS
                transforms on ancestor containers don't break fixed positioning */}
            {showImageModal && displayMessage.media_url && (
                <ImageModal
                    url={displayMessage.media_url}
                    onClose={() => setShowImageModal(false)}
                    onDownload={handleDownload}
                />
            )}
        </>
    );
};
