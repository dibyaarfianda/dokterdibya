jest.mock('../../db', () => ({
    query: jest.fn()
}));

jest.mock('../../routes/patient-notifications', () => ({
    createPatientNotification: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

const fs = require('fs');
const path = require('path');
const db = require('../../db');
const { createPatientNotification } = require('../../routes/patient-notifications');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');

let PatientDocumentSyncService;
try {
    PatientDocumentSyncService = require('../../services/PatientDocumentSyncService');
} catch (error) {
    PatientDocumentSyncService = {};
}

describe('PatientDocumentSyncService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('syncs new penunjang files into patient_documents and notifies the patient', async () => {
        expect(typeof PatientDocumentSyncService.syncPenunjangLabResults).toBe('function');

        db.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ insertId: 91 }]);
        createPatientNotification.mockResolvedValueOnce({ success: true, id: 1001 });

        const result = await PatientDocumentSyncService.syncPenunjangLabResults({
            patientId: 'P001',
            mrId: 'DRD0001',
            files: [
                {
                    name: 'lab-a.pdf',
                    url: '/api/lab-results/file/lab-a.pdf',
                    key: 'lab-results/lab-a.pdf',
                    type: 'application/pdf',
                    size: 2048
                }
            ],
            actorUserId: 'USR001'
        });

        expect(result).toEqual({ added: 1, removed: 0 });
        expect(db.query).toHaveBeenNthCalledWith(
            1,
            expect.stringContaining('FROM patient_documents'),
            ['P001', 'DRD0001']
        );
        expect(db.query).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining("INSERT INTO patient_documents"),
            [
                'P001',
                'DRD0001',
                'lab-a.pdf',
                '/api/lab-results/file/lab-a.pdf',
                'lab-results/lab-a.pdf',
                'lab-a.pdf',
                'application/pdf',
                2048,
                'USR001',
                'USR001'
            ]
        );
        expect(createPatientNotification).toHaveBeenCalledWith(expect.objectContaining({
            patient_id: 'P001',
            title: 'Hasil Lab Baru',
            link: '/hasil-lab.html'
        }));
    });

    it('does not create duplicate portal documents for the same file URL', async () => {
        expect(typeof PatientDocumentSyncService.syncPenunjangLabResults).toBe('function');

        db.query.mockResolvedValueOnce([[
            { id: 11, file_url: '/api/lab-results/file/lab-a.pdf' }
        ]]);

        const result = await PatientDocumentSyncService.syncPenunjangLabResults({
            patientId: 'P001',
            mrId: 'DRD0001',
            files: [
                {
                    name: 'lab-a.pdf',
                    url: '/api/lab-results/file/lab-a.pdf',
                    key: 'lab-results/lab-a.pdf',
                    type: 'application/pdf',
                    size: 2048
                }
            ],
            actorUserId: 'USR001'
        });

        expect(result).toEqual({ added: 0, removed: 0 });
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(createPatientNotification).not.toHaveBeenCalled();
    });

    it('removes portal documents that were deleted from DRD penunjang', async () => {
        expect(typeof PatientDocumentSyncService.syncPenunjangLabResults).toBe('function');

        db.query
            .mockResolvedValueOnce([[
                { id: 11, file_url: '/api/lab-results/file/old.pdf' }
            ]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        const result = await PatientDocumentSyncService.syncPenunjangLabResults({
            patientId: 'P001',
            mrId: 'DRD0001',
            files: [],
            actorUserId: 'USR001'
        });

        expect(result).toEqual({ added: 0, removed: 1 });
        expect(db.query).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining('DELETE FROM patient_documents WHERE id IN (?)'),
            [[11]]
        );
    });

    it('ignores interpretation-only updates and does not create lab_interpretation portal documents', async () => {
        expect(typeof PatientDocumentSyncService.syncPenunjangLabResults).toBe('function');

        db.query.mockResolvedValueOnce([[
            { id: 11, file_url: '/api/lab-results/file/lab-a.pdf' }
        ]]);

        const result = await PatientDocumentSyncService.syncPenunjangLabResults({
            patientId: 'P001',
            mrId: 'DRD0001',
            files: [
                {
                    name: 'lab-a.pdf',
                    url: '/api/lab-results/file/lab-a.pdf',
                    key: 'lab-results/lab-a.pdf',
                    type: 'application/pdf',
                    size: 2048
                }
            ],
            interpretation: 'Hb normal',
            actorUserId: 'USR001'
        });

        expect(result).toEqual({ added: 0, removed: 0 });
        expect(createPatientNotification).not.toHaveBeenCalled();
        expect(db.query).not.toHaveBeenCalledWith(
            expect.stringContaining('lab_interpretation'),
            expect.anything()
        );
    });
});

describe('DRD penunjang portal sync wiring', () => {
    test('medical-records route invokes the penunjang portal sync service', () => {
        const route = readRepoFile('staff', 'backend', 'routes', 'medical-records.js');

        expect(route).toContain("require('../services/PatientDocumentSyncService')");
        expect(route).toContain('await PatientDocumentSyncService.syncPenunjangLabResults({');
        expect(route).toContain("if (recordType === 'penunjang' && mrId)");
    });

    test('send-to-patient modal no longer offers manual lab sending', () => {
        const sendToPatient = readRepoFile(
            'staff',
            'public',
            'scripts',
            'sunday-clinic',
            'components',
            'shared',
            'send-to-patient.js'
        );

        expect(sendToPatient).not.toContain('send-lab-results');
        expect(sendToPatient).not.toContain('send-lab-container');
        expect(sendToPatient).not.toContain('lab_interpretation');
        expect(sendToPatient).toContain('send-resume-medis');
        expect(sendToPatient).toContain('send-usg-photos');
    });

    test('resume status text distinguishes lab availability in portal from manual document sending', () => {
        const resumeComponent = readRepoFile(
            'staff',
            'public',
            'scripts',
            'sunday-clinic',
            'components',
            'shared',
            'resume-medis.js'
        );

        expect(resumeComponent).toContain('sudah tersedia di portal pasien');
        expect(resumeComponent).not.toContain("sentItems.push('Hasil Lab')");
        expect(resumeComponent).toContain('documentsSent.lab');
    });

    test('penunjang component can resave existing files through the global save flow', () => {
        const penunjangComponent = readRepoFile(
            'staff',
            'public',
            'scripts',
            'sunday-clinic',
            'components',
            'shared',
            'penunjang.js'
        );

        expect(penunjangComponent).toContain('async save(state)');
        expect(penunjangComponent).toContain('const existingPenunjang = state?.medicalRecords?.byType?.penunjang?.data || state?.recordData?.penunjang || {};');
        expect(penunjangComponent).toContain('await this.savePenunjangToDatabase(data.files, data.interpretation, recordDatetime);');
        expect(penunjangComponent).toContain("return { success: true, skipped: true };");
    });
});
