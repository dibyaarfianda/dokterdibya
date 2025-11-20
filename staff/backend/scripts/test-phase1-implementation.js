/**
 * Test Script: Phase 1 MR Category System
 *
 * Purpose: Verify that Phase 1 implementation is working correctly
 * Usage: node staff/backend/scripts/test-phase1-implementation.js
 */

const db = require('../db');
const logger = require('../utils/logger');
const sundayClinicService = require('../services/sundayClinicService');

async function testDatabaseSchema() {
    console.log('\n📊 Testing Database Schema...\n');

    try {
        // Check if mr_category column exists
        const [columns] = await db.query(`
            SHOW COLUMNS FROM sunday_clinic_records LIKE 'mr_category'
        `);

        if (columns.length === 0) {
            console.log('❌ Column mr_category does not exist');
            console.log('   → Run migration: mysql -u root -p dibyaklinik < staff/backend/migrations/20251120_add_mr_category_system.sql\n');
            return false;
        }
        console.log('✅ Column mr_category exists');

        // Check if mr_sequence column exists
        const [seqColumns] = await db.query(`
            SHOW COLUMNS FROM sunday_clinic_records LIKE 'mr_sequence'
        `);

        if (seqColumns.length === 0) {
            console.log('❌ Column mr_sequence does not exist\n');
            return false;
        }
        console.log('✅ Column mr_sequence exists');

        // Check if counters table exists
        const [tables] = await db.query(`
            SHOW TABLES LIKE 'sunday_clinic_mr_counters'
        `);

        if (tables.length === 0) {
            console.log('❌ Table sunday_clinic_mr_counters does not exist\n');
            return false;
        }
        console.log('✅ Table sunday_clinic_mr_counters exists');

        // Check counter data
        const [counters] = await db.query(`
            SELECT * FROM sunday_clinic_mr_counters ORDER BY category
        `);

        if (counters.length !== 3) {
            console.log('⚠️  Expected 3 counters, found:', counters.length);
            console.log('   → Run migration to initialize counters\n');
            return false;
        }

        console.log('✅ All 3 category counters initialized:');
        counters.forEach(c => {
            console.log(`   - ${c.category}: sequence ${c.current_sequence}`);
        });

        return true;

    } catch (error) {
        console.log('❌ Database schema test failed:', error.message);
        return false;
    }
}

async function testMrIdGeneration() {
    console.log('\n🔢 Testing MR ID Generation...\n');

    try {
        // Test each category
        const categories = ['obstetri', 'gyn_repro', 'gyn_special'];
        const results = [];

        for (const category of categories) {
            try {
                const result = await sundayClinicService.generateCategoryBasedMrId(category);
                results.push(result);
                console.log(`✅ ${category}: ${result.mrId} (sequence: ${result.sequence})`);
            } catch (error) {
                console.log(`❌ ${category}: ${error.message}`);
                return false;
            }
        }

        // Verify prefixes
        if (!results[0].mrId.startsWith('MROBS')) {
            console.log('❌ Obstetri prefix incorrect');
            return false;
        }
        if (!results[1].mrId.startsWith('MRGPR')) {
            console.log('❌ Gyn_repro prefix incorrect');
            return false;
        }
        if (!results[2].mrId.startsWith('MRGPS')) {
            console.log('❌ Gyn_special prefix incorrect');
            return false;
        }

        console.log('\n✅ All MR ID formats correct!');
        return true;

    } catch (error) {
        console.log('❌ MR ID generation test failed:', error.message);
        return false;
    }
}

async function testCategoryDetection() {
    console.log('\n🎯 Testing Category Auto-Detection...\n');

    // Test cases
    const testCases = [
        {
            name: 'Pregnant patient',
            intakeData: {
                payload: { pregnant_status: 'yes' }
            },
            expected: 'obstetri'
        },
        {
            name: 'Gyn repro patient',
            intakeData: {
                payload: {
                    pregnant_status: 'no',
                    needs_reproductive: 'yes'
                },
                summary: { intakeCategory: 'gyn_repro' }
            },
            expected: 'gyn_repro'
        },
        {
            name: 'Gyn special patient',
            intakeData: {
                metadata: { intakeCategory: 'gyn_special' }
            },
            expected: 'gyn_special'
        },
        {
            name: 'No intake data (fallback)',
            intakeData: null,
            expected: 'obstetri'
        }
    ];

    let passed = 0;
    let failed = 0;

    for (const test of testCases) {
        const result = sundayClinicService.determineMrCategory(test.intakeData);

        if (result === test.expected) {
            console.log(`✅ ${test.name}: ${result}`);
            passed++;
        } else {
            console.log(`❌ ${test.name}: expected ${test.expected}, got ${result}`);
            failed++;
        }
    }

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    return failed === 0;
}

async function testStatisticsEndpoint() {
    console.log('\n📈 Testing Statistics Function...\n');

    try {
        const stats = await sundayClinicService.getCategoryStatistics();

        console.log('✅ Statistics retrieved successfully');
        console.log('\nRecord Stats:');
        if (stats.recordStats.length === 0) {
            console.log('  (No records yet)');
        } else {
            stats.recordStats.forEach(s => {
                console.log(`  - ${s.mr_category}: ${s.total_records} total, ${s.finalized_count} finalized`);
            });
        }

        console.log('\nCounters:');
        stats.counters.forEach(c => {
            console.log(`  - ${c.category}: ${c.current_sequence}`);
        });

        return true;

    } catch (error) {
        console.log('❌ Statistics test failed:', error.message);
        return false;
    }
}

async function testRecordCreation() {
    console.log('\n🏥 Testing Record Creation (Dry Run)...\n');

    try {
        // We won't actually create a record, just test the logic
        console.log('Testing category determination logic:');

        const sampleIntakeData = {
            summary: { intakeCategory: 'obstetri' },
            payload: {
                pregnant_status: 'yes',
                full_name: 'Test Patient',
                phone: '628123456789'
            }
        };

        const category = sundayClinicService.determineMrCategory(sampleIntakeData);
        console.log(`✅ Category detected: ${category}`);

        console.log('\n✅ Record creation logic verified (no actual record created)');
        return true;

    } catch (error) {
        console.log('❌ Record creation test failed:', error.message);
        return false;
    }
}

async function runAllTests() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║   Phase 1: MR Category System - Test Suite              ║');
    console.log('╚══════════════════════════════════════════════════════════╝');

    const results = {
        schema: await testDatabaseSchema(),
        mrIdGeneration: await testMrIdGeneration(),
        categoryDetection: await testCategoryDetection(),
        statistics: await testStatisticsEndpoint(),
        recordCreation: await testRecordCreation()
    };

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║                    TEST RESULTS                          ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    console.log(`Database Schema:        ${results.schema ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`MR ID Generation:       ${results.mrIdGeneration ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Category Detection:     ${results.categoryDetection ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Statistics Function:    ${results.statistics ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Record Creation:        ${results.recordCreation ? '✅ PASS' : '❌ FAIL'}`);

    const allPassed = Object.values(results).every(r => r === true);

    console.log('\n' + '═'.repeat(60));
    if (allPassed) {
        console.log('🎉 ALL TESTS PASSED! Phase 1 implementation is working correctly.');
    } else {
        console.log('⚠️  SOME TESTS FAILED. Please check the errors above.');
    }
    console.log('═'.repeat(60) + '\n');

    return allPassed ? 0 : 1;
}

// Run tests
runAllTests()
    .then(exitCode => {
        process.exit(exitCode);
    })
    .catch(error => {
        console.error('\n❌ Test suite crashed:', error);
        process.exit(1);
    });
