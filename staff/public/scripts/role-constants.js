export const ROLE_IDS = Object.freeze({
    DOKTER: 1,
    MANAGERIAL: 7,
    BIDAN: 22,
    ADMIN: 24,
    FRONT_OFFICE: 25
});

export const ROLE_NAMES = Object.freeze({
    DOKTER: 'dokter',
    MANAGERIAL: 'managerial',
    BIDAN: 'bidan',
    ADMIN: 'admin',
    FRONT_OFFICE: 'front_office'
});

export function isSuperadminRoleId(roleId) {
    return Number(roleId) === ROLE_IDS.DOKTER;
}

export function isSuperadminUser(user) {
    return Boolean(user?.is_superadmin)
        || isSuperadminRoleId(user?.role_id)
        || user?.role === ROLE_NAMES.DOKTER;
}
