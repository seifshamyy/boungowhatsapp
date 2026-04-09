import { useRef, useState, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';

interface AudioPlayerProps {
    url: string;
}

const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const AudioPlayer = ({ url }: AudioPlayerProps) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onLoaded = () => { setDuration(audio.duration); setIsReady(true); };
        const onTime = () => setCurrentTime(audio.currentTime);
        const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };
        const onError = () => setError(true);

        audio.addEventListener('loadedmetadata', onLoaded);
        audio.addEventListener('timeupdate', onTime);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('error', onError);

        return () => {
            audio.removeEventListener('loadedmetadata', onLoaded);
            audio.removeEventListener('timeupdate', onTime);
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('error', onError);
        };
    }, [url]);

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio || error) return;
        if (isPlaying) {
            audio.pause();
            setIsPlaying(false);
        } else {
            audio.play().then(() => setIsPlaying(true)).catch(() => setError(true));
        }
    };

    const seek = (e: React.PointerEvent<HTMLDivElement>) => {
        const audio = audioRef.current;
        if (!audio || !isReady) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
        audio.currentTime = ratio * duration;
        setCurrentTime(ratio * duration);
    };

    const progress = duration > 0 ? currentTime / duration : 0;

    return (
        <div className="flex items-center gap-3 rounded-2xl p-2 sm:p-2.5 border border-slate-100 shadow-sm bg-white/60">
            {/* Hidden native audio element — handles all decoding/playback */}
            <audio ref={audioRef} src={url} preload="metadata" />

            <button
                onPointerDown={(e) => e.preventDefault()}
                onClick={togglePlay}
                disabled={error}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full text-white flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 flex-shrink-0 shadow-sm"
                style={{ backgroundColor: 'var(--color-primary)' }}
            >
                {isPlaying
                    ? <Pause size={17} fill="currentColor" />
                    : <Play size={17} className="ml-0.5" fill="currentColor" />
                }
            </button>

            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                {/* Scrubbar */}
                <div
                    className="relative h-[3px] bg-slate-200 rounded-full cursor-pointer"
                    onPointerDown={seek}
                >
                    <div
                        className="absolute inset-y-0 left-0 rounded-full transition-none"
                        style={{ width: `${progress * 100}%`, backgroundColor: 'var(--color-primary)' }}
                    />
                    {/* Thumb dot */}
                    <div
                        className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full shadow"
                        style={{ left: `calc(${progress * 100}% - 5px)`, backgroundColor: 'var(--color-primary)' }}
                    />
                </div>

                <div className="flex justify-between px-0.5">
                    <span className="text-[10px] text-slate-400 font-medium tabular-nums">
                        {isPlaying ? formatTime(currentTime) : formatTime(0)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium tabular-nums">
                        {isReady ? formatTime(duration) : '—'}
                    </span>
                </div>
            </div>
        </div>
    );
};
