export function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export function escapeAttribute(value) {
    return escapeHtml(value).replaceAll('`', '&#96;');
}

export function sanitizeUrl(value, { allowBlob = false } = {}) {
    if (!value) return '';
    try {
        const parsed = new URL(String(value), window.location.origin);
        const allowed = parsed.protocol === 'http:'
            || parsed.protocol === 'https:'
            || (allowBlob && parsed.protocol === 'blob:');
        return allowed ? parsed.href : '';
    } catch (_error) {
        return '';
    }
}

export function setText(element, value) {
    if (element) element.textContent = String(value ?? '');
    return element;
}
