'use strict';

jest.mock('../../services/sunday-clinic/shared', () => ({
    db: { query: jest.fn(), getConnection: jest.fn() },
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    normalizeMrId: value => String(value || '').toUpperCase(),
    MEDIFY_SOAP_SYNC_SECTIONS: new Set()
}));
jest.mock('../../services/sunday-clinic/queue', () => ({ updateQueueStatus: jest.fn() }));

const shared = require('../../services/sunday-clinic/shared');
const { postRecordsByMrIdBySection } = require('../../services/sunday-clinic/records');

test('cached unversioned Sunday section save returns 410 without clinical mutation', async () => {
    const req = { params: { mrId: 'TEST001', section: 'anamnesa' },
        body: { keluhan_utama: 'Unsaved draft' }, user: { id: 'staff-a' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await postRecordsByMrIdBySection(req, res);
    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'VERSIONED_SECTION_REQUIRED' }));
    expect(shared.db.getConnection).not.toHaveBeenCalled();
    expect(shared.db.query).not.toHaveBeenCalled();
});
