(function () {
    'use strict';
    if (!window.PatientSession?.getToken()) {
        window.location.replace('/patient-login.html');
        return;
    }
    const shell = window.PatientToolShell;
    shell.init({ activeNav: 'aplikasi', unlockOnReady: true });
    const container = document.getElementById('estimate-app');
    const view = window.CostEstimateView.create(container, shell);
    async function load() {
        view.unavailable('Memuat harga terbaru...');
        try {
            const response = await fetch('/api/patient/estimasi-biaya?_t=' + Date.now(), {
                headers: { Authorization: 'Bearer ' + window.PatientSession.getToken(), 'Cache-Control': 'no-cache' },
                cache: 'no-store'
            });
            if (response.status === 401) {
                window.PatientSession.clearAuth();
                window.location.replace('/patient-login.html');
                return;
            }
            if (!response.ok) throw new Error('Unavailable');
            const result = await response.json();
            if (!result.success || !result.preview?.trimesters) throw new Error('Invalid response');
            view.setData(result.preview);
        } catch (_) {
            view.unavailable('Estimasi biaya belum dapat dimuat. Periksa koneksi Anda, lalu coba lagi.');
            const retry = document.createElement('button');
            retry.type = 'button'; retry.className = 'estimate-button'; retry.textContent = 'Coba lagi';
            retry.addEventListener('click', load, { once: true });
            container.appendChild(retry);
        }
    }
    load();
})();
