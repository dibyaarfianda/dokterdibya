#!/usr/bin/env node
'use strict';

/**
 * Clean up duplicate patient intake submissions
 * Keeps the most recent submission per patient (by phone number)
 * Archives or deletes older submissions
 */

require('dotenv').config();
const db = require('../db');
const logger = require('../utils/logger');

async function findDuplicates() {
    const [duplicates] = await db.query(`
        SELECT phone, full_name, COUNT(*) as count, 
               GROUP_CONCAT(submission_id ORDER BY created_at) as all_ids,
               GROUP_CONCAT(created_at ORDER BY created_at) as all_dates,
               MAX(created_at) as latest_date
        FROM patient_intake_submissions 
        GROUP BY phone, full_name 
        HAVING count > 1 
        ORDER BY count DESC
    `);
    
    return duplicates;
}

async function cleanupDuplicates(dryRun = true) {
    console.log('🔍 Finding duplicate patient intake submissions...\n');
    
    const duplicates = await findDuplicates();
    
    if (duplicates.length === 0) {
        console.log('✅ No duplicates found!\n');
        return;
    }
    
    console.log(`Found ${duplicates.length} patients with duplicate submissions:\n`);
    console.log('='.repeat(80));
    
    let totalToDelete = 0;
    const deletionPlan = [];
    
    for (const dup of duplicates) {
        const ids = dup.all_ids.split(',');
        const dates = dup.all_dates.split(',');
        const toDelete = ids.slice(0, -1); // All except the last (most recent)
        const toKeep = ids[ids.length - 1];
        
        totalToDelete += toDelete.length;
        
        console.log(`\n📱 Phone: ${dup.phone} | Name: ${dup.full_name}`);
        console.log(`   Total submissions: ${dup.count}`);
        console.log(`   ✅ KEEP (most recent): ${toKeep} (${dates[dates.length - 1]})`);
        
        toDelete.forEach((id, idx) => {
            console.log(`   ❌ DELETE (older):     ${id} (${dates[idx]})`);
            deletionPlan.push({
                submission_id: id,
                phone: dup.phone,
                full_name: dup.full_name,
                created_at: dates[idx]
            });
        });
    }
    
    console.log('\n' + '='.repeat(80));
    console.log(`\n📊 Summary: Found ${totalToDelete} duplicate submissions to delete\n`);
    
    if (dryRun) {
        console.log('🔒 DRY RUN MODE - No deletions performed');
        console.log('   Run with --execute flag to perform actual deletions\n');
        return deletionPlan;
    }
    
    // Actually delete the duplicates
    console.log('⚠️  EXECUTING DELETIONS...\n');
    
    let deleted = 0;
    for (const item of deletionPlan) {
        try {
            await db.query(
                'DELETE FROM patient_intake_submissions WHERE submission_id = ?',
                [item.submission_id]
            );
            deleted++;
            console.log(`✅ Deleted ${item.submission_id}`);
        } catch (error) {
            console.error(`❌ Failed to delete ${item.submission_id}:`, error.message);
        }
    }
    
    console.log(`\n✨ Cleanup complete! Deleted ${deleted} duplicate submissions.\n`);
    
    return deletionPlan;
}

async function main() {
    const args = process.argv.slice(2);
    const execute = args.includes('--execute');
    
    if (!execute) {
        console.log('🧪 Running in DRY RUN mode (no changes will be made)\n');
    }
    
    try {
        await cleanupDuplicates(!execute);
        
        // Show final state
        console.log('📊 Current state after cleanup:');
        const [result] = await db.query(`
            SELECT phone, full_name, COUNT(*) as count 
            FROM patient_intake_submissions 
            GROUP BY phone, full_name 
            HAVING count > 1
        `);
        
        if (result.length > 0) {
            console.log(`   ⚠️  Still ${result.length} duplicates remaining`);
        } else {
            console.log('   ✅ All duplicates cleaned up!');
        }
        
        const [total] = await db.query('SELECT COUNT(*) as total FROM patient_intake_submissions');
        console.log(`   📁 Total submissions: ${total[0].total}\n`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Cleanup failed:', error.message);
        process.exit(1);
    }
}

main();
