/**
 * Script to recover missing USG photos from medical_records to patient_documents
 * The photos exist in R2 and medical_records table, but were not properly saved
 * to patient_documents due to a bug in the duplicate check logic.
 */

const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

async function recoverUsgPhotos() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'dibyaklinik'
    });

    console.log('Starting USG photo recovery...\n');

    try {
        // Get all USG records from medical_records
        const [usgRecords] = await db.query(`
            SELECT mr.id, mr.patient_id, mr.mr_id, mr.record_data, mr.created_at,
                   scr.visit_location
            FROM medical_records mr
            LEFT JOIN sunday_clinic_records scr ON mr.mr_id COLLATE utf8mb4_general_ci = scr.mr_id COLLATE utf8mb4_general_ci
            WHERE mr.record_type = 'usg'
            AND mr.record_data LIKE '%photos%'
        `);

        console.log(`Found ${usgRecords.length} medical records with USG photos\n`);

        let totalRecovered = 0;
        let totalSkipped = 0;
        let totalErrors = 0;

        for (const record of usgRecords) {
            try {
                const recordData = JSON.parse(record.record_data);
                const photos = recordData.photos || [];

                if (photos.length === 0) continue;

                console.log(`Processing ${record.mr_id} (${record.patient_id}): ${photos.length} photos`);

                for (const photo of photos) {
                    // Check if this photo already exists in patient_documents
                    const [existing] = await db.query(`
                        SELECT id FROM patient_documents
                        WHERE patient_id = ? AND file_url = ? AND status = 'published'
                    `, [record.patient_id, photo.url]);

                    if (existing.length > 0) {
                        console.log(`  - ${photo.name}: already exists (skipped)`);
                        totalSkipped++;
                        continue;
                    }

                    // Insert the missing photo
                    const publishedAt = photo.uploadedAt ? new Date(photo.uploadedAt) : new Date(record.created_at);

                    await db.query(`
                        INSERT INTO patient_documents (
                            patient_id, mr_id, document_type, title, description,
                            file_path, file_url, file_name, file_type, file_size,
                            status, published_at, created_at, updated_at
                        ) VALUES (?, ?, 'usg_photo', ?, NULL, ?, ?, ?, ?, ?, 'published', ?, NOW(), NOW())
                    `, [
                        record.patient_id,
                        record.mr_id,
                        photo.name || 'Foto USG',
                        photo.key || null,
                        photo.url,
                        photo.filename || photo.name,
                        photo.type || 'image/jpeg',
                        photo.size || 0,
                        publishedAt
                    ]);

                    console.log(`  - ${photo.name}: RECOVERED`);
                    totalRecovered++;
                }
            } catch (err) {
                console.error(`  Error processing ${record.mr_id}: ${err.message}`);
                totalErrors++;
            }
        }

        console.log('\n========== RECOVERY COMPLETE ==========');
        console.log(`Total photos recovered: ${totalRecovered}`);
        console.log(`Total photos skipped (already exist): ${totalSkipped}`);
        console.log(`Total errors: ${totalErrors}`);

    } finally {
        await db.end();
    }
}

recoverUsgPhotos().catch(console.error);
