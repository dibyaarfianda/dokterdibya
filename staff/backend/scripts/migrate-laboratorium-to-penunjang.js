/**
 * Migration Script: Rename laboratorium to penunjang
 *
 * Purpose: Migrate all Sunday Clinic records from using 'laboratorium_payload'
 *          column to 'penunjang_payload' column as per requirement to rename
 *          the "Laboratorium" section to "Penunjang" throughout the application.
 *
 * This script:
 * 1. Copies data from laboratorium_payload to penunjang_payload
 * 2. Clears laboratorium_payload (sets to NULL)
 * 3. Provides rollback capability
 *
 * Usage:
 *   Migrate: node staff/backend/scripts/migrate-laboratorium-to-penunjang.js
 *   Rollback: node staff/backend/scripts/migrate-laboratorium-to-penunjang.js rollback
 *
 * IMPORTANT: Run on staging environment first!
 * IMPORTANT: Ensure database backup completed before running!
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Migrate laboratorium_payload to penunjang_payload
 */
async function migrateLaboratoriumToPenunjang() {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        console.log('\n🚀 Starting Laboratorium → Penunjang Migration\n');

        // Step 1: Check current state
        console.log('Step 1: Analyzing current data...');

        const [stats] = await connection.query(`
            SELECT
                COUNT(*) as total_records,
                SUM(CASE WHEN laboratorium_payload IS NOT NULL THEN 1 ELSE 0 END) as has_laboratorium,
                SUM(CASE WHEN penunjang_payload IS NOT NULL THEN 1 ELSE 0 END) as has_penunjang,
                SUM(CASE WHEN laboratorium_payload IS NOT NULL AND penunjang_payload IS NOT NULL THEN 1 ELSE 0 END) as has_both,
                SUM(CASE WHEN laboratorium_payload IS NULL AND penunjang_payload IS NULL THEN 1 ELSE 0 END) as has_neither
            FROM sunday_clinic_records
        `);

        const stat = stats[0];
        console.log('\nCurrent State:');
        console.log(`  Total records: ${stat.total_records}`);
        console.log(`  Has laboratorium_payload: ${stat.has_laboratorium}`);
        console.log(`  Has penunjang_payload: ${stat.has_penunjang}`);
        console.log(`  Has both: ${stat.has_both}`);
        console.log(`  Has neither: ${stat.has_neither}`);

        // Step 2: Determine records to migrate
        const [recordsToMigrate] = await connection.query(`
            SELECT id, mr_id, laboratorium_payload, penunjang_payload
            FROM sunday_clinic_records
            WHERE laboratorium_payload IS NOT NULL
            ORDER BY id ASC
        `);

        if (recordsToMigrate.length === 0) {
            console.log('\n✅ No records need migration. All records already using penunjang_payload.\n');
            await connection.commit();
            return { success: true, migrated: 0, skipped: 0, errors: 0 };
        }

        console.log(`\nStep 2: Migrating ${recordsToMigrate.length} records...\n`);

        let migrated = 0;
        let skipped = 0;
        let errors = 0;

        for (const record of recordsToMigrate) {
            try {
                // Check if penunjang_payload already exists
                if (record.penunjang_payload !== null) {
                    // Both exist - need to decide which to keep
                    // Default: Keep existing penunjang_payload, discard laboratorium_payload
                    logger.warn(`Record ${record.mr_id} has both payloads, keeping penunjang_payload`, {
                        mrId: record.mr_id
                    });

                    await connection.query(`
                        UPDATE sunday_clinic_records
                        SET laboratorium_payload = NULL
                        WHERE id = ?
                    `, [record.id]);

                    skipped++;
                } else {
                    // Migrate laboratorium_payload to penunjang_payload
                    await connection.query(`
                        UPDATE sunday_clinic_records
                        SET penunjang_payload = laboratorium_payload,
                            laboratorium_payload = NULL
                        WHERE id = ?
                    `, [record.id]);

                    logger.info(`Migrated record ${record.mr_id}`, {
                        mrId: record.mr_id
                    });

                    migrated++;
                }

                if ((migrated + skipped) % 10 === 0) {
                    console.log(`Progress: ${migrated + skipped}/${recordsToMigrate.length} records processed`);
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

        console.log('\n========== MIGRATION SUMMARY ==========');
        console.log(`Total records processed: ${recordsToMigrate.length}`);
        console.log(`✅ Successfully migrated: ${migrated}`);
        console.log(`⏭️  Skipped (already had penunjang): ${skipped}`);
        console.log(`❌ Errors: ${errors}`);
        console.log('========================================\n');

        // Step 3: Verify migration
        console.log('Step 3: Verifying migration...');

        const [verifyStats] = await connection.query(`
            SELECT
                COUNT(*) as total_records,
                SUM(CASE WHEN laboratorium_payload IS NOT NULL THEN 1 ELSE 0 END) as has_laboratorium,
                SUM(CASE WHEN penunjang_payload IS NOT NULL THEN 1 ELSE 0 END) as has_penunjang
            FROM sunday_clinic_records
        `);

        const verify = verifyStats[0];
        console.log('\nPost-Migration State:');
        console.log(`  Total records: ${verify.total_records}`);
        console.log(`  Still has laboratorium_payload: ${verify.has_laboratorium}`);
        console.log(`  Has penunjang_payload: ${verify.has_penunjang}`);

        if (verify.has_laboratorium > 0) {
            console.log(`\n⚠️  Warning: ${verify.has_laboratorium} records still have laboratorium_payload`);
        } else {
            console.log('\n✅ Migration successful! All records using penunjang_payload.\n');
        }

        return {
            success: true,
            migrated,
            skipped,
            errors
        };

    } catch (error) {
        await connection.rollback();
        logger.error('Migration failed', { error: error.message, stack: error.stack });
        throw error;
    } finally {
        connection.release();
    }
}

/**
 * Rollback: Restore laboratorium_payload from penunjang_payload
 */
async function rollbackPenunjangToLaboratorium() {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        console.log('\n🔄 Rolling back Penunjang → Laboratorium\n');

        const [recordsToRollback] = await connection.query(`
            SELECT id, mr_id, penunjang_payload, laboratorium_payload
            FROM sunday_clinic_records
            WHERE penunjang_payload IS NOT NULL
            ORDER BY id ASC
        `);

        if (recordsToRollback.length === 0) {
            console.log('✅ No records need rollback.\n');
            await connection.commit();
            return { success: true, rolledBack: 0 };
        }

        console.log(`Rolling back ${recordsToRollback.length} records...\n`);

        let rolledBack = 0;

        for (const record of recordsToRollback) {
            // Copy penunjang_payload back to laboratorium_payload
            await connection.query(`
                UPDATE sunday_clinic_records
                SET laboratorium_payload = penunjang_payload,
                    penunjang_payload = NULL
                WHERE id = ?
            `, [record.id]);

            logger.info(`Rolled back record ${record.mr_id}`, {
                mrId: record.mr_id
            });

            rolledBack++;

            if (rolledBack % 10 === 0) {
                console.log(`Progress: ${rolledBack}/${recordsToRollback.length} records rolled back`);
            }
        }

        await connection.commit();

        console.log('\n========== ROLLBACK SUMMARY ==========');
        console.log(`Total records rolled back: ${rolledBack}`);
        console.log('======================================\n');

        console.log('✅ Rollback completed successfully!\n');

        return {
            success: true,
            rolledBack
        };

    } catch (error) {
        await connection.rollback();
        logger.error('Rollback failed', { error: error.message });
        throw error;
    } finally {
        connection.release();
    }
}

/**
 * Show current statistics
 */
async function showStatistics() {
    try {
        const [stats] = await db.query(`
            SELECT
                COUNT(*) as total_records,
                SUM(CASE WHEN laboratorium_payload IS NOT NULL THEN 1 ELSE 0 END) as has_laboratorium,
                SUM(CASE WHEN penunjang_payload IS NOT NULL THEN 1 ELSE 0 END) as has_penunjang,
                SUM(CASE WHEN laboratorium_payload IS NOT NULL AND penunjang_payload IS NOT NULL THEN 1 ELSE 0 END) as has_both,
                SUM(CASE WHEN laboratorium_payload IS NULL AND penunjang_payload IS NULL THEN 1 ELSE 0 END) as has_neither
            FROM sunday_clinic_records
        `);

        const stat = stats[0];

        console.log('\n========== CURRENT STATISTICS ==========');
        console.log(`Total Sunday Clinic records: ${stat.total_records}`);
        console.log(`Has laboratorium_payload: ${stat.has_laboratorium}`);
        console.log(`Has penunjang_payload: ${stat.has_penunjang}`);
        console.log(`Has both: ${stat.has_both}`);
        console.log(`Has neither: ${stat.has_neither}`);
        console.log('=========================================\n');

    } catch (error) {
        logger.error('Failed to show statistics', { error: error.message });
    }
}

// Main execution
async function main() {
    try {
        const command = process.argv[2];

        if (command === 'rollback') {
            await rollbackPenunjangToLaboratorium();
        } else if (command === 'stats') {
            await showStatistics();
        } else {
            await migrateLaboratoriumToPenunjang();
        }

        process.exit(0);

    } catch (error) {
        console.error('\n❌ Operation failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

module.exports = {
    migrateLaboratoriumToPenunjang,
    rollbackPenunjangToLaboratorium,
    showStatistics
};
