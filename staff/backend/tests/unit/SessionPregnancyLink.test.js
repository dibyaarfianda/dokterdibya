const fs = require('fs');
const path = require('path');

const backend = path.resolve(__dirname, '../..');
const read = (...p) => fs.readFileSync(path.join(backend, ...p), 'utf8');

describe('Session pregnancy_id link (kick counter + contraction timer)', () => {
    test('migration adds both columns and indexes idempotently', () => {
        const sql = read('migrations', '20261124_session_pregnancy_id.sql');
        for (const [table, idx] of [
            ['kick_counter_sessions', 'idx_kick_sessions_pregnancy'],
            ['contraction_sessions', 'idx_contraction_sessions_pregnancy']
        ]) {
            const block = sql.slice(sql.indexOf('ALTER TABLE ' + table));
            expect(block.split(';')[0]).toContain('ADD COLUMN IF NOT EXISTS pregnancy_id INT NULL');
            expect(sql).toContain(`ADD INDEX IF NOT EXISTS ${idx} (pregnancy_id)`);
        }
    });

    test('both session INSERTs list pregnancy_id and use the safe lookup', () => {
        const kick = read('routes', 'kick-counter.js');
        const contraction = read('routes', 'contraction-timer.js');
        expect(kick).toMatch(/INSERT INTO kick_counter_sessions\s*\(patient_id, session_date, start_time, status, pregnancy_id\)/);
        expect(contraction).toMatch(/INSERT INTO contraction_sessions[\s\S]*?assessment_reason, pregnancy_id\)/);
        expect(kick).toContain('findOngoingPregnancyId');
        expect(contraction).toContain('findOngoingPregnancyId');
    });

    test('no runtime DDL and validator does not require the new column', () => {
        for (const f of ['kick-counter.js', 'contraction-timer.js']) {
            expect(read('routes', f)).not.toMatch(/ALTER TABLE|CREATE TABLE/i);
        }
        expect(read('services', 'OperationalSchemaValidator.js')).not.toContain('pregnancy_id');
    });

    test('helper returns the ongoing pregnancy id, or null when none', async () => {
        const { findOngoingPregnancyId } = require('../../services/SessionPregnancyLink');
        const db = { query: jest.fn().mockResolvedValue([[{ id: 42 }]]) };
        await expect(findOngoingPregnancyId(db, 'P1')).resolves.toBe(42);
        db.query.mockResolvedValue([[]]);
        await expect(findOngoingPregnancyId(db, 'P1')).resolves.toBeNull();
    });

    test('lookup failure yields null, is logged, and does not throw', async () => {
        const { findOngoingPregnancyId } = require('../../services/SessionPregnancyLink');
        const db = { query: jest.fn().mockRejectedValue(new Error('boom')) };
        const log = jest.fn();
        await expect(findOngoingPregnancyId(db, 'P1', log)).resolves.toBeNull();
        expect(log).toHaveBeenCalled();
    });
});
