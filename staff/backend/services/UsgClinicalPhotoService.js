'use strict';

const path = require('path');
const records = require('./MedicalRecordService');
const r2Storage = require('./r2Storage');
const { createPatientNotification } = require('../routes/patient-notifications');
const realtimeSync = require('../realtime-sync');
const logger = require('../utils/logger');

function documentFor(photo) {
    const key = typeof photo === 'string' ? photo : photo?.key;
    if (typeof key !== 'string' || !/^(?:usg-photos|usg)\/[A-Za-z0-9/_-]+\.[A-Za-z0-9]+$/.test(key) || key.includes('..')) {
        throw new Error('Uploaded USG photo requires a safe R2 key');
    }
    return {
        key,
        url: typeof photo === 'string' ? `/api/usg-photos/file/${key}` : photo.url,
        name: typeof photo === 'string' ? path.posix.basename(key) : photo.name,
        type: typeof photo === 'string' ? 'image/jpeg' : photo.type,
        size: typeof photo === 'string' ? 0 : photo.size
    };
}

class UsgClinicalPhotoService {
    constructor(dependencies = {}) {
        this.records = dependencies.records || records;
        this.r2Storage = dependencies.r2Storage || r2Storage;
        this.notify = dependencies.notify || createPatientNotification;
        this.realtimeSync = dependencies.realtimeSync || realtimeSync;
    }

    async appendPhotos({ patientId, mrId, photos, actor, recordDate }) {
        if (!Array.isArray(photos) || !photos.length) throw new Error('Uploaded USG photos required');
        const documents = photos.map(documentFor);
        const result = await this.records.saveInternalSections({
            mrId, patientId, actor,
            sections: [{ recordType: 'usg', update: current => ({
                ...(Object.keys(current).length ? current : {
                    ...(recordDate ? { record_datetime: `${recordDate}T00:00`, record_date: recordDate } : {}),
                    saved_at: new Date().toISOString(), source: 'bulk-upload'
                }),
                photos: [...(Array.isArray(current.photos) ? current.photos : []), ...photos]
            }) }],
            mutateDocuments: async (connection, row) => {
                const [existing] = await connection.query(
                    `SELECT id, file_path FROM patient_documents
                     WHERE patient_id = ? AND mr_id = ? AND document_type = 'usg_photo'
                     ORDER BY id FOR UPDATE`, [row.patient_id, row.mr_id]);
                const existingKeys = new Set(existing.map(item => item.file_path));
                for (const photo of documents) {
                    if (existingKeys.has(photo.key)) continue;
                    await connection.query(
                        `INSERT INTO patient_documents
                         (patient_id, mr_id, document_type, title, file_url, file_path, file_name, file_type, file_size,
                          source, status, published_at, published_by, created_by, created_at)
                         VALUES (?, ?, 'usg_photo', ?, ?, ?, ?, ?, ?, 'clinic', 'published', NOW(), ?, ?, NOW())`,
                        [row.patient_id, row.mr_id, photo.name || 'Foto USG', photo.url, photo.key,
                            photo.name || 'Foto USG', photo.type || 'image/jpeg', photo.size || 0,
                            actor?.id && /^\d+$/.test(String(actor.id)) ? Number(actor.id) : null,
                            actor?.id && /^\d+$/.test(String(actor.id)) ? Number(actor.id) : null]);
                }
                return { added: documents.length };
            }
        });
        try {
            await this.notify({ patient_id: patientId, type: 'document', title: 'Foto USG Baru',
                message: `${documents.length} foto USG baru telah tersedia. Klik untuk melihat.`,
                link: '/album-usg.html', icon: 'fa fa-image', icon_color: 'text-primary' });
        } catch (_) { logger.warn('USG postcommit notification failed', { count: 1 }); }
        const event = { type: 'usg:patient_updated', added: documents.length, removed: 0 };
        try { this.realtimeSync.broadcast(event); } catch (_) { /* postcommit transport */ }
        try { this.realtimeSync.broadcastToRoom(`patient:${patientId}`, event); } catch (_) { /* postcommit transport */ }
        return result;
    }

    async compensateUploaded(photos) {
        const keys = [...new Set((Array.isArray(photos) ? photos : []).map(photo => photo?.key || photo)
            .filter(key => typeof key === 'string' && /^(?:usg-photos|usg)\/[A-Za-z0-9/_-]+\.[A-Za-z0-9]+$/.test(key) && !key.includes('..')))];
        const outcomes = await Promise.allSettled(keys.map(key => this.r2Storage.deleteFile(key)));
        const failed = outcomes.filter(item => item.status === 'rejected').length;
        if (failed) logger.warn('USG uploaded-object compensation incomplete', { attempted: keys.length, failed });
        return { attempted: keys.length, failed };
    }
}

module.exports = new UsgClinicalPhotoService();
module.exports.UsgClinicalPhotoService = UsgClinicalPhotoService;
