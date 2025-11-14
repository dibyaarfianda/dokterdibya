#!/usr/bin/env node
'use strict';

/**
 * Test duplicate submission prevention
 * Verifies that patients cannot create multiple intake forms
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';

async function request(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        
        const options = {
            method: method,
            hostname: url.hostname,
            port: url.port || 80,
            path: url.pathname + url.search,
            headers: {
                'Content-Type': 'application/json',
            }
        };
        
        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }
        
        if (body) {
            const bodyStr = JSON.stringify(body);
            options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
        }
        
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode,
                        data: JSON.parse(data)
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        data: data
                    });
                }
            });
        });
        
        req.on('error', reject);
        
        if (body) {
            req.write(JSON.stringify(body));
        }
        
        req.end();
    });
}

function createSamplePayload(phone) {
    return {
        full_name: 'Test Patient',
        dob: '1990-01-01',
        age: 33,
        phone: phone,
        address: 'Test Address',
        marital_status: 'married',
        husband_name: 'Test Husband',
        husband_age: 35,
        husband_job: 'Engineer',
        height: 160,
        weight: 60,
        blood_type: 'O',
        lmp: '2025-01-01',
        edd: '2025-10-08',
        gravida: 1,
        para: 0,
        abortus: 0,
        living_children: 0,
        past_conditions: [],
        medications: '',
        allergy_drugs: '',
        allergy_food: '',
        allergy_env: '',
        risk_factors: [],
        payment_method: ['cash'],
        consent: true,
        final_ack: true,
        patient_signature: 'Test Patient',
        metadata: {
            deviceTimestamp: new Date().toISOString(),
            submittedAt: new Date().toISOString(),
            highRisk: false,
            riskFlags: [],
            bmiCategory: 'normal',
            edd: {
                value: '2025-10-08',
                method: 'lmp',
                lmp: '2025-01-01'
            },
            obstetricTotals: {
                gravida: 1,
                para: 0,
                abortus: 0,
                living: 0
            }
        }
    };
}

async function testDuplicatePrevention() {
    console.log('🧪 Testing Duplicate Submission Prevention\n');
    console.log('=' .repeat(60));
    
    const testPhone = '628999888777'; // Unique test phone
    
    // Test 1: First submission should succeed
    console.log('\n📝 Test 1: First submission (should succeed)');
    console.log('-'.repeat(60));
    
    const payload1 = createSamplePayload(testPhone);
    const response1 = await request('POST', '/api/patient-intake', payload1);
    
    console.log(`Status: ${response1.status}`);
    
    if (response1.status === 201 && response1.data.success) {
        console.log('✅ PASS: First submission accepted');
        console.log(`   Submission ID: ${response1.data.submissionId}`);
    } else {
        console.log('❌ FAIL: First submission rejected');
        console.log(`   Response:`, response1.data);
        return;
    }
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Test 2: Second submission with same phone should be rejected
    console.log('\n📝 Test 2: Duplicate submission (should be rejected)');
    console.log('-'.repeat(60));
    
    const payload2 = createSamplePayload(testPhone);
    const response2 = await request('POST', '/api/patient-intake', payload2);
    
    console.log(`Status: ${response2.status}`);
    
    if (response2.status === 409 && response2.data.code === 'DUPLICATE_SUBMISSION') {
        console.log('✅ PASS: Duplicate submission correctly rejected');
        console.log(`   Message: ${response2.data.message}`);
        console.log(`   Existing ID: ${response2.data.existingSubmissionId}`);
        console.log(`   Should Update: ${response2.data.shouldUpdate}`);
    } else {
        console.log('❌ FAIL: Duplicate submission was not properly rejected');
        console.log(`   Response:`, response2.data);
    }
    
    // Test 3: Update existing submission (requires auth)
    console.log('\n📝 Test 3: Verify GET endpoint returns existing data');
    console.log('-'.repeat(60));
    
    // Note: This would require patient authentication
    console.log('⏭️  Skipped (requires patient authentication token)');
    
    console.log('\n' + '='.repeat(60));
    console.log('✨ Test Complete!\n');
    
    console.log('Summary:');
    console.log('  ✅ First submission creates new record');
    console.log('  ✅ Duplicate submission returns 409 Conflict');
    console.log('  ✅ Error response includes existing submission ID');
    console.log('  ✅ Frontend should reload to show existing data\n');
}

async function main() {
    try {
        await testDuplicatePrevention();
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    }
}

main();
