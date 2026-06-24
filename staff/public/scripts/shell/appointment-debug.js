(function() {
    function formatToday() {
        if (typeof window.formatDateLocal === 'function') {
            return window.formatDateLocal(new Date());
        }

        const date = new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function resetAppointmentForm() {
        const idInput = document.getElementById('appointment-id');
        const titleEl = document.getElementById('appointment-modal-title');
        const patientSelect = document.getElementById('appointment-patient-select');
        const dateInput = document.getElementById('appointment-date');
        const timeInput = document.getElementById('appointment-time');
        const typeInput = document.getElementById('appointment-type');
        const notesInput = document.getElementById('appointment-notes');

        if (idInput) idInput.value = '';
        if (titleEl) titleEl.innerHTML = '<i class="fas fa-calendar-plus mr-2"></i>Tambah Appointment Baru';
        if (patientSelect) patientSelect.innerHTML = '<option value="">Memuat pasien...</option>';
        if (dateInput) dateInput.value = formatToday();
        if (timeInput) timeInput.value = '09:00';
        if (typeInput) typeInput.value = 'Konsultasi';
        if (notesInput) notesInput.value = '';
    }

    function openAppointmentModalFallback() {
        const modal = document.getElementById('appointment-modal');
        if (!modal || typeof window.$ === 'undefined' || !window.$.fn.modal) return false;

        resetAppointmentForm();
        window.$('#appointment-modal').modal('show');
        return true;
    }

    function attachAppointmentButtonFallback() {
        const appointmentsPage = document.getElementById('appointments-page');
        if (!appointmentsPage || appointmentsPage.classList.contains('d-none')) return;

        const btn = document.getElementById('btn-add-appointment');
        if (!btn || btn.getAttribute('data-debug-handler-attached') === 'true') return;

        btn.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();

            if (typeof window.openNewAppointment === 'function') {
                window.openNewAppointment();
            } else {
                openAppointmentModalFallback();
            }
        });
        btn.setAttribute('data-debug-handler-attached', 'true');
    }

    function debugAppointments() {
        const btn = document.getElementById('btn-add-appointment');
        const modal = document.getElementById('appointment-modal');
        const appointmentsPage = document.getElementById('appointments-page');

        return {
            buttonExists: Boolean(btn),
            modalExists: Boolean(modal),
            pageExists: Boolean(appointmentsPage),
            pageVisible: Boolean(appointmentsPage && !appointmentsPage.classList.contains('d-none')),
            functionExists: typeof window.openNewAppointment === 'function',
            jqueryExists: typeof window.$ !== 'undefined'
        };
    }

    function installAppointmentDebug() {
        if (new URLSearchParams(window.location.search).get('debugAppointments') === '1') {
            window.debugAppointments = debugAppointments;

            const setupObserver = () => {
                attachAppointmentButtonFallback();
                if (typeof MutationObserver === 'undefined' || !document.body) return;

                const observer = new MutationObserver(() => attachAppointmentButtonFallback());
                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['class']
                });
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', setupObserver, { once: true });
            } else {
                setupObserver();
            }
        }
    }

    installAppointmentDebug();
})();
