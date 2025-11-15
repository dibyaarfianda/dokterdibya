jest.mock('../../utils/logger', () => ({
    error: jest.fn(),
    debug: jest.fn()
}));

jest.mock('../../db', () => ({
    query: jest.fn(),
    getConnection: jest.fn()
}));

const logger = require('../../utils/logger');
const pool = require('../../db');
const db = require('../../utils/database');

describe('database utilities', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('executes queries and returns rows', async () => {
        pool.query.mockResolvedValueOnce([[{ id: 1 }]]);
        const rows = await db.query('SELECT 1');
        expect(rows).toEqual([{ id: 1 }]);
    });

    it('logs and rethrows query errors', async () => {
        const error = new Error('db fail');
        pool.query.mockRejectedValueOnce(error);

        await expect(db.query('SELECT 1')).rejects.toThrow('db fail');
        expect(logger.error).toHaveBeenCalledWith('Database query error:', expect.objectContaining({
            sql: 'SELECT 1'
        }));
    });

    it('returns first row with queryOne', async () => {
        pool.query.mockResolvedValueOnce([[{ id: 1 }]]);
        const row = await db.queryOne('SELECT 1');
        expect(row).toEqual({ id: 1 });
    });

    it('handles empty results in queryOne', async () => {
        pool.query.mockResolvedValueOnce([[]]);
        const row = await db.queryOne('SELECT 1');
        expect(row).toBeNull();
    });

    it('wraps callbacks in transactions', async () => {
        const connection = {
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn()
        };
        pool.getConnection.mockResolvedValue(connection);

        const result = await db.transaction(async (conn) => {
            expect(conn).toBe(connection);
            return 'ok';
        });

        expect(connection.beginTransaction).toHaveBeenCalled();
        expect(connection.commit).toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
        expect(result).toBe('ok');
    });

    it('rolls back transactions on error', async () => {
        const connection = {
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn()
        };
        pool.getConnection.mockResolvedValue(connection);

        await expect(db.transaction(async () => {
            throw new Error('fail');
        })).rejects.toThrow('fail');

        expect(connection.rollback).toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();
    });

    it('checks existence by querying table', async () => {
        pool.query.mockResolvedValueOnce([[{}]]);
        const exists = await db.exists('patients', 'id', 1);
        expect(exists).toBe(true);
    });

    it('finds records and performs CRUD helpers', async () => {
        pool.query.mockResolvedValueOnce([[{ id: 10 }]]);
        const patient = await db.findById('patients', 10);
        expect(patient).toEqual({ id: 10 });

        pool.query.mockResolvedValueOnce([{ insertId: 5 }]);
        const insertId = await db.insert('patients', { name: 'Test' });
        expect(insertId).toBe(5);

        pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
        const updated = await db.updateById('patients', 5, { name: 'New' });
        expect(updated).toBe(1);

        pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
        const deleted = await db.deleteById('patients', 5);
        expect(deleted).toBe(1);
    });

    it('paginates queries and returns metadata', async () => {
        pool.query
            .mockResolvedValueOnce([[{ total: 20 }]])
            .mockResolvedValueOnce([[{ id: 1 }]]);

        const result = await db.paginate('SELECT * FROM patients', [], 2, 10);
        expect(result.pagination).toEqual({
            page: 2,
            limit: 10,
            total: 20,
            totalPages: 2
        });
    });

    it('performs health checks', async () => {
        pool.query.mockResolvedValueOnce([[{}]]);
        await expect(db.healthCheck()).resolves.toEqual({
            healthy: true,
            message: 'Database connection is healthy'
        });

        const error = new Error('down');
        pool.query.mockRejectedValueOnce(error);
        const health = await db.healthCheck();
        expect(health.healthy).toBe(false);
    });
});
