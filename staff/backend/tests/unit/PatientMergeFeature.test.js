const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8').replace(/\r\n/g, '\n');

const {
    normalizeMergeRequest,
    sortDrdRecordsAscending,
    sanitizeSnapshot
} = require('../../services/PatientMergeService');

describe('patient merge feature contracts', () => {
    test('normalizes one target and many unique sources without allowing self merge', () => {
        expect(normalizeMergeRequest('P100', ['P300', 'P200', 'P300'])).toEqual({
            targetPatientId: 'P100',
            sourcePatientIds: ['P200', 'P300']
        });

        expect(() => normalizeMergeRequest('P100', ['P100'])).toThrow('tidak boleh');
        expect(() => normalizeMergeRequest('P100', [])).toThrow('minimal');
    });

    test('sorts DRD values numerically from smallest to largest with stable fallback', () => {
        const records = [
            { mr_id: 'DRD100' },
            { mr_id: 'LEGACY-2' },
            { mr_id: 'DRD9' },
            { mr_id: 'DRD0010' },
            { mr_id: 'drd2' }
        ];

        expect(sortDrdRecordsAscending(records).map(item => item.mr_id)).toEqual([
            'drd2',
            'DRD9',
            'DRD0010',
            'DRD100',
            'LEGACY-2'
        ]);
    });

    test('removes credentials and tokens from stored audit snapshots', () => {
        expect(sanitizeSnapshot({
            id: 'P100',
            email: 'patient@example.test',
            password: 'secret',
            password_hash: 'hash',
            fcm_token: 'token',
            refreshToken: 'refresh',
            full_name: 'Pasien Sumber'
        })).toEqual({
            id: 'P100',
            email: 'patient@example.test',
            full_name: 'Pasien Sumber'
        });
    });

    test('backend exposes doctor-only preview and merge endpoints', () => {
        const route = readRepoFile('staff', 'backend', 'routes', 'patients.js');
        const service = readRepoFile('staff', 'backend', 'services', 'PatientMergeService.js');

        expect(route).toContain("router.post('/api/patients/merge/preview', verifyStaffToken, requireSuperadmin");
        expect(route).toContain("router.post('/api/patients/merge', verifyStaffToken, requireSuperadmin");
        expect(route).toContain("router.get('/api/patients/merge/candidates', verifyStaffToken, requireSuperadmin");
        expect(service).toContain("c.DATA_TYPE IN ('char', 'varchar'");
    });

    test('staff UI offers merge and sorts the patient MR list before rendering', () => {
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');
        const tools = readRepoFile('staff', 'public', 'scripts', 'legacy', 'patient-tools.js');
        const bootstrap = readRepoFile('staff', 'public', 'scripts', 'shell', 'bootstrap.js');

        expect(html).toContain('onclick="openPatientMergeModal()"');
        expect(html).toContain('Merge Pasien');
        expect(tools).toContain('window.openPatientMergeModal = async function()');
        expect(tools).toContain('sortPatientDrdRecordsAscending(records)');
        expect(tools).toContain('/api/patients/merge/preview');
        expect(tools).toContain("method: 'POST'");
        expect(bootstrap).toContain("'openPatientMergeModal'");
    });
});
