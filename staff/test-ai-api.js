/**
 * Test AI Interview API
 * Run with: node test-ai-api.js
 */

const http = require('http');

// Test data
const testToken = 'test-token'; // Will test without auth first
const testData = {
    detectCategory: {
        patientId: 'DRD0001',
        complaint: 'Mau USG kehamilan 24 minggu'
    },
    generateQuestions: {
        category: 'obstetri',
        complaint: 'Mau USG kehamilan 24 minggu',
        patientData: {
            name: 'Ibu Siti',
            age: 28
        }
    },
    processAnswers: {
        category: 'obstetri',
        complaint: 'Mau USG kehamilan 24 minggu',
        answers: [
            { question: 'Berapa usia kehamilan Anda saat ini?', answer: '24 minggu' },
            { question: 'Kapan hari pertama haid terakhir (HPHT)?', answer: '1 Mei 2025' },
            { question: 'Apakah ada keluhan selama kehamilan?', answer: 'Tidak ada, kondisi baik' },
            { question: 'Berapa kali hamil, melahirkan, dan keguguran?', answer: 'G2P1A0' },
            { question: 'Apakah ada riwayat penyakit?', answer: 'Tidak ada' }
        ]
    }
};

// Test function
async function testAPI(endpoint, data) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(data);

        const options = {
            hostname: 'localhost',
            port: 3000,
            path: `/api/ai${endpoint}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        statusCode: res.statusCode,
                        data: JSON.parse(body)
                    });
                } catch (e) {
                    resolve({
                        statusCode: res.statusCode,
                        data: body
                    });
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// Run tests
(async () => {
    console.log('🧪 Testing AI Interview API...\n');

    // Test 1: Detect Category
    console.log('1️⃣ Testing /detect-category...');
    try {
        const result1 = await testAPI('/detect-category', testData.detectCategory);
        console.log(`   Status: ${result1.statusCode}`);
        console.log(`   Response:`, JSON.stringify(result1.data, null, 2));
        console.log();
    } catch (e) {
        console.log(`   ❌ Error:`, e.message);
    }

    // Test 2: Generate Questions
    console.log('2️⃣ Testing /interview/questions...');
    try {
        const result2 = await testAPI('/interview/questions', testData.generateQuestions);
        console.log(`   Status: ${result2.statusCode}`);
        console.log(`   Response:`, JSON.stringify(result2.data, null, 2));
        console.log();
    } catch (e) {
        console.log(`   ❌ Error:`, e.message);
    }

    // Test 3: Process Answers
    console.log('3️⃣ Testing /interview/process...');
    try {
        const result3 = await testAPI('/interview/process', testData.processAnswers);
        console.log(`   Status: ${result3.statusCode}`);
        console.log(`   Response:`, JSON.stringify(result3.data, null, 2));
        console.log();
    } catch (e) {
        console.log(`   ❌ Error:`, e.message);
    }

    console.log('✅ Tests completed!');
})();
