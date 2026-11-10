// Dependency-free helper (no imports) for the Planning "Kontrol" interval.
// Dates are handled with local components only; never toISOString() (GMT+7 shift).

export const KONTROL_INTERVALS = Object.freeze([
    { value: '1_minggu', label: '1 mgg' },
    { value: '2_minggu', label: '2 mgg' },
    { value: '1_bulan', label: '1 bln' },
    { value: '3_bulan', label: '3 bln' },
    { value: '6_bulan', label: '6 bln' },
    { value: 'tanggal', label: 'Pilih tanggal' },
    { value: 'tidak_perlu', label: 'Tidak perlu' }
].map(item => Object.freeze(item)));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseStrictDate(value) {
    const text = String(value || '');
    if (!DATE_RE.test(text)) return null;
    const [y, m, d] = text.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
    return { y, m, d };
}

function formatLocal(date) {
    const y = String(date.getFullYear()).padStart(4, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function addDays({ y, m, d }, days) {
    return formatLocal(new Date(y, m - 1, d + days));
}

function addMonthsClamped({ y, m, d }, months) {
    const lastDay = new Date(y, m - 1 + months + 1, 0).getDate();
    return formatLocal(new Date(y, m - 1 + months, Math.min(d, lastDay)));
}

export function computeKontrolDate(baseDate, interval, manualDate = '') {
    const base = parseStrictDate(baseDate);
    if (!base) return '';
    switch (interval) {
        case '1_minggu': return addDays(base, 7);
        case '2_minggu': return addDays(base, 14);
        case '1_bulan': return addMonthsClamped(base, 1);
        case '3_bulan': return addMonthsClamped(base, 3);
        case '6_bulan': return addMonthsClamped(base, 6);
        case 'tanggal': return parseStrictDate(manualDate) ? String(manualDate) : '';
        default: return '';
    }
}

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
    'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// "2026-11-21" -> "Sabtu, 21 November 2026". Built from the calendar parts (no Date-to-ISO
// conversion, no timezone dependency). Returns '' for anything that is not a real date.
export function formatKontrolLabel(dateStr) {
    const p = parseStrictDate(dateStr);
    if (!p) return '';
    const weekday = new Date(p.y, p.m - 1, p.d).getDay();
    return `${DAY_NAMES[weekday]}, ${p.d} ${MONTH_NAMES[p.m - 1]} ${p.y}`;
}
