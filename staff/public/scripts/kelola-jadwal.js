// Kelola Jadwal Praktik Script
(function() {
const VPS_API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3001'
    : window.location.origin.replace(/\/$/, '');
const API_BASE = `${VPS_API_BASE}/api/practice-schedules`;
let schedulesTable;
let allSchedules = [];

const locationNames = {
    'klinik_privat': 'Klinik Privat Minggu',
    'rsud_gambiran': 'RSUD Gambiran Kediri',
    'rsia_melinda': 'RSIA Melinda Kediri',
    'rs_bhayangkara': 'RS Bhayangkara Kediri'
};

const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

let disabledDates = [];

function initKelolaJadwal() {
    // Check authentication
    const token = localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Check if DataTables is available
    if (typeof $ === 'undefined' || typeof $.fn.DataTable === 'undefined') {
        console.error('DataTables library not loaded; Kelola Jadwal disabled on this page');
        return;
    }

    // Clear tbody before initializing DataTable
    $('#schedules-tbody').html('');

    // Destroy existing DataTable if it exists
    if ($.fn.DataTable.isDataTable('#schedules-table')) {
        $('#schedules-table').DataTable().destroy();
    }

    // Initialize DataTable
    schedulesTable = $('#schedules-table').DataTable({
        paging: true,
        lengthChange: true,
        searching: true,
        ordering: true,
        info: true,
        autoWidth: false,
        responsive: true,
        order: [[1, 'asc'], [2, 'asc']],
        columns: [
            { title: "ID", width: "5%" },
            { title: "Lokasi", width: "20%" },
            { title: "Hari", width: "15%" },
            { title: "Waktu", width: "20%" },
            { title: "Keterangan", width: "25%" },
            { title: "Status", width: "8%" },
            { title: "Aksi", width: "12%", orderable: false }
        ],
        language: {
            url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/id.json'
        }
    });

    // Load schedules
    loadSchedules();

    // Load disabled dates
    loadDisabledDates();
}

async function loadSchedules() {
    try {
        const token = localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token');
        
        const response = await fetch(`${API_BASE}/all`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load schedules');

        const data = await response.json();
        allSchedules = data.schedules;
        
        renderSchedules(allSchedules);

    } catch (error) {
        console.error('Error loading schedules:', error);
        showToast('Gagal memuat data jadwal', 'error');
    }
}

function renderSchedules(schedules) {
    schedulesTable.clear();

    schedules.forEach(schedule => {
        const locationBadge = `<span class="location-badge location-${schedule.location}">${locationNames[schedule.location]}</span>`;
        const statusBadge = schedule.is_active 
            ? '<span class="badge badge-success">Aktif</span>'
            : '<span class="badge badge-secondary">Nonaktif</span>';
        
        schedulesTable.row.add([
            schedule.id,
            locationBadge,
            dayNames[schedule.day_of_week],
            `${formatTime(schedule.start_time)} - ${formatTime(schedule.end_time)}`,
            schedule.notes || '-',
            statusBadge,
            `
                <button class="btn btn-xs btn-warning" onclick="editSchedule(${schedule.id})" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-xs btn-danger" onclick="deleteSchedule(${schedule.id})" title="Hapus">
                    <i class="fas fa-trash"></i>
                </button>
            `
        ]);
    });

    schedulesTable.draw();
}

function formatTime(time) {
    // Format HH:MM:SS to HH:MM
    return time.substring(0, 5);
}

function showAddModal() {
    $('#modalTitle').text('Tambah Jadwal');
    $('#schedule-id').val('');
    $('#schedule-location').val('');
    $('#schedule-day').val('');
    $('#schedule-start').val('');
    $('#schedule-end').val('');
    $('#schedule-notes').val('');
    $('#schedule-active').prop('checked', true);
    $('#scheduleModal').modal('show');
}

function editSchedule(id) {
    const schedule = allSchedules.find(s => s.id === id);
    if (!schedule) return;

    $('#modalTitle').text('Edit Jadwal');
    $('#schedule-id').val(schedule.id);
    $('#schedule-location').val(schedule.location);
    $('#schedule-day').val(schedule.day_of_week);
    $('#schedule-start').val(formatTime(schedule.start_time));
    $('#schedule-end').val(formatTime(schedule.end_time));
    $('#schedule-notes').val(schedule.notes || '');
    $('#schedule-active').prop('checked', schedule.is_active === 1);
    $('#scheduleModal').modal('show');
}

async function saveSchedule() {
    try {
        const token = localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token');
        const scheduleId = $('#schedule-id').val();
        const location = $('#schedule-location').val();
        const day_of_week = $('#schedule-day').val();
        const start_time = $('#schedule-start').val();
        const end_time = $('#schedule-end').val();
        const notes = $('#schedule-notes').val();
        const is_active = $('#schedule-active').is(':checked') ? 1 : 0;

        // Validation
        if (!location || !day_of_week || !start_time || !end_time) {
            showToast('Mohon lengkapi semua field yang wajib diisi', 'error');
            return;
        }

        const data = {
            location,
            day_of_week: parseInt(day_of_week),
            start_time: start_time + ':00',
            end_time: end_time + ':00',
            notes,
            is_active
        };

        const url = scheduleId ? `${API_BASE}/${scheduleId}` : API_BASE;
        const method = scheduleId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) throw new Error('Failed to save schedule');

        $('#scheduleModal').modal('hide');
        showToast(scheduleId ? 'Jadwal berhasil diupdate' : 'Jadwal berhasil ditambahkan', 'success');
        loadSchedules();

    } catch (error) {
        console.error('Error saving schedule:', error);
        showToast('Gagal menyimpan jadwal', 'error');
    }
}

async function deleteSchedule(id) {
    if (!confirm('Yakin ingin menghapus jadwal ini?')) return;

    try {
        const token = localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token');
        
        const response = await fetch(`${API_BASE}/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to delete schedule');

        showToast('Jadwal berhasil dihapus', 'success');
        loadSchedules();

    } catch (error) {
        console.error('Error deleting schedule:', error);
        showToast('Gagal menghapus jadwal', 'error');
    }
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

// ==================== DISABLED DATES FUNCTIONS ====================

async function loadDisabledDates() {
    try {
        const token = localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token');

        const response = await fetch(`${API_BASE}/disabled-dates`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load disabled dates');

        const data = await response.json();
        disabledDates = data.data || [];

        renderDisabledDates(disabledDates);

    } catch (error) {
        console.error('Error loading disabled dates:', error);
    }
}

function renderDisabledDates(dates) {
    const tbody = $('#disabled-dates-tbody');
    tbody.empty();

    if (dates.length === 0) {
        tbody.html('<tr><td colspan="5" class="text-center text-muted">Tidak ada tanggal yang dinonaktifkan</td></tr>');
        return;
    }

    // Sort by date descending
    dates.sort((a, b) => new Date(b.disabled_date) - new Date(a.disabled_date));

    dates.forEach(item => {
        const dateObj = new Date(item.disabled_date);
        const dayName = dayNames[dateObj.getDay()];
        const formattedDate = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

        const locationText = item.location ? locationNames[item.location] : '<span class="text-danger font-weight-bold">Semua Lokasi</span>';

        const isPast = dateObj < new Date(new Date().setHours(0, 0, 0, 0));
        const rowClass = isPast ? 'text-muted' : '';

        tbody.append(`
            <tr class="${rowClass}">
                <td><strong>${dayName}</strong>, ${formattedDate}</td>
                <td>${locationText}</td>
                <td>${item.reason || '-'}</td>
                <td>${item.created_by}</td>
                <td>
                    <button class="btn btn-xs btn-success" onclick="deleteDisabledDate(${item.id})" title="Aktifkan Kembali">
                        <i class="fas fa-check"></i> Aktifkan
                    </button>
                </td>
            </tr>
        `);
    });
}

function showDisabledDateModal() {
    // Set default date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    $('#disabled-date').val(tomorrowStr);
    $('#disabled-location').val('');
    $('#disabled-reason').val('');
    $('#disabledDateModal').modal('show');
}

async function saveDisabledDate() {
    try {
        const token = localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token');
        const disabled_date = $('#disabled-date').val();
        const location = $('#disabled-location').val();
        const reason = $('#disabled-reason').val();

        if (!disabled_date) {
            showToast('Tanggal wajib diisi', 'error');
            return;
        }

        const response = await fetch(`${API_BASE}/disabled-dates`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                disabled_date,
                location: location || null,
                reason: reason || null
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Gagal menyimpan');
        }

        $('#disabledDateModal').modal('hide');
        showToast('Tanggal berhasil dinonaktifkan', 'success');
        loadDisabledDates();

    } catch (error) {
        console.error('Error saving disabled date:', error);
        showToast(error.message || 'Gagal menyimpan', 'error');
    }
}

async function deleteDisabledDate(id) {
    if (!confirm('Yakin ingin mengaktifkan kembali tanggal ini?')) return;

    try {
        const token = localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token');

        const response = await fetch(`${API_BASE}/disabled-dates/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to delete');

        showToast('Tanggal berhasil diaktifkan kembali', 'success');
        loadDisabledDates();

    } catch (error) {
        console.error('Error deleting disabled date:', error);
        showToast('Gagal menghapus', 'error');
    }
}

// Export functions for SPA usage
window.initKelolaJadwal = initKelolaJadwal;
window.showAddModal = showAddModal;
window.saveSchedule = saveSchedule;
window.editSchedule = editSchedule;
window.deleteSchedule = deleteSchedule;
window.logout = logout;
window.showDisabledDateModal = showDisabledDateModal;
window.saveDisabledDate = saveDisabledDate;
window.deleteDisabledDate = deleteDisabledDate;

})(); // End IIFE
