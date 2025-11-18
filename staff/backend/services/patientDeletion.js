const db = require('../db');

/**
 * Delete a patient along with all related relational data inside a single transaction.
 * Returns an object containing the deleted patient metadata and per-table deletion counts.
 */
async function deletePatientWithRelations(patientId) {
    const connection = await db.getConnection();
    const deletedData = {};

    try {
        await connection.beginTransaction();

        const [patients] = await connection.query(
            'SELECT id, full_name, email FROM patients WHERE id = ?',
            [patientId]
        );

        if (patients.length === 0) {
            await connection.rollback();
            return { patient: null, deletedData: null };
        }

        const patient = patients[0];

        await deleteChild(connection,
            'DELETE FROM billing_items WHERE billing_id IN (SELECT id FROM billings WHERE patient_id = ?)',
            [patientId],
            deletedData,
            'billing_items'
        );

        await deleteChild(connection,
            'DELETE FROM payment_transactions WHERE billing_id IN (SELECT id FROM billings WHERE patient_id = ?)',
            [patientId],
            deletedData,
            'payment_transactions'
        );

        await deleteChild(connection,
            'DELETE FROM billings WHERE patient_id = ?',
            [patientId],
            deletedData,
            'billings'
        );

        await deleteChild(connection,
            'DELETE FROM patient_records WHERE patient_id = ?',
            [patientId],
            deletedData,
            'patient_records'
        );

        await deleteChild(connection,
            'DELETE FROM medical_records WHERE patient_id = ?',
            [patientId],
            deletedData,
            'medical_records'
        );

        await deleteChild(connection,
            'DELETE FROM medical_exams WHERE patient_id = ?',
            [patientId],
            deletedData,
            'medical_exams'
        );

        await deleteChild(connection,
            'DELETE FROM visits WHERE patient_id = ?',
            [patientId],
            deletedData,
            'visits'
        );

        await deleteChild(connection,
            'DELETE FROM appointments WHERE patient_id = ?',
            [patientId],
            deletedData,
            'appointments'
        );

        await deleteChild(connection,
            'DELETE FROM sunday_appointments WHERE patient_id = ?',
            [patientId],
            deletedData,
            'sunday_appointments'
        );

        await deleteChild(connection,
            'DELETE FROM visit_invoices WHERE patient_id = ?',
            [patientId],
            deletedData,
            'visit_invoices'
        );

        await deleteOptionalChild(connection,
            'DELETE FROM patient_intake_submissions WHERE patient_id = ?',
            [patientId],
            deletedData,
            'patient_intake_submissions'
        );

        await deleteOptionalChild(connection,
            'DELETE FROM web_patients_archive WHERE id = ?',
            [patientId],
            deletedData,
            'web_patients_archive'
        );

        const [patientResult] = await connection.query(
            'DELETE FROM patients WHERE id = ?',
            [patientId]
        );
        deletedData.patient = patientResult.affectedRows;

        await connection.commit();

        return { patient, deletedData };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function deleteChild(connection, query, params, deletedData, key) {
    const [result] = await connection.query(query, params);
    deletedData[key] = result.affectedRows;
}

async function deleteOptionalChild(connection, query, params, deletedData, key) {
    try {
        await deleteChild(connection, query, params, deletedData, key);
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            deletedData[key] = 0;
            return;
        }
        throw error;
    }
}

module.exports = {
    deletePatientWithRelations
};
