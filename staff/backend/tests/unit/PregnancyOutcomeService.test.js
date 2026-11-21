'use strict';

const {
    createPregnancyOutcomeService,
    PregnancyOutcomeError,
    OUTCOME_TYPES
} = require('../../services/PregnancyOutcomeService');

function makeDb({ patient = true, hpht = null, edd = null, insertId = 7, voidAffected = 1 } = {}) {
    const calls = [];
    const db = {
        calls,
        async query(sql, params) {
            calls.push({ sql, params });
            if (sql.includes('FROM patients')) return [patient ? [{ id: 'P1' }] : []];
            if (sql.includes('sunday_clinic_records')) return [hpht ? [{ hpht }] : []];
            if (sql.includes("record_type = 'usg'")) return [edd ? [{ record_data: JSON.stringify({ edd }) }] : []];
            if (sql.includes('INSERT INTO pregnancy_outcomes')) return [{ insertId }];
            if (sql.includes('UPDATE pregnancy_outcomes')) return [{ affectedRows: voidAffected }];
            throw new Error('unexpected sql: ' + sql);
        }
    };
    return db;
}

const NOW = () => new Date(2026, 10, 21, 10, 0, 0);

async function expectError(promise, status, message) {
    let err;
    try { await promise; } catch (e) { err = e; }
    expect(err).toBeInstanceOf(PregnancyOutcomeError);
    expect(err.status).toBe(status);
    expect(err.message).toBe(message);
}

describe('PregnancyOutcomeService.record', () => {
    test('exports outcome types', () => {
        expect(OUTCOME_TYPES).toEqual(['keguguran', 'lahir_mati']);
    });

    test('rejects invalid type', async () => {
        const svc = createPregnancyOutcomeService({ db: makeDb(), now: NOW });
        await expectError(svc.record('P1', { outcome_type: 'aborsi', event_date: '2026-07-10' }, 's1'), 400, 'Jenis kejadian tidak valid');
    });

    test('rejects invalid or missing date', async () => {
        const svc = createPregnancyOutcomeService({ db: makeDb(), now: NOW });
        await expectError(svc.record('P1', { outcome_type: 'keguguran', event_date: '2026-13-01' }, 's1'), 400, 'Tanggal kejadian tidak valid');
        await expectError(svc.record('P1', { outcome_type: 'keguguran' }, 's1'), 400, 'Tanggal kejadian tidak valid');
    });

    test('rejects future date, allows today', async () => {
        const db = makeDb({ hpht: '2026-10-01' });
        const svc = createPregnancyOutcomeService({ db, now: NOW });
        await expectError(svc.record('P1', { outcome_type: 'keguguran', event_date: '2026-11-22' }, 's1'), 400, 'Tanggal kejadian tidak boleh di masa depan');
        const res = await svc.record('P1', { outcome_type: 'keguguran', event_date: '2026-11-21' }, 's1');
        expect(res).toEqual({ id: 7, outcome_type: 'keguguran', event_date: '2026-11-21' });
    });

    test('note over 500 chars rejected; trimmed; empty becomes null', async () => {
        const db = makeDb({ hpht: '2026-05-01' });
        const svc = createPregnancyOutcomeService({ db, now: NOW });
        await expectError(svc.record('P1', { outcome_type: 'keguguran', event_date: '2026-07-10', note: 'x'.repeat(501) }, 's1'), 400, 'Catatan maksimal 500 karakter');
        await svc.record('P1', { outcome_type: 'keguguran', event_date: '2026-07-10', note: '  halo  ' }, 's1');
        await svc.record('P1', { outcome_type: 'keguguran', event_date: '2026-07-10', note: '   ' }, 's1');
        const inserts = db.calls.filter(c => c.sql.includes('INSERT INTO pregnancy_outcomes'));
        expect(inserts[0].params[3]).toBe('halo');
        expect(inserts[1].params[3]).toBeNull();
    });

    test('unknown patient -> 404', async () => {
        const svc = createPregnancyOutcomeService({ db: makeDb({ patient: false }), now: NOW });
        await expectError(svc.record('P1', { outcome_type: 'keguguran', event_date: '2026-07-10' }, 's1'), 404, 'Pasien tidak ditemukan');
    });

    test('no HPHT source -> 400', async () => {
        const svc = createPregnancyOutcomeService({ db: makeDb(), now: NOW });
        await expectError(svc.record('P1', { outcome_type: 'keguguran', event_date: '2026-07-10' }, 's1'), 400, 'Pasien tidak punya data kehamilan (HPHT/HPL)');
    });

    test('event earlier than HPHT -> 400', async () => {
        const svc = createPregnancyOutcomeService({ db: makeDb({ hpht: '2026-10-01' }), now: NOW });
        await expectError(svc.record('P1', { outcome_type: 'keguguran', event_date: '2026-09-01' }, 's1'), 400, 'Tanggal kejadian lebih awal dari HPHT kehamilan ini');
    });

    test('USG EDD only: derives HPHT and inserts', async () => {
        const db = makeDb({ edd: '2027-02-05' });
        const svc = createPregnancyOutcomeService({ db, now: NOW });
        const res = await svc.record('P1', { outcome_type: 'keguguran', event_date: '2026-07-10', note: ' ' }, 'staff9');
        expect(res).toEqual({ id: 7, outcome_type: 'keguguran', event_date: '2026-07-10' });
        const ins = db.calls.find(c => c.sql.includes('INSERT INTO pregnancy_outcomes'));
        expect(ins.params).toEqual(['P1', 'keguguran', '2026-07-10', null, 'staff9']);
    });

    test('accepts when only one of two sources is ended by the event', async () => {
        // anamnesa HPHT 2026-10-01 is later than event; USG gives HPHT 2026-05-01
        const db = makeDb({ hpht: '2026-10-01', edd: '2027-02-05' });
        const svc = createPregnancyOutcomeService({ db, now: NOW });
        const res = await svc.record('P1', { outcome_type: 'lahir_mati', event_date: '2026-09-01' }, 's1');
        expect(res.outcome_type).toBe('lahir_mati');
    });

    test('never touches birth_congratulations', async () => {
        const db = makeDb({ hpht: '2026-05-01' });
        const svc = createPregnancyOutcomeService({ db, now: NOW });
        await svc.record('P1', { outcome_type: 'keguguran', event_date: '2026-07-10' }, 's1');
        await svc.voidOutcome('P1', 7, 's1');
        expect(db.calls.some(c => c.sql.includes('birth_congratulations'))).toBe(false);
    });
});

describe('PregnancyOutcomeService.voidOutcome', () => {
    test('voids only the given id for the patient', async () => {
        const db = makeDb();
        const svc = createPregnancyOutcomeService({ db, now: NOW });
        await svc.voidOutcome('P1', 5, 'staff9');
        expect(db.calls).toHaveLength(1);
        expect(db.calls[0].sql.replace(/\s+/g, ' ').trim()).toBe(
            'UPDATE pregnancy_outcomes SET voided_at = NOW(), voided_by = ? WHERE id = ? AND patient_id = ? AND voided_at IS NULL'
        );
        expect(db.calls[0].params).toEqual(['staff9', 5, 'P1']);
    });

    test('affectedRows 0 -> 404', async () => {
        const svc = createPregnancyOutcomeService({ db: makeDb({ voidAffected: 0 }), now: NOW });
        await expectError(svc.voidOutcome('P1', 5, 's1'), 404, 'Penandaan tidak ditemukan');
    });
});
