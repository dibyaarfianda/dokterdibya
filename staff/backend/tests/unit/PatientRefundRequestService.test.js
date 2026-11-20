'use strict';

// Bayar di muka, Tahap 3: a patient asks to withdraw live saldo to a bank account. A pending
// request holds its amount; staff transfer by hand and close it, which records the refund.

jest.mock('../../db', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), http: jest.fn() }));

const logger = require('../../utils/logger');
const activityLogger = require('../../services/activityLogger');
const StaffPrepay = require('../../services/StaffPrepayService');
const Ledger = require('../../services/PatientCreditLedger');
const {
    createPatientRefundRequestService,
    holderNameDiffers,
    maskAccount
} = require('../../services/PatientRefundRequestService');

const sqlOf = sql => String(sql).replace(/\s+/g, ' ').trim();
const ACCOUNT = '1234567890';
const KEY_A = 'req-key-aaaaaaaaaaaa';
const KEY_B = 'req-key-bbbbbbbbbbbb';
const ACTOR = { id: 'S1', name: 'Kasir' };
const KEY_REUSED = 'Kunci pengajuan sudah dipakai untuk data berbeda. Muat ulang halaman lalu ajukan lagi.';
const CANCELLED_BY_PATIENT = 'Pasien sudah membatalkan pengajuan ini. Bila uang sudah ditransfer, catat sebagai refund langsung di tab Saldo.';

const liveRow = over => ({ patient_id: 'P1', category: 'obstetri', entry_type: 'prepay', amount_idr: 255000, gateway_mode: 'live', source_type: 'payment_order', source_id: '9', created_at: new Date('2026-11-20T07:48:00+07:00'), ...over });
const REQUEST_DEFAULTS = {
    patient_id: 'P1', amount_idr: 200000, bank_name: 'BCA', account_number: ACCOUNT, account_holder: 'Siti Aminah',
    status: 'pending', request_key: 'req-key-seeded-00001', refund_id: null, decision_note: null, decided_by: null,
    decided_at: null, created_at: new Date('2026-11-21T09:00:00+07:00')
};

/**
 * In-memory stand-in for MySQL: one row lock per patient ledger (taken by the live-saldo
 * FOR UPDATE read, held until commit/rollback/release) and an undo log per transaction.
 */
// hideKeyFromTransactions: the lookup by request_key inside a transaction misses (a concurrent
// insert committed after it), so the INSERT hits the unique key and throws ER_DUP_ENTRY.
function harness({ ledger, requests = [], patients = { P1: 'Ny. Siti Aminah', P2: 'Budi Santoso' }, hideKeyFromTransactions = false } = {}) {
    const state = {
        ledger: (ledger || [liveRow()]).map((row, index) => ({ id: index + 1, ...row })),
        requests: requests.map(row => ({ ...REQUEST_DEFAULTS, ...row })),
        refunds: [],
        patients
    };
    const ids = { request: Math.max(4, ...state.requests.map(row => row.id || 0)) + 1, refund: 30, ledger: 100 };
    const statements = [];
    let holder = null;
    let waiters = [];

    async function lock(owner) {
        while (holder && holder !== owner) await new Promise(resolve => waiters.push(resolve));
        holder = owner;
    }
    function unlock(owner) {
        if (holder !== owner) return;
        holder = null;
        const wake = waiters;
        waiters = [];
        wake.forEach(resolve => resolve());
    }
    const copy = rows => rows.map(row => ({ ...row }));

    async function run(owner, rawSql, params = []) {
        const sql = sqlOf(rawSql);
        statements.push({ owner: owner ? owner.name : 'pool', sql, params });
        const undo = fn => { if (owner) owner.undo.push(fn); };

        if (sql.startsWith('SELECT category, amount_idr, created_at FROM patient_credit_ledger')) {
            if (owner && sql.endsWith('FOR UPDATE')) await lock(owner);
            return [copy(state.ledger.filter(row => row.patient_id === params[0] && row.gateway_mode === 'live'))];
        }
        if (sql.startsWith('SELECT category, gateway_mode, SUM(amount_idr) AS balance_idr FROM patient_credit_ledger')) {
            const sums = new Map();
            for (const row of state.ledger.filter(entry => entry.patient_id === params[0])) {
                const key = `${row.category}|${row.gateway_mode}`;
                const entry = sums.get(key) || { category: row.category, gateway_mode: row.gateway_mode, balance_idr: 0 };
                entry.balance_idr += row.amount_idr;
                sums.set(key, entry);
            }
            return [[...sums.values()]];
        }
        if (sql.startsWith('SELECT id, entry_type, category, amount_idr, gateway_mode, source_type, source_id, created_at FROM patient_credit_ledger')) {
            return [copy(state.ledger.filter(row => row.patient_id === params[0]).sort((a, b) => b.id - a.id).slice(0, 100))];
        }
        if (sql.startsWith('INSERT INTO patient_credit_ledger')) {
            const [patient_id, category, entry_type, amount_idr, source_type, source_id, note, created_by] = params;
            const row = { id: ids.ledger++, patient_id, category, entry_type, amount_idr, gateway_mode: 'live', source_type, source_id, note, created_by, created_at: new Date() };
            state.ledger.push(row);
            undo(() => state.ledger.splice(state.ledger.indexOf(row), 1));
            return [{ insertId: row.id, affectedRows: 1 }];
        }
        if (sql.startsWith('SELECT id, mr_id FROM sunday_clinic_billings')) return [[{ id: 55, mr_id: 'DRD1600' }]];
        if (sql.startsWith('SELECT 1 FROM patient_credit_ledger WHERE patient_id = ?')) {
            return [state.ledger.some(row => row.patient_id === params[0]) ? [{ 1: 1 }] : []];
        }
        if (sql.startsWith('SELECT 1 FROM patient_credit_refund_requests WHERE patient_id = ?')) {
            return [state.requests.some(row => row.patient_id === params[0]) ? [{ 1: 1 }] : []];
        }

        if (/^SELECT id, amount_idr, request_key FROM patient_credit_refund_requests WHERE patient_id = \? AND status = 'pending'/.test(sql)) {
            return [state.requests.filter(row => row.patient_id === params[0] && row.status === 'pending')
                .map(row => ({ id: row.id, amount_idr: row.amount_idr, request_key: row.request_key }))];
        }
        if (sql.includes('FROM patient_credit_refund_requests WHERE request_key = ?')) {
            if (owner && hideKeyFromTransactions) return [[]];
            return [copy(state.requests.filter(row => row.request_key === params[0]))];
        }
        if (sql.startsWith('INSERT INTO patient_credit_refund_requests')) {
            const [patient_id, amount_idr, bank_name, account_number, account_holder, request_key] = params;
            if (state.requests.some(row => row.request_key === request_key)) {
                throw Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });
            }
            const row = { ...REQUEST_DEFAULTS, id: ids.request++, patient_id, amount_idr, bank_name, account_number, account_holder, request_key, status: 'pending', created_at: new Date() };
            state.requests.push(row);
            undo(() => state.requests.splice(state.requests.indexOf(row), 1));
            return [{ insertId: row.id, affectedRows: 1 }];
        }
        if (sql.includes('FROM patient_credit_refund_requests WHERE id = ?')) {
            const withPatient = sql.includes('AND patient_id = ?');
            return [copy(state.requests.filter(row => row.id === Number(params[0]) && (!withPatient || row.patient_id === params[1])))];
        }
        if (sql.startsWith('UPDATE patient_credit_refund_requests SET status = ?')) {
            const [status, refund_id, decision_note, decided_by, id] = params;
            const row = state.requests.find(entry => entry.id === Number(id) && entry.status === 'pending');
            if (!row) return [{ affectedRows: 0 }];
            const before = { ...row };
            Object.assign(row, { status, refund_id, decision_note, decided_by, decided_at: new Date() });
            undo(() => Object.assign(row, before));
            return [{ affectedRows: 1 }];
        }
        if (sql.includes("FROM patient_credit_refund_requests WHERE status = 'pending'")) {
            return [copy(state.requests.filter(row => row.status === 'pending').sort((a, b) => a.created_at - b.created_at || a.id - b.id))];
        }
        if (sql.includes("FROM patient_credit_refund_requests WHERE status <> 'pending'")) {
            const at = row => (row.decided_at || row.created_at).getTime();
            return [copy(state.requests.filter(row => row.status !== 'pending').sort((a, b) => at(b) - at(a) || b.id - a.id).slice(0, 100))];
        }
        if (sql.includes('FROM patient_credit_refund_requests WHERE patient_id = ? ORDER BY id DESC')) {
            return [copy(state.requests.filter(row => row.patient_id === params[0]).sort((a, b) => b.id - a.id))];
        }

        if (sql.startsWith('SELECT id, amount_idr, request_hash FROM patient_credit_refunds WHERE request_key = ?')) {
            return [copy(state.refunds.filter(row => row.request_key === params[0]))];
        }
        if (sql.startsWith('INSERT INTO patient_credit_refunds')) {
            const [patient_id, amount_idr, method, reason, request_key, request_hash, created_by, created_by_name] = params;
            const row = { id: ids.refund++, patient_id, amount_idr, method, reason, request_key, request_hash, created_by, created_by_name };
            state.refunds.push(row);
            undo(() => state.refunds.splice(state.refunds.indexOf(row), 1));
            return [{ insertId: row.id, affectedRows: 1 }];
        }
        if (sql.startsWith('SELECT id, full_name FROM patients WHERE id IN (?)')) {
            return [params[0].filter(id => state.patients[id]).map(id => ({ id, full_name: state.patients[id] }))];
        }
        throw new Error(`unexpected SQL: ${sql}`);
    }

    let connectionCount = 0;
    const connections = [];
    const db = {
        query: jest.fn((sql, params) => run(null, sql, params)),
        getConnection: jest.fn(async () => {
            const connection = { name: `c${++connectionCount}`, undo: [] };
            Object.assign(connection, {
                beginTransaction: jest.fn(async () => { connection.undo = []; }),
                commit: jest.fn(async () => { connection.undo = []; unlock(connection); }),
                rollback: jest.fn(async () => { connection.undo.reverse().forEach(fn => fn()); connection.undo = []; unlock(connection); }),
                release: jest.fn(() => unlock(connection)),
                query: jest.fn((sql, params) => run(connection, sql, params))
            });
            connections.push(connection);
            return connection;
        })
    };
    return { db, state, statements, connections };
}

function build(h, overrides = {}) {
    const realtime = { broadcast: jest.fn(() => true) };
    const service = createPatientRefundRequestService({ db: h.db, staffPrepay: StaffPrepay, realtime, ...overrides });
    return { service, realtime };
}

const request = over => ({
    patient: { id: 'P1', name: 'Ny. Siti Aminah' },
    amountIdr: 200000,
    bankName: 'BCA',
    accountNumber: ACCOUNT,
    accountHolder: 'Siti Aminah',
    requestKey: KEY_A,
    ...over
});

const everyConnectionClosed = h => h.connections.every(c => c.release.mock.calls.length === 1
    && (c.commit.mock.calls.length + c.rollback.mock.calls.length) === 1);

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(activityLogger, 'log').mockResolvedValue(null);
});
afterEach(() => jest.restoreAllMocks());

describe('helpers', () => {
    test('holderNameDiffers ignores titles, dots, spacing and case', () => {
        expect(holderNameDiffers('Budi Santoso', 'Ny. Siti Aminah')).toBe(true);
        expect(holderNameDiffers('SITI AMINAH', 'Ny. Siti  Aminah')).toBe(false);
        expect(holderNameDiffers('Ibu Siti Aminah', 'siti aminah')).toBe(false);
        expect(holderNameDiffers('Tn Budi', 'BPK. BUDI')).toBe(false);
        expect(holderNameDiffers('Andre Wijaya', 'Andre Wijaya')).toBe(false);
        expect(holderNameDiffers('Siti Aminah', '')).toBe(true);
    });

    test('maskAccount keeps only the last four digits', () => {
        expect(maskAccount('1234567890')).toBe('•••• 7890');
    });
});

describe('getPendingRefundHold and hasSaldoHistory', () => {
    test('the hold is the sum of pending amounts; a request can be left out; FOR UPDATE on request', async () => {
        const h = harness({ requests: [
            { id: 1, amount_idr: 50000 },
            { id: 2, amount_idr: 70000, status: 'done' },
            { id: 3, amount_idr: 20000, request_key: 'req-key-seeded-00003' },
            { id: 4, amount_idr: 99000, patient_id: 'P2', request_key: 'req-key-seeded-00004' }
        ] });
        expect(await Ledger.getPendingRefundHold(h.db, 'P1')).toBe(70000);
        expect(await Ledger.getPendingRefundHold(h.db, 'P1', { excludeRequestId: 3 })).toBe(50000);
        expect(h.statements[0].sql).not.toMatch(/FOR UPDATE/);
        const connection = await h.db.getConnection();
        await Ledger.getPendingRefundHold(connection, 'P1', { forUpdate: true });
        expect(h.statements[h.statements.length - 1].sql).toMatch(/status = 'pending' ORDER BY id FOR UPDATE$/);
    });

    test('a server without the requests table has no hold', async () => {
        const executor = { query: jest.fn(async () => { throw Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE' }); }) };
        await expect(Ledger.getPendingRefundHold(executor, 'P1', { forUpdate: true })).resolves.toBe(0);
        await expect(Ledger.hasSaldoHistory(executor, 'P1')).resolves.toBe(false);
    });

    test('history is any ledger row or any refund request', async () => {
        expect(await Ledger.hasSaldoHistory(harness().db, 'P1')).toBe(true);
        expect(await Ledger.hasSaldoHistory(harness({ ledger: [] }).db, 'P1')).toBe(false);
        expect(await Ledger.hasSaldoHistory(harness({ ledger: [], requests: [{ id: 1, status: 'cancelled' }] }).db, 'P1')).toBe(true);
    });
});

describe('createRequest', () => {
    test('saves a pending request under the live saldo lock and broadcasts without the account number', async () => {
        const h = harness();
        const { service, realtime } = build(h);
        const result = await service.createRequest(request());
        expect(result).toEqual({ id: 5, status: 'pending' });
        expect(h.state.requests).toEqual([expect.objectContaining({
            id: 5, patient_id: 'P1', amount_idr: 200000, bank_name: 'BCA', account_number: ACCOUNT, account_holder: 'Siti Aminah', status: 'pending', request_key: KEY_A
        })]);
        const inTx = h.statements.filter(s => s.owner === 'c1').map(s => s.sql);
        expect(inTx[0]).toMatch(/^SELECT category, amount_idr, created_at FROM patient_credit_ledger .* FOR UPDATE$/);
        expect(inTx[1]).toMatch(/^SELECT id, amount_idr, request_key FROM patient_credit_refund_requests .* FOR UPDATE$/);
        expect(everyConnectionClosed(h)).toBe(true);
        expect(await Ledger.getPendingRefundHold(h.db, 'P1')).toBe(200000);

        expect(realtime.broadcast).toHaveBeenCalledTimes(1);
        const payload = realtime.broadcast.mock.calls[0][0];
        expect(payload).toMatchObject({ type: 'checkup_prepay_refund_requested', id: 5, patientName: 'Ny. Siti Aminah', amount_idr: 200000 });
        expect(JSON.stringify(payload)).not.toContain(ACCOUNT);
        expect(payload).not.toHaveProperty('account_number');
    });

    test('an amount above the available saldo is refused with the available amount', async () => {
        const h = harness({ requests: [{ id: 1, amount_idr: 50000, status: 'done' }] });
        const { service, realtime } = build(h);
        await expect(service.createRequest(request({ amountIdr: 300000 }))).rejects.toMatchObject({
            status: 400, message: expect.stringMatching(/255[.,]000/)
        });
        expect(h.state.requests.filter(r => r.status === 'pending')).toHaveLength(0);
        expect(realtime.broadcast).not.toHaveBeenCalled();
        expect(everyConnectionClosed(h)).toBe(true);
    });

    test.each([
        ['an account with letters', { accountNumber: '12ab' }],
        ['a too short account', { accountNumber: '12345' }],
        ['an account sent as a number', { accountNumber: 1234567890 }],
        ['an amount below Rp 10.000', { amountIdr: 9999 }],
        ['a fractional amount', { amountIdr: 10000.5 }],
        ['a missing amount', { amountIdr: NaN }],
        ['a one-letter bank', { bankName: 'B' }],
        ['a too long bank', { bankName: 'B'.repeat(61) }],
        ['a short holder', { accountHolder: 'Al' }],
        ['a bad request key', { requestKey: 'short' }],
        ['a bad patient', { patient: { id: "P1' OR 1=1", name: 'x' } }]
    ])('%s is refused with 400 before the database', async (_name, over) => {
        const h = harness();
        const { service } = build(h);
        await expect(service.createRequest(request(over))).rejects.toMatchObject({ status: 400 });
        expect(h.db.getConnection).not.toHaveBeenCalled();
    });

    test('a patient with sandbox saldo only gets "Saldo uji tidak dapat dicairkan"', async () => {
        const h = harness({ ledger: [liveRow({ gateway_mode: 'sandbox', amount_idr: 115000 })] });
        const { service } = build(h);
        await expect(service.createRequest(request({ amountIdr: 100000 }))).rejects.toMatchObject({
            status: 400, message: 'Saldo uji tidak dapat dicairkan'
        });
        expect(h.state.requests).toHaveLength(0);
    });

    test('a second pending request is refused with 409', async () => {
        const h = harness({ requests: [{ id: 1, amount_idr: 50000 }] });
        const { service } = build(h);
        await expect(service.createRequest(request({ amountIdr: 100000 }))).rejects.toMatchObject({ status: 409 });
        expect(h.state.requests).toHaveLength(1);
    });

    test('the same request key returns the saved request without a second row or broadcast', async () => {
        const h = harness();
        const { service, realtime } = build(h);
        const first = await service.createRequest(request());
        const again = await service.createRequest(request());
        expect(again).toEqual(first);
        expect(h.state.requests).toHaveLength(1);
        expect(realtime.broadcast).toHaveBeenCalledTimes(1);

        await service.cancelRequest({ patientId: 'P1', id: first.id });
        await expect(service.createRequest(request())).resolves.toEqual({ id: first.id, status: 'cancelled' });
        expect(h.state.requests).toHaveLength(1);
    });

    test('the same key with a different amount, bank, account or holder is refused with 409 and no new row', async () => {
        const h = harness();
        const { service, realtime } = build(h);
        await service.createRequest(request());
        for (const changed of [
            { accountNumber: '1234567891' },
            { amountIdr: 150000 },
            { bankName: 'Mandiri' },
            { accountHolder: 'Budi Santoso' }
        ]) {
            await expect(service.createRequest(request(changed))).rejects.toMatchObject({ status: 409, message: KEY_REUSED });
        }
        expect(h.state.requests).toHaveLength(1);
        expect(h.state.requests[0]).toMatchObject({ account_number: ACCOUNT, amount_idr: 200000, bank_name: 'BCA', account_holder: 'Siti Aminah' });
        expect(realtime.broadcast).toHaveBeenCalledTimes(1);
        expect(everyConnectionClosed(h)).toBe(true);
    });

    test('the same key with the same payload, normalised as on insert, returns the saved request', async () => {
        const h = harness();
        const { service } = build(h);
        const first = await service.createRequest(request());
        await expect(service.createRequest(request({ bankName: '  BCA ', accountNumber: ` ${ACCOUNT} `, accountHolder: 'Siti   Aminah ' })))
            .resolves.toEqual(first);
        expect(h.state.requests).toHaveLength(1);
    });

    test('a request key used by another patient is refused', async () => {
        const h = harness({ ledger: [liveRow(), liveRow({ patient_id: 'P2' })], requests: [{ id: 1, request_key: KEY_A, status: 'cancelled' }] });
        const { service } = build(h);
        await expect(service.createRequest(request({ patient: { id: 'P2', name: 'Budi Santoso' } }))).rejects.toMatchObject({ status: 409 });
    });

    describe('a key inserted concurrently (the INSERT throws ER_DUP_ENTRY)', () => {
        const insertTried = h => h.statements.some(s => s.owner !== 'pool' && s.sql.startsWith('INSERT INTO patient_credit_refund_requests'));

        test("another patient's key is refused with 409", async () => {
            const h = harness({ hideKeyFromTransactions: true, requests: [{ id: 1, patient_id: 'P2', request_key: KEY_A, status: 'cancelled' }] });
            const { service, realtime } = build(h);
            await expect(service.createRequest(request())).rejects.toMatchObject({ status: 409 });
            expect(insertTried(h)).toBe(true);
            expect(h.connections[0].rollback).toHaveBeenCalled();
            expect(h.state.requests).toHaveLength(1);
            expect(realtime.broadcast).not.toHaveBeenCalled();
            expect(everyConnectionClosed(h)).toBe(true);
        });

        test('the same patient with a different payload is refused with 409', async () => {
            const h = harness({ hideKeyFromTransactions: true, requests: [{ id: 1, request_key: KEY_A, status: 'cancelled', account_number: '1234567891' }] });
            const { service } = build(h);
            await expect(service.createRequest(request())).rejects.toMatchObject({ status: 409, message: KEY_REUSED });
            expect(insertTried(h)).toBe(true);
            expect(h.state.requests).toHaveLength(1);
        });

        test('the same patient with the same payload gets the saved request', async () => {
            const h = harness({ hideKeyFromTransactions: true, requests: [{ id: 1, request_key: KEY_A, status: 'cancelled' }] });
            const { service, realtime } = build(h);
            await expect(service.createRequest(request())).resolves.toEqual({ id: 1, status: 'cancelled' });
            expect(insertTried(h)).toBe(true);
            expect(realtime.broadcast).not.toHaveBeenCalled();
        });
    });

    test('two requests racing for the same saldo: the second sees the first hold and gets 400', async () => {
        const h = harness();
        const { service } = build(h);
        const results = await Promise.allSettled([
            service.createRequest(request({ requestKey: KEY_A })),
            service.createRequest(request({ requestKey: KEY_B }))
        ]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        const refused = results.filter(r => r.status === 'rejected');
        expect(refused).toHaveLength(1);
        expect(refused[0].reason).toMatchObject({ status: 400 });
        expect(h.state.requests).toHaveLength(1);
        expect(everyConnectionClosed(h)).toBe(true);
    });
});

describe('completeRequest', () => {
    test('records exactly one transfer refund of the full amount, closes the request and is idempotent', async () => {
        const h = harness({ requests: [{ id: 5, amount_idr: 200000, request_key: KEY_A }] });
        const { service } = build(h);
        const result = await service.completeRequest({ id: 5, actor: ACTOR });
        expect(result).toEqual({ id: 5, status: 'done', refund_id: 30 });
        expect(h.state.refunds).toEqual([expect.objectContaining({
            patient_id: 'P1', amount_idr: 200000, method: 'transfer', reason: 'Pencairan atas permintaan pasien #5', request_key: 'refund-request-5'
        })]);
        expect(h.state.ledger.filter(row => row.entry_type === 'refund')).toEqual([
            expect.objectContaining({ amount_idr: -200000, source_type: 'credit_refund', source_id: '30:obstetri' })
        ]);
        expect(h.state.requests[0]).toMatchObject({ status: 'done', refund_id: 30 });
        expect(await Ledger.getPendingRefundHold(h.db, 'P1')).toBe(0);

        // Lock order: unlocked read of the request, then live saldo, then the request FOR UPDATE.
        const order = h.statements.map(s => `${s.owner}:${s.sql}`);
        const unlocked = order.findIndex(s => /^pool:SELECT .* FROM patient_credit_refund_requests WHERE id = \?$/.test(s));
        const saldoLock = order.findIndex(s => /^c1:SELECT category, amount_idr, created_at FROM patient_credit_ledger .* FOR UPDATE$/.test(s));
        const requestLock = order.findIndex(s => /^c1:SELECT .* FROM patient_credit_refund_requests WHERE id = \? FOR UPDATE$/.test(s));
        expect(unlocked).toBeGreaterThanOrEqual(0);
        expect(saldoLock).toBeGreaterThan(unlocked);
        expect(requestLock).toBeGreaterThan(saldoLock);

        const again = await service.completeRequest({ id: 5, actor: ACTOR });
        expect(again).toEqual({ id: 5, status: 'done', refund_id: 30 });
        expect(h.state.refunds).toHaveLength(1);
        expect(everyConnectionClosed(h)).toBe(true);
    });

    test('a missing request is 404; a rejected or cancelled one is 409', async () => {
        const h = harness({ requests: [
            { id: 6, status: 'rejected', request_key: 'req-key-seeded-00006' },
            { id: 7, status: 'cancelled', request_key: 'req-key-seeded-00007' }
        ] });
        const { service } = build(h);
        await expect(service.completeRequest({ id: 99, actor: ACTOR })).rejects.toMatchObject({ statusCode: 404 });
        await expect(service.completeRequest({ id: 6, actor: ACTOR })).rejects.toMatchObject({ statusCode: 409, message: 'Pengajuan ini sudah ditutup.' });
        await expect(service.completeRequest({ id: 7, actor: ACTOR })).rejects.toMatchObject({ statusCode: 409, message: CANCELLED_BY_PATIENT });
        expect(h.state.refunds).toHaveLength(0);
        expect(everyConnectionClosed(h)).toBe(true);
    });

    test('completing a request the patient already cancelled tells staff to record a direct refund', async () => {
        const h = harness({ requests: [{ id: 5, amount_idr: 200000 }] });
        const { service } = build(h);
        await service.cancelRequest({ patientId: 'P1', id: 5 });
        await expect(service.completeRequest({ id: 5, actor: ACTOR })).rejects.toMatchObject({ statusCode: 409, message: CANCELLED_BY_PATIENT });
        expect(h.state.refunds).toHaveLength(0);
        expect(h.state.ledger.filter(row => row.entry_type === 'refund')).toHaveLength(0);
        const live = (await Ledger.getLiveBalances(h.db, 'P1')).reduce((sum, entry) => sum + entry.balance_idr, 0);
        expect(live).toBe(255000);
        expect(h.state.requests[0].status).toBe('cancelled');
        expect(everyConnectionClosed(h)).toBe(true);
    });

    test('a refund the live saldo no longer covers rolls back and keeps the request pending', async () => {
        const h = harness({ ledger: [liveRow({ amount_idr: 100000 })], requests: [{ id: 5, amount_idr: 200000 }] });
        const { service } = build(h);
        await expect(service.completeRequest({ id: 5, actor: ACTOR })).rejects.toMatchObject({ statusCode: 400 });
        expect(h.state.refunds).toHaveLength(0);
        expect(h.state.requests[0].status).toBe('pending');
        expect(h.connections[0].rollback).toHaveBeenCalled();
        expect(everyConnectionClosed(h)).toBe(true);
    });

    test('another pending request of the same patient still holds its own amount', async () => {
        const h = harness({ requests: [
            { id: 5, amount_idr: 200000 },
            { id: 8, amount_idr: 50000, request_key: 'req-key-seeded-00008' }
        ] });
        const { service } = build(h);
        await expect(service.completeRequest({ id: 5, actor: ACTOR })).resolves.toMatchObject({ status: 'done' });
        expect(await Ledger.getPendingRefundHold(h.db, 'P1')).toBe(50000);
    });
});

describe('cancel and reject', () => {
    test('the patient cancels a pending request, which releases the hold; others cannot see it', async () => {
        const h = harness({ requests: [{ id: 5, amount_idr: 200000 }] });
        const { service } = build(h);
        await expect(service.cancelRequest({ patientId: 'P2', id: 5 })).rejects.toMatchObject({ status: 404 });
        await expect(service.cancelRequest({ patientId: 'P1', id: 5 })).resolves.toEqual({ id: 5, status: 'cancelled' });
        expect(await Ledger.getPendingRefundHold(h.db, 'P1')).toBe(0);
        await expect(service.cancelRequest({ patientId: 'P1', id: 5 })).resolves.toEqual({ id: 5, status: 'cancelled' });
        expect(everyConnectionClosed(h)).toBe(true);
    });

    test('a request staff already closed cannot be cancelled', async () => {
        const h = harness({ requests: [{ id: 5, status: 'done', refund_id: 30 }] });
        const { service } = build(h);
        await expect(service.cancelRequest({ patientId: 'P1', id: 5 })).rejects.toMatchObject({ status: 409 });
    });

    test('staff reject with a note, which releases the hold; a retry returns the saved state', async () => {
        const h = harness({ requests: [{ id: 5, amount_idr: 200000 }] });
        const { service } = build(h);
        await expect(service.rejectRequest({ id: 5, note: 'x', actor: ACTOR })).rejects.toMatchObject({ statusCode: 400 });
        await expect(service.rejectRequest({ id: 5, note: 'y'.repeat(501), actor: ACTOR })).rejects.toMatchObject({ statusCode: 400 });
        expect(h.db.getConnection).not.toHaveBeenCalled();

        await expect(service.rejectRequest({ id: 5, note: 'Nomor rekening tidak aktif', actor: ACTOR })).resolves.toEqual({ id: 5, status: 'rejected' });
        expect(h.state.requests[0]).toMatchObject({ status: 'rejected', decision_note: 'Nomor rekening tidak aktif' });
        expect(await Ledger.getPendingRefundHold(h.db, 'P1')).toBe(0);
        await expect(service.rejectRequest({ id: 5, note: 'Nomor rekening tidak aktif', actor: ACTOR })).resolves.toEqual({ id: 5, status: 'rejected' });
        expect(everyConnectionClosed(h)).toBe(true);
    });

    test('a done request cannot be rejected', async () => {
        const h = harness({ requests: [{ id: 5, status: 'done', refund_id: 30 }] });
        const { service } = build(h);
        await expect(service.rejectRequest({ id: 5, note: 'Terlambat', actor: ACTOR })).rejects.toMatchObject({ statusCode: 409 });
    });
});

describe('never logged', () => {
    test('createRequest, completeRequest and rejectRequest never log or broadcast the full account number', async () => {
        const consoleSpies = ['log', 'info', 'warn', 'error', 'debug'].map(method => jest.spyOn(console, method).mockImplementation(() => {}));
        const h = harness({ ledger: [liveRow(), liveRow({ patient_id: 'P2' })] });
        const { service, realtime } = build(h);
        const created = await service.createRequest(request());
        await service.completeRequest({ id: created.id, actor: ACTOR });
        const other = await service.createRequest(request({ patient: { id: 'P2', name: 'Budi Santoso' }, requestKey: KEY_B }));
        await service.rejectRequest({ id: other.id, note: 'Rekening salah', actor: ACTOR });

        const seen = JSON.stringify([
            consoleSpies.map(spy => spy.mock.calls),
            Object.values(logger).map(fn => fn.mock.calls),
            activityLogger.log.mock.calls,
            realtime.broadcast.mock.calls
        ]);
        expect(seen).not.toContain(ACCOUNT);
        expect(activityLogger.log).toHaveBeenCalledWith('S1', 'Kasir', expect.any(String), expect.stringContaining('•••• 7890'));
        expect(logger.info).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ account: '•••• 7890' }));
    });
});

describe('lists', () => {
    const seeded = () => harness({ requests: [
        { id: 1, status: 'done', refund_id: 30, created_at: new Date('2026-11-01T09:00:00+07:00'), decided_at: new Date('2026-11-02T09:00:00+07:00'), request_key: 'req-key-seeded-00001' },
        { id: 2, patient_id: 'P2', account_holder: 'Budi Santoso', created_at: new Date('2026-11-21T10:00:00+07:00'), request_key: 'req-key-seeded-00002' },
        { id: 3, account_holder: 'Budi Santoso', created_at: new Date('2026-11-21T08:00:00+07:00'), request_key: 'req-key-seeded-00003' },
        { id: 4, status: 'rejected', decision_note: 'Rekening salah', created_at: new Date('2026-11-05T09:00:00+07:00'), decided_at: new Date('2026-11-06T09:00:00+07:00'), request_key: 'req-key-seeded-00004' }
    ] });

    test('staff see pending oldest first, then closed newest first, with the "nama berbeda" flag', async () => {
        const { service } = build(seeded());
        const rows = await service.listForStaff({ canSeeAccount: true });
        expect(rows.map(row => row.id)).toEqual([3, 2, 4, 1]);
        expect(rows.find(row => row.id === 3)).toMatchObject({ patient_name: 'Ny. Siti Aminah', name_differs: true, account_number: ACCOUNT });
        expect(rows.find(row => row.id === 2)).toMatchObject({ patient_name: 'Budi Santoso', name_differs: false });
        expect(rows.find(row => row.id === 1)).toMatchObject({ name_differs: false, refund_id: 30, status: 'done' });
    });

    test('without billing.reset the account number is masked', async () => {
        const { service } = build(seeded());
        const rows = await service.listForStaff({ canSeeAccount: false });
        expect(JSON.stringify(rows)).not.toContain(ACCOUNT);
        expect(rows.every(row => row.account_number === '•••• 7890')).toBe(true);
    });

    test('the patient sees only their own requests with the full account number', async () => {
        const { service } = build(seeded());
        const rows = await service.listForPatient('P1');
        expect(rows.map(row => row.id)).toEqual([4, 3, 1]);
        expect(rows[0]).toMatchObject({ account_number: ACCOUNT, status: 'rejected', decision_note: 'Rekening salah' });
        expect(rows[0]).not.toHaveProperty('request_key');
    });

    test('the saldo page shows live and sandbox, the available amount, history and requests', async () => {
        const h = harness({
            ledger: [
                liveRow(),
                liveRow({ gateway_mode: 'sandbox', amount_idr: 115000, source_id: '10' }),
                liveRow({ entry_type: 'usage', amount_idr: -20000, source_type: 'sunday_clinic_billing', source_id: '55:obstetri' })
            ],
            requests: [{ id: 5, amount_idr: 200000 }]
        });
        const { service } = build(h);
        const saldo = await service.getSaldo('P1');
        expect(saldo.balances).toEqual({ live: 235000, sandbox: 115000 });
        expect(saldo.available_idr).toBe(35000);
        expect(saldo.history[0]).toEqual({
            entry_type: 'usage', category_label: 'Kehamilan (Obstetri)', amount_idr: -20000, gateway_mode: 'live',
            created_at: expect.any(Date), mr_id: 'DRD1600'
        });
        expect(saldo.history).toHaveLength(3);
        expect(saldo.requests).toEqual([expect.objectContaining({ id: 5, status: 'pending', account_number: ACCOUNT })]);
    });
});

describe('wiring', () => {
    test('the socket event needs billing.view', () => {
        const realtimePermissions = require('../../security/realtimePermissions');
        expect(realtimePermissions.EVENT_PERMISSIONS.checkup_prepay_refund_requested).toBe('billing.view');
    });

    test('the Pembayaran di Muka red dot also reads new refund requests', () => {
        const { MENU_ACTIVITY_SOURCES } = require('../../config/menu-activity-sources');
        expect(MENU_ACTIVITY_SOURCES['nav-prepay']).toContainEqual({ table: 'patient_credit_refund_requests', columns: ['created_at'] });
    });
});
