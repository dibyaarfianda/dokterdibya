const db = require('../db');

/**
 * Delete a patient along with all related relational data inside a single transaction.
 * Handles dual-table system (users + patients).
 * Returns an object containing the deleted patient metadata and per-table deletion counts.
 */
async function deletePatientWithRelationsOnConnection(connection, patientId) {
    const deletedData = {};

    // Check both tables for patient info (dual-table system)
    const [patients] = await connection.query(
        `SELECT p.id, p.full_name, p.email, u.new_id as user_id
         FROM patients p
         LEFT JOIN users u ON u.new_id = p.id
         WHERE p.id = ?`,
        [patientId]
    );

    if (patients.length === 0) {
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
            'DELETE FROM sunday_appointments_archive WHERE patient_id = ?',
            [patientId],
            deletedData,
            'sunday_appointments_archive'
        );

        await deleteOptionalChild(connection,
            'DELETE FROM usg_records WHERE patient_id = ?',
            [patientId],
            deletedData,
            'usg_records'
        );

        await deleteOptionalChild(connection,
            'DELETE FROM ai_detection_logs WHERE patient_id = ?',
            [patientId],
            deletedData,
            'ai_detection_logs'
        );

        await deleteOptionalChild(connection,
            'DELETE FROM ai_summary_logs WHERE patient_id = ?',
            [patientId],
            deletedData,
            'ai_summary_logs'
        );

        // RESTRICT chains must be removed child-first before the patients row.
        await deleteOptionalChild(connection,
            'DELETE FROM question_replies WHERE question_id IN (SELECT id FROM patient_questions WHERE patient_id = ?)',
            [patientId],
            deletedData,
            'question_replies'
        );

        await deleteOptionalChild(connection,
            'DELETE FROM patient_questions WHERE patient_id = ?',
            [patientId],
            deletedData,
            'patient_questions'
        );

        await deleteOptionalChild(connection,
            'DELETE FROM tanya_payments WHERE patient_id = ?',
            [patientId],
            deletedData,
            'tanya_payments'
        );

        await deleteOptionalChild(connection,
            'DELETE FROM tanya_subscriptions WHERE patient_id = ?',
            [patientId],
            deletedData,
            'tanya_subscriptions'
        );

        // Clear registration code reference (don't delete the code, just clear patient reference)
        await deleteOptionalChild(connection,
            'UPDATE registration_codes SET used_by_patient_id = NULL WHERE used_by_patient_id = ?',
            [patientId],
            deletedData,
            'registration_codes_cleared'
        );

        await deleteOptionalChild(connection,
            'DELETE FROM patient_password_reset_tokens WHERE patient_id = ?',
            [patientId],
            deletedData,
            'patient_password_reset_tokens'
        );

        // Delete patient documents and related logs
        await deleteOptionalChild(connection,
            'DELETE FROM patient_document_access_logs WHERE document_id IN (SELECT id FROM patient_documents WHERE patient_id = ?)',
            [patientId],
            deletedData,
            'patient_document_access_logs'
        );

        await deleteOptionalChild(connection,
            'DELETE FROM patient_document_shares WHERE document_id IN (SELECT id FROM patient_documents WHERE patient_id = ?)',
            [patientId],
            deletedData,
            'patient_document_shares'
        );

        await deleteOptionalChild(connection,
            'DELETE FROM patient_documents WHERE patient_id = ?',
            [patientId],
            deletedData,
            'patient_documents'
        );

        // Delete patient MR history
        await deleteOptionalChild(connection,
            'DELETE FROM patient_mr_history WHERE patient_id = ?',
            [patientId],
            deletedData,
            'patient_mr_history'
        );

        // Delete patient notifications
        await deleteOptionalChild(connection,
            'DELETE FROM patient_notifications WHERE patient_id = ?',
            [patientId],
            deletedData,
            'patient_notifications'
        );

        // Delete email verifications
        await deleteOptionalChild(connection,
            'DELETE FROM email_verifications WHERE email = (SELECT email FROM patients WHERE id = ?)',
            [patientId],
            deletedData,
            'email_verifications'
        );

        // Patient-owned community identities use polymorphic columns rather than
        // patient_id, so they are not covered by the generic direct-reference pass.
        await deleteOptionalChild(connection,
            "DELETE FROM community_chat_messages WHERE sender_id = ? AND sender_type = 'patient'",
            [patientId],
            deletedData,
            'community_chat_messages'
        );
        await deleteOptionalChild(connection,
            "DELETE FROM community_chat_room_members WHERE user_id = ? AND user_type = 'patient'",
            [patientId],
            deletedData,
            'community_chat_room_members'
        );
        await deleteOptionalChild(connection,
            "DELETE FROM community_chat_profiles WHERE user_id = ? AND user_type = 'patient'",
            [patientId],
            deletedData,
            'community_chat_profiles'
        );
        await deleteOptionalChild(connection,
            'UPDATE community_chat_rooms SET direct_patient_id = NULL WHERE direct_patient_id = ?',
            [patientId],
            deletedData,
            'community_chat_rooms_direct_patient_cleared'
        );
        await deleteOptionalChild(connection,
            "UPDATE community_chat_rooms SET created_by = NULL WHERE created_by = ? AND created_by_type = 'patient'",
            [patientId],
            deletedData,
            'community_chat_rooms_creator_cleared'
        );

        await deleteRemainingDirectPatientRows(connection, patientId, deletedData);

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

    return { patient, deletedData };
}

async function deletePatientWithRelations(patientId) {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();
        const result = await deletePatientWithRelationsOnConnection(connection, patientId);
        if (!result.patient) {
            await connection.rollback();
            return result;
        }
        await connection.commit();
        return result;
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

async function deleteRemainingDirectPatientRows(connection, patientId, deletedData) {
    const [tables] = await connection.query(
        `SELECT TABLE_NAME AS table_name
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND COLUMN_NAME = 'patient_id'
           AND DATA_TYPE IN ('char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext')
         ORDER BY TABLE_NAME ASC`
    );

    for (const row of tables) {
        const tableName = String(row.table_name || '');
        if (!/^[A-Za-z0-9_]+$/.test(tableName)) {
            throw new Error(`Unsafe patient relation table name: ${tableName}`);
        }
        const [result] = await connection.query(
            `DELETE FROM \`${tableName}\` WHERE patient_id = ?`,
            [patientId]
        );
        deletedData[tableName] = Number(deletedData[tableName] || 0) + Number(result.affectedRows || 0);
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
    deletePatientWithRelationsOnConnection,
    deleteRemainingDirectPatientRows,
    deletePatientByEmail
};
