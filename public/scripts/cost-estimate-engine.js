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
            let valid = source.ready !== false && validRepeat(repeat);
            let medicationTotal = 0, serviceTotal = 0;
            const items = source.items.map(item => {
                const count = item.kind === 'medication' ? repeat : (Object.prototype.hasOwnProperty.call(scenario.services || {}, item.key) ? scenario.services[item.key] : item.repeats);
                const subtotal = validRepeat(count) ? Math.round(item.quantity * item.price * Number(count) * 100) / 100 : null;
                if (subtotal === null || !Number.isFinite(subtotal) || subtotal > Number.MAX_SAFE_INTEGER) valid = false;
                if (item.kind === 'medication') medicationTotal += subtotal || 0;
                else serviceTotal += subtotal || 0;
                return { ...item, repeats: validRepeat(count) ? Number(count) : null, subtotal };
            });
            const trimesterTotal = medicationTotal + serviceTotal;
            if (!Number.isFinite(trimesterTotal) || trimesterTotal > Number.MAX_SAFE_INTEGER) valid = false;
            trimesters[key] = { ...source, repeats: validRepeat(repeat) ? Number(repeat) : null, items, ready: valid,
                medication_total: valid ? medicationTotal : null, service_total: valid ? serviceTotal : null,
                total: valid ? trimesterTotal : null };
            if (active) { ready = ready && valid; total += trimesterTotal; }
        });
        if (!['all', ...TRIMESTERS].includes(selected) || !Number.isSafeInteger(Math.round(total))) ready = false;
        return { ...data, ready, trimesters, total: ready ? total : null };
    }
    return { TRIMESTERS, validRepeat, calculateEstimate };
});
