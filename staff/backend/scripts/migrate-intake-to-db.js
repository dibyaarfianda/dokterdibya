#!/usr/bin/env node
'use strict';

/**
 * Migrate existing patient intake JSON files to database
 * This script reads all JSON files from logs/patient-intake and inserts them into patient_intake_submissions table
 */

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const db = require('../db');

const STORAGE_DIR = path.join(__dirname, '..', 'logs', 'patient-intake');
const ENCRYPTION_KEY = process.env.INTAKE_ENCRYPTION_KEY || '';
const ENCRYPTION_KEY_ID = process.env.INTAKE_ENCRYPTION_KEY_ID || 'default';

function deriveEncryptionKey() {
    if (!ENCRYPTION_KEY) {
        console.warn('⚠️  INTAKE_ENCRYPTION_KEY not found. Encrypted records will be skipped.');
        return null;
    }
    return crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
}

function decryptStoredRecord(wrapper) {
    if (!wrapper || !wrapper.encrypted) {
        return wrapper;
    }
    const key = deriveEncryptionKey();
    if (!key) {
        throw new Error('INTAKE_ENCRYPTION_KEY required for encrypted data.');
    }
    const { iv, authTag, data } = wrapper.encrypted;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(data, 'base64')),
        decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8'));
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

async function migrateRecord(record) {
    const payload = record.payload || {};
    const metadata = payload.metadata || {};
    const review = record.review || {};
    
    // Check if patient_id exists in patients table
    let validPatientId = null;
    if (record.integration?.patientId) {
        const [patientExists] = await db.query(
            'SELECT id FROM patients WHERE id = ?',
            [record.integration.patientId]
        );
        if (patientExists.length > 0) {
            validPatientId = record.integration.patientId;
        } else {
            console.log(`  ⚠️  Patient ID ${record.integration.patientId} not found, setting to NULL`);
        }
    }
    
    const data = {
        submission_id: record.submissionId,
        patient_id: validPatientId,
        full_name: payload.full_name,
        phone: payload.phone,
        birth_date: payload.dob || null,
        nik: payload.nik || null,
        payload: JSON.stringify(payload),
        status: record.status || 'verified',
        high_risk: Boolean(metadata.highRisk),
        reviewed_by: review.verifiedBy || null,
        reviewed_at: review.verifiedAt || null,
        review_notes: review.notes || null,
        integrated_at: record.integration?.integratedAt || null,
        integration_status: validPatientId ? 'success' : (record.integration ? 'failed' : 'pending'),
        integration_result: record.integration ? JSON.stringify(record.integration) : null,
    };
    
    // Check if already exists
    const [existing] = await db.query(
        'SELECT id FROM patient_intake_submissions WHERE submission_id = ?',
        [data.submission_id]
    );
    
    if (existing.length > 0) {
        console.log(`  ⏭️  Skipping ${data.submission_id} (already exists)`);
        return { skipped: true };
    }
    
    // Convert ISO dates to MySQL datetime format
    const toMySQLDatetime = (isoString) => {
        if (!isoString) return null;
        const date = new Date(isoString);
        return date.toISOString().slice(0, 19).replace('T', ' ');
    };
    
    // Insert new record
    await db.query(
        `INSERT INTO patient_intake_submissions (
            submission_id, patient_id, full_name, phone, birth_date, nik,
            payload, status, high_risk, reviewed_by, reviewed_at, review_notes,
            integrated_at, integration_status, integration_result, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            data.submission_id, data.patient_id, data.full_name, data.phone,
            data.birth_date, data.nik, data.payload, data.status, data.high_risk,
            data.reviewed_by, toMySQLDatetime(data.reviewed_at), data.review_notes,
            toMySQLDatetime(data.integrated_at), data.integration_status, data.integration_result,
            toMySQLDatetime(record.receivedAt || new Date().toISOString())
        ]
    );
    
    return { migrated: true };
}

async function main() {
    console.log('🚀 Starting patient intake migration to database...\n');
    
    try {
        // Check directory exists
        await fs.access(STORAGE_DIR);
        
        // Get all JSON files
        const files = await fs.readdir(STORAGE_DIR);
        const jsonFiles = files.filter((file) => file.endsWith('.json'));
        
        console.log(`📁 Found ${jsonFiles.length} JSON files in ${STORAGE_DIR}\n`);
        
        let migrated = 0;
        let skipped = 0;
        let errors = 0;
        
        for (const file of jsonFiles) {
            try {
                console.log(`📄 Processing ${file}...`);
                const record = await loadRecordFile(file);
                const result = await migrateRecord(record);
                
                if (result.skipped) {
                    skipped++;
                } else if (result.migrated) {
                    migrated++;
                    console.log(`  ✅ Migrated ${record.submissionId}`);
                }
            } catch (error) {
                errors++;
                console.error(`  ❌ Error processing ${file}:`, error.message);
            }
        }
        
        console.log('\n📊 Migration Summary:');
        console.log(`  ✅ Migrated: ${migrated}`);
        console.log(`  ⏭️  Skipped: ${skipped}`);
        console.log(`  ❌ Errors: ${errors}`);
        console.log(`  📁 Total: ${jsonFiles.length}`);
        
        console.log('\n✨ Migration complete!\n');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

main();
