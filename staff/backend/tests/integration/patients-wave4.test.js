const express = require('express');
const request = require('supertest');

jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../utils/cache', () => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    delPattern: jest.fn()
}));
jest.mock('../../middleware/auth', () => ({
    verifyToken: (req, res, next) => { req.user = { id: 1, role_id: 1 }; next(); },
    verifyPatientToken: (req, res, next) => next(),
    verifyStaffToken: (req, res, next) => { req.user = { id: 1, role_id: 1 }; next(); },
    requireSuperadmin: (req, res, next) => next()
}));
jest.mock('../../services/r2Storage', () => ({}));
jest.mock('../../services/patientDeletion', () => ({
    deletePatientWithRelations: jest.fn(),
    deletePatientWithRelationsOnConnection: jest.fn()
}));
jest.mock('../../services/activityLogger', () => ({ log: jest.fn() }));
jest.mock('../../services/pushNotificationService', () => ({ getVapidPublicKey: jest.fn() }));
jest.mock('../../utils/patientAccessBlocklist', () => ({
    normalizePatientName: value => String(value || '').toLowerCase(),
    refreshConfiguredBlocklist: jest.fn(async () => ({ names: new Set() }))
}));

const db = require('../../db');
const cache = require('../../utils/cache');
const patientsRouter = require('../../routes/patients');

const app = express();
app.use(express.json());
app.use(patientsRouter);

describe('GET /api/patients wave 4 additive contract', () => {
    beforeEach(() => { jest.clearAllMocks(); cache.get.mockReset(); db.query.mockReset(); });

    test('legacy cache hit retains the bounded pagination envelope', async () => {
        const legacy = {
            success: true,
            data: [{ id: 'P1', full_name: 'Legacy', resume_status: 'sudah_simpan' }],
            count: 1,
            pagination: { total: 1, page: 1, totalPages: 1, limit: 50, nextCursor: null }
        };
        cache.get.mockReturnValueOnce(legacy);

        const response = await request(app).get('/api/patients').expect(200);

        expect(response.body).toEqual(legacy);
        expect(cache.get).toHaveBeenCalledWith(expect.stringContaining('patients:list:v2:legacy:'), 'short');
        expect(db.query).not.toHaveBeenCalled();
    });

    test('view=basic returns the paginated minimum list in two queries', async () => {
        cache.get.mockReturnValueOnce(null);
        db.query
            .mockResolvedValueOnce([[{ total: 1 }]])
            .mockResolvedValueOnce([[
                { id: 'P1', full_name: 'Basic', phone: '0812', created_at: '2026-07-19 01:00:00' }
            ]]);

        const response = await request(app)
            .get('/api/patients?view=basic&limit=10&page=1')
            .expect(200);

        expect(response.body).toEqual(expect.objectContaining({
            success: true,
            count: 1,
            data: [expect.objectContaining({ id: 'P1', full_name: 'Basic', whatsapp: '0812' })],
            pagination: expect.objectContaining({ total: 1, limit: 10 })
        }));
        expect(db.query).toHaveBeenCalledTimes(2);
        expect(db.query.mock.calls[1][0]).not.toContain('medical_records');
    });

    test('fresh=1 explicitly bypasses cache', async () => {
        cache.get.mockReturnValueOnce({ success: true, data: [{ id: 'STALE' }], count: 1 });
        db.query
            .mockResolvedValueOnce([[{ total: 0 }]])
            .mockResolvedValueOnce([[]]);

        const response = await request(app)
            .get('/api/patients?view=basic&limit=10&fresh=1')
            .expect(200);

        expect(cache.get).not.toHaveBeenCalled();
        expect(cache.del).toHaveBeenCalled();
        expect(response.headers['x-cache-status']).toBe('BYPASS');
        expect(response.body.data).toEqual([]);
    });

    test('legacy default list is bounded and always returns pagination', async () => {
        cache.get.mockReturnValue(null);
        db.query.mockImplementation(async sql => sql.includes('COUNT(') ? [[{ total: 0 }]] : [[]]);
        const response = await request(app).get('/api/patients').expect(200);
        expect(response.body.pagination).toEqual({ total: 0, page: 1, totalPages: 0, limit: 50, nextCursor: null });
        const dataCall = db.query.mock.calls.find(([sql]) => sql.includes('SELECT p.*'));
        expect(dataCall[0]).toMatch(/ORDER BY[\s\S]+LIMIT \?/);
        expect(dataCall[1]).toContain(51);
    });

    test('legacy default outer visibility/search/seek returns distinct filtered pages beyond 100', async () => {
        cache.get.mockReturnValue(null);
        const visible = Array.from({ length: 103 }, (_, index) => ({
            id: `P${String(103 - index).padStart(3, '0')}`, full_name: index === 0 ? 'OTHER' : 'KEEP',
            status: 'active', created_at: '2026-09-24 00:00:00', last_visit: null
        }));
        const population = [
            { id: 'P999', full_name: 'KEEP', status: 'inactive', created_at: '2026-09-24 00:00:00', last_visit: null },
            { id: 'P998', full_name: 'KEEP', status: 'active', quarantined: true, created_at: '2026-09-24 00:00:00', last_visit: null },
            ...visible
        ];
        db.query.mockImplementation(async (sql, params = []) => {
            const matching = visible.filter(row => !params.includes('%KEEP%') || row.full_name === 'KEEP');
            if (sql.includes('COUNT(*)')) return [[{ total: matching.length }]];
            if (!sql.includes('SELECT p.*')) return [[]];
            const outerWhere = /latest_anamnesa ON p\.id = latest_anamnesa\.patient_id\s+WHERE\s+p\.status/.test(sql);
            const outerSearch = !params.includes('%KEEP%') || /latest_anamnesa ON[\s\S]+WHERE[\s\S]+p\.full_name LIKE/.test(sql);
            const pool = outerWhere && outerSearch ? matching : population;
            const cursorId = /latest_anamnesa ON[\s\S]+WHERE[\s\S]+p\.id < \?/.test(sql)
                ? params.find(value => /^P\d{3}$/.test(String(value))) : null;
            const start = cursorId ? pool.findIndex(row => row.id === cursorId) + 1 : 0;
            return [pool.slice(start, start + Number(params[params.length - 1]))];
        });
        const first = await request(app).get('/api/patients?limit=100&fresh=1').expect(200);
        expect(first.body.pagination.total).toBe(103);
        expect(first.body.data).toHaveLength(100);
        expect(first.body.data.every(row => row.status === 'active' && !row.quarantined)).toBe(true);
        const second = await request(app).get(`/api/patients?limit=100&fresh=1&cursor=${encodeURIComponent(first.body.pagination.nextCursor)}`).expect(200);
        expect(second.body.data).toHaveLength(3);
        expect(second.body.pagination.total).toBe(103);
        expect(second.body.pagination.nextCursor).toBeNull();
        expect(new Set([...first.body.data, ...second.body.data].map(row => row.id)).size).toBe(103);
        const searched = await request(app).get('/api/patients?search=KEEP&limit=100&fresh=1').expect(200);
        expect(searched.body.pagination.total).toBe(102);
        expect(searched.body.data.every(row => row.full_name === 'KEEP')).toBe(true);
    });

    test('legacy malformed cursor is rejected instead of silently ignored', async () => {
        const response = await request(app).get('/api/patients?cursor=not-base64!').expect(400);
        expect(response.body.code).toBe('INVALID_PATIENT_CURSOR');
        expect(db.query).not.toHaveBeenCalled();
    });

    test('cache diagnostics never expose a patient search term', async () => {
        cache.get.mockReturnValueOnce({ success: true, data: [], count: 0,
            pagination: { total: 0, page: 1, totalPages: 0, limit: 50, nextCursor: null } });
        const response = await request(app).get('/api/patients?search=PRIVATE_SENTINEL').expect(200);
        expect(response.headers['x-cache-key']).not.toContain('PRIVATE_SENTINEL');
    });

    test.each(['last_visit_location=no_visit', 'hospital=rsia_melinda'])('legacy %s cursor seek precedes stable ORDER BY and count stays unseeked', async filter => {
        cache.get.mockReturnValue(null);
        db.query.mockImplementation(async sql => {
            if (sql.includes('COUNT(')) return [[{ total: 3 }]];
            if (/SELECT(?: DISTINCT)? p\.\*/.test(sql)) return [[
                { id: 'P3', full_name: 'Ani', created_at: '2026-07-19 00:00:00', last_visit: null },
                { id: 'P2', full_name: 'Budi', created_at: '2026-07-18 00:00:00', last_visit: null }
            ]];
            return [[]];
        });
        const first = await request(app).get(`/api/patients?${filter}&limit=1&fresh=1`).expect(200);
        expect(first.body.pagination.nextCursor).toBeTruthy();
        db.query.mockClear();
        await request(app).get(`/api/patients?${filter}&limit=1&cursor=${encodeURIComponent(first.body.pagination.nextCursor)}&fresh=1`).expect(200);
        const countCall = db.query.mock.calls.find(([sql]) => sql.includes('COUNT('));
        const dataCall = db.query.mock.calls.find(([sql]) => /SELECT(?: DISTINCT)? p\.\*/.test(sql));
        expect(countCall[0]).not.toContain('p.id < ?');
        expect(dataCall[0].indexOf('p.id < ?')).toBeGreaterThan(-1);
        expect(dataCall[0].indexOf('p.id < ?')).toBeLessThan(dataCall[0].lastIndexOf('ORDER BY'));
        expect(dataCall[0]).toMatch(/ORDER BY[\s\S]*p\.id DESC/);
    });

    test('legacy enrichment failure cannot be cached as a complete success', async () => {
        cache.get.mockReturnValue(null);
        db.query.mockImplementation(async sql => {
            if (sql.includes('COUNT(')) return [[{ total: 1 }]];
            if (sql.includes('SELECT p.*')) return [[{ id: 'P1', full_name: 'Ani', mr_id: 'DRD1' }]];
            if (sql.includes('SELECT DISTINCT mr_id FROM medical_records')) throw new Error('synthetic enrichment failure');
            return [[]];
        });
        const response = await request(app).get('/api/patients?limit=1').expect(503);
        expect(response.body.success).toBe(false);
        expect(cache.set).not.toHaveBeenCalled();
    });

    test('advanced search selects unique patient IDs before limit and caps its page', async () => {
        db.query.mockImplementation(async sql => {
            if (sql.includes('COUNT(')) return [[{ total: 2 }]];
            if (sql.includes('FROM patients p')) {
                return [sql.includes('LEFT JOIN sunday_clinic_records scr')
                    ? [{ id: 'P1', full_name: 'Ani' }, { id: 'P1', full_name: 'Ani' }]
                    : [{ id: 'P1', full_name: 'Ani' }, { id: 'P2', full_name: 'Budi' }]];
            }
            return [[]];
        });
        const response = await request(app).get('/api/patients/search/advanced?mr_id=DRD&limit=2').expect(200);
        expect(response.body.data.map(row => row.id)).toEqual(['P1', 'P2']);
        expect(response.body.total).toBe(2);
        const pageSql = db.query.mock.calls.find(([sql]) => sql.includes('LIMIT ? OFFSET ?'));
        expect(pageSql[0]).toContain('EXISTS');
        expect(pageSql[0]).not.toContain('LEFT JOIN sunday_clinic_records scr');
        db.query.mockClear();
        await request(app).get('/api/patients/search/advanced?limit=1000').expect(200);
        const capped = db.query.mock.calls.find(([sql]) => sql.includes('LIMIT ? OFFSET ?'));
        expect(capped[1]).toContain(100);
    });

    test('advanced enrichment error is not represented as successful complete results', async () => {
        db.query.mockImplementation(async sql => {
            if (sql.includes('COUNT(')) return [[{ total: 1 }]];
            if (sql.includes('FROM patients p')) return [[{ id: 'P1', full_name: 'Ani' }]];
            if (sql.includes('FROM birth_congratulations')) throw new Error('synthetic enrichment failure');
            return [[]];
        });
        const response = await request(app).get('/api/patients/search/advanced?limit=1').expect(503);
        expect(response.body.success).toBe(false);
    });

    test('advanced MR and visit-date filters refer to the same visit and project the matching MR', async () => {
        db.query.mockImplementation(async sql => {
            if (sql.includes('COUNT(')) return [[{ total: 0 }]];
            return [[]];
        });
        await request(app).get('/api/patients/search/advanced?mr_id=DRD&visit_date=2026-09-24&email=ani%40example.test').expect(200);
        const [countSql] = db.query.mock.calls.find(([sql]) => sql.includes('COUNT('));
        const [pageSql, pageParams] = db.query.mock.calls.find(([sql]) => sql.includes('LIMIT ? OFFSET ?'));
        expect(countSql).toMatch(/EXISTS \(SELECT 1 FROM sunday_clinic_records scr WHERE scr\.patient_id = p\.id AND scr\.mr_id LIKE \? AND DATE\(scr\.created_at\) = \?\)/);
        expect(pageSql).toMatch(/SELECT scr\.mr_id FROM sunday_clinic_records scr[\s\S]*scr\.mr_id LIKE \?[\s\S]*DATE\(scr\.created_at\) = \?/);
        expect(pageParams.slice(0, 3)).toEqual(['%DRD%', '2026-09-24', '%ani@example.test%']);
    });
});
