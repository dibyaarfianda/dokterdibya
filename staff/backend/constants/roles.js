/**
 * Role Constants
 * Single source of truth for role identification
 * Use these constants instead of hardcoded role names/IDs for consistency
 */

// Role IDs (from database roles.id)
const ROLE_IDS = {
    DOKTER: 1,
    MANAGERIAL: 7,
    BIDAN: 22,
    ADMIN: 24,
    FRONT_OFFICE: 25
};

// Role Names (from database roles.name) - used in JWT tokens
const ROLE_NAMES = {
    DOKTER: 'dokter',
    MANAGERIAL: 'managerial',
    BIDAN: 'bidan',
    ADMIN: 'admin',           // Note: display_name is "Administrasi"
    FRONT_OFFICE: 'front_office'
};

// Map role_id to role_name
const ROLE_ID_TO_NAME = {
    [ROLE_IDS.DOKTER]: ROLE_NAMES.DOKTER,
    [ROLE_IDS.MANAGERIAL]: ROLE_NAMES.MANAGERIAL,
    [ROLE_IDS.BIDAN]: ROLE_NAMES.BIDAN,
    [ROLE_IDS.ADMIN]: ROLE_NAMES.ADMIN,
    [ROLE_IDS.FRONT_OFFICE]: ROLE_NAMES.FRONT_OFFICE
};

// Map role_name to role_id
const ROLE_NAME_TO_ID = {
    [ROLE_NAMES.DOKTER]: ROLE_IDS.DOKTER,
    [ROLE_NAMES.MANAGERIAL]: ROLE_IDS.MANAGERIAL,
    [ROLE_NAMES.BIDAN]: ROLE_IDS.BIDAN,
    [ROLE_NAMES.ADMIN]: ROLE_IDS.ADMIN,
    [ROLE_NAMES.FRONT_OFFICE]: ROLE_IDS.FRONT_OFFICE
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
    ROLE_NAMES,
    ROLE_ID_TO_NAME,
    ROLE_NAME_TO_ID,
    isSuperadminRole,
    isAdminRole,
    isManagementRole
};
