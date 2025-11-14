'use strict';

const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');
const PatientIntakeIntegrationService = require('../services/PatientIntakeIntegrationService');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
const STORAGE_DIR = path.join(__dirname, '..', 'logs', 'patient-intake');
const ENCRYPTION_KEY = process.env.INTAKE_ENCRYPTION_KEY || '';
const ENCRYPTION_KEY_ID = process.env.INTAKE_ENCRYPTION_KEY_ID || 'default';
let encryptionWarningLogged = false;

async function ensureDirectory() {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
}

function validatePayload(body) {
    const errors = [];
    if (!body || typeof body !== 'object') {
        errors.push('Payload tidak ditemukan.');
        return errors;
    }
    if (!body.full_name) {
        errors.push('Nama lengkap wajib diisi.');
    }
    if (!body.dob) {
        errors.push('Tanggal lahir wajib diisi.');
    }
    if (!body.phone) {
        errors.push('Nomor telepon wajib diisi.');
    }
    if (!body.consent) {
        errors.push('Persetujuan diperlukan sebelum mengirim data.');
    }
    if (!body.final_ack) {
        errors.push('Konfirmasi akhir wajib dicentang.');
    }
    const signatureValue = body.signature?.value || body.patient_signature;
    if (!signatureValue || typeof signatureValue !== 'string' || !signatureValue.trim()) {
        errors.push('Tanda tangan digital diperlukan.');
    }
    if (!body.metadata || typeof body.metadata !== 'object') {
        errors.push('Metadata tidak lengkap.');
    }
    return errors;
}

function deriveEncryptionKey() {
    if (!ENCRYPTION_KEY) {
        if (!encryptionWarningLogged) {
            logger.warn('INTAKE_ENCRYPTION_KEY tidak ditemukan. Data intake akan disimpan tanpa enkripsi.');
            encryptionWarningLogged = true;
        }
        return null;
    }
    return crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
}

function encryptRecordPayload(record) {
    const key = deriveEncryptionKey();
    if (!key) {
        return { encrypted: false, payload: record };
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const plaintext = Buffer.from(JSON.stringify(record), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
        encrypted: true,
        algorithm: 'aes-256-gcm',
        keyId: ENCRYPTION_KEY_ID,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        data: ciphertext.toString('base64'),
    };
}

function wrapRecordForStorage(record) {
    const encrypted = encryptRecordPayload(record);
    if (!encrypted.encrypted) {
        return record;
    }
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(record.payload || {})).digest('hex');
    return {
        submissionId: record.submissionId,
        receivedAt: record.receivedAt,
        status: record.status,
        highRisk: Boolean(record.summary?.highRisk),
        payloadHash,
        encrypted: {
            algorithm: encrypted.algorithm,
            keyId: encrypted.keyId,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
            data: encrypted.data,
        },
    };
}

function decryptStoredRecord(wrapper) {
    if (!wrapper || !wrapper.encrypted) {
        return wrapper;
    }
    const key = deriveEncryptionKey();
    if (!key) {
        throw new Error('INTAKE_ENCRYPTION_KEY diperlukan untuk membaca data intake terenkripsi.');
    }
    const { iv, authTag, data } = wrapper.encrypted;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(data, 'base64')),
        decipher.final(),
    ]);
    const record = JSON.parse(decrypted.toString('utf8'));
    record.storage = {
        submissionId: wrapper.submissionId,
        receivedAt: wrapper.receivedAt,
        status: wrapper.status,
        highRisk: wrapper.highRisk,
        payloadHash: wrapper.payloadHash,
        encrypted: true,
        keyId: wrapper.encrypted.keyId,
    };
    return record;
}

async function loadRecordFile(fileName) {
    const raw = await fs.readFile(path.join(STORAGE_DIR, fileName), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.encrypted) {
        return decryptStoredRecord(parsed);
    }
    if (!parsed.submissionId) {
        parsed.submissionId = path.basename(fileName, '.json');
    }
    if (!parsed.receivedAt) {
        parsed.receivedAt = parsed.createdAt || parsed.payload?.metadata?.submittedAt || null;
    }
    return parsed;
}

async function loadRecordById(submissionId) {
    await ensureDirectory();
    const fileName = `${submissionId}.json`;
    try {
        return await loadRecordFile(fileName);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

async function saveRecord(record) {
    await ensureDirectory();
    const filePath = path.join(STORAGE_DIR, `${record.submissionId}.json`);
    const payload = wrapRecordForStorage(record);
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function buildSummary(record) {
    const payload = record.payload || {};
    const metadata = payload.metadata || {};
    const eddInfo = metadata.edd || {};
    const totals = metadata.obstetricTotals || {};
    const review = record.review || payload.review || {};
    const status = record.status || record.review?.status || payload.review?.status || 'patient_reported';
    const highRisk = Boolean(record.summary?.highRisk || metadata.highRisk);
    return {
        submissionId: record.submissionId,
        receivedAt: record.receivedAt,
        status,
        patientName: payload.full_name || null,
        nik: payload.nik || null,
        phone: payload.phone || null,
        edd: eddInfo.value || payload.edd || null,
        lmp: payload.lmp || null,
        highRisk,
        riskFlags: record.summary?.riskFlags || metadata.riskFlags || [],
        gravida: totals.gravida ?? payload.gravida ?? null,
        para: totals.para ?? null,
        abortus: totals.abortus ?? null,
        living: totals.living ?? null,
        reviewedBy: review.verifiedBy || review.reviewedBy || null,
        reviewedAt: review.verifiedAt || review.reviewedAt || null,
        notes: review.notes || null,
    };
}

function toDate(value) {
    if (!value) {
        return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? null : date;
}

router.post('/api/patient-intake', async (req, res, next) => {
    try {
        const payload = req.body;
        const errors = validatePayload(payload);
        if (errors.length) {
            return res.status(422).json({ success: false, errors });
        }

        await ensureDirectory();
        const submissionId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        const filePath = path.join(STORAGE_DIR, `${submissionId}.json`);
        // Auto-verify: set status directly to 'verified' instead of 'patient_reported'
        const status = 'verified';
        const timestamp = new Date().toISOString();
        const signatureValue = payload.signature?.value || payload.patient_signature || null;
        payload.metadata = payload.metadata || {};
        payload.review = payload.review || {};
        payload.review.status = status;
        payload.review.verifiedBy = 'auto_system';
        payload.review.verifiedAt = timestamp;
        
        const record = {
            submissionId,
            receivedAt: timestamp,
            status,
            payload,
            review: {
                status,
                verifiedBy: 'auto_system',
                verifiedAt: timestamp,
                sections: payload.review?.sections || {},
                history: [
                    {
                        status: 'patient_reported',
                        actor: 'patient',
                        timestamp,
                    },
                    {
                        status,
                        actor: 'auto_system',
                        notes: 'Auto-verified and integrated on submission',
                        timestamp,
                    },
                ],
            },
            summary: {
                highRisk: Boolean(payload.metadata?.highRisk),
                riskFlags: payload.metadata?.riskFlags || [],
            },
            client: {
                ip: req.ip,
                userAgent: req.get('user-agent') || null,
                referer: req.get('referer') || null,
            },
            audit: {
                signatureType: payload.signature?.type || 'digital_name',
                signatureValue,
                deviceTimestamp: payload.metadata?.deviceTimestamp || null,
                payloadHash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
            },
        };

        const storagePayload = wrapRecordForStorage(record);
        await fs.writeFile(filePath, JSON.stringify(storagePayload, null, 2), 'utf8');
        logger.info(`Patient intake stored: ${submissionId} (status: ${status})`);

        // Auto-integrate to EMR system
        let integrationResult = null;
        try {
            integrationResult = await PatientIntakeIntegrationService.process(record, {
                reviewer: 'auto_system',
                notes: 'Auto-integrated on submission',
                reviewedAt: timestamp,
            });
            
            if (integrationResult) {
                record.integration = integrationResult;
                // Update file with integration result
                const updatedStoragePayload = wrapRecordForStorage(record);
                await fs.writeFile(filePath, JSON.stringify(updatedStoragePayload, null, 2), 'utf8');
                logger.info(`Patient intake auto-integrated: ${submissionId}, Patient ID: ${integrationResult.patientId}`);
            }
        } catch (integrationError) {
            logger.error('Failed to auto-integrate intake submission', {
                submissionId,
                error: integrationError.message,
            });
            // Don't fail the whole request, just log the error
            integrationResult = {
                error: integrationError.message,
                status: 'failed',
            };
        }

        res.status(201).json({ 
            success: true, 
            submissionId, 
            status,
            autoVerified: true,
            integration: integrationResult,
        });
    } catch (error) {
        next(error);
    }
});

router.get('/api/patient-intake', verifyToken, async (req, res, next) => {
    try {
        await ensureDirectory();
        const files = await fs.readdir(STORAGE_DIR);
        const statusFilter = req.query.status ? new Set(String(req.query.status).split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)) : null;
        const riskFilter = req.query.risk ? String(req.query.risk).toLowerCase() : null;
        const searchQuery = req.query.search ? String(req.query.search).trim().toLowerCase() : '';
        const fromDate = toDate(req.query.from);
        const toDateValue = toDate(req.query.to);
        const limit = Math.min(Number.parseInt(req.query.limit, 10) || 200, 500);

        const results = [];
        for (const file of files) {
            if (!file.endsWith('.json')) {
                continue;
            }
            try {
                const record = await loadRecordFile(file);
                if (!record || typeof record !== 'object') {
                    continue;
                }
                const summary = buildSummary(record);
                const receivedAt = toDate(summary.receivedAt);
                if (fromDate && receivedAt && receivedAt < fromDate) {
                    continue;
                }
                if (toDateValue && receivedAt && receivedAt > toDateValue) {
                    continue;
                }
                if (statusFilter && summary.status && !statusFilter.has(String(summary.status).toLowerCase())) {
                    continue;
                }
                if (riskFilter === 'high' && !summary.highRisk) {
                    continue;
                }
                if (riskFilter === 'normal' && summary.highRisk) {
                    continue;
                }
                if (searchQuery) {
                    const haystacks = [summary.patientName, summary.phone]
                        .filter(Boolean)
                        .map((value) => String(value).toLowerCase());
                    const matches = haystacks.some((value) => value.includes(searchQuery));
                    if (!matches) {
                        continue;
                    }
                }
                results.push(summary);
            } catch (error) {
                logger.warn(`Gagal membaca intake ${file}: ${error.message}`);
            }
        }

        results.sort((a, b) => {
            const dateA = toDate(a.receivedAt)?.valueOf() || 0;
            const dateB = toDate(b.receivedAt)?.valueOf() || 0;
            return dateB - dateA;
        });

        const limited = results.slice(0, limit);
        res.json({ success: true, total: results.length, count: limited.length, data: limited });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/patient-intake/my-intake
 * Get patient's own intake data (for patient self-service)
 */
router.get('/api/patient-intake/my-intake', verifyToken, async (req, res, next) => {
    try {
        await ensureDirectory();
        const files = await fs.readdir(STORAGE_DIR);
        const jsonFiles = files.filter((file) => file.endsWith('.json'));
        const patientPhone = req.user.phone || req.user.whatsapp;

        for (const file of jsonFiles) {
            const filePath = path.join(STORAGE_DIR, file);
            const content = await fs.readFile(filePath, 'utf8');
            const record = JSON.parse(content);

            const phone = record.payload?.phone || record.summary?.phone;
            if (!phone || !patientPhone) {
                continue;
            }

            const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
            const normalizedPatientPhone = patientPhone.replace(/\D/g, '').slice(-10);

            if (normalizedPhone !== normalizedPatientPhone || record.status !== 'verified') {
                continue;
            }

            let payload = record.payload;
            if (record.encrypted) {
                try {
                    const key = deriveEncryptionKey();
                    if (key) {
                        const decipher = crypto.createDecipheriv(
                            record.encrypted.algorithm || 'aes-256-gcm',
                            key,
                            Buffer.from(record.encrypted.iv, 'base64')
                        );
                        decipher.setAuthTag(Buffer.from(record.encrypted.authTag, 'base64'));
                        let decrypted = decipher.update(record.encrypted.data, 'base64', 'utf8');
                        decrypted += decipher.final('utf8');
                        const decryptedRecord = JSON.parse(decrypted);
                        payload = decryptedRecord.payload;
                    }
                } catch (error) {
                    logger.error('Failed to decrypt intake data', { error: error.message });
                }
            }

            return res.json({
                success: true,
                data: {
                    submissionId: record.submissionId,
                    payload,
                    receivedAt: record.receivedAt,
                    status: record.status,
                },
            });
        }

        return res.json({ success: true, data: null });
    } catch (error) {
        logger.error('Failed to get patient intake', { error: error.message });
        next(error);
    }
});

/**
 * PUT /api/patient-intake/my-intake
 * Update patient's own intake data
 */
router.put('/api/patient-intake/my-intake', verifyToken, async (req, res, next) => {
    try {
        const patientId = req.user.id;
        const payload = req.body;

        const errors = validatePayload(payload);
        if (errors.length) {
            return res.status(422).json({ success: false, errors });
        }

        await ensureDirectory();
        const files = await fs.readdir(STORAGE_DIR);
        const jsonFiles = files.filter((file) => file.endsWith('.json'));

        let existingFile = null;
        let existingRecord = null;
        const patientPhone = req.user.phone || req.user.whatsapp;

        for (const file of jsonFiles) {
            const filePath = path.join(STORAGE_DIR, file);
            const content = await fs.readFile(filePath, 'utf8');
            const record = JSON.parse(content);

            const phone = record.payload?.phone || record.summary?.phone;
            if (!phone || !patientPhone) {
                continue;
            }

            const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
            const normalizedPatientPhone = patientPhone.replace(/\D/g, '').slice(-10);

            if (normalizedPhone === normalizedPatientPhone && record.status === 'verified') {
                existingFile = filePath;
                existingRecord = record;
                break;
            }
        }

        if (!existingRecord) {
            return res.status(404).json({ success: false, message: 'Data intake tidak ditemukan' });
        }

        const timestamp = new Date().toISOString();
        payload.metadata = payload.metadata || {};
        payload.metadata.updatedAt = timestamp;

        existingRecord.payload = payload;
        existingRecord.status = 'verified';
        existingRecord.review = existingRecord.review || {};
        existingRecord.review.history = existingRecord.review.history || [];
        existingRecord.review.history.push({
            status: 'updated',
            actor: 'patient',
            timestamp,
            notes: 'Patient updated their intake form',
        });

        existingRecord.summary = {
            phone: payload.phone,
            name: payload.full_name,
            dob: payload.dob,
            age: payload.age,
            highRisk: payload.metadata?.highRisk || false,
        };

        const wrapped = wrapRecordForStorage(existingRecord);
        await fs.writeFile(existingFile, JSON.stringify(wrapped, null, 2), 'utf8');

        logger.info('Patient intake updated', { submissionId: existingRecord.submissionId, patientId });

        return res.json({
            success: true,
            message: 'Data berhasil diperbarui',
            submissionId: existingRecord.submissionId,
        });
    } catch (error) {
        logger.error('Failed to update patient intake', { error: error.message });
        next(error);
    }
});

router.get('/api/patient-intake/:submissionId', verifyToken, async (req, res, next) => {
    const { submissionId } = req.params;

    if (!submissionId || typeof submissionId !== 'string') {
        return res.status(400).json({ success: false, message: 'Submission ID tidak valid.' });
    }

    try {
        const record = await loadRecordById(submissionId);
        if (!record) {
            return res.status(404).json({ success: false, message: 'Data intake tidak ditemukan.' });
        }

        res.json({ success: true, data: record });
    } catch (error) {
        if (/INTAKE_ENCRYPTION_KEY/.test(error.message)) {
            return res.status(500).json({ success: false, message: error.message });
        }
        next(error);
    }
});

router.put('/api/patient-intake/:submissionId/review', verifyToken, async (req, res, next) => {
    const { submissionId } = req.params;

    if (!submissionId || typeof submissionId !== 'string') {
        return res.status(400).json({ success: false, message: 'Submission ID tidak valid.' });
    }

    try {
        const record = await loadRecordById(submissionId);
        if (!record) {
            return res.status(404).json({ success: false, message: 'Data intake tidak ditemukan.' });
        }

        const body = req.body || {};
        const allowedStatuses = new Set(['verified', 'rejected', 'needs_follow_up', 'in_progress']);
        const desiredStatus = String(body.status || 'verified').toLowerCase();
        if (!allowedStatuses.has(desiredStatus)) {
            return res.status(400).json({ success: false, message: 'Status review tidak valid.' });
        }

        const reviewer = body.reviewedBy || body.verifiedBy || body.actor || 'clinic_staff';
        const now = new Date().toISOString();
        const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;
        const sections = body.sections && typeof body.sections === 'object' ? body.sections : null;

        record.review = record.review || { history: [] };
        record.review.status = desiredStatus;
        record.review.verifiedBy = reviewer;
        record.review.verifiedAt = now;
        if (notes) {
            record.review.notes = notes;
        }
        if (sections) {
            record.review.sections = Object.assign({}, record.review.sections || {}, sections);
        }
        record.review.history = record.review.history || [];
        record.review.history.push({
            status: desiredStatus,
            actor: reviewer,
            notes,
            timestamp: now,
        });

        record.status = desiredStatus;
        record.payload = record.payload || {};
        record.payload.review = record.payload.review || {};
        record.payload.review.status = desiredStatus;
        record.payload.review.verifiedBy = reviewer;
        record.payload.review.verifiedAt = now;
        if (notes) {
            record.payload.review.notes = notes;
        }
        if (sections) {
            record.payload.review.sections = Object.assign({}, record.payload.review.sections || {}, sections);
        }

        let integrationResult = null;
        if (desiredStatus === 'verified') {
            try {
                integrationResult = await PatientIntakeIntegrationService.process(record, {
                    reviewer,
                    notes,
                    reviewedAt: now,
                });
                if (integrationResult) {
                    record.integration = integrationResult;
                }
            } catch (integrationError) {
                logger.error('Failed to integrate intake submission', {
                    submissionId,
                    error: integrationError.message,
                });
                return res.status(500).json({
                    success: false,
                    message: `Integrasi EMR gagal: ${integrationError.message}`,
                });
            }
        }

        await saveRecord(record);

        return res.json({
            success: true,
            submissionId: record.submissionId,
            status: desiredStatus,
            reviewedBy: reviewer,
            reviewedAt: now,
            integration: integrationResult || record.integration || null,
        });
    } catch (error) {
        if (/INTAKE_ENCRYPTION_KEY/.test(error.message)) {
            return res.status(500).json({ success: false, message: error.message });
        }
        next(error);
    }
});

router.delete('/api/patient-intake/:submissionId', verifyToken, async (req, res, next) => {
    const { submissionId } = req.params;

    if (!submissionId || typeof submissionId !== 'string') {
        return res.status(400).json({ success: false, message: 'Submission ID tidak valid.' });
    }

    try {
        await ensureDirectory();
        const filePath = path.join(STORAGE_DIR, `${submissionId}.json`);

        try {
            await fs.access(filePath);
        } catch (error) {
            return res.status(404).json({ success: false, message: 'Data intake tidak ditemukan.' });
        }

        const fileContent = await fs.readFile(filePath, 'utf8');
        const record = JSON.parse(fileContent);

        logger.info('Deleting patient intake submission', {
            submissionId,
            patientName: record.patientName || record.payload?.full_name,
            status: record.status,
            deletedBy: req.user?.username || 'unknown',
        });

        await fs.unlink(filePath);

        return res.json({ success: true, message: 'Data intake berhasil dihapus.', submissionId });
    } catch (error) {
        logger.error('Failed to delete intake submission', { submissionId, error: error.message });
        next(error);
    }
});

module.exports = router;
