const db = require('../db');
const logger = require('../utils/logger');
const { createPatientNotification } = require('../routes/patient-notifications');

async function syncPenunjangLabResults({ patientId, mrId, files = [], actorUserId = null }) {
    if (!patientId || !mrId) {
        return { added: 0, removed: 0 };
    }

    const normalizedFiles = Array.isArray(files)
        ? files.filter(file => file && file.url)
        : [];

    const [existingDocs] = await db.query(
        `SELECT id, file_url FROM patient_documents
         WHERE patient_id = ? AND mr_id = ? AND document_type = 'lab_result' AND status = 'published'`,
        [patientId, mrId]
    );

    const existingUrls = new Set(existingDocs.map(doc => doc.file_url));
    const currentUrls = new Set(normalizedFiles.map(file => file.url));

    const toDelete = existingDocs.filter(doc => !currentUrls.has(doc.file_url));
    if (toDelete.length > 0) {
        await db.query(
            'DELETE FROM patient_documents WHERE id IN (?)',
            [toDelete.map(doc => doc.id)]
        );
    }

    const toInsert = normalizedFiles.filter(file => !existingUrls.has(file.url));
    for (const file of toInsert) {
        await db.query(
            `INSERT INTO patient_documents
             (patient_id, mr_id, document_type, title, file_url, file_path, file_name, file_type, file_size,
              source, status, published_at, published_by, created_by, created_at)
             VALUES (?, ?, 'lab_result', ?, ?, ?, ?, ?, ?, 'clinic', 'published', NOW(), ?, ?, NOW())`,
            [
                patientId,
                mrId,
                file.name || 'Hasil Lab',
                file.url,
                file.key || file.filename || null,
                file.name || 'Hasil Lab',
                file.type || 'application/octet-stream',
                file.size || 0,
                actorUserId,
                actorUserId
            ]
        );
    }

    if (toInsert.length > 0) {
        await createPatientNotification({
            patient_id: patientId,
            type: 'document',
            title: 'Hasil Lab Baru',
            message: `${toInsert.length} hasil lab baru telah tersedia. Klik untuk melihat.`,
            link: '/hasil-lab.html',
            icon: 'fa fa-flask',
            icon_color: 'text-info'
        });
    }

    logger.info('Penunjang lab results synced to patient portal', {
        patientId,
        mrId,
        added: toInsert.length,
        removed: toDelete.length
    });

    return {
        added: toInsert.length,
        removed: toDelete.length
    };
}

module.exports = {
    syncPenunjangLabResults
};
