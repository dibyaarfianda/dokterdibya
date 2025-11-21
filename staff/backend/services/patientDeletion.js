const db = require('../db');

/**
 * Delete a patient along with all related relational data inside a single transaction.
 * Handles dual-table system (users + patients).
 * Returns an object containing the deleted patient metadata and per-table deletion counts.
 */
async function deletePatientWithRelations(patientId) {
    const connection = await db.getConnection();
    const deletedData = {};

    try {
        await connection.beginTransaction();

        // Check both tables for patient info (dual-table system)
        const [patients] = await connection.query(
            `SELECT p.id, p.full_name, p.email, u.new_id as user_id
             FROM patients p
             LEFT JOIN users u ON u.new_id = p.id
             WHERE p.id = ?`,
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

        await deleteOptionalChild(connection,
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

        await deleteOptionalChild(connection,
            'DELETE FROM sunday_clinic_billing_items WHERE billing_id IN (SELECT id FROM sunday_clinic_billings WHERE patient_id = ?)',
            [patientId],
            deletedData,
            'sunday_clinic_billing_items'
        );

        await deleteOptionalChild(connection,
            'DELETE FROM sunday_clinic_billings WHERE patient_id = ?',
            [patientId],
            deletedData,
            'sunday_clinic_billings'
        );

        await deleteOptionalChild(connection,
            'DELETE FROM sunday_clinic_records WHERE patient_id = ?',
            [patientId],
            deletedData,
            'sunday_clinic_records'
        );

        await deleteOptionalChild(connection,
            'DELETE FROM patient_password_reset_tokens WHERE patient_id = ?',
            [patientId],
            deletedData,
            'patient_password_reset_tokens'
        );

        // Delete from patients table (medical records)
        const [patientResult] = await connection.query(
            'DELETE FROM patients WHERE id = ?',
            [patientId]
        );
        deletedData.patient = patientResult.affectedRows;

        // Delete from users table (authentication) - dual table system
        const [userResult] = await connection.query(
            'DELETE FROM users WHERE new_id = ?',
            [patientId]
        );
        deletedData.users = userResult.affectedRows;

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

/**
 * Delete patient by email from both users and patients tables.
 * Useful for cleaning up incomplete registrations.
 */
async function deletePatientByEmail(email) {
    const connection = await db.getConnection();
    const deletedData = {};

    try {
        await connection.beginTransaction();

        // Find patient ID from either table
        const [patients] = await connection.query(
            `SELECT p.id FROM patients p WHERE p.email = ?
             UNION
             SELECT u.new_id as id FROM users u WHERE u.email = ? AND u.user_type = 'patient'`,
            [email, email]
        );

        if (patients.length === 0) {
            await connection.rollback();
            return { found: false, deletedData: null };
        }

        const patientId = patients[0].id;

        // Delete from users table
        const [userResult] = await connection.query(
            'DELETE FROM users WHERE email = ? OR new_id = ?',
            [email, patientId]
        );
        deletedData.users = userResult.affectedRows;

        // Delete from patients table
        const [patientResult] = await connection.query(
            'DELETE FROM patients WHERE email = ? OR id = ?',
            [email, patientId]
        );
        deletedData.patients = patientResult.affectedRows;

        // Delete from email_verifications
        await deleteOptionalChild(connection,
            'DELETE FROM email_verifications WHERE email = ?',
            [email],
            deletedData,
            'email_verifications'
        );

        // Delete password reset tokens
        await deleteOptionalChild(connection,
            'DELETE FROM patient_password_reset_tokens WHERE patient_id = ?',
            [patientId],
            deletedData,
            'patient_password_reset_tokens'
        );

        await connection.commit();

        return { found: true, email, patientId, deletedData };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    deletePatientWithRelations,
    deletePatientByEmail
};
