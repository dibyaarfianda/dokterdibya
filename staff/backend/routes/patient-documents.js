/**
 * Patient Documents Routes
 * Handles document sharing with patients (Resume Medis, USG Photos, Lab Results)
 *
 * Features:
 * - Upload documents for patients
 * - Publish documents to patient portal
 * - Generate Resume Medis PDF
 * - Track document access (view/download)
 * - Share via WhatsApp/Email/Link
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const db = require('../db');
const logger = require('../utils/logger');
const { verifyToken, verifyPatientToken } = require('../middleware/auth');
const r2Storage = require('../services/r2Storage');
const whatsappService = require('../services/whatsappService');
const { createPatientNotification } = require('./patient-notifications');

// =====================================================
// MULTER CONFIGURATION
// =====================================================

const memoryStorage = multer.memoryStorage();

const diskStorage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../uploads/patient-documents');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext)
            .replace(/[^a-zA-Z0-9]/g, '-')
            .substring(0, 50);
        cb(null, `${name}-${uniqueSuffix}${ext}`);
    }
});

const storage = r2Storage.isR2Configured() ? memoryStorage : diskStorage;

const upload = multer({
    storage: storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|pdf|mp4|webm/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const allowedMimes = [
            'image/jpeg', 'image/png', 'image/gif',
            'application/pdf',
            'video/mp4', 'video/webm'
        ];
        const mimetype = allowedMimes.includes(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only images (JPEG, PNG, GIF), PDF, and video (MP4, WebM) files are allowed'));
        }
    }
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Generate a secure share token
 */
function generateShareToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Get GMT+7 timestamp
 */
function getGMT7Timestamp() {
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
    const gmt7Time = new Date(utcTime + (7 * 60 * 60 * 1000));
    return gmt7Time.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Detect device type from user agent
 */
function detectDeviceType(userAgent) {
    if (!userAgent) return 'unknown';
    const ua = userAgent.toLowerCase();
    if (/mobile|android|iphone|ipad|phone/i.test(ua)) {
        if (/ipad|tablet/i.test(ua)) return 'tablet';
        return 'mobile';
    }
    return 'desktop';
}

// =====================================================
// STAFF ROUTES (Protected with verifyToken)
// =====================================================

/**
 * POST /api/patient-documents/upload
 * Upload a document for a patient
 */
router.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
    try {
        const { patientId, mrId, documentType, title, description } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        if (!patientId) {
            return res.status(400).json({ success: false, message: 'Patient ID is required' });
        }

        if (!documentType) {
            return res.status(400).json({ success: false, message: 'Document type is required' });
        }

        let filePath, fileUrl;

        // Upload to R2 or local storage
        if (r2Storage.isR2Configured()) {
            const result = await r2Storage.uploadFile(
                file.buffer,
                file.originalname,
                file.mimetype,
                `patient-documents/${patientId}`
            );
            filePath = result.key;
            fileUrl = `/api/patient-documents/file/${result.key}`;
        } else {
            filePath = file.filename;
            fileUrl = `/uploads/patient-documents/${file.filename}`;
        }

        // Insert into database
        const [insertResult] = await db.query(`
            INSERT INTO patient_documents (
                patient_id, mr_id, document_type, title, description,
                file_path, file_url, file_name, file_type, file_size,
                status, created_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, NOW())
        `, [
            patientId,
            mrId || null,
            documentType,
            title || file.originalname,
            description || null,
            filePath,
            fileUrl,
            file.originalname,
            file.mimetype,
            file.size,
            req.user?.id || null
        ]);

        logger.info('Patient document uploaded', {
            documentId: insertResult.insertId,
            patientId,
            documentType,
            fileName: file.originalname
        });

        res.json({
            success: true,
            document: {
                id: insertResult.insertId,
                patientId,
                mrId,
                documentType,
                title: title || file.originalname,
                fileUrl,
                fileName: file.originalname,
                fileType: file.mimetype,
                fileSize: file.size,
                status: 'draft'
            }
        });

    } catch (error) {
        logger.error('Patient document upload error', error);
        res.status(500).json({ success: false, message: 'Upload failed: ' + error.message });
    }
});

/**
 * POST /api/patient-documents/publish
 * Publish documents to patient portal
 */
router.post('/publish', verifyToken, async (req, res) => {
    try {
        const { documentIds, notifyChannels } = req.body;

        if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
            return res.status(400).json({ success: false, message: 'Document IDs are required' });
        }

        const publishedAt = getGMT7Timestamp();
        const publishedBy = req.user?.id || null;

        // Update documents to published status
        const [updateResult] = await db.query(`
            UPDATE patient_documents
            SET status = 'published',
                published_at = ?,
                published_by = ?,
                notification_channels = ?
            WHERE id IN (?) AND status = 'draft'
        `, [publishedAt, publishedBy, JSON.stringify(notifyChannels || {}), documentIds]);

        // Get published documents for response
        const [documents] = await db.query(`
            SELECT pd.*, p.full_name as patient_name, p.phone as patient_phone
            FROM patient_documents pd
            LEFT JOIN patients p ON pd.patient_id = p.id
            WHERE pd.id IN (?)
        `, [documentIds]);

        logger.info('Documents published to patient portal', {
            documentIds,
            count: updateResult.affectedRows,
            publishedBy
        });

        // Create patient notifications for each unique patient
        const patientDocs = {};
        for (const doc of documents) {
            if (!patientDocs[doc.patient_id]) {
                patientDocs[doc.patient_id] = [];
            }
            patientDocs[doc.patient_id].push(doc);
        }

        for (const [patientId, docs] of Object.entries(patientDocs)) {
            for (const doc of docs) {
                let notifTitle = 'Dokumen Baru';
                let notifMessage = `Dokter telah mengirimkan dokumen: ${doc.title}`;
                let notifIcon = 'fa fa-file-text';
                let notifIconColor = 'text-info';

                if (doc.document_type === 'resume_medis') {
                    notifTitle = 'Resume Medis Baru';
                    notifMessage = `Resume medis Anda telah tersedia.`;
                    notifIcon = 'fa fa-file-medical-alt';
                    notifIconColor = 'text-success';
                } else if (doc.document_type === 'usg_photo') {
                    notifTitle = 'Foto USG Baru';
                    notifMessage = `Foto USG Anda telah tersedia.`;
                    notifIcon = 'fa fa-image';
                    notifIconColor = 'text-primary';
                } else if (doc.document_type === 'lab_result') {
                    notifTitle = 'Hasil Lab Baru';
                    notifMessage = `Hasil laboratorium Anda telah tersedia.`;
                    notifIcon = 'fa fa-flask';
                    notifIconColor = 'text-warning';
                }

                await createPatientNotification({
                    patient_id: patientId,
                    type: 'document',
                    title: notifTitle,
                    message: notifMessage,
                    link: `/patient-dashboard.html#documents`,
                    icon: notifIcon,
                    icon_color: notifIconColor
                });
            }
        }

        res.json({
            success: true,
            publishedCount: updateResult.affectedRows,
            documents
        });

    } catch (error) {
        logger.error('Document publish error', error);
        res.status(500).json({ success: false, message: 'Publish failed: ' + error.message });
    }
});

/**
 * POST /api/patient-documents/publish-from-mr
 * Publish documents directly from a medical record (Resume Medis, Lab Results, etc.)
 */
router.post('/publish-from-mr', verifyToken, async (req, res) => {
    try {
        const { patientId, mrId, documents, notifyChannels } = req.body;

        if (!patientId) {
            return res.status(400).json({ success: false, message: 'Patient ID is required' });
        }

        if (!documents || !Array.isArray(documents) || documents.length === 0) {
            return res.status(400).json({ success: false, message: 'Documents array is required' });
        }

        const publishedAt = getGMT7Timestamp();
        const publishedBy = req.user?.id || null;
        const createdDocuments = [];

        for (const doc of documents) {
            // For resume_medis, we store the text content as source_data
            // For files (usg_photo, lab_result), we expect file_path/file_url

            // Check for duplicate - same patient, mr_id, and document_type
            if (mrId) {
                const [existing] = await db.query(`
                    SELECT id FROM patient_documents
                    WHERE patient_id = ? AND mr_id = ? AND document_type = ? AND status = 'published'
                `, [patientId, mrId, doc.type]);

                if (existing.length > 0) {
                    logger.info('Duplicate document skipped', {
                        patientId,
                        mrId,
                        documentType: doc.type,
                        existingId: existing[0].id
                    });
                    // Return existing document instead of creating duplicate
                    createdDocuments.push({
                        id: existing[0].id,
                        type: doc.type,
                        title: doc.title,
                        status: 'already_published',
                        message: 'Dokumen ini sudah pernah dikirim sebelumnya'
                    });
                    continue;
                }
            }

            const [insertResult] = await db.query(`
                INSERT INTO patient_documents (
                    patient_id, mr_id, document_type, title, description,
                    file_path, file_url, file_name, file_type, file_size,
                    source_data, status, published_at, published_by,
                    notification_channels, created_by, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, NOW())
            `, [
                patientId,
                mrId || null,
                doc.type,
                doc.title,
                doc.description || null,
                doc.filePath || null,
                doc.fileUrl || null,
                doc.fileName || doc.title,
                doc.fileType || 'text/plain',
                doc.fileSize || 0,
                doc.sourceData ? JSON.stringify(doc.sourceData) : null,
                publishedAt,
                publishedBy,
                JSON.stringify(notifyChannels || {}),
                publishedBy
            ]);

            createdDocuments.push({
                id: insertResult.insertId,
                type: doc.type,
                title: doc.title,
                status: 'published'
            });
        }

        logger.info('Documents published from MR', {
            patientId,
            mrId,
            documentCount: createdDocuments.length,
            publishedBy
        });

        // Create patient notifications for newly published documents
        const newlyPublished = createdDocuments.filter(d => d.status === 'published');
        if (newlyPublished.length > 0) {
            // Get patient name for notification
            const [patientInfo] = await db.query(
                'SELECT full_name FROM patients WHERE id = ?',
                [patientId]
            );
            const patientName = patientInfo[0]?.full_name || 'Pasien';

            for (const doc of newlyPublished) {
                let notifTitle = 'Dokumen Baru';
                let notifMessage = `Dokter telah mengirimkan dokumen: ${doc.title}`;
                let notifIcon = 'fa fa-file-text';
                let notifIconColor = 'text-info';

                // Customize notification based on document type
                if (doc.type === 'resume_medis') {
                    notifTitle = 'Resume Medis Baru';
                    notifMessage = `Resume medis Anda telah tersedia. Klik untuk melihat.`;
                    notifIcon = 'fa fa-file-medical-alt';
                    notifIconColor = 'text-success';
                } else if (doc.type === 'usg_photo') {
                    notifTitle = 'Foto USG Baru';
                    notifMessage = `Foto USG Anda telah tersedia. Klik untuk melihat.`;
                    notifIcon = 'fa fa-image';
                    notifIconColor = 'text-primary';
                } else if (doc.type === 'lab_result') {
                    notifTitle = 'Hasil Lab Baru';
                    notifMessage = `Hasil laboratorium Anda telah tersedia. Klik untuk melihat.`;
                    notifIcon = 'fa fa-flask';
                    notifIconColor = 'text-warning';
                }

                await createPatientNotification({
                    patient_id: patientId,
                    type: 'document',
                    title: notifTitle,
                    message: notifMessage,
                    link: `/patient-dashboard.html#documents`,
                    icon: notifIcon,
                    icon_color: notifIconColor
                });
            }

            logger.info('Patient notifications created for documents', {
                patientId,
                documentCount: newlyPublished.length
            });
        }

        res.json({
            success: true,
            documents: createdDocuments
        });

    } catch (error) {
        logger.error('Publish from MR error', error);
        res.status(500).json({ success: false, message: 'Publish failed: ' + error.message });
    }
});

/**
 * GET /api/patient-documents/by-patient/:patientId
 * Get all documents for a patient (staff view)
 */
router.get('/by-patient/:patientId', verifyToken, async (req, res) => {
    try {
        const { patientId } = req.params;
        const { status, type } = req.query;

        let query = `
            SELECT pd.*,
                   u.name as published_by_name
            FROM patient_documents pd
            LEFT JOIN users u ON pd.published_by = u.new_id
            WHERE pd.patient_id = ?
        `;
        const params = [patientId];

        if (status) {
            query += ' AND pd.status = ?';
            params.push(status);
        }

        if (type) {
            query += ' AND pd.document_type = ?';
            params.push(type);
        }

        query += ' ORDER BY pd.created_at DESC';

        const [documents] = await db.query(query, params);

        res.json({
            success: true,
            documents
        });

    } catch (error) {
        logger.error('Get patient documents error', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * DELETE /api/patient-documents/:id
 * Delete a document (staff only)
 */
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Get document info first
        const [docs] = await db.query('SELECT * FROM patient_documents WHERE id = ?', [id]);

        if (docs.length === 0) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }

        const doc = docs[0];

        // Delete file from storage
        if (doc.file_path) {
            try {
                if (r2Storage.isR2Configured() && doc.file_path.includes('/')) {
                    await r2Storage.deleteFile(doc.file_path);
                } else {
                    const filePath = path.join(__dirname, '../../uploads/patient-documents', doc.file_path);
                    await fs.unlink(filePath);
                }
            } catch (fileError) {
                logger.warn('Could not delete file', { path: doc.file_path, error: fileError.message });
            }
        }

        // Soft delete in database
        await db.query(`
            UPDATE patient_documents
            SET status = 'deleted', updated_by = ?, updated_at = NOW()
            WHERE id = ?
        `, [req.user?.id || null, id]);

        logger.info('Document deleted', { documentId: id, deletedBy: req.user?.id });

        res.json({ success: true, message: 'Document deleted' });

    } catch (error) {
        logger.error('Delete document error', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// =====================================================
// PATIENT ROUTES (For patient portal)
// =====================================================

/**
 * GET /api/patient-documents/my-documents
 * Get documents for authenticated patient
 * Query params: type (optional) - filter by document_type
 */
router.get('/my-documents', verifyPatientToken, async (req, res) => {
    try {
        const patientId = req.patient?.patientId || req.patient?.id;
        const { type } = req.query;

        if (!patientId) {
            return res.status(401).json({ success: false, message: 'Patient not authenticated' });
        }

        let query = `
            SELECT
                id, document_type, title, description,
                file_url, file_name, file_type, file_size,
                published_at, first_viewed_at, view_count, download_count,
                created_at
            FROM patient_documents
            WHERE patient_id = ? AND status = 'published'
        `;
        const params = [patientId];

        // Filter by type if provided
        if (type) {
            query += ' AND document_type = ?';
            params.push(type);
        }

        query += ' ORDER BY published_at DESC';

        const [documents] = await db.query(query, params);

        res.json({
            success: true,
            documents
        });

    } catch (error) {
        logger.error('Get my documents error', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/patient-documents/:id/content
 * Get document content (for resume_medis without file)
 */
router.get('/:id/content', verifyPatientToken, async (req, res) => {
    try {
        const { id } = req.params;
        const patientId = req.patient?.patientId || req.patient?.id;

        if (!patientId) {
            return res.status(401).json({ success: false, message: 'Patient not authenticated' });
        }

        const [documents] = await db.query(`
            SELECT id, document_type, title, description, source_data, file_url, file_name
            FROM patient_documents
            WHERE id = ? AND patient_id = ? AND status = 'published'
        `, [id, patientId]);

        if (documents.length === 0) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }

        const doc = documents[0];

        // Parse source_data if exists
        let content = null;
        if (doc.source_data) {
            try {
                const sourceData = JSON.parse(doc.source_data);
                content = sourceData.content || null;
            } catch (e) {
                content = doc.source_data;
            }
        }

        res.json({
            success: true,
            document: {
                id: doc.id,
                title: doc.title,
                description: doc.description,
                documentType: doc.document_type,
                content: content,
                fileUrl: doc.file_url,
                fileName: doc.file_name
            }
        });

    } catch (error) {
        logger.error('Get document content error', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/patient-documents/:id/track
 * Track document access (view/download)
 */
router.post('/:id/track', async (req, res) => {
    try {
        const { id } = req.params;
        const { action, patientId } = req.body;

        if (!['view', 'download', 'print', 'share'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Invalid action' });
        }

        // Get patient_id from document if not provided
        let resolvedPatientId = patientId;
        if (!resolvedPatientId) {
            const [docs] = await db.query(
                'SELECT patient_id FROM patient_documents WHERE id = ?',
                [id]
            );
            if (docs.length > 0) {
                resolvedPatientId = docs[0].patient_id;
            }
        }

        if (!resolvedPatientId) {
            return res.status(400).json({ success: false, message: 'Could not determine patient ID' });
        }

        const ipAddress = req.ip || req.connection?.remoteAddress;
        const userAgent = req.headers['user-agent'];
        const deviceType = detectDeviceType(userAgent);

        // Insert access log
        await db.query(`
            INSERT INTO patient_document_access_logs
            (document_id, patient_id, action, ip_address, user_agent, device_type, accessed_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        `, [id, resolvedPatientId, action, ipAddress, userAgent, deviceType]);

        // Update document counters
        if (action === 'view') {
            await db.query(`
                UPDATE patient_documents
                SET view_count = view_count + 1,
                    last_viewed_at = NOW(),
                    first_viewed_at = COALESCE(first_viewed_at, NOW())
                WHERE id = ?
            `, [id]);
        } else if (action === 'download') {
            await db.query(`
                UPDATE patient_documents
                SET download_count = download_count + 1,
                    last_downloaded_at = NOW()
                WHERE id = ?
            `, [id]);
        }

        res.json({ success: true });

    } catch (error) {
        logger.error('Track document access error', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/patient-documents/share/:token
 * Access document via share link
 */
router.get('/share/:token', async (req, res) => {
    try {
        const { token } = req.params;

        // Find share record
        const [shares] = await db.query(`
            SELECT s.*, d.file_url, d.file_name, d.file_type, d.title, d.patient_id
            FROM patient_document_shares s
            JOIN patient_documents d ON s.document_id = d.id
            WHERE s.share_token = ? AND s.status != 'failed'
        `, [token]);

        if (shares.length === 0) {
            return res.status(404).json({ success: false, message: 'Share link not found' });
        }

        const share = shares[0];

        // Check expiry
        if (share.expires_at && new Date(share.expires_at) < new Date()) {
            return res.status(410).json({ success: false, message: 'Share link has expired' });
        }

        // Update share status to opened
        await db.query(`
            UPDATE patient_document_shares
            SET status = 'opened', opened_at = NOW()
            WHERE id = ?
        `, [share.id]);

        // Track access
        await db.query(`
            INSERT INTO patient_document_access_logs
            (document_id, patient_id, action, ip_address, user_agent, device_type, accessed_at)
            VALUES (?, ?, 'view', ?, ?, ?, NOW())
        `, [
            share.document_id,
            share.patient_id,
            req.ip,
            req.headers['user-agent'],
            detectDeviceType(req.headers['user-agent'])
        ]);

        res.json({
            success: true,
            document: {
                title: share.title,
                fileUrl: share.file_url,
                fileName: share.file_name,
                fileType: share.file_type
            }
        });

    } catch (error) {
        logger.error('Share link access error', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/patient-documents/:id/create-share-link
 * Create a shareable link for a document
 */
router.post('/:id/create-share-link', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { expiresInHours = 72, channel = 'link' } = req.body;

        // Check document exists
        const [docs] = await db.query('SELECT * FROM patient_documents WHERE id = ?', [id]);
        if (docs.length === 0) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }

        const token = generateShareToken();
        const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
        const shareUrl = `${process.env.BASE_URL || 'https://dokterdibya.com'}/shared-document/${token}`;

        // Insert share record
        await db.query(`
            INSERT INTO patient_document_shares
            (document_id, channel, share_token, share_url, expires_at, status, shared_by, created_at)
            VALUES (?, ?, ?, ?, ?, 'pending', ?, NOW())
        `, [id, channel, token, shareUrl, expiresAt, req.user?.id || null]);

        res.json({
            success: true,
            shareUrl,
            token,
            expiresAt: expiresAt.toISOString()
        });

    } catch (error) {
        logger.error('Create share link error', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/patient-documents/notify-whatsapp
 * Send WhatsApp notification to patient about their documents
 */
router.post('/notify-whatsapp', verifyToken, async (req, res) => {
    try {
        const { patientId, documentIds, phone } = req.body;

        if (!patientId) {
            return res.status(400).json({ success: false, message: 'Patient ID is required' });
        }

        if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
            return res.status(400).json({ success: false, message: 'Document IDs are required' });
        }

        // Get patient info
        const [patients] = await db.query(`
            SELECT id, full_name, phone FROM patients WHERE id = ?
        `, [patientId]);

        if (patients.length === 0) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }

        const patient = patients[0];
        const patientPhone = phone || patient.phone;

        if (!patientPhone) {
            return res.status(400).json({ success: false, message: 'Patient phone number is required' });
        }

        // Get documents
        const [documents] = await db.query(`
            SELECT id, title, document_type FROM patient_documents
            WHERE id IN (?) AND status = 'published'
        `, [documentIds]);

        if (documents.length === 0) {
            return res.status(404).json({ success: false, message: 'No published documents found' });
        }

        // Create a share token for the notification
        const token = generateShareToken();
        const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

        // Create share records for all documents
        for (const doc of documents) {
            await db.query(`
                INSERT INTO patient_document_shares
                (document_id, channel, recipient_phone, share_token, expires_at, status, shared_by, created_at)
                VALUES (?, 'whatsapp', ?, ?, ?, 'pending', ?, NOW())
            `, [doc.id, patientPhone, token, expiresAt, req.user?.id || null]);
        }

        // Send WhatsApp notification
        const notificationResult = await whatsappService.sendDocumentNotification({
            phone: patientPhone,
            patientName: patient.full_name,
            documents: documents.map(d => ({ title: d.title })),
            shareToken: token
        });

        // Update document whatsapp_status
        const whatsappStatus = notificationResult.method === 'fonnte' ? 'sent' : 'pending';
        await db.query(`
            UPDATE patient_documents
            SET whatsapp_sent_at = NOW(),
                whatsapp_status = ?
            WHERE id IN (?)
        `, [whatsappStatus, documentIds]);

        // Update share status
        if (notificationResult.success && notificationResult.method === 'fonnte') {
            await db.query(`
                UPDATE patient_document_shares
                SET status = 'sent', sent_at = NOW()
                WHERE share_token = ?
            `, [token]);
        }

        logger.info('WhatsApp notification sent', {
            patientId,
            documentIds,
            method: notificationResult.method,
            success: notificationResult.success
        });

        res.json({
            success: true,
            method: notificationResult.method,
            waLink: notificationResult.waLink || null,
            message: notificationResult.note || (notificationResult.method === 'fonnte' ? 'Pesan WhatsApp terkirim otomatis' : null),
            shareToken: token
        });

    } catch (error) {
        logger.error('WhatsApp notification error', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// =====================================================
// FILE SERVING
// =====================================================

/**
 * GET /api/patient-documents/file/*
 * Serve document files (proxy for R2 or local)
 */
router.get('/file/*', async (req, res) => {
    try {
        const key = req.params[0];

        if (!key) {
            return res.status(400).json({ error: 'File key is required' });
        }

        if (r2Storage.isR2Configured()) {
            const fileBuffer = await r2Storage.getFileBuffer(key);
            const ext = path.extname(key).toLowerCase();
            const contentTypes = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.pdf': 'application/pdf',
                '.mp4': 'video/mp4',
                '.webm': 'video/webm'
            };
            const contentType = contentTypes[ext] || 'application/octet-stream';

            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=31536000');
            res.send(fileBuffer);
        } else {
            const filePath = path.join(__dirname, '../../uploads/patient-documents', key);
            res.sendFile(filePath);
        }

    } catch (error) {
        logger.error('File serve error', { error: error.message });
        res.status(404).json({ error: 'File not found' });
    }
});

// =====================================================
// RESUME MEDIS PDF GENERATION
// =====================================================

/**
 * POST /api/patient-documents/generate-resume-pdf
 * Generate Resume Medis as PDF and save as document
 */
router.post('/generate-resume-pdf', verifyToken, async (req, res) => {
    try {
        const { patientId, mrId, resumeContent, patientData } = req.body;

        if (!patientId || !resumeContent) {
            return res.status(400).json({
                success: false,
                message: 'Patient ID and resume content are required'
            });
        }

        // For now, we'll store the resume as text content
        // PDF generation can be added later using pdfkit or similar
        const title = `Resume Medis - ${patientData?.fullName || 'Pasien'} - ${new Date().toLocaleDateString('id-ID')}`;

        const [insertResult] = await db.query(`
            INSERT INTO patient_documents (
                patient_id, mr_id, document_type, title, description,
                file_path, file_url, file_name, file_type, file_size,
                source_data, status, created_by, created_at
            ) VALUES (?, ?, 'resume_medis', ?, ?, ?, ?, ?, 'text/plain', ?, ?, 'draft', ?, NOW())
        `, [
            patientId,
            mrId || null,
            title,
            'Resume medis yang di-generate oleh AI',
            `resume-${mrId || patientId}-${Date.now()}.txt`,
            null, // Will be updated when PDF is generated
            `resume-${mrId || patientId}.txt`,
            Buffer.byteLength(resumeContent, 'utf8'),
            JSON.stringify({ content: resumeContent, patientData, generatedAt: new Date().toISOString() }),
            req.user?.id || null
        ]);

        logger.info('Resume Medis document created', {
            documentId: insertResult.insertId,
            patientId,
            mrId
        });

        res.json({
            success: true,
            document: {
                id: insertResult.insertId,
                title,
                documentType: 'resume_medis',
                status: 'draft'
            }
        });

    } catch (error) {
        logger.error('Generate resume PDF error', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
