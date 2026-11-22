'use strict';

const { createPatientPregnancyReportService } = require('../../services/PatientPregnancyReportService');
const { PatientReportError } = require('../../services/PatientPregnancyReportRules');
const { PregnancyEpisodeError } = require('../../services/PregnancyEpisodeService');
const { ROLE_IDS } = require('../../constants/roles');

const NOW = () => new Date(2026, 10, 22, 10, 0, 0); // 22 Nov 2026 local
const STALE = 'Data kehamilan sudah berubah. Muat ulang halaman.';

/** Fake db: SELECT pregnancies (any form) and UPDATE pregnancies, recording every statement. */
function makeDb(rows) {
    const state = { rows: rows.map(r => ({ ...r })), sql: [], updates: [], tx: { begin: 0, commit: 0, rollback: 0, release: 0 } };
    async function query(sql, params = []) {
        state.sql.push(sql);
        if (/^SELECT[\s\S]*FROM pregnancies WHERE patient_id = \?/.test(sql)) {
            return [state.rows.filter(r => r.patient_id === params[0]).map(r => ({ ...r }))];
        }
        if (/^UPDATE pregnancies SET/.test(sql)) {
            state.updates.push({ sql, params });
            return [{ affectedRows: 1 }];
        }
        throw new Error('unexpected sql: ' + sql);
    }
    const conn = {
        query,
        async beginTransaction() { state.tx.begin++; },
        async commit() { state.tx.commit++; },
        async rollback() { state.tx.rollback++; },
        release() { state.tx.release++; }
    };
    return { state, query, async getConnection() { return conn; } };
}

const preg = (over = {}) => ({
    id: 1, patient_id: 'P1', sequence: 1, source: 'clinic', status: 'ongoing', hpht: '2026-01-01', hpl: '2026-10-08',
    outcome: null, ended_on: null, report_snoozed_until: null, ended_by_patient: 0, ...over
});
const svc = db => createPatientPregnancyReportService({ db, now: NOW });
const BIDAN = { id: 'u2', role_id: ROLE_IDS.BIDAN };

async function expectErr(promise, Cls, status, message) {
    let err;
    try { await promise; } catch (e) { err = e; }
    expect(err).toBeInstanceOf(Cls);
    expect(err.status).toBe(status);
    if (message) expect(err.message).toBe(message);
}

describe('status', () => {
    test('asks when past HPL and not snoozed', async () => {
        expect(await svc(makeDb([preg()])).status('P1')).toEqual({ ask: true, hpht: '2026-01-01' });
    });
    test('does not ask before HPL', async () => {
        const r = await svc(makeDb([preg({ hpht: '2026-08-01', hpl: '2027-05-08' })])).status('P1');
        expect(r.ask).toBe(false);
    });
    test('does not ask while snoozed, asks again after', async () => {
        expect((await svc(makeDb([preg({ report_snoozed_until: '2026-11-25' })])).status('P1')).ask).toBe(false);
        expect((await svc(makeDb([preg({ report_snoozed_until: '2026-11-21' })])).status('P1')).ask).toBe(true);
    });
    test('no ongoing row -> ask false, hpht null; takes no lock', async () => {
        const db = makeDb([preg({ status: 'ended' })]);
        expect(await svc(db).status('P1')).toEqual({ ask: false, hpht: null });
        expect(db.state.sql.every(s => !/FOR UPDATE/.test(s))).toBe(true);
    });
    test('uses the newest ongoing row only', async () => {
        const db = makeDb([preg({ id: 1, sequence: 1 }), preg({ id: 2, sequence: 2, hpht: '2026-08-01', hpl: '2027-05-08' })]);
        expect((await svc(db).status('P1')).ask).toBe(false);
    });
});

describe('submit', () => {
    const birth = { answer: 'lahir_sehat', ended_on: '2026-10-10', place: 'RSIA Melinda', delivery: 'normal', babies: [{ weight_g: 3100 }] };

    test('closes only the newest ongoing row', async () => {
        const db = makeDb([preg({ id: 1, sequence: 1 }), preg({ id: 2, sequence: 2 })]);
        expect(await svc(db).submit('P1', birth)).toEqual({ closed: true });
        expect(db.state.updates).toHaveLength(1);
        const u = db.state.updates[0];
        expect(u.params[u.params.length - 1]).toBe(2);
        expect(u.sql).toMatch(/AND status = 'ongoing'/);
        expect(u.params).toEqual(expect.arrayContaining(['ended', 'lahir_hidup', 'patient:P1', 'Dilaporkan pasien', 'Spt B (Spontan)']));
        expect(db.state.sql.some(s => /FOR UPDATE/.test(s))).toBe(true);
        expect(db.state.tx).toEqual({ begin: 1, commit: 1, rollback: 0, release: 1 });
    });
    test('no ongoing row -> 409, no UPDATE, rolled back', async () => {
        const db = makeDb([preg({ status: 'ended' })]);
        await expectErr(svc(db).submit('P1', birth), PatientReportError, 409, STALE);
        expect(db.state.updates).toHaveLength(0);
        expect(db.state.tx.rollback).toBe(1);
        expect(db.state.tx.commit).toBe(0);
        expect(db.state.tx.release).toBe(1);
    });
    test('not past HPL -> 409, no UPDATE', async () => {
        const db = makeDb([preg({ hpht: '2026-08-01', hpl: '2027-05-08' })]);
        await expectErr(svc(db).submit('P1', { ...birth, ended_on: '2026-09-01' }), PatientReportError, 409, STALE);
        expect(db.state.updates).toHaveLength(0);
    });
    test('snooze does not block an answer (ruling R1)', async () => {
        const db = makeDb([preg({ report_snoozed_until: '2026-11-28' })]);
        expect(await svc(db).submit('P1', birth)).toEqual({ closed: true });
        expect(db.state.updates).toHaveLength(1);
    });
    test('masih_hamil writes only the snooze (today + 7)', async () => {
        const db = makeDb([preg()]);
        expect(await svc(db).submit('P1', { answer: 'masih_hamil' })).toEqual({ snoozed: true });
        expect(db.state.updates).toHaveLength(1);
        const u = db.state.updates[0];
        expect(u.sql).toMatch(/SET report_snoozed_until = \? WHERE id = \?/);
        expect(u.params).toEqual(['2026-11-29', 1]);
    });
    test('masih_hamil with stale state -> 409', async () => {
        const db = makeDb([preg({ hpht: '2026-08-01', hpl: '2027-05-08' })]);
        await expectErr(svc(db).submit('P1', { answer: 'masih_hamil' }), PatientReportError, 409, STALE);
        expect(db.state.updates).toHaveLength(0);
    });
    test('invalid body -> 400, rolled back, no UPDATE', async () => {
        const db = makeDb([preg()]);
        await expectErr(svc(db).submit('P1', { answer: 'lahir_sehat', ended_on: '2026-10-10' }), PatientReportError, 400);
        expect(db.state.updates).toHaveLength(0);
        expect(db.state.tx.rollback).toBe(1);
    });
    test('future ended_on rejected using the local calendar day of now()', async () => {
        const db = makeDb([preg()]);
        await expectErr(svc(db).submit('P1', { ...birth, ended_on: '2026-11-23' }), PatientReportError, 400);
    });
});

describe('reopen', () => {
    const patientReported = (over = {}) => preg({ id: 5, status: 'ended', ended_by_patient: 1, outcome: 'lahir_hidup', ended_on: '2026-10-10', ...over });

    test('bidan resets columns and snoozes', async () => {
        const db = makeDb([patientReported()]);
        const result = await svc(db).reopen('P1', 5, BIDAN);
        expect(result).toEqual({ pregnancy_id: 5 });
        expect(db.state.updates).toHaveLength(1);
        const { sql, params } = db.state.updates[0];
        for (const col of ['outcome', 'ended_on', 'ga_weeks_at_end', 'delivery_method', 'delivery_indication', 'delivery_place', 'babies', 'term', 'kuretase', 'review_reason']) {
            expect(sql).toMatch(new RegExp(col + ' = NULL'));
        }
        expect(sql).toMatch(/status = 'ongoing'/);
        expect(sql).toMatch(/ended_by_patient = 0/);
        expect(sql).toMatch(/needs_review = 0/);
        expect(sql).toMatch(/report_snoozed_until = \?/);
        expect(params[0]).toBe('2026-11-29');
        expect(params[params.length - 1]).toBe(5);
        expect(db.state.tx.commit).toBe(1);
    });
    test('admin -> 403 before any query', async () => {
        const db = makeDb([patientReported()]);
        await expectErr(svc(db).reopen('P1', 5, { id: 'u9', role_id: ROLE_IDS.ADMIN }), PregnancyEpisodeError, 403);
        expect(db.state.sql).toHaveLength(0);
        expect(db.state.tx.begin).toBe(0);
    });
    test('row of another patient -> 404', async () => {
        const db = makeDb([patientReported({ patient_id: 'P2' })]);
        await expectErr(svc(db).reopen('P1', 5, BIDAN), PatientReportError, 404);
        expect(db.state.updates).toHaveLength(0);
    });
    test('row not reported by patient -> 409', async () => {
        const db = makeDb([patientReported({ ended_by_patient: 0 })]);
        await expectErr(svc(db).reopen('P1', 5, BIDAN), PatientReportError, 409, 'Hanya laporan pasien yang dapat dibuka kembali');
        expect(db.state.updates).toHaveLength(0);
    });
    test('stamps updated_by with the staff actor and clears complications', async () => {
        const db = makeDb([patientReported()]);
        await svc(db).reopen('P1', 5, BIDAN);
        const { sql, params } = db.state.updates[0];
        expect(sql).toMatch(/complications = NULL/);
        expect(sql).toMatch(/complication_notes = NULL/);
        expect(sql).toMatch(/updated_by = \?/);
        expect(params).toContain('u2');
    });
    test('only the newest pregnancy can be reopened', async () => {
        const db = makeDb([patientReported(), preg({ id: 6, sequence: 2, status: 'ended', ended_by_patient: 0, outcome: 'abortus', ended_on: '2026-11-01' })]);
        await expectErr(svc(db).reopen('P1', 5, BIDAN), PatientReportError, 409, 'Hanya kehamilan terakhir yang dapat dibuka kembali');
        expect(db.state.updates).toHaveLength(0);
    });
    test('another ongoing row -> 409, no UPDATE, rolled back', async () => {
        const db = makeDb([patientReported(), preg({ id: 6, sequence: 2 })]);
        await expectErr(svc(db).reopen('P1', 5, BIDAN), PatientReportError, 409, 'Pasien sudah punya kehamilan berjalan');
        expect(db.state.updates).toHaveLength(0);
        expect(db.state.tx.rollback).toBe(1);
    });
});
