'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('draft section updates preserve the loaded server snapshot for a versioned patch', async () => {
    const filename = path.resolve(__dirname, '../../../public/scripts/sunday-clinic/utils/state-manager.js');
    const source = fs.readFileSync(filename, 'utf8')
        .replace(/^import .*;\s*$/gm, '')
        .replace('export default new StateManager();', 'globalThis.stateManager = new StateManager();');
    const context = { computeDerived: () => ({ patientId: 'fixture-a' }),
        console: { log: jest.fn(), error: jest.fn(), warn: jest.fn() }, globalThis: {} };
    vm.runInNewContext(source, context, { filename });
    const manager = context.globalThis.stateManager;
    await manager.loadRecord({ record: { mrId: 'TEST001' }, patient: { id: 'fixture-a' },
        medicalRecords: { byType: { usg: { id: 7, version: 3, data: { notes: 'previous' } } } } });

    manager.updateSectionData('usg', { notes: 'imported' });
    expect(manager.get('medicalRecords').byType.usg.data.notes).toBe('imported');
    expect(manager.get('persistedMedicalRecords').byType.usg.data.notes).toBe('previous');
});
