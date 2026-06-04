const SEEDED_PATIENT_NAMES = new Set([
    'anisa suryaningsari'
]);

const BLOCKED_PATIENT_IPS = new Set(
    String(process.env.BLOCKED_PATIENT_IPS || '')
        .split(',')
        .map(normalizeIpAddress)
        .filter(Boolean)
);

const PATIENT_AUTH_BLOCK_DERIVED_IPS = process.env.PATIENT_AUTH_BLOCK_DERIVED_IPS === 'true';
const PATIENT_AUTH_REMEMBER_BLOCKED_IPS = process.env.PATIENT_AUTH_REMEMBER_BLOCKED_IPS === 'true';

const rememberedBlockedPatientIps = new Set();
let tableReady = false;
let configuredBlocklistCache = {
    loadedAt: 0,
    names: new Set(),
    ips: new Set()
};
let derivedIpCache = {
    loadedAt: 0,
    ips: new Set()
};

const CONFIGURED_BLOCKLIST_CACHE_TTL_MS = 60 * 1000;
const DERIVED_IP_CACHE_TTL_MS = 5 * 60 * 1000;

const BLOCKED_PATIENT_MESSAGE = 'Akses akun tidak tersedia. Silakan hubungi klinik.';

function normalizePatientName(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeIpAddress(value) {
    const rawValue = String(value || '').split(',')[0].trim();
    if (!rawValue) return '';
    return rawValue.replace(/^::ffff:/, '');
}

function getRequestIp(req) {
    if (!req) return '';
    return normalizeIpAddress(
        req.headers?.['cf-connecting-ip']
        || req.headers?.['x-real-ip']
        || req.headers?.['x-forwarded-for']
        || req.ip
        || req.connection?.remoteAddress
        || req.socket?.remoteAddress
    );
}

function isPatientNameBlocked(value) {
    const normalizedName = normalizePatientName(value);
    return normalizedName.length > 0 && (
        configuredBlocklistCache.names.has(normalizedName)
    );
}

function isPatientIdentityBlocked(identity) {
    if (!identity || typeof identity !== 'object') return false;
    return isPatientNameBlocked(identity.name)
        || isPatientNameBlocked(identity.full_name)
        || isPatientNameBlocked(identity.fullname);
}

function isPatientIpBlocked(ipAddress) {
    const normalizedIp = normalizeIpAddress(ipAddress);
    return normalizedIp.length > 0 && (
        BLOCKED_PATIENT_IPS.has(normalizedIp)
        || configuredBlocklistCache.ips.has(normalizedIp)
        || (PATIENT_AUTH_REMEMBER_BLOCKED_IPS && rememberedBlockedPatientIps.has(normalizedIp))
        || (PATIENT_AUTH_BLOCK_DERIVED_IPS && derivedIpCache.ips.has(normalizedIp))
    );
}

function rememberBlockedPatientRequestIp(req) {
    if (!PATIENT_AUTH_REMEMBER_BLOCKED_IPS) return;

    const ipAddress = getRequestIp(req);
    if (ipAddress) {
        rememberedBlockedPatientIps.add(ipAddress);
    }
}

async function refreshDerivedBlockedIps() {
    if (!PATIENT_AUTH_BLOCK_DERIVED_IPS) {
        derivedIpCache = { loadedAt: Date.now(), ips: new Set() };
        return derivedIpCache.ips;
    }

    const now = Date.now();
    if (now - derivedIpCache.loadedAt < DERIVED_IP_CACHE_TTL_MS) {
        return derivedIpCache.ips;
    }

    const db = require('../db');
    const configuredBlocklist = await refreshConfiguredBlocklist();
    const blockedNames = Array.from(configuredBlocklist.names);
    if (blockedNames.length === 0) {
        derivedIpCache = { loadedAt: now, ips: new Set() };
        return derivedIpCache.ips;
    }

    const [rows] = await db.query(
        `SELECT DISTINCT pal.ip_address
         FROM patient_activity_log pal
         INNER JOIN patients p ON p.id = pal.patient_id
         WHERE LOWER(TRIM(p.full_name)) IN (?)
           AND pal.ip_address IS NOT NULL
           AND pal.ip_address <> ''`,
        [blockedNames]
    );

    derivedIpCache = {
        loadedAt: now,
        ips: new Set(rows.map(row => normalizeIpAddress(row.ip_address)).filter(Boolean))
    };

    return derivedIpCache.ips;
}

async function ensureBlocklistTable() {
    if (tableReady) return;

    const db = require('../db');
    await db.query(
        `CREATE TABLE IF NOT EXISTS patient_access_blocklist (
            id INT AUTO_INCREMENT PRIMARY KEY,
            block_type ENUM('name', 'ip') NOT NULL,
            value VARCHAR(255) NOT NULL,
            normalized_value VARCHAR(255) NOT NULL,
            reason VARCHAR(500) NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_by VARCHAR(64) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_patient_access_block (block_type, normalized_value),
            KEY idx_patient_access_active_type (is_active, block_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    for (const name of SEEDED_PATIENT_NAMES) {
        await db.query(
            `INSERT INTO patient_access_blocklist (block_type, value, normalized_value, reason, created_by)
             VALUES ('name', ?, ?, 'Seeded patient blocklist entry', 'system')
             ON DUPLICATE KEY UPDATE value = value`,
            [name, name]
        );
    }

    tableReady = true;
}

function normalizeBlocklistValue(blockType, value) {
    return blockType === 'ip' ? normalizeIpAddress(value) : normalizePatientName(value);
}

function clearBlocklistCaches() {
    configuredBlocklistCache = {
        loadedAt: 0,
        names: new Set(),
        ips: new Set()
    };
    derivedIpCache = {
        loadedAt: 0,
        ips: new Set()
    };
}

async function refreshConfiguredBlocklist() {
    const now = Date.now();
    if (now - configuredBlocklistCache.loadedAt < CONFIGURED_BLOCKLIST_CACHE_TTL_MS) {
        return configuredBlocklistCache;
    }

    await ensureBlocklistTable();

    const db = require('../db');
    const [rows] = await db.query(
        `SELECT block_type, normalized_value
         FROM patient_access_blocklist
         WHERE is_active = 1`
    );

    const names = new Set();
    const ips = new Set(BLOCKED_PATIENT_IPS);

    rows.forEach(row => {
        if (row.block_type === 'ip') {
            const ip = normalizeIpAddress(row.normalized_value);
            if (ip) ips.add(ip);
            return;
        }

        const name = normalizePatientName(row.normalized_value);
        if (name) names.add(name);
    });

    configuredBlocklistCache = {
        loadedAt: now,
        names,
        ips
    };

    return configuredBlocklistCache;
}

async function listBlocklistEntries() {
    await ensureBlocklistTable();
    const db = require('../db');
    const [rows] = await db.query(
        `SELECT id, block_type, value, normalized_value, reason, is_active, created_by, created_at, updated_at
         FROM patient_access_blocklist
         ORDER BY is_active DESC, updated_at DESC, id DESC`
    );
    return rows;
}

async function addBlocklistEntry({ blockType, value, reason, createdBy }) {
    await ensureBlocklistTable();

    const normalizedType = String(blockType || '').trim().toLowerCase();
    if (!['name', 'ip'].includes(normalizedType)) {
        throw new Error('Jenis block harus name atau ip');
    }

    const rawValue = String(value || '').trim();
    const normalizedValue = normalizeBlocklistValue(normalizedType, rawValue);
    if (!normalizedValue) {
        throw new Error('Nilai blocklist wajib diisi');
    }

    const db = require('../db');
    await db.query(
        `INSERT INTO patient_access_blocklist (block_type, value, normalized_value, reason, created_by, is_active)
         VALUES (?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
             value = VALUES(value),
             reason = VALUES(reason),
             created_by = VALUES(created_by),
             is_active = 1,
             updated_at = CURRENT_TIMESTAMP`,
        [normalizedType, rawValue, normalizedValue, reason || null, createdBy || null]
    );

    clearBlocklistCaches();
    return { block_type: normalizedType, value: rawValue, normalized_value: normalizedValue };
}

async function deactivateBlocklistEntry(id) {
    await ensureBlocklistTable();
    const db = require('../db');
    const [result] = await db.query(
        'UPDATE patient_access_blocklist SET is_active = 0 WHERE id = ?',
        [id]
    );
    clearBlocklistCaches();
    return result.affectedRows > 0;
}

async function isPatientRequestIpBlocked(req) {
    const ipAddress = getRequestIp(req);
    if (!ipAddress) return false;

    try {
        await refreshConfiguredBlocklist();
    } catch (err) {
        // Table creation/cache refresh failure must not break unrelated requests.
    }

    if (isPatientIpBlocked(ipAddress)) return true;

    if (!PATIENT_AUTH_BLOCK_DERIVED_IPS) return false;

    try {
        const derivedIps = await refreshDerivedBlockedIps();
        return derivedIps.has(ipAddress);
    } catch (err) {
        return false;
    }
}

module.exports = {
    BLOCKED_PATIENT_MESSAGE,
    normalizePatientName,
    normalizeIpAddress,
    getRequestIp,
    isPatientNameBlocked,
    isPatientIdentityBlocked,
    isPatientIpBlocked,
    isPatientRequestIpBlocked,
    rememberBlockedPatientRequestIp,
    ensureBlocklistTable,
    refreshConfiguredBlocklist,
    clearBlocklistCaches,
    listBlocklistEntries,
    addBlocklistEntry,
    deactivateBlocklistEntry
};
