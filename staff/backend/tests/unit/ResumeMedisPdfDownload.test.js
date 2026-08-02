const fs = require('fs');
const path = require('path');

jest.mock('../../services/r2Storage', () => ({
    uploadFile: jest.fn(async (buffer, filename, contentType, folder) => ({
        key: `${folder}/${filename}`,
        url: `https://example.invalid/${folder}/${filename}`
    }))
}));

const r2Storage = require('../../services/r2Storage');
const pdfGenerator = require('../../utils/pdf-generator');

const repoRoot = path.resolve(__dirname, '../../../..');

describe('Resume medis PDF download', () => {
    test('generates and uploads a valid PDF from saved resume text', async () => {
        const result = await pdfGenerator.generateResumeMedis(
            { resume: 'I. RINGKASAN\nPasien dalam kondisi baik.' },
            { fullName: 'Pasien Uji', age: 32 },
            { mrId: 'DRD0099' }
        );

        expect(result.filename).toBe('DRD0099_resume.pdf');
        expect(result.r2Key).toContain('resume-medis/');
        expect(r2Storage.uploadFile).toHaveBeenCalledWith(
            expect.any(Buffer),
            'DRD0099_resume.pdf',
            'application/pdf',
            expect.stringMatching(/^resume-medis\/\d{8}$/)
        );

        const [pdfBuffer] = r2Storage.uploadFile.mock.calls[0];
        expect(pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
    });

    test('opens the R2 signed URL directly without a cross-origin fetch', () => {
        const source = fs.readFileSync(
            path.join(repoRoot, 'staff', 'public', 'scripts', 'sunday-clinic', 'main.js'),
            'utf8'
        ).replace(/\r\n/g, '\n');
        const handler = source.match(/window\.downloadResumePDF = async \(\) => \{[\s\S]*?\n\};/);

        expect(handler).not.toBeNull();
        expect(handler[0]).toContain("window.open(genResult.data.downloadUrl, '_blank')");
        expect(handler[0]).not.toContain('fetch(genResult.data.downloadUrl');
        expect(handler[0]).not.toContain('downloadResponse.blob()');
    });
});
