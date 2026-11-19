'use strict';

const { createPatientReviewAccountService } = require('../../services/PatientReviewAccountService');

const NOW = new Date('2026-11-18T10:00:00+07:00');
const PATIENT = { id: 'P2026001', full_name: 'AKUN UJI DUITKU', email: 'uji@example.com', phone: '081234567890', birth_date: '1995-05-10', status: 'active', profile_completed: 1, intake_completed: 1 };

function reviewRow(overrides = {}) {
    return { id: 1, patient_id: PATIENT.id, password_hash: 'hash:correct-password', label: 'Duitku review', expires_at: new Date(NOW.getTime() + 86400000), revoked_at: null, last_login_at: null, login_count: 0, ...overrides };
}

function setup({ patient = PATIENT, review = reviewRow(), missingTable = false } = {}) {
    const db = {
        query: jest.fn(async (sql, params) => {
            if (/FROM patients WHERE email = \?/.test(sql)) return [patient && patient.email === params[0] ? [patient] : []];
            if (/FROM patient_review_accounts WHERE patient_id = \?/.test(sql)) {
                if (missingTable) throw Object.assign(new Error("Table doesn't exist"), { code: 'ER_NO_SUCH_TABLE' });
                return [review && review.patient_id === params[0] ? [review] : []];
            }
            if (/^UPDATE patient_review_accounts SET last_login_at/.test(sql)) return [{}];
            throw new Error(`unexpected SQL ${sql}`);
        })
    };
    const hasher = {
        hash: jest.fn(async value => `hash:${value}`),
        compare: jest.fn(async (password, hash) => hash === `hash:${password}`)
    };
    const service = createPatientReviewAccountService({ db, hasher, clock: () => NOW });
    return { service, db, hasher };
}

describe('authenticate', () => {
    test('accepts the right password of an active review account', async () => {
        const { service } = setup();
        const result = await service.authenticate(' UJI@example.com ', 'correct-password');
        expect(result.status).toBe('ok');
        expect(result.patient.id).toBe(PATIENT.id);
    });

    test('a wrong password is invalid', async () => {
        const { service } = setup();
        await expect(service.authenticate(PATIENT.email, 'wrong')).resolves.toEqual({ status: 'invalid' });
    });

    test('an unknown email still runs one bcrypt compare and answers like a wrong password', async () => {
        const { service, hasher } = setup({ patient: null });
        await expect(service.authenticate('nobody@example.com', 'anything')).resolves.toEqual({ status: 'invalid' });
        expect(hasher.compare).toHaveBeenCalledTimes(1);
    });

    test('a real patient without a review row cannot log in with a password', async () => {
        const { service, hasher } = setup({ review: null });
        await expect(service.authenticate(PATIENT.email, 'correct-password')).resolves.toEqual({ status: 'invalid' });
        expect(hasher.compare).toHaveBeenCalledTimes(1);
    });

    test.each([
        ['expired', { expires_at: new Date(NOW.getTime() - 1000) }, 'expired'],
        ['revoked', { revoked_at: new Date(NOW.getTime() - 1000) }, 'revoked']
    ])('reports %s only after the password matched', async (_name, overrides, status) => {
        const { service } = setup({ review: reviewRow(overrides) });
        await expect(service.authenticate(PATIENT.email, 'wrong')).resolves.toEqual({ status: 'invalid' });
        await expect(service.authenticate(PATIENT.email, 'correct-password')).resolves.toEqual({ status });
    });

    test('a suspended patient cannot use the review login', async () => {
        const { service } = setup({ patient: { ...PATIENT, status: 'suspended' } });
        await expect(service.authenticate(PATIENT.email, 'correct-password')).resolves.toEqual({ status: 'inactive' });
    });

    test('works as "no review account" when the migration has not run', async () => {
        const { service } = setup({ missingTable: true });
        await expect(service.authenticate(PATIENT.email, 'correct-password')).resolves.toEqual({ status: 'invalid' });
    });
});

describe('isActiveReviewPatient', () => {
    test.each([
        ['an active account', {}, true],
        ['an expired account', { expires_at: new Date(NOW.getTime() - 1) }, false],
        ['a revoked account', { revoked_at: NOW }, false]
    ])('%s -> %s', async (_name, overrides, expected) => {
        const { service } = setup({ review: reviewRow(overrides) });
        await expect(service.isActiveReviewPatient(PATIENT.id)).resolves.toBe(expected);
    });

    test('a patient without a review row, a missing id, or a missing table is not a reviewer', async () => {
        await expect(setup({ review: null }).service.isActiveReviewPatient(PATIENT.id)).resolves.toBe(false);
        await expect(setup().service.isActiveReviewPatient('')).resolves.toBe(false);
        await expect(setup({ missingTable: true }).service.isActiveReviewPatient(PATIENT.id)).resolves.toBe(false);
    });
});

test('recordLogin stamps the login time and counts logins', async () => {
    const { service, db } = setup();
    await service.recordLogin(PATIENT.id);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('login_count = login_count + 1'), [NOW, PATIENT.id]);
});
