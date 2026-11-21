'use strict';

/**
 * Mark a patient as delivered: creates the birth_congratulations row and ends the
 * patient's ongoing pregnancy (lahir_hidup) in one transaction.
 * Returns { status, body } for the route to send; throws on unexpected errors (after rollback).
 */
async function markPatientDelivered({ db, episodes, patientId, actor, today }) {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [patientRows] = await conn.query('SELECT id, full_name FROM patients WHERE id = ?', [patientId]);
        if (patientRows.length === 0) {
            await conn.rollback();
            return { status: 404, body: { success: false, message: 'Pasien tidak ditemukan' } };
        }

        // Determine child_number (support multiple children)
        const [existingBirths] = await conn.query(
            'SELECT MAX(child_number) as max_child FROM birth_congratulations WHERE patient_id = ?',
            [patientId]
        );
        const nextChildNumber = (existingBirths[0].max_child || 0) + 1;

        // Minimal birth_congratulations entry (patient fills the rest)
        const [insert] = await conn.query(
            `INSERT INTO birth_congratulations (patient_id, child_number, birth_date, is_published, patient_data_submitted, patient_dismissed, created_at)
             VALUES (?, ?, CURDATE(), 0, 0, 0, NOW())`,
            [patientId, nextChildNumber]
        );

        await episodes.endOngoing(
            patientId,
            { outcome: 'lahir_hidup', ended_on: today, linkTable: 'birth_congratulations', linkId: insert.insertId },
            actor,
            conn
        );

        await conn.commit();
        return {
            status: 200,
            body: {
                success: true,
                child_number: nextChildNumber,
                message: `Pasien ${patientRows[0].full_name} berhasil ditandai sudah melahirkan (anak ke-${nextChildNumber})`
            }
        };
    } catch (error) {
        try { await conn.rollback(); } catch (e) { /* keep original error */ }
        throw error;
    } finally {
        conn.release();
    }
}

module.exports = { markPatientDelivered };
