#!/usr/bin/env node
'use strict';

/**
 * Test patient intake form load and save functionality
 */

const https = require('https');
const http = require('http');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

// Test patient credentials (using one of the migrated records)
const TEST_PHONE = '6281231720445'; // Suryanti's phone from migration

async function request(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const isHttps = url.protocol === 'https:';
        const lib = isHttps ? https : http;
        
        const options = {
            method: method,
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
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
        
        const req = lib.request(options, (res) => {
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

async function loginAsPatient(phone) {
    console.log(`\n🔑 Logging in as patient with phone: ${phone}...`);
    
    // Try to get patient by phone
    const response = await request('POST', '/api/auth/patient-login', {
        phone: phone,
        password: 'Dibya2024' // Default password
    });
    
    if (response.status === 200 && response.data.token) {
        console.log('✅ Login successful');
        return response.data.token;
    } else {
        console.log('❌ Login failed:', response.data);
        return null;
    }
}

async function testLoadIntake(token) {
    console.log('\n📖 Testing GET /api/patient-intake/my-intake...');
    
    const response = await request('GET', '/api/patient-intake/my-intake', null, token);
    
    console.log(`Status: ${response.status}`);
    
    if (response.status === 200 && response.data.success) {
        if (response.data.data) {
            console.log('✅ Intake data loaded successfully');
            console.log(`  Submission ID: ${response.data.data.submissionId}`);
            console.log(`  Patient Name: ${response.data.data.payload.full_name}`);
            console.log(`  Phone: ${response.data.data.payload.phone}`);
            console.log(`  Status: ${response.data.data.status}`);
            return response.data.data;
        } else {
            console.log('ℹ️  No existing intake data found');
            return null;
        }
    } else {
        console.log('❌ Failed to load intake:', response.data);
        return null;
    }
}

async function testUpdateIntake(token, existingData) {
    console.log('\n✏️  Testing PUT /api/patient-intake/my-intake...');
    
    if (!existingData) {
        console.log('⏭️  Skipping update test (no existing data)');
        return;
    }
    
    // Modify the payload slightly
    const updatedPayload = {
        ...existingData.payload,
        metadata: {
            ...existingData.payload.metadata,
            updatedAt: new Date().toISOString(),
            testUpdate: true
        }
    };
    
    const response = await request('PUT', '/api/patient-intake/my-intake', updatedPayload, token);
    
    console.log(`Status: ${response.status}`);
    
    if (response.status === 200 && response.data.success) {
        console.log('✅ Intake data updated successfully');
        console.log(`  Message: ${response.data.message}`);
        return true;
    } else {
        console.log('❌ Failed to update intake:', response.data);
        return false;
    }
}

async function testLoadAfterUpdate(token) {
    console.log('\n🔄 Testing load after update...');
    
    const response = await request('GET', '/api/patient-intake/my-intake', null, token);
    
    if (response.status === 200 && response.data.success && response.data.data) {
        const hasTestUpdate = response.data.data.payload.metadata?.testUpdate === true;
        if (hasTestUpdate) {
            console.log('✅ Update persisted correctly in database');
            return true;
        } else {
            console.log('⚠️  Update may not have persisted');
            return false;
        }
    } else {
        console.log('❌ Failed to reload intake after update');
        return false;
    }
}

async function main() {
    console.log('🧪 Starting Patient Intake Form Tests\n');
    console.log(`Base URL: ${BASE_URL}`);
    
    try {
        // Step 1: Login
        const token = await loginAsPatient(TEST_PHONE);
        if (!token) {
            console.log('\n❌ Cannot proceed without authentication');
            process.exit(1);
        }
        
        // Step 2: Load existing intake
        const existingData = await testLoadIntake(token);
        
        // Step 3: Update intake
        if (existingData) {
            await testUpdateIntake(token, existingData);
            
            // Step 4: Verify update persisted
            await testLoadAfterUpdate(token);
        }
        
        console.log('\n✨ Tests complete!\n');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    }
}

main();
