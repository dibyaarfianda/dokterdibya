'use strict';

/**
 * Premium package entitlements.
 *
 * Rule from Boss: clinical features are never locked behind a paid package.
 * NEVER_GATED_FEATURES lists the clinical areas of the patient portal; GATED_FEATURES is the
 * explicit list of non-clinical features a package unlocks. A key can be in only one of them, and
 * assertGateable() runs at load time, so adding a clinical key to GATED_FEATURES stops the server
 * from booting instead of silently locking a patient out of care.
 */


const NEVER_GATED_FEATURES = Object.freeze([
    'kick_counter',
    'contraction_timer',
    'pregnancy_tracker',
    'appointments',
    'medical_records',
    'patient_documents',
    'patient_intake',
    'medications',
    'birth_report',
    'billing'
]);

// Add a key here when a non-clinical premium feature ships (it must not be a clinical area above).
const GATED_FEATURES = Object.freeze([]);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function assertGateable(featureKeys) {
    const clinical = featureKeys.filter(key => NEVER_GATED_FEATURES.includes(key));
    if (clinical.length) {
        throw new Error(`Fitur klinis tidak boleh dikunci paket premium: ${clinical.join(', ')}`);
    }
}

assertGateable(GATED_FEATURES);

function isFeatureGated(featureKey, gatedFeatures = GATED_FEATURES) {
    if (NEVER_GATED_FEATURES.includes(featureKey)) return false;
    return gatedFeatures.includes(featureKey);
}

/**
 * Summary of the patient's packages. Every purchase is its own period (a renewal starts when the
 * previous one ends), so "active" means a period that has started and not ended, and valid_until is
 * the furthest end date including renewals that are still queued.
 */
async function getEntitlementSummary(patientId, { db = require('../db'), now = new Date() } = {}) {
    const [rows] = await db.query(
        `SELECT plan_code, starts_at, ends_at
           FROM patient_entitlements
          WHERE patient_id = ? AND ends_at > ?
          ORDER BY starts_at ASC`,
        [patientId, now]
    );

    const periods = (rows || []).map(row => ({
        plan_code: row.plan_code,
        starts_at: new Date(row.starts_at),
        ends_at: new Date(row.ends_at)
    }));
    const running = periods.find(period => period.starts_at <= now);
    if (!running) {
        return { active: false, plan_code: null, starts_at: null, valid_until: null, days_left: 0 };
    }

    const validUntil = periods.reduce((latest, period) => (period.ends_at > latest ? period.ends_at : latest), running.ends_at);
    return {
        active: true,
        plan_code: running.plan_code,
        starts_at: running.starts_at,
        valid_until: validUntil,
        days_left: Math.max(0, Math.ceil((validUntil - now) / MS_PER_DAY))
    };
}

async function hasEntitlement(patientId, featureKey, options = {}) {
    const gated = options.gatedFeatures || GATED_FEATURES;
    if (!isFeatureGated(featureKey, gated)) return true;
    const summary = await getEntitlementSummary(patientId, options);
    return summary.active;
}

module.exports = {
    NEVER_GATED_FEATURES,
    GATED_FEATURES,
    assertGateable,
    isFeatureGated,
    getEntitlementSummary,
    hasEntitlement
};
