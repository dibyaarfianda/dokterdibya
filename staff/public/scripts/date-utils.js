function datePartsInTimeZone(value, timeZone = 'Asia/Jakarta') {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(date);

        const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return {
            year: byType.year,
            month: byType.month,
            day: byType.day
        };
    } catch (error) {
        return {
            year: String(date.getFullYear()),
            month: String(date.getMonth() + 1).padStart(2, '0'),
            day: String(date.getDate()).padStart(2, '0')
        };
    }
}

export function formatDateLocal(value = new Date(), timeZone = 'Asia/Jakarta') {
    const parts = datePartsInTimeZone(value, timeZone);
    if (!parts) return '';
    return `${parts.year}-${parts.month}-${parts.day}`;
}

if (typeof window !== 'undefined') {
    window.formatDateLocalInput = formatDateLocal;
}
