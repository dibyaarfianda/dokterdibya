'use strict';

const mockDb = { query: jest.fn(), getConnection: jest.fn() };
const mockGenerateEtiket = jest.fn();
const mockGenerateInvoice = jest.fn();
const mockConnection = {
    beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    query: jest.fn()
};
let mockMainBilling;
const mockGetSignedDownloadUrl = jest.fn(async key => `https://signed.example/${key}`);
jest.mock('../../services/sunday-clinic/shared', () => ({
    db: mockDb,
    logger: { error: jest.fn() },
    normalizeMrId: value => value,
    findRecordByMrId: jest.fn(async () => ({ patient_id: 'P7' })),
    isPatientUser: () => false,
    parseAdditionalBillingId: Number,
    createAdditionalBillingError: (message, statusCode = 400) => Object.assign(new Error(message), { statusCode }),
    getActorFromRequest: () => ({ actorName: 'Dokter' }),
    activityLogger: { logFromRequest: jest.fn() },
    loadAdditionalBillingDocument: jest.fn(async () => ({
        billing: { id: 8, status: 'cancelled', reference_number: 'DRD0007-T01', etiket_url: 'etikets/original.pdf', items: [{ item_type: 'obat', quantity: 1 }] },
        record: { full_name: 'Patient' }
    }))
}));
jest.mock('../../services/sunday-clinic/queue', () => ({ updateQueueStatus: jest.fn() }));
jest.mock('../../utils/pdf-generator', () => ({ generateEtiket: mockGenerateEtiket, generateInvoice: mockGenerateInvoice }));
jest.mock('../../services/r2Storage', () => ({ getSignedDownloadUrl: mockGetSignedDownloadUrl }));

const handlers = require('../../services/sunday-clinic/billing');

function response() {
    return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json: jest.fn() };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockMainBilling = { id: 7, status: 'cancelled', mr_id: 'DRD0007', etiket_url: 'etikets/original.pdf' };
    mockDb.query.mockResolvedValue([[{ id: 7, status: 'cancelled', etiket_url: 'etikets/original.pdf' }]]);
    mockDb.getConnection.mockResolvedValue(mockConnection);
    mockConnection.query.mockImplementation(async sql => {
        if (sql.includes('FROM sunday_clinic_billings') && sql.includes('FOR UPDATE')) {
            return [[mockMainBilling]];
        }
        if (sql.includes('FROM sunday_clinic_billing_items')) return [[{ id: 2, item_type: 'obat', quantity: 1 }]];
        if (sql.includes('FROM sunday_clinic_records')) return [[{ full_name: 'Patient' }]];
        return [{ affectedRows: 1 }];
    });
    mockGenerateEtiket.mockResolvedValue({ r2Key: 'etikets/generated.pdf', filename: 'generated.pdf' });
    mockGenerateInvoice.mockResolvedValue({ r2Key: 'invoices/generated.pdf', filename: 'generated.pdf' });
});

test('cancelled main etiket returns original signed object without generating', async () => {
    const res = response();
    await handlers.postBillingByMrIdPrintEtiket({ params: { mrId: 'DRD0007' } }, res, jest.fn());
    expect(res.statusCode).toBe(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ downloadUrl: 'https://signed.example/etikets/original.pdf' }));
    expect(mockGenerateEtiket).not.toHaveBeenCalled();
    expect(mockConnection.commit).toHaveBeenCalledTimes(1);
});

test('cancelled additional etiket returns original signed object without generating', async () => {
    const res = response();
    await handlers.postBillingByMrIdAdditionalByAdditionalBillingIdPrintEtiket({ params: { mrId: 'DRD0007', additionalBillingId: '8' } }, res, jest.fn());
    expect(res.statusCode).toBe(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ downloadUrl: 'https://signed.example/etikets/original.pdf' }));
    expect(mockGenerateEtiket).not.toHaveBeenCalled();
    expect(mockConnection.commit).toHaveBeenCalledTimes(1);
});

test('cancelled main etiket without original object rejects generation', async () => {
    mockMainBilling.etiket_url = null;
    const res = response();
    await handlers.postBillingByMrIdPrintEtiket({ params: { mrId: 'DRD0007' } }, res, jest.fn());
    expect(res.statusCode).toBe(409);
    expect(mockGenerateEtiket).not.toHaveBeenCalled();
});

test('cancelled additional etiket without original object rejects generation', async () => {
    require('../../services/sunday-clinic/shared').loadAdditionalBillingDocument.mockResolvedValueOnce({
        billing: { id: 8, status: 'cancelled', etiket_url: null, items: [] },
        record: { full_name: 'Patient' }
    });
    const res = response();
    await handlers.postBillingByMrIdAdditionalByAdditionalBillingIdPrintEtiket({ params: { mrId: 'DRD0007', additionalBillingId: '8' } }, res, jest.fn());
    expect(res.statusCode).toBe(409);
    expect(mockGenerateEtiket).not.toHaveBeenCalled();
});

test.each(['CANCELLED', 'cancelled ', 'paid'])('normal billing save rejects reserved status %s before database mutation', async status => {
    const res = response();
    await handlers.postBillingByMrId({ params: { mrId: 'DRD0007' }, body: { status }, user: { id: 2 } }, res, jest.fn());
    expect(res.statusCode).toBe(400);
    expect(mockDb.getConnection).not.toHaveBeenCalled();
    expect(require('../../services/sunday-clinic/shared').findRecordByMrId).not.toHaveBeenCalled();
});

test.each([
    ['postBillingByMrIdPrintEtiket', false, mockGenerateEtiket],
    ['postBillingByMrIdPrintInvoice', false, mockGenerateInvoice],
    ['postBillingByMrIdAdditionalByAdditionalBillingIdPrintEtiket', true, mockGenerateEtiket],
    ['postBillingByMrIdAdditionalByAdditionalBillingIdPrintInvoice', true, mockGenerateInvoice]
])('%s locks parent before generating and commits before replying', async (handlerName, additional, generator) => {
    if (additional) {
        mockMainBilling.status = 'paid';
        require('../../services/sunday-clinic/shared').loadAdditionalBillingDocument.mockResolvedValueOnce({
            billing: { id: 8, status: 'confirmed', reference_number: 'DRD0007-T01', items: [{ item_type: 'obat', quantity: 1 }] },
            record: { full_name: 'Patient' }
        });
    } else {
        mockMainBilling.status = 'confirmed';
    }
    const res = response();
    await handlers[handlerName]({ params: { mrId: 'DRD0007', additionalBillingId: '8' }, user: { id: 1, name: 'Dokter' } }, res, jest.fn());
    expect(generator).toHaveBeenCalledTimes(1);
    expect(mockConnection.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(mockConnection.query.mock.invocationCallOrder[0]).toBeLessThan(generator.mock.invocationCallOrder[0]);
    if (additional) {
        expect(require('../../services/sunday-clinic/shared').loadAdditionalBillingDocument)
            .toHaveBeenCalledWith('DRD0007', 8, mockConnection);
    }
    expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(mockConnection.commit.mock.invocationCallOrder[0]).toBeLessThan(res.json.mock.invocationCallOrder[0]);
});

test('failed PDF generation rolls back and releases the billing lock', async () => {
    mockMainBilling.status = 'confirmed';
    mockGenerateInvoice.mockRejectedValueOnce(new Error('R2 failed'));
    const next = jest.fn();
    await handlers.postBillingByMrIdPrintInvoice({ params: { mrId: 'DRD0007' }, user: { id: 1, name: 'Dokter' } }, response(), next);
    expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    expect(mockConnection.commit).not.toHaveBeenCalled();
    expect(mockConnection.release).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'R2 failed' }));
});
