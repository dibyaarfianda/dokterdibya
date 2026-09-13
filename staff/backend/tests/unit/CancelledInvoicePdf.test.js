'use strict';
jest.mock('../../services/r2Storage', () => ({ uploadFile: jest.fn(async (_buffer, filename, _mime, folder) => ({ key: `${folder}/${filename}` })) }));
const PDFDocument = require('pdfkit');
const generator = require('../../utils/pdf-generator');
const r2 = require('../../services/r2Storage');

test('cancelled invoice prints a clearly marked separate copy and preserves its original value', async () => {
    const textSpy = jest.spyOn(PDFDocument.prototype, 'text');
    try {
        const result = await generator.generateInvoice({
            status: 'cancelled', total: 250000, cancellation_reason: 'Kunjungan dibatalkan pasien',
            cancelled_by_name: 'Dokter Uji', cancelled_at: '2026-09-13T01:00:00Z',
            items: [{ item_type: 'tindakan', item_name: 'Konsultasi', quantity: 1, price: 250000 }]
        }, { fullName: 'Pasien Uji' }, { mrId: 'TEST-CANCEL' });
        const texts = textSpy.mock.calls.map(args => String(args[0])).join('\n');
        expect(texts).toMatch(/BATAL/);
        expect(texts).toContain('Kunjungan dibatalkan pasien');
        expect(texts).toContain('Dokter Uji');
        expect(texts).toMatch(/250[.,]000/);
        expect(result.filename).not.toBe('TEST-CANCELinv.pdf');
        expect(result.filename).toContain('cancelled');
        expect(r2.uploadFile.mock.calls[0][0].subarray(0, 4).toString()).toBe('%PDF');
    } finally { textSpy.mockRestore(); }
});
