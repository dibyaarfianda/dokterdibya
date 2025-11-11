import { getIdToken } from './vps-auth-v2.js';

const API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3001'
    : window.location.origin.replace(/\/$/, '');

let rolesData = [];
let usersData = [];
let permissionsData = [];
let rolesTable, usersTable;

function redirectToLogin() {
    window.location.href = 'login.html';
}

async function getToken() {
    try {
        const token = await getIdToken();
        if (!token) {
            redirectToLogin();
            throw new Error('Unauthorized');
        }
        return token;
    } catch (error) {
        console.error('Failed to get auth token:', error);
        redirectToLogin();
        throw new Error('Unauthorized');
    }
}

function buildApiUrl(path = '') {
    if (!path) return API_BASE;
    if (/^https?:\/\//i.test(path)) {
        return path;
    }
    return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

async function buildHeaders(baseHeaders = {}, body = null) {
    const headers = { ...baseHeaders };
    if (!headers.Authorization) {
        const token = await getToken();
        headers.Authorization = `Bearer ${token}`;
    }

    const shouldSetJson = body 
        && typeof body === 'object'
        && !(body instanceof FormData)
        && !headers['Content-Type'];

    if (shouldSetJson) {
        headers['Content-Type'] = 'application/json';
    }

    return headers;
}

async function apiFetch(path, options = {}, fallbackMessage = 'Permintaan gagal') {
    const requestOptions = { ...options };
    const originalBody = requestOptions.body;

    requestOptions.headers = await buildHeaders(requestOptions.headers, originalBody);

    if (requestOptions.body && requestOptions.headers['Content-Type'] === 'application/json' && typeof requestOptions.body !== 'string') {
        requestOptions.body = JSON.stringify(requestOptions.body);
    }

    let response;
    try {
        response = await fetch(buildApiUrl(path), requestOptions);
    } catch (networkError) {
        console.error('Network error when calling API:', networkError);
        throw new Error('Tidak dapat terhubung ke server');
    }

    if (response.status === 401 || response.status === 403) {
        redirectToLogin();
        throw new Error('Sesi berakhir, silakan login kembali');
    }

    if (response.status === 204) {
        return { success: true };
    }

    let payload = null;
    try {
        payload = await response.json();
    } catch (parseError) {
        console.warn('Failed to parse API response as JSON:', parseError);
    }

    if (!response.ok) {
        const message = payload?.message || fallbackMessage;
        console.error('API request failed', {
            path,
            status: response.status,
            message,
            payload
        });

        const error = new Error(message);
        error.status = response.status;
        error.payload = payload;
        error.path = path;
        throw error;
    }

    return payload;
}

// Initialize - check authentication on load
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await getToken(); // Will redirect to login if no token
        initRolesTable();
        initUsersTable();
        loadRoles();
        loadUsers();
        loadPermissions();
    } catch (error) {
        console.error('Authentication error:', error);
        redirectToLogin();
    }
});

// Initialize DataTables
function initRolesTable() {
    rolesTable = $('#roles-table').DataTable({
        responsive: true,
        order: [[0, 'asc']],
        columnDefs: [
            { targets: -1, orderable: false }
        ]
    });
}

function initUsersTable() {
    usersTable = $('#users-table').DataTable({
        responsive: true,
        order: [[0, 'desc']],
        columnDefs: [
            { targets: -1, orderable: false }
        ]
    });
}

// Load Roles
async function loadRoles() {
    return apiFetch('/api/roles', {}, 'Gagal memuat data roles')
        .then(result => {
            rolesData = result.data || [];
            renderRolesTable();
            populateRoleSelect();
            return result;
        })
        .catch(error => {
            console.error('Error loading roles:', error);
            Swal.fire('Error', error.message || 'Gagal memuat data roles', 'error');
            throw error;
        });
}

function renderRolesTable() {
    rolesTable.clear();

    rolesData.forEach(role => {
        const typeBadge = role.is_system 
            ? '<span class="role-badge system">System</span>'
            : '<span class="role-badge custom">Custom</span>';

        const actions = role.is_system && role.name !== 'admin'
            ? `<span class="text-muted"><i class="fas fa-lock"></i> System Role</span>`
            : `<button class="btn btn-sm btn-info" onclick="showManagePermissions(${role.id})">
                <i class="fas fa-key"></i> Permissions
               </button>
               <button class="btn btn-sm btn-warning" onclick="editRole(${role.id})">
                <i class="fas fa-edit"></i>
               </button>
               <button class="btn btn-sm btn-danger" onclick="deleteRole(${role.id})">
                <i class="fas fa-trash"></i>
               </button>`;

        rolesTable.row.add([
            role.id,
            `<strong>${role.display_name}</strong><br><small class="text-muted">${role.name}</small>`,
            role.description || '-',
            typeBadge,
            `<span class="badge badge-primary">${role.permission_count || 0}</span>`,
            `<span class="badge badge-success">${role.user_count || 0}</span>`,
            actions
        ]);
    });

    rolesTable.draw();
}

// Load Users
async function loadUsers() {
    return apiFetch('/api/users', {}, 'Gagal memuat data users')
        .then(result => {
            usersData = result.data || [];
            renderUsersTable();
            return result;
        })
        .catch(error => {
            console.error('Error loading users:', error);
            Swal.fire('Error', error.message || 'Gagal memuat data users', 'error');
            throw error;
        });
}

function renderUsersTable() {
    usersTable.clear();

    usersData.forEach(user => {
        const roleDisplay = user.role_display_name 
            ? `<span class="badge badge-info">${user.role_display_name}</span>`
            : '<span class="badge badge-secondary">No Role</span>';

        const statusDisplay = user.is_active
            ? '<span class="user-status-active"><i class="fas fa-check-circle"></i> Active</span>'
            : '<span class="user-status-inactive"><i class="fas fa-times-circle"></i> Inactive</span>';

        const lastLogin = user.last_login 
            ? new Date(user.last_login).toLocaleDateString('id-ID', { 
                day: '2-digit', month: 'short', year: 'numeric', 
                hour: '2-digit', minute: '2-digit' 
              })
            : '-';

        const actions = `
            <button class="btn btn-sm btn-success" onclick="showAssignRole('${user.id}', '${user.name}', ${user.role_id || 'null'})">
                <i class="fas fa-user-tag"></i>
            </button>
            <button class="btn btn-sm ${user.is_active ? 'btn-warning' : 'btn-info'}" 
                    onclick="toggleUserStatus('${user.id}', ${!user.is_active})">
                <i class="fas fa-${user.is_active ? 'ban' : 'check'}"></i>
            </button>
        `;

        usersTable.row.add([
            user.id,
            user.name,
            user.email,
            roleDisplay,
            statusDisplay,
            lastLogin,
            actions
        ]);
    });

    usersTable.draw();
}

// Load Permissions
async function loadPermissions() {
    return apiFetch('/api/permissions', {}, 'Gagal memuat data permissions')
        .then(result => {
            permissionsData = result.data?.permissions || [];
            renderPermissionsList(result.data?.grouped || {});
            return result;
        })
        .catch(error => {
            console.error('Error loading permissions:', {
                message: error?.message,
                status: error?.status,
                details: error?.payload
            });
            Swal.fire('Error', error.message || 'Gagal memuat data permissions', 'error');
            throw error;
        });
}

function renderPermissionsList(grouped) {
    const container = document.getElementById('permissions-list');
    let html = '';

    Object.keys(grouped).forEach(category => {
        html += `
            <div class="permission-category">
                <h5><i class="fas fa-folder"></i> ${category}</h5>
                <div class="row">
        `;

        grouped[category].forEach(perm => {
            html += `
                <div class="col-md-6">
                    <div class="custom-control custom-checkbox permission-checkbox">
                        <input type="checkbox" class="custom-control-input" disabled>
                        <label class="custom-control-label">
                            <strong>${perm.display_name}</strong>
                            <br><small class="text-muted">${perm.name} - ${perm.description || ''}</small>
                            <br><span class="badge badge-secondary">${perm.role_count} roles</span>
                        </label>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Show Create Role Modal
window.showCreateRoleModal = function() {
    document.getElementById('role-id').value = '';
    document.getElementById('role-name').value = '';
    document.getElementById('role-name').disabled = false;
    document.getElementById('role-display-name').value = '';
    document.getElementById('role-description').value = '';
    document.getElementById('role-modal-title').textContent = 'Tambah Role Baru';
    $('#role-modal').modal('show');
};

// Edit Role
window.editRole = async function(roleId) {
    try {
        const token = await getToken();
        const response = await fetch(`${API_BASE}/api/roles/${roleId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load role');

        const result = await response.json();
        const role = result.data;

        document.getElementById('role-id').value = role.id;
        document.getElementById('role-name').value = role.name;
        document.getElementById('role-name').disabled = true;
        document.getElementById('role-display-name').value = role.display_name;
        document.getElementById('role-description').value = role.description || '';
        document.getElementById('role-modal-title').textContent = 'Edit Role';
        $('#role-modal').modal('show');
    } catch (error) {
        console.error('Error loading role:', error);
        Swal.fire('Error', 'Gagal memuat data role', 'error');
    }
};

// Handle Role Form Submit
document.getElementById('role-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const roleId = document.getElementById('role-id').value;
    const data = {
        name: document.getElementById('role-name').value,
        display_name: document.getElementById('role-display-name').value,
        description: document.getElementById('role-description').value
    };

    try {
        const url = roleId 
            ? `${API_BASE}/api/roles/${roleId}`
            : `${API_BASE}/api/roles`;
        
        const token = await getToken();
        const response = await fetch(url, {
            method: roleId ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to save role');
        }

        $('#role-modal').modal('hide');
        Swal.fire('Berhasil', 'Role berhasil disimpan', 'success');
        loadRoles();
    } catch (error) {
        console.error('Error saving role:', error);
        Swal.fire('Error', error.message, 'error');
    }
});

// Delete Role
window.deleteRole = async function(roleId) {
    const result = await Swal.fire({
        title: 'Hapus Role?',
        text: 'Role yang dihapus tidak dapat dikembalikan',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Ya, Hapus',
        cancelButtonText: 'Batal'
    });

    if (!result.isConfirmed) return;

    try {
        const token = await getToken();
        const response = await fetch(`${API_BASE}/api/roles/${roleId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to delete role');
        }

        Swal.fire('Berhasil', 'Role berhasil dihapus', 'success');
        loadRoles();
    } catch (error) {
        console.error('Error deleting role:', error);
        Swal.fire('Error', error.message, 'error');
    }
};

// Show Manage Permissions
window.showManagePermissions = async function(roleId) {
    try {
        const token = await getToken();
        const response = await fetch(`${API_BASE}/api/roles/${roleId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load role permissions');

        const result = await response.json();
        const role = result.data;

        document.getElementById('perm-role-id').value = role.id;
        document.getElementById('perm-role-name').textContent = role.display_name;

        renderPermissionsGrid(role.permissions);
        $('#permissions-modal').modal('show');
    } catch (error) {
        console.error('Error loading permissions:', error);
        Swal.fire('Error', 'Gagal memuat data permissions', 'error');
    }
};

function renderPermissionsGrid(permissions) {
    const container = document.getElementById('permissions-grid');
    const grouped = {};

    permissions.forEach(perm => {
        if (!grouped[perm.category]) {
            grouped[perm.category] = [];
        }
        grouped[perm.category].push(perm);
    });

    let html = '';
    Object.keys(grouped).forEach(category => {
        html += `
            <div class="permission-category">
                <h5><i class="fas fa-folder"></i> ${category}</h5>
                <div class="row">
        `;

        grouped[category].forEach(perm => {
            html += `
                <div class="col-md-6 col-lg-4">
                    <div class="custom-control custom-checkbox permission-checkbox">
                        <input type="checkbox" class="custom-control-input perm-check" 
                               id="perm-${perm.id}" value="${perm.id}" 
                               ${perm.is_assigned ? 'checked' : ''}>
                        <label class="custom-control-label" for="perm-${perm.id}">
                            <strong>${perm.display_name}</strong>
                            <br><small class="text-muted">${perm.name}</small>
                        </label>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Select/Deselect All Permissions
window.selectAllPermissions = function() {
    document.querySelectorAll('.perm-check').forEach(cb => cb.checked = true);
};

window.deselectAllPermissions = function() {
    document.querySelectorAll('.perm-check').forEach(cb => cb.checked = false);
};

// Handle Permissions Form Submit
document.getElementById('permissions-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const roleId = document.getElementById('perm-role-id').value;
    const selectedPermissions = Array.from(document.querySelectorAll('.perm-check:checked'))
        .map(cb => parseInt(cb.value));

    try {
        const token = await getToken();
        const response = await fetch(`${API_BASE}/api/roles/${roleId}/permissions`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ permission_ids: selectedPermissions })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to update permissions');
        }

        $('#permissions-modal').modal('hide');
        Swal.fire('Berhasil', 'Permission berhasil diperbarui', 'success');
        loadRoles();
    } catch (error) {
        console.error('Error updating permissions:', error);
        Swal.fire('Error', error.message, 'error');
    }
});

// Populate Role Select
function populateRoleSelect() {
    const select = document.getElementById('assign-role-select');
    select.innerHTML = '<option value="">-- Pilih Role --</option>';

    rolesData.forEach(role => {
        select.innerHTML += `<option value="${role.id}">${role.display_name}</option>`;
    });
}

// Show Assign Role Modal
window.showAssignRole = function(userId, userName, currentRoleId) {
    document.getElementById('assign-user-id').value = userId;
    document.getElementById('assign-user-name').textContent = userName;
    document.getElementById('assign-role-select').value = currentRoleId || '';
    $('#assign-role-modal').modal('show');
};

// Handle Assign Role Form Submit
document.getElementById('assign-role-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const userId = document.getElementById('assign-user-id').value;
    const roleId = document.getElementById('assign-role-select').value;

    if (!roleId) {
        Swal.fire('Error', 'Pilih role terlebih dahulu', 'error');
        return;
    }

    try {
        const token = await getToken();
        const response = await fetch(`${API_BASE}/api/users/${userId}/role`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ role_id: parseInt(roleId) })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to assign role');
        }

        $('#assign-role-modal').modal('hide');
        Swal.fire('Berhasil', 'Role berhasil ditetapkan', 'success');
        loadUsers();
    } catch (error) {
        console.error('Error assigning role:', error);
        Swal.fire('Error', error.message, 'error');
    }
});

// Toggle User Status
window.toggleUserStatus = async function(userId, newStatus) {
    const action = newStatus ? 'mengaktifkan' : 'menonaktifkan';
    
    const result = await Swal.fire({
        title: `${newStatus ? 'Aktifkan' : 'Nonaktifkan'} User?`,
        text: `Anda yakin ingin ${action} user ini?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Ya',
        cancelButtonText: 'Batal'
    });

    if (!result.isConfirmed) return;

    try {
        const token = await getToken();
        const response = await fetch(`${API_BASE}/api/users/${userId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ is_active: newStatus })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to update user status');
        }

        Swal.fire('Berhasil', `User berhasil ${newStatus ? 'diaktifkan' : 'dinonaktifkan'}`, 'success');
        loadUsers();
    } catch (error) {
        console.error('Error updating user status:', error);
        Swal.fire('Error', error.message, 'error');
    }
};

// Logout
window.logout = async function() {
    try {
        // Import signOut from vps-auth-v2.js
        const { signOut } = await import('./vps-auth-v2.js');
        await signOut();
    } catch (error) {
        console.error('Error signing out:', error);
    }
    
    // Clear any remaining tokens
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = 'login.html';
};
