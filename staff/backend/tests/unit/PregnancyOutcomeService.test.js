'use strict';

const {
    createPregnancyOutcomeService,
    PregnancyOutcomeError,
    OUTCOME_TYPES
} = require('../../services/PregnancyOutcomeService');

function makeDb({ patient = true, hpht = null, edd = null, insertId = 7, voidAffected = 1, outcomeRow, pregnancyRow, otherOngoing = false, linked = {} } = {}) {
    const calls = [];
    const conn = {
        async query(sql, params) {
            calls.push({ sql, params });
            if (sql.includes('INSERT INTO pregnancy_outcomes')) return [{ insertId }];
            if (sql.includes('FROM pregnancy_outcomes WHERE id = ?')) {
                const row = outcomeRow === undefined
                    ? { id: 5, patient_id: 'P1', outcome_type: 'keguguran', event_date: '2026-07-10', pregnancy_id: null, voided_at: null }
                    : outcomeRow;
                return [voidAffected === 0 || !row ? [] : [row]];
            }
            if (sql.includes('UPDATE pregnancy_outcomes')) return [{ affectedRows: voidAffected }];
            if (sql.includes('FROM sunday_clinic_records WHERE pregnancy_id')) return [[{ n: linked.visits || 0 }]];
            if (sql.includes('FROM birth_congratulations WHERE pregnancy_id')) return [[{ n: linked.births || 0 }]];
            if (sql.includes('FROM pregnancy_outcomes WHERE pregnancy_id')) return [[{ n: linked.others || 0 }]];
            if (sql.startsWith('DELETE FROM pregnancies')) return [{ affectedRows: 1 }];
            if (sql.includes("status = 'ongoing'")) return [otherOngoing ? [{ id: 99 }] : []];
            if (sql.includes('FROM pregnancies WHERE id')) return [pregnancyRow ? [pregnancyRow] : []];
            if (sql.includes('UPDATE pregnancies')) return [{ affectedRows: 1 }];
            throw new Error('unexpected conn sql: ' + sql);
        },
        beginTransaction: jest.fn(async () => { calls.push({ sql: 'BEGIN' }); }),
        commit: jest.fn(async () => { calls.push({ sql: 'COMMIT' }); }),
        rollback: jest.fn(async () => { calls.push({ sql: 'ROLLBACK' }); }),
        release: jest.fn()
    };
    return {
        calls,
        conn,
        async getConnection() { return conn; },
        async query(sql, params) {
            calls.push({ sql, params });
            if (sql.includes('FROM patients')) return [patient ? [{ id: 'P1' }] : []];
            if (sql.includes('sunday_clinic_records')) return [hpht ? [{ hpht }] : []];
            if (sql.includes("record_type = 'usg'")) return [edd ? [{ record_data: JSON.stringify({ edd }) }] : []];
            throw new Error('unexpected sql: ' + sql);
        }
    };
}

function makeEpisodes(overrides = {}) {
    return { endOngoing: jest.fn(async () => ({ pregnancy: { id: 31 } })), ...overrides };
}

function makeSvc(db, episodes = makeEpisodes()) {
    return createPregnancyOutcomeService({ db, now: NOW, episodes });
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
        await expectError(makeSvc(makeDb()).record('P1', { outcome_type: 'aborsi', event_date: '2026-07-10' }, 's1'), 400, 'Jenis kejadian tidak valid');
    });

    test('rejects invalid or missing date', async () => {
        const svc = makeSvc(makeDb());
        await expectError(svc.record('P1', { outcome_type: 'keguguran', event_date: '2026-13-01' }, 's1'), 400, 'Tanggal kejadian tidak valid');
        await expectError(svc.record('P1', { outcome_type: 'keguguran' }, 's1'), 400, 'Tanggal kejadian tidak valid');
    });

    test('rejects future date, allows today', async () => {
        const svc = makeSvc(makeDb({ hpht: '2026-10-01' }));
        await expectError(svc.record('P1', { outcome_type: 'keguguran', event_date: '2026-11-22' }, 's1'), 400, 'Tanggal kejadian tidak boleh di masa depan');
        const res = await svc.record('P1', { outcome_type: 'keguguran', event_date: '2026-11-21' }, 's1');
        expect(res).toMatchObject({ id: 7, outcome_type: 'keguguran', event_date: '2026-11-21' });
    });

    test('note over 500 chars rejected; trimmed; empty becomes null', async () => {
        const db = makeDb({ hpht: '2026-05-01' });
        const svc = makeSvc(db);
        await expectError(svc.record('P1', { outcome_type: 'keguguran', event_date: '2026-07-10', note: 'x'.repeat(501) }, 's1'), 400, 'Catatan maksimal 500 karakter');
        await svc.record('P1', { outcome_type: 'keguguran', event_date: '2026-07-10', note: '  halo  ' }, 's1');
        await svc.record('P1', { outcome_type: 'keguguran', event_date: '2026-07-10', note: '   ' }, 's1');
        const inserts = db.calls.filter(c => c.sql.includes('INSERT INTO pregnancy_outcomes'));
        expect(inserts[0].params[3]).toBe('halo');
        expect(inserts[1].params[3]).toBeNull();
    });

    test('unknown patient -> 404', async () => {
        await expectError(makeSvc(makeDb({ patient: false })).record('P1', { outcome_type: 'keguguran', event_date: '2026-07-10' }, 's1'), 404, 'Pasien tidak ditemukan');
    });

    test('no HPHT source -> 400', async () => {
        await expectError(makeSvc(makeDb()).record('P1', { outcome_type: 'keguguran', event_date: '2026-07-10' }, 's1'), 400, 'Pasien tidak punya data kehamilan (HPHT/HPL)');
    });

    test('event earlier than HPHT -> 400', async () => {
        await expectError(makeSvc(makeDb({ hpht: '2026-10-01' })).record('P1', { outcome_type: 'keguguran', event_date: '2026-09-01' }, 's1'), 400, 'Tanggal kejadian lebih awal dari HPHT kehamilan ini');
    });

    test('USG EDD only: derives HPHT and inserts', async () => {
        const db = makeDb({ edd: '2027-02-05' });
        const res = await makeSvc(db).record('P1', { outcome_type: 'keguguran', event_date: '2026-07-10', note: ' ' }, 'staff9');
        expect(res).toMatchObject({ id: 7, outcome_type: 'keguguran', event_date: '2026-07-10' });
        const ins = db.calls.find(c => c.sql.includes('INSERT INTO pregnancy_outcomes'));
        expect(ins.params).toEqual(['P1', 'keguguran', '2026-07-10', null, 'staff9']);
    });

    test('anamnesa HPHT wins over USG: event before anamnesa HPHT is rejected', async () => {
        const db = makeDb({ hpht: '2026-10-01', edd: '2027-02-05' });
        await expectError(makeSvc(db).record('P1', { outcome_type: 'lahir_mati', event_date: '2026-09-01' }, 's1'), 400, 'Tanggal kejadian lebih awal dari HPHT kehamilan ini');
        expect(db.calls.some(c => c.sql.includes('INSERT INTO pregnancy_outcomes'))).toBe(false);
    });

    test('never touches birth_congratulations', async () => {
        const db = makeDb({ hpht: '2026-05-01' });
        const svc = makeSvc(db);
        await svc.record('P1', { outcome_type: 'keguguran', event_date: '2026-07-10' }, 's1');
        await svc.voidOutcome('P1', 7, 's1');
        expect(db.calls.some(c => c.sql.includes('birth_congratulations'))).toBe(false);
    });

    test('keguguran ends the pregnancy as abortus, on the same connection, linked to the outcome', async () => {
        const db = makeDb({ hpht: '2026-05-01', insertId: 12 });
        const episodes = makeEpisodes();
        const actor = { id: 's1' };
        await makeSvc(db, episodes).record('P1', { outcome_type: 'keguguran', event_date: '2026-07-10' }, actor);
        expect(episodes.endOngoing).toHaveBeenCalledTimes(1);
        expect(episodes.endOngoing).toHaveBeenCalledWith(
            'P1',
            { outcome: 'abortus', ended_on: '2026-07-10', linkTable: 'pregnancy_outcomes', linkId: 12 },
            actor,
            db.conn
        );
        const ins = db.calls.find(c => c.sql.includes('INSERT INTO pregnancy_outcomes'));
        expect(ins.params[4]).toBe('s1');
        expect(db.calls.map(c => c.sql).filter(s => ['BEGIN', 'COMMIT'].includes(s))).toEqual(['BEGIN', 'COMMIT']);
        expect(db.conn.release).toHaveBeenCalled();
    });

    test('lahir_mati ends the pregnancy as lahir_mati', async () => {
        const db = makeDb({ hpht: '2026-02-01' });
        const episodes = makeEpisodes();
        await makeSvc(db, episodes).record('P1', { outcome_type: 'lahir_mati', event_date: '2026-08-01' }, 's1');
        expect(episodes.endOngoing.mock.calls[0][1].outcome).toBe('lahir_mati');
    });

    test('a failing pregnancy write rolls back the outcome insert', async () => {
        const db = makeDb({ hpht: '2026-05-01' });
        const episodes = makeEpisodes({ endOngoing: jest.fn(async () => { throw new Error('boom'); }) });
        await expect(makeSvc(db, episodes).record('P1', { outcome_type: 'keguguran', event_date: '2026-07-10' }, 's1')).rejects.toThrow('boom');
        expect(db.conn.rollback).toHaveBeenCalled();
        expect(db.conn.commit).not.toHaveBeenCalled();
        expect(db.conn.release).toHaveBeenCalled();
    });

    test('warns when keguguran is recorded at >= 20 weeks', async () => {
        // HPHT 2026-02-01, event 2026-08-01 = 25 weeks
        const res = await makeSvc(makeDb({ hpht: '2026-02-01' })).record('P1', { outcome_type: 'keguguran', event_date: '2026-08-01' }, 's1');
        expect(res.warning).toBe('Usia kehamilan ≥20 minggu biasanya dicatat sebagai lahir mati');
    });

    test('warns when lahir_mati is recorded at < 20 weeks', async () => {
        // HPHT 2026-05-01, event 2026-07-10 = 10 weeks
        const res = await makeSvc(makeDb({ hpht: '2026-05-01' })).record('P1', { outcome_type: 'lahir_mati', event_date: '2026-07-10' }, 's1');
        expect(res.warning).toBe('Usia kehamilan <20 minggu biasanya dicatat sebagai abortus');
    });

    test('no warning when the type matches the GA', async () => {
        const res = await makeSvc(makeDb({ hpht: '2026-05-01' })).record('P1', { outcome_type: 'keguguran', event_date: '2026-07-10' }, 's1');
        expect(res.warning).toBeUndefined();
    });
});

describe('PregnancyOutcomeService.voidOutcome', () => {
    const ended = (over = {}) => ({ id: 31, patient_id: 'P1', hpht: '2026-05-01', status: 'ended', outcome: 'abortus', ended_on: '2026-07-10', ...over });
    const linkedOutcome = { id: 5, patient_id: 'P1', outcome_type: 'keguguran', event_date: '2026-07-10', pregnancy_id: 31, voided_at: null };

    test('voids only the given id for the patient', async () => {
        const db = makeDb();
        await makeSvc(db).voidOutcome('P1', 5, 'staff9');
        const upd = db.calls.find(c => c.sql.includes('UPDATE pregnancy_outcomes'));
        expect(upd.sql.replace(/\s+/g, ' ').trim()).toBe(
            'UPDATE pregnancy_outcomes SET voided_at = NOW(), voided_by = ? WHERE id = ? AND patient_id = ? AND voided_at IS NULL'
        );
        expect(upd.params).toEqual(['staff9', 5, 'P1']);
        expect(db.calls.some(c => c.sql.includes('UPDATE pregnancies'))).toBe(false);
    });

    test('affectedRows 0 -> 404', async () => {
        const db = makeDb({ voidAffected: 0 });
        await expectError(makeSvc(db).voidOutcome('P1', 5, 's1'), 404, 'Penandaan tidak ditemukan');
        expect(db.conn.rollback).toHaveBeenCalled();
    });

    test('reopens the pregnancy that this outcome ended', async () => {
        const db = makeDb({ outcomeRow: linkedOutcome, pregnancyRow: ended() });
        await makeSvc(db).voidOutcome('P1', 5, { id: 's1' });
        const upd = db.calls.find(c => c.sql.includes('UPDATE pregnancies'));
        expect(upd).toBeTruthy();
        expect(upd.sql).toContain("status = 'ongoing'");
        expect(upd.sql).toContain('outcome = NULL');
        expect(upd.sql).toContain('ended_on = NULL');
        expect(upd.sql).toContain('ga_weeks_at_end = NULL');
        expect(db.conn.commit).toHaveBeenCalled();
    });

    test('does not reopen when the pregnancy ended another way', async () => {
        const db = makeDb({ outcomeRow: linkedOutcome, pregnancyRow: ended({ outcome: 'lahir_hidup' }) });
        await makeSvc(db).voidOutcome('P1', 5, 's1');
        expect(db.calls.some(c => c.sql.includes('UPDATE pregnancies'))).toBe(false);
    });

    test('does not reopen when the end date differs', async () => {
        const db = makeDb({ outcomeRow: linkedOutcome, pregnancyRow: ended({ ended_on: '2026-07-11' }) });
        await makeSvc(db).voidOutcome('P1', 5, 's1');
        expect(db.calls.some(c => c.sql.includes('UPDATE pregnancies'))).toBe(false);
    });

    test('another ongoing pregnancy exists: leave ended and flag needs_review', async () => {
        const db = makeDb({ outcomeRow: linkedOutcome, pregnancyRow: ended(), otherOngoing: true });
        await makeSvc(db).voidOutcome('P1', 5, 's1');
        const upd = db.calls.find(c => c.sql.includes('UPDATE pregnancies'));
        expect(upd.sql).toContain('needs_review = 1');
        expect(upd.sql).not.toContain("status = 'ongoing'");
    });

    test('no HPHT and nothing else linked: deletes the pregnancy and unlinks the outcome', async () => {
        const db = makeDb({ outcomeRow: linkedOutcome, pregnancyRow: ended({ hpht: null }) });
        await makeSvc(db).voidOutcome('P1', 5, 's1');
        const sqls = db.calls.map(c => c.sql);
        expect(sqls.some(s => s.startsWith('DELETE FROM pregnancies'))).toBe(true);
        expect(sqls.some(s => s.includes('UPDATE pregnancy_outcomes SET pregnancy_id = NULL'))).toBe(true);
        expect(db.calls.some(c => c.sql.includes("status = 'ongoing'") && c.sql.startsWith('UPDATE'))).toBe(false);
        expect(db.conn.commit).toHaveBeenCalled();
    });

    test('no HPHT but linked visits: never reopens, never deletes, flags needs_review', async () => {
        for (const linked of [{ visits: 1 }, { births: 1 }, { others: 1 }]) {
            const db = makeDb({ outcomeRow: linkedOutcome, pregnancyRow: ended({ hpht: null }), linked });
            await makeSvc(db).voidOutcome('P1', 5, 's1');
            const sqls = db.calls.map(c => c.sql);
            expect(sqls.some(s => s.startsWith('DELETE FROM pregnancies'))).toBe(false);
            const upd = db.calls.find(c => c.sql.includes('UPDATE pregnancies'));
            expect(upd.sql).toContain('needs_review = 1');
            expect(upd.sql).not.toContain("status = 'ongoing'");
        }
    });

    test('no HPHT never reopens even with no other ongoing pregnancy', async () => {
        const db = makeDb({ outcomeRow: linkedOutcome, pregnancyRow: ended({ hpht: null }), linked: { visits: 2 } });
        await makeSvc(db).voidOutcome('P1', 5, 's1');
        expect(db.calls.some(c => c.sql.includes("SET status = 'ongoing'"))).toBe(false);
    });
});
