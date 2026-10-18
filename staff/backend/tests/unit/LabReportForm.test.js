const fs = require('fs'); const path = require('path'); const vm = require('vm');
const context = { atob: value => Buffer.from(value, 'base64').toString('binary') };
const file = path.join(__dirname, '../../../public/scripts/pages/lab-report-form.js');
if (fs.existsSync(file)) vm.runInNewContext(fs.readFileSync(file, 'utf8').replace(/export /g, ''), context);
describe('lab OCR review form', () => {
    test('draft ownership follows the token principal across refreshes and account changes', () => {
        expect(typeof context.labPrincipal).toBe('function');
        const token = id => `header.${Buffer.from(JSON.stringify({ id, user_type: 'staff' })).toString('base64url')}.signature`;
        expect(context.labPrincipal(token('A'))).toBe(context.labPrincipal(token('A')));
        expect(context.labPrincipal(token('B'))).not.toBe(context.labPrincipal(token('A')));
        expect(context.labPrincipal(token('A'), { id: 'B' })).toBe('');
        expect(context.labPrincipal('bad-token')).toBe('');
    });
    test('upload size budget includes saved sources', () => {
        expect(typeof context.labSourceBytes).toBe('function');
        expect(context.labSourceBytes([{ size: 20 }], [{ size: 7 }], [{ size: 8 }])).toBe(35);
    });
    test('applying OCR to empty fields preserves staff corrections and intentional clearing of other fields', () => {
        expect(typeof context.mergeOcrCandidates).toBe('function');
        const current = [{ code: 'hb', raw_value: '11.2', note: '', reviewed: true }, { code: 'ast', raw_value: '', note: 'Periksa ulang', reviewed: false }];
        const result = context.mergeOcrCandidates(current, [{ code: 'hb', raw_value: '9.2' }, { code: 'ast', raw_value: '20' }, { code: 'alt', raw_value: '21' }]);
        expect(result[0].raw_value).toBe('11.2');
        expect(result[0].reviewed).toBe(true);
        expect(result[1].raw_value).toBe('20');
        expect(result[1].note).toBe('Periksa ulang');
        expect(result[2].code).toBe('alt');
        expect(current[1].raw_value).toBe('');
    });
    test('edited published reports have a visible correction status', () => {
        expect(typeof context.statusLabel).toBe('function');
        expect(context.statusLabel({ version: 2, published_version: 1 })).toBe('Ada koreksi');
        expect(context.statusLabel({ version: 2, published_version: 2 })).toBe('Terbit');
        expect(context.statusLabel({ version: 1 })).toBe('Draf');
    });
    test('source removal clears only its own stable provenance and requires review again', () => {
        expect(typeof context.removeLabSource).toBe('function');
        const result = context.removeLabSource([{ code: 'hb', source_id: 'file-a', reviewed: true }, { code: 'ast', source_id: 'file-b', reviewed: true }], 'file-a');
        expect(result[0]).toMatchObject({ source_id: '', reviewed: false }); expect(result[1]).toMatchObject({ source_id: 'file-b', reviewed: true });
        expect(context.sameLabContext({ id: 1 }, { mr_id: 'DRD001', patient_id: 'P001' }, { reportId: 2 })).toBe(false);
        expect(context.sameLabContext({ id: 1 }, { mr_id: 'DRD001', patient_id: 'P001' }, { mrId: 'DRD002' })).toBe(false);
    });
    test('additional OCR cannot erase unresolved earlier source warnings', () => {
        expect(typeof context.mergeSourceWarnings).toBe('function');
        expect(context.mergeSourceWarnings(['Identitas berbeda pada A'], [])).toEqual(['Identitas berbeda pada A']);
        expect(context.mergeSourceWarnings(['A'], ['A','B'])).toEqual(['A','B']);
    });
});
