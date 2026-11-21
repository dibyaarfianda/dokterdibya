'use strict';

const { markPatientDelivered } = require('../../services/MarkDelivered');

function makeDb({ patient = true, maxChild = null, insertId = 41, pregnancies = [], linkedBirths = [] } = {}) {
    const calls = [];
    const conn = {
        async query(sql, params) {
            calls.push({ sql, params });
            if (sql.includes('FROM patients')) return [patient ? [{ id: 'P1', full_name: 'Ibu Ani' }] : []];
            if (/FROM pregnancies WHERE patient_id = \?/.test(sql)) return [pregnancies];
            if (/FROM birth_congratulations\s+WHERE patient_id = \? AND pregnancy_id = \?/.test(sql)) {
                return [linkedBirths.filter(b => b.pregnancy_id === params[1])];
            }
            if (sql.includes('MAX(child_number)')) return [[{ max_child: maxChild }]];
            if (sql.includes('INSERT INTO birth_congratulations')) return [{ insertId }];
            throw new Error('unexpected sql: ' + sql);
        },
        beginTransaction: jest.fn(async () => { calls.push({ sql: 'BEGIN' }); }),
        commit: jest.fn(async () => { calls.push({ sql: 'COMMIT' }); }),
        rollback: jest.fn(async () => { calls.push({ sql: 'ROLLBACK' }); }),
        release: jest.fn()
    };
    return { calls, conn, getConnection: async () => conn };
}

const actor = { id: 's1' };

describe('markPatientDelivered', () => {
    test('inserts the birth and ends the pregnancy as lahir_hidup in one transaction', async () => {
        const db = makeDb({ maxChild: 1, insertId: 41 });
        const episodes = { endOngoing: jest.fn(async () => ({ pregnancy: { id: 3 } })) };
        const out = await markPatientDelivered({ db, episodes, patientId: 'P1', actor, today: '2026-11-21' });
        expect(episodes.endOngoing).toHaveBeenCalledWith(
            'P1',
            { outcome: 'lahir_hidup', ended_on: '2026-11-21', linkTable: 'birth_congratulations', linkId: 41 },
            actor,
            db.conn
        );
        expect(out).toEqual({
            status: 200,
            body: {
                success: true,
                child_number: 2,
                message: 'Pasien Ibu Ani berhasil ditandai sudah melahirkan (anak ke-2)'
            }
        });
        expect(db.calls.map(c => c.sql).filter(s => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(s))).toEqual(['BEGIN', 'COMMIT']);
        expect(db.conn.release).toHaveBeenCalledTimes(1);
    });

    test('first child gets number 1', async () => {
        const db = makeDb({ maxChild: null });
        const episodes = { endOngoing: jest.fn(async () => ({})) };
        const out = await markPatientDelivered({ db, episodes, patientId: 'P1', actor, today: '2026-11-21' });
        expect(out.body.child_number).toBe(1);
    });

    test('unknown patient -> 404, nothing inserted, rolled back', async () => {
        const db = makeDb({ patient: false });
        const episodes = { endOngoing: jest.fn() };
        const out = await markPatientDelivered({ db, episodes, patientId: 'P1', actor, today: '2026-11-21' });
        expect(out).toEqual({ status: 404, body: { success: false, message: 'Pasien tidak ditemukan' } });
        expect(episodes.endOngoing).not.toHaveBeenCalled();
        expect(db.calls.some(c => c.sql.includes('INSERT'))).toBe(false);
        expect(db.conn.release).toHaveBeenCalledTimes(1);
    });

    test('pregnancy write failure rolls back and rethrows', async () => {
        const db = makeDb();
        const episodes = { endOngoing: jest.fn(async () => { throw new Error('boom'); }) };
        await expect(markPatientDelivered({ db, episodes, patientId: 'P1', actor, today: '2026-11-21' })).rejects.toThrow('boom');
        expect(db.conn.rollback).toHaveBeenCalled();
        expect(db.conn.commit).not.toHaveBeenCalled();
        expect(db.conn.release).toHaveBeenCalledTimes(1);
    });
});

describe('markPatientDelivered after a reported birth', () => {
    test('a birth card already linked to the ongoing pregnancy is reused: no insert, pregnancy ended with that card', async () => {
        const db = makeDb({
            maxChild: 1,
            pregnancies: [{ id: 2, status: 'ended' }, { id: 7, status: 'ongoing' }],
            linkedBirths: [{ id: 55, child_number: 1, pregnancy_id: 7 }]
        });
        const episodes = { endOngoing: jest.fn(async () => ({ pregnancy: { id: 7 } })) };
        const out = await markPatientDelivered({ db, episodes, patientId: 'P1', actor, today: '2026-11-21' });
        expect(db.calls.some(c => c.sql.includes('INSERT'))).toBe(false);
        expect(db.calls.some(c => c.sql.includes('MAX(child_number)'))).toBe(false);
        expect(episodes.endOngoing).toHaveBeenCalledWith(
            'P1',
            { outcome: 'lahir_hidup', ended_on: '2026-11-21', linkTable: 'birth_congratulations', linkId: 55 },
            actor,
            db.conn
        );
        expect(out.status).toBe(200);
        expect(out.body.child_number).toBe(1);
        expect(out.body.message).toBe('Pasien Ibu Ani berhasil ditandai sudah melahirkan (anak ke-1)');
    });

    test('twins already reported: links the lowest child number', async () => {
        const db = makeDb({
            pregnancies: [{ id: 7, status: 'ongoing' }],
            linkedBirths: [{ id: 60, child_number: 2, pregnancy_id: 7 }, { id: 61, child_number: 3, pregnancy_id: 7 }]
        });
        const episodes = { endOngoing: jest.fn(async () => ({})) };
        const out = await markPatientDelivered({ db, episodes, patientId: 'P1', actor, today: '2026-11-21' });
        expect(episodes.endOngoing.mock.calls[0][1].linkId).toBe(60);
        expect(out.body.child_number).toBe(2);
    });

    test('pregnancies are locked before the birth rows are read', async () => {
        const db = makeDb({ pregnancies: [{ id: 7, status: 'ongoing' }], linkedBirths: [{ id: 55, child_number: 1, pregnancy_id: 7 }] });
        const episodes = { endOngoing: jest.fn(async () => ({})) };
        await markPatientDelivered({ db, episodes, patientId: 'P1', actor, today: '2026-11-21' });
        const sqls = db.calls.map(c => c.sql || '');
        const preg = sqls.findIndex(s => /FROM pregnancies WHERE patient_id = \?[\s\S]*FOR UPDATE/.test(s));
        const birth = sqls.findIndex(s => /FROM birth_congratulations[\s\S]*pregnancy_id = \?[\s\S]*FOR UPDATE/.test(s));
        expect(preg).toBeGreaterThan(-1);
        expect(birth).toBeGreaterThan(preg);
    });

    test('an ongoing pregnancy without a linked card still inserts a new card', async () => {
        const db = makeDb({ maxChild: 1, insertId: 70, pregnancies: [{ id: 7, status: 'ongoing' }], linkedBirths: [{ id: 9, child_number: 1, pregnancy_id: 2 }] });
        const episodes = { endOngoing: jest.fn(async () => ({})) };
        const out = await markPatientDelivered({ db, episodes, patientId: 'P1', actor, today: '2026-11-21' });
        expect(db.calls.some(c => c.sql.includes('INSERT INTO birth_congratulations'))).toBe(true);
        expect(episodes.endOngoing.mock.calls[0][1].linkId).toBe(70);
        expect(out.body.child_number).toBe(2);
    });
});

describe('markPatientDelivered with episode errors', () => {
    test('a status error from endOngoing is rethrown intact after rollback (route maps it)', async () => {
        const { PregnancyEpisodeError } = require('../../services/PregnancyEpisodeService');
        const { pregnancyErrorResponse } = require('../../services/PregnancyErrorResponse');
        const db = makeDb();
        const episodes = { endOngoing: jest.fn(async () => { throw new PregnancyEpisodeError(400, 'Tanggal selesai tidak boleh sebelum HPHT kehamilan tersebut'); }) };
        let err;
        try { await markPatientDelivered({ db, episodes, patientId: 'P1', actor, today: '2026-11-21' }); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(PregnancyEpisodeError);
        expect(db.conn.rollback).toHaveBeenCalled();
        expect(pregnancyErrorResponse(err, 'Gagal menandai pasien melahirkan'))
            .toMatchObject({ status: 400, body: { success: false, message: 'Tanggal selesai tidak boleh sebelum HPHT kehamilan tersebut' } });
    });
});
