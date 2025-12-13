/**
 * Test script to verify email sending functionality
 * Run: node test-email.js <email>
 */

require('dotenv').config();
const notification = require('./utils/notification');

const testEmail = process.argv[2];

if (!testEmail) {
    console.error('Usage: node test-email.js <email>');
    process.exit(1);
}

async function runTest() {
    console.log('Testing email configuration...');
    console.log('Email enabled:', process.env.EMAIL_ENABLED);
    console.log('Email host:', process.env.EMAIL_HOST);
    console.log('Email port:', process.env.EMAIL_PORT);
    console.log('Email user:', process.env.EMAIL_USER);
    console.log('Frontend URL:', process.env.FRONTEND_URL);
    console.log('---');

    // Test 1: Send a simple test email
    console.log('\n1. Testing simple email...');
    const simpleResult = await notification.testEmail(testEmail);
    console.log('Simple email result:', simpleResult);

    // Test 2: Send a password reset email
    console.log('\n2. Testing password reset email...');
    const token = 'TEST123';
    const resetResult = await notification.sendPasswordResetEmail(testEmail, token, {
        patientName: 'Test Patient',
        email: testEmail
    });
    console.log('Password reset email result:', resetResult);

    console.log('\n✅ Test completed. Check your inbox at:', testEmail);
    process.exit(0);
}

runTest().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});
