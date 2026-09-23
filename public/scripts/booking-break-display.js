(function(root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.BookingBreakDisplay = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    function timeline(slots, rest) {
        const rows = slots.map(slot => ({ ...slot }));
        if (!rest || !/^\d{2}:\d{2}$/.test(rest.startTime) || !/^\d{2}:\d{2}$/.test(rest.endTime)) return rows;
        const index = rows.findIndex(slot => slot.time >= rest.startTime);
        rows.splice(index < 0 ? rows.length : index, 0, { isBreak: true, ...rest });
        return rows;
    }
    function block(rest, active = false) {
        const safe = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
        return `<div class="booking-break-block${active ? ' is-active' : ''}" role="note" style="grid-column:1 / -1; width:100%; box-sizing:border-box; padding:14px; margin:4px 0; border-radius:12px; text-align:center; background:${active ? '#198754' : '#f0f4f2'}; color:${active ? '#fff' : '#52675d'}; border:1px dashed ${active ? '#198754' : '#a8bcb0'}; font-weight:600;">${active ? 'Sedang istirahat' : 'Istirahat'} &middot; ${safe(rest.startTime)} - ${safe(rest.endTime)} WIB</div>`;
    }
    return { timeline, block };
});
