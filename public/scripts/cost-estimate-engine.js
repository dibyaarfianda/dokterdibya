(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CostEstimateEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const TRIMESTERS = ['t1', 't2', 't3'];
    function validRepeat(value) {
        return Number.isSafeInteger(Number(value)) && Number(value) >= 0 && value !== '' && value != null;
    }
    function calculateEstimate(data, scenario = {}) {
        const selected = scenario.trimester || 'all';
        let total = 0;
        let ready = true;
        const trimesters = {};
        TRIMESTERS.forEach(key => {
            const source = data.trimesters[key];
            const active = selected === 'all' || selected === key;
            const repeat = Object.prototype.hasOwnProperty.call(scenario.repeats || {}, key) ? scenario.repeats[key] : source.repeats;
            // A blocked group must not hide the other group's valid subtotal.
            let medicationValid = (source.medication_ready ?? (source.ready !== false)) && validRepeat(repeat);
            let serviceValid = source.service_ready ?? (source.ready !== false);
            let medicationTotal = 0, serviceTotal = 0;
            const items = source.items.map(item => {
                const count = item.kind === 'medication' ? repeat : (Object.prototype.hasOwnProperty.call(scenario.services || {}, item.key) ? scenario.services[item.key] : item.repeats);
                const subtotal = validRepeat(count) ? Math.round(item.quantity * item.price * Number(count) * 100) / 100 : null;
                if (subtotal === null || !Number.isFinite(subtotal) || subtotal > Number.MAX_SAFE_INTEGER) {
                    if (item.kind === 'medication') medicationValid = false; else serviceValid = false;
                }
                if (item.kind === 'medication') medicationTotal += subtotal || 0;
                else serviceTotal += subtotal || 0;
                return { ...item, repeats: validRepeat(count) ? Number(count) : null, subtotal };
            });
            const fees = data.mandatory_costs;
            const visits = scenario.visits?.[key];
            const activeItems = items.some(item => item.repeats > 0);
            const visitIssue = fees && validRepeat(visits) && Number(visits) === 0 && activeItems
                ? 'Jumlah kunjungan minimal 1 bila ada resep atau layanan yang dihitung.' : null;
            const adminTotal = !fees ? 0 : validRepeat(visits) && !visitIssue && fees.admin.ready
                ? Math.round(Number(visits) * fees.admin.price * 100) / 100 : null;
            const adminValid = adminTotal != null && Number.isFinite(adminTotal) && adminTotal <= Number.MAX_SAFE_INTEGER;
            const trimesterTotal = medicationTotal + serviceTotal + (adminTotal || 0);
            medicationValid = medicationValid && Number.isFinite(medicationTotal) && medicationTotal <= Number.MAX_SAFE_INTEGER;
            serviceValid = serviceValid && Number.isFinite(serviceTotal) && serviceTotal <= Number.MAX_SAFE_INTEGER;
            const valid = medicationValid && serviceValid && adminValid && Number.isFinite(trimesterTotal) && trimesterTotal <= Number.MAX_SAFE_INTEGER;
            trimesters[key] = { ...source, repeats: validRepeat(repeat) ? Number(repeat) : null, items, ready: valid,
                medication_total: medicationValid ? medicationTotal : null, service_total: serviceValid ? serviceTotal : null,
                admin_total: adminValid ? adminTotal : null, visits: validRepeat(visits) ? Number(visits) : null, visit_issue: visitIssue,
                total: valid ? trimesterTotal : null };
            if (active) { ready = ready && valid; total += trimesterTotal; }
        });
        let bookTotal = 0, bookPending = false;
        if (data.mandatory_costs) {
            const phases = TRIMESTERS.filter(key => selected === 'all' || selected === key).map(key => trimesters[key]);
            bookPending = phases.some(phase => phase.visits == null);
            const book = data.mandatory_costs.books[scenario.book];
            bookTotal = scenario.book === 'owned' ? 0 : bookPending ? null : phases.every(phase => phase.visits === 0) ? 0
                : book?.ready ? book.price : null;
            if (bookTotal == null || !Number.isFinite(bookTotal) || bookTotal < 0) ready = false;
            else total += bookTotal;
        }
        if (!['all', ...TRIMESTERS].includes(selected) || !Number.isSafeInteger(Math.round(total))) ready = false;
        return { ...data, ready, trimesters, book_total: bookTotal, book_pending: bookPending, total: ready ? total : null };
    }
    return { TRIMESTERS, validRepeat, calculateEstimate };
});
