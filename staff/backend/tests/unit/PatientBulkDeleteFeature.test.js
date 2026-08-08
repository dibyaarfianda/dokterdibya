const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (...segments) => fs.readFileSync(path.join(repoRoot, ...segments), 'utf8').replace(/\r\n/g, '\n');

const {
    BulkPatientDeletionService,
    normalizeBulkPatientIds
} = require('../../services/BulkPatientDeletionService');
const { deletePatientWithRelationsOnConnection } = require('../../services/patientDeletion');

describe('bulk patient deletion feature', () => {
    test('normalizes unique IDs and enforces a bounded destructive batch', () => {
        expect(normalizeBulkPatientIds(['P3', 'P1', 'P3', ' P2 '])).toEqual(['P1', 'P2', 'P3']);
        expect(() => normalizeBulkPatientIds([])).toThrow('minimal satu');
        expect(() => normalizeBulkPatientIds(Array.from({ length: 51 }, (_, index) => `P${index}`))).toThrow('Maksimal 50');
    });

    test('deletes every selected patient in one transaction', async () => {
        const connection = {
            beginTransaction: jest.fn(async () => {}),
            commit: jest.fn(async () => {}),
            rollback: jest.fn(async () => {}),
            release: jest.fn(),
            query: jest.fn(async () => [[{ id: 'P1' }, { id: 'P2' }]])
        };
        const db = { query: jest.fn(), getConnection: jest.fn(async () => connection) };
        const deleteOne = jest.fn(async (_connection, patientId) => ({
            patient: { id: patientId, full_name: `Patient ${patientId}` },
            deletedData: { patient: 1 }
        }));
        const service = new BulkPatientDeletionService(db, deleteOne);
        jest.spyOn(service, 'preview').mockResolvedValue({
            patient_ids: ['P1', 'P2'],
            patients: [{ id: 'P1' }, { id: 'P2' }],
            count: 2,
            confirmation_phrase: 'HAPUS 2 PASIEN'
        });

        const result = await service.deletePatients(['P2', 'P1'], 'HAPUS 2 PASIEN');

        expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
        expect(deleteOne).toHaveBeenNthCalledWith(1, connection, 'P1');
        expect(deleteOne).toHaveBeenNthCalledWith(2, connection, 'P2');
        expect(connection.commit).toHaveBeenCalledTimes(1);
        expect(connection.rollback).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalledTimes(1);
        expect(result.deleted_count).toBe(2);
    });

    test('rolls back the whole batch when one deletion fails', async () => {
        const connection = {
            beginTransaction: jest.fn(async () => {}),
            commit: jest.fn(async () => {}),
            rollback: jest.fn(async () => {}),
            release: jest.fn(),
            query: jest.fn(async () => [[{ id: 'P1' }, { id: 'P2' }]])
        };
        const db = { query: jest.fn(), getConnection: jest.fn(async () => connection) };
        const deleteOne = jest.fn()
            .mockResolvedValueOnce({ patient: { id: 'P1' }, deletedData: {} })
            .mockRejectedValueOnce(new Error('relation blocked'));
        const service = new BulkPatientDeletionService(db, deleteOne);
        jest.spyOn(service, 'preview').mockResolvedValue({
            patient_ids: ['P1', 'P2'],
            patients: [{ id: 'P1' }, { id: 'P2' }],
            count: 2,
            confirmation_phrase: 'HAPUS 2 PASIEN'
        });

        await expect(service.deletePatients(['P1', 'P2'], 'HAPUS 2 PASIEN')).rejects.toThrow('relation blocked');
        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalledTimes(1);
    });

    test('the shared deletion worker clears restrictive and dynamic patient relations', async () => {
        const connection = {
            query: jest.fn(async sql => {
                if (sql.includes('SELECT p.id, p.full_name')) {
                    return [[{ id: 'P1', full_name: 'Patient One', email: 'one@example.test', user_id: 'P1' }]];
                }
                if (sql.includes('FROM information_schema.COLUMNS')) {
                    return [[{ table_name: 'patient_activity_log' }]];
                }
                return [{ affectedRows: sql.includes('DELETE FROM patients') ? 1 : 0 }];
            })
        };

        const result = await deletePatientWithRelationsOnConnection(connection, 'P1');

        expect(result.patient.id).toBe('P1');
        expect(connection.query).toHaveBeenCalledWith(
            expect.stringContaining('DELETE FROM question_replies'),
            ['P1']
        );
        expect(connection.query).toHaveBeenCalledWith(
            'DELETE FROM tanya_subscriptions WHERE patient_id = ?',
            ['P1']
        );
        expect(connection.query).toHaveBeenCalledWith(
            'DELETE FROM `patient_activity_log` WHERE patient_id = ?',
            ['P1']
        );
    });

    test('backend and staff shell expose doctor-only bulk deletion contracts', () => {
        const route = readRepoFile('staff', 'backend', 'routes', 'patients.js');
        const html = readRepoFile('staff', 'public', 'index-adminlte.html');
        const tools = readRepoFile('staff', 'public', 'scripts', 'legacy', 'patient-tools.js');
        const bootstrap = readRepoFile('staff', 'public', 'scripts', 'shell', 'bootstrap.js');

        expect(route).toContain("router.post('/api/patients/bulk-delete/preview', verifyStaffToken, requireSuperadmin");
        expect(route).toContain("router.post('/api/patients/bulk-delete', verifyStaffToken, requireSuperadmin");
        expect(html).toContain('id="bulk-delete-patients-btn"');
        expect(html).toContain('id="bulk-delete-select-all"');
        expect(tools).toContain('window.openBulkPatientDeleteModal = async function()');
        expect(tools).toContain('patient-bulk-delete-check');
        expect(bootstrap).toContain("'openBulkPatientDeleteModal'");
        expect(bootstrap).toContain("'togglePatientBulkSelection'");
        expect(bootstrap).toContain("'toggleAllManagePatientsForBulkDelete'");
    });
});
