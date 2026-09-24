'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../../public/scripts/sunday-clinic/utils/medical-import.js'), 'utf8')
    .replace(/\r\n/g, '\n');

test.each([409, 412, 428])('import save propagates HTTP %s without clearing the local draft', async status => {
    const start = source.indexOf('async function persistImportedSection(');
    const end = source.indexOf('\n/**\n * Apply pending import data', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const context = { globalThis: {} };
    vm.runInNewContext(source.slice(start, end) + '\nglobalThis.persistImportedSection = persistImportedSection;', context);
    const draft = { notes: '' };
    const client = { saveSection: jest.fn().mockRejectedValue(Object.assign(new Error('Conflict'), { status })) };
    await expect(context.globalThis.persistImportedSection(client, 'TEST001', 'anamnesa', draft))
        .rejects.toMatchObject({ status });
    expect(draft).toEqual({ notes: '' });
});

test('pending/SIMRS session data is removed only after all section saves succeed', () => {
    const simrsSave = source.indexOf('await applySIMRSImportData(mappedTemplate');
    const simrsClear = source.indexOf("sessionStorage.removeItem('simrs_import_data')", simrsSave);
    expect(simrsClear).toBeGreaterThan(simrsSave);
    const pendingLoop = source.indexOf('for (const { section, data } of sectionsToSave)');
    const pendingClear = source.indexOf("sessionStorage.removeItem('pendingImportData')", pendingLoop);
    expect(pendingClear).toBeGreaterThan(pendingLoop);
    const pendingCatch = source.indexOf("console.warn('[Import] Pending data retained", pendingClear);
    expect(source.slice(pendingCatch, source.indexOf('\n}', pendingCatch))).not.toMatch(/removeItem\(/);
});
