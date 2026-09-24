'use strict';

const db = require('../db');
const logger = require('../utils/logger');
const realtimeSync = require('../realtime-sync');
const { createPatientNotification } = require('../routes/patient-notifications');
const { mutatePenunjangDocuments } = require('./PatientDocumentSyncService');
const { updateQueueStatus } = require('./sunday-clinic/queue');
const { MEDIFY_SOAP_SYNC_SECTIONS, sundayClinicMedifySyncQueue } = require('./sunday-clinic/shared');
const { normalizePhoto } = require('./UsgClinicalPhotoService');

function validFiles(files, documentType) {
    return Array.isArray(files) ? files.map(file =>
        documentType === 'usg_photo' && typeof file === 'string' ? normalizePhoto(file) : file)
        .filter(file => file && typeof file.url === 'string' && file.url) : [];
}

async function mutateFileDocuments(connection, row, { files, documentType, defaultTitle, defaultType }) {
    const currentFiles = validFiles(files, documentType);
    const [existing] = await connection.query(
        `SELECT id, file_url FROM patient_documents
         WHERE patient_id = ? AND mr_id = ? AND document_type = ? AND status = 'published'
         ORDER BY id FOR UPDATE`,
        [row.patient_id, row.mr_id, documentType]
    );
    const currentUrls = new Set(currentFiles.map(file => file.url));
    const existingUrls = new Set(existing.map(doc => doc.file_url));
    const removed = existing.filter(doc => !currentUrls.has(doc.file_url));
    if (removed.length) {
        await connection.query('DELETE FROM patient_documents WHERE id IN (?)', [removed.map(doc => doc.id)]);
    }
    const added = currentFiles.filter(file => !existingUrls.has(file.url));
    for (const file of added) {
        await connection.query(
            `INSERT INTO patient_documents
             (patient_id, mr_id, document_type, title, file_url, file_path, file_name, file_type, file_size,
              source, status, published_at, published_by, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'clinic', 'published', NOW(), ?, ?, NOW())`,
            [row.patient_id, row.mr_id, documentType, file.name || defaultTitle, file.url,
                file.key || file.filename || null, file.name || defaultTitle, file.type || defaultType,
                file.size || 0, row.actor.doctorId, row.actor.doctorId]
        );
    }
    return { added: added.length, removed: removed.length, documentType };
}

async function mutateResumeDocument(connection, row) {
    const content = row.record_data.resume || row.record_data.content || '';
    if (!content) return undefined;
    const [patient] = await connection.query('SELECT full_name FROM patients WHERE id = ?', [row.patient_id]);
    const [existing] = await connection.query(
        `SELECT id FROM patient_documents
         WHERE patient_id = ? AND mr_id = ? AND document_type = 'resume_medis' AND status = 'published'
         ORDER BY id FOR UPDATE`, [row.patient_id, row.mr_id]);
    const today = new Date();
    const date = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    const title = `Resume Medis - ${patient[0]?.full_name || 'Pasien'} - ${date}`;
    const sourceData = JSON.stringify({ content, generatedAt: today.toISOString() });
    if (existing.length) {
        await connection.query(
            `UPDATE patient_documents SET title = ?, source_data = ?, published_at = NOW(), published_by = ?, updated_at = NOW()
            WHERE id = ?`, [title, sourceData, row.actor.doctorId, existing[0].id]
        );
    } else {
        await connection.query(
            `INSERT INTO patient_documents
             (patient_id, mr_id, document_type, title, file_name, file_type, file_size,
              source_data, source, status, published_at, published_by, created_by, created_at)
             VALUES (?, ?, 'resume_medis', ?, ?, 'text/plain', 0, ?, 'clinic', 'published', NOW(), ?, ?, NOW())`,
            [row.patient_id, row.mr_id, title, title, sourceData, row.actor.doctorId, row.actor.doctorId]
        );
    }
    return { added: existing.length ? 0 : 1, removed: 0, documentType: 'resume_medis' };
}

async function mutatePenunjangInterpretation(connection, row) {
    const interpretation = row.record_data.interpretation || '';
    if (typeof interpretation !== 'string' || !interpretation.trim()) return;
    const [existing] = await connection.query(
        `SELECT id FROM patient_documents
         WHERE patient_id = ? AND mr_id = ? AND document_type = 'lab_interpretation' AND status = 'published'
         ORDER BY id FOR UPDATE`, [row.patient_id, row.mr_id]
    );
    const sourceData = JSON.stringify({ content: interpretation, generatedAt: new Date().toISOString() });
    if (existing.length) {
        await connection.query(
            `UPDATE patient_documents SET source_data = ?, published_at = NOW(), published_by = ?, updated_at = NOW()
            WHERE id = ?`, [sourceData, row.actor.doctorId, existing[0].id]
        );
    } else {
        await connection.query(
            `INSERT INTO patient_documents
             (patient_id, mr_id, document_type, title, file_name, file_type, file_size, source_data,
              source, status, published_at, published_by, created_by, created_at)
             VALUES (?, ?, 'lab_interpretation', 'Interpretasi Hasil Lab', 'Interpretasi Hasil Lab', 'text/plain', 0,
              ?, 'clinic', 'published', NOW(), ?, ?, NOW())`,
            [row.patient_id, row.mr_id, sourceData, row.actor.doctorId, row.actor.doctorId]
        );
    }
}

// MedicalRecordService invokes this hook before commit while visit and section locks are held.
// A metadata failure must roll back the clinical write, never leave a successful partial save.
async function mutateSundayClinicDocuments(connection, row) {
    let documentChange;
    if (row.record_type === 'usg') {
        documentChange = await mutateFileDocuments(connection, row, {
            files: row.record_data.photos, documentType: 'usg_photo',
            defaultTitle: 'Foto USG', defaultType: 'image/jpeg'
        });
    } else if (row.record_type === 'resume_medis') {
        documentChange = await mutateResumeDocument(connection, row);
    } else if (row.record_type === 'penunjang') {
        const change = await mutatePenunjangDocuments(connection, {
            patientId: row.patient_id, mrId: row.mr_id, files: row.record_data.files,
            actorUserId: row.actor.doctorId
        });
        await mutatePenunjangInterpretation(connection, row);
        documentChange = { ...change, documentType: 'lab_result' };
    }
    await connection.query('UPDATE sunday_clinic_records SET last_activity_at = NOW() WHERE id = ?', [row.visitId]);
    if (row.record_type === 'resume_medis' && row.visitStatus === 'draft') {
        const [finalized] = await connection.query(
            `UPDATE sunday_clinic_records SET status = 'finalized', finalized_at = NOW(), finalized_by = ?
             WHERE id = ? AND status = 'draft'`, [row.actor.doctorId, row.visitId]);
        if (finalized.affectedRows !== 1) throw new Error('Visit finalization failed');
    }
    return documentChange;
}

async function bestEffort(name, task) {
    try { return await task(); }
    catch (_) { logger.warn('Sunday Clinic postcommit effect failed', { effect: name }); return undefined; }
}

async function notifyDocument(change, row) {
    const count = change.added || 0;
    if (count > 0) {
        const notification = row.record_type === 'usg'
            ? { title: 'Foto USG Baru', message: `${count} foto USG baru telah tersedia. Klik untuk melihat.`,
                link: '/album-usg.html', icon: 'fa fa-image', icon_color: 'text-primary' }
            : row.record_type === 'penunjang'
                ? { title: 'Hasil Lab Baru', message: `${count} hasil lab baru telah tersedia. Klik untuk melihat.`,
                    link: '/hasil-lab.html', icon: 'fa fa-flask', icon_color: 'text-info' }
                : { title: 'Resume Medis Baru', message: 'Resume medis Anda telah tersedia. Klik untuk melihat.',
                    link: '/dokumen-medis.html', icon: 'fa fa-file-medical', icon_color: 'text-success' };
        await bestEffort('document-notification', () => createPatientNotification({
            patient_id: row.patient_id, type: 'document', ...notification
        }));
    }
    await bestEffort('patient-refresh', () => realtimeSync.broadcastToRoom(`patient:${row.patient_id}`, {
        type: row.record_type === 'usg' ? 'usg:patient_updated' : 'document:patient_updated',
        ...(row.record_type === 'usg' ? {} : { document_type: change.documentType }),
        ...(row.record_type === 'resume_medis' ? {} : { added: count, removed: change.removed || 0 })
    }));
}

// Called only after MedicalRecordService.transaction has committed. Operational
// failures are recorded without patient data and cannot turn a saved record into
// a retryable HTTP failure.
async function afterSundayClinicSave(result, { user = {}, skipMedifySync = false } = {}) {
    const row = result.data;
    if (!row || !row.mr_id || !row.patient_id) return;
    const section = result.recordType;
    await bestEffort('staff-refresh', () => realtimeSync.broadcast({
        type: 'medical_record:updated', section
    }));
    if (section === 'anamnesa' && result.visitLocation === 'klinik_private') {
        await bestEffort('queue', () => updateQueueStatus(row.mr_id, 'anamnesa'));
    }
    if (MEDIFY_SOAP_SYNC_SECTIONS.has(section) && result.visitLocation === 'rsia_melinda' && !skipMedifySync) {
        result.sync = await bestEffort('medify-sync', () => sundayClinicMedifySyncQueue.enqueueDiagnosis({
            mrId: row.mr_id, patientId: row.patient_id, visitLocation: result.visitLocation,
            diagnosisData: section === 'diagnosis' ? row.record_data : undefined,
            changedSection: section, eventAt: new Date().toISOString(),
            createdBy: user.name || user.id || null
        }));
    }
    if (section === 'resume_medis') {
        await bestEffort('hospital-appointment', async () => {
            const [appointments] = await db.query(
                `SELECT id, hospital_location, appointment_date FROM appointments
                 WHERE patient_id = ? AND hospital_location IN ('rsia_melinda', 'rsud_gambiran', 'rs_bhayangkara')
                   AND status IN ('scheduled', 'confirmed')
                 ORDER BY appointment_date DESC, created_at DESC LIMIT 1`, [row.patient_id]
            );
            if (appointments.length) {
                const scheduler = require('./appointmentScheduler');
                await scheduler.autoCompleteOnPayment(appointments[0].id, 'Resume saved');
            }
        });
    }
    if (result.documentChange) await notifyDocument(result.documentChange, row);
}

module.exports = { mutateSundayClinicDocuments, afterSundayClinicSave };
