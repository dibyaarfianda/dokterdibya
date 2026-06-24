(function() {
    function isStaffDebugEnabled() {
        try {
            return new URLSearchParams(window.location.search).get('debugStaff') === '1';
        } catch (error) {
            return false;
        }
    }

    window.staffDebugLog = window.staffDebugLog || function staffDebugLog(scope, ...args) {
        if (!isStaffDebugEnabled()) return;
        console.log(`[${scope}]`, ...args);
    };

    window.installPatientViewButtons = function installPatientViewButtons(options = {}) {
        const onView = typeof options.onView === 'function'
            ? options.onView
            : window.viewPatientDetail;

        document.querySelectorAll('.btn-view-patient').forEach(btn => {
            if (btn.getAttribute('data-patient-view-bound') === 'true') return;

            btn.addEventListener('click', function(event) {
                event.preventDefault();
                event.stopPropagation();
                const patientId = this.getAttribute('data-patient-id');
                window.staffDebugLog('PatientSearch', 'View button clicked', { patientId });
                if (typeof onView === 'function') {
                    onView(patientId);
                }
            });

            btn.setAttribute('data-patient-view-bound', 'true');
        });
    };
})();
