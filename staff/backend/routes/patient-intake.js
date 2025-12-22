'use strict';

const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const PatientIntakeIntegrationService = require('../services/PatientIntakeIntegrationService');
const { verifyToken, requireSuperadmin } = require('../middleware/auth');
const db = require('../db');
const { getGMT7Timestamp } = require('../utils/idGenerator');
const { ROLE_IDS, ROLE_NAMES, isSuperadminRole } = require('../constants/roles');

const router = express.Router();
const STORAGE_DIR = path.join(__dirname, '..', 'logs', 'patient-intake');
const ENCRYPTION_KEY = process.env.INTAKE_ENCRYPTION_KEY || '';
const ENCRYPTION_KEY_ID = process.env.INTAKE_ENCRYPTION_KEY_ID || 'default';
let encryptionWarningLogged = false;
const VALID_INTAKE_CATEGORIES = new Set(['obstetri', 'gyn_repro', 'gyn_special', 'admin_followup']);

// Helper: Check if user can access patient intake data
function canAccessPatientIntake(user, patientId) {
    // Superadmin/dokter can access all records
    if (user.is_superadmin || user.role === ROLE_NAMES.DOKTER || isSuperadminRole(user.role_id)) {
        return true;
    }
    // Patient can only access their own records
    if (user.user_type === 'patient' && (user.id === patientId || user.patientId === patientId)) {
        return true;
    }
    // Staff with medical permissions (bidan) can access for clinical purposes
    if (user.role === ROLE_NAMES.BIDAN || user.role_id === ROLE_IDS.BIDAN) {
        return true;
    }
    return false;
}

function trimToNull(value) {
    if (value === null || value === undefined) {
        return null;
    }
    const trimmed = String(value).trim();
    return trimmed.length ? trimmed : null;
}

function normalizeChoice(value) {
    const trimmed = trimToNull(value);
    return trimmed ? trimmed.toLowerCase() : null;
}

function normalizeCategory(value) {
    const normalized = normalizeChoice(value);
    if (!normalized) {
        return null;
    }
    return VALID_INTAKE_CATEGORIES.has(normalized) ? normalized : null;
}

function hasRoutingSignals(payload) {
    if (!payload || typeof payload !== 'object') {
        return false;
    }
    return [
        'pregnant_status',
        'needs_reproductive',
        'has_gyn_issue',
        'admin_followup_note',
        'admin_followup_note_secondary',
    ].some((key) => Object.prototype.hasOwnProperty.call(payload, key));
}

function deriveIntakeCategory(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    const direct = normalizeCategory(payload.intake_category || payload.metadata?.intakeCategory || null);
    if (direct) {
        return direct;
    }
    const pregnantStatus = normalizeChoice(payload.pregnant_status);
    if (pregnantStatus === 'yes') {
        return 'obstetri';
    }
    if (pregnantStatus === 'no') {
        const reproductive = normalizeChoice(payload.needs_reproductive);
        if (reproductive === 'yes') {
            return 'gyn_repro';
        }
        if (reproductive === 'no') {
            const gynIssue = normalizeChoice(payload.has_gyn_issue);
            if (gynIssue === 'yes') {
                return 'gyn_special';
            }
            if (gynIssue === 'no') {
                const hasAdminNote = Boolean(trimToNull(payload.admin_followup_note) || trimToNull(payload.admin_followup_note_secondary));
                return hasAdminNote ? 'admin_followup' : null;
            }
        }
    }
    return null;
}

function attachIntakeCategoryMetadata(payload) {
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    const category = deriveIntakeCategory(payload);
    const metadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
    metadata.intakeCategory = category || null;
    metadata.routing = {
        pregnantStatus: normalizeChoice(payload.pregnant_status),
        needsReproductive: normalizeChoice(payload.needs_reproductive),
        hasGynIssue: normalizeChoice(payload.has_gyn_issue),
    };
    const adminPrimary = trimToNull(payload.admin_followup_note);
    const adminSecondary = trimToNull(payload.admin_followup_note_secondary);
    if (adminPrimary || adminSecondary) {
        metadata.adminFollowup = {
            primaryNote: adminPrimary,
            secondaryNote: adminSecondary,
        };
    } else if (metadata.adminFollowup) {
        delete metadata.adminFollowup;
    }
    payload.metadata = metadata;
    payload.intake_category = category || null;
    return category;
}

async function ensureDirectory() {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
}

/**
 * Generate a unique 6-digit quick ID for patient intake
 */
async function generateQuickId() {
    const maxAttempts = 10;
    for (let i = 0; i < maxAttempts; i++) {
        // Generate random 6-digit number (100000-999999)
        const number = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Check if it already exists
        const [existing] = await db.query(
            'SELECT quick_id FROM patient_intake_submissions WHERE quick_id = ?',
            [number]
        );
        
        if (existing.length === 0) {
            return number;
        }
    }
    
    throw new Error('Failed to generate unique quick ID after multiple attempts');
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
    const routingProvided = hasRoutingSignals(body);
    const derivedCategory = deriveIntakeCategory(body);
    const pregnantStatus = normalizeChoice(body?.pregnant_status);
    const directCategory = body.intake_category ? normalizeCategory(body.intake_category) : null;
    const metadataCategory = body.metadata?.intakeCategory ? normalizeCategory(body.metadata.intakeCategory) : null;
    if (body.intake_category && !directCategory) {
        errors.push('Kategori tujuan kunjungan tidak dikenal.');
    }
    if (body.metadata?.intakeCategory && !metadataCategory) {
        errors.push('Metadata kategori intake tidak valid.');
    }
    if (directCategory && derivedCategory && directCategory !== derivedCategory) {
        errors.push('Jawaban tujuan kunjungan tidak konsisten dengan pilihan sebelumnya.');
    }
    if (routingProvided && (!pregnantStatus || !['yes', 'no'].includes(pregnantStatus))) {
        errors.push('Mohon pilih apakah Anda sedang hamil.');
    }
    if (routingProvided && !derivedCategory) {
        errors.push('Kategori tujuan kunjungan tidak valid.');
    }
    if (derivedCategory === 'admin_followup') {
        const adminNote = trimToNull(body.admin_followup_note) || trimToNull(body.admin_followup_note_secondary);
        if (!adminNote) {
            errors.push('Mohon tuliskan permintaan atau kebutuhan untuk tindak lanjut admin.');
        }
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

/**
 * Convert ISO date to MySQL datetime format (preserve timezone)
 */
function toMySQLDatetime(isoString) {
    if (!isoString) return null;
    // Preserve the timezone by using the string directly instead of converting to UTC
    return isoString.slice(0, 19).replace('T', ' ');
}

/**
 * Save intake record to database
 */
async function saveRecordToDatabase(record) {
    const payload = record.payload || {};
    const metadata = payload.metadata || {};
    const review = record.review || {};
    
    const data = {
        submission_id: record.submissionId,
        quick_id: record.quickId || null,
        patient_id: record.integration?.patientId || null,
        full_name: payload.full_name,
        phone: payload.phone,
        birth_date: payload.dob || null,
        nik: payload.nik || null,
        payload: JSON.stringify(payload),
        status: record.status || 'verified',
        high_risk: Boolean(metadata.highRisk),
        reviewed_by: review.verifiedBy || null,
        reviewed_at: toMySQLDatetime(review.verifiedAt),
        review_notes: review.notes || null,
        integrated_at: toMySQLDatetime(record.integration?.integratedAt),
        integration_status: record.integration?.status === 'completed' ? 'success' : (record.integration?.status || 'pending'),
        integration_result: record.integration ? JSON.stringify(record.integration) : null,
    };
    
    const [existing] = await db.query(
        'SELECT id FROM patient_intake_submissions WHERE submission_id = ?',
        [record.submissionId]
    );
    
    if (existing.length > 0) {
        // Update existing record
        await db.query(
            `UPDATE patient_intake_submissions SET
                quick_id = ?,
                patient_id = ?,
                full_name = ?,
                phone = ?,
                birth_date = ?,
                nik = ?,
                payload = ?,
                status = ?,
                high_risk = ?,
                reviewed_by = ?,
                reviewed_at = ?,
                review_notes = ?,
                integrated_at = ?,
                integration_status = ?,
                integration_result = ?
            WHERE submission_id = ?`,
            [
                data.quick_id, data.patient_id, data.full_name, data.phone, data.birth_date,
                data.nik, data.payload, data.status, data.high_risk,
                data.reviewed_by, data.reviewed_at, data.review_notes,
                data.integrated_at, data.integration_status, data.integration_result,
                data.submission_id
            ]
        );
    } else {
        // Insert new record
        await db.query(
            `INSERT INTO patient_intake_submissions (
                submission_id, quick_id, patient_id, full_name, phone, birth_date, nik,
                payload, status, high_risk, reviewed_by, reviewed_at, review_notes,
                integrated_at, integration_status, integration_result
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.submission_id, data.quick_id, data.patient_id, data.full_name, data.phone,
                data.birth_date, data.nik, data.payload, data.status, data.high_risk,
                data.reviewed_by, data.reviewed_at, data.review_notes,
                data.integrated_at, data.integration_status, data.integration_result
            ]
        );
    }
}

async function saveRecord(record) {
    // Save to database only
    await saveRecordToDatabase(record);
}

function buildSummary(record) {
    const payload = record.payload || {};
    const metadata = payload.metadata || {};
    const eddInfo = metadata.edd || {};
    const totals = metadata.obstetricTotals || {};
    const review = record.review || payload.review || {};
    const status = record.status || record.review?.status || payload.review?.status || 'patient_reported';
    const highRisk = Boolean(record.summary?.highRisk || metadata.highRisk);
    const routing = metadata.routing || {};
    return {
        submissionId: record.submissionId,
        patient_id: record.patientId || record.patient_id || record.integration?.patientId || null,
        quick_id: record.quickId || record.quick_id || null,
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
        intakeCategory: metadata.intakeCategory || payload.intake_category || null,
        routing: {
            pregnantStatus: routing.pregnantStatus || null,
            needsReproductive: routing.needsReproductive || null,
            hasGynIssue: routing.hasGynIssue || null,
        },
        adminFollowup: metadata.adminFollowup || null,
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

        const intakeCategory = attachIntakeCategoryMetadata(payload);

        // Check if patient already has a submission by phone + name (prevent duplicate submissions)
        // Using both phone AND name because family members may share phone numbers
        const patientPhone = payload.phone;
        const patientName = payload.full_name;
        if (patientPhone && patientName) {
            const normalizedPhone = patientPhone.replace(/\D/g, '').slice(-10);
            const normalizedName = patientName.trim().toLowerCase();

            try {
                const [existing] = await db.query(
                    `SELECT submission_id, quick_id, status, full_name
                    FROM patient_intake_submissions
                    WHERE RIGHT(REPLACE(phone, '-', ''), 10) = ?
                    AND LOWER(TRIM(full_name)) = ?
                    AND status IN ('verified', 'patient_reported', 'pending_review')
                    LIMIT 1`,
                    [normalizedPhone, normalizedName]
                );

                if (existing.length > 0) {
                    logger.info('Patient already has intake submission, rejecting duplicate', {
                        phone: normalizedPhone,
                        name: patientName,
                        quickId: existing[0].quick_id,
                        existingSubmissionId: existing[0].submission_id
                    });

                    return res.status(409).json({
                        success: false,
                        code: 'DUPLICATE_SUBMISSION',
                        message: 'Anda sudah memiliki formulir rekam medis. Silakan perbarui formulir yang ada.',
                        existingSubmissionId: existing[0].submission_id,
                        quickId: existing[0].quick_id,
                        shouldUpdate: true
                    });
                }
            } catch (dbError) {
                logger.error('Failed to check for existing intake submission', { error: dbError.message });
                // Continue with submission if DB check fails
            }
        }

        // Generate unique quick_id for this submission
        const quickId = await generateQuickId();
        
        const submissionId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        const status = 'verified';
        const timestamp = getGMT7Timestamp();
        const signatureValue = payload.signature?.value || payload.patient_signature || null;
        payload.metadata = payload.metadata || {};
        payload.review = payload.review || {};
        payload.review.status = status;
        payload.review.verifiedBy = 'auto_system';
        payload.review.verifiedAt = timestamp;
        
        const record = {
            submissionId,
            quickId,
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
                intakeCategory: intakeCategory || null,
                routing: payload.metadata?.routing || null,
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

        logger.info(`Patient intake submitted: ${submissionId} (status: ${status})`);

        // Extract authenticated patient ID from JWT token BEFORE integration
        let authenticatedPatientId = null;
        try {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.substring(7);
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                if (decoded && decoded.id) {
                    authenticatedPatientId = decoded.id;
                    logger.info(`Authenticated patient ID for intake: ${authenticatedPatientId}`);
                }
            }
        } catch (tokenError) {
            // Token verification failed - that's OK for non-authenticated submissions
            logger.debug('No authenticated patient for intake', { error: tokenError.message });
        }

        // Auto-integrate to EMR system (pass authenticatedPatientId to ensure correct patient is updated)
        let integrationResult = null;
        try {
            integrationResult = await PatientIntakeIntegrationService.process(record, {
                reviewer: 'auto_system',
                notes: 'Auto-integrated on submission',
                reviewedAt: timestamp,
                authenticatedPatientId, // Pass the authenticated patient ID
            });
            
            if (integrationResult) {
                record.integration = integrationResult;
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

        // Save to database
        try {
            await saveRecordToDatabase(record);
            logger.info(`Patient intake saved to database: ${submissionId}`);
        } catch (dbError) {
            console.error('=== DATABASE SAVE ERROR ===');
            console.error('Error:', dbError);
            console.error('Message:', dbError.message);
            console.error('Code:', dbError.code);
            console.error('SQL:', dbError.sql);
            logger.error('Failed to save intake to database', { 
                submissionId, 
                error: dbError.message,
                stack: dbError.stack,
                code: dbError.code,
                sqlMessage: dbError.sqlMessage
            });
            // Don't fail the response, data is already integrated
        }

        // IMPORTANT: Update intake_completed and link submission to the LOGGED-IN patient directly
        // This ensures the correct patient account is marked, regardless of phone number lookups
        try {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.substring(7);
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                if (decoded && decoded.id) {
                    // Update the intake submission to be linked to the authenticated patient
                    await db.query(
                        'UPDATE patient_intake_submissions SET patient_id = ? WHERE submission_id = ?',
                        [decoded.id, submissionId]
                    );
                    logger.info(`Linked intake submission ${submissionId} to authenticated patient: ${decoded.id}`);

                    // Mark intake as completed for the patient
                    await db.query(
                        'UPDATE patients SET intake_completed = 1 WHERE id = ?',
                        [decoded.id]
                    );
                    logger.info(`Marked intake_completed=1 for authenticated patient: ${decoded.id}`);
                }
            }
        } catch (tokenError) {
            // Token verification failed or not present - that's OK, not all submissions are authenticated
            logger.debug('Could not mark intake_completed from token', { error: tokenError.message });
        }

        res.status(201).json({
            success: true,
            submissionId,
            quickId,
            status,
            autoVerified: true,
            intakeCategory: intakeCategory || null,
            integration: integrationResult,
        });
    } catch (error) {
        next(error);
    }
});

router.get('/api/patient-intake', verifyToken, async (req, res, next) => {
    try {
        const statusFilter = req.query.status ? req.query.status.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : null;
        const riskFilter = req.query.risk ? String(req.query.risk).toLowerCase() : null;
        const searchQuery = req.query.search ? String(req.query.search).trim().toLowerCase() : '';
        const fromDate = req.query.from || null;
        const toDateValue = req.query.to || null;
        const limit = Math.min(Number.parseInt(req.query.limit, 10) || 200, 500);

        // Build query from database
        let query = `SELECT submission_id, quick_id, patient_id, full_name, phone, birth_date, nik,
            payload, status, high_risk, reviewed_by, reviewed_at, review_notes,
            created_at, updated_at
            FROM patient_intake_submissions WHERE 1=1`;
        const params = [];

        if (statusFilter && statusFilter.length > 0) {
            query += ` AND LOWER(status) IN (${statusFilter.map(() => '?').join(',')})`;
            params.push(...statusFilter);
        }

        if (riskFilter === 'high') {
            query += ` AND high_risk = 1`;
        } else if (riskFilter === 'normal') {
            query += ` AND (high_risk = 0 OR high_risk IS NULL)`;
        }

        if (searchQuery) {
            query += ` AND (LOWER(full_name) LIKE ? OR phone LIKE ?)`;
            params.push(`%${searchQuery}%`, `%${searchQuery}%`);
        }

        if (fromDate) {
            query += ` AND created_at >= ?`;
            params.push(fromDate);
        }

        if (toDateValue) {
            query += ` AND created_at <= ?`;
            params.push(toDateValue);
        }

        query += ` ORDER BY created_at DESC LIMIT ?`;
        params.push(limit);

        const [rows] = await db.query(query, params);

        // Transform to summary format
        const results = rows.map(row => {
            const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload || {});
            const metadata = payload.metadata || {};
            const eddInfo = metadata.edd || {};
            const totals = metadata.obstetricTotals || {};
            const routing = metadata.routing || {};

            return {
                submissionId: row.submission_id,
                submission_id: row.submission_id,
                patient_id: row.patient_id,
                quick_id: row.quick_id,
                receivedAt: row.created_at,
                created_at: row.created_at,
                updated_at: row.updated_at,
                status: row.status || 'patient_reported',
                patientName: row.full_name || payload.full_name || null,
                nik: row.nik || payload.nik || null,
                phone: row.phone || payload.phone || null,
                edd: eddInfo.value || payload.edd || null,
                lmp: payload.lmp || null,
                highRisk: Boolean(row.high_risk),
                high_risk: Boolean(row.high_risk),
                riskFlags: metadata.riskFlags || [],
                gravida: totals.gravida ?? payload.gravida ?? null,
                para: totals.para ?? null,
                abortus: totals.abortus ?? null,
                living: totals.living ?? null,
                reviewedBy: row.reviewed_by || null,
                reviewedAt: row.reviewed_at || null,
                notes: row.review_notes || null,
                intakeCategory: metadata.intakeCategory || payload.intake_category || null,
                routing: {
                    pregnantStatus: routing.pregnantStatus || null,
                    needsReproductive: routing.needsReproductive || null,
                    hasGynIssue: routing.hasGynIssue || null,
                },
                adminFollowup: metadata.adminFollowup || null,
                payload: payload
            };
        });

        res.json({ success: true, total: results.length, count: results.length, data: results });
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
        const patientId = req.user.id; // P2025001 format
        const patientEmail = req.user.email;
        
        logger.info('Loading intake for patient', { id: patientId, email: patientEmail });
        
        if (!patientId && !patientEmail) {
            logger.warn('No id or email in token');
            return res.json({ success: true, data: null });
        }
        
        // Try to load from database - query by patient_id or email
        try {
            // Build query to match by patient_id (primary) or email (fallback)
            let query = `SELECT submission_id, quick_id, payload, created_at as receivedAt, status 
                FROM patient_intake_submissions 
                WHERE status = 'verified' AND (`;
            const params = [];
            
            if (patientId) {
                query += `patient_id = ?`;
                params.push(patientId);
            }
            
            if (patientEmail) {
                if (params.length > 0) query += ` OR `;
                query += `JSON_EXTRACT(payload, '$.email') = ?`;
                params.push(patientEmail);
            }
            
            query += `) ORDER BY created_at DESC LIMIT 1`;
            
            const [rows] = await db.query(query, params);
            
            if (rows.length > 0) {
                const row = rows[0];
                const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
                
                logger.info('Found existing intake', { submissionId: row.submission_id, quickId: row.quick_id });
                
                return res.json({
                    success: true,
                    data: {
                        submissionId: row.submission_id,
                        quickId: row.quick_id,
                        payload: payload,
                        receivedAt: row.receivedAt,
                        status: row.status,
                    },
                });
            }
            
            logger.info('No existing intake found');
        } catch (dbError) {
            logger.error('Failed to load intake from database', { error: dbError.message, stack: dbError.stack });
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

        const intakeCategory = attachIntakeCategoryMetadata(payload);

        const patientEmail = req.user.email;
        
        logger.info('Updating intake for patient', { id: patientId, email: patientEmail });
        
        if (!patientId && !patientEmail) {
            return res.status(400).json({ success: false, message: 'Patient ID atau email tidak ditemukan' });
        }
        
        let existingRecord = null;
        
        // Load from database - query by patient_id or email
        try {
            // Build query to match by patient_id (primary) or email (fallback)
            let query = `SELECT submission_id, payload, created_at as receivedAt, status, patient_id
                FROM patient_intake_submissions 
                WHERE status = 'verified' AND (`;
            const params = [];
            
            if (patientId) {
                query += `patient_id = ?`;
                params.push(patientId);
            }
            
            if (patientEmail) {
                if (params.length > 0) query += ` OR `;
                query += `JSON_EXTRACT(payload, '$.email') = ?`;
                params.push(patientEmail);
            }
            
            query += `) ORDER BY created_at DESC LIMIT 1`;
            
            const [rows] = await db.query(query, params);
            
            if (rows.length > 0) {
                const row = rows[0];
                const storedPayload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
                existingRecord = {
                    submissionId: row.submission_id,
                    payload: storedPayload,
                    receivedAt: row.receivedAt,
                    status: row.status,
                    integration: row.patient_id ? { patientId: row.patient_id } : null,
                    review: { history: [] }
                };
                logger.info('Found existing intake for update', { submissionId: row.submission_id });
            }
        } catch (dbError) {
            logger.error('Failed to load intake from database for update', { error: dbError.message });
        }

        if (!existingRecord) {
            return res.status(404).json({ success: false, message: 'Data intake tidak ditemukan' });
        }

        const timestamp = getGMT7Timestamp();
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
            intakeCategory: intakeCategory || null,
            routing: payload.metadata?.routing || null,
        };

        // Save to database (primary storage)
        await saveRecord(existingRecord);

        logger.info('Patient intake updated', { submissionId: existingRecord.submissionId, patientId });

        return res.json({
            success: true,
            message: 'Data berhasil diperbarui',
            submissionId: existingRecord.submissionId,
            intakeCategory: intakeCategory || null,
        });
    } catch (error) {
        logger.error('Failed to update patient intake', { error: error.message });
        next(error);
    }
});

// GET verification status by phone number (must come before /:submissionId route)
router.get('/api/patient-intake/status', async (req, res, next) => {
    try {
        const { phone } = req.query;

        if (!phone) {
            return res.status(400).json({ success: false, message: 'Nomor telepon harus diisi' });
        }

        const normalizedPhone = phone.replace(/\D/g, '').slice(-10);

        const [rows] = await db.query(
            `SELECT submission_id, status, reviewed_by, reviewed_at, review_notes
            FROM patient_intake_submissions
            WHERE RIGHT(REPLACE(phone, '-', ''), 10) = ?
            AND status = 'verified'
            AND reviewed_by IS NOT NULL
            AND reviewed_by != 'auto_system'
            ORDER BY reviewed_at DESC
            LIMIT 1`,
            [normalizedPhone]
        );

        if (rows.length === 0) {
            return res.json({ success: true, data: null });
        }

        const verification = rows[0];

        return res.json({
            success: true,
            data: {
                submission_id: verification.submission_id,
                status: verification.status,
                reviewed_by: verification.reviewed_by,
                reviewed_at: verification.reviewed_at,
                review_notes: verification.review_notes
            }
        });
    } catch (error) {
        logger.error('Failed to check verification status', { error: error.message });
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

// GET all intakes for a specific patient by patient ID
router.get('/api/patient-intake/by-patient/:patientId', verifyToken, async (req, res, next) => {
    const { patientId } = req.params;

    if (!patientId || typeof patientId !== 'string') {
        return res.status(400).json({ success: false, message: 'Patient ID tidak valid.' });
    }

    // Access control check
    if (!canAccessPatientIntake(req.user, patientId)) {
        logger.warn(`Unauthorized patient intake access attempt: User ${req.user.id} tried to access patient ${patientId}`);
        return res.status(403).json({
            success: false,
            message: 'Access denied: You do not have permission to view this patient\'s intake data'
        });
    }

    try {
        // Get all intake submissions for this patient
        let query = `
            SELECT 
                submission_id, 
                quick_id, 
                phone, 
                status, 
                payload, 
                reviewed_by,
                reviewed_at,
                review_notes,
                created_at,
                updated_at
            FROM patient_intake_submissions 
            WHERE patient_id = ? OR phone = ?
            ORDER BY created_at DESC
        `;
        
        const [rows] = await db.query(query, [patientId, patientId]);
        
        if (rows.length === 0) {
            return res.status(200).json({ 
                success: true, 
                data: [],
                message: 'Tidak ada data intake untuk pasien ini.' 
            });
        }
        
        // Parse payloads for each record
        const intakes = rows.map(record => {
            let payload = null;
            if (record.payload) {
                try {
                    payload = JSON.parse(record.payload);
                } catch (parseError) {
                    logger.error('Failed to parse intake payload', { 
                        submissionId: record.submission_id,
                        error: parseError.message 
                    });
                    payload = { error: 'Failed to parse payload' };
                }
            }

            return {
                submission_id: record.submission_id,
                quick_id: record.quick_id,
                phone: record.phone,
                status: record.status,
                reviewed_by: record.reviewed_by,
                reviewed_at: record.reviewed_at,
                review_notes: record.review_notes,
                created_at: record.created_at,
                updated_at: record.updated_at,
                payload: payload
            };
        });

        res.json({
            success: true,
            data: intakes,
            count: intakes.length
        });
    } catch (error) {
        logger.error('Error fetching patient intake submissions', { 
            patientId,
            error: error.message,
            stack: error.stack 
        });
        next(error);
    }
});

// GET latest intake for a specific patient by phone number/patient ID
router.get('/api/patient-intake/patient/:patientId/latest', verifyToken, async (req, res, next) => {
    const { patientId } = req.params;

    if (!patientId || typeof patientId !== 'string') {
        return res.status(400).json({ success: false, message: 'Patient ID tidak valid.' });
    }

    // Access control check
    if (!canAccessPatientIntake(req.user, patientId)) {
        logger.warn(`Unauthorized patient intake latest access attempt: User ${req.user.id} tried to access patient ${patientId}`);
        return res.status(403).json({
            success: false,
            message: 'Access denied: You do not have permission to view this patient\'s intake data'
        });
    }

    try {
        // Try to find by patient_id first, then by phone number
        let query = `
            SELECT submission_id, quick_id, phone, status, payload, created_at
            FROM patient_intake_submissions 
            WHERE (patient_id = ? OR phone = ?)
            AND status = 'verified'
            ORDER BY created_at DESC 
            LIMIT 1
        `;
        
        const [rows] = await db.query(query, [patientId, patientId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Tidak ada data intake yang terverifikasi untuk pasien ini.' 
            });
        }
        
        const record = rows[0];
        
        // Decrypt and parse payload
        let payload = null;
        if (record.payload) {
            try {
                // Parse JSON payload
                payload = JSON.parse(record.payload);
            } catch (parseError) {
                logger.error('Failed to parse intake payload', { 
                    submissionId: record.submission_id,
                    error: parseError.message 
                });
                payload = { error: 'Failed to parse payload' };
            }
        }

        const result = {
            submission_id: record.submission_id,
            quick_id: record.quick_id,
            phone: record.phone,
            status: record.status,
            created_at: record.created_at,
            payload: payload
        };

        res.json({ success: true, data: result });
    } catch (error) {
        logger.error('Failed to fetch latest patient intake', { error: error.message, patientId });
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

router.delete('/api/patient-intake/:submissionId', verifyToken, requireSuperadmin, async (req, res, next) => {
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
