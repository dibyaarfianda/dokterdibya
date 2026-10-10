const API_ROOT = '/api/access-control';

const state = {
    catalog: [],
    templates: [],
    users: [],
    selected: null,
    initialized: false
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function request(path, options = {}) {
    const token = typeof window.getAuthToken === 'function' ? window.getAuthToken() : '';
    const response = await fetch(`${API_ROOT}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(payload.message || 'Permintaan gagal.');
        error.code = payload.code;
        error.status = response.status;
        throw error;
    }
    return payload.data;
}

function notify(icon, title, text) {
    if (window.Swal) return window.Swal.fire({ icon, title, text });
    window.alert(text || title);
}

function statusLabel(user) {
    if (user.status === 'pending') return ['Menunggu aktivasi', 'badge-warning'];
    if (user.is_active) return ['Aktif', 'badge-success'];
    return ['Nonaktif', 'badge-secondary'];
}

function renderAccounts() {
    const list = document.getElementById('access-account-list');
    if (!list) return;
    const needle = document.getElementById('access-account-search')?.value.trim().toLowerCase() || '';
    const filtered = state.users.filter(user => (
        `${user.name} ${user.email} ${user.job_label}`.toLowerCase().includes(needle)
    ));
    if (!filtered.length) {
        list.innerHTML = '<div class="text-center text-muted p-4">Tidak ada akun yang cocok.</div>';
        return;
    }
    list.innerHTML = filtered.map(user => {
        const [label, badge] = statusLabel(user);
        const active = state.selected?.id === user.id ? ' active' : '';
        return `<button type="button" class="list-group-item list-group-item-action${active}" data-access-user="${escapeHtml(user.id)}">
            <div class="d-flex justify-content-between align-items-start">
                <strong>${escapeHtml(user.name || user.email)}</strong>
                <span class="badge ${badge}">${label}</span>
            </div>
            <div class="small ${active ? 'text-white' : 'text-muted'}">${escapeHtml(user.job_label)} · ${escapeHtml(user.email)}</div>
            <div class="small mt-1">${user.is_doctor_protected ? 'Akses penuh terlindungi' : `${user.permission_count} izin`}</div>
        </button>`;
    }).join('');
    list.querySelectorAll('[data-access-user]').forEach(button => {
        button.addEventListener('click', () => selectUser(button.dataset.accessUser));
    });
}

function permissionBucket(action) {
    if (action === 'view') return 'view';
    if (action === 'delete' || action === 'bulk_delete') return 'delete';
    if (action === 'write') return 'write';
    return 'special';
}

function moduleLabel(permission) {
    const prefix = permission.name.split('.')[0];
    const view = state.catalog.find(item => item.name === `${prefix}.view`);
    const source = view || permission;
    return source.display_name
        .replace(/^(Baca|Lihat|Kelola|Buat dan edit|Gunakan)\s+/i, '')
        .replace(/\s+/g, ' ');
}

function checkbox(permission) {
    const mandatory = permission.mandatory_for_staff === true;
    const checked = mandatory || state.selected.permissions.includes(permission.name) ? ' checked' : '';
    const disabled = mandatory ? ' disabled' : '';
    const mandatoryLabel = mandatory
        ? ' <span class="badge badge-info ml-1">Wajib untuk semua staff</span>'
        : '';
    return `<label class="d-block small font-weight-normal mb-1" title="${escapeHtml(permission.description)}">
        <input type="checkbox" data-permission="${escapeHtml(permission.name)}"${checked}${disabled}> ${escapeHtml(permission.display_name)}${mandatoryLabel}
    </label>`;
}

function renderMatrix() {
    const body = document.getElementById('access-permission-matrix-body');
    if (!body || !state.selected) return;
    const groups = new Map();
    for (const permission of state.catalog) {
        const prefix = permission.name.split('.')[0];
        const key = `${permission.category}::${prefix}`;
        if (!groups.has(key)) {
            groups.set(key, { category: permission.category, label: moduleLabel(permission), cells: { view: [], write: [], delete: [], special: [] } });
        }
        groups.get(key).cells[permissionBucket(permission.action)].push(permission);
    }
    let previousCategory = '';
    body.innerHTML = [...groups.values()].map(group => {
        const categoryRow = group.category !== previousCategory
            ? `<tr class="bg-light"><th colspan="5">${escapeHtml(group.category)}</th></tr>`
            : '';
        previousCategory = group.category;
        const cell = name => group.cells[name].map(checkbox).join('') || '<span class="text-muted">—</span>';
        return `${categoryRow}<tr>
            <th class="align-middle">${escapeHtml(group.label)}</th>
            <td class="align-middle">${cell('view')}</td>
            <td class="align-middle">${cell('write')}</td>
            <td class="align-middle">${cell('delete')}</td>
            <td class="align-middle">${cell('special')}</td>
        </tr>`;
    }).join('');
}

function renderAuditHistory() {
    const body = document.getElementById('access-audit-history');
    if (!body || !state.selected) return;
    const labels = {
        permissions_updated: 'Izin diperbarui',
        account_activated: 'Akun diaktifkan',
        account_deactivated: 'Akun dinonaktifkan',
        account_invited: 'Akun dibuat dan diundang',
        invitation_resent: 'Undangan dikirim ulang',
        invitation_accepted: 'Undangan diterima'
    };
    const audits = state.selected.audits || [];
    body.innerHTML = audits.length ? audits.map(item => `<tr>
        <td class="text-nowrap">${escapeHtml(new Date(item.created_at).toLocaleString('id-ID'))}</td>
        <td>${escapeHtml(labels[item.action] || item.action)}</td>
        <td>${escapeHtml(item.actor_name || item.actor_user_id)}</td>
        <td>${escapeHtml(item.access_version)}</td>
    </tr>`).join('') : '<tr><td colspan="4" class="text-center text-muted">Belum ada perubahan.</td></tr>';
}

function renderTemplateOptions(selectedKey) {
    const options = state.templates.map(template => (
        `<option value="${escapeHtml(template.key)}"${selectedKey === template.key ? ' selected' : ''}>${escapeHtml(template.label)}</option>`
    )).join('');
    const editor = document.getElementById('access-template');
    const create = document.getElementById('access-create-template');
    if (editor) editor.innerHTML = `<option value="">Pilih template</option>${options}`;
    if (create) create.innerHTML = `<option value="">Pilih template</option>${options.replace(/ selected/g, '')}`;
    updateTemplateDescription();
}

function updateTemplateDescription() {
    const select = document.getElementById('access-template');
    const description = document.getElementById('access-template-description');
    if (!description) return;
    const template = state.templates.find(item => item.key === select?.value);
    description.textContent = template
        ? `${template.description} Klik Terapkan Template untuk mengisi matriks.`
        : 'Pilih template, terapkan ke matriks, lalu simpan.';
}

function setAllPermissionsChecked(checked) {
    document.querySelectorAll('#access-permission-matrix-body [data-permission]').forEach(input => {
        if (!input.disabled) input.checked = checked;
    });
}

function applySelectedTemplate() {
    const templateKey = document.getElementById('access-template')?.value;
    const template = state.templates.find(item => item.key === templateKey);
    if (!template) {
        notify('warning', 'Pilih template', 'Pilih salah satu template akses terlebih dahulu.');
        return;
    }
    const selectedPermissions = new Set(template.permissions);
    document.querySelectorAll('#access-permission-matrix-body [data-permission]').forEach(input => {
        input.checked = input.disabled || selectedPermissions.has(input.dataset.permission);
    });
    updateTemplateDescription();
}

function renderSelected() {
    const user = state.selected;
    if (!user) return;
    const [label, badge] = statusLabel(user);
    document.getElementById('access-selected-name').textContent = user.name || user.email;
    document.getElementById('access-selected-meta').textContent = `${user.email} · ${user.job_label}`;
    const status = document.getElementById('access-selected-status');
    status.className = `badge ${badge} mt-2 mt-md-0`;
    status.textContent = label;
    document.getElementById('access-doctor-protected').classList.toggle('d-none', !user.is_doctor_protected);
    document.getElementById('access-editor').classList.toggle('d-none', user.is_doctor_protected);
    document.getElementById('access-editor-actions').classList.toggle('d-none', user.is_doctor_protected);
    if (user.is_doctor_protected) return;

    renderTemplateOptions(user.template_key);
    renderMatrix();
    renderAuditHistory();
    const toggle = document.getElementById('access-toggle-status');
    if (user.status === 'pending') {
        toggle.className = 'd-none';
    } else {
        toggle.innerHTML = user.is_active
            ? '<i class="fas fa-user-slash mr-1"></i> Nonaktifkan'
            : '<i class="fas fa-user-check mr-1"></i> Aktifkan';
        toggle.className = user.is_active ? 'btn btn-outline-danger btn-sm mr-2' : 'btn btn-outline-success btn-sm mr-2';
    }
    document.getElementById('access-resend-invitation').classList.toggle('d-none', user.status !== 'pending');
}

async function selectUser(userId) {
    try {
        state.selected = await request(`/users/${encodeURIComponent(userId)}`);
        renderAccounts();
        renderSelected();
    } catch (error) {
        notify('error', 'Gagal memuat akun', error.message);
    }
}

async function loadUsers(preferredId) {
    state.users = await request('/users');
    renderAccounts();
    const target = preferredId || state.selected?.id || state.users[0]?.id;
    if (target) await selectUser(target);
}

async function savePermissions() {
    if (!state.selected || state.selected.is_doctor_protected) return;
    const templateKey = document.getElementById('access-template')?.value;
    if (!templateKey) {
        notify('warning', 'Template belum dipilih', 'Pilih template akses sebelum menyimpan.');
        return;
    }
    const button = document.getElementById('access-save');
    button.disabled = true;
    try {
        const permissions = [...document.querySelectorAll('#access-permission-matrix-body [data-permission]:checked')]
            .map(input => input.dataset.permission);
        const payload = {
            permissions,
            access_version: state.selected.access_version,
            template_key: templateKey
        };
        await request(`/users/${encodeURIComponent(state.selected.id)}/permissions`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        await loadUsers(state.selected.id);
        notify('success', 'Akses tersimpan', 'Perubahan berlaku pada seluruh sesi aktif.');
    } catch (error) {
        if (error.code === 'ACCESS_VERSION_CONFLICT') await loadUsers(state.selected.id);
        notify('error', 'Gagal menyimpan akses', error.message);
    } finally {
        button.disabled = false;
    }
}

async function toggleStatus() {
    if (!state.selected) return;
    const desired = !state.selected.is_active;
    const verb = desired ? 'mengaktifkan' : 'menonaktifkan';
    const confirmed = !window.Swal || (await window.Swal.fire({
        icon: 'warning',
        title: `${desired ? 'Aktifkan' : 'Nonaktifkan'} akun?`,
        text: `Anda akan ${verb} akun ${state.selected.name}.`,
        showCancelButton: true,
        confirmButtonText: desired ? 'Aktifkan' : 'Nonaktifkan',
        cancelButtonText: 'Batal'
    })).isConfirmed;
    if (!confirmed) return;
    try {
        await request(`/users/${encodeURIComponent(state.selected.id)}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ is_active: desired, access_version: state.selected.access_version })
        });
        await loadUsers(state.selected.id);
    } catch (error) {
        if (error.code === 'ACCESS_VERSION_CONFLICT') await loadUsers(state.selected.id);
        notify('error', 'Status tidak berubah', error.message);
    }
}

async function resendInvitation() {
    if (!state.selected) return;
    try {
        const result = await request(`/users/${encodeURIComponent(state.selected.id)}/invitations`, {
            method: 'POST',
            body: '{}'
        });
        notify(
            result.email_sent ? 'success' : 'warning',
            result.email_sent ? 'Undangan terkirim' : 'Email belum terkirim',
            result.email_sent ? 'Tautan baru berlaku 24 jam.' : 'Akun tetap menunggu. Coba kirim ulang setelah layanan email pulih.'
        );
    } catch (error) {
        notify('error', 'Gagal mengirim ulang', error.message);
    }
}

async function createAccount(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = document.getElementById('access-create-submit');
    submit.disabled = true;
    try {
        const formData = new FormData(form);
        const result = await request('/invitations', {
            method: 'POST',
            body: JSON.stringify({
                name: formData.get('name'),
                email: formData.get('email'),
                template_key: formData.get('template_key')
            })
        });
        window.jQuery?.('#access-create-account-modal').modal('hide');
        form.reset();
        await loadUsers(result.user.id);
        notify(
            result.email_sent ? 'success' : 'warning',
            result.email_sent ? 'Akun dibuat' : 'Akun dibuat, email belum terkirim',
            result.email_sent ? 'Pemilik akun menerima tautan aktivasi 24 jam.' : 'Akun tetap menunggu. Gunakan Kirim Ulang Undangan.'
        );
    } catch (error) {
        notify('error', 'Gagal membuat akun', error.message);
    } finally {
        submit.disabled = false;
    }
}

export async function initKelolaAccess() {
    const root = document.getElementById('kelola-access-root');
    if (!root) return;
    if (!state.initialized) {
        document.getElementById('access-account-search').addEventListener('input', renderAccounts);
        document.getElementById('access-save').addEventListener('click', savePermissions);
        document.getElementById('access-toggle-status').addEventListener('click', toggleStatus);
        document.getElementById('access-resend-invitation').addEventListener('click', resendInvitation);
        document.getElementById('access-create-account-form').addEventListener('submit', createAccount);
        document.getElementById('access-template').addEventListener('change', updateTemplateDescription);
        document.getElementById('access-template-apply').addEventListener('click', applySelectedTemplate);
        document.getElementById('access-check-all').addEventListener('click', () => setAllPermissionsChecked(true));
        document.getElementById('access-uncheck-all').addEventListener('click', () => setAllPermissionsChecked(false));
        state.initialized = true;
    }
    try {
        const catalog = await request('/catalog');
        state.catalog = catalog.permissions;
        state.templates = catalog.templates;
        renderTemplateOptions(null);
        await loadUsers();
    } catch (error) {
        notify('error', 'Kelola Akses tidak dapat dimuat', error.message);
    }
}

window.initKelolaAccess = initKelolaAccess;
