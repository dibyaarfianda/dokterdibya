const API_BASE = '/api/birth-classes';

let isInitialized = false;
let editingSessionId = null;

function getToken() {
    if (typeof getAuthToken === 'function') {
        return getAuthToken();
    }

    return localStorage.getItem('vps_auth_token') ||
        sessionStorage.getItem('vps_auth_token') ||
        localStorage.getItem('token') ||
        localStorage.getItem('auth_token') ||
        '';
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    return date.toLocaleDateString('id-ID', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function normalizeTime(value) {
    if (!value) return '-';
    return String(value).slice(0, 5);
}

function formatRupiah(value) {
    const amount = Number(value || 0);
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(amount);
}

function truncateText(value, maxLength = 70) {
    const text = String(value || '').trim();
    if (!text) return '-';
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}...`;
}

function populateSessionFilterOptions(sessions = []) {
    const select = document.getElementById('birth-class-registration-session-filter');
    if (!select) return;

    const current = select.value;
    const options = sessions.map(session => `
        <option value="${session.id}">${escapeHtml(session.class_title)} (${formatDate(session.session_date)})</option>
    `).join('');

    select.innerHTML = `<option value="">Semua Sesi</option>${options}`;
    select.value = current || '';
}

function getStatusBadge(status) {
    const statusMap = {
        registered: 'badge badge-warning',
        confirmed: 'badge badge-primary',
        attended: 'badge badge-success',
        cancelled: 'badge badge-secondary'
    };

    const labelMap = {
        registered: 'Terdaftar',
        confirmed: 'Dikonfirmasi',
        attended: 'Hadir',
        cancelled: 'Batal'
    };

    const cssClass = statusMap[status] || 'badge badge-light';
    const label = labelMap[status] || status;
    return `<span class="${cssClass}">${label}</span>`;
}

function getPaymentStatusBadge(status) {
    const statusMap = {
        pending: 'badge badge-warning',
        paid: 'badge badge-success',
        waived: 'badge badge-secondary'
    };

    const labelMap = {
        pending: 'Menunggu Bayar',
        paid: 'Lunas',
        waived: 'Gratis'
    };

    const cssClass = statusMap[status] || 'badge badge-light';
    const label = labelMap[status] || status || '-';
    return `<span class="${cssClass}">${label}</span>`;
}

async function apiRequest(path, options = {}) {
    const token = getToken();
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...(options.headers || {})
        }
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(result.message || 'Request gagal');
    }

    return result;
}

function renderSkeleton() {
    const root = document.getElementById('birth-class-root');
    if (!root) return;

    root.innerHTML = `
        <div class="row">
            <div class="col-12">
                <div class="card card-info card-outline">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h3 class="card-title mb-0">
                            <i class="fas fa-list mr-2"></i>Daftar Sesi Kelas Dr. Dibya
                        </h3>
                        <div class="d-flex" style="gap: 8px;">
                            <button class="btn btn-sm btn-primary" id="birth-class-open-session-modal-btn">
                                <i class="fas fa-plus mr-1"></i>Tambah Sesi
                            </button>
                            <button class="btn btn-sm btn-outline-primary" id="birth-class-refresh-btn">
                                <i class="fas fa-sync-alt mr-1"></i>Refresh
                            </button>
                        </div>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-sm table-striped mb-0">
                                <thead>
                                    <tr>
                                        <th>Tanggal & Jam</th>
                                        <th>Judul</th>
                                        <th>Materi / Benefit</th>
                                        <th>Lokasi</th>
                                        <th>Biaya</th>
                                        <th>Kuota</th>
                                        <th>Status</th>
                                        <th class="text-right" style="width: 150px; min-width: 150px;">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody id="birth-class-sessions-tbody">
                                    <tr><td colspan="8" class="text-center py-4">Memuat data...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="card card-success card-outline">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h3 class="card-title mb-0">
                            <i class="fas fa-users mr-2"></i>Daftar Peserta
                        </h3>
                        <div class="d-flex" style="gap: 8px;">
                            <select id="birth-class-registration-filter" class="form-control form-control-sm" style="width: 150px; font-size: 12px;">
                                <option value="">Semua Status</option>
                                <option value="registered">Terdaftar</option>
                                <option value="confirmed">Dikonfirmasi</option>
                                <option value="attended">Hadir</option>
                                <option value="cancelled">Batal</option>
                            </select>
                            <select id="birth-class-registration-session-filter" class="form-control form-control-sm" style="width: 180px; font-size: 12px;">
                                <option value="">Semua Sesi</option>
                            </select>
                        </div>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-sm table-hover mb-0">
                                <thead>
                                    <tr>
                                        <th>Peserta</th>
                                        <th>Sesi</th>
                                        <th>Catatan</th>
                                        <th>Pembayaran</th>
                                        <th>Status</th>
                                        <th>Ubah Status</th>
                                        <th class="text-right" style="width: 120px; min-width: 120px;">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody id="birth-class-registrations-tbody">
                                    <tr><td colspan="7" class="text-center py-4">Memuat data...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="modal fade" id="birth-class-session-modal" tabindex="-1" role="dialog" aria-labelledby="birth-class-session-form-title" aria-hidden="true">
            <div class="modal-dialog modal-lg" role="document">
                <form id="birth-class-session-form" class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="birth-class-session-form-title">
                            <i class="fas fa-calendar-plus mr-2"></i>Tambah Sesi Kelas
                        </h5>
                        <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                            <span aria-hidden="true">&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="birth-class-title">Judul Kelas</label>
                            <input type="text" class="form-control" id="birth-class-title" required>
                        </div>
                        <div class="form-row">
                            <div class="form-group col-md-6">
                                <label for="birth-class-date">Tanggal</label>
                                <input type="date" class="form-control" id="birth-class-date" required>
                            </div>
                            <div class="form-group col-md-6">
                                <label for="birth-class-quota">Kuota</label>
                                <input type="number" class="form-control" id="birth-class-quota" min="1" max="200" value="20" required>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group col-md-6">
                                <label for="birth-class-start-time">Jam Mulai</label>
                                <input type="time" class="form-control" id="birth-class-start-time" required>
                            </div>
                            <div class="form-group col-md-6">
                                <label for="birth-class-end-time">Jam Selesai</label>
                                <input type="time" class="form-control" id="birth-class-end-time">
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="birth-class-location">Lokasi</label>
                            <input type="text" class="form-control" id="birth-class-location" placeholder="Contoh: Klinik Private Lt.2" required>
                        </div>
                        <div class="form-group">
                            <label for="birth-class-instructor">Instruktur</label>
                            <input type="text" class="form-control" id="birth-class-instructor" placeholder="Nama dokter/bidan">
                        </div>
                        <div class="form-group">
                            <label for="birth-class-price">Biaya Kelas (Rp)</label>
                            <input type="number" class="form-control" id="birth-class-price" min="0" step="5000" value="0" required>
                        </div>
                        <div class="form-group">
                            <label for="birth-class-learning-points">Materi yang Dipelajari</label>
                            <textarea class="form-control" id="birth-class-learning-points" rows="3" placeholder="Contoh: Tanda persalinan, teknik napas, manajemen nyeri"></textarea>
                            <small class="text-muted">Pisahkan poin dengan baris baru.</small>
                        </div>
                        <div class="form-group">
                            <label for="birth-class-items-to-bring">Yang Harus Dibawa</label>
                            <textarea class="form-control" id="birth-class-items-to-bring" rows="2" placeholder="Contoh: Buku KIA, hasil lab terakhir, kartu identitas"></textarea>
                        </div>
                        <div class="form-group">
                            <label for="birth-class-benefits">Benefit Peserta</label>
                            <textarea class="form-control" id="birth-class-benefits" rows="2" placeholder="Contoh: Modul kelas, konsultasi singkat, snack"></textarea>
                        </div>
                        <div class="form-group">
                            <label for="birth-class-notes">Catatan</label>
                            <textarea class="form-control" id="birth-class-notes" rows="2" placeholder="Informasi tambahan kelas"></textarea>
                        </div>
                        <div class="form-group mb-0">
                            <div class="custom-control custom-switch">
                                <input type="checkbox" class="custom-control-input" id="birth-class-is-active" checked>
                                <label class="custom-control-label" for="birth-class-is-active">Sesi Aktif</label>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer justify-content-between">
                        <button type="button" class="btn btn-secondary" id="birth-class-reset-session-btn">
                            <i class="fas fa-undo mr-1"></i>Reset
                        </button>
                        <button type="submit" class="btn btn-primary" id="birth-class-save-session-btn">
                            <i class="fas fa-save mr-1"></i>Simpan Sesi
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function showSessionModal() {
    const modal = document.getElementById('birth-class-session-modal');
    if (!modal) return;

    if (window.jQuery) {
        window.jQuery(modal).modal('show');
        return;
    }

    modal.classList.add('show');
    modal.style.display = 'block';
    modal.removeAttribute('aria-hidden');
}

function hideSessionModal() {
    const modal = document.getElementById('birth-class-session-modal');
    if (!modal) return;

    if (window.jQuery) {
        window.jQuery(modal).modal('hide');
        return;
    }

    modal.classList.remove('show');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
}

function openNewSessionModal() {
    resetSessionForm();
    showSessionModal();
}

function resetSessionForm() {
    editingSessionId = null;

    const title = document.getElementById('birth-class-session-form-title');
    const saveBtn = document.getElementById('birth-class-save-session-btn');

    const ids = [
        'birth-class-title',
        'birth-class-date',
        'birth-class-start-time',
        'birth-class-end-time',
        'birth-class-location',
        'birth-class-instructor',
        'birth-class-learning-points',
        'birth-class-items-to-bring',
        'birth-class-benefits',
        'birth-class-notes'
    ];

    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const quota = document.getElementById('birth-class-quota');
    if (quota) quota.value = '20';

    const price = document.getElementById('birth-class-price');
    if (price) price.value = '0';

    const active = document.getElementById('birth-class-is-active');
    if (active) active.checked = true;

    if (title) title.innerHTML = '<i class="fas fa-calendar-plus mr-2"></i>Tambah Sesi Kelas';
    if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save mr-1"></i>Simpan Sesi';
}

function fillSessionForm(session) {
    editingSessionId = session.id;

    const title = document.getElementById('birth-class-session-form-title');
    const saveBtn = document.getElementById('birth-class-save-session-btn');

    document.getElementById('birth-class-title').value = session.class_title || '';
    document.getElementById('birth-class-date').value = String(session.session_date || '').slice(0, 10);
    document.getElementById('birth-class-start-time').value = normalizeTime(session.start_time);
    document.getElementById('birth-class-end-time').value = session.end_time ? normalizeTime(session.end_time) : '';
    document.getElementById('birth-class-location').value = session.location || '';
    document.getElementById('birth-class-instructor').value = session.instructor_name || '';
    document.getElementById('birth-class-quota').value = session.quota || 20;
    document.getElementById('birth-class-price').value = Number(session.price || 0);
    document.getElementById('birth-class-learning-points').value = session.learning_points || '';
    document.getElementById('birth-class-items-to-bring').value = session.items_to_bring || '';
    document.getElementById('birth-class-benefits').value = session.benefits || '';
    document.getElementById('birth-class-notes').value = session.notes || '';
    document.getElementById('birth-class-is-active').checked = Number(session.is_active) === 1;

    if (title) title.innerHTML = '<i class="fas fa-edit mr-2"></i>Edit Sesi Kelas';
    if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save mr-1"></i>Update Sesi';
    showSessionModal();
}

async function loadSessions() {
    const tbody = document.getElementById('birth-class-sessions-tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4"><i class="fas fa-spinner fa-spin mr-2"></i>Memuat sesi...</td></tr>';

    try {
        const result = await apiRequest('/sessions');
        const sessions = result.data || [];

        if (!sessions.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">Belum ada sesi kelas.</td></tr>';
            populateSessionFilterOptions([]);
            return;
        }

        tbody.innerHTML = sessions.map(session => {
            const activeBadge = Number(session.is_active) === 1
                ? '<span class="badge badge-success">Aktif</span>'
                : '<span class="badge badge-secondary">Nonaktif</span>';

            const contentPreview = [
                session.learning_points ? `Materi: ${escapeHtml(truncateText(session.learning_points, 52))}` : '',
                session.benefits ? `Benefit: ${escapeHtml(truncateText(session.benefits, 52))}` : ''
            ].filter(Boolean).join('<br>') || '-';

            return `
                <tr>
                    <td>
                        <strong>${formatDate(session.session_date)}</strong><br>
                        <small class="text-muted">${normalizeTime(session.start_time)}${session.end_time ? ` - ${normalizeTime(session.end_time)}` : ''}</small>
                    </td>
                    <td>
                        <div>${escapeHtml(session.class_title)}</div>
                        <small class="text-muted">${escapeHtml(session.instructor_name || '-')}</small>
                    </td>
                    <td><small>${contentPreview}</small></td>
                    <td>${escapeHtml(session.location || '-')}</td>
                    <td><strong>${formatRupiah(session.price)}</strong></td>
                    <td>
                        <strong>${session.registered_count}/${session.quota}</strong><br>
                        <small class="text-muted">Sisa ${session.available_slots}</small>
                    </td>
                    <td>${activeBadge}</td>
                    <td class="text-right text-nowrap" style="min-width: 150px;">
                        <button class="btn btn-xs btn-info" data-action="edit-session" data-id="${session.id}">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-xs ${Number(session.is_active) === 1 ? 'btn-warning' : 'btn-success'}" data-action="toggle-session" data-id="${session.id}" data-active="${Number(session.is_active) === 1 ? 0 : 1}">
                            <i class="fas ${Number(session.is_active) === 1 ? 'fa-toggle-off' : 'fa-toggle-on'}"></i>
                        </button>
                        <button class="btn btn-xs btn-danger" data-action="delete-session" data-id="${session.id}" title="Hapus sesi kelas">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        window.__birthClassSessionsCache = sessions;
        populateSessionFilterOptions(sessions);
    } catch (error) {
        console.error('Error loading Kelas Dr. Dibya sessions:', error);
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">${escapeHtml(error.message)}</td></tr>`;
    }
}

async function loadRegistrations() {
    const tbody = document.getElementById('birth-class-registrations-tbody');
    const filterEl = document.getElementById('birth-class-registration-filter');
    const sessionFilterEl = document.getElementById('birth-class-registration-session-filter');
    if (!tbody) return;

    const status = filterEl?.value || '';
    const sessionId = sessionFilterEl?.value || '';
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (sessionId) params.set('session_id', sessionId);
    const query = params.toString() ? `?${params.toString()}` : '';

    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4"><i class="fas fa-spinner fa-spin mr-2"></i>Memuat pendaftar...</td></tr>';

    try {
        const result = await apiRequest(`/registrations${query}`);
        const registrations = result.data || [];

        if (!registrations.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Belum ada pendaftar.</td></tr>';
            return;
        }

        tbody.innerHTML = registrations.map(row => `
            <tr>
                <td>
                    <strong>${escapeHtml(row.patient_name)}</strong><br>
                    <small class="text-muted">${escapeHtml(row.phone || '-')} ${row.email ? `| ${escapeHtml(row.email)}` : ''}</small><br>
                    <small class="text-muted">Sumber: ${escapeHtml(row.created_by || '-')}</small>
                </td>
                <td>
                    <div>${escapeHtml(row.class_title)}</div>
                    <small class="text-muted">${formatDate(row.session_date)} ${normalizeTime(row.start_time)}</small>
                </td>
                <td>
                    <small>${escapeHtml(row.notes || '-')}</small>
                </td>
                <td>
                    <strong>${formatRupiah(row.payment_amount || 0)}</strong><br>
                    ${getPaymentStatusBadge(row.payment_status || 'pending')}<br>
                    <div class="input-group input-group-sm mt-1">
                        <select class="form-control" id="registration-payment-status-${row.id}">
                            <option value="pending" ${(row.payment_status || 'pending') === 'pending' ? 'selected' : ''}>Menunggu</option>
                            <option value="paid" ${row.payment_status === 'paid' ? 'selected' : ''}>Lunas</option>
                            <option value="waived" ${row.payment_status === 'waived' ? 'selected' : ''}>Gratis</option>
                        </select>
                        <div class="input-group-append">
                            <button class="btn btn-success" data-action="save-payment-status" data-id="${row.id}" title="Simpan status pembayaran">
                                <i class="fas fa-money-check-alt"></i>
                            </button>
                        </div>
                    </div>
                </td>
                <td>${getStatusBadge(row.status)}</td>
                <td>
                    <div class="input-group input-group-sm">
                        <select class="form-control" id="registration-status-${row.id}">
                            <option value="registered" ${row.status === 'registered' ? 'selected' : ''}>Terdaftar</option>
                            <option value="confirmed" ${row.status === 'confirmed' ? 'selected' : ''}>Dikonfirmasi</option>
                            <option value="attended" ${row.status === 'attended' ? 'selected' : ''}>Hadir</option>
                            <option value="cancelled" ${row.status === 'cancelled' ? 'selected' : ''}>Batal</option>
                        </select>
                        <div class="input-group-append">
                            <button class="btn btn-primary" data-action="save-registration-status" data-id="${row.id}">
                                <i class="fas fa-save"></i>
                            </button>
                        </div>
                    </div>
                </td>
                <td class="text-right text-nowrap" style="min-width: 120px;">
                    <button class="btn btn-sm btn-danger" data-action="delete-registration" data-id="${row.id}" title="Hapus peserta">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading Kelas Dr. Dibya registrations:', error);
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">${escapeHtml(error.message)}</td></tr>`;
    }
}

async function saveSession(event) {
    event.preventDefault();

    const payload = {
        class_title: document.getElementById('birth-class-title')?.value?.trim(),
        session_date: document.getElementById('birth-class-date')?.value,
        start_time: document.getElementById('birth-class-start-time')?.value,
        end_time: document.getElementById('birth-class-end-time')?.value || null,
        location: document.getElementById('birth-class-location')?.value?.trim(),
        instructor_name: document.getElementById('birth-class-instructor')?.value?.trim() || null,
        quota: Number(document.getElementById('birth-class-quota')?.value || 0),
        price: Number(document.getElementById('birth-class-price')?.value || 0),
        learning_points: document.getElementById('birth-class-learning-points')?.value?.trim() || null,
        items_to_bring: document.getElementById('birth-class-items-to-bring')?.value?.trim() || null,
        benefits: document.getElementById('birth-class-benefits')?.value?.trim() || null,
        notes: document.getElementById('birth-class-notes')?.value?.trim() || null,
        is_active: document.getElementById('birth-class-is-active')?.checked ? 1 : 0
    };

    if (!payload.class_title || !payload.session_date || !payload.start_time || !payload.location || !payload.quota) {
        alert('Lengkapi data sesi terlebih dahulu.');
        return;
    }

    try {
        if (editingSessionId) {
            await apiRequest(`/sessions/${editingSessionId}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            alert('Sesi kelas berhasil diperbarui.');
        } else {
            await apiRequest('/sessions', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            alert('Sesi kelas berhasil ditambahkan.');
        }

        resetSessionForm();
        hideSessionModal();
        await Promise.all([loadSessions(), loadRegistrations()]);
    } catch (error) {
        console.error('Error saving Kelas Dr. Dibya session:', error);
        alert(error.message);
    }
}

async function updateSessionStatus(sessionId, isActive) {
    try {
        await apiRequest(`/sessions/${sessionId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ is_active: isActive ? 1 : 0 })
        });

        await Promise.all([loadSessions(), loadRegistrations()]);
    } catch (error) {
        console.error('Error toggling session status:', error);
        alert(error.message);
    }
}

async function updateRegistrationStatus(registrationId) {
    const statusEl = document.getElementById(`registration-status-${registrationId}`);
    if (!statusEl) return;

    try {
        await apiRequest(`/registrations/${registrationId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({
                status: statusEl.value,
                admin_notes: ''
            })
        });

        await loadRegistrations();
    } catch (error) {
        console.error('Error updating registration status:', error);
        alert(error.message);
    }
}

async function updatePaymentStatus(registrationId) {
    const statusEl = document.getElementById(`registration-payment-status-${registrationId}`);
    if (!statusEl) return;

    try {
        await apiRequest(`/registrations/${registrationId}/payment-status`, {
            method: 'PATCH',
            body: JSON.stringify({
                payment_status: statusEl.value,
                payment_method: statusEl.value === 'waived' ? null : 'qris_static'
            })
        });

        await loadRegistrations();
    } catch (error) {
        console.error('Error updating payment status:', error);
        alert(error.message);
    }
}

async function deleteSession(sessionId) {
    if (!sessionId) return;
    if (!confirm('Hapus sesi kelas ini? Jika masih ada peserta, sesi tidak bisa dihapus.')) return;

    try {
        await apiRequest(`/sessions/${sessionId}`, {
            method: 'DELETE'
        });

        if (editingSessionId === sessionId) {
            resetSessionForm();
        }
        await Promise.all([loadSessions(), loadRegistrations()]);
        alert('Sesi kelas berhasil dihapus.');
    } catch (error) {
        console.error('Error deleting Kelas Dr. Dibya session:', error);
        alert(error.message);
    }
}

async function deleteRegistration(registrationId) {
    if (!registrationId) return;
    if (!confirm('Hapus peserta ini dari daftar kelas?')) return;

    try {
        await apiRequest(`/registrations/${registrationId}`, {
            method: 'DELETE'
        });

        await Promise.all([loadSessions(), loadRegistrations()]);
        alert('Peserta berhasil dihapus.');
    } catch (error) {
        console.error('Error deleting Kelas Dr. Dibya registration:', error);
        alert(error.message);
    }
}

function handleRootClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const action = button.getAttribute('data-action');
    const id = Number(button.getAttribute('data-id'));

    if (action === 'edit-session') {
        const sessions = window.__birthClassSessionsCache || [];
        const session = sessions.find(item => Number(item.id) === id);
        if (session) fillSessionForm(session);
        return;
    }

    if (action === 'toggle-session') {
        const nextActive = Number(button.getAttribute('data-active')) === 1;
        updateSessionStatus(id, nextActive);
        return;
    }

    if (action === 'delete-session') {
        deleteSession(id);
        return;
    }

    if (action === 'save-registration-status') {
        updateRegistrationStatus(id);
        return;
    }

    if (action === 'save-payment-status') {
        updatePaymentStatus(id);
        return;
    }

    if (action === 'delete-registration') {
        deleteRegistration(id);
    }
}

function bindEvents() {
    document.getElementById('birth-class-session-form')?.addEventListener('submit', saveSession);
    document.getElementById('birth-class-reset-session-btn')?.addEventListener('click', resetSessionForm);
    document.getElementById('birth-class-open-session-modal-btn')?.addEventListener('click', openNewSessionModal);
    document.getElementById('birth-class-refresh-btn')?.addEventListener('click', () => {
        Promise.all([loadSessions(), loadRegistrations()]);
    });
    document.getElementById('birth-class-registration-filter')?.addEventListener('change', loadRegistrations);
    document.getElementById('birth-class-registration-session-filter')?.addEventListener('change', loadRegistrations);
    document.getElementById('birth-class-root')?.addEventListener('click', handleRootClick);

    const modal = document.getElementById('birth-class-session-modal');
    if (modal && window.jQuery) {
        window.jQuery(modal).on('hidden.bs.modal', () => {
            resetSessionForm();
        });
    }
}

async function loadInitialData() {
    await Promise.all([loadSessions(), loadRegistrations()]);
}

function initKelasPersalinan() {
    if (!isInitialized) {
        renderSkeleton();
        bindEvents();
        isInitialized = true;
    }

    resetSessionForm();
    loadInitialData();
}

window.initKelasPersalinan = initKelasPersalinan;

export { initKelasPersalinan };
