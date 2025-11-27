/**
 * Role ID Constants
 * Single source of truth for role identification
 * Use these constants instead of role names for consistency
 */

const ROLE_IDS = {
    DOKTER: 1,
    MANAGERIAL: 7,
    BIDAN: 22,
    ADMIN: 24,
    FRONT_OFFICE: 25
};

// Helper to check if role_id is superadmin (dokter)
function isSuperadminRole(roleId) {
    return roleId === ROLE_IDS.DOKTER;
}

// Helper to check if role_id is admin level (dokter or admin)
function isAdminRole(roleId) {
    return [ROLE_IDS.DOKTER, ROLE_IDS.ADMIN].includes(roleId);
}

// Helper to check if role_id is management level
function isManagementRole(roleId) {
    return [ROLE_IDS.DOKTER, ROLE_IDS.ADMIN, ROLE_IDS.MANAGERIAL].includes(roleId);
}

module.exports = {
    ROLE_IDS,
    isSuperadminRole,
    isAdminRole,
    isManagementRole
};
