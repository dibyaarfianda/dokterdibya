(function(root, factory) {
    const create = factory();
    if (typeof module === 'object' && module.exports) module.exports = create;
    else root.createDummyCostEstimate = create;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    return function createDummyCostEstimate() {
        const trimesters = {};
        ['t1', 't2', 't3'].forEach((key, i) => {
            trimesters[key] = { ready: true, repeats: 1, issues: [], items: [
                { key: key + '-medication-0', kind: 'medication', label: 'Paket Contoh ' + (i + 1), quantity: 30, unit: 'tablet', price: 1000, repeats: 1 },
                { key: key + '-service-0', kind: 'service', label: 'Konsultasi Contoh', quantity: 1, unit: 'kali', price: 100000, repeats: 1 },
                { key: key + '-service-1', kind: 'service', label: 'Pemeriksaan Contoh', quantity: 1, unit: 'kali', price: 150000, repeats: 1 }
            ] };
        });
        return { version: 2, is_dummy: true, prices_loaded_at: new Date().toISOString(), mandatory_costs: { admin: {label:'Biaya Admin Contoh',price:5000,ready:true}, books: {obstetri:{label:'Buku Kontrol Obstetri Contoh',price:10000,ready:true},ginekologi:{label:'Buku Kontrol Ginekologi Contoh',price:10000,ready:true}} }, trimesters };
    };
});
