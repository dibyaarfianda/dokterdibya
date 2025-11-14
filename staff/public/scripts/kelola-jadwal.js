// Kelola Jadwal Praktik Script
const API_BASE = '/api/practice-schedules';
let schedulesTable;
let allSchedules = [];

const locationNames = {
    'klinik_privat': 'Klinik Privat Minggu',
    'rsud_gambiran': 'RSUD Gambiran Kediri',
    'rsia_melinda': 'RSIA Melinda Kediri',
    'rs_bhayangkara': 'RS Bhayangkara Kediri'
};

const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

$(document).ready(function() {
    // Check authentication
    const token = localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Clear tbody before initializing DataTable
    $('#schedules-tbody').html('');

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
});

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
