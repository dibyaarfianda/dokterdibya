// Kelola Booking Settings Module
// Manages booking session times for Sunday Clinic appointments

(function() {
    'use strict';

    const API_BASE = '/api/booking-settings';
    let settings = [];
    let bookings = [];
    let isLoading = false;

    // Get auth token
    function getToken() {
        return localStorage.getItem('vps_auth_token') || sessionStorage.getItem('vps_auth_token');
    }

    // Initialize module
    function initKelolaBookingSettings() {
        console.log('[Booking Settings] Initializing...');
        loadSettings();
        loadBookings();
        setupEventListeners();
    }

    // Setup event listeners
    function setupEventListeners() {
        // Add new session button
        const btnAdd = document.getElementById('btn-add-session');
        if (btnAdd) {
            btnAdd.addEventListener('click', () => openModal());
        }

        // Form submit
        const form = document.getElementById('session-form');
        if (form) {
            form.addEventListener('submit', handleFormSubmit);
        }

        // Close modal buttons
        document.querySelectorAll('[data-dismiss="modal"]').forEach(btn => {
            btn.addEventListener('click', closeModal);
        });
    }

    // Load all settings
    async function loadSettings() {
        if (isLoading) return;
        isLoading = true;

        const container = document.getElementById('booking-settings-container');
        if (container) {
            container.innerHTML = `
                <div class="col-12 text-center py-5">
                    <i class="fas fa-spinner fa-spin fa-2x"></i>
                    <p class="mt-2">Memuat pengaturan sesi...</p>
                </div>
            `;
        }

        try {
            const response = await fetch(API_BASE, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });

            if (!response.ok) throw new Error('Failed to fetch settings');

            const data = await response.json();
            settings = data.settings || [];
            renderSettings();
        } catch (error) {
            console.error('Error loading settings:', error);
            if (container) {
                container.innerHTML = `
                    <div class="col-12">
                        <div class="alert alert-danger">
                            <i class="fas fa-exclamation-triangle mr-2"></i>
                            Gagal memuat pengaturan. <button class="btn btn-sm btn-outline-danger ml-2" onclick="window.initKelolaBookingSettings()">Coba Lagi</button>
                        </div>
                    </div>
                `;
            }
        } finally {
            isLoading = false;
        }
    }

    // Render settings cards
    function renderSettings() {
        const container = document.getElementById('booking-settings-container');
        if (!container) return;

        if (settings.length === 0) {
            container.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-info">
                        <i class="fas fa-info-circle mr-2"></i>
                        Belum ada sesi booking. Klik "Tambah Sesi Baru" untuk membuat.
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = settings.map(s => `
            <div class="col-lg-4 col-md-6 mb-3">
                <div class="card ${s.is_active ? 'card-primary' : 'card-secondary'} card-outline h-100">
                    <div class="card-header">
                        <h3 class="card-title">
                            <i class="fas fa-clock mr-2"></i>Sesi ${s.session_number}
                        </h3>
                        <div class="card-tools">
                            ${s.is_active
                                ? '<span class="badge badge-success">Aktif</span>'
                                : '<span class="badge badge-secondary">Nonaktif</span>'}
                        </div>
                    </div>
                    <div class="card-body">
                        <h4 class="text-center mb-3">
                            <span class="text-primary">${s.start_time}</span> - <span class="text-primary">${s.end_time}</span>
                        </h4>
                        <p class="text-center text-muted mb-3">${s.session_name}</p>

                        <div class="row text-center">
                            <div class="col-6">
                                <div class="info-box bg-light mb-0">
                                    <div class="info-box-content p-2">
                                        <span class="info-box-text">Durasi Slot</span>
                                        <span class="info-box-number">${s.slot_duration} menit</span>
                                    </div>
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="info-box bg-light mb-0">
                                    <div class="info-box-content p-2">
                                        <span class="info-box-text">Max Slot</span>
                                        <span class="info-box-number">${s.max_slots}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="card-footer text-center">
                        <button class="btn btn-sm btn-info mr-1" onclick="window.editSession(${s.id})">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="btn btn-sm btn-${s.is_active ? 'warning' : 'success'}" onclick="window.toggleSessionActive(${s.id}, ${s.is_active ? 0 : 1})">
                            <i class="fas fa-${s.is_active ? 'pause' : 'play'}"></i> ${s.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="window.deleteSession(${s.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // Open modal for add/edit
    function openModal(session = null) {
        const modal = document.getElementById('session-modal');
        const title = document.getElementById('session-modal-title');
        const form = document.getElementById('session-form');

        if (!modal || !form) return;

        // Reset form
        form.reset();
        document.getElementById('session-id').value = '';

        if (session) {
            // Edit mode
            title.textContent = 'Edit Sesi';
            document.getElementById('session-id').value = session.id;
            document.getElementById('session-number').value = session.session_number;
            document.getElementById('session-number').disabled = true; // Can't change session number
            document.getElementById('session-name').value = session.session_name;
            document.getElementById('session-start-time').value = session.start_time;
            document.getElementById('session-end-time').value = session.end_time;
            document.getElementById('session-slot-duration').value = session.slot_duration;
            document.getElementById('session-max-slots').value = session.max_slots;
            document.getElementById('session-is-active').checked = session.is_active;
        } else {
            // Add mode
            title.textContent = 'Tambah Sesi Baru';
            document.getElementById('session-number').disabled = false;
            // Default values
            document.getElementById('session-slot-duration').value = '15';
            document.getElementById('session-max-slots').value = '10';
            document.getElementById('session-is-active').checked = true;

            // Suggest next session number
            const maxSession = settings.reduce((max, s) => Math.max(max, s.session_number), 0);
            document.getElementById('session-number').value = maxSession + 1;
        }

        // Show modal using Bootstrap 4
        $(modal).modal('show');
    }

    // Close modal
    function closeModal() {
        const modal = document.getElementById('session-modal');
        if (modal) {
            $(modal).modal('hide');
        }
    }

    // Handle form submit
    async function handleFormSubmit(e) {
        e.preventDefault();

        const id = document.getElementById('session-id').value;
        const data = {
            session_number: parseInt(document.getElementById('session-number').value),
            session_name: document.getElementById('session-name').value.trim(),
            start_time: document.getElementById('session-start-time').value,
            end_time: document.getElementById('session-end-time').value,
            slot_duration: parseInt(document.getElementById('session-slot-duration').value),
            max_slots: parseInt(document.getElementById('session-max-slots').value),
            is_active: document.getElementById('session-is-active').checked
        };

        // Validation
        if (!data.session_name || !data.start_time || !data.end_time) {
            showToast('Harap isi semua field yang wajib', 'error');
            return;
        }

        try {
            const url = id ? `${API_BASE}/${id}` : API_BASE;
            const method = id ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Gagal menyimpan');
            }

            showToast(result.message || 'Berhasil disimpan', 'success');
            closeModal();
            loadSettings();
        } catch (error) {
            console.error('Error saving session:', error);
            showToast(error.message || 'Gagal menyimpan pengaturan', 'error');
        }
    }

    // Edit session
    function editSession(id) {
        const session = settings.find(s => s.id === id);
        if (session) {
            openModal(session);
        }
    }

    // Toggle session active/inactive
    async function toggleSessionActive(id, newStatus) {
        const session = settings.find(s => s.id === id);
        if (!session) return;

        try {
            const response = await fetch(`${API_BASE}/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify({
                    ...session,
                    is_active: newStatus
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Gagal mengubah status');
            }

            showToast(`Sesi ${session.session_number} ${newStatus ? 'diaktifkan' : 'dinonaktifkan'}`, 'success');
            loadSettings();
        } catch (error) {
            console.error('Error toggling session:', error);
            showToast(error.message || 'Gagal mengubah status', 'error');
        }
    }

    // Delete session
    async function deleteSession(id) {
        const session = settings.find(s => s.id === id);
        if (!session) return;

        if (!confirm(`Apakah Anda yakin ingin menghapus Sesi ${session.session_number} (${session.session_name})?\n\nPerhatian: Sesi tidak dapat dihapus jika masih ada appointment aktif.`)) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Gagal menghapus');
            }

            showToast('Sesi berhasil dihapus', 'success');
            loadSettings();
        } catch (error) {
            console.error('Error deleting session:', error);
            showToast(error.message || 'Gagal menghapus sesi', 'error');
        }
    }

    // Toast notification
    function showToast(message, type = 'info') {
        if (typeof toastr !== 'undefined') {
            toastr[type](message);
        } else {
            alert(message);
        }
    }

    // ==================== BOOKINGS MANAGEMENT ====================

    // Load all bookings
    async function loadBookings() {
        const container = document.getElementById('bookings-container');
        if (!container) return;

        container.innerHTML = `
            <div class="text-center py-4">
                <i class="fas fa-spinner fa-spin fa-2x"></i>
                <p class="mt-2">Memuat data booking...</p>
            </div>
        `;

        try {
            const response = await fetch(`${API_BASE}/bookings`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });

            if (!response.ok) throw new Error('Failed to fetch bookings');

            const data = await response.json();
            bookings = data.bookings || [];
            renderBookings();
        } catch (error) {
            console.error('Error loading bookings:', error);
            container.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle mr-2"></i>
                    Gagal memuat data booking. <button class="btn btn-sm btn-outline-danger ml-2" onclick="window.loadBookings()">Coba Lagi</button>
                </div>
            `;
        }
    }

    // Render bookings table
    function renderBookings() {
        const container = document.getElementById('bookings-container');
        if (!container) return;

        // Filter only active bookings (not cancelled, not completed)
        const activeBookings = bookings.filter(b => !['cancelled', 'completed', 'no_show'].includes(b.status));

        if (activeBookings.length === 0) {
            container.innerHTML = `
                <div class="alert alert-info mb-0">
                    <i class="fas fa-info-circle mr-2"></i>
                    Tidak ada booking aktif yang akan datang.
                </div>
            `;
            return;
        }

        const statusBadge = (status) => {
            const badges = {
                'pending': '<span class="badge badge-warning">Menunggu</span>',
                'confirmed': '<span class="badge badge-primary">Dikonfirmasi</span>',
                'arrived': '<span class="badge badge-info">Hadir</span>',
                'in_progress': '<span class="badge badge-success">Sedang Diperiksa</span>'
            };
            return badges[status] || `<span class="badge badge-secondary">${status}</span>`;
        };

        const tableHtml = `
            <div class="table-responsive">
                <table class="table table-bordered table-striped table-sm">
                    <thead class="thead-dark">
                        <tr>
                            <th>Tanggal</th>
                            <th>Waktu</th>
                            <th>Pasien</th>
                            <th>Telepon</th>
                            <th>Keluhan</th>
                            <th>Status</th>
                            <th width="100">Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${activeBookings.map(b => {
                            const date = new Date(b.appointment_date);
                            const formattedDate = date.toLocaleDateString('id-ID', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'short'
                            });
                            return `
                                <tr>
                                    <td>${formattedDate}</td>
                                    <td><strong>${b.slot_time}</strong><br><small class="text-muted">${b.session_label}</small></td>
                                    <td>${b.patient_name}</td>
                                    <td><a href="tel:${b.patient_phone}">${b.patient_phone}</a></td>
                                    <td><small>${b.chief_complaint?.substring(0, 50)}${b.chief_complaint?.length > 50 ? '...' : ''}</small></td>
                                    <td>${statusBadge(b.status)}</td>
                                    <td class="text-center">
                                        <button class="btn btn-xs btn-danger" onclick="window.openCancelModal(${b.id})" title="Batalkan">
                                            <i class="fas fa-times"></i> Batalkan
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = tableHtml;
    }

    // Open cancel modal
    function openCancelModal(bookingId) {
        const booking = bookings.find(b => b.id === bookingId);
        if (!booking) return;

        const date = new Date(booking.appointment_date);
        const formattedDate = date.toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        // Create modal if not exists
        let modal = document.getElementById('cancel-booking-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'cancel-booking-modal';
            modal.className = 'modal fade';
            modal.tabIndex = -1;
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-danger text-white">
                        <h5 class="modal-title"><i class="fas fa-exclamation-triangle mr-2"></i>Batalkan Booking</h5>
                        <button type="button" class="close text-white" data-dismiss="modal">
                            <span>&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-warning">
                            <strong>Perhatian!</strong> Anda akan membatalkan booking berikut:
                        </div>
                        <table class="table table-sm table-bordered mb-3">
                            <tr><td width="120"><strong>Pasien</strong></td><td>${booking.patient_name}</td></tr>
                            <tr><td><strong>Telepon</strong></td><td>${booking.patient_phone}</td></tr>
                            <tr><td><strong>Tanggal</strong></td><td>${formattedDate}</td></tr>
                            <tr><td><strong>Waktu</strong></td><td>${booking.slot_time} (${booking.session_label})</td></tr>
                        </table>
                        <div class="form-group">
                            <label for="cancel-reason"><strong>Alasan Pembatalan <span class="text-danger">*</span></strong></label>
                            <textarea class="form-control" id="cancel-reason" rows="3" placeholder="Contoh: Jadwal dokter berubah, Libur mendadak, dll..." required></textarea>
                        </div>
                        <div class="form-group">
                            <div class="custom-control custom-checkbox">
                                <input type="checkbox" class="custom-control-input" id="notify-patient" checked>
                                <label class="custom-control-label" for="notify-patient">
                                    <i class="fab fa-whatsapp text-success mr-1"></i>
                                    Kirim notifikasi ke pasien (WhatsApp/Email)
                                </label>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">Batal</button>
                        <button type="button" class="btn btn-danger" onclick="window.forceCancelBooking(${booking.id})">
                            <i class="fas fa-times"></i> Ya, Batalkan Booking
                        </button>
                    </div>
                </div>
            </div>
        `;

        $(modal).modal('show');
    }

    // Force cancel booking
    async function forceCancelBooking(bookingId) {
        const reason = document.getElementById('cancel-reason')?.value?.trim();
        const notifyPatient = document.getElementById('notify-patient')?.checked;

        if (!reason) {
            showToast('Harap isi alasan pembatalan', 'error');
            return;
        }

        if (reason.length < 10) {
            showToast('Alasan pembatalan minimal 10 karakter', 'error');
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/force-cancel/${bookingId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify({
                    reason: reason,
                    notify_patient: notifyPatient
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Gagal membatalkan booking');
            }

            // Close modal
            $('#cancel-booking-modal').modal('hide');

            showToast(result.message, 'success');
            loadBookings();
        } catch (error) {
            console.error('Error cancelling booking:', error);
            showToast(error.message || 'Gagal membatalkan booking', 'error');
        }
    }

    // Export functions to window
    window.initKelolaBookingSettings = initKelolaBookingSettings;
    window.editSession = editSession;
    window.toggleSessionActive = toggleSessionActive;
    window.deleteSession = deleteSession;
    window.loadBookings = loadBookings;
    window.openCancelModal = openCancelModal;
    window.forceCancelBooking = forceCancelBooking;

})();
