const express = require('express');
const router = express.Router();
const db = require('../db');
const cache = require('../utils/cache');
const { verifyToken, requirePermission } = require('../middleware/auth');

const SETTINGS_KEY = 'pregnancy_cost_estimate_medications';
const TRIMESTERS = ['t1', 't2', 't3'];

function buildDefaultConfig() {
    return {
        version: 1,
        updated_at: null,
        trimester_configs: {
            t1: [],
            t2: [],
            t3: []
        },
        trimester_tindakan_configs: {
            t1: [],
            t2: [],
            t3: []
        }
    };
}

function normalizeMedicationItems(items) {
    if (!Array.isArray(items)) return [];

    const seen = new Set();

    return items
        .map((item) => {
            const obatId = Number(item?.obat_id ?? item?.obatId);
            const quantity = Number(item?.quantity ?? item?.qty ?? 3);

            return {
                obat_id: Number.isInteger(obatId) && obatId > 0 ? obatId : null,
                quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 3
            };
        })
        .filter((item) => item.obat_id)
        .filter((item) => {
            const key = String(item.obat_id);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function normalizeServiceItems(items) {
    if (!Array.isArray(items)) return [];

    const seen = new Set();

    return items
        .map((item) => {
            const tindakanId = Number(item?.tindakan_id ?? item?.tindakanId);
            const quantity = Number(item?.quantity ?? item?.qty ?? 1);

            return {
                tindakan_id: Number.isInteger(tindakanId) && tindakanId > 0 ? tindakanId : null,
                quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 1
            };
        })
        .filter((item) => item.tindakan_id)
        .filter((item) => {
            const key = String(item.tindakan_id);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function normalizeConfig(rawConfig) {
    const source = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
    const rawTrimesterConfigs = source.trimester_configs && typeof source.trimester_configs === 'object'
        ? source.trimester_configs
        : {};
    const rawTrimesterTindakanConfigs = source.trimester_tindakan_configs && typeof source.trimester_tindakan_configs === 'object'
        ? source.trimester_tindakan_configs
        : {};

    return {
        version: 1,
        updated_at: source.updated_at || null,
        trimester_configs: {
            t1: normalizeMedicationItems(rawTrimesterConfigs.t1),
            t2: normalizeMedicationItems(rawTrimesterConfigs.t2),
            t3: normalizeMedicationItems(rawTrimesterConfigs.t3)
        },
        trimester_tindakan_configs: {
            t1: normalizeServiceItems(rawTrimesterTindakanConfigs.t1),
            t2: normalizeServiceItems(rawTrimesterTindakanConfigs.t2),
            t3: normalizeServiceItems(rawTrimesterTindakanConfigs.t3)
        }
    };
}

async function loadStoredConfig() {
    const cached = cache.get(`estimasi-biaya:${SETTINGS_KEY}`, 'medium');
    if (cached) {
        return cached;
    }

    const [rows] = await db.query(
        'SELECT setting_value FROM settings WHERE setting_key = ? LIMIT 1',
        [SETTINGS_KEY]
    );

    if (!rows.length || !rows[0].setting_value) {
        const defaultConfig = buildDefaultConfig();
        cache.set(`estimasi-biaya:${SETTINGS_KEY}`, defaultConfig, 'medium');
        return defaultConfig;
    }

    let parsed = null;
    try {
        parsed = JSON.parse(rows[0].setting_value);
    } catch (error) {
        parsed = null;
    }

    const normalized = normalizeConfig(parsed);
    cache.set(`estimasi-biaya:${SETTINGS_KEY}`, normalized, 'medium');
    return normalized;
}

async function loadMedicationMap(obatIds) {
    if (!obatIds.length) {
        return new Map();
    }

    const placeholders = obatIds.map(() => '?').join(', ');
    const [rows] = await db.query(
        `SELECT id, code, name, category, price, unit, is_active
         FROM obat
         WHERE id IN (${placeholders})`,
        obatIds
    );

    return new Map(rows.map((row) => [Number(row.id), row]));
}

async function loadServiceMap(tindakanIds) {
    if (!tindakanIds.length) {
        return new Map();
    }

    const placeholders = tindakanIds.map(() => '?').join(', ');
    const [rows] = await db.query(
        `SELECT id, code, name, category, price, is_active
         FROM tindakan
         WHERE id IN (${placeholders})`,
        tindakanIds
    );

    return new Map(rows.map((row) => [Number(row.id), row]));
}

async function buildResponseConfig() {
    const config = await loadStoredConfig();
    const obatIds = Array.from(new Set(
        TRIMESTERS.flatMap((trimester) => (config.trimester_configs[trimester] || []).map((item) => item.obat_id))
    ));
    const tindakanIds = Array.from(new Set(
        TRIMESTERS.flatMap((trimester) => (config.trimester_tindakan_configs[trimester] || []).map((item) => item.tindakan_id))
    ));

    const medicationMap = await loadMedicationMap(obatIds);
    const serviceMap = await loadServiceMap(tindakanIds);
    const trimesterConfigs = {};
    const trimesterTindakanConfigs = {};

    TRIMESTERS.forEach((trimester) => {
        trimesterConfigs[trimester] = (config.trimester_configs[trimester] || [])
            .map((item) => {
                const medication = medicationMap.get(Number(item.obat_id));
                if (!medication || Number(medication.is_active) !== 1) {
                    return null;
                }

                return {
                    obat_id: Number(medication.id),
                    quantity: item.quantity,
                    medication: {
                        id: Number(medication.id),
                        code: medication.code,
                        name: medication.name,
                        category: medication.category,
                        price: Number(medication.price) || 0,
                        unit: medication.unit || 'pcs'
                    },
                    subtotal: (Number(medication.price) || 0) * item.quantity
                };
            })
            .filter(Boolean);

        trimesterTindakanConfigs[trimester] = (config.trimester_tindakan_configs[trimester] || [])
            .map((item) => {
                const tindakan = serviceMap.get(Number(item.tindakan_id));
                if (!tindakan || Number(tindakan.is_active) !== 1) {
                    return null;
                }

                return {
                    tindakan_id: Number(tindakan.id),
                    quantity: item.quantity,
                    tindakan: {
                        id: Number(tindakan.id),
                        code: tindakan.code,
                        name: tindakan.name,
                        category: tindakan.category,
                        price: Number(tindakan.price) || 0
                    },
                    subtotal: (Number(tindakan.price) || 0) * item.quantity
                };
            })
            .filter(Boolean);
    });

    return {
        version: 1,
        updated_at: config.updated_at,
        trimester_configs: trimesterConfigs,
        trimester_tindakan_configs: trimesterTindakanConfigs
    };
}

router.get('/', verifyToken, requirePermission('obat_alkes.view'), async (req, res) => {
    try {
        const responseConfig = await buildResponseConfig();
        res.json({
            success: true,
            config: responseConfig
        });
    } catch (error) {
        console.error('Get estimasi biaya config error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil konfigurasi estimasi biaya'
        });
    }
});

router.put('/', verifyToken, requirePermission('obat_alkes.edit'), async (req, res) => {
    try {
        const submittedConfig = normalizeConfig(req.body || {});
        submittedConfig.updated_at = new Date().toISOString();

        await db.query(
            `INSERT INTO settings (setting_key, setting_value, description)
             VALUES (?, ?, 'Selected medications and services for staff and patient pregnancy cost estimate')
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), description = VALUES(description)`,
            [SETTINGS_KEY, JSON.stringify(submittedConfig)]
        );

        cache.del(`estimasi-biaya:${SETTINGS_KEY}`);
        cache.delPattern('obat:');
        cache.delPattern('tindakan:');

        const responseConfig = await buildResponseConfig();

        res.json({
            success: true,
            message: 'Konfigurasi estimasi biaya berhasil disimpan',
            config: responseConfig
        });
    } catch (error) {
        console.error('Save estimasi biaya config error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menyimpan konfigurasi estimasi biaya'
        });
    }
});

router.get('/public', async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        const responseConfig = await buildResponseConfig();
        res.json({
            success: true,
            config: responseConfig
        });
    } catch (error) {
        console.error('Get public estimasi biaya config error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data estimasi biaya'
        });
    }
});

module.exports = router;