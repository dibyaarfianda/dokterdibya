'use strict';

const {
    NEVER_GATED_FEATURES,
    GATED_FEATURES,
    assertGateable,
    isFeatureGated,
    getEntitlementSummary,
    hasEntitlement
} = require('../../services/PremiumEntitlements');

const NOW = new Date('2026-11-10T10:00:00+07:00');

function dbReturning(rows) {
    return { query: jest.fn().mockResolvedValue([rows]) };
}

describe('premium feature gating policy', () => {
    test('no clinical feature is ever on the gated list', () => {
        const overlap = GATED_FEATURES.filter(key => NEVER_GATED_FEATURES.includes(key));
        expect(overlap).toEqual([]);
    });

    test('clinical features are never gated and stay open without a package', async () => {
        for (const key of NEVER_GATED_FEATURES) {
            expect(isFeatureGated(key)).toBe(false);
        }
        const db = dbReturning([]);
        await expect(hasEntitlement('P0001', 'kick_counter', { db, now: NOW })).resolves.toBe(true);
        await expect(hasEntitlement('P0001', 'contraction_timer', { db, now: NOW })).resolves.toBe(true);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('keeps the clinical areas the patient portal already ships in the never-gated list', () => {
        expect(NEVER_GATED_FEATURES).toEqual(expect.arrayContaining([
            'kick_counter',
            'contraction_timer',
            'pregnancy_tracker',
            'appointments',
            'medical_records',
            'patient_documents',
            'medications',
            'billing'
        ]));
    });

    test('an unknown feature key is not gated either: only keys on the explicit list can be locked', () => {
        expect(isFeatureGated('something_new')).toBe(false);
    });
});

describe('getEntitlementSummary', () => {
    test('returns no package when the patient never bought one', async () => {
        const db = dbReturning([]);
        const summary = await getEntitlementSummary('P0001', { db, now: NOW });
        expect(summary).toEqual({ active: false, plan_code: null, starts_at: null, valid_until: null, days_left: 0 });
        expect(db.query.mock.calls[0][1]).toEqual(['P0001', NOW]);
    });

    test('reports the running period and the furthest end date across queued renewals', async () => {
        const db = dbReturning([
            { plan_code: 'kehamilan', starts_at: new Date('2026-10-01T00:00:00+07:00'), ends_at: new Date('2026-11-20T10:00:00+07:00') },
            { plan_code: 'kehamilan', starts_at: new Date('2026-11-20T10:00:00+07:00'), ends_at: new Date('2027-11-20T10:00:00+07:00') }
        ]);
        const summary = await getEntitlementSummary('P0001', { db, now: NOW });
        expect(summary.active).toBe(true);
        expect(summary.plan_code).toBe('kehamilan');
        expect(summary.valid_until.toISOString()).toBe(new Date('2027-11-20T10:00:00+07:00').toISOString());
        expect(summary.days_left).toBe(375);
    });

    test('a period that starts in the future is not active yet', async () => {
        const db = dbReturning([
            { plan_code: 'tahunan', starts_at: new Date('2026-12-01T00:00:00+07:00'), ends_at: new Date('2027-12-01T00:00:00+07:00') }
        ]);
        const summary = await getEntitlementSummary('P0001', { db, now: NOW });
        expect(summary.active).toBe(false);
    });
});

describe('hasEntitlement for a gated feature', () => {
    const gatedKey = 'test_only_gated_feature';

    test('requires an active package', async () => {
        const options = { now: NOW, gatedFeatures: [gatedKey] };
        await expect(hasEntitlement('P0001', gatedKey, { ...options, db: dbReturning([]) })).resolves.toBe(false);
        const active = dbReturning([{ plan_code: 'kehamilan', starts_at: new Date('2026-11-01T00:00:00+07:00'), ends_at: new Date('2027-01-01T00:00:00+07:00') }]);
        await expect(hasEntitlement('P0001', gatedKey, { ...options, db: active })).resolves.toBe(true);
    });

    test('a feature that is not on the list stays open even without a package', async () => {
        const db = dbReturning([]);
        await expect(hasEntitlement('P0001', 'other_feature', { db, now: NOW, gatedFeatures: [gatedKey] })).resolves.toBe(true);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('refuses to gate a clinical feature', () => {
        expect(() => assertGateable(['kick_counter'])).toThrow(/klinis/i);
        expect(() => assertGateable([gatedKey])).not.toThrow();
    });
});
