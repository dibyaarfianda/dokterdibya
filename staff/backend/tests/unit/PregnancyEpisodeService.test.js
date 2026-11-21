'use strict';

const {
    createPregnancyEpisodeService,
    PregnancyEpisodeError
} = require('../../services/PregnancyEpisodeService');
const { ROLE_IDS, ROLE_NAMES } = require('../../constants/roles');

const NOW = () => new Date(2026, 10, 21, 10, 0, 0);

function parseCols(sql, re) {
    return sql.match(re)[1].split(',').map(s => s.trim().replace(/ = \?$/, ''));
}

/** In-memory fake of the tables the service touches, keyed on SQL fragments. */
function makeDb({ pregnancies = [], visits = [], anamnesa = {} } = {}) {
    const state = {
        pregnancies: pregnancies.map(p => ({ ...p })),
        visits: visits.map(v => ({ ...v })),
        anamnesa,
        links: [],
        nextId: 100,
        tx: { begin: 0, commit: 0, rollback: 0, release: 0 },
        sql: []
    };
    async function query(sql, params = []) {
        state.sql.push(sql);
        if (/FROM medical_records/.test(sql)) {
            const rec = state.anamnesa[params[0]];
            const owner = state.visits.find(v => v.mr_id === params[0]);
            return [rec && owner && owner.patient_id === params[1] ? [{ record_data: JSON.stringify(rec) }] : []];
        }
        if (/^SELECT mr_id FROM sunday_clinic_records WHERE mr_id = \? AND patient_id = \?/.test(sql)) {
            return [state.visits.filter(v => v.mr_id === params[0] && v.patient_id === params[1]).map(v => ({ mr_id: v.mr_id }))];
        }
        if (/^SELECT pregnancy_id FROM (pregnancy_outcomes|birth_congratulations) WHERE id = \?/.test(sql)) {
            const tbl = sql.match(/FROM (\w+)/)[1];
            const l = state.links.filter(x => x.id === params[0] && x.table === tbl).pop();
            return [[{ pregnancy_id: l ? l.pregnancy_id : null }]];
        }
        if (/FROM sunday_clinic_records/.test(sql) && /mr_category = 'obstetri'/.test(sql)) {
            const rows = state.visits
                .filter(v => v.patient_id === params[0])
                .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
            return [rows.slice(0, 1).map(v => ({ mr_id: v.mr_id }))];
        }
        if (/^SELECT p\.\*/.test(sql)) {
            const rows = state.pregnancies.filter(p => p.patient_id === params[0]).map(p => {
                const latest = state.visits
                    .filter(v => v.pregnancy_id === p.id)
                    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
                return { ...p, latest_mr_id: latest ? latest.mr_id : null };
            });
            return [rows];
        }
        if (/^SELECT[\s\S]*FROM pregnancies WHERE id = \? AND patient_id = \?/.test(sql)) {
            const [id, pid] = params;
            return [state.pregnancies.filter(p => p.id === id && p.patient_id === pid)];
        }
        if (/^SELECT[\s\S]*FROM pregnancies WHERE patient_id = \?/.test(sql)) {
            return [state.pregnancies.filter(p => p.patient_id === params[0]).sort((a, b) => a.sequence - b.sequence)];
        }
        if (/^SELECT[\s\S]*FROM pregnancies WHERE id = \?/.test(sql)) {
            return [state.pregnancies.filter(p => p.id === params[0])];
        }
        if (/^INSERT INTO pregnancies/.test(sql)) {
            const cols = parseCols(sql, /\(([^)]*)\) VALUES/);
            const row = { id: state.nextId++ };
            cols.forEach((c, i) => { row[c] = params[i]; });
            state.pregnancies.push(row);
            return [{ insertId: row.id }];
        }
        if (/^UPDATE pregnancies SET/.test(sql)) {
            const cols = parseCols(sql, /SET (.*) WHERE/);
            const id = params[params.length - 1];
            const row = state.pregnancies.find(p => p.id === id);
            cols.forEach((c, i) => { row[c] = params[i]; });
            return [{ affectedRows: row ? 1 : 0 }];
        }
        if (/^DELETE FROM pregnancies/.test(sql)) {
            const [id, pid] = params;
            const before = state.pregnancies.length;
            state.pregnancies = state.pregnancies.filter(p => !(p.id === id && p.patient_id === pid && p.source === 'external'));
            return [{ affectedRows: before - state.pregnancies.length }];
        }
        if (/^UPDATE sunday_clinic_records SET pregnancy_id/.test(sql)) {
            const [pid, mr, patient] = params;
            state.visits.filter(v => v.mr_id === mr && v.patient_id === patient).forEach(v => { v.pregnancy_id = pid; });
            state.links.push({ table: 'sunday_clinic_records', pregnancy_id: pid, mr_id: mr });
            return [{ affectedRows: 1 }];
        }
        const link = sql.match(/^UPDATE (pregnancy_outcomes|birth_congratulations) SET pregnancy_id = \? WHERE id = \?/);
        if (link) {
            state.links.push({ table: link[1], pregnancy_id: params[0], id: params[1] });
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

async function expectError(promise, status, message) {
    let err;
    try { await promise; } catch (e) { err = e; }
    expect(err).toBeInstanceOf(PregnancyEpisodeError);
    expect(err.status).toBe(status);
    expect(err.message).toBe(message);
}

const DOKTER = { id: 'u1', role_id: ROLE_IDS.DOKTER };
const ongoingPreg = (over = {}) => ({
    id: 1, patient_id: 'P1', sequence: 1, source: 'clinic', hpht: '2026-02-01', hpl: '2026-11-08',
    status: 'ongoing', outcome: null, ended_on: null, ...over
});
const visit = (mr_id, created_at, over = {}) => ({
    mr_id, patient_id: 'P1', mr_category: 'obstetri', created_at, pregnancy_id: null, ...over
});

describe('PregnancyEpisodeService.assertCanClose', () => {
    const svc = createPregnancyEpisodeService({ db: makeDb(), now: NOW });
    test('allows dokter, bidan (by id or name) and superadmin', () => {
        expect(() => svc.assertCanClose({ role_id: ROLE_IDS.DOKTER })).not.toThrow();
        expect(() => svc.assertCanClose({ role_id: ROLE_IDS.BIDAN })).not.toThrow();
        expect(() => svc.assertCanClose({ role: ROLE_NAMES.DOKTER })).not.toThrow();
        expect(() => svc.assertCanClose({ role: ROLE_NAMES.BIDAN })).not.toThrow();
        expect(() => svc.assertCanClose({ role: 'x', is_superadmin: true })).not.toThrow();
    });
    test('refuses admin and missing actor with 403', () => {
        for (const actor of [{ role_id: ROLE_IDS.ADMIN }, { role: ROLE_NAMES.ADMIN }, null, undefined]) {
            let err;
            try { svc.assertCanClose(actor); } catch (e) { err = e; }
            expect(err).toBeInstanceOf(PregnancyEpisodeError);
            expect(err.status).toBe(403);
            expect(err.message).toBe('Hanya dokter atau bidan yang dapat menutup kehamilan');
        }
    });
});

describe('PregnancyEpisodeService.list', () => {
    test('parses JSON columns, adds latest_mr_id, newest first', async () => {
        const db = makeDb({
            pregnancies: [
                { id: 1, patient_id: 'P1', sequence: 1, source: 'clinic', status: 'ended', outcome: 'lahir_hidup', hpht: '2024-01-01', ended_on: '2024-10-08', complications: '["kpd"]', babies: '[{"weight_g":3000}]' },
                ongoingPreg({ id: 2, sequence: 2 })
            ],
            visits: [visit('DRD1', '2024-02-01 08:00:00', { pregnancy_id: 1 }), visit('DRD2', '2024-03-01 08:00:00', { pregnancy_id: 1 })]
        });
        const rows = await createPregnancyEpisodeService({ db, now: NOW }).list('P1');
        expect(rows.map(r => r.id)).toEqual([2, 1]);
        expect(rows[1].complications).toEqual(['kpd']);
        expect(rows[1].babies).toEqual([{ weight_g: 3000 }]);
        expect(rows[1].latest_mr_id).toBe('DRD2');
        expect(rows[0].latest_mr_id).toBeNull();
        expect(rows[1].ended_on).toBe('2024-10-08');
    });
});

describe('PregnancyEpisodeService.resolveFromVisit', () => {
    test('start: creates ongoing clinic pregnancy and links visit', async () => {
        const db = makeDb({ visits: [visit('DRD1', '2026-11-01 08:00:00')], anamnesa: { DRD1: { hpht: '2026-10-01', hpl: '2027-07-08' } } });
        const res = await createPregnancyEpisodeService({ db, now: NOW }).resolveFromVisit('P1', 'DRD1', DOKTER);
        expect(res.action).toBe('start');
        expect(res.pregnancy).toMatchObject({ status: 'ongoing', source: 'clinic', hpht: '2026-10-01', hpl: '2027-07-08', sequence: 1 });
        expect(db.state.visits[0].pregnancy_id).toBe(res.pregnancy.id);
        expect(db.state.tx.commit).toBe(1);
        expect(db.state.tx.release).toBe(1);
    });

    test('start: sequence continues after the patient max', async () => {
        const db = makeDb({
            pregnancies: [{ id: 1, patient_id: 'P1', sequence: 3, source: 'external', status: 'ended', outcome: 'abortus', year: 2020 }],
            visits: [visit('DRD1', '2026-11-01 08:00:00')], anamnesa: { DRD1: { hpht: '2026-10-01' } }
        });
        const res = await createPregnancyEpisodeService({ db, now: NOW }).resolveFromVisit('P1', 'DRD1', DOKTER);
        expect(res.pregnancy.sequence).toBe(4);
    });

    test('update: dating correction within 14 days changes hpht/hpl and links', async () => {
        const db = makeDb({ pregnancies: [ongoingPreg()], visits: [visit('DRD1', '2026-11-01 08:00:00')], anamnesa: { DRD1: { hpht: '2026-02-08', hpl: '2026-11-15' } } });
        const res = await createPregnancyEpisodeService({ db, now: NOW }).resolveFromVisit('P1', 'DRD1', DOKTER);
        expect(res.action).toBe('update');
        expect(res.pregnancy).toMatchObject({ id: 1, hpht: '2026-02-08', hpl: '2026-11-15' });
        expect(db.state.pregnancies).toHaveLength(1);
        expect(db.state.visits[0].pregnancy_id).toBe(1);
    });

    test('start_needs_previous_end: changes nothing and reports after_full_term', async () => {
        const db = makeDb({ pregnancies: [ongoingPreg()], visits: [visit('DRD1', '2026-11-01 08:00:00')], anamnesa: { DRD1: { hpht: '2026-10-01' } } });
        const res = await createPregnancyEpisodeService({ db, now: NOW }).resolveFromVisit('P1', 'DRD1', DOKTER);
        expect(res.action).toBe('start_needs_previous_end');
        expect(res.previous).toMatchObject({ id: 1, hpht: '2026-02-01' });
        expect(res.after_full_term).toBe(false);
        expect(db.state.pregnancies).toHaveLength(1);
        expect(db.state.pregnancies[0].status).toBe('ongoing');
        expect(db.state.visits[0].pregnancy_id).toBeNull();
    });

    test('start_needs_previous_end: after_full_term true when > 42 weeks', async () => {
        const db = makeDb({ pregnancies: [ongoingPreg({ hpht: '2025-10-01' })], visits: [visit('DRD1', '2026-11-01 08:00:00')], anamnesa: { DRD1: { hpht: '2026-10-01' } } });
        const res = await createPregnancyEpisodeService({ db, now: NOW }).resolveFromVisit('P1', 'DRD1', DOKTER);
        expect(res.after_full_term).toBe(true);
    });

    test('non-newest obstetri visit cannot start: 409', async () => {
        const db = makeDb({ visits: [visit('DRD1', '2026-10-01 08:00:00'), visit('DRD2', '2026-11-01 08:00:00')], anamnesa: { DRD1: { hpht: '2026-09-01' } } });
        await expectError(createPregnancyEpisodeService({ db, now: NOW }).resolveFromVisit('P1', 'DRD1', DOKTER), 409, 'Hanya kunjungan obstetri terbaru yang dapat memulai kehamilan baru');
        expect(db.state.pregnancies).toHaveLength(0);
        expect(db.state.tx.rollback).toBe(1);
    });

    test('non-newest visit with an ongoing pregnancy and far HPHT is refused too', async () => {
        const db = makeDb({ pregnancies: [ongoingPreg()], visits: [visit('DRD1', '2026-10-01 08:00:00'), visit('DRD2', '2026-11-01 08:00:00')], anamnesa: { DRD1: { hpht: '2026-10-01' } } });
        await expectError(createPregnancyEpisodeService({ db, now: NOW }).resolveFromVisit('P1', 'DRD1', DOKTER), 409, 'Hanya kunjungan obstetri terbaru yang dapat memulai kehamilan baru');
    });

    test('empty HPHT: nothing created or closed; visit linked to the ongoing pregnancy', async () => {
        const db = makeDb({ pregnancies: [ongoingPreg()], visits: [visit('DRD1', '2026-11-01 08:00:00')], anamnesa: { DRD1: { hpht: '' } } });
        const res = await createPregnancyEpisodeService({ db, now: NOW }).resolveFromVisit('P1', 'DRD1', DOKTER);
        expect(res.action).toBe('none');
        expect(db.state.pregnancies).toHaveLength(1);
        expect(db.state.pregnancies[0].status).toBe('ongoing');
        expect(db.state.pregnancies[0].hpht).toBe('2026-02-01');
        expect(db.state.visits[0].pregnancy_id).toBe(1);
    });

    test('empty HPHT with no ongoing pregnancy and no anamnesa row: none, nothing written', async () => {
        const db = makeDb({ visits: [visit('DRD1', '2026-11-01 08:00:00')] });
        const res = await createPregnancyEpisodeService({ db, now: NOW }).resolveFromVisit('P1', 'DRD1', DOKTER);
        expect(res.action).toBe('none');
        expect(db.state.pregnancies).toHaveLength(0);
        expect(db.state.links).toHaveLength(0);
    });

    test('older non-newest visit with empty HPHT is fine (none never starts)', async () => {
        const db = makeDb({ visits: [visit('DRD1', '2026-10-01 08:00:00'), visit('DRD2', '2026-11-01 08:00:00')], anamnesa: { DRD1: { hpht: '' } } });
        const res = await createPregnancyEpisodeService({ db, now: NOW }).resolveFromVisit('P1', 'DRD1', DOKTER);
        expect(res.action).toBe('none');
    });
});

describe('visit must belong to the patient', () => {
    test('resolveFromVisit with a wrong patient/visit pair: 404, nothing changed', async () => {
        const db = makeDb({
            pregnancies: [ongoingPreg()],
            visits: [visit('DRD9', '2026-11-01 08:00:00', { patient_id: 'P2' })],
            anamnesa: { DRD9: { hpht: '2026-02-08', hpl: '2026-11-15' } }
        });
        await expectError(createPregnancyEpisodeService({ db, now: NOW }).resolveFromVisit('P1', 'DRD9', DOKTER), 404, 'Kunjungan tidak ditemukan untuk pasien ini');
        expect(db.state.pregnancies[0].hpht).toBe('2026-02-01');
        expect(db.state.visits[0].pregnancy_id).toBeNull();
    });

    test('startWithPreviousEnd with a wrong pair: 404', async () => {
        const db = makeDb({
            pregnancies: [ongoingPreg()],
            visits: [visit('DRD9', '2026-11-01 08:00:00', { patient_id: 'P2' })],
            anamnesa: { DRD9: { hpht: '2026-10-01' } }
        });
        await expectError(createPregnancyEpisodeService({ db, now: NOW }).startWithPreviousEnd('P1', 'DRD9', { outcome: 'abortus', ended_on: '2026-03-01' }, DOKTER), 404, 'Kunjungan tidak ditemukan untuk pasien ini');
        expect(db.state.pregnancies).toHaveLength(1);
    });
});

describe('PregnancyEpisodeService.startWithPreviousEnd', () => {
    function base(over = {}) {
        return makeDb({
            pregnancies: [ongoingPreg({ hpht: '2025-12-01', hpl: '2026-09-07' })],
            visits: [visit('DRD1', '2026-11-01 08:00:00')],
            anamnesa: { DRD1: { hpht: '2026-10-01', hpl: '2027-07-08' } },
            ...over
        });
    }
    const birth = { outcome: 'lahir_hidup', ended_on: '2026-09-01', delivery_method: 'Spt B (Spontan)' };

    test('ends previous, creates new, links visit in one transaction', async () => {
        const db = base();
        const res = await createPregnancyEpisodeService({ db, now: NOW }).startWithPreviousEnd('P1', 'DRD1', {
            ...birth, complications: ['kpd'], babies: [{ weight_g: 3100, sex: 'L', alive: true }]
        }, DOKTER);
        const [prev, next] = db.state.pregnancies;
        expect(prev).toMatchObject({ status: 'ended', outcome: 'lahir_hidup', ended_on: '2026-09-01', delivery_method: 'Spt B (Spontan)', ga_weeks_at_end: 39 });
        expect(JSON.parse(prev.complications)).toEqual(['kpd']);
        expect(JSON.parse(prev.babies)).toEqual([{ weight_g: 3100, sex: 'L', alive: true }]);
        expect(next).toMatchObject({ status: 'ongoing', hpht: '2026-10-01', sequence: 2, source: 'clinic' });
        expect(db.state.visits[0].pregnancy_id).toBe(next.id);
        expect(res.pregnancy.id).toBe(next.id);
        expect(db.state.tx).toMatchObject({ begin: 1, commit: 1, rollback: 0, release: 1 });
        expect(db.state.sql.some(s => /FROM pregnancies WHERE patient_id = \?[\s\S]*FOR UPDATE/.test(s))).toBe(true);
    });

    test('invalid outcome / date', async () => {
        const svc = createPregnancyEpisodeService({ db: base(), now: NOW });
        await expectError(svc.startWithPreviousEnd('P1', 'DRD1', { ...birth, outcome: 'x' }, DOKTER), 400, 'Hasil akhir kehamilan tidak valid');
        await expectError(svc.startWithPreviousEnd('P1', 'DRD1', { ...birth, ended_on: '2026-13-40' }, DOKTER), 400, 'Tanggal selesai tidak valid');
        await expectError(svc.startWithPreviousEnd('P1', 'DRD1', { ...birth, ended_on: undefined }, DOKTER), 400, 'Tanggal selesai tidak valid');
    });

    test('end date before own HPHT / not before new HPHT', async () => {
        const db = base();
        const svc = createPregnancyEpisodeService({ db, now: NOW });
        await expectError(svc.startWithPreviousEnd('P1', 'DRD1', { ...birth, ended_on: '2025-11-30' }, DOKTER), 400, 'Tanggal selesai tidak boleh sebelum HPHT kehamilan tersebut');
        await expectError(svc.startWithPreviousEnd('P1', 'DRD1', { ...birth, ended_on: '2026-10-01' }, DOKTER), 400, 'Tanggal selesai harus sebelum HPHT kehamilan baru');
        await expectError(svc.startWithPreviousEnd('P1', 'DRD1', { ...birth, ended_on: '2026-10-15' }, DOKTER), 400, 'Tanggal selesai harus sebelum HPHT kehamilan baru');
        expect(db.state.pregnancies).toHaveLength(1);
        expect(db.state.pregnancies[0].status).toBe('ongoing');
        expect(db.state.tx.rollback).toBe(3);
    });

    test('birth needs cara lahir; SC/Vakum/Forceps need indikasi', async () => {
        const svc = createPregnancyEpisodeService({ db: base(), now: NOW });
        await expectError(svc.startWithPreviousEnd('P1', 'DRD1', { outcome: 'lahir_hidup', ended_on: '2026-09-01' }, DOKTER), 400, 'Cara lahir wajib diisi');
        await expectError(svc.startWithPreviousEnd('P1', 'DRD1', { outcome: 'lahir_mati', ended_on: '2026-09-01', delivery_method: 'bukan metode' }, DOKTER), 400, 'Cara lahir wajib diisi');
        for (const m of ['SC (Caesar)', 'Vakum', 'Forceps']) {
            await expectError(svc.startWithPreviousEnd('P1', 'DRD1', { ...birth, delivery_method: m }, DOKTER), 400, 'Indikasi wajib diisi untuk persalinan SC/Vakum/Forceps');
        }
        const ok = await svc.startWithPreviousEnd('P1', 'DRD1', { ...birth, delivery_method: 'SC (Caesar)', delivery_indication: 'Letak sungsang' }, DOKTER);
        expect(ok.pregnancy.status).toBe('ongoing');
    });

    test('invalid complication code', async () => {
        const svc = createPregnancyEpisodeService({ db: base(), now: NOW });
        await expectError(svc.startWithPreviousEnd('P1', 'DRD1', { ...birth, complications: ['ngawur'] }, DOKTER), 400, 'Komplikasi tidak valid');
    });

    test('abortus needs no delivery method and keeps kuretase', async () => {
        const db = base();
        await createPregnancyEpisodeService({ db, now: NOW }).startWithPreviousEnd('P1', 'DRD1', { outcome: 'abortus', ended_on: '2026-03-01', kuretase: 'Ya' }, DOKTER);
        expect(db.state.pregnancies[0]).toMatchObject({ outcome: 'abortus', kuretase: 'Ya', delivery_method: null, ga_weeks_at_end: 12 });
    });

    test('GA mismatch is accepted with a warning', async () => {
        const db = base();
        const res = await createPregnancyEpisodeService({ db, now: NOW }).startWithPreviousEnd('P1', 'DRD1', { outcome: 'lahir_mati', ended_on: '2026-02-15', delivery_method: 'Spt B (Spontan)' }, DOKTER);
        expect(res.warning).toBe('Usia kehamilan <20 minggu biasanya dicatat sebagai abortus');
        expect(db.state.pregnancies[0].outcome).toBe('lahir_mati');
        const db2 = base();
        const res2 = await createPregnancyEpisodeService({ db: db2, now: NOW }).startWithPreviousEnd('P1', 'DRD1', { outcome: 'abortus', ended_on: '2026-08-01' }, DOKTER);
        expect(res2.warning).toBe('Usia kehamilan ≥20 minggu biasanya dicatat sebagai lahir mati');
    });

    test('double call is idempotent: exactly one new pregnancy', async () => {
        const db = base();
        const svc = createPregnancyEpisodeService({ db, now: NOW });
        const a = await svc.startWithPreviousEnd('P1', 'DRD1', birth, DOKTER);
        const b = await svc.startWithPreviousEnd('P1', 'DRD1', birth, DOKTER);
        expect(db.state.pregnancies).toHaveLength(2);
        expect(b.pregnancy.id).toBe(a.pregnancy.id);
        expect(b.already).toBe(true);
    });

    test('non-newest visit: 409', async () => {
        const db = base({ visits: [visit('DRD1', '2026-10-01 08:00:00'), visit('DRD2', '2026-11-01 08:00:00')] });
        await expectError(createPregnancyEpisodeService({ db, now: NOW }).startWithPreviousEnd('P1', 'DRD1', birth, DOKTER), 409, 'Hanya kunjungan obstetri terbaru yang dapat memulai kehamilan baru');
    });
});

describe('PregnancyEpisodeService.updateHistory / external', () => {
    const ended = (over = {}) => ({ id: 5, patient_id: 'P1', sequence: 1, source: 'clinic', hpht: '2025-01-01', status: 'ended', outcome: 'abortus', ended_on: '2025-03-01', ...over });

    test('clinic pregnancy: hpht change rejected, other fields editable', async () => {
        const db = makeDb({ pregnancies: [ended()] });
        const svc = createPregnancyEpisodeService({ db, now: NOW });
        await expectError(svc.updateHistory('P1', 5, { hpht: '2025-01-05' }, DOKTER), 400, 'HPHT kehamilan klinik tidak dapat diubah');
        const res = await svc.updateHistory('P1', 5, { kuretase: 'Ya', complication_notes: ' catatan ' }, DOKTER);
        expect(res.pregnancy).toMatchObject({ kuretase: 'Ya', complication_notes: 'catatan', outcome: 'abortus' });
    });

    test('external pregnancy: hpht editable; unknown patient/id is 404', async () => {
        const db = makeDb({ pregnancies: [ended({ source: 'external', hpht: null })] });
        const svc = createPregnancyEpisodeService({ db, now: NOW });
        const res = await svc.updateHistory('P1', 5, { hpht: '2025-01-05' }, DOKTER);
        expect(res.pregnancy.hpht).toBe('2025-01-05');
        await expectError(svc.updateHistory('P2', 5, { kuretase: 'Ya' }, DOKTER), 404, 'Kehamilan tidak ditemukan');
    });

    test('editing to a birth re-validates (cara lahir wajib)', async () => {
        const db = makeDb({ pregnancies: [ended()] });
        await expectError(createPregnancyEpisodeService({ db, now: NOW }).updateHistory('P1', 5, { outcome: 'lahir_hidup' }, DOKTER), 400, 'Cara lahir wajib diisi');
    });

    test('addExternal creates an ended external pregnancy with the next sequence', async () => {
        const db = makeDb({ pregnancies: [ended()] });
        const res = await createPregnancyEpisodeService({ db, now: NOW }).addExternal('P1', {
            year: 2019, outcome: 'lahir_hidup', delivery_method: 'Vakum', delivery_indication: 'Kala II lama', babies: [{ weight_g: 2900 }]
        }, DOKTER);
        expect(res.pregnancy).toMatchObject({ source: 'external', status: 'ended', year: 2019, sequence: 2, delivery_method: 'Vakum' });
        expect(res.pregnancy.babies).toEqual([{ weight_g: 2900 }]);
    });

    test('addExternal validates outcome, year and babies', async () => {
        const svc = createPregnancyEpisodeService({ db: makeDb(), now: NOW });
        await expectError(svc.addExternal('P1', { year: 2019, outcome: 'zzz' }, DOKTER), 400, 'Hasil akhir kehamilan tidak valid');
        await expectError(svc.addExternal('P1', { outcome: 'abortus' }, DOKTER), 400, 'Tanggal selesai tidak valid');
        await expectError(svc.addExternal('P1', { year: 2019, outcome: 'lahir_hidup', delivery_method: 'Spt B (Spontan)', babies: [{ weight_g: 50 }] }, DOKTER), 400, 'Data bayi tidak valid');
    });

    test('removeExternal deletes external rows only', async () => {
        const db = makeDb({ pregnancies: [ended(), ended({ id: 6, source: 'external' })] });
        const svc = createPregnancyEpisodeService({ db, now: NOW });
        await expectError(svc.removeExternal('P1', 5, DOKTER), 404, 'Kehamilan tidak ditemukan');
        await svc.removeExternal('P1', 6, DOKTER);
        expect(db.state.pregnancies.map(p => p.id)).toEqual([5]);
    });
});

describe('PregnancyEpisodeService.endOngoing', () => {
    const birth = { outcome: 'lahir_hidup', ended_on: '2026-11-10', delivery_method: 'Spt B (Spontan)' };

    test('ends the ongoing pregnancy in its own transaction and links the source row', async () => {
        const db = makeDb({ pregnancies: [ongoingPreg()] });
        const res = await createPregnancyEpisodeService({ db, now: NOW }).endOngoing('P1', { ...birth, linkTable: 'birth_congratulations', linkId: 9 }, DOKTER);
        expect(db.state.pregnancies[0]).toMatchObject({ status: 'ended', outcome: 'lahir_hidup', ended_on: '2026-11-10', ga_weeks_at_end: 40 });
        expect(db.state.links).toContainEqual({ table: 'birth_congratulations', pregnancy_id: 1, id: 9 });
        expect(res.pregnancy.status).toBe('ended');
        expect(db.state.tx).toMatchObject({ begin: 1, commit: 1, release: 1 });
    });

    test('with a conn it uses that connection and does not manage the transaction', async () => {
        const db = makeDb({ pregnancies: [ongoingPreg()] });
        const conn = await db.getConnection();
        await createPregnancyEpisodeService({ db, now: NOW }).endOngoing('P1', { ...birth, linkTable: 'pregnancy_outcomes', linkId: 3 }, DOKTER, conn);
        expect(db.state.tx).toMatchObject({ begin: 0, commit: 0, rollback: 0, release: 0 });
        expect(db.state.pregnancies[0].status).toBe('ended');
    });

    test('creates an ended pregnancy when none is ongoing', async () => {
        const db = makeDb();
        const res = await createPregnancyEpisodeService({ db, now: NOW }).endOngoing('P1', { outcome: 'abortus', ended_on: '2026-11-01', linkTable: 'pregnancy_outcomes', linkId: 4 }, DOKTER);
        expect(db.state.pregnancies).toHaveLength(1);
        expect(res.pregnancy).toMatchObject({ status: 'ended', outcome: 'abortus', source: 'clinic', sequence: 1 });
        expect(db.state.links).toContainEqual({ table: 'pregnancy_outcomes', pregnancy_id: res.pregnancy.id, id: 4 });
    });

    test('endOngoing twice with same linkId creates one pregnancy', async () => {
        const db = makeDb();
        const svc = createPregnancyEpisodeService({ db, now: NOW });
        const payload = { outcome: 'abortus', ended_on: '2026-11-01', linkTable: 'pregnancy_outcomes', linkId: 4 };
        const a = await svc.endOngoing('P1', payload, DOKTER);
        const b = await svc.endOngoing('P1', payload, DOKTER);
        expect(db.state.pregnancies).toHaveLength(1);
        expect(b.pregnancy.id).toBe(a.pregnancy.id);
    });

    test('endOngoing retry does not end a different ongoing pregnancy', async () => {
        const db = makeDb({ pregnancies: [ongoingPreg({ id: 1, status: 'ended', outcome: 'abortus', ended_on: '2026-03-01', sequence: 1 }), ongoingPreg({ id: 2, sequence: 2, hpht: '2026-10-01' })] });
        db.state.links.push({ table: 'pregnancy_outcomes', pregnancy_id: 1, id: 4 });
        await createPregnancyEpisodeService({ db, now: NOW }).endOngoing('P1', { outcome: 'abortus', ended_on: '2026-03-02', linkTable: 'pregnancy_outcomes', linkId: 4 }, DOKTER);
        expect(db.state.pregnancies.find(p => p.id === 2).status).toBe('ongoing');
        expect(db.state.pregnancies).toHaveLength(2);
    });

    test('refuses an unknown link table and a date before HPHT', async () => {
        const db = makeDb({ pregnancies: [ongoingPreg()] });
        const svc = createPregnancyEpisodeService({ db, now: NOW });
        await expectError(svc.endOngoing('P1', { ...birth, linkTable: 'patients', linkId: 1 }, DOKTER), 400, 'Tabel tautan tidak valid');
        await expectError(svc.endOngoing('P1', { ...birth, ended_on: '2026-01-01' }, DOKTER), 400, 'Tanggal selesai tidak boleh sebelum HPHT kehamilan tersebut');
    });
});
