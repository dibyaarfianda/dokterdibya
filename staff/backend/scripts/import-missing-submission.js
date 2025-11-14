/**
 * Import missing JSON submission into database
 */

const fs = require('fs/promises');
const path = require('path');
const db = require('../db');
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.INTAKE_ENCRYPTION_KEY || '';

async function importMissingSubmission() {
    const submissionId = '1763144217387-d13ed7';
    const filePath = path.join(__dirname, '..', 'logs', 'patient-intake', `${submissionId}.json`);
    
    try {
        console.log(`Reading file: ${filePath}`);
        const content = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(content);
        
        console.log('File loaded:', {
            submissionId: data.submissionId,
            status: data.status,
            receivedAt: data.receivedAt,
            highRisk: data.highRisk,
            encrypted: !!data.encrypted
        });
        
        // Decrypt payload if encrypted
        let record;
        if (data.encrypted) {
            const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
            const { iv, authTag, data: encryptedData } = data.encrypted;
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
            decipher.setAuthTag(Buffer.from(authTag, 'base64'));
            const decrypted = Buffer.concat([
                decipher.update(Buffer.from(encryptedData, 'base64')),
                decipher.final(),
            ]);
            record = JSON.parse(decrypted.toString('utf8'));
        } else {
            record = data.record || data;
        }
        
        const payload = record.payload;
        
        console.log('Patient info:', {
            full_name: payload.full_name,
            phone: payload.phone,
            dob: payload.dob
        });
        
        // Generate quick_id
        const quickId = Math.floor(100000 + Math.random() * 900000).toString();
        console.log('Generated quick_id:', quickId);
        
        // Convert ISO date to MySQL datetime
        const toMySQLDatetime = (isoString) => {
            if (!isoString) return null;
            return new Date(isoString).toISOString().slice(0, 19).replace('T', ' ');
        };
        
        // Insert into database
        const insertData = {
            submission_id: submissionId,
            quick_id: quickId,
            patient_id: '64358', // From logs
            full_name: payload.full_name,
            phone: payload.phone,
            birth_date: payload.dob || null,
            nik: payload.nik || null,
            payload: JSON.stringify(payload),
            status: data.status || 'verified',
            high_risk: data.highRisk || false,
            reviewed_by: 'auto_system',
            reviewed_at: toMySQLDatetime(data.receivedAt),
            integration_status: 'success',
            integrated_at: toMySQLDatetime(data.receivedAt),
            created_at: toMySQLDatetime(data.receivedAt)
        };
        
        await db.query(
            `INSERT INTO patient_intake_submissions (
                submission_id, quick_id, patient_id, full_name, phone, birth_date, nik,
                payload, status, high_risk, reviewed_by, reviewed_at, review_notes,
                integrated_at, integration_status, integration_result, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                insertData.submission_id, insertData.quick_id, insertData.patient_id,
                insertData.full_name, insertData.phone, insertData.birth_date, insertData.nik,
                insertData.payload, insertData.status, insertData.high_risk,
                insertData.reviewed_by, insertData.reviewed_at, null,
                insertData.integrated_at, insertData.integration_status, null,
                insertData.created_at
            ]
        );
        
        console.log('✅ Successfully imported submission to database');
        console.log(`   - Submission ID: ${submissionId}`);
        console.log(`   - Quick ID: ${quickId}`);
        console.log(`   - Patient: ${insertData.full_name}`);
        console.log(`   - Phone: ${insertData.phone}`);
        
    } catch (error) {
        console.error('❌ Error importing submission:', error.message);
        console.error(error);
    } finally {
        await db.end();
        process.exit(0);
    }
}

importMissingSubmission();
