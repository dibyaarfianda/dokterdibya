const PatientListService = require('../../services/PatientListService');
const { encodeCursor, decodeCursor, scopeOf } = require('../../services/PatientListCursor');

describe('PatientListService', () => {
    test('cursor is stateless, tamper-resistant and hides patient name and ID', () => {
        const terms = [{ column: 'p.full_name', field: 'full_name', direction: 'ASC' },
            { column: 'p.id', field: 'id', direction: 'ASC' }];
        const scope = scopeOf({ view: 'basic', sort: 'name', search: '', limit: 50 });
        const token = encodeCursor({ full_name: 'SYNTHETIC_PATIENT_NAME', id: 'PRIVATE_PATIENT_ID' }, terms, scope, 1);
        const raw = Buffer.from(token, 'base64url').toString('utf8');
        expect(raw).not.toContain('SYNTHETIC_PATIENT_NAME');
        expect(raw).not.toContain('PRIVATE_PATIENT_ID');
        expect(decodeCursor(token, scope, terms)).toEqual(expect.objectContaining({ keys: ['SYNTHETIC_PATIENT_NAME', 'PRIVATE_PATIENT_ID'], page: 1 }));
        const altered = Buffer.from(token, 'base64url');
        altered[altered.length - 1] ^= 1;
        expect(() => decodeCursor(altered.toString('base64url'), scope, terms)).toThrow();
    });
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
        expect(result.pagination.nextCursor).toBeNull();
        expect(db.query.mock.calls[1][0]).toContain('LIMIT ?');
        expect(db.query.mock.calls[1][1]).toContain(11);
    });

    test('cursor pagination seeks by the stable sort key without offset', async () => {
        const firstDb = { query: jest.fn()
            .mockResolvedValueOnce([[{ total: 20 }]])
            .mockResolvedValueOnce([[{ id: 'P9', created_at: '2026-07-19 01:00:00' }, { id: 'P8', created_at: null }]]) };
        const cursor = (await new PatientListService(firstDb).listBasic({ limit: 1 })).pagination.nextCursor;
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce([[{ total: 20 }]])
                .mockResolvedValueOnce([[]])
        };
        const service = new PatientListService(db);

        await service.listBasic({ limit: 1, cursor });

        const [sql, params] = db.query.mock.calls[1];
        expect(sql).toContain('p.created_at < ?');
        expect(sql).not.toContain('OFFSET');
        expect(params).toEqual(expect.arrayContaining(['2026-07-19 01:00:00', 'P9', 2]));
        expect(db.query.mock.calls[0][0]).not.toContain('p.created_at < ?');
    });

    test('omitted and excessive limits are bounded with pagination', async () => {
        const db = { query: jest.fn().mockImplementation(async sql => sql.includes('COUNT(*)') ? [[{ total: 0 }]] : [[]]) };
        const service = new PatientListService(db);
        const result = await service.listBasic({ search: 'Ani' });
        expect(result.pagination).toEqual({ total: 0, page: 1, totalPages: 0, limit: 50, nextCursor: null });
        expect(db.query.mock.calls[1][1]).toContain(51);
        await service.listBasic({ limit: 1000 });
        expect(db.query.mock.calls[3][1]).toContain(101);
    });

    test('malformed or filter-incompatible cursor rejects before a query', async () => {
        const db = { query: jest.fn().mockResolvedValueOnce([[{ total: 2 }]])
            .mockResolvedValueOnce([[{ id: 'P1', full_name: 'Ani', created_at: '2026-07-19 01:00:00' }, { id: 'P2', full_name: 'Budi' }]]) };
        const service = new PatientListService(db);
        const cursor = (await service.listBasic({ search: 'Ani', limit: 1 })).pagination.nextCursor;
        db.query.mockClear();
        await expect(service.listBasic({ cursor: 'not-base64!', search: 'Ani' })).rejects.toMatchObject({ statusCode: 400 });
        await expect(service.listBasic({ cursor: '', search: 'Ani' })).rejects.toMatchObject({ statusCode: 400 });
        await expect(service.listBasic({ cursor, search: 'Budi', limit: 1 })).rejects.toMatchObject({ statusCode: 400 });
        await expect(service.listBasic({ cursor, search: 'Ani', sort: 'name', limit: 1 })).rejects.toMatchObject({ statusCode: 400 });
        expect(db.query).not.toHaveBeenCalled();
    });

    test('name cursor seeks across equal and null keys with patient ID tie-breaker', async () => {
        const db = { query: jest.fn()
            .mockResolvedValueOnce([[{ total: 4 }]])
            .mockResolvedValueOnce([[{ id: 'P1', full_name: null }, { id: 'P2', full_name: null }, { id: 'P3', full_name: 'Ani' }]])
            .mockResolvedValueOnce([[{ total: 4 }]])
            .mockResolvedValueOnce([[{ id: 'P3', full_name: 'Ani' }]]) };
        const service = new PatientListService(db);
        const first = await service.listBasic({ sort: 'name', limit: 2 });
        expect(first.pagination.nextCursor).toBeTruthy();
        const second = await service.listBasic({ sort: 'name', limit: 2, cursor: first.pagination.nextCursor });
        expect(db.query.mock.calls[2][0]).not.toContain('p.full_name IS NOT NULL');
        expect(db.query.mock.calls[3][0]).toContain('p.full_name IS NOT NULL');
        expect(db.query.mock.calls[3][0]).toContain('p.id > ?');
        expect(second.pagination.total).toBe(4);
        expect(second.pagination.nextCursor).toBeNull();
    });
});
