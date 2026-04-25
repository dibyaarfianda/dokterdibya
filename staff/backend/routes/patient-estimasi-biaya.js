/**
 * Patient Estimasi Biaya Route
 * Patient-facing endpoint for viewing pregnancy cost estimates.
 * Currently restricted to tester patient P2025091.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const cache = require('../utils/cache');
const logger = require('../utils/logger');
const { sendSuccess, sendError } = require('../utils/response');
const { verifyPatientToken } = require('../middleware/auth');

const SETTINGS_KEY = 'pregnancy_cost_estimate_medications';
const TRIMESTERS = ['t1', 't2', 't3'];

// Tester allowlist — remove or expand after approval
const TESTER_IDS = ['P2025091'];

// All routes require patient authentication
router.use(verifyPatientToken);

// No-cache headers for all GET responses
router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

async function loadStoredConfig() {
    const cacheKey = `estimasi-biaya:${SETTINGS_KEY}`;
    const cached = cache.get(cacheKey, 'medium');
    if (cached) {
        return cached;
    }

    const [rows] = await db.query(
        'SELECT setting_value FROM settings WHERE setting_key = ? LIMIT 1',
        [SETTINGS_KEY]
    );

    if (!rows.length || !rows[0].setting_value) {
        return {
            version: 1,
            updated_at: null,
            trimester_configs: { t1: [], t2: [], t3: [] }
        };
    }

    let parsed = null;
    try {
        parsed = JSON.parse(rows[0].setting_value);
    } catch (_e) {
        parsed = null;
    }

    if (!parsed || typeof parsed !== 'object') {
        return {
            version: 1,
            updated_at: null,
            trimester_configs: { t1: [], t2: [], t3: [] }
        };
    }

    // Normalize and cache
    const tc = parsed.trimester_configs && typeof parsed.trimester_configs === 'object'
        ? parsed.trimester_configs
        : {};

    const normalized = {
        version: 1,
        updated_at: parsed.updated_at || null,
        trimester_configs: {
            t1: Array.isArray(tc.t1) ? tc.t1 : [],
            t2: Array.isArray(tc.t2) ? tc.t2 : [],
            t3: Array.isArray(tc.t3) ? tc.t3 : []
        }
    };

    cache.set(cacheKey, normalized, 'medium');
    return normalized;
}

async function buildResponseConfig() {
    const config = await loadStoredConfig();

    const obatIds = Array.from(new Set(
        TRIMESTERS.flatMap((t) => (config.trimester_configs[t] || [])
            .map((item) => Number(item.obat_id))
            .filter(Boolean))
    ));

    let medicationMap = new Map();
    if (obatIds.length) {
        const placeholders = obatIds.map(() => '?').join(', ');
        const [rows] = await db.query(
            `SELECT id, code, name, category, price, unit, is_active
             FROM obat
             WHERE id IN (${placeholders})`,
            obatIds
        );
        medicationMap = new Map(rows.map((row) => [Number(row.id), row]));
    }

    const trimesterConfigs = {};
    TRIMESTERS.forEach((t) => {
        trimesterConfigs[t] = (config.trimester_configs[t] || [])
            .map((item) => {
                const med = medicationMap.get(Number(item.obat_id));
                if (!med || Number(med.is_active) !== 1) return null;
                const price = Number(med.price) || 0;
                return {
                    obat_id: Number(med.id),
                    quantity: item.quantity,
                    medication: {
                        id: Number(med.id),
                        code: med.code,
                        name: med.name,
                        category: med.category,
                        price,
                        unit: med.unit || 'pcs'
                    },
                    subtotal: price * item.quantity
                };
            })
            .filter(Boolean);
    });

    return {
        version: 1,
        updated_at: config.updated_at,
        trimester_configs: trimesterConfigs
    };
}

/**
 * GET /api/patient/estimasi-biaya
 * Returns pregnancy cost estimate config for tester patient only.
 */
router.get('/', async (req, res) => {
    const patientId = req.user.id;

    // Tester guard
    if (!TESTER_IDS.includes(patientId)) {
        return sendError(res, 'Fitur ini belum tersedia untuk akun Anda', 403);
    }

    try {
        const responseConfig = await buildResponseConfig();
        return sendSuccess(res, { config: responseConfig });
    } catch (error) {
        logger.error('[PatientEstimasiBiaya] Fetch config failed', {
            patientId,
            error: error.message
        });
        return sendError(res, 'Gagal mengambil estimasi biaya', 500);
    }
});

module.exports = router;
