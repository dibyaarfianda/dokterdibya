(function () {
    'use strict';
    const view = window.CostEstimateView.create(document.getElementById('estimate-app'), window.PatientToolShell, { preview: true });
    function dummy() {
        view.setData(window.createDummyCostEstimate());
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
