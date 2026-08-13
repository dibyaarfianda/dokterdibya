const express = require('express');
const request = require('supertest');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const mockDb = {
    query: jest.fn()
};
const mockR2Storage = {
    uploadFile: jest.fn()
};

jest.mock('../../db', () => mockDb);
jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));
jest.mock('../../middleware/auth', () => ({
    verifyToken: (req, res, next) => {
        req.user = { id: 1, name: 'Test Dokter' };
        next();
    }
}));
jest.mock('../../services/r2Storage', () => mockR2Storage);
jest.mock('../../routes/patient-notifications', () => ({
    createPatientNotification: jest.fn().mockResolvedValue({ success: true })
}));
jest.mock('../../realtime-sync', () => ({
    broadcast: jest.fn()
}));

const usgBulkUploadRoutes = require('../../routes/usg-bulk-upload');
const {
    extractPatientName,
    findBestNameMatches,
    getPatientsForDate,
    resolveVisitRecord
} = require('../../services/UsgBulkUploadMatchingService');

function createApp() {
    const app = express();
    app.use('/api/usg-bulk-upload', usgBulkUploadRoutes);
    return app;
}

function createZip(folderName) {
    const zip = new AdmZip();
    zip.addFile(`${folderName}/image.jpg`, Buffer.from('test-image'));
    return zip.toBuffer();
}

const sameDayCandidates = [
    {
        patient_id: 'P2026327',
        full_name: 'Nia Eka Safitri',
        mr_id: 'DRD1089',
        mr_category: 'obstetri',
        scr_id: 1148
    },
    {
        patient_id: 'P2026112',
        full_name: 'Avissa Divania',
        mr_id: 'DRD1115',
        mr_category: 'obstetri',
        scr_id: 1174
    },
    {
        patient_id: 'P2026289',
        full_name: 'Kurnia Mubintari',
        mr_id: 'DRD1106',
        mr_category: 'obstetri',
        scr_id: 1165
    },
    {
        patient_id: 'P2026117',
        full_name: 'Ihdha Tri Kurniasari',
        mr_id: 'DRD1104',
        mr_category: 'obstetri',
        scr_id: 1163
    }
];

describe('USG bulk upload patient matching regressions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockR2Storage.uploadFile.mockResolvedValue({
            filename: 'bulk-test.jpg',
            key: 'usg-photos/bulk-test.jpg'
        });
        mockDb.query.mockImplementation(async (sql) => {
            if (sql.includes('FROM sunday_appointments')) {
                return [sameDayCandidates];
            }

            if (sql.includes('FROM patients p')) {
                return [[sameDayCandidates[1], sameDayCandidates[2], sameDayCandidates[3]]];
            }

            return [[]];
        });
    });

    test('matches NIA only to Nia Eka Safitri from the 9 August visit list', async () => {
        const response = await request(createApp())
            .post('/api/usg-bulk-upload/preview')
            .field('hospital', 'klinik_private')
            .field('date', '2026-08-09')
            .attach('zipFile', createZip('09082026-103314_NY. NIA'), {
                filename: 'usg-09082026.zip',
                contentType: 'application/zip'
            });

        expect(response.status).toBe(200);
        expect(response.body.folders).toHaveLength(1);
        expect(response.body.folders[0]).toEqual(expect.objectContaining({
            extractedName: 'NIA',
            status: 'matched',
            selectedPatient: 'P2026327',
            matchedPatients: [expect.objectContaining({
                patient_id: 'P2026327',
                full_name: 'Nia Eka Safitri',
                mr_id: 'DRD1089',
                scr_id: 1148
            })]
        }));
    });

    test('supports both legacy timestamp folders and simple patient folders', () => {
        expect(extractPatientName('09082026-103314_NY. NIA')).toBe('NIA');
        expect(extractPatientName('Nia')).toBe('NIA');
        expect(extractPatientName('09082026/Nia')).toBe('NIA');
    });

    test.each([
        ['NIA', 'Nia Eka Safitri'],
        ['MELIA', 'Melia Dwi Kristanti'],
        ['DEWI ULAN', 'Dewi Ulan'],
        ['ANNISA', 'Annisa Awaliyah Mahmud'],
        ['HEPPITA', 'Heppita Dilla Meza']
    ])('selects the strongest same-day match for %s', (folderName, expectedName) => {
        const candidates = [
            { patient_id: '1', full_name: 'Avissa Divania' },
            { patient_id: '2', full_name: 'Kurnia Mubintari' },
            { patient_id: '3', full_name: 'Ihdha Tri Kurniasari' },
            { patient_id: '4', full_name: 'Amelia Febrina' },
            { patient_id: '5', full_name: 'Nia Eka Safitri' },
            { patient_id: '6', full_name: 'Melia Dwi Kristanti' },
            { patient_id: '7', full_name: 'Dewi Ulan' },
            { patient_id: '8', full_name: 'Dewi Lestari' },
            { patient_id: '9', full_name: 'Annisa Awaliyah Mahmud' },
            { patient_id: '10', full_name: 'Heppita Dilla Meza' }
        ];

        expect(findBestNameMatches(folderName, candidates).map((row) => row.full_name)).toEqual([expectedName]);
    });

    test('keeps an equal same-day name tie for manual selection', () => {
        const matches = findBestNameMatches('NIA', [
            { patient_id: 'P1', full_name: 'Nia Eka Safitri' },
            { patient_id: 'P2', full_name: 'Nia Kartika' },
            { patient_id: 'P3', full_name: 'Kurnia Mubintari' }
        ]);

        expect(matches.map((row) => row.patient_id)).toEqual(['P1', 'P2']);
    });

    test('uses only selected-day candidates and does not run a global patient search', async () => {
        const response = await request(createApp())
            .post('/api/usg-bulk-upload/preview')
            .field('hospital', 'klinik_private')
            .field('date', '2026-08-09')
            .attach('zipFile', createZip('Nia'), {
                filename: 'simple-folder.zip',
                contentType: 'application/zip'
            });

        expect(response.status).toBe(200);
        expect(response.body.allPatients.map((row) => row.patient_id)).toEqual(
            expect.arrayContaining(sameDayCandidates.map((row) => row.patient_id))
        );
        expect(mockDb.query.mock.calls.some(([sql]) => sql.includes('LOWER(p.full_name) LIKE'))).toBe(false);
    });

    test('marks a folder date that differs from the selected visit date', async () => {
        const response = await request(createApp())
            .post('/api/usg-bulk-upload/preview')
            .field('hospital', 'klinik_private')
            .field('date', '2026-08-09')
            .attach('zipFile', createZip('10082026-103314_NY. NIA'), {
                filename: 'wrong-date.zip',
                contentType: 'application/zip'
            });

        expect(response.status).toBe(200);
        expect(response.body.folders[0]).toEqual(expect.objectContaining({
            status: 'date_mismatch',
            matchedPatients: []
        }));
    });

    test('builds Klinik Privat candidates from Sunday appointments plus same-day walk-ins', async () => {
        const query = jest.fn()
            .mockResolvedValueOnce([[sameDayCandidates[0]]])
            .mockResolvedValueOnce([[sameDayCandidates[1]]]);

        const candidates = await getPatientsForDate({ query }, '2026-08-09', 'klinik_private');

        expect(candidates.map((row) => row.patient_id)).toEqual(['P2026112', 'P2026327']);
        expect(query.mock.calls[0][0]).toContain('FROM sunday_appointments');
        expect(query.mock.calls[1][0]).toContain('FROM sunday_clinic_records scr');
    });

    test('builds hospital candidates from appointments at the selected date and location', async () => {
        const hospitalPatient = {
            patient_id: 'P-RS-1',
            full_name: 'Pasien Melinda',
            mr_id: 'DRD2001',
            mr_category: 'obstetri',
            scr_id: 2001
        };
        const query = jest.fn()
            .mockResolvedValueOnce([[hospitalPatient]])
            .mockResolvedValueOnce([[]]);

        const candidates = await getPatientsForDate({ query }, '2026-08-09', 'rsia_melinda');

        expect(candidates).toEqual([hospitalPatient]);
        expect(query.mock.calls[0][0]).toContain('FROM appointments a');
        expect(query.mock.calls[0][1]).toEqual([
            '2026-08-09',
            '2026-08-09',
            '2026-08-09',
            'rsia_melinda'
        ]);
    });

    test('frontend carries scr_id from preview selection into execute mappings', () => {
        const frontend = fs.readFileSync(
            path.resolve(__dirname, '../../../public/scripts/usg-bulk-upload.js'),
            'utf8'
        );

        expect(frontend).toMatch(/data-scr="\$\{p\.scr_id \|\| ''\}"/);
        expect(frontend).toMatch(/scr_id = hiddenInput\.dataset\.scr/);
        expect(frontend).toMatch(/scr_id = selectInput\.options\[selectInput\.selectedIndex\]\.dataset\.scr/);
        expect(frontend).toMatch(/patient_id,\s*mr_id,\s*scr_id,\s*files:/);
    });

    test('resolves a pre-created DRD through its appointment date', async () => {
        const query = jest.fn().mockResolvedValueOnce([[
            { id: 1148, mr_id: 'DRD1089', patient_id: 'P2026327', visit_location: 'klinik_private' }
        ]]);

        const visit = await resolveVisitRecord({ query }, {
            scrId: 1148,
            mrId: 'DRD1089',
            patientId: 'P2026327',
            date: '2026-08-09',
            hospital: 'klinik_private'
        });

        expect(visit).toEqual(expect.objectContaining({ id: 1148, mr_id: 'DRD1089' }));
        expect(query.mock.calls[0][0]).toContain('sa.appointment_date = ?');
        expect(query.mock.calls[0][1]).toEqual([1148, 'P2026327', 'klinik_private', '2026-08-09', '2026-08-09', '2026-08-09']);
    });

    test('executes against the selected visit DRD instead of a newer DRD at the same hospital', async () => {
        mockDb.query.mockImplementation(async (sql) => {
            if (sql.includes('SELECT scr.id, scr.mr_id')) {
                return [[{ id: 1148, mr_id: 'DRD1089', patient_id: 'P2026327', visit_location: 'klinik_private' }]];
            }
            if (sql.includes("record_type = 'usg'")) return [[]];
            return [{ affectedRows: 1, insertId: 1 }];
        });

        const mappings = [{
            folderName: '09082026-103314_NY. NIA',
            patient_id: 'P2026327',
            mr_id: 'DRD1089',
            scr_id: 1148,
            files: [{ name: 'image.jpg', path: '09082026-103314_NY. NIA/image.jpg' }]
        }];

        const response = await request(createApp())
            .post('/api/usg-bulk-upload/execute')
            .field('hospital', 'klinik_private')
            .field('date', '2026-08-09')
            .field('mappings', JSON.stringify(mappings))
            .attach('zipFile', createZip('09082026-103314_NY. NIA'), {
                filename: 'execute.zip',
                contentType: 'application/zip'
            });

        expect(response.status).toBe(200);
        expect(response.body.results[0]).toEqual(expect.objectContaining({
            status: 'success',
            patient_id: 'P2026327',
            mr_id: 'DRD1089'
        }));
        const medicalRecordLookup = mockDb.query.mock.calls.find(([sql]) => sql.includes("record_type = 'usg'"));
        expect(medicalRecordLookup[1]).toEqual(['P2026327', 'DRD1089']);
    });
});
