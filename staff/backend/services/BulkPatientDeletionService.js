const { deletePatientWithRelationsOnConnection } = require('./patientDeletion');

const MAX_BULK_DELETE_PATIENTS = 50;

class BulkPatientDeletionError extends Error {
    constructor(message, statusCode = 400, code = 'BULK_PATIENT_DELETE_ERROR', details = null) {
        super(message);
        this.name = 'BulkPatientDeletionError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}

function normalizeBulkPatientIds(patientIds) {
    if (!Array.isArray(patientIds)) {
        throw new BulkPatientDeletionError('Daftar pasien wajib berupa array.');
    }

    const normalized = [...new Set(patientIds
        .map(value => String(value || '').trim())
        .filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, 'id', { numeric: true, sensitivity: 'base' }));

    if (normalized.length === 0) {
        throw new BulkPatientDeletionError('Pilih minimal satu pasien untuk dihapus.');
    }
    if (normalized.length > MAX_BULK_DELETE_PATIENTS) {
        throw new BulkPatientDeletionError(`Maksimal ${MAX_BULK_DELETE_PATIENTS} pasien dapat dihapus sekaligus.`);
    }

    return normalized;
}

function placeholders(values) {
    return values.map(() => '?').join(', ');
}

class BulkPatientDeletionService {
    constructor(db, deleteOne = deletePatientWithRelationsOnConnection) {
        if (!db || typeof db.query !== 'function') {
            throw new Error('BulkPatientDeletionService requires a database pool');
        }
        this.db = db;
        this.deleteOne = deleteOne;
    }

    async preview(patientIds, queryable = null) {
        const normalized = normalizeBulkPatientIds(patientIds);
        const connection = queryable || this.db;
        const [rows] = await connection.query(
            `SELECT p.id, p.full_name, p.email, p.phone, p.whatsapp, p.status,
                    COUNT(DISTINCT scr.mr_id) AS drd_count
             FROM patients p
             LEFT JOIN sunday_clinic_records scr ON scr.patient_id = p.id
             WHERE p.id IN (${placeholders(normalized)})
             GROUP BY p.id, p.full_name, p.email, p.phone, p.whatsapp, p.status
             ORDER BY p.full_name ASC, p.id ASC`,
            normalized
        );

        const foundIds = new Set(rows.map(row => String(row.id)));
        const missingPatientIds = normalized.filter(patientId => !foundIds.has(patientId));
        if (missingPatientIds.length > 0) {
            throw new BulkPatientDeletionError(
                `Pasien tidak ditemukan: ${missingPatientIds.join(', ')}`,
                404,
                'BULK_DELETE_PATIENT_NOT_FOUND',
                { missing_patient_ids: missingPatientIds }
            );
        }

        const patients = rows.map(row => ({
            ...row,
            drd_count: Number(row.drd_count || 0)
        }));
        return {
            patient_ids: normalized,
            patients,
            count: patients.length,
            total_drd_count: patients.reduce((total, patient) => total + patient.drd_count, 0),
            confirmation_phrase: `HAPUS ${patients.length} PASIEN`
        };
    }

    async deletePatients(patientIds, confirmationPhrase) {
        const normalized = normalizeBulkPatientIds(patientIds);
        const expectedConfirmation = `HAPUS ${normalized.length} PASIEN`;
        if (String(confirmationPhrase || '').trim() !== expectedConfirmation) {
            throw new BulkPatientDeletionError(
                `Konfirmasi tidak sesuai. Ketik persis: ${expectedConfirmation}`,
                400,
                'BULK_DELETE_CONFIRMATION_MISMATCH'
            );
        }
        if (typeof this.db.getConnection !== 'function') {
            throw new BulkPatientDeletionError(
                'Database pool tidak mendukung transaksi bulk delete.',
                500,
                'BULK_DELETE_TRANSACTION_UNAVAILABLE'
            );
        }

        const connection = await this.db.getConnection();
        try {
            await connection.beginTransaction();
            const [lockedRows] = await connection.query(
                `SELECT id FROM patients
                 WHERE id IN (${placeholders(normalized)})
                 ORDER BY id ASC
                 FOR UPDATE`,
                normalized
            );
            const lockedIds = new Set(lockedRows.map(row => String(row.id)));
            const missingPatientIds = normalized.filter(patientId => !lockedIds.has(patientId));
            if (missingPatientIds.length > 0) {
                throw new BulkPatientDeletionError(
                    `Pasien tidak ditemukan: ${missingPatientIds.join(', ')}`,
                    404,
                    'BULK_DELETE_PATIENT_NOT_FOUND',
                    { missing_patient_ids: missingPatientIds }
                );
            }

            const preview = await this.preview(normalized, connection);
            const deletedPatients = [];
            for (const patientId of normalized) {
                const result = await this.deleteOne(connection, patientId);
                if (!result?.patient) {
                    throw new BulkPatientDeletionError(
                        `Pasien ${patientId} tidak ditemukan saat transaksi berjalan.`,
                        409,
                        'BULK_DELETE_PATIENT_CHANGED'
                    );
                }
                deletedPatients.push({
                    patient: result.patient,
                    deleted_data: result.deletedData
                });
            }

            await connection.commit();
            return {
                success: true,
                deleted_count: deletedPatients.length,
                total_drd_count: preview.total_drd_count,
                deleted_patients: deletedPatients
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

module.exports = {
    BulkPatientDeletionService,
    BulkPatientDeletionError,
    normalizeBulkPatientIds,
    MAX_BULK_DELETE_PATIENTS
};
