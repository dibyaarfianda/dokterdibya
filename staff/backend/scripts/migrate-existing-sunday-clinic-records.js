/**
 * Migration Script: Backfill MR Category for Existing Sunday Clinic Records
 *
 * Purpose: Update existing sunday_clinic_records with mr_category and mr_sequence
 *          based on their linked patient intake data
 *
 * Usage: node staff/backend/scripts/migrate-existing-sunday-clinic-records.js
 */

const db = require('../db');
const logger = require('../utils/logger');
const { determineMrCategory, MR_PREFIX } = require('../services/sundayClinicService');

// Parse category prefix from MR ID
function parseMrIdCategory(mrId) {
    if (!mrId) return null;

    // Check if already has category prefix
    if (mrId.startsWith('MROBS')) return 'obstetri';
    if (mrId.startsWith('MRGPR')) return 'gyn_repro';
    if (mrId.startsWith('MRGPS')) return 'gyn_special';

    // Legacy format (MR0001) - needs migration
    return null;
}

// Extract sequence number from MR ID
function extractSequence(mrId) {
    if (!mrId) return null;
    const match = mrId.match(/(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
}

async function backfillCategoryData() {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // Get all records without category
        const [records] = await connection.query(`
            SELECT scr.id, scr.mr_id, scr.patient_id, scr.appointment_id
            FROM sunday_clinic_records scr
            WHERE scr.mr_category IS NULL
            ORDER BY scr.id ASC
        `);

        logger.info(`Found ${records.length} records to migrate`);

        let updated = 0;
        let skipped = 0;
        let errors = 0;

        for (const record of records) {
            try {
                // Try to get intake data for this patient
                const [intakeRows] = await connection.query(`
                    SELECT submission_id, patient_id, payload, created_at
                    FROM patient_intake_submissions
                    WHERE patient_id = ?
                    ORDER BY created_at DESC
                    LIMIT 1
                `, [record.patient_id]);

                let category = null;

                if (intakeRows.length > 0) {
                    // Determine category from intake data
                    const intakeData = {
                        payload: JSON.parse(intakeRows[0].payload)
                    };
                    category = determineMrCategory(intakeData);
                    logger.info(`Determined category from intake for MR ${record.mr_id}`, {
                        mrId: record.mr_id,
                        patientId: record.patient_id,
                        category
                    });
                } else {
                    // No intake data - default to obstetri
                    category = 'obstetri';
                    logger.warn(`No intake data found for MR ${record.mr_id}, defaulting to obstetri`, {
                        mrId: record.mr_id,
                        patientId: record.patient_id
                    });
                }

                // Extract sequence from current MR ID
                const sequence = extractSequence(record.mr_id);

                // Update the record
                await connection.query(`
                    UPDATE sunday_clinic_records
                    SET mr_category = ?, mr_sequence = ?
                    WHERE id = ?
                `, [category, sequence, record.id]);

                updated++;

                if (updated % 10 === 0) {
                    logger.info(`Progress: ${updated}/${records.length} records updated`);
                }

            } catch (error) {
                logger.error(`Failed to migrate record ${record.mr_id}`, {
                    mrId: record.mr_id,
                    error: error.message
                });
                errors++;
            }
        }

        await connection.commit();

        logger.info('Migration completed', {
            total: records.length,
            updated,
            skipped,
            errors
        });

        console.log('\n========== MIGRATION SUMMARY ==========');
        console.log(`Total records processed: ${records.length}`);
        console.log(`✅ Successfully updated: ${updated}`);
        console.log(`⏭️  Skipped: ${skipped}`);
        console.log(`❌ Errors: ${errors}`);
        console.log('========================================\n');

        // Update counters to match highest sequence per category
        logger.info('Updating sequence counters...');

        const [categoryMaxSequences] = await connection.query(`
            SELECT mr_category, MAX(mr_sequence) as max_seq
            FROM sunday_clinic_records
            WHERE mr_category IS NOT NULL AND mr_sequence IS NOT NULL
            GROUP BY mr_category
        `);

        for (const row of categoryMaxSequences) {
            await connection.query(`
                UPDATE sunday_clinic_mr_counters
                SET current_sequence = ?
                WHERE category = ?
            `, [row.max_seq, row.mr_category]);

            logger.info(`Updated ${row.mr_category} counter to ${row.max_seq}`);
        }

        console.log('\n✅ Sequence counters synchronized successfully!\n');

    } catch (error) {
        await connection.rollback();
        logger.error('Migration failed', { error: error.message, stack: error.stack });
        throw error;
    } finally {
        connection.release();
    }
}

async function generateNewMrIds() {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // Get all records that need new MR IDs (legacy format)
        const [records] = await connection.query(`
            SELECT id, mr_id, mr_category, mr_sequence, folder_path
            FROM sunday_clinic_records
            WHERE mr_id NOT LIKE 'MROBS%'
              AND mr_id NOT LIKE 'MRGPR%'
              AND mr_id NOT LIKE 'MRGPS%'
              AND mr_category IS NOT NULL
              AND mr_sequence IS NOT NULL
            ORDER BY id ASC
        `);

        if (records.length === 0) {
            logger.info('No records need MR ID regeneration');
            return;
        }

        logger.info(`Found ${records.length} records that need new MR IDs`);

        let updated = 0;

        for (const record of records) {
            const prefix = MR_PREFIX[record.mr_category];
            const newMrId = `${prefix}${String(record.mr_sequence).padStart(4, '0')}`;
            const newFolderPath = `sunday-clinic/${newMrId.toLowerCase()}`;

            // Update MR ID and folder path
            await connection.query(`
                UPDATE sunday_clinic_records
                SET mr_id = ?, folder_path = ?
                WHERE id = ?
            `, [newMrId, newFolderPath, record.id]);

            logger.info(`Updated MR ID`, {
                oldMrId: record.mr_id,
                newMrId,
                category: record.mr_category,
                sequence: record.mr_sequence
            });

            updated++;
        }

        await connection.commit();

        console.log('\n========== MR ID REGENERATION SUMMARY ==========');
        console.log(`Total records updated: ${updated}`);
        console.log('===============================================\n');

    } catch (error) {
        await connection.rollback();
        logger.error('MR ID regeneration failed', { error: error.message });
        throw error;
    } finally {
        connection.release();
    }
}

async function showStatistics() {
    try {
        const [stats] = await db.query(`
            SELECT
                mr_category,
                COUNT(*) as total,
                MIN(mr_id) as first_id,
                MAX(mr_id) as last_id,
                MIN(mr_sequence) as min_seq,
                MAX(mr_sequence) as max_seq
            FROM sunday_clinic_records
            WHERE mr_category IS NOT NULL
            GROUP BY mr_category
            ORDER BY mr_category
        `);

        console.log('\n========== CATEGORY STATISTICS ==========');
        for (const row of stats) {
            console.log(`\n${row.mr_category.toUpperCase()}:`);
            console.log(`  Total records: ${row.total}`);
            console.log(`  First ID: ${row.first_id} (seq: ${row.min_seq})`);
            console.log(`  Last ID: ${row.last_id} (seq: ${row.max_seq})`);
        }
        console.log('\n=========================================\n');

    } catch (error) {
        logger.error('Failed to show statistics', { error: error.message });
    }
}

// Main execution
async function main() {
    try {
        console.log('\n🚀 Starting Sunday Clinic MR Category Migration\n');

        // Step 1: Backfill category data
        console.log('Step 1: Backfilling category and sequence data...\n');
        await backfillCategoryData();

        // Step 2: Regenerate MR IDs with category prefix (optional - uncomment if needed)
        // console.log('\nStep 2: Regenerating MR IDs with category prefix...\n');
        // await generateNewMrIds();

        // Step 3: Show statistics
        await showStatistics();

        console.log('✅ Migration completed successfully!\n');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

module.exports = {
    backfillCategoryData,
    generateNewMrIds,
    showStatistics
};
