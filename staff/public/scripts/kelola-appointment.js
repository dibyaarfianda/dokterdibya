// Kelola Appointment Script
(function() {
const API_BASE = '/api/sunday-appointments';
let appointmentsTable;
let allAppointments = [];

function initKelolaAppointment() {
    // Check authentication
    const token = localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Check if DataTables is available
    if (typeof $ === 'undefined' || typeof $.fn.DataTable === 'undefined') {
        console.error('DataTables library not loaded; Kelola Appointment disabled on this page');
        return;
    }

    // Clear tbody before initializing DataTable
    $('#appointments-tbody').html('');

    // Destroy existing DataTable if it exists
    if ($.fn.DataTable.isDataTable('#appointments-table')) {
        $('#appointments-table').DataTable().destroy();
    }

    // Initialize DataTable
    appointmentsTable = $('#appointments-table').DataTable({
        paging: true,
        lengthChange: true,
        searching: true,
        ordering: true,
        info: true,
        autoWidth: false,
        responsive: true,
        order: [[1, 'desc']],
        columns: [
            { title: "ID", width: "5%" },
            { title: "Tanggal", width: "15%" },
            { title: "Sesi", width: "10%" },
            { title: "Slot", width: "8%" },
            { title: "Pasien", width: "15%" },
            { title: "Telepon", width: "12%" },
            { title: "Keluhan", width: "25%" },
            { title: "Status", width: "10%" },
            { title: "Aksi", width: "10%", orderable: false }
        ],
        language: {
            url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/id.json'
        }
    });

    // Load appointments
    loadAppointments();

    // Set filter date to today
    const today = new Date().toISOString().split('T')[0];
    $('#filter-date').val(today);
}

async function loadAppointments() {
    try {
        const token = localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token');
        const date = $('#filter-date').val();
        const session = $('#filter-session').val();
        const status = $('#filter-status').val();

        let url = `${API_BASE}/list?`;
        if (date) url += `date=${date}&`;
        if (session) url += `session=${session}&`;
        if (status) url += `status=${status}&`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load appointments');

        const data = await response.json();
        allAppointments = data.appointments;
        
        renderAppointments(allAppointments);
        updateStatistics(allAppointments);

    } catch (error) {
        console.error('Error loading appointments:', error);
        showToast('Gagal memuat data appointment', 'error');
    }
}

function renderAppointments(appointments) {
    appointmentsTable.clear();

    appointments.forEach(apt => {
        const statusBadge = getStatusBadge(apt.status);
        const sessionBadge = `<span class="badge badge-info">${apt.sessionLabel}</span>`;
        
        appointmentsTable.row.add([
            apt.id,
            apt.dateFormatted,
            sessionBadge,
            `<strong>${apt.time}</strong><br><small>Slot ${apt.slot_number}</small>`,
            `<strong>${apt.patient_name}</strong><br><small>ID: ${apt.patient_id}</small>`,
            apt.patient_phone || '-',
            `<small>${apt.chief_complaint.substring(0, 80)}${apt.chief_complaint.length > 80 ? '...' : ''}</small>`,
            statusBadge,
            `
                <button class="btn btn-xs btn-info" onclick="showDetail(${apt.id})" title="Detail">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-xs btn-warning" onclick="showStatusModal(${apt.id}, '${apt.status}')" title="Update Status">
                    <i class="fas fa-edit"></i>
                </button>
            `
        ]);
    });

    appointmentsTable.draw();
}

function getStatusBadge(status) {
    const labels = {
        'pending': 'Pending',
        'confirmed': 'Confirmed',
        'completed': 'Completed',
        'cancelled': 'Cancelled',
        'no_show': 'No Show'
    };
    return `<span class="status-badge status-${status}">${labels[status]}</span>`;
}

function updateStatistics(appointments) {
    const stats = {
        pending: 0,
        confirmed: 0,
        completed: 0,
        total: appointments.length
    };

    appointments.forEach(apt => {
        if (stats.hasOwnProperty(apt.status)) {
            stats[apt.status]++;
        }
    });

    $('#stats-pending').text(stats.pending);
    $('#stats-confirmed').text(stats.confirmed);
    $('#stats-completed').text(stats.completed);
    $('#stats-total').text(stats.total);
}

function showDetail(appointmentId) {
    const apt = allAppointments.find(a => a.id === appointmentId);
    if (!apt) return;

    const detailHtml = `
        <div class="appointment-details">
            <div class="row">
                <div class="col-md-6">
                    <p><strong>ID Appointment:</strong> ${apt.id}</p>
                    <p><strong>Tanggal:</strong> ${apt.dateFormatted}</p>
                    <p><strong>Sesi:</strong> ${apt.sessionLabel}</p>
                    <p><strong>Waktu:</strong> ${apt.time}</p>
                    <p><strong>Slot:</strong> ${apt.slot_number}</p>
                </div>
                <div class="col-md-6">
                    <p><strong>Nama Pasien:</strong> ${apt.patient_name}</p>
                    <p><strong>ID Pasien:</strong> ${apt.patient_id}</p>
                    <p><strong>Telepon:</strong> ${apt.patient_phone || '-'}</p>
                    <p><strong>Email:</strong> ${apt.email || '-'}</p>
                    <p><strong>Status:</strong> ${getStatusBadge(apt.status)}</p>
                </div>
            </div>
            <hr>
            <p><strong>Keluhan Utama / Tujuan Konsultasi:</strong></p>
            <p style="background: #f8f9fa; padding: 10px; border-radius: 5px;">${apt.chief_complaint}</p>
            ${apt.notes ? `
                <p><strong>Catatan Staff:</strong></p>
                <p style="background: #fff3cd; padding: 10px; border-radius: 5px;">${apt.notes}</p>
            ` : ''}
            <hr>
            <p><small class="text-muted">Dibuat: ${new Date(apt.created_at).toLocaleString('id-ID')}</small></p>
            <p><small class="text-muted">Update Terakhir: ${new Date(apt.updated_at).toLocaleString('id-ID')}</small></p>
        </div>
    `;

    $('#detail-content').html(detailHtml);
    $('#detailModal').modal('show');
}

function showStatusModal(appointmentId, currentStatus) {
    $('#status-appointment-id').val(appointmentId);
    $('#status-select').val(currentStatus);
    $('#status-notes').val('');
    $('#statusModal').modal('show');
}

async function updateStatus() {
    try {
        const token = localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token');
        const appointmentId = $('#status-appointment-id').val();
        const status = $('#status-select').val();
        const notes = $('#status-notes').val();

        const response = await fetch(`${API_BASE}/${appointmentId}/status`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status, notes })
        });

        if (!response.ok) throw new Error('Failed to update status');

        $('#statusModal').modal('hide');
        showToast('Status berhasil diupdate', 'success');
        loadAppointments();

    } catch (error) {
        console.error('Error updating status:', error);
        showToast('Gagal update status', 'error');
    }
}

function resetFilters() {
    $('#filter-date').val('');
    $('#filter-session').val('');
    $('#filter-status').val('');
    loadAppointments();
}

function showToast(message, type) {
    const bgColor = type === 'success' ? '#28a745' : '#dc3545';
    const toast = `
        <div style="position: fixed; top: 20px; right: 20px; z-index: 9999; 
                    background: ${bgColor}; color: white; padding: 15px 20px; 
                    border-radius: 5px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
            ${message}
        </div>
    `;
    $('body').append(toast);
    setTimeout(() => {
        $('body').find('> div').last().fadeOut(500, function() { $(this).remove(); });
    }, 3000);
}

function logout() {
    localStorage.removeItem('vps_auth_token');
    sessionStorage.removeItem('vps_auth_token');
    localStorage.removeItem('idToken');
    localStorage.removeItem('userProfile');
    window.location.href = 'login.html';
}

// Export global functions that are actually defined
window.showDetail = showDetail;
window.showStatusModal = showStatusModal;
window.updateStatus = updateStatus;
window.resetFilters = resetFilters;
window.logout = logout;

window.initKelolaAppointment = initKelolaAppointment;
window.loadAppointments = loadAppointments;

// Initialize when DOM is ready (works in both standalone and SPA contexts)
// if (document.readyState === 'loading') {
//     $(document).ready(initKelolaAppointment);
// } else {
//     // DOM already loaded (SPA context)
//     setTimeout(initKelolaAppointment, 100);
// }

})(); // End IIFE
