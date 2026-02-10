import { useRef, useEffect, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Play, Pause } from 'lucide-react';

interface AudioPlayerProps {
    url: string;
}

export const AudioPlayer = ({ url }: AudioPlayerProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const wavesurfer = useRef<WaveSurfer | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [duration, setDuration] = useState('0:00');
    const [currentTime, setCurrentTime] = useState('0:00');

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    useEffect(() => {
        if (!containerRef.current) return;

        wavesurfer.current = WaveSurfer.create({
            container: containerRef.current,
            waveColor: '#cbd5e1', // Light slate
            progressColor: '#ef4444', // Red accent
            cursorColor: 'transparent',
            barWidth: 2,
            barRadius: 4,
            barGap: 3,
            height: 32,
            normalize: true,
        });

        wavesurfer.current.load(url);

        wavesurfer.current.on('ready', () => {
            setIsReady(true);
            setDuration(formatTime(wavesurfer.current?.getDuration() || 0));
        });

        wavesurfer.current.on('audioprocess', () => {
            setCurrentTime(formatTime(wavesurfer.current?.getCurrentTime() || 0));
        });

        wavesurfer.current.on('finish', () => setIsPlaying(false));
        wavesurfer.current.on('error', () => setIsReady(false));

        return () => {
            wavesurfer.current?.destroy();
        };
    }, [url]);

    const togglePlay = () => {
        if (wavesurfer.current && isReady) {
            wavesurfer.current.playPause();
            setIsPlaying(!isPlaying);
        }
    };

    return (
        <div className="flex items-center gap-3 bg-slate-50 rounded-2xl p-2 sm:p-2.5 border border-slate-100 shadow-sm">
            <button
                onClick={togglePlay}
                disabled={!isReady}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-all disabled:opacity-50 flex-shrink-0 shadow-sm"
            >
                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} className="ml-0.5" fill="currentColor" />}
            </button>
            <div className="flex-1 min-w-0">
                <div ref={containerRef} className="w-full" />
                <div className="flex justify-between mt-1 px-1">
                    <span className="text-[9px] sm:text-[10px] text-slate-400 font-medium">{isPlaying ? currentTime : '0:00'}</span>
                    <span className="text-[9px] sm:text-[10px] text-slate-400 font-medium">{duration}</span>
                </div>
            </div>
        </div>
    );
};
