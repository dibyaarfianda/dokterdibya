'use strict';

/**
 * Mark a patient as delivered: creates the birth_congratulations row (or reuses the card already
 * linked to the ongoing pregnancy, e.g. a patient self-report) and ends the patient's ongoing
 * pregnancy (lahir_hidup) in one transaction.
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

        // Lock order: pregnancies first, then birth rows (same order as PregnancyEpisodeService).
        const [pregnancyRows] = await conn.query(
            'SELECT id, status FROM pregnancies WHERE patient_id = ? ORDER BY sequence ASC, id ASC FOR UPDATE',
            [patientId]
        );
        const ongoingRows = (pregnancyRows || []).filter(p => p.status === 'ongoing');
        const ongoing = ongoingRows.length ? ongoingRows[ongoingRows.length - 1] : null;

        // A birth already reported by the patient (or typed in by staff) is linked to the ongoing
        // pregnancy: reuse that card instead of creating a second, empty one that re-asks the mother.
        let linkedBirths = [];
        if (ongoing) {
            const [rows] = await conn.query(
                `SELECT id, child_number FROM birth_congratulations
                  WHERE patient_id = ? AND pregnancy_id = ?
                  ORDER BY child_number ASC, id ASC
                  FOR UPDATE`,
                [patientId, ongoing.id]
            );
            linkedBirths = rows || [];
        }

        let childNumber;
        let birthId;
        if (linkedBirths.length > 0) {
            // Twins: the lowest child number is the link; the other cards already point to this pregnancy.
            childNumber = linkedBirths[0].child_number;
            birthId = linkedBirths[0].id;
        } else {
            // Determine child_number (support multiple children)
            const [existingBirths] = await conn.query(
                'SELECT MAX(child_number) as max_child FROM birth_congratulations WHERE patient_id = ?',
                [patientId]
            );
            childNumber = (existingBirths[0].max_child || 0) + 1;

            // Minimal birth_congratulations entry (patient fills the rest)
            const [insert] = await conn.query(
                `INSERT INTO birth_congratulations (patient_id, child_number, birth_date, is_published, patient_data_submitted, patient_dismissed, created_at)
                 VALUES (?, ?, CURDATE(), 0, 0, 0, NOW())`,
                [patientId, childNumber]
            );
            birthId = insert.insertId;
        }

        await episodes.endOngoing(
            patientId,
            { outcome: 'lahir_hidup', ended_on: today, linkTable: 'birth_congratulations', linkId: birthId },
            actor,
            conn
        );

        await conn.commit();
        return {
            status: 200,
            body: {
                success: true,
                child_number: childNumber,
                message: `Pasien ${patientRows[0].full_name} berhasil ditandai sudah melahirkan (anak ke-${childNumber})`
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
