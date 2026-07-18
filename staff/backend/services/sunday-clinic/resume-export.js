'use strict';

const {
    db,
    logger,
    findRecordByMrId,
    normalizeMrId
} = require('./shared');

async function getStatisticsCategories(req, res, next) {
    try {
        const sundayClinicService = require('../sundayClinicService');
        const stats = await sundayClinicService.getCategoryStatistics();

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        logger.error('Failed to get category statistics', {
            error: error.message
        });
        next(error);
    }
}

async function postGenerateAnamnesaByMrId(req, res, next) {
    const { mrId } = req.params;
    const normalizedMrId = normalizeMrId(mrId);

    if (!normalizedMrId) {
        return res.status(400).json({
            success: false,
            message: 'MR ID tidak valid'
        });
    }

    try {
        // Find the record
        const recordRow = await findRecordByMrId(normalizedMrId);
        if (!recordRow) {
            return res.status(404).json({
                success: false,
                message: 'Rekam medis Sunday Clinic tidak ditemukan.'
            });
        }

        // Get patient intake data
        const [intakeRows] = await db.query(
            `SELECT payload FROM patient_intake_submissions
             WHERE patient_id = ? AND status = 'verified'
             ORDER BY created_at DESC
             LIMIT 1`,
            [recordRow.patient_id]
        );

        if (intakeRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Data intake pasien tidak ditemukan'
            });
        }

        const intakeData = typeof intakeRows[0].payload === 'string'
            ? JSON.parse(intakeRows[0].payload)
            : intakeRows[0].payload;

        // Determine category from MR ID or record
        let category = recordRow.mr_category || 'obstetri';
        if (normalizedMrId.startsWith('MROBS')) {
            category = 'obstetri';
        } else if (normalizedMrId.startsWith('MRGPR')) {
            category = 'gyn_repro';
        } else if (normalizedMrId.startsWith('MRGPS')) {
            category = 'gyn_special';
        }

        // Generate summary using OpenAI
        const { generateAnamnesaSummary } = require('../openaiService');
        const summary = await generateAnamnesaSummary(intakeData, category);

        logger.info('Generated anamnesa summary', {
            mrId: normalizedMrId,
            category,
            userId: req.user.id
        });

        res.json({
            success: true,
            data: {
                summary,
                category,
                generatedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        logger.error('Failed to generate anamnesa summary', {
            mrId: normalizedMrId,
            error: error.message
        });

        if (error.message.includes('OPENAI_API_KEY')) {
            return res.status(500).json({
                success: false,
                message: 'OpenAI API tidak dikonfigurasi. Hubungi administrator.'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Gagal generate ringkasan anamnesa: ' + error.message
        });
    }
}

async function postResumeMedisPdf(req, res, next) {
    try {
        const { mrId } = req.body;

        if (!mrId) {
            return res.status(400).json({ success: false, message: 'MR ID is required' });
        }

        // Get record data
        const [records] = await db.query(
            `SELECT sc.*, p.full_name, p.age, p.phone
             FROM sunday_clinic_records sc
             LEFT JOIN patients p ON sc.patient_id = p.id
             WHERE sc.mr_id = ?`,
            [mrId]
        );

        if (!records.length) {
            return res.status(404).json({ success: false, message: 'Record not found' });
        }

        const record = records[0];

        // Get resume medis from medical_records
        const [resumeRecords] = await db.query(
            `SELECT record_data FROM medical_records
             WHERE mr_id = ? AND record_type = 'resume_medis'
             ORDER BY created_at DESC LIMIT 1`,
            [mrId]
        );

        if (!resumeRecords.length) {
            return res.status(404).json({ success: false, message: 'Resume medis tidak ditemukan. Silakan generate resume terlebih dahulu.' });
        }

        let resumeData = resumeRecords[0].record_data;
        if (typeof resumeData === 'string') {
            resumeData = JSON.parse(resumeData);
        }

        // Generate PDF
        const pdfGenerator = require('../../utils/pdf-generator');
        const patientData = {
            fullName: record.full_name,
            age: record.age,
            phone: record.phone
        };
        const recordData = { mrId };

        const result = await pdfGenerator.generateResumeMedis(resumeData, patientData, recordData);

        // Get signed URL for download (valid for 24 hours)
        const r2Storage = require('../r2Storage');
        const signedUrl = await r2Storage.getSignedDownloadUrl(result.r2Key, 86400);

        res.json({
            success: true,
            message: 'PDF generated successfully',
            data: {
                filename: result.filename,
                downloadUrl: signedUrl,
                r2Key: result.r2Key
            }
        });

    } catch (error) {
        logger.error('Generate resume PDF error:', error);
        next(error);
    }
}

async function getResumeMedisDownloadByFilename(req, res, next) {
    try {
        const { filename } = req.params;
        const path = require('path');
        const fs = require('fs');
        const filepath = path.join(__dirname, '../../..', 'database/invoices', filename);

        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        res.download(filepath, filename);

    } catch (error) {
        logger.error('Download resume PDF error:', error);
        next(error);
    }
}

async function postResumeMedisSendWhatsapp(req, res, next) {
    try {
        const { mrId, phone } = req.body;

        if (!mrId) {
            return res.status(400).json({ success: false, message: 'MR ID is required' });
        }

        if (!phone) {
            return res.status(400).json({ success: false, message: 'Phone number is required' });
        }

        // Get record data
        const [records] = await db.query(
            `SELECT sc.*, p.full_name, p.age, p.phone as patient_phone
             FROM sunday_clinic_records sc
             LEFT JOIN patients p ON sc.patient_id = p.id
             WHERE sc.mr_id = ?`,
            [mrId]
        );

        if (!records.length) {
            return res.status(404).json({ success: false, message: 'Record not found' });
        }

        const record = records[0];

        // Get resume medis from medical_records
        const [resumeRecords] = await db.query(
            `SELECT record_data FROM medical_records
             WHERE mr_id = ? AND record_type = 'resume_medis'
             ORDER BY created_at DESC LIMIT 1`,
            [mrId]
        );

        if (!resumeRecords.length) {
            return res.status(404).json({ success: false, message: 'Resume medis tidak ditemukan. Silakan generate resume terlebih dahulu.' });
        }

        let resumeData = resumeRecords[0].record_data;
        if (typeof resumeData === 'string') {
            resumeData = JSON.parse(resumeData);
        }

        // Generate PDF
        const pdfGenerator = require('../../utils/pdf-generator');
        const patientData = {
            fullName: record.full_name,
            age: record.age,
            phone: record.patient_phone
        };
        const recordData = { mrId };

        const pdfResult = await pdfGenerator.generateResumeMedis(resumeData, patientData, recordData);

        // Get signed URL for download (valid for 24 hours)
        const r2Storage = require('../r2Storage');
        const pdfUrl = await r2Storage.getSignedDownloadUrl(pdfResult.r2Key, 86400);

        // Generate WhatsApp message
        const whatsappService = require('../whatsappService');
        const message = `Halo ${record.full_name || 'Pasien'},

Berikut adalah Resume Medis Anda dari Klinik Privat Dr. Dibya:

No. MR: ${mrId}
Tanggal: ${new Date().toLocaleDateString('id-ID')}

Resume medis Anda dapat diunduh melalui link berikut (berlaku 24 jam):
${pdfUrl}

Terima kasih telah mempercayakan kesehatan Anda kepada kami.

Salam,
Klinik Privat Dr. Dibya
RSIA Melinda, Kediri`;

        // Send via WhatsApp
        const result = await whatsappService.sendAuto(phone, message);

        if (result.success) {
            res.json({
                success: true,
                message: 'Resume medis berhasil dikirim via WhatsApp',
                data: {
                    method: result.method,
                    phone: phone,
                    pdfUrl: pdfUrl
                }
            });
        } else {
            // Fallback to wa.me link
            const waLink = whatsappService.generateWaLink(phone, message);
            res.json({
                success: true,
                message: 'Klik link untuk mengirim via WhatsApp',
                data: {
                    method: 'manual',
                    waLink: waLink,
                    pdfUrl: pdfUrl
                }
            });
        }

    } catch (error) {
        logger.error('Send resume WhatsApp error:', error);
        next(error);
    }
}
module.exports = {
    getStatisticsCategories,
    postGenerateAnamnesaByMrId,
    postResumeMedisPdf,
    getResumeMedisDownloadByFilename,
    postResumeMedisSendWhatsapp
};
