'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const defaultDb = require('../db');
const defaultLogger = require('../utils/logger');
const defaultNotificationService = require('../utils/notification');
const { PERMISSION_CATALOG } = require('../config/accessControlCatalog');
const {
    LEGACY_MENU_MODULE_MAP,
    MENU_PERMISSION_MAP
} = require('../config/accessControlRegistry');
const { ROLE_IDS } = require('../constants/roles');

const INVITATION_TTL_HOURS = 24;
const ACCESS_MANAGEMENT_PERMISSIONS = new Set([
    'access.manage',
    'roles.create',
    'roles.delete',
    'roles.edit',
    'roles.manage_permissions',
    'roles.view',
    'users.manage_roles'
]);
const NON_DELEGABLE_PERMISSIONS = new Set([
    ...ACCESS_MANAGEMENT_PERMISSIONS,
    'system.reset'
]);
const catalogByName = new Map(PERMISSION_CATALOG.map(item => [item.name, item]));
const internalPermissionNames = new Set(PERMISSION_CATALOG.filter(item => item.internal).map(item => item.name));
const EXPLICIT_PERMISSION_DEPENDENCIES = new Map([
    ['finance_analysis.view', ['analytics.view', 'inventory.view', 'visits.view']]
]);
const ACCESS_TEMPLATE_METADATA = Object.freeze([
    Object.freeze({
        key: 'owner',
        label: 'Owner',
        description: 'Seluruh izin yang dapat didelegasikan oleh dokter.'
    }),
    Object.freeze({
        key: 'coordinator',
        label: 'Koordinator',
        description: 'Operasional klinik, pasien, rekam medis, jadwal, komunikasi, dan tim.'
    }),
    Object.freeze({
        key: 'pharmacy',
        label: 'Farmasi',
        description: 'Obat, inventori, pemasok, penjualan obat, dan keuangan terkait.'
    }),
    Object.freeze({
        key: 'staff',
        label: 'Staff',
        description: 'Operasional harian pasien, kunjungan, jadwal, antrean, dan komunikasi.'
    }),
    Object.freeze({
        key: 'observer',
        label: 'Observer',
        description: 'Akses baca tanpa edit, hapus, atau aksi khusus.'
    })
]);
const ACCESS_TEMPLATE_METADATA_BY_KEY = new Map(
    ACCESS_TEMPLATE_METADATA.map(template => [template.key, template])
);
const COORDINATOR_CATEGORIES = new Set([
    'Analitik',
    'Antrian Online',
    'Dashboard',
    'Klinik dan Jadwal',
    'Komunikasi dan Konten',
    'Pasien',
    'Rekam Medis',
    'Tim',
    'Tindakan'
]);
const COORDINATOR_BLOCKED_ACTIONS = new Set([
    'bulk_delete',
    'delete',
    'export',
    'finalize',
    'merge',
    'payment',
    'publish',
    'reset',
    'sync'
]);
const STAFF_PREFIXES = new Set([
    'announcements',
    'appointments',
    'booking',
    'dashboard',
    'greeting_cards',
    'hospital_appointments',
    'notifications',
    'online_queue',
    'patient_documents',
    'patients',
    'practice_schedules',
    'r2_files',
    'registration_codes',
    'services',
    'staff_announcements',
    'staff_briefing',
    'staff_workdesk',
    'sunday_clinic',
    'visits'
]);
const PHARMACY_FINANCE_PERMISSIONS = new Set([
    'billing.create',
    'billing.export',
    'billing.finalize',
    'billing.process_payment',
    'billing.view',
    'cost_estimates.view',
    'cost_estimates.write',
    'dashboard.view',
    'finance_analysis.view',
    'patients.view',
    'services.view',
    'visits.view'
]);
const TEMPLATE_LABEL_ALIASES = new Map([
    ['owner', 'owner'],
    ['admin', 'owner'],
    ['administrasi', 'owner'],
    ['administrator', 'owner'],
    ['koordinator', 'coordinator'],
    ['coordinator', 'coordinator'],
    ['manager', 'coordinator'],
    ['managerial', 'coordinator'],
    ['farmasi', 'pharmacy'],
    ['pharmacy', 'pharmacy'],
    ['staff', 'staff'],
    ['bidan', 'staff'],
    ['front office', 'staff'],
    ['front_office', 'staff'],
    ['observer', 'observer'],
    ['pengamat', 'observer']
]);

function accessError(message, statusCode, code) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    error.isOperational = true;
    return error;
}

function hashInvitationToken(token) {
    return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

function buildInvitationLink(token, activationUrl = 'https://dokterdibya.com/staff/public/activate-access.html') {
    return `${String(activationUrl).split('#')[0]}#token=${encodeURIComponent(String(token || ''))}`;
}

function validateStrongPassword(password) {
    const value = typeof password === 'string' ? password : '';
    const failures = [];
    if (value.length < 12) failures.push('minimal_12_karakter');
    if (!/[a-z]/.test(value)) failures.push('huruf_kecil');
    if (!/[A-Z]/.test(value)) failures.push('huruf_besar');
    if (!/\d/.test(value)) failures.push('angka');
    if (!/[^A-Za-z0-9]/.test(value)) failures.push('simbol');
    return { valid: failures.length === 0, failures };
}

function isDelegablePermission(item) {
    return Boolean(item)
        && !item.internal
        && !NON_DELEGABLE_PERMISSIONS.has(item.name);
}

function dependencyNames(item) {
    const dependencies = new Set(
        (item?.legacySources || [])
            .filter(source => source.kind === 'permission' && source.value !== item.name)
            .map(source => source.value)
    );
    for (const dependency of EXPLICIT_PERMISSION_DEPENDENCIES.get(item?.name) || []) {
        dependencies.add(dependency);
    }
    if (item && item.action !== 'view') {
        const viewPermission = `${item.name.split('.')[0]}.view`;
        if (isDelegablePermission(catalogByName.get(viewPermission))) dependencies.add(viewPermission);
    }
    return [...dependencies];
}

function getDelegableCatalog() {
    return PERMISSION_CATALOG
        .filter(isDelegablePermission)
        .map(item => ({
            name: item.name,
            display_name: item.displayName,
            category: item.category,
            description: item.description,
            action: item.action,
            dependencies: dependencyNames(item)
        }))
        .sort((left, right) => (
            left.category.localeCompare(right.category, 'id')
            || left.display_name.localeCompare(right.display_name, 'id')
        ));
}

function templateIncludesPermission(templateKey, item) {
    if (templateKey === 'owner') return true;
    if (templateKey === 'observer') return item.action === 'view';
    if (templateKey === 'coordinator') {
        return COORDINATOR_CATEGORIES.has(item.category)
            && !COORDINATOR_BLOCKED_ACTIONS.has(item.action);
    }
    if (templateKey === 'pharmacy') {
        return (
            item.category === 'Obat dan Inventori'
            || PHARMACY_FINANCE_PERMISSIONS.has(item.name)
        ) && !['bulk_delete', 'delete', 'reset'].includes(item.action);
    }
    if (templateKey === 'staff') {
        return STAFF_PREFIXES.has(item.name.split('.')[0])
            && ['view', 'write'].includes(item.action);
    }
    return false;
}

function getAccessTemplates() {
    const catalog = getDelegableCatalog();
    return ACCESS_TEMPLATE_METADATA.map(template => {
        const selectedPermissions = catalog
            .filter(permissionItem => templateIncludesPermission(template.key, permissionItem))
            .map(permissionItem => permissionItem.name);
        return {
            ...template,
            permissions: resolveSelectedPermissions(selectedPermissions)
        };
    });
}

function resolveAccessTemplate(templateKey) {
    const normalized = typeof templateKey === 'string' ? templateKey.trim().toLowerCase() : '';
    const template = getAccessTemplates().find(item => item.key === normalized);
    if (!template) {
        throw accessError('Template akses tidak valid.', 400, 'INVALID_ACCESS_TEMPLATE');
    }
    return template;
}

function templateKeyForJobLabel(jobLabel) {
    const normalized = typeof jobLabel === 'string' ? jobLabel.trim().toLowerCase() : '';
    return TEMPLATE_LABEL_ALIASES.get(normalized) || null;
}

function assertAccessVersion(expectedVersion, actualVersion) {
    const expected = Number(expectedVersion);
    const actual = Number(actualVersion);
    if (!Number.isSafeInteger(expected) || expected < 1 || expected !== actual) {
        throw accessError(
            'Akses telah berubah di sesi lain. Muat ulang sebelum menyimpan.',
            409,
            'ACCESS_VERSION_CONFLICT'
        );
    }
}

function assertMutableStaffAccount(account) {
    if (!account || account.user_type !== 'staff') {
        throw accessError('Akun staff tidak ditemukan.', 404, 'STAFF_NOT_FOUND');
    }
    if (Number(account.is_superadmin) === 1 || Number(account.role_id) === ROLE_IDS.DOKTER) {
        throw accessError('Akun dokter tidak dapat diubah melalui matriks akses.', 403, 'ACCESS_DENIED');
    }
}

function resolveSelectedPermissions(selectedPermissions) {
    if (!Array.isArray(selectedPermissions)) {
        throw accessError('permissions harus berupa array.', 400, 'INVALID_PERMISSIONS');
    }

    const resolved = new Set();
    const visit = name => {
        const item = catalogByName.get(name);
        if (!isDelegablePermission(item)) {
            throw accessError(`Izin tidak dapat didelegasikan: ${name}`, 403, 'ACCESS_DENIED');
        }
        if (resolved.has(name)) return;
        resolved.add(name);
        for (const dependency of dependencyNames(item)) {
            if (isDelegablePermission(catalogByName.get(dependency))) visit(dependency);
        }
    };

    for (const rawName of selectedPermissions) {
        if (typeof rawName !== 'string' || !rawName.trim()) {
            throw accessError('Nama izin tidak valid.', 400, 'INVALID_PERMISSIONS');
        }
        visit(rawName.trim());
    }

    return [...resolved].sort((left, right) => left.localeCompare(right));
}

function deriveNavigationPermissions(permissionNames) {
    const granted = new Set(permissionNames);
    const navigation = [];
    for (const [menuKey, modulePermission] of Object.entries(LEGACY_MENU_MODULE_MAP)) {
        const navigationPermission = MENU_PERMISSION_MAP[menuKey];
        if (granted.has(modulePermission) && navigationPermission && navigationPermission !== 'navigation.kelola_roles') {
            navigation.push(navigationPermission);
        }
    }
    return [...new Set(navigation)].sort((left, right) => left.localeCompare(right));
}

function normalizeEmail(value) {
    const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
        throw accessError('Email tidak valid.', 400, 'INVALID_EMAIL');
    }
    return email;
}

function normalizeName(value) {
    const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
    if (name.length < 2 || name.length > 120) {
        throw accessError('Nama harus berisi 2 sampai 120 karakter.', 400, 'INVALID_NAME');
    }
    return name;
}

function normalizeJobLabel(value) {
    const label = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
    if (label.length < 2 || label.length > 80) {
        throw accessError('Label jabatan harus berisi 2 sampai 80 karakter.', 400, 'INVALID_JOB_LABEL');
    }
    if (/^(?:dokter|doctor|dr\.?\s*dibya)$/i.test(label)) {
        throw accessError('Label dokter dilindungi.', 403, 'ACCESS_DENIED');
    }
    return label;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function publicUser(row) {
    const active = Number(row.is_active) === 1;
    const pending = !active && Number(row.has_password || 0) === 0;
    const sourceJobLabel = row.job_label || row.role_display || row.role || 'Staff';
    const templateKey = templateKeyForJobLabel(sourceJobLabel);
    const template = templateKey ? ACCESS_TEMPLATE_METADATA_BY_KEY.get(templateKey) : null;
    return {
        id: row.id || row.new_id,
        name: row.name,
        email: row.email,
        job_label: template?.label || sourceJobLabel,
        template_key: templateKey,
        role_id: row.job_role_id == null
            ? (row.role_id == null ? null : Number(row.role_id))
            : Number(row.job_role_id),
        is_active: active,
        status: pending ? 'pending' : (active ? 'active' : 'inactive'),
        access_mode: row.access_mode || row.mode || 'legacy',
        access_version: Math.max(1, Number(row.access_version) || 1),
        permission_count: Number(row.permission_count || 0),
        is_doctor_protected: Number(row.is_superadmin) === 1 || Number(row.role_id) === ROLE_IDS.DOKTER
    };
}

class AccessControlManagementService {
    constructor({
        db = defaultDb,
        logger = defaultLogger,
        notificationService = defaultNotificationService,
        bcryptImpl = bcrypt,
        randomBytes = crypto.randomBytes,
        activationUrl = `${String(process.env.PUBLIC_BASE_URL || 'https://dokterdibya.com').replace(/\/$/, '')}/staff/public/activate-access.html`
    } = {}) {
        this.db = db;
        this.logger = logger;
        this.notificationService = notificationService;
        this.bcrypt = bcryptImpl;
        this.randomBytes = randomBytes;
        this.activationUrl = activationUrl;
    }

    async getCatalog() {
        const templates = getAccessTemplates();
        return {
            permissions: getDelegableCatalog(),
            templates,
            job_labels: templates.map(template => ({
                name: template.key,
                label: template.label
            }))
        };
    }

    async listUsers() {
        const [rows] = await this.db.query(
            `SELECT
                u.new_id AS id,
                u.name,
                u.email,
                u.role,
                u.role_id,
                uap.job_role_id,
                u.is_active,
                u.is_superadmin,
                CASE WHEN u.password_hash IS NULL OR u.password_hash = '' THEN 0 ELSE 1 END AS has_password,
                COALESCE(uap.job_label, r.display_name, r.name, u.role, 'Staff') AS job_label,
                COALESCE(uap.mode, 'legacy') AS access_mode,
                COALESCE(uap.access_version, 1) AS access_version,
                COUNT(DISTINCT upg.permission_id) AS permission_count
             FROM users u
             LEFT JOIN roles r ON r.id = u.role_id
             LEFT JOIN user_access_policies uap ON uap.user_id = u.new_id
             LEFT JOIN user_permission_grants upg ON upg.user_id = u.new_id
             WHERE u.user_type = 'staff'
             GROUP BY u.new_id, u.name, u.email, u.role, u.role_id, u.is_active,
                      u.is_superadmin, u.password_hash, r.display_name, r.name,
                      uap.mode, uap.access_version, uap.job_label, uap.job_role_id
             ORDER BY (u.is_superadmin = 1 OR u.role_id = ?) DESC, u.is_active DESC, u.name ASC`,
            [ROLE_IDS.DOKTER]
        );
        return rows.map(publicUser);
    }

    async getUser(userId) {
        const [rows] = await this.db.query(
            `SELECT
                u.new_id AS id,
                u.name,
                u.email,
                u.role,
                u.role_id,
                uap.job_role_id,
                u.is_active,
                u.is_superadmin,
                CASE WHEN u.password_hash IS NULL OR u.password_hash = '' THEN 0 ELSE 1 END AS has_password,
                COALESCE(uap.job_label, r.display_name, r.name, u.role, 'Staff') AS job_label,
                COALESCE(uap.mode, 'legacy') AS access_mode,
                COALESCE(uap.access_version, 1) AS access_version
             FROM users u
             LEFT JOIN roles r ON r.id = u.role_id
             LEFT JOIN user_access_policies uap ON uap.user_id = u.new_id
             WHERE u.new_id = ? AND u.user_type = 'staff'
             LIMIT 1`,
            [userId]
        );
        if (!rows.length) throw accessError('Akun staff tidak ditemukan.', 404, 'STAFF_NOT_FOUND');

        const [grants] = await this.db.query(
            `SELECT p.name
             FROM user_permission_grants upg
             INNER JOIN permissions p ON p.id = upg.permission_id
             WHERE upg.user_id = ?
             ORDER BY p.name`,
            [userId]
        );
        const [audits] = await this.db.query(
            `SELECT a.id, a.actor_user_id, actor.name AS actor_name, a.action,
                    a.access_version, a.before_state, a.after_state, a.created_at
             FROM user_permission_audits a
             LEFT JOIN users actor ON actor.new_id = a.actor_user_id
             WHERE a.target_user_id = ?
             ORDER BY a.created_at DESC, a.id DESC
             LIMIT 50`,
            [userId]
        );

        const user = publicUser({ ...rows[0], permission_count: grants.length });
        return {
            ...user,
            permissions: grants.map(row => row.name).filter(name => !internalPermissionNames.has(name)),
            audits
        };
    }

    async _getTargetForUpdate(connection, userId) {
        await connection.query(
            `INSERT IGNORE INTO user_access_policies (user_id, mode, access_version)
             SELECT new_id, 'legacy', 1 FROM users WHERE new_id = ? AND user_type = 'staff'`,
            [userId]
        );
        const [rows] = await connection.query(
            `SELECT u.new_id, u.user_type, u.role_id, u.role, u.is_superadmin, u.is_active,
                    CASE WHEN u.password_hash IS NULL OR u.password_hash = '' THEN 0 ELSE 1 END AS has_password,
                    uap.mode, uap.access_version
             FROM users u
             INNER JOIN user_access_policies uap ON uap.user_id = u.new_id
             WHERE u.new_id = ?
             FOR UPDATE`,
            [userId]
        );
        if (!rows.length) throw accessError('Akun staff tidak ditemukan.', 404, 'STAFF_NOT_FOUND');
        return rows[0];
    }

    async _readGrantNames(connection, userId) {
        const [rows] = await connection.query(
            `SELECT p.name
             FROM user_permission_grants upg
             INNER JOIN permissions p ON p.id = upg.permission_id
             WHERE upg.user_id = ?
             ORDER BY p.name`,
            [userId]
        );
        return rows.map(row => row.name);
    }

    async _writeAudit(connection, { actorUserId, targetUserId, action, accessVersion, beforeState, afterState }) {
        await connection.query(
            `INSERT INTO user_permission_audits
                (actor_user_id, target_user_id, action, access_version, before_state, after_state)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                actorUserId,
                targetUserId,
                action,
                accessVersion,
                beforeState == null ? null : JSON.stringify(beforeState),
                afterState == null ? null : JSON.stringify(afterState)
            ]
        );
    }

    async savePermissions(userId, input, actorUserId) {
        const resolved = resolveSelectedPermissions(input?.permissions);
        const navigation = deriveNavigationPermissions(resolved);
        const assigned = [...new Set([...resolved, ...navigation])].sort((left, right) => left.localeCompare(right));
        const connection = await this.db.getConnection();
        await connection.beginTransaction();
        try {
            const target = await this._getTargetForUpdate(connection, userId);
            assertMutableStaffAccount(target);
            assertAccessVersion(input?.access_version, target.access_version);

            const beforePermissions = await this._readGrantNames(connection, userId);
            let nextJobLabel = input?.job_label === undefined
                ? null
                : normalizeJobLabel(input.job_label);
            let nextJobRoleId = null;
            let nextTemplateKey = null;
            if (input?.template_key !== undefined) {
                const template = resolveAccessTemplate(input.template_key);
                nextJobLabel = template.label;
                nextTemplateKey = template.key;
            } else if (input?.role_id !== undefined && input?.role_id !== null) {
                const role = await this._loadJobLabel(connection, input.role_id);
                nextJobLabel = role.display_name || role.name;
                nextJobRoleId = Number(role.id);
            }
            if (nextJobLabel) {
                await connection.query(
                    'UPDATE user_access_policies SET job_label = ?, job_role_id = ? WHERE user_id = ?',
                    [nextJobLabel, nextJobRoleId, userId]
                );
            }

            await connection.query('DELETE FROM user_permission_grants WHERE user_id = ?', [userId]);
            if (assigned.length) {
                const [permissionRows] = await connection.query(
                    'SELECT id, name FROM permissions WHERE name IN (?)',
                    [assigned]
                );
                if (permissionRows.length !== assigned.length) {
                    throw accessError('Katalog izin belum sinkron dengan database.', 500, 'PERMISSION_CATALOG_MISMATCH');
                }
                const values = permissionRows.map(permission => [userId, permission.id]);
                await connection.query(
                    'INSERT INTO user_permission_grants (user_id, permission_id) VALUES ?',
                    [values]
                );
            }

            const nextVersion = Number(target.access_version) + 1;
            await connection.query(
                'UPDATE user_access_policies SET access_version = ? WHERE user_id = ?',
                [nextVersion, userId]
            );
            await this._writeAudit(connection, {
                actorUserId,
                targetUserId: userId,
                action: 'permissions_updated',
                accessVersion: nextVersion,
                beforeState: { permissions: beforePermissions },
                afterState: {
                    permissions: assigned,
                    job_label: nextJobLabel || undefined,
                    template_key: nextTemplateKey || undefined
                }
            });
            await connection.commit();
            return {
                access_version: nextVersion,
                permissions: resolved,
                job_label: nextJobLabel,
                role_id: nextJobRoleId,
                template_key: nextTemplateKey
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async setStatus(userId, input, actorUserId) {
        if (typeof input?.is_active !== 'boolean') {
            throw accessError('is_active harus berupa boolean.', 400, 'INVALID_STATUS');
        }
        if (userId === actorUserId) {
            throw accessError('Akun sendiri tidak dapat dinonaktifkan.', 403, 'ACCESS_DENIED');
        }

        const connection = await this.db.getConnection();
        await connection.beginTransaction();
        try {
            const target = await this._getTargetForUpdate(connection, userId);
            assertMutableStaffAccount(target);
            assertAccessVersion(input.access_version, target.access_version);
            if (input.is_active && Number(target.has_password) !== 1) {
                throw accessError('Akun harus menerima undangan sebelum dapat diaktifkan.', 409, 'INVITATION_NOT_ACCEPTED');
            }
            const nextVersion = Number(target.access_version) + 1;
            await connection.query('UPDATE users SET is_active = ? WHERE new_id = ?', [input.is_active ? 1 : 0, userId]);
            await connection.query('UPDATE user_access_policies SET access_version = ? WHERE user_id = ?', [nextVersion, userId]);
            await this._writeAudit(connection, {
                actorUserId,
                targetUserId: userId,
                action: input.is_active ? 'account_activated' : 'account_deactivated',
                accessVersion: nextVersion,
                beforeState: { is_active: Number(target.is_active) === 1 },
                afterState: { is_active: input.is_active }
            });
            await connection.commit();
            return { is_active: input.is_active, access_version: nextVersion };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async _generateUniqueStaffId(connection) {
        for (let attempt = 0; attempt < 12; attempt += 1) {
            const candidate = `S${this.randomBytes(6).toString('hex').slice(0, 9).toUpperCase()}`;
            const [rows] = await connection.query('SELECT new_id FROM users WHERE new_id = ? LIMIT 1', [candidate]);
            if (!rows.length) return candidate;
        }
        throw accessError('Gagal membuat identitas akun.', 503, 'ACCOUNT_ID_UNAVAILABLE');
    }

    async _loadJobLabel(connection, roleId) {
        const numericRoleId = Number(roleId);
        if (!Number.isInteger(numericRoleId) || numericRoleId === ROLE_IDS.DOKTER) {
            throw accessError('Label jabatan tidak valid.', 400, 'INVALID_JOB_LABEL');
        }
        const [rows] = await connection.query(
            'SELECT id, name, display_name FROM roles WHERE id = ? AND id <> ? LIMIT 1',
            [numericRoleId, ROLE_IDS.DOKTER]
        );
        if (!rows.length) throw accessError('Label jabatan tidak valid.', 400, 'INVALID_JOB_LABEL');
        return rows[0];
    }

    _newInvitationToken() {
        const token = this.randomBytes(32).toString('base64url');
        return { token, tokenHash: hashInvitationToken(token) };
    }

    async _deliverInvitation({ email, name, token }) {
        const link = buildInvitationLink(token, this.activationUrl);
        const safeName = escapeHtml(name);
        const safeLink = escapeHtml(link);
        try {
            const result = await this.notificationService.sendEmail({
                to: email,
                subject: 'Aktifkan akun Staff Dokter Dibya',
                text: `Halo ${name}, aktifkan akun Staff Anda dalam 24 jam melalui tautan ini: ${link}`,
                html: `<p>Halo ${safeName},</p><p>Aktifkan akun Staff Anda dalam 24 jam:</p><p><a href="${safeLink}">Aktifkan akun</a></p>`
            });
            return Boolean(result?.success);
        } catch (error) {
            this.logger.warn('Staff invitation delivery unavailable', {
                account: crypto.createHash('sha256').update(email).digest('hex').slice(0, 12),
                reason: error?.code || error?.name || 'delivery_error'
            });
            return false;
        }
    }

    async createInvitation(input, actorUserId) {
        const name = normalizeName(input?.name);
        const email = normalizeEmail(input?.email);
        const connection = await this.db.getConnection();
        await connection.beginTransaction();
        let userId;
        let role;
        let invitation;
        try {
            const [existing] = await connection.query('SELECT new_id FROM users WHERE LOWER(email) = ? LIMIT 1', [email]);
            if (existing.length) throw accessError('Email sudah digunakan.', 409, 'EMAIL_EXISTS');
            if (input?.template_key !== undefined) {
                const template = resolveAccessTemplate(input.template_key);
                role = { id: null, name: template.key, display_name: template.label, template_key: template.key };
            } else {
                role = input?.role_id !== undefined
                    ? await this._loadJobLabel(connection, input.role_id)
                    : { id: null, name: 'staff', display_name: normalizeJobLabel(input?.job_label) };
            }
            userId = await this._generateUniqueStaffId(connection);
            invitation = this._newInvitationToken();

            await connection.query(
                `INSERT INTO users
                    (new_id, email, name, password_hash, role, role_id, user_type, is_active,
                     is_superadmin, must_change_password, profile_completed, created_at, updated_at)
                 VALUES (?, ?, ?, NULL, ?, ?, 'staff', 0, 0, 0, 0, NOW(), NOW())`,
                [userId, email, name, 'staff', null]
            );
            await connection.query(
                `INSERT INTO user_access_policies (user_id, mode, access_version, job_label, job_role_id)
                 VALUES (?, 'account', 1, ?, ?)`,
                [userId, role.display_name || role.name, role.id]
            );
            await connection.query(
                `INSERT INTO staff_access_invitations
                    (user_id, token_hash, expires_at, created_by)
                 VALUES (?, ?, DATE_ADD(NOW(6), INTERVAL ${INVITATION_TTL_HOURS} HOUR), ?)`,
                [userId, invitation.tokenHash, actorUserId]
            );
            await this._writeAudit(connection, {
                actorUserId,
                targetUserId: userId,
                action: 'account_invited',
                accessVersion: 1,
                beforeState: null,
                afterState: { is_active: false, mode: 'account', permissions: [], job_label: role.display_name || role.name }
            });
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

        const emailSent = await this._deliverInvitation({ email, name, token: invitation.token });
        return {
            user: {
                id: userId,
                name,
                email,
                job_label: role.display_name || role.name,
                role_id: role.id == null ? null : Number(role.id),
                is_active: false,
                status: 'pending',
                access_mode: 'account',
                access_version: 1,
                permission_count: 0,
                is_doctor_protected: false,
                template_key: role.template_key || templateKeyForJobLabel(role.display_name || role.name)
            },
            email_sent: emailSent,
            invitation_expires_in_hours: INVITATION_TTL_HOURS
        };
    }

    async resendInvitation(userId, actorUserId) {
        const connection = await this.db.getConnection();
        await connection.beginTransaction();
        let target;
        let invitation;
        try {
            target = await this._getTargetForUpdate(connection, userId);
            assertMutableStaffAccount(target);
            if (Number(target.is_active) === 1 || Number(target.has_password) === 1) {
                throw accessError('Undangan hanya dapat dikirim ulang untuk akun yang masih menunggu.', 409, 'INVITATION_NOT_PENDING');
            }
            const [userRows] = await connection.query(
                'SELECT email, name FROM users WHERE new_id = ? LIMIT 1',
                [userId]
            );
            invitation = this._newInvitationToken();
            await connection.query(
                `UPDATE staff_access_invitations
                 SET cancelled_at = NOW(6)
                 WHERE user_id = ? AND used_at IS NULL AND cancelled_at IS NULL`,
                [userId]
            );
            await connection.query(
                `INSERT INTO staff_access_invitations
                    (user_id, token_hash, expires_at, created_by)
                 VALUES (?, ?, DATE_ADD(NOW(6), INTERVAL ${INVITATION_TTL_HOURS} HOUR), ?)`,
                [userId, invitation.tokenHash, actorUserId]
            );
            await this._writeAudit(connection, {
                actorUserId,
                targetUserId: userId,
                action: 'invitation_resent',
                accessVersion: Number(target.access_version),
                beforeState: null,
                afterState: { invitation_pending: true }
            });
            await connection.commit();
            target.email = userRows[0].email;
            target.name = userRows[0].name;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

        const emailSent = await this._deliverInvitation({
            email: target.email,
            name: target.name,
            token: invitation.token
        });
        return { email_sent: emailSent, invitation_expires_in_hours: INVITATION_TTL_HOURS };
    }

    async _findInvitation(client, token, { forUpdate = false } = {}) {
        if (typeof token !== 'string' || token.length < 20 || token.length > 512) {
            throw accessError('Token undangan tidak valid.', 403, 'ACCESS_DENIED');
        }
        const [rows] = await client.query(
            `SELECT
                i.id,
                i.user_id,
                i.expires_at,
                i.used_at,
                i.cancelled_at,
                CASE WHEN i.expires_at <= NOW(6) THEN 1 ELSE 0 END AS is_expired,
                u.name,
                u.email,
                u.role_id,
                uap.job_role_id,
                u.is_active,
                u.is_superadmin,
                COALESCE(uap.job_label, r.display_name, r.name, u.role, 'Staff') AS job_label,
                COALESCE(uap.access_version, 1) AS access_version
             FROM staff_access_invitations i
             INNER JOIN users u ON u.new_id = i.user_id
             LEFT JOIN roles r ON r.id = u.role_id
             LEFT JOIN user_access_policies uap ON uap.user_id = u.new_id
             WHERE i.token_hash = ?
             LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
            [hashInvitationToken(token)]
        );
        if (!rows.length || rows[0].used_at || rows[0].cancelled_at || Number(rows[0].is_active) === 1) {
            throw accessError('Token undangan tidak valid atau sudah digunakan.', 403, 'ACCESS_DENIED');
        }
        if (Number(rows[0].is_expired) === 1) {
            throw accessError('Undangan sudah kedaluwarsa.', 410, 'INVITATION_EXPIRED');
        }
        assertMutableStaffAccount({ ...rows[0], user_type: 'staff' });
        return rows[0];
    }

    async validateInvitation(token) {
        const invitation = await this._findInvitation(this.db, token);
        const [local, domain] = String(invitation.email).split('@');
        const maskedEmail = `${local.slice(0, 2)}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
        return {
            valid: true,
            name: invitation.name,
            email_masked: maskedEmail,
            job_label: invitation.job_label
        };
    }

    async acceptInvitation(token, password) {
        const passwordCheck = validateStrongPassword(password);
        if (!passwordCheck.valid) {
            throw accessError('Password belum memenuhi syarat keamanan.', 400, 'WEAK_PASSWORD');
        }

        const connection = await this.db.getConnection();
        await connection.beginTransaction();
        let target;
        try {
            target = await this._findInvitation(connection, token, { forUpdate: true });
            const passwordHash = await this.bcrypt.hash(password, 12);
            const nextVersion = Number(target.access_version) + 1;
            await connection.query(
                `UPDATE users
                 SET password_hash = ?, is_active = 1, must_change_password = 0, updated_at = NOW()
                 WHERE new_id = ?`,
                [passwordHash, target.user_id]
            );
            await connection.query('UPDATE staff_access_invitations SET used_at = NOW(6) WHERE id = ?', [target.id]);
            await connection.query('UPDATE user_access_policies SET access_version = ? WHERE user_id = ?', [nextVersion, target.user_id]);
            await this._writeAudit(connection, {
                actorUserId: target.user_id,
                targetUserId: target.user_id,
                action: 'invitation_accepted',
                accessVersion: nextVersion,
                beforeState: { is_active: false },
                afterState: { is_active: true }
            });
            await connection.commit();
            return { accepted: true };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

const accessControlManagementService = new AccessControlManagementService();

module.exports = {
    ACCESS_MANAGEMENT_PERMISSIONS,
    INVITATION_TTL_HOURS,
    NON_DELEGABLE_PERMISSIONS,
    AccessControlManagementService,
    accessControlManagementService,
    assertAccessVersion,
    assertMutableStaffAccount,
    buildInvitationLink,
    deriveNavigationPermissions,
    getAccessTemplates,
    getDelegableCatalog,
    hashInvitationToken,
    normalizeJobLabel,
    resolveAccessTemplate,
    resolveSelectedPermissions,
    validateStrongPassword
};
