'use strict';

const { markPatientDelivered } = require('../../services/MarkDelivered');

function makeDb({ patient = true, maxChild = null, insertId = 41 } = {}) {
    const calls = [];
    const conn = {
        async query(sql, params) {
            calls.push({ sql, params });
            if (sql.includes('FROM patients')) return [patient ? [{ id: 'P1', full_name: 'Ibu Ani' }] : []];
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
