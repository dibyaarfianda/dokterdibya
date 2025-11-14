/**
 * Sticky mobile action bar to keep primary navigation reachable on phones.
 */
(function () {
    const ACTION_MAP = {
        dashboard: () => window.showDashboardPage && window.showDashboardPage(),
        patients: () => window.showPatientPage && window.showPatientPage(),
        tindakan: () => window.showTindakanPage && window.showTindakanPage(),
        obat: () => window.showObatPage && window.showObatPage(),
        cashier: () => window.showCashierPage && window.showCashierPage(),
        appointments: () => window.showAppointmentsPage && window.showAppointmentsPage(),
    };

    function setActive(action) {
        const bar = document.getElementById('mobile-action-bar');
        if (!bar) return;
        bar.querySelectorAll('button[data-action]').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.action === action);
        });
    }

    function bindActions() {
        const bar = document.getElementById('mobile-action-bar');
        if (!bar) return;

        document.body.classList.add('has-mobile-action-bar');

        bar.querySelectorAll('button[data-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                const handler = ACTION_MAP[action];
                if (typeof handler === 'function') {
                    handler();
                }
                setActive(action);
            });
        });

        document.addEventListener('page:changed', (event) => {
            if (event.detail && event.detail.page) {
                setActive(event.detail.page);
            }
        });
    }

    function initMobileActionBar() {
        const bar = document.getElementById('mobile-action-bar');
        if (!bar) {
            return;
        }

        // Delay binding slightly to ensure main.js has registered global functions
        setTimeout(bindActions, 50);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMobileActionBar);
    } else {
        initMobileActionBar();
    }
})();
