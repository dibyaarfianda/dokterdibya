const service = require('../../services/CommOperationSyncService');

describe('COMM operation sync status', () => {
  test('Medify Melinda import is completed while Gambiran keeps its source status', () => {
    const base = {
      source_key: 'facility:case:operation', patient_name: 'Pasien Audit',
      operation_date: '2026-09-29', raw_status: 'scheduled',
    };
    expect(service.normalizeItem({ ...base, facility: 'melinda' }, {}).status).toBe('completed');
    expect(service.normalizeItem({ ...base, facility: 'melinda', raw_status: 'cancelled' }, {}).status).toBe('cancelled');
    expect(service.normalizeItem({ ...base, facility: 'melinda', raw_status: 'Batal' }, {}).status).toBe('cancelled');
    expect(service.normalizeItem({ ...base, facility: 'gambiran' }, {}).status).toBe('planned');
  });

  test('strongly matched Melinda import completes an existing schedule', async () => {
    const originalDb = service.db;
    const originalLogAudit = service.logAudit;
    const query = jest.fn().mockResolvedValue([[{ status: 'planned' }]]);
    service.db = { query };
    service.logAudit = jest.fn().mockResolvedValue();
    try {
      const item = service.normalizeItem({
        source_key: 'melinda:case:operation', facility: 'melinda',
        patient_name: 'Pasien Audit', operation_date: '2026-09-29',
        raw_status: 'scheduled',
      }, {});
      await service.updateSurgery(42, item, {}, 'source_key');
      expect(query).toHaveBeenCalledWith(expect.stringContaining('status = ?'), expect.arrayContaining(['completed', 42]));
    } finally {
      service.db = originalDb;
      service.logAudit = originalLogAudit;
    }
  });

  test('Melinda import preserves an explicitly cancelled schedule', async () => {
    const originalDb = service.db;
    const originalLogAudit = service.logAudit;
    const query = jest.fn().mockResolvedValue([[{ status: 'cancelled' }]]);
    service.db = { query };
    service.logAudit = jest.fn().mockResolvedValue();
    try {
      const item = service.normalizeItem({
        source_key: 'melinda:case:operation', facility: 'melinda',
        patient_name: 'Pasien Audit', operation_date: '2026-09-29',
        raw_status: 'scheduled',
      }, {});
      await service.updateSurgery(42, item, {}, 'source_key');
      expect(query).not.toHaveBeenCalledWith(expect.stringContaining('status = ?'), expect.anything());
    } finally {
      service.db = originalDb;
      service.logAudit = originalLogAudit;
    }
  });
});
