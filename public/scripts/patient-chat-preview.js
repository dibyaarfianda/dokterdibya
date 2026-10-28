// A short-lived preview in this tab only. Never persist private/direct rooms.
export function createPatientChatPreview({ owner, getToken, storage, now = Date.now }) {
    const key = 'patient_community_preview_v1';
    const credential = getToken();
    const validSession = () => Boolean(credential) && credential === getToken();
    function clear() { try { storage.removeItem(key); } catch (_) {} }
    function read() {
        try {
            const data = JSON.parse(storage.getItem(key) || 'null');
            if (!validSession() || !data || data.owner !== String(owner) || data.expires <= now() ||
                data.room?.slug !== 'lobby' || data.room.is_direct || !Array.isArray(data.messages)) {
                clear(); return null;
            }
            return { room: data.room, messages: data.messages };
        } catch (_) { clear(); return null; }
    }
    function save(data) {
        if (!validSession()) { clear(); return; }
        if (data?.room?.slug !== 'lobby' || data.room.is_direct || !Array.isArray(data.messages)) return;
        try { storage.setItem(key, JSON.stringify({ owner: String(owner), expires: now() + 15 * 60 * 1000,
            room: data.room, messages: data.messages.slice(-80) })); } catch (_) {}
    }
    return { read, save, clear };
}
