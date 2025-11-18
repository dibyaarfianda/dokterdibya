const db = require('../db');

function parseNextCounter(mrId) {
    if (!mrId || typeof mrId !== 'string') return 0;
    const match = mrId.match(/(\d+)$/);
    if (!match) return 0;
    return parseInt(match[1], 10) || 0;
}

async function generateSundayClinicMrId(connection) {
    const conn = connection || await db.getConnection();
    const releaseLater = !connection;

    try {
        const [rows] = await conn.query('SELECT mr_id FROM sunday_clinic_records ORDER BY id DESC LIMIT 1 FOR UPDATE');
        const lastNumber = rows.length ? parseNextCounter(rows[0].mr_id) : 0;
        const nextNumber = lastNumber + 1;
        return `MR${String(nextNumber).padStart(4, '0')}`;
    } finally {
        if (releaseLater) {
            conn.release();
        }
    }
}

async function findRecordByAppointment(appointmentId, connection) {
    const conn = connection || db;
    const [rows] = await conn.query(
        'SELECT * FROM sunday_clinic_records WHERE appointment_id = ? LIMIT 1',
        [appointmentId]
    );
    return rows[0] || null;
}

async function findRecordByMrId(mrId, connection) {
    const conn = connection || db;
    const [rows] = await conn.query(
        'SELECT * FROM sunday_clinic_records WHERE mr_id = ? LIMIT 1',
        [mrId]
    );
    return rows[0] || null;
}

async function createSundayClinicRecord({ appointmentId, patientId, createdBy = null }, transactionConnection = null) {
    const conn = transactionConnection || await db.getConnection();
    const manageTransaction = !transactionConnection;

    try {
        if (manageTransaction) {
            await conn.beginTransaction();
        }

        const existing = await findRecordByAppointment(appointmentId, conn);
        if (existing) {
            if (manageTransaction) {
                await conn.commit();
                conn.release();
            }
            return { record: existing, created: false };
        }

        const mrId = await generateSundayClinicMrId(conn);
        const folderPath = `sunday-clinic/${mrId.toLowerCase()}`;

        const createdByValue = createdBy && /^\d+$/.test(String(createdBy))
            ? parseInt(createdBy, 10)
            : null; // Only persist numeric IDs until column accepts strings

        const [result] = await conn.query(
            `INSERT INTO sunday_clinic_records (mr_id, patient_id, appointment_id, folder_path, status, created_by)
             VALUES (?, ?, ?, ?, 'draft', ?)`
            ,[mrId, patientId, appointmentId || null, folderPath, createdByValue]
        );

        const [rows] = await conn.query('SELECT * FROM sunday_clinic_records WHERE id = ? LIMIT 1', [result.insertId]);
        if (manageTransaction) {
            await conn.commit();
        }

        return { record: rows[0], created: true };
    } catch (error) {
        if (manageTransaction) {
            await conn.rollback();
        }
        throw error;
    } finally {
        if (manageTransaction) {
            conn.release();
        }
    }
}

module.exports = {
    generateSundayClinicMrId,
    createSundayClinicRecord,
    findRecordByAppointment,
    findRecordByMrId
};
