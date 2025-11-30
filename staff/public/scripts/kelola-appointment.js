// Kelola Appointment Script
(function() {
const API_BASE = '/api/sunday-appointments';
let appointmentsTable;
let allAppointments = [];

function escapeHtml(value) {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

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

    // Set filter date to upcoming Sunday (or today if it's Sunday)
    function getNextSunday() {
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
        const nextSunday = new Date(today);
        nextSunday.setDate(today.getDate() + daysUntilSunday);
        return nextSunday.toISOString().split('T')[0];
    }
    $('#filter-date').val(getNextSunday());

    $('#status-select').off('change.kelola').on('change.kelola', function() {
        toggleCancellationReasonField(this.value);
    });

    toggleCancellationReasonField($('#status-select').val());

    // Setup real-time booking updates via Socket.IO
    setupRealtimeBookingUpdates();
}

// Real-time booking updates
function setupRealtimeBookingUpdates() {
    if (typeof io === 'undefined') {
        console.warn('[KelolaAppointment] Socket.IO not available');
        return;
    }

    // Create socket connection if not exists
    if (!window.socket) {
        window.socket = io({
            transports: ['websocket', 'polling'],
            reconnection: true
        });
    }

    const socket = window.socket;

    // Listen for new bookings
    socket.on('booking:new', (data) => {
        console.log('[KelolaAppointment] New booking received:', data);
        showToast(`Booking baru: ${data.booking.patient_name}`, 'info');
        // Reload appointments to show the new booking
        loadAppointments();
    });

    // Listen for booking updates
    socket.on('booking:update', (data) => {
        console.log('[KelolaAppointment] Booking updated:', data);
        showToast(`Booking diupdate: ${data.booking.patient_name} - ${data.booking.status}`, 'info');
        loadAppointments();
    });

    // Listen for booking cancellations
    socket.on('booking:cancel', (data) => {
        console.log('[KelolaAppointment] Booking cancelled:', data);
        showToast(`Booking dibatalkan: ${data.booking.patient_name}`, 'warning');
        loadAppointments();
    });

    console.log('[KelolaAppointment] Real-time updates enabled');
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
        const statusBadge = getStatusBadge(apt.status, apt.cancellation_reason);
        const sessionBadge = `<span class="badge badge-info">${apt.sessionLabel}</span>`;
        const complaintRaw = (apt.chief_complaint || '').trim();
        const complaintPreview = complaintRaw.length > 80 ? `${complaintRaw.substring(0, 80)}...` : complaintRaw;
        const complaintHtml = complaintRaw ? escapeHtml(complaintPreview) : '-';
        
        appointmentsTable.row.add([
            apt.id,
            apt.dateFormatted,
            sessionBadge,
            `<strong>${apt.time}</strong><br><small>Slot ${apt.slot_number}</small>`,
            `<strong>${apt.patient_name}</strong><br><small>ID: ${apt.patient_id}</small>`,
            apt.patient_phone || '-',
            `<small>${complaintHtml}</small>`,
            statusBadge,
            `
                <button class="btn btn-xs btn-info" onclick="showDetail(${apt.id})" title="Detail">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-xs btn-warning" onclick="showStatusModal(${apt.id}, '${apt.status}')" title="Update Status">
                    <i class="fas fa-edit"></i>
                </button>
                ${['cancelled', 'completed', 'no_show'].includes(apt.status) ? `
                <button class="btn btn-xs btn-secondary" onclick="archiveAppointment(${apt.id})" title="Arsipkan">
                    <i class="fas fa-archive"></i>
                </button>
                ` : ''}
            `
        ]);
    });

    appointmentsTable.draw();
}

function getStatusBadge(status, cancellationReason) {
    const labels = {
        'pending': 'Pending',
        'confirmed': 'Confirmed',
        'completed': 'Completed',
        'cancelled': 'Cancelled',
        'no_show': 'No Show'
    };
    const label = labels[status] || status;
    const tooltip = status === 'cancelled' && cancellationReason
        ? ` title="${escapeHtml(cancellationReason)}"`
        : '';
    return `<span class="status-badge status-${status}"${tooltip}>${label}</span>`;
}

function toggleCancellationReasonField(status) {
    const group = document.getElementById('status-cancel-reason-group');
    if (!group) return;
    if (status === 'cancelled') {
        group.style.display = '';
    } else {
        group.style.display = 'none';
    }
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

    const complaintBlock = escapeHtml(apt.chief_complaint || '-').replace(/\n/g, '<br>');
    const notesBlock = apt.notes ? escapeHtml(apt.notes).replace(/\n/g, '<br>') : '';
    const cancellationReasonBlock = apt.cancellation_reason ? escapeHtml(apt.cancellation_reason).replace(/\n/g, '<br>') : '';
    const cancelledByLabel = apt.cancelled_by === 'patient' ? 'Pasien' : apt.cancelled_by === 'staff' ? 'Staff Klinik' : apt.cancelled_by === 'system' ? 'Sistem' : '-';
    const cancelledAtLabel = apt.cancelled_at ? new Date(apt.cancelled_at).toLocaleString('id-ID') : null;

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
                    <p><strong>Status:</strong> ${getStatusBadge(apt.status, apt.cancellation_reason)}</p>
                </div>
            </div>
            <hr>
            <p><strong>Keluhan Utama / Tujuan Konsultasi:</strong></p>
            <p style="background: #f8f9fa; padding: 10px; border-radius: 5px;">${complaintBlock}</p>
            ${notesBlock ? `
                <p><strong>Catatan Staff:</strong></p>
                <p style="background: #fff3cd; padding: 10px; border-radius: 5px;">${notesBlock}</p>
            ` : ''}
            ${apt.status === 'cancelled' ? `
                <hr>
                <p><strong>Dibatalkan Oleh:</strong> ${escapeHtml(cancelledByLabel)}</p>
                ${cancellationReasonBlock ? `
                    <p><strong>Alasan Pembatalan:</strong></p>
                    <p style="background: #fdecea; padding: 10px; border-radius: 5px;">${cancellationReasonBlock}</p>
                ` : ''}
                ${cancelledAtLabel ? `<p><small class="text-muted">Dibatalkan: ${escapeHtml(cancelledAtLabel)}</small></p>` : ''}
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
    const appointment = allAppointments.find(a => a.id === appointmentId);
    $('#status-notes').val(appointment?.notes || '');
    $('#status-cancel-reason').val(appointment?.cancellation_reason || '');
    toggleCancellationReasonField(currentStatus);
    $('#statusModal').modal('show');
}

async function updateStatus() {
    try {
        const token = localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token');
        const appointmentId = $('#status-appointment-id').val();
        const status = $('#status-select').val();
        const notes = $('#status-notes').val();
        const cancellationReasonInput = document.getElementById('status-cancel-reason');
        const cancellationReasonValue = cancellationReasonInput ? cancellationReasonInput.value.trim() : '';

        if (status === 'cancelled' && cancellationReasonValue.length < 10) {
            showToast('Mohon isi alasan pembatalan minimal 10 karakter.', 'error');
            cancellationReasonInput?.focus();
            return;
        }

        const response = await fetch(`${API_BASE}/${appointmentId}/status`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status, notes, cancellationReason: status === 'cancelled' ? cancellationReasonValue : null })
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
    const bgColor = type === 'success' ? '#28a745' : (type === 'info' ? '#17a2b8' : '#dc3545');
    const toastId = 'toast-' + Date.now();
    const toast = `
        <div id="${toastId}" class="kelola-toast" style="position: fixed; top: 20px; right: 20px; z-index: 9999;
                    background: ${bgColor}; color: white; padding: 15px 20px;
                    border-radius: 5px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
            ${message}
        </div>
    `;
    $('body').append(toast);
    setTimeout(() => {
        $('#' + toastId).fadeOut(500, function() { $(this).remove(); });
    }, 3000);
}

async function archiveAppointment(appointmentId) {
    const apt = allAppointments.find(a => a.id === appointmentId);
    if (!apt) return;

    if (!confirm(`Arsipkan appointment untuk ${apt.patient_name}?\n\nAppointment akan dipindahkan ke arsip dan dapat dikembalikan nanti jika diperlukan.`)) {
        return;
    }

    try {
        const token = localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token');

        // Move to archive via API
        const response = await fetch(`/api/appointment-archive/archive-single/${appointmentId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                archived_reason: 'Manually archived by staff'
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to archive appointment');
        }

        showToast('Appointment berhasil diarsipkan', 'success');

        // Reload appointments
        await loadAppointments();

    } catch (error) {
        console.error('Error archiving appointment:', error);
        showToast('Gagal mengarsipkan appointment: ' + error.message, 'error');
    }
}

function logout() {
    localStorage.removeItem('vps_auth_token');
    sessionStorage.removeItem('vps_auth_token');
    localStorage.removeItem('idToken');
    localStorage.removeItem('userProfile');
    window.location.href = 'login.html';
}

// Export global functions that are actually defined
window.initKelolaAppointment = initKelolaAppointment;
window.showDetail = showDetail;
window.showStatusModal = showStatusModal;
window.updateStatus = updateStatus;
window.resetFilters = resetFilters;
window.logout = logout;
window.loadAppointments = loadAppointments;
window.archiveAppointment = archiveAppointment;


})(); // End IIFE
