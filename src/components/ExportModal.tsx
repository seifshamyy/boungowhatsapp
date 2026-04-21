import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useConfig } from '../context/ConfigContext';

interface Ad {
    text: string;
    count: number;
    preview: string;
}

interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ExportModal = ({ isOpen, onClose }: ExportModalProps) => {
    const { config } = useConfig();
    const [ads, setAds] = useState<Ad[]>([]);
    const [selectedAd, setSelectedAd] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [loadingAds, setLoadingAds] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportResult, setExportResult] = useState<number | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setExportResult(null);
        loadAds();
    }, [isOpen]);

    const loadAds = async () => {
        setLoadingAds(true);
        const PAGE = 1000;
        let offset = 0;
        const counts = new Map<string, number>();

        // Paginate through ALL /// messages — no truncation
        while (true) {
            const { data } = await supabase
                .from(config.tableMessages)
                .select('text')
                .like('text', '///%')
                .range(offset, offset + PAGE - 1);

            if (!data || data.length === 0) break;
            (data as { text: string }[]).forEach(m => {
                if (m.text) counts.set(m.text, (counts.get(m.text) || 0) + 1);
            });
            if (data.length < PAGE) break;
            offset += PAGE;
        }

        setAds(
            [...counts.entries()]
                .map(([text, count]) => ({
                    text,
                    count,
                    preview: text.replace(/^\/\/\//, '').trim().slice(0, 65),
                }))
                .sort((a, b) => b.count - a.count)
        );
        setLoadingAds(false);
    };

    const handleExport = async () => {
        setExporting(true);
        setExportResult(null);

        // ── 1. Collect all matching contact phone numbers (paginated, no limit) ──
        const PAGE = 1000;
        let offset = 0;
        const phoneSet = new Set<string>();

        while (true) {
            let q = supabase
                .from(config.tableMessages)
                .select('from, to')
                .like('text', '///%');

            if (selectedAd) q = q.eq('text', selectedAd);
            if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00.000Z`);
            if (dateTo)   q = q.lte('created_at', `${dateTo}T23:59:59.999Z`);

            const { data } = await (q as any).range(offset, offset + PAGE - 1);
            if (!data || data.length === 0) break;

            (data as { from: string | null; to: string | null }[]).forEach(m => {
                // Incoming messages: from = customer phone (numeric)
                if (m.from && /^\d+$/.test(m.from)) phoneSet.add(m.from);
                else if (m.to && /^\d+$/.test(m.to)) phoneSet.add(m.to);
            });

            if (data.length < PAGE) break;
            offset += PAGE;
        }

        // ── 2. Look up names in batches of 500 to avoid URL length limits ──
        const phones = [...phoneSet];
        const nameMap = new Map<string, string>();
        const BATCH = 500;

        for (let i = 0; i < phones.length; i += BATCH) {
            const ids = phones.slice(i, i + BATCH).map(Number);
            const { data } = await supabase
                .from(config.tableContacts)
                .select('id, name_WA')
                .in('id', ids);

            if (data) {
                (data as { id: number | string; name_WA: string | null }[]).forEach(c => {
                    nameMap.set(String(c.id), c.name_WA || '');
                });
            }
        }

        // ── 3. Build & download CSV ──
        const lines = ['Phone,Name', ...phones.map(p => {
            const name = (nameMap.get(p) || '').replace(/"/g, '""');
            return `${p},"${name}"`;
        })];
        const csv = lines.join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel UTF-8

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const label = [
            selectedAd ? 'ad' : 'all',
            dateFrom || '',
            dateTo   ? `to${dateTo}` : '',
        ].filter(Boolean).join('_') || 'all';
        a.href = url;
        a.download = `contacts_${label}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setExportResult(phones.length);
        setExporting(false);
    };

    if (!isOpen) return null;

    const totalContacts = ads.reduce((s, a) => s + a.count, 0);

    return createPortal(
        <div
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={onClose}
        >
            <div
                className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col"
                style={{ maxHeight: '92dvh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <Download size={17} style={{ color: 'var(--color-accent)' }} />
                        <h3 className="font-bold text-slate-900 text-base">Export Contacts</h3>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

                    {/* Ad filter */}
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                            Filter by Ad
                        </label>
                        {loadingAds ? (
                            <div className="py-3 text-xs text-slate-400 animate-pulse">Scanning ads…</div>
                        ) : (
                            <div className="relative">
                                <select
                                    value={selectedAd}
                                    onChange={e => { setSelectedAd(e.target.value); setExportResult(null); }}
                                    className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 pr-9 text-sm text-slate-800 focus:outline-none focus:border-slate-300"
                                >
                                    <option value="">All ads — {totalContacts} contacts</option>
                                    {ads.map((ad, i) => (
                                        <option key={i} value={ad.text}>
                                            {ad.preview}… ({ad.count})
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                        )}
                    </div>

                    {/* Date range */}
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                            Date Range
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <span className="text-[10px] text-slate-400 mb-1 block">From</span>
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={e => { setDateFrom(e.target.value); setExportResult(null); }}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-slate-300"
                                />
                            </div>
                            <div>
                                <span className="text-[10px] text-slate-400 mb-1 block">To</span>
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={e => { setDateTo(e.target.value); setExportResult(null); }}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-slate-300"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Success banner */}
                    {exportResult !== null && (
                        <div
                            className="rounded-2xl px-4 py-3 text-sm font-semibold text-center"
                            style={{
                                backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, white)',
                                color: 'var(--color-accent)',
                            }}
                        >
                            ✓ {exportResult} contacts exported
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div
                    className="px-5 pt-4 pb-5 border-t border-slate-100 flex gap-3 flex-shrink-0"
                    style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
                >
                    <button
                        onClick={() => { setSelectedAd(''); setDateFrom(''); setDateTo(''); setExportResult(null); }}
                        className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-sm font-bold transition-colors"
                    >
                        Clear
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={exporting || loadingAds}
                        className="flex-1 py-3 text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60"
                        style={{ backgroundColor: 'var(--color-accent)' }}
                    >
                        {exporting
                            ? <span className="animate-pulse">Exporting…</span>
                            : <><Download size={15} /> Export CSV</>
                        }
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
