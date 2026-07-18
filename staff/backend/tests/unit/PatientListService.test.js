const PatientListService = require('../../services/PatientListService');

describe('PatientListService', () => {
    test('view basic uses at most count plus page query and returns a cursor', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce([[{ total: 2 }]])
                .mockResolvedValueOnce([[
                    { id: 'P2', full_name: 'Budi', whatsapp: '0812', created_at: '2026-07-19 01:00:00' },
                    { id: 'P1', full_name: 'Ani', phone: '0813', created_at: '2026-07-18 01:00:00' }
                ]])
        };
        const service = new PatientListService(db);

        const result = await service.listBasic({ limit: 10, page: 1, last_visit_location: 'no_visit' });

        expect(db.query).toHaveBeenCalledTimes(2);
        expect(db.query.mock.calls[1][0]).toContain('SELECT p.id, p.full_name');
        expect(db.query.mock.calls[1][0]).not.toContain('medical_records');
        expect(db.query.mock.calls[1][0]).toContain('NOT EXISTS (SELECT 1 FROM sunday_clinic_records');
        expect(result.data[1].whatsapp).toBe('0813');
        expect(result.pagination).toEqual(expect.objectContaining({ total: 2, page: 1, limit: 10 }));
        expect(result.pagination.nextCursor).toBeTruthy();
    });

    test('cursor pagination seeks by the stable sort key without offset', async () => {
        const cursor = Buffer.from(JSON.stringify({
            id: 'P9',
            created_at: '2026-07-19 01:00:00'
        })).toString('base64url');
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce([[{ total: 20 }]])
                .mockResolvedValueOnce([[]])
        };
        const service = new PatientListService(db);

        await service.listBasic({ limit: 10, cursor });

        const [sql, params] = db.query.mock.calls[1];
        expect(sql).toContain('p.created_at < ?');
        expect(sql).not.toContain('OFFSET');
        expect(params).toEqual(expect.arrayContaining(['2026-07-19 01:00:00', 'P9', 10]));
    });

    test('unlimited compatibility request needs only the data query', async () => {
        const db = { query: jest.fn().mockResolvedValueOnce([[]]) };
        const service = new PatientListService(db);

        const result = await service.listBasic({ search: 'Ani' });

        expect(db.query).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ success: true, data: [], count: 0 });
    });
});
