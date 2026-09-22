(function () {
    'use strict';
    const view = window.CostEstimateView.create(document.getElementById('estimate-app'), window.PatientToolShell);
    function dummy() {
        const trimesters = {};
        ['t1', 't2', 't3'].forEach((key, i) => {
            trimesters[key] = { ready: true, repeats: 1, issues: [], items: [
                { key: key + '-medication-0', kind: 'medication', label: 'Paket Contoh ' + (i + 1), quantity: 30, unit: 'tablet', price: 1000, repeats: 1 },
                { key: key + '-service-0', kind: 'service', label: 'Konsultasi Contoh', quantity: 1, unit: 'kali', price: 100000, repeats: 1 },
                { key: key + '-service-1', kind: 'service', label: 'Pemeriksaan Contoh', quantity: 1, unit: 'kali', price: 150000, repeats: 1 }
            ] };
        });
        view.setData({ version: 2, is_dummy: true, prices_loaded_at: new Date().toISOString(), mandatory_costs: { admin: {label:'Biaya Admin Contoh',price:5000,ready:true}, books: {obstetri:{label:'Buku Kontrol Obstetri Contoh',price:10000,ready:true},ginekologi:{label:'Buku Kontrol Ginekologi Contoh',price:10000,ready:true}} }, trimesters });
    }
    // Only the staff parent window can supply sanitized view data. No auth/session is read here.
    window.addEventListener('message', event => {
        if (window.parent === window || event.source !== window.parent || event.origin !== window.location.origin) return;
        if (event.data?.type === 'estimate-data') view.setData(event.data.preview);
        if (event.data?.type === 'estimate-dummy') dummy();
        if (event.data?.type === 'estimate-unavailable') view.unavailable(event.data.message);
    });
    document.addEventListener('click', event => {
        const link = event.target.closest('a');
        if (link) { event.preventDefault(); window.PatientToolShell.closeSheet(); }
    });
    view.unavailable('Pilih Pratinjau Pasien pada staff panel untuk memulai.');
    window.parent.postMessage({ type: 'estimate-ready' }, window.location.origin);
})();
