const BLOCKED_PATIENT_NAMES = new Set([
    'anisa suryaningsari'
]);

const BLOCKED_PATIENT_IPS = new Set(
    String(process.env.BLOCKED_PATIENT_IPS || '')
        .split(',')
        .map(normalizeIpAddress)
        .filter(Boolean)
);

const rememberedBlockedPatientIps = new Set();
let derivedIpCache = {
    loadedAt: 0,
    ips: new Set()
};

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
    return normalizedName.length > 0 && BLOCKED_PATIENT_NAMES.has(normalizedName);
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
        || rememberedBlockedPatientIps.has(normalizedIp)
        || derivedIpCache.ips.has(normalizedIp)
    );
}

function rememberBlockedPatientRequestIp(req) {
    const ipAddress = getRequestIp(req);
    if (ipAddress) {
        rememberedBlockedPatientIps.add(ipAddress);
    }
}

async function refreshDerivedBlockedIps() {
    const now = Date.now();
    if (now - derivedIpCache.loadedAt < DERIVED_IP_CACHE_TTL_MS) {
        return derivedIpCache.ips;
    }

    const db = require('../db');
    const blockedNames = Array.from(BLOCKED_PATIENT_NAMES);
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

async function isPatientRequestIpBlocked(req) {
    const ipAddress = getRequestIp(req);
    if (!ipAddress) return false;
    if (isPatientIpBlocked(ipAddress)) return true;

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
    rememberBlockedPatientRequestIp
};
