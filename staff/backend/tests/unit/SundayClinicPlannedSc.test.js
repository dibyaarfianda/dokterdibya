jest.mock('../../db', () => ({ query: jest.fn() }));

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const db = require('../../db');
const surgery = require('../../services/SurgeryService');
const { resolveRouteAccess } = require('../../config/accessControlRegistry');

describe('patient SC schedule in every control DRD', () => {
    beforeEach(() => jest.resetAllMocks());

    test('resolves the patient from the active visit and includes SC variants and combined operations', async () => {
        db.query.mockResolvedValueOnce([[{ patient_id: 'P1' }]]).mockResolvedValueOnce([[
            { id: 1, surgery_date: '2026-10-22', surgery_time: '16:00:00', location: 'rsia_melinda', status: 'planned', op_code: 'SC', op_name_id: 'Operasi Caesar' },
            { id: 2, surgery_date: '2026-10-23', location: 'rsud_gambiran', status: 'confirmed', op_code: 'ERACS', op_name_id: 'ERACS' },
            { id: 3, surgery_date: '2026-10-24', status: 'planned', op_code: 'OTHER-OP', operation_type_other: 'SC + MOW' },
            { id: 4, surgery_date: '2026-10-24', status: 'planned', op_code: 'OTHER-OP', operation_type_other: 'Sectio Caesarea + IUD' },
            { id: 5, surgery_date: '2026-10-24', status: 'planned', op_code: 'HSC-D', op_name_id: 'Histeroskopi Diagnostik' },
            { id: 6, surgery_date: '2026-10-24', status: 'planned', op_code: 'OTHER-OP', operation_type_other: 'Laparatomi', diagnosis: 'Bekas SC' },
            { id: 7, surgery_date: '2026-10-24', status: 'cancelled', op_code: 'SC' },
            { id: 8, surgery_date: '2026-10-24', status: 'completed', op_code: 'SC' },
            { id: 9, surgery_date: '2026-10-16', status: 'planned', op_code: 'SC' },
            { id: 10, surgery_date: '2026-10-17', status: 'planned', op_code: 'RE-SC', op_name_id: 'SC Ulangan' },
            { id: 11, surgery_date: '2026-10-24', status: 'postponed', op_code: 'SC' }
        ]]);
        const result = await surgery.getPlannedScByMrId('DRD200', '2026-10-17');
        expect(result.map(item => item.id)).toEqual([1, 2, 3, 4, 10]);
        expect(result[0]).toEqual({ id: 1, surgery_date: '2026-10-22', surgery_time: '16:00', location: 'rsia_melinda', status: 'planned', operation: 'Operasi Caesar' });
        expect(db.query.mock.calls[0][1]).toEqual(['DRD200']);
        const [sql, values] = db.query.mock.calls[1];
        expect(values).toEqual(['2026-10-17', 'P1', 'P1', 'P1']);
        expect(sql).toContain('s.patient_id = ?');
        expect(sql).toContain('linked.patient_id = ?');
        expect(sql).toContain('conflict.patient_id <> ?');
        expect(sql).not.toMatch(/patient_name\s*=/);
        expect(sql).toContain('COLLATE utf8mb4_unicode_ci');
    });

    test('uses the Jakarta day at the UTC date boundary', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-10-16T18:00:00Z'));
        try {
            db.query.mockResolvedValueOnce([[{ patient_id: 'P1' }]]).mockResolvedValueOnce([[]]);
            await surgery.getPlannedScByMrId('DRD200');
            expect(db.query.mock.calls[1][1][0]).toBe('2026-10-17');
        } finally { jest.useRealTimers(); }
    });

    test('does not read schedules for unknown or ambiguous DRDs', async () => {
        db.query.mockResolvedValueOnce([[]]);
        expect(await surgery.getPlannedScByMrId('DRD999')).toBeNull();
        expect(db.query).toHaveBeenCalledTimes(1);
        db.query.mockResolvedValueOnce([[{ patient_id: 'P1' }, { patient_id: 'P2' }]]);
        await expect(surgery.getPlannedScByMrId('DRD200')).rejects.toMatchObject({ statusCode: 409 });
        expect(db.query).toHaveBeenCalledTimes(2);
    });

    test('keeps read access under medical records rather than requiring DocBoard editing', () => {
        expect(resolveRouteAccess({ sourceFile: 'sunday-clinic/records', method: 'GET', routePath: '/records/:mrId/planned-sc', handlerPrefix: 'verifyToken' }).permission)
            .toBe('medical_records.view');
    });
});

function frontend() {
    const filename = path.resolve(__dirname, '../../../public/scripts/sunday-clinic/utils/planned-sc.js');
    const source = fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8').replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '') : '';
    const panel = { innerHTML: '', hidden: true, querySelectorAll: () => [] };
    const state = { currentMrId: 'DRD200', activeSection: 'plan' };
    const root = { isConnected: true, dataset: { planningMrId: 'DRD200' }, querySelector: () => panel };
    const apiClient = { request: jest.fn() };
    const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const context = { apiClient, stateManager: { getState: () => state }, hasPermission: async () => false, escapeHtml, Date };
    vm.runInNewContext(source, context, { filename });
    return { ...context, panel, state, root };
}

describe('SC schedule reference under Planning Rencana', () => {
    const schedule = { id: 1, surgery_date: '2026-10-22', surgery_time: '16:00', location: 'rsia_melinda', status: 'planned', operation: 'SC + MOW' };

    test('loads fresh schedules and shows date, time, hospital, operation without editing the plan', async () => {
        const f = frontend();
        f.apiClient.request.mockResolvedValue({ success: true, data: [schedule] });
        await f.loadPlannedSc(f.state, f.root);
        expect(f.apiClient.request).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/sunday-clinic\/records\/DRD200\/planned-sc\?_t=/), expect.objectContaining({ method: 'GET', cache: 'no-store' }));
        expect(f.panel.hidden).toBe(false);
        expect(f.panel.innerHTML).toContain('22 Oktober 2026');
        expect(f.panel.innerHTML).toContain('16:00 WIB');
        expect(f.panel.innerHTML).toContain('RSIA Melinda');
        expect(f.panel.innerHTML).toContain('SC + MOW');
        expect(f.panel.innerHTML).not.toMatch(/textarea|onclick/);
    });

    test('hides an empty result and shows a loading failure distinctly', async () => {
        const f = frontend();
        f.apiClient.request.mockResolvedValueOnce({ success: true, data: [] });
        await f.loadPlannedSc(f.state, f.root);
        expect(f.panel.hidden).toBe(true);
        f.apiClient.request.mockRejectedValueOnce(new Error('unavailable'));
        await f.loadPlannedSc(f.state, f.root);
        expect(f.panel.hidden).toBe(false);
        expect(f.panel.innerHTML).toContain('Jadwal rencana SC belum termuat');
    });

    test('discards a late result after patient navigation or replacement of the Planning root', async () => {
        for (const navigate of [f => { f.state.currentMrId = 'DRD201'; }, f => { f.root.isConnected = false; }]) {
            const f = frontend();
            let resolve;
            f.apiClient.request.mockReturnValue(new Promise(done => { resolve = done; }));
            const pending = f.loadPlannedSc(f.state, f.root);
            navigate(f);
            resolve({ success: true, data: [schedule] });
            await pending;
            expect(f.panel.innerHTML).not.toContain('22 Oktober 2026');
        }
    });

    test('escapes schedule text and makes dates independent of device timezone', () => {
        const f = frontend();
        const html = f.plannedScMarkup([{ ...schedule, operation: '<img src=x onerror=alert(1)>' }]);
        expect(html).toContain('&lt;img');
        expect(html).not.toContain('<img');
        expect(html).toContain('22 Oktober 2026');
    });

    test('keeps the latest refresh if a prior request finishes later', async () => {
        const f = frontend();
        let resolveOld;
        f.apiClient.request.mockReturnValueOnce(new Promise(done => { resolveOld = done; }))
            .mockResolvedValueOnce({ success: true, data: [{ ...schedule, surgery_date: '2026-10-23' }] });
        const old = f.loadPlannedSc(f.state, f.root);
        await f.loadPlannedSc(f.state, f.root);
        resolveOld({ success: true, data: [schedule] });
        await old;
        expect(f.panel.innerHTML).toContain('23 Oktober 2026');
        expect(f.panel.innerHTML).not.toContain('22 Oktober 2026');
    });
});

describe('planned SC read-only HTTP handler', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../services/sunday-clinic/records.js'), 'utf8');
    const handlerSource = source.slice(source.indexOf('async function getPlannedScByMrId('), source.indexOf('async function postRecordsByMrIdBySection('));

    function handler() {
        const surgeryService = { getPlannedScByMrId: jest.fn() };
        const context = { surgeryService, normalizeMrId: value => String(value || '').trim().toUpperCase() };
        vm.runInNewContext(handlerSource, context);
        const res = { set: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();
        return { surgeryService, res, next, run: id => context.getPlannedScByMrId({ params: { mrId: id } }, res, next) };
    }

    test('returns only the resolved visit schedules with no caching', async () => {
        const h = handler();
        h.surgeryService.getPlannedScByMrId.mockResolvedValue([{ id: 1 }]);
        await h.run(' drd200 ');
        expect(h.surgeryService.getPlannedScByMrId).toHaveBeenCalledWith('DRD200');
        expect(h.res.set).toHaveBeenCalledWith('Cache-Control', expect.stringContaining('no-store'));
        expect(h.res.json).toHaveBeenCalledWith({ success: true, data: [{ id: 1 }] });
    });

    test('distinguishes missing visits, invalid input, and unavailable reads from no schedules', async () => {
        const h = handler();
        await h.run('');
        expect(h.res.status).toHaveBeenCalledWith(400);
        expect(h.surgeryService.getPlannedScByMrId).not.toHaveBeenCalled();
        h.surgeryService.getPlannedScByMrId.mockResolvedValueOnce(null);
        await h.run('DRD999');
        expect(h.res.status).toHaveBeenCalledWith(404);
        const error = new Error('DB unavailable');
        h.surgeryService.getPlannedScByMrId.mockRejectedValueOnce(error);
        await h.run('DRD200');
        expect(h.next).toHaveBeenCalledWith(error);
    });
});
