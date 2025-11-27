/**
 * Kelola Roles Management Module
 * Handles CRUD operations for roles and permissions
 */

const API_BASE = '/api';

// State
let roles = [];
let permissions = [];
let selectedRoleId = null;
let isInitialized = false;

// DOM Elements
const DOM = {
    tbody: null,
    modal: null,
    form: null,
    permissionsCard: null,
    permissionsContainer: null
};

/**
 * Get auth token
 */
function getToken() {
    return localStorage.getItem('vps_auth_token') || localStorage.getItem('token');
}

/**
 * API request helper
 */
async function apiRequest(endpoint, options = {}) {
    const token = getToken();
    if (!token) {
        throw new Error('Unauthorized - Please login');
    }

    const config = {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    };

    const response = await fetch(`${API_BASE}${endpoint}`, config);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Request failed');
    }

    return data;
}

/**
 * Load all roles from API
 */
async function loadRoles() {
    try {
        DOM.tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-4">
                    <i class="fas fa-spinner fa-spin fa-2x"></i>
                    <p class="mt-2 mb-0">Memuat data roles...</p>
                </td>
            </tr>
        `;

        const response = await apiRequest('/roles');
        roles = response.data || [];

        renderRolesTable();
        updateStats();
    } catch (error) {
        console.error('Failed to load roles:', error);
        DOM.tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-danger py-4">
                    <i class="fas fa-exclamation-triangle fa-2x"></i>
                    <p class="mt-2 mb-0">Gagal memuat data: ${error.message}</p>
                    <button class="btn btn-primary btn-sm mt-2" onclick="window.initKelolaRoles()">
                        <i class="fas fa-sync"></i> Coba Lagi
                    </button>
                </td>
            </tr>
        `;
    }
}

/**
 * Load all permissions from API
 */
async function loadPermissions() {
    try {
        const response = await apiRequest('/permissions');
        permissions = response.data || [];
    } catch (error) {
        console.error('Failed to load permissions:', error);
        permissions = [];
    }
}

/**
 * Render roles table
 */
function renderRolesTable() {
    if (roles.length === 0) {
        DOM.tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted py-4">
                    <i class="fas fa-folder-open fa-2x"></i>
                    <p class="mt-2 mb-0">Belum ada role yang tersedia</p>
                </td>
            </tr>
        `;
        return;
    }

    DOM.tbody.innerHTML = roles.map(role => {
        // dokter role cannot be edited or deleted (it's the superadmin)
        const isDokterRole = role.name === 'dokter';
        const canEdit = !isDokterRole;
        const canDelete = !isDokterRole && role.user_count === 0;
        
        return `
        <tr data-role-id="${role.id}">
            <td>${role.id}</td>
            <td>
                <code class="text-primary">${escapeHtml(role.name)}</code>
                ${role.is_system ? '<span class="badge badge-secondary ml-1">System</span>' : ''}
            </td>
            <td><strong>${escapeHtml(role.display_name)}</strong></td>
            <td>
                <small class="text-muted">${escapeHtml(role.description || '-')}</small>
            </td>
            <td class="text-center">
                <span class="badge badge-info">${role.permission_count || 0}</span>
            </td>
            <td class="text-center">
                <span class="badge badge-success">${role.user_count || 0}</span>
            </td>
            <td class="text-center">
                <div class="btn-group">
                    <button class="btn btn-info btn-xs" onclick="showPermissions(${role.id})" title="Kelola Permissions">
                        <i class="fas fa-key"></i>
                    </button>
                    <button class="btn btn-warning btn-xs" onclick="editRole(${role.id})" title="Edit Role" ${canEdit ? '' : 'disabled'}>
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-xs" onclick="deleteRole(${role.id})" title="Hapus Role" ${canDelete ? '' : 'disabled'}>
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `}).join('');
}

/**
 * Update stats cards
 */
function updateStats() {
    document.getElementById('roles-stat-total').textContent = roles.length;
    document.getElementById('roles-stat-permissions').textContent = permissions.length;

    const totalUsers = roles.reduce((sum, r) => sum + (r.user_count || 0), 0);
    document.getElementById('roles-stat-users').textContent = totalUsers;
}

/**
 * Show add role modal
 */
function showAddRoleModal() {
    document.getElementById('role-modal-title').textContent = 'Tambah Role Baru';
    document.getElementById('role-id').value = '';
    document.getElementById('role-name').value = '';
    document.getElementById('role-name').disabled = false;
    document.getElementById('role-display-name').value = '';
    document.getElementById('role-description').value = '';
    
    $(DOM.modal).modal('show');
}

/**
 * Edit role
 */
async function editRole(roleId) {
    const role = roles.find(r => r.id === roleId);
    if (!role) return;

    if (role.name === 'dokter') {
        Swal.fire('Info', 'Role dokter (superadmin) tidak dapat diubah', 'info');
        return;
    }

    document.getElementById('role-modal-title').textContent = 'Edit Role';
    document.getElementById('role-id').value = role.id;
    document.getElementById('role-name').value = role.name;
    document.getElementById('role-name').disabled = true; // Cannot change name
    document.getElementById('role-display-name').value = role.display_name;
    document.getElementById('role-description').value = role.description || '';
    
    $(DOM.modal).modal('show');
}

/**
 * Save role (create or update)
 */
async function saveRole(event) {
    event.preventDefault();

    const roleId = document.getElementById('role-id').value;
    const name = document.getElementById('role-name').value.trim();
    const displayName = document.getElementById('role-display-name').value.trim();
    const description = document.getElementById('role-description').value.trim();

    if (!name || !displayName) {
        Swal.fire('Error', 'Nama dan Display Name wajib diisi', 'error');
        return;
    }

    try {
        const btn = document.getElementById('btn-save-role');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';

        if (roleId) {
            // Update existing role
            await apiRequest(`/roles/${roleId}`, {
                method: 'PUT',
                body: JSON.stringify({ display_name: displayName, description })
            });
            Swal.fire('Berhasil', 'Role berhasil diperbarui', 'success');
        } else {
            // Create new role
            await apiRequest('/roles', {
                method: 'POST',
                body: JSON.stringify({ name, display_name: displayName, description })
            });
            Swal.fire('Berhasil', 'Role baru berhasil dibuat', 'success');
        }

        $(DOM.modal).modal('hide');
        await loadRoles();
    } catch (error) {
        console.error('Failed to save role:', error);
        Swal.fire('Error', error.message || 'Gagal menyimpan role', 'error');
    } finally {
        const btn = document.getElementById('btn-save-role');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Simpan';
    }
}

/**
 * Delete role
 */
async function deleteRole(roleId) {
    const role = roles.find(r => r.id === roleId);
    if (!role) return;

    if (role.name === 'dokter') {
        Swal.fire('Error', 'Role dokter (superadmin) tidak dapat dihapus', 'error');
        return;
    }

    if (role.user_count > 0) {
        Swal.fire('Error', `Role ini masih digunakan oleh ${role.user_count} user`, 'error');
        return;
    }

    const result = await Swal.fire({
        title: 'Hapus Role?',
        html: `Anda yakin ingin menghapus role <strong>${escapeHtml(role.display_name)}</strong>?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    });

    if (!result.isConfirmed) return;

    try {
        await apiRequest(`/roles/${roleId}`, { method: 'DELETE' });
        Swal.fire('Berhasil', 'Role berhasil dihapus', 'success');
        await loadRoles();
    } catch (error) {
        console.error('Failed to delete role:', error);
        Swal.fire('Error', error.message || 'Gagal menghapus role', 'error');
    }
}

/**
 * Show permissions management panel
 */
async function showPermissions(roleId) {
    selectedRoleId = roleId;
    const role = roles.find(r => r.id === roleId);
    if (!role) return;

    document.getElementById('selected-role-name').textContent = role.display_name;
    
    // Show the permissions card
    DOM.permissionsCard.style.display = 'block';
    DOM.permissionsCard.scrollIntoView({ behavior: 'smooth' });

    // Load role details with permissions
    try {
        DOM.permissionsContainer.innerHTML = `
            <div class="col-12 text-center py-4">
                <i class="fas fa-spinner fa-spin fa-2x"></i>
                <p class="mt-2">Memuat permissions...</p>
            </div>
        `;

        const response = await apiRequest(`/roles/${roleId}`);
        const roleData = response.data;

        renderPermissions(roleData.permissions || []);
    } catch (error) {
        console.error('Failed to load permissions:', error);
        DOM.permissionsContainer.innerHTML = `
            <div class="col-12 text-center text-danger py-4">
                <i class="fas fa-exclamation-triangle fa-2x"></i>
                <p class="mt-2">Gagal memuat permissions: ${error.message}</p>
            </div>
        `;
    }
}

/**
 * Render permissions grouped by category
 */
function renderPermissions(permsList) {
    // Group by category
    const grouped = {};
    permsList.forEach(perm => {
        const category = perm.category || 'Uncategorized';
        if (!grouped[category]) {
            grouped[category] = [];
        }
        grouped[category].push(perm);
    });

    // Sort categories
    const sortedCategories = Object.keys(grouped).sort();

    DOM.permissionsContainer.innerHTML = sortedCategories.map(category => `
        <div class="col-md-6 col-lg-4 mb-3">
            <div class="card card-outline card-primary h-100">
                <div class="card-header py-2">
                    <h6 class="card-title mb-0">
                        <i class="fas fa-folder mr-1"></i>${escapeHtml(category)}
                    </h6>
                </div>
                <div class="card-body p-2">
                    ${grouped[category].map(perm => `
                        <div class="custom-control custom-checkbox">
                            <input type="checkbox" class="custom-control-input perm-checkbox" 
                                   id="perm-${perm.id}" 
                                   value="${perm.id}" 
                                   ${perm.is_assigned ? 'checked' : ''}>
                            <label class="custom-control-label" for="perm-${perm.id}">
                                <small>${escapeHtml(perm.display_name)}</small>
                            </label>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * Select all permissions
 */
function selectAllPermissions() {
    document.querySelectorAll('.perm-checkbox').forEach(cb => cb.checked = true);
}

/**
 * Deselect all permissions
 */
function deselectAllPermissions() {
    document.querySelectorAll('.perm-checkbox').forEach(cb => cb.checked = false);
}

/**
 * Save permissions for role
 */
async function savePermissions() {
    if (!selectedRoleId) return;

    const selectedPerms = [];
    document.querySelectorAll('.perm-checkbox:checked').forEach(cb => {
        selectedPerms.push(parseInt(cb.value));
    });

    try {
        const btn = document.getElementById('btn-save-permissions');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';

        await apiRequest(`/roles/${selectedRoleId}/permissions`, {
            method: 'PUT',
            body: JSON.stringify({ permission_ids: selectedPerms })
        });

        Swal.fire('Berhasil', 'Permissions berhasil disimpan', 'success');
        
        // Reload roles to update permission count
        await loadRoles();
    } catch (error) {
        console.error('Failed to save permissions:', error);
        Swal.fire('Error', error.message || 'Gagal menyimpan permissions', 'error');
    } finally {
        const btn = document.getElementById('btn-save-permissions');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Simpan Permissions';
    }
}

/**
 * Close permissions panel
 */
function closePermissions() {
    DOM.permissionsCard.style.display = 'none';
    selectedRoleId = null;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Initialize module
 */
function init() {
    if (isInitialized) {
        // Just reload data if already initialized
        loadRoles();
        return;
    }

    // Cache DOM elements
    DOM.tbody = document.getElementById('roles-tbody');
    DOM.modal = document.getElementById('role-modal');
    DOM.form = document.getElementById('role-form');
    DOM.permissionsCard = document.getElementById('permissions-card');
    DOM.permissionsContainer = document.getElementById('permissions-container');

    if (!DOM.tbody) {
        console.error('Roles table body not found');
        return;
    }

    // Bind events
    document.getElementById('btn-add-role')?.addEventListener('click', showAddRoleModal);
    DOM.form?.addEventListener('submit', saveRole);
    document.getElementById('btn-select-all-perms')?.addEventListener('click', selectAllPermissions);
    document.getElementById('btn-deselect-all-perms')?.addEventListener('click', deselectAllPermissions);
    document.getElementById('btn-save-permissions')?.addEventListener('click', savePermissions);
    document.getElementById('btn-close-permissions')?.addEventListener('click', closePermissions);

    // Load data
    loadRoles();
    loadPermissions();

    isInitialized = true;
    console.log('✅ Kelola Roles module initialized');
}

// Export to window
window.initKelolaRoles = init;
window.editRole = editRole;
window.deleteRole = deleteRole;
window.showPermissions = showPermissions;

export { init };
