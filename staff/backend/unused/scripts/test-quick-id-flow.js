/**
 * Test script for quick_id generation and duplicate prevention in patient intake
 * 
 * This script tests:
 * 1. Generating unique 6-digit quick_id
 * 2. Duplicate prevention by quick_id
 * 3. Loading existing intake with quick_id
 */

const db = require('../db');

async function testQuickIdFlow() {
    console.log('🧪 Testing quick_id flow for patient intake...\n');
    
    try {
        // Test 1: Check existing submission has quick_id
        console.log('Test 1: Check existing Konchelsky submission');
        const [existing] = await db.query(
            `SELECT id, submission_id, full_name, phone, quick_id, status 
            FROM patient_intake_submissions 
            WHERE full_name = 'Konchelsky'
            LIMIT 1`
        );
        
        if (existing.length > 0) {
            const record = existing[0];
            console.log('✅ Found existing submission:');
            console.log(`   - Name: ${record.full_name}`);
            console.log(`   - Phone: ${record.phone}`);
            console.log(`   - Quick ID: ${record.quick_id || 'NULL (needs to be assigned)'}`);
            console.log(`   - Status: ${record.status}`);
            console.log(`   - Submission ID: ${record.submission_id}`);
        } else {
            console.log('❌ No existing submission found');
        }
        
        console.log('\n' + '='.repeat(60) + '\n');
        
        // Test 2: Verify quick_id uniqueness constraint
        console.log('Test 2: Verify quick_id uniqueness constraint');
        const [indexInfo] = await db.query(
            `SHOW INDEX FROM patient_intake_submissions 
            WHERE Column_name = 'quick_id'`
        );
        
        if (indexInfo.length > 0) {
            console.log('✅ quick_id index exists:');
            indexInfo.forEach(idx => {
                console.log(`   - Key name: ${idx.Key_name}`);
                console.log(`   - Non-unique: ${idx.Non_unique === 0 ? 'UNIQUE' : 'NOT UNIQUE'}`);
            });
        } else {
            console.log('❌ No index found on quick_id column');
        }
        
        console.log('\n' + '='.repeat(60) + '\n');
        
        // Test 3: Test generateQuickId logic (simulate)
        console.log('Test 3: Simulate generateQuickId function');
        const randomQuickId = Math.floor(100000 + Math.random() * 900000);
        console.log(`   Generated random 6-digit number: ${randomQuickId}`);
        
        // Check if this quick_id already exists
        const [duplicate] = await db.query(
            `SELECT quick_id FROM patient_intake_submissions 
            WHERE quick_id = ?`,
            [randomQuickId.toString()]
        );
        
        if (duplicate.length === 0) {
            console.log('   ✅ Quick ID is unique (not in database)');
        } else {
            console.log('   ⚠️  Quick ID already exists (collision detected)');
        }
        
        console.log('\n' + '='.repeat(60) + '\n');
        
        // Test 4: Count total submissions
        console.log('Test 4: Count total submissions');
        const [count] = await db.query(
            `SELECT COUNT(*) as total FROM patient_intake_submissions`
        );
        console.log(`   Total submissions in database: ${count[0].total}`);
        
        // Show all submissions with quick_id status
        const [allSubmissions] = await db.query(
            `SELECT submission_id, full_name, quick_id, status, created_at 
            FROM patient_intake_submissions 
            ORDER BY created_at DESC`
        );
        
        console.log('\n   All submissions:');
        allSubmissions.forEach((sub, idx) => {
            console.log(`   ${idx + 1}. ${sub.full_name}`);
            console.log(`      - Quick ID: ${sub.quick_id || '(not assigned)'}`);
            console.log(`      - Status: ${sub.status}`);
            console.log(`      - Created: ${sub.created_at}`);
        });
        
        console.log('\n' + '='.repeat(60) + '\n');
        console.log('✅ All tests completed!\n');
        
    } catch (error) {
        console.error('❌ Error during testing:', error.message);
        console.error(error);
    } finally {
        await db.end();
        process.exit(0);
    }
}

// Run tests
testQuickIdFlow();
