#!/usr/bin/env node

/**
 * Cleanup All Patient Records Script
 *
 * This script:
 * 1. Queries the database to find all patient IDs
 * 2. Uses the deletePatientWithRelations function to properly remove each patient
 * 3. Shows a summary of what was deleted
 *
 * Handles the dual-table architecture where patients exist in both 'users' and 'patients' tables.
 */

const db = require('../db');
const { deletePatientWithRelations } = require('../services/patientDeletion');
const logger = require('../utils/logger');

async function getAllPatientIds() {
    const connection = await db.getConnection();
    try {
        // Get all patient IDs from patients table
        const [patients] = await connection.query(
            `SELECT DISTINCT id, full_name, email
             FROM patients
             ORDER BY id`
        );

        return patients;
    } finally {
        connection.release();
    }
}

async function cleanupAllPatients() {
    console.log('='.repeat(80));
    console.log('PATIENT CLEANUP SCRIPT - Starting...');
    console.log('='.repeat(80));
    console.log('');

    try {
        // Step 1: Get all patient IDs
        console.log('Step 1: Querying database for all patient IDs...');
        const patients = await getAllPatientIds();

        if (patients.length === 0) {
            console.log('No patients found in database. Nothing to delete.');
            return;
        }

        console.log(`Found ${patients.length} patient(s) in the database:`);
        console.log('');
        patients.forEach((patient, index) => {
            console.log(`  ${index + 1}. ID: ${patient.id}, Name: ${patient.full_name || 'N/A'}, Email: ${patient.email || 'N/A'}`);
        });
        console.log('');

        // Step 2: Delete each patient
        console.log('Step 2: Deleting patients and all related data...');
        console.log('');

        const deletionResults = [];
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < patients.length; i++) {
            const patient = patients[i];
            console.log(`[${i + 1}/${patients.length}] Processing patient: ${patient.id} (${patient.full_name || 'N/A'})...`);

            try {
                const result = await deletePatientWithRelations(patient.id);

                if (result.patient && result.deletedData) {
                    console.log(`  SUCCESS - Deleted patient: ${result.patient.full_name} (${result.patient.id})`);
                    console.log(`  Deleted from tables:`);

                    Object.entries(result.deletedData).forEach(([table, count]) => {
                        if (count > 0) {
                            console.log(`    - ${table}: ${count} record(s)`);
                        }
                    });

                    deletionResults.push({
                        patientId: patient.id,
                        patientName: result.patient.full_name,
                        email: result.patient.email,
                        success: true,
                        deletedData: result.deletedData
                    });

                    successCount++;
                } else {
                    console.log(`  WARNING - Patient ${patient.id} not found or already deleted`);
                    deletionResults.push({
                        patientId: patient.id,
                        success: false,
                        error: 'Patient not found'
                    });
                    failCount++;
                }
            } catch (error) {
                console.error(`  ERROR - Failed to delete patient ${patient.id}:`, error.message);
                deletionResults.push({
                    patientId: patient.id,
                    success: false,
                    error: error.message
                });
                failCount++;
            }

            console.log('');
        }

        // Step 3: Show summary
        console.log('='.repeat(80));
        console.log('DELETION SUMMARY');
        console.log('='.repeat(80));
        console.log('');
        console.log(`Total patients processed: ${patients.length}`);
        console.log(`Successfully deleted: ${successCount}`);
        console.log(`Failed: ${failCount}`);
        console.log('');

        // Aggregate statistics
        const aggregateStats = {};
        deletionResults.forEach(result => {
            if (result.success && result.deletedData) {
                Object.entries(result.deletedData).forEach(([table, count]) => {
                    if (!aggregateStats[table]) {
                        aggregateStats[table] = 0;
                    }
                    aggregateStats[table] += count;
                });
            }
        });

        if (Object.keys(aggregateStats).length > 0) {
            console.log('Total records deleted by table:');
            Object.entries(aggregateStats)
                .sort((a, b) => b[1] - a[1]) // Sort by count descending
                .forEach(([table, count]) => {
                    console.log(`  ${table.padEnd(35)}: ${count} record(s)`);
                });
            console.log('');
        }

        // Show failures if any
        if (failCount > 0) {
            console.log('Failed deletions:');
            deletionResults
                .filter(r => !r.success)
                .forEach(result => {
                    console.log(`  Patient ${result.patientId}: ${result.error}`);
                });
            console.log('');
        }

        console.log('='.repeat(80));
        console.log('CLEANUP COMPLETE');
        console.log('='.repeat(80));

    } catch (error) {
        console.error('Fatal error during cleanup:', error);
        throw error;
    } finally {
        // Close the database pool
        await db.end();
        console.log('Database connection closed.');
    }
}

// Run the cleanup
cleanupAllPatients()
    .then(() => {
        console.log('Cleanup script finished successfully.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Cleanup script failed:', error);
        process.exit(1);
    });
