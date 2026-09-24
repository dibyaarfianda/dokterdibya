// Fetch a complete staff-side patient collection through bounded server pages.
// Callers publish the returned array only after every page has succeeded.
export async function loadAllPatientPages(baseUrl, request) {
    const url = new URL(baseUrl, window.location.origin);
    url.searchParams.set('limit', '100');
    url.searchParams.delete('page');
    url.searchParams.delete('cursor');
    const rows = [];
    const seen = new Set();
    let cursor = null;
    do {
        if (cursor) url.searchParams.set('cursor', cursor);
        const pageUrl = baseUrl.startsWith('/') ? `${url.pathname}${url.search}` : url.toString();
        const response = await request(pageUrl);
        if (response && typeof response.ok === 'boolean' && !response.ok) {
            throw new Error('Failed to load patients');
        }
        const payload = response && typeof response.json === 'function' ? await response.json() : response;
        if (!payload?.success || !Array.isArray(payload.data) || !payload.pagination || !Object.prototype.hasOwnProperty.call(payload.pagination, 'nextCursor')) {
            throw new Error('Incomplete patient page');
        }
        rows.push(...payload.data);
        cursor = payload.pagination.nextCursor;
        if (cursor && (typeof cursor !== 'string' || seen.has(cursor))) {
            throw new Error('Invalid patient page cursor');
        }
        if (cursor) seen.add(cursor);
    } while (cursor);
    return { success: true, data: rows };
}
