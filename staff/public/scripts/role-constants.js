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

// Closing a pregnancy (Sudah Lahir, Kehamilan Berakhir, completing history) is dokter/bidan only.
// Mirrors isCloser() in staff/backend/services/PregnancyEpisodeService.js, which enforces it.
export function isPregnancyCloserUser(user) {
    if (!user) return false;
    if (isSuperadminUser(user)) return true;
    return Number(user.role_id) === ROLE_IDS.BIDAN || user.role === ROLE_NAMES.BIDAN;
}

// Classic scripts (legacy/patient-tools.js) cannot import this module.
if (typeof window !== 'undefined') {
    window.isPregnancyCloserUser = isPregnancyCloserUser;
}
