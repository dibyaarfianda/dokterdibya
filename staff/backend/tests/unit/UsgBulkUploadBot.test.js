'use strict';

jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));
jest.mock('../../services/r2Storage', () => ({ uploadFile: jest.fn() }));
jest.mock('../../routes/patient-notifications', () => ({
    createPatientNotification: jest.fn().mockResolvedValue({ success: true })
}));
jest.mock('../../realtime-sync', () => ({ broadcast: jest.fn() }));

const dns = require('dns').promises;
const cron = require('node-cron');
const {
    buildUniqueMappings,
    sundayClinicDateIso,
    assertSafeZipUrl,
    parseZipFolders
} = require('../../services/UsgBulkUploadService');
const scheduler = require('../../services/UsgBulkUploadBotScheduler');
const AdmZip = require('adm-zip');

function zipBuffer(folderName) {
    const zip = new AdmZip();
    zip.addFile(`${folderName}/image.jpg`, Buffer.from('test-image'));
    return zip.toBuffer();
}

describe('USG bulk upload Grok bot helpers', () => {
    test('sundayClinicDateIso returns the current Jakarta Sunday including today', () => {
        expect(sundayClinicDateIso(new Date('2026-09-06T14:00:00+07:00'))).toBe('2026-09-06');
        expect(sundayClinicDateIso(new Date('2026-09-09T09:00:00+07:00'))).toBe('2026-09-06');
        expect(sundayClinicDateIso(new Date('2026-09-09T21:30:00+07:00'))).toBe('2026-09-06');
    });

    test('buildUniqueMappings keeps only single-match folders', () => {
        const mappings = buildUniqueMappings([
            {
                folderName: 'NY NIA',
                status: 'matched',
                selectedPatient: 'P1',
                matchedPatients: [{ patient_id: 'P1', mr_id: 'DRD1', scr_id: 1 }],
                files: [{ name: 'a.jpg', path: 'NY NIA/a.jpg' }]
            },
            {
                folderName: 'NY SITI',
                status: 'multiple_matches',
                selectedPatient: null,
                matchedPatients: [
                    { patient_id: 'P2', mr_id: 'DRD2', scr_id: 2 },
                    { patient_id: 'P3', mr_id: 'DRD3', scr_id: 3 }
                ],
                files: []
            }
        ]);

        expect(mappings).toEqual([{
            folderName: 'NY NIA',
            patient_id: 'P1',
            mr_id: 'DRD1',
            scr_id: 1,
            files: [{ name: 'a.jpg', path: 'NY NIA/a.jpg' }]
        }]);
    });

    test('assertSafeZipUrl rejects private and non-https URLs', async () => {
        await expect(assertSafeZipUrl('http://example.com/a.zip')).rejects.toThrow('HTTPS');
        await expect(assertSafeZipUrl('https://localhost/a.zip')).rejects.toThrow('tidak diizinkan');
        await expect(assertSafeZipUrl('https://127.0.0.1/a.zip')).rejects.toThrow('tidak diizinkan');
    });

    test('assertSafeZipUrl rewrites Google Drive file links', async () => {
        const lookupSpy = jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '142.250.4.139', family: 4 }]);
        const safeUrl = await assertSafeZipUrl('https://drive.google.com/file/d/abc123/view');
        expect(safeUrl).toContain('export=download');
        expect(safeUrl).toContain('id=abc123');
        lookupSpy.mockRestore();
    });

    test('parseZipFolders reads patient folders from a ZIP buffer', () => {
        const { folderMap } = parseZipFolders(zipBuffer('09082026-103314_NY. NIA'));
        expect([...folderMap.keys()]).toEqual(['09082026-103314_NY. NIA']);
    });
});

describe('UsgBulkUploadBotScheduler', () => {
    test('schedules Sunday 21:00 Asia/Jakarta', () => {
        scheduler.initScheduler();
        expect(scheduler.CRON_EXPRESSION).toBe('0 21 * * 0');
        expect(scheduler.TIMEZONE).toBe('Asia/Jakarta');
        expect(cron.schedule).toHaveBeenCalledWith(
            '0 21 * * 0',
            expect.any(Function),
            { timezone: 'Asia/Jakarta' }
        );
    });
});
